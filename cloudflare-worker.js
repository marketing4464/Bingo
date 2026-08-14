import { handleMurderMysteryApi, MurderMysteryState } from "./murder-mystery-worker.js";

export { MurderMysteryState };

const GAME_STATE_ROW_ID = "current";
const SUPABASE_STATE_TABLE = "on_par_bingo_state";
const SUPABASE_PUBLIC_STATE_TABLE = "on_par_bingo_public_state";
const DEFAULT_SUPABASE_URL = "https://tmnstuthbllnoqgepotn.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G74TdOYv0R0AML1WZTfxJQ_YZqJa7jE";
const PULL_INTERVAL_MS = 20 * 1000;
const PREGAME_COUNTDOWN_MS = 15 * 60 * 1000;
const BREAK_MS = 10 * 60 * 1000;
const PLAYER_STATE_CACHE_MS = 1000;
const TRIVIA_CONTROL_ROOM_URL = "https://on-par-themed-trivia.vercel.app/host";

let cachedState = null;
let cachedStateLoadedAt = 0;
let cachedImageManifest = null;

const HYPE_MESSAGES = [
  "make some noise - prizes for the loudest table",
];

const moments = [
  ["Barbie", "Movies"], ["Mamma Mia", "Movies"], ["Top Gun", "Movies"], ["Titanic", "Movies"],
  ["Mean Girls", "Movies"], ["Wakanda", "Movies"], ["Avengers", "Movies"], ["Spider-Man", "Movies"],
  ["Star Wars", "Movies"], ["Jurassic Park", "Movies"], ["Shrek", "Movies"], ["Austin Powers", "Movies"],
  ["Scream", "Movies"], ["Wicked", "Movies"], ["Wednesday", "TV"], ["Friends", "TV"],
  ["Fresh Prince", "TV"], ["Seinfeld", "TV"], ["The Office", "TV"], ["Stranger Things", "TV"],
  ["The Upside Down", "TV"], ["Game of Thrones", "TV"], ["Golden Girls", "TV"], ["Saved by Bell", "TV"],
  ["Full House", "TV"], ["SpongeBob", "TV"], ["The Simpsons", "TV"], ["Real Housewives", "TV"],
  ["Survivor", "TV"], ["Oprah", "TV"], ["Dancing Queen", "Music"], ["Single Ladies", "Music"],
  ["Uptown Funk", "Music"], ["Thriller", "Music"], ["Purple Rain", "Music"], ["Material Girl", "Music"],
  ["Bye Bye Bye", "Music"], ["No Scrubs", "Music"], ["Hey Ya", "Music"], ["Old Town Road", "Music"],
  ["Moonwalk", "Music"], ["Super Bowl", "Sports"], ["World Cup", "Sports"], ["Olympics", "Sports"],
  ["March Madness", "Sports"], ["Space Jam", "Sports"], ["Halftime Show", "Sports"], ["Met Gala", "Celebrity"],
  ["Royal Wedding", "Celebrity"], ["You Get a Car", "Celebrity"], ["It Girl", "Internet"], ["Viral Dance", "Internet"],
  ["TikTok", "Internet"], ["Instagram", "Internet"], ["Y2K", "Style"], ["Friendship Bracelets", "Style"],
  ["Blockbuster", "Throwback"], ["TRL", "Throwback"], ["MTV", "Throwback"], ["Nickelodeon", "Throwback"],
  ["VHS", "Throwback"], ["Baby Yoda", "TV"], ["Kardashians", "Celebrity"], ["Taylor Swift", "Music"],
  ["Eras Tour", "Music"], ["Beyonce", "Music"], ["Lady Gaga", "Celebrity"], ["Rihanna", "Music"],
  ["Usher", "Music"], ["Billie Eilish", "Music"], ["Harry Potter", "Movies"], ["Lord of the Rings", "Movies"],
  ["The Matrix", "Movies"], ["Breaking Bad", "TV"], ["Grey's Anatomy", "TV"], ["Bridgerton", "TV"],
  ["Ted Lasso", "TV"], ["Schitt's Creek", "TV"], ["Euphoria", "TV"], ["Ghostbusters", "Movies"],
  ["Grease", "Movies"], ["Rocky", "Movies"], ["The Dress", "Internet"], ["Salt Bae", "Internet"],
  ["Oscars Slap", "Celebrity"], ["Wordle", "Internet"], ["Netflix and Chill", "Internet"], ["Coachella", "Music"],
  ["Roman Empire", "Internet"], ["Girl Math", "Internet"],
].map(([text, category]) => ({ id: slugId(text), text, category }));

