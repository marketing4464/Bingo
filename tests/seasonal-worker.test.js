const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const vm = require("node:vm");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const deck = readJson("data/spooky-season-deck.json");
const decisions = readJson("data/image-review-decisions.json").decisions;
const manifest = readJson("public/assets/spooky-season/image-candidates.json").items;
const version = crypto.createHash("sha256").update(JSON.stringify(deck.map(({ id, word }) => ({ id, word })))).digest("hex");
const gameId = "spooky-season-bingo";
const roundPlanVersion = "spooky-season-three-rounds-v1";
const cardSecret = "isolated-worker-card-secret";

let bundlePromise;
async function workerBundle() {
  if (!bundlePromise) {
    const esbuild = createRequire(require.resolve("wrangler"))("esbuild");
    bundlePromise = esbuild.build({
      entryPoints: [path.join(ROOT, "cloudflare-worker.js")],
      bundle: true, write: false, format: "cjs", platform: "neutral", logLevel: "silent",
    }).then((result) => result.outputFiles[0].text);
  }
  return bundlePromise;
}

async function fixture(initialState = null) {
  let now = Date.now();
  const records = {
    on_par_bingo_state: initialState && structuredClone(initialState),
    on_par_bingo_public_state: initialState && structuredClone(initialState),
  };
  const posts = [];
  const assetRequests = [];
  const proxyRequests = [];
  const env = {
    SUPABASE_URL: "https://supabase.fixture.invalid",
    SUPABASE_ANON_KEY: cardSecret,
    BINGO_CARD_SECRET: cardSecret,
    PUBLIC_JOIN_URL: "https://www.opebingo.com/play",
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        assetRequests.push(url.pathname);
        const filename = path.resolve(PUBLIC, `.${url.pathname}`);
        assert(filename.startsWith(`${PUBLIC}${path.sep}`), "asset requests remain within public/");
        if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) return new Response("Missing fixture asset", { status: 404 });
        return new Response(fs.readFileSync(filename));
      },
    },
  };
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    module: { exports: {} }, exports: {}, console, Request, Response, Headers, URL, URLSearchParams,
    TextEncoder, TextDecoder, Uint8Array, Buffer, structuredClone, btoa, atob,
    crypto: crypto.webcrypto, Date: FixtureDate, AbortController, setTimeout, clearTimeout,
    fetch: async (input, options = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.origin === "https://investigation.fixture.invalid") {
        proxyRequests.push(input);
        return new Response(null, { status: 302, headers: { Location: "/murder-mystery/play?station=1" } });
      }
      assert.equal(url.origin, "https://supabase.fixture.invalid", "worker tests cannot contact live Supabase, Cloudflare, or image services");
      const table = url.pathname.split("/").pop();
      assert(Object.hasOwn(records, table), `unexpected Supabase table ${table}`);
      if (options.method === "POST") {
        const payload = JSON.parse(options.body);
        assert.equal(payload.id, "current");
        records[table] = structuredClone(payload.state);
        posts.push({ table, ...payload });
        return new Response(null, { status: 204 });
      }
      assert.equal(url.searchParams.get("id"), "eq.current");
      return Response.json(records[table] ? [{ state: records[table] }] : []);
    },
  });
  vm.runInContext(await workerBundle(), context, { filename: "isolated-seasonal-worker.cjs" });
  const worker = context.module.exports.default;
  const request = async (pathname, body, expectedStatus = 200) => {
    now += 1;
    const response = await worker.fetch(new Request(`https://www.opebingo.com${pathname}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Bingo-Role": "host" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    const value = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(value));
    return value;
  };
  return { request, worker, env, records, posts, assetRequests, proxyRequests, setTime(value) { now = value; } };
}

function legacyState() {
  return {
    gameId: "disney-pixar-bingo", title: "Disney & Pixar Bingo", theme: "Disney and Pixar",
    status: "ended", roundIndex: 3, currentWord: null,
    called: [{ id: "mickey-mouse", text: "Mickey Mouse", category: "Classic Disney" }],
    deck: [{ id: "woody", text: "Woody", category: "Pixar" }],
    claims: [{ id: "disney-winner", player: "Previous Event", points: 500 }], updatedAt: 1788483656044,
  };
}

test("worker migrates a persisted Disney event once and exposes the exact approved seasonal deck", async () => {
  const f = await fixture(legacyState());
  const state = await f.request("/api/state?role=host");
  assert.equal(state.gameId, gameId);
  assert.equal(state.title, "Spooky Season Bingo");
  assert.equal(state.deckVersion, version);
  assert.equal(state.roundPlanVersion, roundPlanVersion);
  assert.equal(state.status, "setup");
  assert.equal(state.roundIndex, 0);
  assert.equal(state.currentWord, null);
  assert.deepEqual(state.called, []);
  assert.deepEqual(state.claims, []);
  assert.equal(state.deck.length, 80);
  assert.equal(state.moments.length, 80);
  assert.deepEqual(state.moments.map(({ id, text, category }) => ({ id, word: text, category })), deck.map(({ id, word, category }) => ({ id, word, category })));
  assert.deepEqual(new Set(state.deck.map((item) => item.id)), new Set(deck.map((item) => item.id)));
  assert.equal(state.activeGame.wordCount, 80);
  assert.equal(state.activeGame.status, "approved");
  assert.equal(state.storage.provider, "supabase");
  assert.equal(state.rounds.length, 3);
  assert.deepEqual(state.rounds.map(({ pattern, playMinutes, points, bonusPoints }) => ({ pattern, playMinutes, points, ...(bonusPoints === undefined ? {} : { bonusPoints }) })), [
    { pattern: "Any Line", playMinutes: 20, points: 100 },
    { pattern: "Four Corners", playMinutes: 20, points: 100, bonusPoints: 50 },
    { pattern: "X Pattern", playMinutes: 20, points: 100, bonusPoints: 200 },
  ]);
  assert.deepEqual(f.posts.map((post) => post.table).sort(), ["on_par_bingo_public_state", "on_par_bingo_state"]);
  for (const table of Object.keys(f.records)) {
    assert.equal(f.records[table].gameId, gameId);
    assert.equal(f.records[table].deckVersion, version);
    assert.equal(f.records[table].status, "setup");
    assert.deepEqual(f.records[table].called, []);
  }
  const postCount = f.posts.length;
  const second = await f.request("/api/state?role=player");
  assert.equal(f.posts.length, postCount, "already migrated state is not rewritten on every poll");
  assert.equal(second.updatedAt, state.updatedAt);
  const config = await f.request("/api/client-config");
  assert.equal(config.supabase.publicStateTable, "on_par_bingo_public_state");
  assert.equal(config.supabase.deckVersion, version);
  assert.equal(state.joinUrl, "https://www.opebingo.com/play");
});

function previousSeasonalState(roundIndex = 1, status = "playing") {
  const moments = deck.map(({ id, word, category }) => ({ id, text: word, category }));
  return {
    gameId, title: "Spooky Season Bingo", theme: "Halloween, Horror Films, and Fall", deckVersion: version,
    roundIndex, status, currentWord: status === "playing" ? moments[0] : null,
    called: moments.slice(0, 2), deck: moments.slice(2),
    claims: [{ id: "previous-seasonal-claim", player: "Existing Player", points: 100, roundIndex: 0, bingos: [{ id: "row-1", points: 100 }] }],
    autoPullEnabled: false, hypeMessage: "Existing event message", hypeUpdatedAt: Date.now() - 1500,
    countdownEndsAt: null, breakEndsAt: status === "break" ? Date.now() + 300000 : null,
    playEndsAt: status === "playing" ? Date.now() + 600000 : null,
    pausedAt: null, playRemainingMs: null, nextPullAt: status === "playing" ? Date.now() + 20000 : null,
    updatedAt: Date.now() - 1000,
  };
}

test("three-round plan migration writes both snapshots once while preserving valid seasonal progress", async () => {
  for (const oldPlan of [undefined, "spooky-season-four-rounds-v1"]) {
    const snapshot = previousSeasonalState();
    if (oldPlan) snapshot.roundPlanVersion = oldPlan;
    const f = await fixture(snapshot);
    const migrated = await f.request("/api/state?role=player");
    assert.equal(migrated.gameId, gameId);
    assert.equal(migrated.deckVersion, version, "changing only rounds must not invalidate the word deck");
    assert.equal(migrated.roundPlanVersion, roundPlanVersion);
    assert.equal(migrated.rounds.length, 3);
    assert.equal(migrated.status, snapshot.status);
    assert.equal(migrated.roundIndex, snapshot.roundIndex);
    assert.deepEqual(migrated.currentWord, snapshot.currentWord);
    assert.deepEqual(migrated.called, snapshot.called);
    assert.deepEqual(migrated.deck, snapshot.deck);
    assert.deepEqual(migrated.claims, snapshot.claims);
    assert.equal(migrated.hypeMessage, snapshot.hypeMessage);
    for (const field of ["countdownEndsAt", "breakEndsAt", "playEndsAt", "nextPullAt", "autoPullEnabled"]) assert.equal(migrated[field], snapshot[field], field);
    assert(migrated.updatedAt > snapshot.updatedAt);
    assert.deepEqual(f.posts.map((post) => post.table).sort(), ["on_par_bingo_public_state", "on_par_bingo_state"]);
    for (const stored of Object.values(f.records)) {
      assert.equal(stored.roundPlanVersion, roundPlanVersion);
      assert.equal(stored.deckVersion, version);
      assert.equal(stored.roundIndex, 1);
      assert.equal(stored.status, "playing");
      assert.deepEqual(stored.called, snapshot.called);
    }
    assert.deepEqual(f.records.on_par_bingo_state.claims, snapshot.claims);
    assert.deepEqual(f.records.on_par_bingo_state.deck, snapshot.deck);
    assert.equal(f.records.on_par_bingo_public_state.rounds.length, 3);
    const postCount = f.posts.length;
    const polled = await f.request("/api/state?role=player");
    assert.equal(f.posts.length, postCount, "round-plan migration must not repeat on every poll");
    assert.equal(polled.updatedAt, migrated.updatedAt);
  }
});

test("obsolete fourth-round progress and the old break after Round 3 end without erasing results", async () => {
  for (const [oldRound, oldStatus] of [[3, "playing"], [2, "break"]]) {
    const snapshot = previousSeasonalState(oldRound, oldStatus);
    const f = await fixture(snapshot);
    const migrated = await f.request("/api/state?role=player");
    assert.equal(migrated.status, "ended");
    assert.equal(migrated.roundIndex, 2);
    assert.equal(migrated.roundPlanVersion, roundPlanVersion);
    assert.equal(migrated.round.pattern, "X Pattern");
    assert.deepEqual(migrated.called, snapshot.called);
    assert.deepEqual(migrated.deck, snapshot.deck);
    assert.deepEqual(migrated.claims, snapshot.claims);
    assert.equal(migrated.leaderboard[0].points, 100);
    assert.equal(migrated.breakEndsAt, null);
    assert.equal(migrated.playEndsAt, null);
    assert.equal(migrated.nextPullAt, null);
    assert.equal(f.posts.length, 2);
  }
});

test("all eighty worker images are the user's approved files and match their recorded hashes", async () => {
  const f = await fixture();
  assert.equal(deck.length, 80);
  assert.equal(new Set(deck.map((item) => item.word)).size, 80);
  for (const item of deck) {
    const decision = decisions[item.id];
    assert.equal(decision.word, item.word);
    assert.equal(decision.decision, "approved");
    const entry = manifest.find((candidate) => candidate.id === item.id && candidate.word === item.word);
    const selected = entry?.candidates.find((candidate) => candidate.id === decision.candidateId);
    assert(selected, `missing approved candidate for ${item.word}`);
    assert.equal(selected.imageUrl, decision.approvedImageUrl);
    const result = await f.request(`/api/moment-image?${new URLSearchParams({ text: item.word, category: item.category })}`);
    assert.equal(result.approved, true, item.word);
    assert.equal(result.url, decision.approvedImageUrl, item.word);
    const image = await f.worker.fetch(new Request(`https://www.opebingo.com${result.url}`), f.env);
    assert.equal(image.status, 200, item.word);
    const hash = crypto.createHash("sha256").update(Buffer.from(await image.arrayBuffer())).digest("hex");
    assert.equal(hash, decision.sha256, `approved bytes differ for ${item.word}`);
    assert.equal(hash, selected.sha256, `candidate bytes differ for ${item.word}`);
  }
  for (const oldWord of ["Mickey Mouse", "Woody", "Unknown Word"]) {
    const result = await f.request(`/api/moment-image?${new URLSearchParams({ text: oldWord })}`);
    assert.equal(result.approved, false);
    assert.equal(result.url, null, "unknown and Disney words cannot fall back to legacy images");
  }
});

