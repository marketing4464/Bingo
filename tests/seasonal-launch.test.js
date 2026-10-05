const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const vm = require("node:vm");
const test = require("node:test");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seasonal-launch-test-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "public/assets/spooky-season"), { recursive: true });
  for (const file of ["server.js", "seasonal-deck.js"]) fs.copyFileSync(path.join(__dirname, "..", file), path.join(root, file));
  const items = Array.from({ length: 80 }, (_, index) => ({ id: `word-${index + 1}`, word: `Seasonal Word ${index + 1}`, category: "Spooky Season" }));
  const manifest = { items: items.map((item) => ({ ...item, candidates: [{ id: `${item.id}-art`, imageUrl: `/assets/spooky-season/${item.id}.jpg`, sourceUrl: "https://source.example/art", sha256: `${item.id}-hash`, license: "Fixture artwork" }] })) };
  const decisions = { decisions: Object.fromEntries(manifest.items.map((item) => [item.id, { word: item.word, decision: "approved", candidateId: item.candidates[0].id, approvedImageUrl: item.candidates[0].imageUrl, sha256: item.candidates[0].sha256 }])) };
  fs.writeFileSync(path.join(root, "data/spooky-season-deck.json"), JSON.stringify(items));
  fs.writeFileSync(path.join(root, "data/image-review-decisions.json"), JSON.stringify(decisions));
  fs.writeFileSync(path.join(root, "public/assets/spooky-season/image-candidates.json"), JSON.stringify(manifest));
  return { root, items, decisions, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function engineWithStorage(f, records) {
  const posts = [];
  const context = vm.createContext({
    require: createRequire(path.join(f.root, "server.js")),
    module: { exports: {} }, __dirname: f.root, Buffer, URL, Request, Response,
    process: { env: { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "fixture-card-secret" }, cwd: () => f.root },
    console, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    fetch: async (input, options = {}) => {
      const url = new URL(input);
      assert.equal(url.origin, "https://fixture.invalid", "tests never contact real Supabase or image services");
      const table = url.pathname.split("/").pop();
      if (options.method === "POST") {
        const payload = JSON.parse(options.body);
        records[`${table}:${payload.id}`] = structuredClone(payload.state);
        posts.push({ table, ...payload });
        return new Response(null, { status: 204 });
      }
      const id = url.searchParams.get("id").replace(/^eq\./, "");
      return Response.json(records[`${table}:${id}`] ? [{ state: records[`${table}:${id}`] }] : []);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(f.root, "server.js"), "utf8"), context);
  const api = async (pathname, body, status = 200) => {
    const response = await context.module.exports.handleApiWebRequest(new Request(`https://fixture.invalid${pathname}`, {
      method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", "X-Bingo-Role": "host" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), pathname.split("?")[0]);
    const payload = await response.json();
    assert.equal(response.status, status, JSON.stringify(payload));
    return payload;
  };
  return { api, posts };
}

const OLD_FOUR_ROUNDS = [
  { name: "Round 1", pattern: "Any Line", playMinutes: 20, points: 100 },
  { name: "Round 2", pattern: "Four Corners", playMinutes: 20, points: 100, bonusPoints: 50 },
  { name: "Round 3", pattern: "X Pattern", playMinutes: 20, points: 100, bonusPoints: 200 },
  { name: "Final Round", pattern: "Blackout", playMinutes: 30, points: 500 },
];

function seasonalStorage(f, status = "paused", roundIndex = 1) {
  const game = require(path.join(f.root, "seasonal-deck.js")).game(OLD_FOUR_ROUNDS);
  const moments = game.wordDeck.map((item) => ({ id: item.id, text: item.word, category: item.description }));
  const original = {
    gameId: game.id, deckVersion: game.deckVersion, title: game.title, theme: game.theme,
    status, roundIndex, currentWord: moments[0], called: moments.slice(0, 2), deck: moments.slice(2),
    claims: [{ player: "Existing Winner", roundIndex: 0, round: "Round 1", points: 100 }],
    rounds: OLD_FOUR_ROUNDS, round: OLD_FOUR_ROUNDS[roundIndex],
    updatedAt: 2, autoPullEnabled: false, nextPullAt: null,
    pausedAt: 100, playRemainingMs: 360000, nextPullRemainingMs: 15000,
    breakEndsAt: status === "break" ? Date.now() + 600000 : null,
    playEndsAt: status === "playing" ? Date.now() + 600000 : null,
  };
  return { game, original, records: {
    "on_par_bingo_state:themed-games": { updatedAt: 1, activeGameId: game.id, games: [game] },
    "on_par_bingo_state:current": structuredClone(original),
  } };
}

test("Disney persisted state migrates once, preserving storage, other games, and round rules", async () => {
  const f = fixture();
  try {
    const disneyDeck = Array.from({ length: 80 }, (_, index) => ({ id: `disney-${index}`, word: `Disney Word ${index}`, imageStatus: "approved", approvedImageUrl: "https://images.example/disney.jpg" }));
    const records = {
      "on_par_bingo_state:themed-games": { updatedAt: 1, activeGameId: "disney-pixar-bingo", games: [{ id: "disney-pixar-bingo", title: "Disney & Pixar Bingo", wordDeck: disneyDeck }, { id: "other-game", title: "Another Saved Event", wordDeck: disneyDeck }] },
      "on_par_bingo_state:current": { gameId: "disney-pixar-bingo", title: "Disney & Pixar Bingo", theme: "Disney", status: "playing", roundIndex: 2, currentWord: { text: "Disney Word 0" }, called: [{ text: "Disney Word 0" }], deck: [{ text: "Disney Word 1" }], claims: [{ player: "Previous Winner", points: 100 }], updatedAt: 2, nextPullAt: Date.now() + 10000 },
    };
    const { api, posts } = engineWithStorage(f, records);
    const migrated = await api("/api/state");
    const expectedVersion = crypto.createHash("sha256").update(JSON.stringify(f.items.map(({ id, word }) => ({ id, word })))).digest("hex");
    assert.equal(migrated.gameId, "spooky-season-bingo");
    assert.equal(migrated.title, "Spooky Season Bingo");
    assert.equal(migrated.deckVersion, expectedVersion);
    assert.equal(migrated.status, "setup");
    assert.equal(migrated.roundIndex, 0);
    assert.equal(migrated.currentWord, null);
    assert.deepEqual(migrated.called, []);
    assert.deepEqual(migrated.claims, []);
    assert.equal(migrated.deck.length, 80);
    assert.equal(migrated.storage.provider, "supabase");
    assert(migrated.deck.every((item) => item.text.startsWith("Seasonal Word ")));
    assert.deepEqual(migrated.rounds.map((round) => round.playMinutes), [20, 20, 20]);
    const savedGames = records["on_par_bingo_state:themed-games"];
    assert.equal(savedGames.activeGameId, "spooky-season-bingo");
    assert(savedGames.games.some((game) => game.id === "other-game"));
    assert(!savedGames.games.some((game) => game.id === "disney-pixar-bingo"));
    assert.equal(records["on_par_bingo_public_state:current"].deckVersion, expectedVersion);
    assert.equal(records["on_par_bingo_state:current"].deckVersion, expectedVersion);
    const postCount = posts.length;
    const second = await api("/api/state");
    assert.equal(posts.length, postCount, "migration does not rewrite an already migrated event");
    assert.equal(second.updatedAt, migrated.updatedAt);
    const config = await api("/api/client-config");
    assert.equal(config.supabase.publicStateTable, "on_par_bingo_public_state");
    assert.equal(config.supabase.deckVersion, expectedVersion);
    const countdown = await api("/api/start-countdown", {});
    assert.equal(countdown.pregameCountdownSeconds, 900);
    assert.equal(countdown.autoPullEverySeconds, 20);
    assert(countdown.deck.every((item) => item.text.startsWith("Seasonal Word ")));
    await api("/api/skip-countdown", {});
    await api("/api/toggle-auto-call", { enabled: false });
    const dealt = await api("/api/deal-cards", { player: "Returning Player", count: 3 });
    assert.equal(dealt.cards.length, 3);
    const tokenPayload = JSON.parse(Buffer.from(dealt.cards[0].token.split(".")[0], "base64url"));
    assert.equal(tokenPayload.gameId, migrated.gameId);
    assert.equal(tokenPayload.deckVersion, expectedVersion);
    assert(dealt.cards.every((card) => card.cells[12] === "FREE" && card.cells.every((word) => word === "FREE" || word.startsWith("Seasonal Word "))));
    const stalePayload = { ...tokenPayload, gameId: "disney-pixar-bingo", deckVersion: "old-disney-deck" };
    const encoded = Buffer.from(JSON.stringify(stalePayload)).toString("base64url");
    const signature = crypto.createHmac("sha256", "fixture-card-secret").update(encoded).digest("base64url");
    const stale = await api("/api/claim", { player: tokenPayload.player, card: tokenPayload.number, cardToken: `${encoded}.${signature}`, cells: tokenPayload.cells, selected: [12] }, 409);
    assert.match(stale.error, /does not match/);
    const image = await api("/api/moment-image?text=Seasonal%20Word%201");
    assert.equal(image.approved, true);
    assert.equal(image.url, "/assets/spooky-season/word-1.jpg");
    assert.equal(image.license, "Fixture artwork");
    const oldImage = await api("/api/moment-image?text=Disney%20Word%200");
    assert.equal(oldImage.approved, false);
    assert.equal(oldImage.url, null);
  } finally { f.cleanup(); }
});

test("seasonal launch rejects an approval bound to another image or word", () => {
  const f = fixture();
  try {
    f.decisions.decisions["word-1"].sha256 = "another-image-hash";
    fs.writeFileSync(path.join(f.root, "data/image-review-decisions.json"), JSON.stringify(f.decisions));
    const helper = require(path.join(f.root, "seasonal-deck.js"));
    assert.throws(() => helper.approvedDeck(), /not approved for Seasonal Word 1/);
  } finally { f.cleanup(); }
});

test("three-round configuration migration preserves active seasonal play and approval decisions", async () => {
  const f = fixture();
  try {
    const { game, original, records } = seasonalStorage(f);
    const { api, posts } = engineWithStorage(f, records);
    const migrated = await api("/api/state");
    assert.equal(migrated.roundPlanVersion, "spooky-season-three-rounds-v1");
    assert.deepEqual(migrated.rounds, OLD_FOUR_ROUNDS.slice(0, 3));
    for (const key of ["gameId", "deckVersion", "title", "theme", "status", "roundIndex", "currentWord", "called", "deck", "claims", "pausedAt", "playRemainingMs", "nextPullRemainingMs", "nextPullAt"]) {
      assert.deepEqual(migrated[key], original[key], `configuration update preserves ${key}`);
    }
    const savedGame = records["on_par_bingo_state:themed-games"].games[0];
    assert.equal(savedGame.id, game.id);
    assert.deepEqual(savedGame.roundSettings, OLD_FOUR_ROUNDS.slice(0, 3));
    assert.deepEqual(savedGame.wordDeck.map((item) => [item.id, item.word, item.imageStatus, item.approvedImageUrl]), game.wordDeck.map((item) => [item.id, item.word, item.imageStatus, item.approvedImageUrl]));
    assert.equal(records["on_par_bingo_state:current"].roundPlanVersion, migrated.roundPlanVersion);
    assert.equal(records["on_par_bingo_public_state:current"].roundPlanVersion, migrated.roundPlanVersion);
    const postCount = posts.length;
    await api("/api/state");
    assert.equal(posts.length, postCount, "configuration migration is idempotent");
  } finally { f.cleanup(); }
});

test("removed fourth round and break after the third end without discarding calls or claims", async () => {
  for (const [status, roundIndex] of [["playing", 3], ["break", 2]]) {
    const f = fixture();
    try {
      const { original, records } = seasonalStorage(f, status, roundIndex);
      const { api } = engineWithStorage(f, records);
      const migrated = await api("/api/state");
      assert.equal(migrated.roundIndex, 2);
      assert.equal(migrated.status, "ended");
      assert.equal(migrated.round.pattern, "X Pattern");
      assert.equal(migrated.rounds.length, 3);
      for (const key of ["deckVersion", "currentWord", "called", "deck", "claims"]) assert.deepEqual(migrated[key], original[key]);
      for (const key of ["playEndsAt", "breakEndsAt", "nextPullAt", "pausedAt", "playRemainingMs"]) assert.equal(migrated[key], null);
    } finally { f.cleanup(); }
  }
});

test("third X round requires its own cards, awards its bonus, and ends the event", async () => {
  const f = fixture();
  try {
    const { records } = seasonalStorage(f);
    const { api } = engineWithStorage(f, records);
    await api("/api/state");
    await api("/api/start-round", {});
    await api("/api/toggle-auto-call", { enabled: false });
    const secondRound = await api("/api/deal-cards", { player: "X Tester", count: 1 });
    assert.equal(secondRound.roundIndex, 1);
    const finalRound = await api("/api/next-round", {});
    assert.equal(finalRound.roundIndex, 2);
    assert.equal(finalRound.round.pattern, "X Pattern");
    assert.equal(finalRound.round.playMinutes, 20);
    const oldCard = secondRound.cards[0];
    const stale = await api("/api/claim", { player: "X Tester", card: 1, cardToken: oldCard.token, cells: oldCard.cells, selected: [12] }, 409);
    assert.match(stale.error, /does not match/);
    const dealt = await api("/api/deal-cards", { player: "X Tester", count: 1 });
    const card = dealt.cards[0];
    const x = [0, 4, 6, 8, 12, 16, 18, 20, 24];
    let live = finalRound;
    for (let count = 0; count < 80 && !x.every((index) => card.cells[index] === "FREE" || live.called.some((item) => item.text === card.cells[index])); count += 1) live = await api("/api/pull", {});
    const claim = await api("/api/claim", { player: "X Tester", card: 1, cardToken: card.token, cells: card.cells, selected: x, bingos: [{ id: "x-pattern" }] });
    assert.equal(claim.claim.points, 200);
    assert.equal(claim.claim.pattern, "X Pattern");
    const ended = await api("/api/next-round", {});
    assert.equal(ended.status, "ended");
    assert.equal(ended.roundIndex, 2);
    assert.equal(ended.rounds.length, 3);
    assert(ended.claims.some((item) => item.id === claim.claim.id));
  } finally { f.cleanup(); }
});