const rounds = [
  { name: "Round 1", pattern: "Any Line", playMinutes: 20, points: 100 },
  { name: "Round 2", pattern: "Four Corners", playMinutes: 20, points: 100, bonusPoints: 50 },
  { name: "Round 3", pattern: "X Pattern", playMinutes: 20, points: 100, bonusPoints: 200 },
  { name: "Final Round", pattern: "Blackout", playMinutes: 30, points: 500 },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/trivia" || url.pathname === "/trivia/") {
      return Response.redirect(TRIVIA_CONTROL_ROOM_URL, 302);
    }
    if (url.pathname.startsWith("/murder-mystery/api/")) {
      return handleMurderMysteryApi(request, env, url);
    }
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(assetRequest(request, url));
  },
};

async function handleApi(request, env, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/client-config") {
      return json({ ok: true, supabase: browserSupabaseConfig(env) });
    }
    if (request.method === "GET" && url.pathname === "/api/storage-status") {
      return json({ ok: true, storage: storageStatus() });
    }
    if (request.method === "GET" && url.pathname === "/api/moment-image") {
      const text = url.searchParams.get("text") || "";
      const category = url.searchParams.get("category") || "";
      return json(await findMomentImage(env, text, category));
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      const role = roleFromRequest(request, url);
      let state = await loadState(env);
      if (role === "host" || role === "display") state = await advanceAndSave(env, state);
      return json(publicState(request, state, env));
    }

    if (request.method !== "POST") return json({ error: "Not found" }, 404);
    const body = await readJson(request);
    const pathname = url.pathname;

    if (pathname === "/api/heartbeat") {
      return json({ ok: true, id: String(body.id || crypto.randomUUID()).slice(0, 80) });
    }
    if (pathname === "/api/deal-cards") {
      const state = await loadState(env, { allowCached: true });
      const player = String(body.player || "Player").slice(0, 40);
      const count = Math.max(1, Math.min(3, Number(body.count || 1)));
      const cards = [];
      for (let index = 0; index < count; index += 1) cards.push(await createSignedCard(env, state, player, index + 1));
      return json({ ok: true, roundIndex: state.roundIndex, cards });
    }

    let state = await loadState(env);
    if (pathname === "/api/start-countdown") {
      state = startOpeningCountdown();
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/skip-countdown" || pathname === "/api/start-round") {
      state = startCurrentRound(state, { resetClaims: state.status === "countdown" || state.status === "setup" });
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/pull") {
      drawNextMoment(state);
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/pause-round") {
      if (state.status === "playing") {
        const now = Date.now();
        state.status = "paused";
        state.pausedAt = now;
        state.playRemainingMs = state.playEndsAt ? Math.max(0, state.playEndsAt - now) : null;
        state.nextPullRemainingMs = state.nextPullAt ? Math.max(0, state.nextPullAt - now) : PULL_INTERVAL_MS;
        state.playEndsAt = null;
        state.nextPullAt = null;
      }
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/resume-round") {
      if (state.status === "paused") {
        const now = Date.now();
        state.status = "playing";
        state.playEndsAt = state.playRemainingMs ? now + state.playRemainingMs : null;
        state.nextPullAt = now + Math.max(1000, Number(state.nextPullRemainingMs || PULL_INTERVAL_MS));
        state.pausedAt = null;
        state.playRemainingMs = null;
        state.nextPullRemainingMs = null;
      }
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/end-round" || pathname === "/api/start-break") {
      state = startBreakOrEndEvent(state);
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/next-round") {
      state = startNextRound(state);
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/undo-call") {
      const last = state.called.shift();
      if (last) {
        state.deck.unshift(last);
        state.currentWord = state.called[0] || null;
        state.nextPullAt = state.status === "playing" ? Date.now() + PULL_INTERVAL_MS : state.nextPullAt;
      }
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/toggle-auto-call") {
      state.autoPullEnabled = body.enabled !== undefined ? Boolean(body.enabled) : state.autoPullEnabled === false;
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/hype") {
      const fallback = HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)];
      state.hypeMessage = String(body.message || fallback).slice(0, 160);
      state.hypeUpdatedAt = Date.now();
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/reset") {
      if (body.confirm !== "RESET") return json({ error: "Reset confirmation required." }, 400);
      state = freshState();
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/claim") {
      const result = await validateClaim(env, state, body);
      if (result.error) return json({ error: result.error }, result.status || 400);
      state.claims.unshift(result.claim);
      await saveState(env, touch(state));
      return json({ ok: true, claim: result.claim, state: publicState(request, state, env) });
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Request failed" }, 500);
  }
}