test("worker cards bind the new game and deck; stale signatures fail and round scoring stays intact", async () => {
  const f = await fixture();
  const rules = [["Any Line", 20, 100], ["Four Corners", 20, 50], ["X Pattern", 20, 200]];
  let state = await f.request("/api/start-round", {});
  const selectedByRound = [[0, 1, 2, 3, 4, 12], [0, 1, 2, 3, 4, 12, 20, 24], [0, 1, 2, 3, 4, 6, 8, 12, 16, 18, 20, 24]];
  const idByRound = ["row-1", "four-corners", "x-pattern"];
  let priorRoundCard;
  for (let index = 0; index < 3; index += 1) {
    if (index > 0) state = await f.request("/api/next-round", {});
    state = await f.request("/api/toggle-auto-call", { enabled: false });
    assert.equal(state.roundIndex, index);
    assert.equal(state.round.pattern, rules[index][0]);
    assert.equal(state.round.playMinutes, rules[index][1]);
    const dealt = await f.request("/api/deal-cards", { player: "Seasonal Tester", count: 3 });
    assert.equal(dealt.cards.length, 3);
    assert.equal(dealt.deckVersion, version);
    for (const card of dealt.cards) {
      assert.equal(card.cells.length, 25);
      assert.equal(card.cells[12], "FREE");
      assert.equal(new Set(card.cells).size, 25);
      assert(card.cells.every((word) => word === "FREE" || deck.some((item) => item.word === word)));
    }
    const card = dealt.cards[0];
    const payload = JSON.parse(Buffer.from(card.token.split(".")[0], "base64url"));
    assert.equal(payload.gameId, gameId);
    assert.equal(payload.deckVersion, version);
    assert.equal(payload.roundIndex, index);
    if (index === 0) {
      for (const stalePayload of [{ ...payload, gameId: "disney-pixar-bingo" }, { ...payload, deckVersion: "old-deck-version" }]) {
        const encoded = Buffer.from(JSON.stringify(stalePayload)).toString("base64url");
        const signature = crypto.createHmac("sha256", cardSecret).update(encoded).digest("base64url");
        const result = await f.request("/api/claim", { player: payload.player, card: card.number, cells: card.cells, cardToken: `${encoded}.${signature}`, selected: [12] }, 409);
        assert.match(result.error, /does not match/);
      }
    }
    if (index === 2) {
      const stale = await f.request("/api/claim", { player: payload.player, card: priorRoundCard.number, cells: priorRoundCard.cells, cardToken: priorRoundCard.token, selected: [12] }, 409);
      assert.match(stale.error, /does not match/, "final X Pattern must reject a card signed for Round 2");
    }
    const selected = selectedByRound[index];
    const requiredWords = selected.filter((cell) => cell !== 12).map((cell) => card.cells[cell]);
    let calls = state;
    for (let count = 0; count < 80 && !requiredWords.every((word) => calls.called.some((item) => item.text === word)); count += 1) calls = await f.request("/api/pull", {});
    assert(requiredWords.every((word) => calls.called.some((item) => item.text === word)), "each selected cell was called from the active eighty-word deck");
    const claimBody = { player: payload.player, card: card.number, cells: card.cells, cardToken: card.token, selected, bingos: [{ id: idByRound[index] }] };
    const claimed = await f.request("/api/claim", claimBody);
    assert.equal(claimed.claim.points, rules[index][2]);
    assert.equal(claimed.claim.bingoCount, 1);
    assert.equal(claimed.claim.roundIndex, index);
    assert.equal(claimed.claim.bingos[0].id, idByRound[index]);
    await f.request("/api/claim", claimBody, 409);
    if (index > 0) {
      const line = await f.request("/api/claim", { ...claimBody, bingos: [{ id: "row-1" }] });
      assert.equal(line.claim.points, 100, "regular lines still score 100 in each bonus round");
    }
    priorRoundCard = card;
  }
  const ended = await f.request("/api/end-round", {});
  assert.equal(ended.status, "ended");
  assert.equal(ended.roundIndex, 2);
  assert.equal(ended.rounds.length, 3);
  assert.equal(ended.breakEndsAt, null, "ending Round 3 must not create another break");
  assert.equal(ended.leaderboard[0].points, 550);
  const noFourth = await f.request("/api/next-round", {});
  assert.equal(noFourth.status, "ended");
  assert.equal(noFourth.roundIndex, 2, "the host cannot advance into a fourth round");
  assert.equal(noFourth.round.pattern, "X Pattern");
});

