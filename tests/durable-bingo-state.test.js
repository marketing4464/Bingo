const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const test = require("node:test");
const { prepareRecoverySeed } = require("../scripts/prepare-bingo-recovery-seed.cjs");

const ROOT = path.join(__dirname, "..");
const KEY = "bingo-live-state-v1";
const release = require("../data/spooky-season-release.json");
const words = require("../data/spooky-season-deck.json").map(({ id, word, category }) => ({ id, text: word, category }));
const cardSecret = "isolated-durable-card-secret";
const baseTime = 1791507000000;

function seed() {
  return {
    gameId: "spooky-season-bingo", title: "Spooky Season Bingo", theme: "Halloween, Horror Films, and Fall",
    venue: "On Par Entertainment", deckVersion: release.deckVersion, roundPlanVersion: "spooky-season-three-rounds-v1",
    recoveryId: 1791505200000, status: "paused", roundIndex: 2,
    called: structuredClone(words.slice(0, 30)), deck: structuredClone(words.slice(30)), currentWord: structuredClone(words[0]),
    claims: [{ id: "recovered-1", player: "Recovered Player", points: 500, bingoCount: 5, roundIndex: 0 }],
    updatedAt: baseTime - 1000, autoPullEnabled: true,
    countdownEndsAt: null, breakEndsAt: null, playEndsAt: null, nextPullAt: null,
    pausedAt: baseTime - 1000, playRemainingMs: 300000, nextPullRemainingMs: 20000,
    hypeMessage: "Preserved event message", hypeUpdatedAt: baseTime - 2000,
  };
}

function storageFixture(initialEnvelope) {
  const values = new Map(initialEnvelope ? [[KEY, structuredClone(initialEnvelope)]] : []);
  let alarm = null;
  let failWrite = false;
  let writes = 0;
  const get = async (key) => structuredClone(values.get(key));
  const put = async (key, value) => {
    if (failWrite) { failWrite = false; throw new Error("Fixture durable write failed"); }
    assert(Buffer.byteLength(key + JSON.stringify(value)) < 2 * 1024 * 1024, "SQLite-backed DO value fits its 2 MB limit");
    values.set(key, structuredClone(value));
    writes += 1;
  };
  return {
    get, put,
    async transaction(callback) {
      const staged = new Map([...values].map(([key, value]) => [key, structuredClone(value)]));
      const transaction = {
        get: async (key) => structuredClone(staged.get(key)),
        put: async (key, value) => {
          if (failWrite) { failWrite = false; throw new Error("Fixture durable write failed"); }
          assert(Buffer.byteLength(key + JSON.stringify(value)) < 2 * 1024 * 1024);
          staged.set(key, structuredClone(value));
        },
      };
      const result = await callback(transaction);
      values.clear();
      for (const [key, value] of staged) values.set(key, value);
      writes += 1;
      return result;
    },
    async setAlarm(value) { alarm = Number(value); },
    async deleteAlarm() { alarm = null; },
    async getAlarm() { return alarm; },
    envelope() { return structuredClone(values.get(KEY)); },
    writeCount() { return writes; },
    failNextWrite() { failWrite = true; },
  };
}