function assetRequest(request, url) {
  const rewrites = new Map([
    ["/", "/host.html"],
    ["/host", "/host.html"],
    ["/dashboard", "/dashboard.html"],
    ["/display", "/display.html"],
    ["/host-guide", "/host-guide.html"],
    ["/play", "/play.html"],
    ["/murder-mystery", "/murder-mystery/index.html"],
    ["/murder-mystery/", "/murder-mystery/index.html"],
    ["/murder-mystery/play", "/murder-mystery/index.html"],
    ["/murder-mystery/host", "/murder-mystery/host.html"],
    ["/murder-mystery/display", "/murder-mystery/display.html"],
    ["/murder-mystery/intro", "/murder-mystery/intro.html"],
    ["/murder-mystery/module", "/murder-mystery/printable-module.html"],
    ["/murder-mystery/station-kit", "/murder-mystery/station-kit.html"],
    ["/favicon.ico", "/assets/on-par-logo.png"],
  ]);
  const pathname = url.pathname.startsWith("/murder-mystery/station/")
    ? "/murder-mystery/station.html"
    : rewrites.get(url.pathname) || url.pathname;
  const nextUrl = new URL(request.url);
  nextUrl.pathname = pathname;
  return new Request(nextUrl, request);
}

function freshState() {
  const now = Date.now();
  return {
    gameId: "pop-culture-default",
    title: "Pop Culture Moments Bingo",
    theme: "Pop Culture",
    venue: "On Par Entertainment",
    roundIndex: 0,
    status: "setup",
    currentWord: null,
    called: [],
    deck: shuffle(moments),
    claims: [],
    autoPullEnabled: true,
    hypeMessage: HYPE_MESSAGES[0],
    hypeUpdatedAt: now,
    countdownEndsAt: null,
    breakEndsAt: null,
    playEndsAt: null,
    pausedAt: null,
    playRemainingMs: null,
    nextPullAt: null,
    updatedAt: now,
  };
}

async function loadState(env, { allowCached = false } = {}) {
  if (allowCached && cachedState && Date.now() - cachedStateLoadedAt < PLAYER_STATE_CACHE_MS) return structuredClone(cachedState);
  const rows = await supabaseRequest(env, `${SUPABASE_STATE_TABLE}?id=eq.${GAME_STATE_ROW_ID}&select=state`);
  const snapshot = Array.isArray(rows) ? rows[0]?.state : null;
  const state = normalizeState(snapshot);
  cachedState = structuredClone(state);
  cachedStateLoadedAt = Date.now();
  return state;
}

function normalizeState(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.deck)) return freshState();
  const { murderMystery: _legacyMysteryState, ...bingoSnapshot } = snapshot;
  return {
    ...freshState(),
    ...bingoSnapshot,
    currentWord: compactMoment(bingoSnapshot.currentWord),
    called: compactMoments(bingoSnapshot.called),
    deck: compactMoments(bingoSnapshot.deck),
    claims: Array.isArray(bingoSnapshot.claims) ? bingoSnapshot.claims : [],
    autoPullEnabled: bingoSnapshot.autoPullEnabled !== false,
    updatedAt: Number(bingoSnapshot.updatedAt) || Date.now(),
  };
}