test("countdown, twenty-second auto calls, pause/resume, and ten-minute breaks preserve live timing", async () => {
  const f = await fixture();
  const countdown = await f.request("/api/start-countdown", {});
  assert.equal(countdown.status, "countdown");
  assert.equal(countdown.pregameCountdownSeconds, 900);
  assert.equal(countdown.autoPullEverySeconds, 20);
  assert.equal(countdown.countdownEndsAt - countdown.serverTime, 15 * 60 * 1000);
  assert.equal(countdown.deck.length, 80);
  assert(countdown.deck.every((item) => deck.some((entry) => entry.id === item.id && entry.word === item.text)));
  f.setTime(countdown.countdownEndsAt);
  const playing = await f.request("/api/state?role=host");
  assert.equal(playing.status, "playing");
  assert.equal(playing.called.length, 1);
  assert.equal(playing.playEndsAt - playing.serverTime, 20 * 60 * 1000);
  assert.equal(playing.nextPullAt - playing.serverTime, 20 * 1000);
  f.setTime(playing.nextPullAt);
  const automatic = await f.request("/api/state?role=display");
  assert.equal(automatic.called.length, 2);
  const paused = await f.request("/api/pause-round", {});
  assert.equal(paused.status, "paused");
  assert.equal(paused.playEndsAt, null);
  f.setTime(paused.serverTime + 60 * 1000);
  const held = await f.request("/api/state?role=host");
  assert.equal(held.called.length, 2);
  assert.equal(held.playRemainingMs, paused.playRemainingMs);
  const resumed = await f.request("/api/resume-round", {});
  assert.equal(resumed.playEndsAt - resumed.serverTime, paused.playRemainingMs);
  f.setTime(resumed.playEndsAt);
  const onBreak = await f.request("/api/state?role=host");
  assert.equal(onBreak.status, "break");
  assert.equal(onBreak.breakEndsAt - onBreak.serverTime, 10 * 60 * 1000);
  f.setTime(onBreak.breakEndsAt);
  const nextRound = await f.request("/api/state?role=host");
  assert.equal(nextRound.status, "playing");
  assert.equal(nextRound.roundIndex, 1);
  assert.equal(nextRound.called.length, 1);
  const finalRound = await f.request("/api/next-round", {});
  assert.equal(finalRound.roundIndex, 2);
  assert.equal(finalRound.round.pattern, "X Pattern");
  f.setTime(finalRound.playEndsAt);
  const automaticallyEnded = await f.request("/api/state?role=host");
  assert.equal(automaticallyEnded.status, "ended", "the Round 3 timer ends the event automatically");
  assert.equal(automaticallyEnded.roundIndex, 2);
  assert.equal(automaticallyEnded.breakEndsAt, null);
});