async function fixture(options = {}) {
  let now = baseTime;
  const recovery = Object.hasOwn(options, "seed") ? options.seed : seed();
  const esbuild = createRequire(require.resolve("wrangler"))("esbuild");
  const bundled = await esbuild.build({
    entryPoints: [path.join(ROOT, "cloudflare-worker.js")], bundle: true, write: false,
    format: "cjs", platform: "neutral", logLevel: "silent",
    plugins: [{ name: "isolated-recovery-seed", setup(build) {
      build.onResolve({ filter: /recovery-seed\.json$/ }, () => ({ path: "recovery-seed", namespace: "isolated-seed" }));
      build.onLoad({ filter: /.*/, namespace: "isolated-seed" }, () => ({ contents: JSON.stringify(recovery), loader: "json" }));
    } }],
  });
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const externalCalls = [];
  const context = vm.createContext({
    module: { exports: {} }, exports: {}, console, Request, Response, Headers, URL, URLSearchParams,
    TextEncoder, TextDecoder, Uint8Array, Buffer, structuredClone, btoa, atob, AbortController,
    crypto: crypto.webcrypto, Date: FixtureDate, setTimeout, clearTimeout,
    fetch: async (input) => { externalCalls.push(String(input)); throw new Error("External storage is unavailable in the isolated DO test"); },
  });
  vm.runInContext(bundled.outputFiles[0].text, context);
  const storage = options.storage || storageFixture(options.envelope);
  const env = { SUPABASE_URL: "https://unreachable.fixture.invalid", SUPABASE_ANON_KEY: cardSecret,
    BINGO_CARD_SECRET: cardSecret, PUBLIC_JOIN_URL: "https://www.opebingo.com/play" };
  const createObject = () => new context.module.exports.BingoLiveState({ storage, blockConcurrencyWhile: (callback) => callback() }, env);
  let object = createObject();
  env.BINGO_LIVE_STATE = {
    idFromName(name) { assert.equal(name, "spooky-season-bingo"); return name; },
    get(id) { assert.equal(id, "spooky-season-bingo"); return { fetch: (request) => object.fetch(request) }; },
  };
  async function request(route, body, expectedStatus = 200) {
    const response = await context.module.exports.default.fetch(new Request(`https://www.opebingo.com${route}`, {
      method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", "X-Bingo-Role": "player" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    const value = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(value));
    return value;
  }
  return { request, storage, externalCalls, recovery, env, context,
    object: () => object,
    async restart() { object = createObject(); await object.ready; },
    setTime(value) { now = value; },
    getTime() { return now; },
  };
}

test("Durable Object seeds the exact snapshot once, ignores Supabase outages, and persists through restart", async () => {
  const f = await fixture();
  const state = await f.request("/api/state?role=host");
  for (const key of ["claims", "called", "deck", "currentWord", "roundIndex", "recoveryId", "deckVersion", "playRemainingMs"]) assert.deepEqual(state[key], f.recovery[key]);
  assert.equal(state.storage.provider, "cloudflare-durable-object");
  assert.equal(state.storage.available, true);
  assert.equal(f.storage.writeCount(), 1);
  assert.equal(await f.storage.getAlarm(), null, "paused migration does not start the clock");
  await f.request("/api/hype", { message: "Persisted after initialization" });
  const persisted = f.storage.envelope();
  await f.restart();
  assert.deepEqual(f.storage.envelope(), persisted, "constructor never reseeds existing storage");
  assert.equal((await f.request("/api/state?role=player")).hypeMessage, "Persisted after initialization");
  assert.equal(f.externalCalls.length, 0);
});

test("Durable Object client config disables Supabase and routes live state through one named object", async () => {
  const f = await fixture();
  const config = await f.request("/api/client-config");
  assert.equal(config.stateProvider, "cloudflare-durable-object");
  assert.equal(config.supabase.enabled, false);
  const heartbeat = await f.request("/api/heartbeat", { id: "kept-heartbeat", role: "player" });
  assert.equal(heartbeat.id, "kept-heartbeat");
  assert.equal((await f.request("/api/storage-status")).storage.provider, "cloudflare-durable-object");
  assert.equal(f.externalCalls.length, 0);
});

test("Durable Object phone state is compact while retaining card and called-word information", async () => {
  const f = await fixture();
  const phone = await f.request("/api/state?role=player");
  assert.equal(phone.gameId, f.recovery.gameId);
  assert.equal(phone.roundIndex, 2);
  assert.equal(phone.recoveryId, f.recovery.recoveryId);
  assert.equal(phone.deckVersion, f.recovery.deckVersion);
  assert.deepEqual(phone.called, f.recovery.called);
  assert.equal(phone.moments.length, 80);
  assert.equal(phone.rounds.length, 3);
  assert.equal(phone.storage.provider, "cloudflare-durable-object");
  for (const key of ["claims", "deck", "leaderboard"]) assert(!Object.hasOwn(phone, key), `phone response omits ${key}`);
  assert.equal(f.externalCalls.length, 0);
});

test("Durable Object live reads are not blocked by an incoming POST body that has not arrived", async () => {
  const f = await fixture(); await f.object().ready;
  let bodyController;
  const body = new ReadableStream({ start(controller) { bodyController = controller; } });
  const slowPost = f.context.module.exports.default.fetch(new Request("https://www.opebingo.com/api/hype", {
    method: "POST", headers: { "Content-Type": "application/json" }, body, duplex: "half",
  }), f.env);
  let readCompleted = false;
  const fastRead = f.request("/api/state?role=player").then((state) => { readCompleted = true; return state; });
  await new Promise((resolve) => setImmediate(resolve));
  try { assert.equal(readCompleted, true, "the live GET completes while the POST body is still pending"); }
  finally {
    bodyController.enqueue(new TextEncoder().encode(JSON.stringify({ message: "Body finally arrived" })));
    bodyController.close();
  }
  await fastRead;
  const response = await slowPost;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).hypeMessage, "Body finally arrived");
  assert.equal(f.externalCalls.length, 0);
});

test("Durable Object binding failures fail closed without retrying Supabase or creating a game", async () => {
  const f = await fixture();
  await f.object().ready;
  const committed = f.storage.envelope();
  f.env.BINGO_LIVE_STATE.get = () => ({ fetch: async () => { throw new Error("Fixture namespace unavailable"); } });
  const failed = await f.request("/api/state?role=player", undefined, 503);
  assert.equal(failed.code, "BINGO_STORAGE_UNAVAILABLE");
  assert.deepEqual(f.storage.envelope(), committed);
  assert.equal(f.externalCalls.length, 0);
});

test("Durable Object resumes exactly five minutes and alarms pull without a host browser", async () => {
  const f = await fixture();
  const before = await f.request("/api/state?role=host");
  const cards = await f.request("/api/deal-cards", { player: "Continuing Player", count: 1 });
  const token = cards.cards[0].token;
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url"));
  assert.equal(payload.recoveryId, before.recoveryId);
  const resumed = await f.request("/api/resume-round", {});
  assert.equal(resumed.status, "playing");
  assert.equal(resumed.roundIndex, 2);
  assert.equal(resumed.playEndsAt - f.getTime(), 300000);
  assert.deepEqual(resumed.called, before.called);
  assert.deepEqual(resumed.claims, before.claims);
  f.setTime(await f.storage.getAlarm());
  await f.object().alarm();
  const first = f.storage.envelope();
  assert.equal(first.state.called.length, before.called.length + 1);
  assert.equal(first.publicState.called.length, first.state.called.length);
  assert.deepEqual(first.state.claims, before.claims);
  assert.equal(first.state.recoveryId, before.recoveryId, "alarm does not invalidate existing cards");
  await f.restart();
  f.setTime(await f.storage.getAlarm());
  await f.object().alarm();
  assert.equal(f.storage.envelope().state.called.length, before.called.length + 2);
  f.setTime(resumed.playEndsAt);
  await f.object().alarm();
  const ended = f.storage.envelope();
  assert.equal(ended.state.status, "ended");
  assert.deepEqual(ended.state.claims, before.claims);
  assert.equal(await f.storage.getAlarm(), null);
  assert.equal(f.externalCalls.length, 0);
});

function claimBody(player, card) {
  return { player, card: card.number, cardToken: card.token, cells: card.cells,
    selected: [0, 1, 2, 3, 4, 12], bingos: [{ id: "row-1" }] };
}

test("Durable Object accepts an existing Round 3 card without changing its signing key or recovery generation", async () => {
  const initial = seed(); initial.called = structuredClone(words);
  const cells = words.slice(0, 24).map((word) => word.text); cells.splice(12, 0, "FREE");
  const player = "Existing Round 3 Player";
  const payload = { v: 1, gameId: initial.gameId, deckVersion: initial.deckVersion, recoveryId: initial.recoveryId,
    player, roundIndex: 2, number: 1, cells };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${crypto.createHmac("sha256", cardSecret).update(encoded).digest("base64url")}`;
  const f = await fixture({ seed: initial });
  await f.request("/api/resume-round", {});
  const result = await f.request("/api/claim", claimBody(player, { number: 1, token, cells }));
  assert.equal(result.claim.points, 100);
  assert.equal(f.storage.envelope().state.recoveryId, initial.recoveryId);
  assert(f.storage.envelope().state.claims.some((claim) => claim.id === initial.claims[0].id));
  assert.equal(f.externalCalls.length, 0);
});

test("Durable Object serializes concurrent claims and a draw without losing scores", async () => {
  const initial = seed(); initial.called = structuredClone(words); initial.deck = structuredClone(words);
  const f = await fixture({ seed: initial });
  await f.request("/api/resume-round", {});
  const alice = (await f.request("/api/deal-cards", { player: "DO Alice", count: 1 })).cards[0];
  const bob = (await f.request("/api/deal-cards", { player: "DO Bob", count: 1 })).cards[0];
  await Promise.all([f.request("/api/claim", claimBody("DO Alice", alice)), f.request("/api/claim", claimBody("DO Bob", bob)), f.request("/api/pull", {})]);
  const envelope = f.storage.envelope();
  assert.equal(envelope.state.claims.length, initial.claims.length + 2);
  assert.equal(envelope.state.claims.reduce((sum, claim) => sum + claim.points, 0), 700);
  assert.equal(envelope.state.called.length, words.length + 1);
  assert.equal(envelope.publicState.updatedAt, envelope.state.updatedAt);
  assert.deepEqual(envelope.publicState.called, envelope.state.called);
  assert.equal(envelope.publicState.latestClaim.id, envelope.state.claims[0].id);
  assert.equal(f.externalCalls.length, 0);
});

test("Durable Object CAS rejects a stale internal save and keeps its atomic public projection", async () => {
  const f = await fixture(); await f.object().ready;
  const first = await f.object().loadState();
  const stale = await f.object().loadState();
  first.claims.unshift({ id: "retained-new-score", player: "New Score", points: 100 });
  await f.object().saveState(first);
  const committed = f.storage.envelope();
  stale.claims.unshift({ id: "stale-score", player: "Stale Score", points: 100 });
  await assert.rejects(f.object().saveState(stale), (error) => error.code === "BINGO_STATE_CONFLICT" && error.status === 409);
  assert.deepEqual(f.storage.envelope(), committed);
});

test("Durable Object primary storage failure does not publish an uncommitted draw", async () => {
  const f = await fixture(); await f.request("/api/resume-round", {});
  const committed = f.storage.envelope();
  f.storage.failNextWrite();
  const failed = await f.request("/api/pull", {}, 503);
  assert.equal(failed.code, "BINGO_STORAGE_UNAVAILABLE");
  assert.deepEqual(f.storage.envelope(), committed);
  await f.request("/api/pull", {});
  assert.equal(f.storage.envelope().state.called.length, committed.state.called.length + 1);
  assert.deepEqual(f.storage.envelope().state.claims, committed.state.claims);
});

test("Durable Object refuses an invalid seed without making a fresh empty game", async () => {
  const invalid = seed(); invalid.gameId = "invalid-game";
  const f = await fixture({ seed: invalid });
  const rejected = await f.request("/api/state?role=player", undefined, 503);
  assert.equal(rejected.code, "BINGO_STORAGE_UNAVAILABLE");
  assert.match(rejected.error, /verified live bingo snapshot/);
  assert.equal(f.storage.envelope(), undefined);
  assert.equal(f.externalCalls.length, 0);
});

test("Durable Object refuses a null seed when empty but retains its stored game on later null-seed deployments", async () => {
  const empty = await fixture({ seed: null });
  const rejected = await empty.request("/api/state?role=player", undefined, 503);
  assert.equal(rejected.code, "BINGO_STORAGE_UNAVAILABLE");
  assert.equal(empty.storage.envelope(), undefined);
  const existing = seed();
  const envelope = { state: existing, publicState: {}, seededAt: baseTime - 1000 };
  const populated = await fixture({ seed: null, envelope });
  const state = await populated.request("/api/state?role=host");
  assert.deepEqual(state.claims, existing.claims);
  assert.deepEqual(state.called, existing.called);
  assert.deepEqual(populated.storage.envelope(), envelope);
  assert.equal(populated.storage.writeCount(), 0);
  assert.equal(empty.externalCalls.length + populated.externalCalls.length, 0);
});

test("recovery seed preparation creates only a null placeholder and never overwrites an existing snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bingo-seed-test-"));
  const seedPath = path.join(directory, "data/recovery-seed.json");
  try {
    assert.equal(prepareRecoverySeed(seedPath), true);
    assert.equal(JSON.parse(fs.readFileSync(seedPath, "utf8")), null);
    const realSnapshot = JSON.stringify(seed());
    fs.writeFileSync(seedPath, realSnapshot);
    assert.equal(prepareRecoverySeed(seedPath), false);
    assert.equal(fs.readFileSync(seedPath, "utf8"), realSnapshot);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

const productionSeedPath = path.join(ROOT, "data/recovery-seed.json");
const productionSeed = fs.existsSync(productionSeedPath) ? JSON.parse(fs.readFileSync(productionSeedPath, "utf8")) : null;
test("production recovery seed validates the paused five-minute Round 3 snapshot and SQLite envelope", { skip: productionSeed === null }, () => {
  const actual = productionSeed;
  const ids = new Set(actual.claims.map((claim) => claim.id));
  assert.equal(ids.size, actual.claims.length, "claim ids are distinct");
  assert.equal(actual.gameId, "spooky-season-bingo");
  assert.equal(actual.title, "Spooky Season Bingo");
  assert.equal(actual.deckVersion, release.deckVersion);
  assert.equal(actual.roundPlanVersion, "spooky-season-three-rounds-v1");
  assert.equal(actual.roundIndex, 2);
  assert.equal(actual.status, "paused");
  assert.equal(actual.playRemainingMs, 300000);
  assert(Number.isFinite(Number(actual.updatedAt)) && Number(actual.updatedAt) > 0);
  assert(Array.isArray(actual.called) && Array.isArray(actual.deck));
  assert.equal(actual.called.length + actual.deck.length, 80);
  const publicState = { ...actual, claims: undefined, deck: undefined, latestClaim: actual.claims[0] || null };
  assert(Buffer.byteLength(KEY + JSON.stringify({ state: actual, publicState, seededAt: actual.updatedAt })) < 2 * 1024 * 1024);
});

const localClaimBackup = path.join(ROOT, "outputs/freeze-recovery-2026-10-08/merged-known-claims-after-extension.json");
test("local recovery backup audit retains every previously recovered claim", { skip: productionSeed === null || !fs.existsSync(localClaimBackup) }, () => {
  const actual = productionSeed;
  const known = JSON.parse(fs.readFileSync(localClaimBackup, "utf8")).claims;
  const ids = new Set(actual.claims.map((claim) => claim.id));
  for (const claim of known) assert(ids.has(claim.id), `retained accepted claim ${claim.id}`);
});