async function advanceAndSave(env, state) {
  const before = state.updatedAt;
  advanceState(state);
  if (state.updatedAt !== before) await saveState(env, state);
  return state;
}

function advanceState(state) {
  const now = Date.now();
  if (state.status === "countdown" && state.countdownEndsAt && now >= state.countdownEndsAt) {
    Object.assign(state, startCurrentRound(state, { resetClaims: true }));
    return;
  }
  if (state.status === "playing" && state.playEndsAt && now >= state.playEndsAt) {
    Object.assign(state, startBreakOrEndEvent(state));
    return;
  }
  if (state.status === "break" && state.breakEndsAt && now >= state.breakEndsAt) {
    Object.assign(state, startNextRound(state));
    return;
  }
  if (state.status === "playing" && state.autoPullEnabled !== false && state.nextPullAt && now >= state.nextPullAt) {
    if (drawNextMoment(state)) touch(state);
  }
}

async function saveState(env, state) {
  touch(state);
  cachedState = structuredClone(state);
  cachedStateLoadedAt = Date.now();
  await Promise.all([
    supabaseRequest(env, `${SUPABASE_STATE_TABLE}?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: GAME_STATE_ROW_ID, state, updated_at: new Date().toISOString() }),
    }),
    supabaseRequest(env, `${SUPABASE_PUBLIC_STATE_TABLE}?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: GAME_STATE_ROW_ID, state: playerState(state, env), updated_at: new Date().toISOString() }),
    }),
  ]);
}

function publicState(request, state, env) {
  const joinUrl = joinUrlForRequest(request, env);
  const round = rounds[state.roundIndex] || rounds[0];
  return {
    ...state,
    round,
    rounds,
    moments,
    activeGame: { id: state.gameId, title: state.title, theme: state.theme, status: "approved", wordCount: moments.length },
    joinUrl,
    qrUrl: joinUrl,
    autoPullEverySeconds: PULL_INTERVAL_MS / 1000,
    pregameCountdownSeconds: PREGAME_COUNTDOWN_MS / 1000,
    leaderboard: leaderboardFromClaims(state.claims),
    latestClaim: state.claims[0] || null,
    storage: storageStatus(),
    health: {
      ok: true,
      joinReady: true,
      deckReady: true,
      currentMomentReady: state.status !== "playing" || Boolean(state.currentWord || state.called.length),
      storageHealthy: true,
      displayConnected: true,
      hostConnected: true,
      activePlayers: 0,
      lastDisplaySeenAt: null,
      lastPlayerSeenAt: null,
    },
    serverTime: Date.now(),
  };
}

function playerState(state, env) {
  const full = publicState(new Request(env.PUBLIC_JOIN_URL || "https://www.opebingo.com/play"), state, env);
  return {
    gameId: full.gameId,
    title: full.title,
    theme: full.theme,
    venue: full.venue,
    roundIndex: full.roundIndex,
    status: full.status,
    currentWord: full.currentWord,
    called: full.called,
    autoPullEnabled: full.autoPullEnabled,
    hypeMessage: full.hypeMessage,
    hypeUpdatedAt: full.hypeUpdatedAt,
    countdownEndsAt: full.countdownEndsAt,
    breakEndsAt: full.breakEndsAt,
    playEndsAt: full.playEndsAt,
    pausedAt: full.pausedAt,
    playRemainingMs: full.playRemainingMs,
    nextPullAt: full.nextPullAt,
    updatedAt: full.updatedAt,
    round: full.round,
    rounds: full.rounds,
    joinUrl: full.joinUrl,
    qrUrl: full.qrUrl,
    autoPullEverySeconds: full.autoPullEverySeconds,
    pregameCountdownSeconds: full.pregameCountdownSeconds,
    latestClaim: full.latestClaim,
    serverTime: full.serverTime,
  };
}