test("seasonal worker preserves trivia redirects, murder-mystery assets, and the existing optional proxy", async () => {
  const f = await fixture();
  const trivia = await f.worker.fetch(new Request("https://www.opebingo.com/trivia"), f.env);
  assert.equal(trivia.status, 302);
  assert.equal(trivia.headers.get("Location"), "https://on-par-themed-trivia.vercel.app/host");
  const mystery = await f.worker.fetch(new Request("https://www.opebingo.com/murder-mystery"), f.env);
  assert.equal(mystery.status, 200);
  assert.equal(f.assetRequests.at(-1), "/murder-mystery/index.html");
  f.env.MURDER_MYSTERY_ORIGIN = "https://investigation.fixture.invalid";
  const proxied = await f.worker.fetch(new Request("https://www.opebingo.com/murder-mystery/host?event=test"), f.env);
  assert.equal(proxied.status, 302);
  assert.equal(proxied.headers.get("Location"), "https://www.opebingo.com/murder-mystery/play?station=1");
  assert.equal(proxied.headers.get("Cache-Control"), "private, no-store");
  assert.equal(f.proxyRequests.length, 1);
  assert.equal(f.proxyRequests[0].url, "https://investigation.fixture.invalid/murder-mystery/host?event=test");
  assert.equal(f.proxyRequests[0].headers.get("X-Forwarded-Host"), "www.opebingo.com");
  assert.equal(f.proxyRequests[0].headers.get("X-Forwarded-Proto"), "https");
  assert.equal(f.posts.length, 0, "unrelated routes do not reset bingo storage");
});
