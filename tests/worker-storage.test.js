const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");
const vm = require("node:vm");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const release = require("../data/spooky-season-release.json");
const words = require("../data/spooky-season-deck.json").map(({ id, word, category }) => ({ id, text: word, category }));
let bundlePromise;
function bundle() {
  if (!bundlePromise) {
    const esbuild = createRequire(require.resolve("wrangler"))("esbuild");
    bundlePromise = esbuild.build({ entryPoints: [path.join(ROOT, "cloudflare-worker.js")], bundle: true, write: false, format: "cjs", platform: "neutral", logLevel: "silent" })
      .then((result) => result.outputFiles[0].text);
  }
  return bundlePromise;
}

const flush = async () => { for (let count = 0; count < 15; count += 1) await Promise.resolve(); await new Promise((resolve) => setImmediate(resolve)); };

async function fixture() {
  let now = Date.now();
  let mode = "healthy";
  let timerId = 0;
  const timers = new Map();
  const calls = [];
  const initial = {
    gameId: "spooky-season-bingo", title: "Spooky Season Bingo", theme: "Halloween, Horror Films, and Fall",
    deckVersion: release.deckVersion, roundPlanVersion: "spooky-season-three-rounds-v1",
    status: "playing", roundIndex: 0, currentWord: words[0], called: [words[0]], deck: words.slice(1),
    claims: [{ id: "existing-claim", player: "Existing Player", points: 100 }], autoPullEnabled: false,
    hypeMessage: "Existing event message", hypeUpdatedAt: now - 1000,
    countdownEndsAt: null, breakEndsAt: null, playEndsAt: now + 600000, pausedAt: null,
    playRemainingMs: null, nextPullAt: now + 20000, updatedAt: now - 1000,
  };
  const records = { on_par_bingo_state: structuredClone(initial), on_par_bingo_public_state: structuredClone(initial) };
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    module: { exports: {} }, exports: {}, console, Request, Response, Headers, URL, URLSearchParams,
    TextEncoder, TextDecoder, Uint8Array, Buffer, structuredClone, btoa, atob, AbortController,
    crypto: crypto.webcrypto, Date: FixtureDate,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (input, options = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      assert.equal(url.origin, "https://storage.fixture.invalid", "failure tests never contact live storage");
      const table = url.pathname.split("/").pop();
      assert(Object.hasOwn(records, table));
      const method = options.method || "GET";
      calls.push({ table, method, signal: options.signal });
      if (mode === "headers-stalled" || (mode === "writes-stalled" && method === "POST")) return new Promise(() => {});
      if (mode === "body-stalled") return { ok: true, status: 200, text: () => new Promise(() => {}) };
      if (mode === "network-failed") throw new Error("Connection refused");
      if (mode === "http-failed" || (mode === "public-write-failed" && method === "POST" && table === "on_par_bingo_public_state")) return new Response("Unavailable", { status: 503 });
      if (method === "POST") {
        records[table] = JSON.parse(options.body).state;
        return new Response(null, { status: 204 });
      }
      return Response.json([{ state: records[table] }]);
    },
  });
  vm.runInContext(await bundle(), context);
  const env = { SUPABASE_URL: "https://storage.fixture.invalid", SUPABASE_ANON_KEY: "isolated-storage-test", PUBLIC_JOIN_URL: "https://www.opebingo.com/play" };
  async function request(route, body) {
    now += 1;
    const result = await context.module.exports.default.fetch(new Request(`https://www.opebingo.com${route}`, {
      method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    return { status: result.status, data: await result.json() };
  }
  return {
    request, initial, records, calls, timers,
    setMode(value) { mode = value; },
    getTime() { return now; },
    cache() { return vm.runInContext("cachedState && structuredClone(cachedState)", context); },
    expireDeadlines() {
      assert(timers.size > 0, "a pending storage request must have a deadline");
      for (const timer of [...timers.values()]) { assert.equal(timer.delay, 8000); timer.callback(); }
    },
  };
}

test("storage health reports observed load/save times, rather than claiming unchecked storage is healthy", async () => {
  const f = await fixture();
  const unchecked = (await f.request("/api/storage-status")).data.storage;
  assert.equal(unchecked.available, false);
  assert.equal(unchecked.lastLoadedAt, null);
  assert.equal(unchecked.lastSavedAt, null);
  assert.equal(f.calls.length, 0);
  const read = await f.request("/api/state?role=player");
  assert.equal(read.status, 200);
  assert.equal(read.data.storage.available, true);
  assert.equal(read.data.storage.lastLoadedAt, f.getTime());
  assert.equal(read.data.storage.lastSavedAt, null);
  const saved = await f.request("/api/hype", { message: "Existing event is still running" });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.storage.lastLoadedAt, f.getTime());
  assert.equal(saved.data.storage.lastSavedAt, f.getTime());
  assert.equal(saved.data.storage.error, null);
  assert.equal(f.timers.size, 0);
});

for (const mode of ["headers-stalled", "body-stalled"]) {
  test(`an eight-second deadline bounds ${mode} and does not reset or write game state`, async () => {
    const f = await fixture();
    f.setMode(mode);
    const pending = f.request("/api/state?role=host");
    await flush();
    f.expireDeadlines();
    const result = await pending;
    assert.equal(result.status, 503);
    assert.equal(result.data.code, "BINGO_STORAGE_UNAVAILABLE");
    assert.match(result.data.error, /retry shortly/i);
    assert.match(result.data.error, /8 seconds/);
    assert.equal(result.data.storage.available, false);
    assert.equal(result.data.storage.lastLoadedAt, null);
    assert.equal(result.data.storage.lastSavedAt, null);
    assert.equal(f.calls[0].signal.aborted, true);
    assert(!f.calls.some((call) => call.method === "POST"));
    assert.deepEqual(f.records.on_par_bingo_state, f.initial);
    assert.equal(f.cache(), null);
    assert.equal(f.timers.size, 0);
  });
}

test("network and upstream HTTP failures return actionable 503s without generating replacement state", async () => {
  for (const mode of ["network-failed", "http-failed"]) {
    const f = await fixture();
    f.setMode(mode);
    const result = await f.request("/api/state?role=player");
    assert.equal(result.status, 503);
    assert.equal(result.data.code, "BINGO_STORAGE_UNAVAILABLE");
    assert.equal(result.data.storage.available, false);
    assert.equal(result.data.storage.lastLoadedAt, null);
    assert(!f.calls.some((call) => call.method === "POST"));
    assert.equal(f.cache(), null);
    assert.equal(f.timers.size, 0);
  }
});

test("stalled writes fail at eight seconds and do not publish an uncommitted cached draw", async () => {
  const f = await fixture();
  await f.request("/api/state?role=player");
  const committed = f.cache();
  f.setMode("writes-stalled");
  const pending = f.request("/api/pull", {});
  await flush();
  assert.equal(f.timers.size, 2, "both private and public writes are bounded");
  f.expireDeadlines();
  const result = await pending;
  assert.equal(result.status, 503);
  assert.equal(result.data.storage.lastSavedAt, null);
  assert.equal(result.data.storage.available, false);
  assert.deepEqual(f.cache(), committed, "failed persistence cannot publish the new draw in cache");
  assert.deepEqual(f.records.on_par_bingo_state, f.initial);
  assert.deepEqual(f.records.on_par_bingo_public_state, f.initial);
  assert.equal(f.timers.size, 0);
});

test("a failed public write keeps the previous committed cache; a later successful save restores health", async () => {
  const f = await fixture();
  await f.request("/api/state?role=player");
  const committed = f.cache();
  f.setMode("public-write-failed");
  const failed = await f.request("/api/pull", {});
  assert.equal(failed.status, 503);
  assert.equal(failed.data.storage.available, false);
  assert.equal(failed.data.storage.lastSavedAt, null);
  assert.deepEqual(f.cache(), committed, "cache publication requires both writes to succeed");
  f.setMode("healthy");
  const recovered = await f.request("/api/hype", { message: "Recovered" });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.storage.available, true);
  assert.equal(recovered.data.storage.lastSavedAt, f.getTime());
  assert.equal(recovered.data.storage.error, null);
  assert.equal(f.cache().hypeMessage, "Recovered");
  assert.equal(f.records.on_par_bingo_public_state.hypeMessage, "Recovered");
  assert.equal(f.timers.size, 0);
});