function startOpeningCountdown() {
  const state = freshState();
  state.status = "countdown";
  state.countdownEndsAt = Date.now() + PREGAME_COUNTDOWN_MS;
  return touch(state);
}

function startCurrentRound(state, { resetClaims = false } = {}) {
  const round = rounds[state.roundIndex] || rounds[0];
  const previousCalled = state.called || [];
  state.status = "playing";
  state.currentWord = null;
  state.called = [];
  state.deck = buildRoundDeck(state.roundIndex, previousCalled);
  if (resetClaims) state.claims = [];
  state.countdownEndsAt = null;
  state.breakEndsAt = null;
  state.pausedAt = null;
  state.playRemainingMs = null;
  state.playEndsAt = Date.now() + round.playMinutes * 60 * 1000;
  state.nextPullAt = Date.now() + PULL_INTERVAL_MS;
  drawNextMoment(state);
  return touch(state);
}

function startBreakOrEndEvent(state) {
  state.currentWord = null;
  state.countdownEndsAt = null;
  state.playEndsAt = null;
  state.pausedAt = null;
  state.playRemainingMs = null;
  state.nextPullAt = null;
  if (state.roundIndex >= rounds.length - 1) {
    state.status = "ended";
    state.breakEndsAt = null;
  } else {
    state.status = "break";
    state.breakEndsAt = Date.now() + BREAK_MS;
  }
  return touch(state);
}

function startNextRound(state) {
  if (state.roundIndex >= rounds.length - 1) return startBreakOrEndEvent(state);
  state.roundIndex += 1;
  return startCurrentRound(state);
}

function drawNextMoment(state) {
  if (state.status !== "playing") return false;
  if (!state.deck.length) state.deck = buildRoundDeck(state.roundIndex, state.called);
  const next = state.deck.shift();
  if (!next) return false;
  state.currentWord = next;
  state.called.unshift(next);
  state.nextPullAt = Date.now() + PULL_INTERVAL_MS;
  return true;
}

function buildRoundDeck(roundIndex, previousCalled = []) {
  if (roundIndex !== rounds.length - 1) return shuffle(moments);
  const previousTexts = new Set(previousCalled.map((moment) => moment?.text).filter(Boolean));
  return [
    ...shuffle(moments.filter((moment) => !previousTexts.has(moment.text))),
    ...shuffle(moments.filter((moment) => previousTexts.has(moment.text))),
  ];
}

async function createSignedCard(env, state, player, number) {
  const pool = shuffle(moments.map((moment) => moment.text)).slice(0, 24);
  const cells = Array.from({ length: 25 }, (_, index) => (index === 12 ? "FREE" : pool.shift()));
  const payload = { v: 1, player, roundIndex: state.roundIndex, number, cells };
  return { number, cells, token: await sign(env, payload) };
}

async function validateClaim(env, state, body) {
  if (state.status !== "playing") return { error: "BINGO claims are only accepted during a live round.", status: 409 };
  const player = String(body.player || "Player").slice(0, 40);
  const cardNumber = Number(body.card || 1);
  const cells = Array.isArray(body.cells) && body.cells.length === 25 ? body.cells.map((cell) => String(cell || "").slice(0, 80)) : null;
  const tokenPayload = await verify(env, body.cardToken);
  if (!cells || !tokenPayload) return { error: "Could not verify this bingo card. Refresh your card and try again.", status: 400 };
  if (tokenPayload.player !== player || Number(tokenPayload.number) !== cardNumber || JSON.stringify(tokenPayload.cells) !== JSON.stringify(cells)) {
    return { error: "This bingo card does not match the current round. Refresh your card and try again.", status: 409 };
  }
  const cardRoundOk = tokenPayload.roundIndex === state.roundIndex || (state.roundIndex === rounds.length - 1 && tokenPayload.roundIndex === state.roundIndex - 1);
  if (!cardRoundOk) return { error: "This bingo card does not match the current round. Refresh your card and try again.", status: 409 };
  const selected = normalizeSelected(body.selected);
  const calledWords = new Set(state.called.map((word) => word.text));
  const completed = completedBingos(cells, selected, rounds[state.roundIndex].pattern, calledWords);
  const requestedIds = new Set((Array.isArray(body.bingos) ? body.bingos : []).map((bingo) => String(bingo?.id || "")));
  const candidates = completed.filter((bingo) => !requestedIds.size || requestedIds.has(bingo.id));
  if (!completed.length || !candidates.length) return { error: "No completed BINGO pattern was submitted.", status: 400 };
  const fingerprint = await digest(JSON.stringify(cells));
  const freshBingos = candidates.filter((bingo) => !alreadyClaimed(state, player, cardNumber, bingo.id, fingerprint));
  if (!freshBingos.length) return { error: "That BINGO was already claimed on this card.", status: 409 };
  const points = freshBingos.reduce((sum, bingo) => sum + bingo.points, 0);
  return {
    claim: {
      id: `${Date.now()}-${crypto.randomUUID()}`,
      player,
      card: cardNumber,
      cardFingerprint: fingerprint,
      bingos: freshBingos,
      bingoCount: freshBingos.length,
      points,
      pattern: rounds[state.roundIndex].pattern,
      round: rounds[state.roundIndex].name,
      roundIndex: state.roundIndex,
      createdAt: Date.now(),
    },
  };
}

function completedBingos(cells, selected, pattern, calledWords) {
  const marked = cells.map((word, index) => selected.has(index) && (word === "FREE" || calledWords.has(word)));
  const lines = bingoLines()
    .filter((line) => line.cells.every((index) => marked[index]))
    .map((line) => ({ ...line, words: line.cells.map((index) => cells[index]), points: 100 }));
  if (pattern === "Blackout") return marked.every(Boolean) ? [{ id: "blackout", label: "Blackout Bingo", cells: [...Array(25).keys()], words: cells, points: 500 }] : [];
  if (pattern === "X Pattern") {
    const x = [0, 4, 6, 8, 12, 16, 18, 20, 24];
    return x.every((index) => marked[index]) ? [...lines, { id: "x-pattern", label: "X Bingo Bonus", cells: x, words: x.map((index) => cells[index]), points: 200 }] : lines;
  }
  if (pattern === "Four Corners") {
    const corners = [0, 4, 20, 24];
    return corners.every((index) => marked[index]) ? [...lines, { id: "four-corners", label: "Four Corners Bonus", cells: corners, words: corners.map((index) => cells[index]), points: 50 }] : lines;
  }
  return lines;
}

function bingoLines() {
  return [
    ["row-1", "Top Row", [0, 1, 2, 3, 4]], ["row-2", "Second Row", [5, 6, 7, 8, 9]],
    ["row-3", "Middle Row", [10, 11, 12, 13, 14]], ["row-4", "Fourth Row", [15, 16, 17, 18, 19]],
    ["row-5", "Bottom Row", [20, 21, 22, 23, 24]], ["col-1", "B Column", [0, 5, 10, 15, 20]],
    ["col-2", "I Column", [1, 6, 11, 16, 21]], ["col-3", "N Column", [2, 7, 12, 17, 22]],
    ["col-4", "G Column", [3, 8, 13, 18, 23]], ["col-5", "O Column", [4, 9, 14, 19, 24]],
    ["diag-1", "Diagonal", [0, 6, 12, 18, 24]], ["diag-2", "Diagonal", [4, 8, 12, 16, 20]],
  ].map(([id, label, cells]) => ({ id, label, cells }));
}

function alreadyClaimed(state, player, card, bingoId, fingerprint) {
  return state.claims.some((claim) => claim.player === player
    && claim.roundIndex === state.roundIndex
    && (claim.cardFingerprint === fingerprint || Number(claim.card) === Number(card))
    && Array.isArray(claim.bingos)
    && claim.bingos.some((bingo) => bingo.id === bingoId));
}

function normalizeSelected(selected) {
  const set = new Set(Array.isArray(selected) ? selected.map(Number) : []);
  set.add(12);
  return new Set([...set].filter((index) => Number.isInteger(index) && index >= 0 && index < 25));
}

async function sign(env, payload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(env, encoded);
  return `${encoded}.${signature}`;
}

async function verify(env, token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature || await hmac(env, encoded) !== signature) return null;
  try {
    return JSON.parse(base64UrlDecode(encoded));
  } catch {
    return null;
  }
}

async function hmac(env, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return arrayBufferToBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function digest(value) {
  return arrayBufferToBase64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function arrayBufferToBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function supabaseRequest(env, pathname, options = {}) {
  const config = supabaseConfig(env);
  const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function supabaseConfig(env) {
  return {
    url: String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

function browserSupabaseConfig(env) {
  const config = supabaseConfig(env);
  return {
    url: config.url,
    key: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    publicStateTable: SUPABASE_PUBLIC_STATE_TABLE,
  };
}

function signingSecret(env) {
  return env.BINGO_CARD_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
}

function storageStatus() {
  return {
    provider: "supabase",
    configured: true,
    available: true,
    lastLoadedAt: Date.now(),
    lastSavedAt: Date.now(),
    error: null,
  };
}

function joinUrlForRequest(request, env) {
  if (env.PUBLIC_JOIN_URL) return env.PUBLIC_JOIN_URL;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/play`;
}

function leaderboardFromClaims(claims) {
  const scores = new Map();
  for (const claim of claims || []) {
    const current = scores.get(claim.player) || { player: claim.player, points: 0, bingos: 0 };
    current.points += claim.points || 100;
    current.bingos += claim.bingoCount || 1;
    scores.set(claim.player, current);
  }
  return [...scores.values()].sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

function compactMoment(moment) {
  if (!moment || typeof moment !== "object") return null;
  const text = String(moment.text || moment.word || "").slice(0, 80);
  if (!text) return null;
  return { id: String(moment.id || slugId(text)), text, category: String(moment.category || moment.description || "").slice(0, 160) };
}

function compactMoments(items) {
  return (Array.isArray(items) ? items : []).map(compactMoment).filter(Boolean);
}

function shuffle(items) {
  const copy = items.map((item) => (item && typeof item === "object" ? { ...item } : item));
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function touch(state) {
  state.updatedAt = Date.now();
  return state;
}

function slugId(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

async function findMomentImage(env, text, category = "") {
  const manifest = await loadImageManifest(env);
  const manifestItem = manifest[text];
  if (manifestItem?.image) {
    return {
      ok: true,
      url: manifestItem.image,
      title: manifestItem.alt || text,
      query: manifestItem.query || imageSearchQuery(text, category),
      source: manifestItem.source || "Approved image manifest",
      width: manifestItem.width,
      height: manifestItem.height,
      qualityScore: manifestItem.qualityScore,
      cached: true,
    };
  }

  return {
    ok: true,
    url: momentImageUrl(text),
    title: text,
    query: imageSearchQuery(text, category),
    source: "cloudflare-static-fallback",
  };
}

async function loadImageManifest(env) {
  if (cachedImageManifest) return cachedImageManifest;
  try {
    const response = await env.ASSETS.fetch(new Request("https://assets.local/assets/google-image-manifest.json"));
    if (response.ok) {
      cachedImageManifest = await response.json();
      return cachedImageManifest;
    }
  } catch {
    // Fall through to an empty manifest so the generated fallback still works.
  }
  cachedImageManifest = {};
  return cachedImageManifest;
}

function imageSearchQuery(text, category) {
  if (category === "Movies") return `${text} film`;
  if (category === "TV") return `${text} TV series`;
  if (category === "Music") return `${text} song`;
  if (category === "Internet") return `pop culture moment ${text} meme`;
  return `pop culture moment ${text}`;
}

function momentImageUrl(text) {
  return text ? `/assets/approval-images/${slugId(text)}.jpg` : "/assets/event-art/bingo-leaderboard-screen.png";
}

function roleFromRequest(request, url) {
  return String(url.searchParams.get("role") || request.headers.get("x-bingo-role") || "").toLowerCase();
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
