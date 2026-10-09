import seasonalDocument from "./data/spooky-season-deck.json";
import reviewDocument from "./data/image-review-decisions.json";
import seasonalImageManifest from "./public/assets/spooky-season/image-candidates.json";
import releaseDocument from "./data/spooky-season-release.json";
import recoverySeed from "./data/recovery-seed.json";
import { handleMurderMysteryApi, MurderMysteryState } from "./murder-mystery-worker.js";
import { proxyMurderMystery } from "./murder-mystery-proxy.mjs";

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
const SUPABASE_REQUEST_TIMEOUT_MS = 15 * 1000;
const DURABLE_STATE_KEY = "bingo-live-state-v1";
const TRIVIA_CONTROL_ROOM_URL = "https://on-par-themed-trivia.vercel.app/host";

let cachedState = null;
let cachedStateLoadedAt = 0;
const stateStorageBases = new WeakMap();
const storageHealth = {
  provider: "supabase", configured: true, available: false,
  lastLoadedAt: null, lastSavedAt: null, error: null,
};

const HYPE_MESSAGES = [
  "make some noise - prizes for the loudest table",
];

const ACTIVE_GAME_ID = "spooky-season-bingo";
const ACTIVE_GAME_TITLE = "Spooky Season Bingo";
const ACTIVE_GAME_THEME = "Halloween, Horror Films, and Fall";
const ACTIVE_DECK_VERSION = releaseDocument.deckVersion;
const ACTIVE_ROUND_PLAN_VERSION = "spooky-season-three-rounds-v1";
const seasonalRows = Array.isArray(seasonalDocument) ? seasonalDocument : seasonalDocument.items || [];
const moments = seasonalRows.map((item) => ({ id: item.id, text: item.word, category: item.category }));
const reviewDecisions = reviewDocument.decisions || {};
const approvedArtwork = new Map(moments.map((moment) => {
  const decision = reviewDecisions[moment.id];
  const entry = seasonalImageManifest.items.find((item) => item.id === moment.id && item.word === moment.text);
  const candidate = entry?.candidates.find((item) => decision?.decision === "approved"
    && decision.word === moment.text && item.id === decision.candidateId
    && item.imageUrl === decision.approvedImageUrl && item.sha256 === decision.sha256);
  return [moment.text, candidate];
}));
if (moments.length !== 80 || new Set(moments.map((item) => item.id)).size !== 80
    || new Set(moments.map((item) => item.text)).size !== 80
    || !ACTIVE_DECK_VERSION || [...approvedArtwork.values()].some((item) => !item)) {
  throw new Error("Spooky Season Bingo requires 80 distinct words with approved artwork.");
}

const rounds = [
  { name: "Round 1", pattern: "Any Line", playMinutes: 20, points: 100 },
  { name: "Round 2", pattern: "Four Corners", playMinutes: 20, points: 100, bonusPoints: 50 },
  { name: "Round 3", pattern: "X Pattern", playMinutes: 20, points: 100, bonusPoints: 200 },
];

// One object owns the live game. The full snapshot and its public projection
// share one SQLite-backed storage value, so a score and a call cannot diverge.
export class BingoLiveState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = { ...env, __BINGO_DURABLE_CONTEXT: this };
    this.operationQueue = Promise.resolve();
    this.health = {
      provider: "cloudflare-durable-object", configured: true, available: false,
      lastLoadedAt: null, lastSavedAt: null, error: null,
    };
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(DURABLE_STATE_KEY);
      if (!stored) {
        assertDurableSnapshot(recoverySeed);
        const state = structuredClone(recoverySeed);
        await ctx.storage.put(DURABLE_STATE_KEY, {
          state, publicState: playerState(state, this.env), seededAt: Date.now(),
        });
        this.health.lastSavedAt = Date.now();
      } else {
        assertDurableSnapshot(stored.state);
      }
      this.health.available = true;
      this.health.lastLoadedAt = Date.now();
      await this.scheduleAlarm();
    });
  }

  enqueue(operation) {
    const result = this.operationQueue.then(async () => {
      await this.ready;
      return operation();
    });
    this.operationQueue = result.catch(() => {});
    return result;
  }

  async fetch(request) {
    try {
      // Receive the body before entering the queue; a slow phone upload must
      // not hold up state reads, calls, or another player's completed claim.
      const readyRequest = request.method === "POST"
        ? new Request(request, { body: await request.text() }) : request;
      return await this.enqueue(async () => {
        const response = await handleApi(readyRequest, this.env, new URL(readyRequest.url));
        await this.scheduleAlarm();
        return response;
      });
    } catch (cause) {
      const error = this.storageError(cause);
      return json({ error: error.message, code: error.code, storage: storageStatus(this.env) }, error.status);
    }
  }

  async loadState() {
    try {
      const stored = await this.ctx.storage.get(DURABLE_STATE_KEY);
      assertDurableSnapshot(stored?.state);
      const state = structuredClone(stored.state);
      stateStorageBases.set(state, { exists: true, updatedAt: state.updatedAt });
      this.health.available = true;
      this.health.lastLoadedAt = Date.now();
      this.health.error = null;
      return state;
    } catch (cause) {
      throw this.storageError(cause);
    }
  }

  async saveState(state) {
    const base = stateStorageBases.get(state);
    if (!base) throw stateConflict();
    assertDurableSnapshot(state);
    touch(state);
    try {
      await this.ctx.storage.transaction(async (transaction) => {
        const stored = await transaction.get(DURABLE_STATE_KEY);
        assertDurableSnapshot(stored?.state);
        if (Number(stored.state.updatedAt) !== Number(base.updatedAt)) throw stateConflict();
        await transaction.put(DURABLE_STATE_KEY, {
          ...stored, state: structuredClone(state), publicState: playerState(state, this.env),
        });
      });
      stateStorageBases.set(state, { exists: true, updatedAt: state.updatedAt });
      this.health.available = true;
      this.health.lastSavedAt = Date.now();
      this.health.error = null;
    } catch (cause) {
      if (cause.code === "BINGO_STATE_CONFLICT") throw cause;
      throw this.storageError(cause);
    }
  }

  async scheduleAlarm() {
    const stored = await this.ctx.storage.get(DURABLE_STATE_KEY);
    assertDurableSnapshot(stored?.state);
    const state = stored.state;
    const deadlines = [];
    if (state.status === "countdown" && state.countdownEndsAt) deadlines.push(Number(state.countdownEndsAt));
    if (state.status === "break" && state.breakEndsAt) deadlines.push(Number(state.breakEndsAt));
    if (state.status === "playing") {
      if (state.playEndsAt) deadlines.push(Number(state.playEndsAt));
      if (state.autoPullEnabled !== false && state.nextPullAt) deadlines.push(Number(state.nextPullAt));
    }
    const valid = deadlines.filter((value) => Number.isFinite(value) && value > 0);
    if (valid.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...valid)));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    return this.enqueue(async () => {
      const state = await this.loadState();
      await advanceAndSave(this.env, state);
      await this.scheduleAlarm();
    });
  }

  storageError(cause) {
    const error = new Error(`Live bingo storage is temporarily unavailable. Please retry shortly. ${cause.message || "Durable storage request failed"}.`);
    error.status = 503;
    error.code = "BINGO_STORAGE_UNAVAILABLE";
    this.health.available = false;
    this.health.error = error.message;
    return error;
  }
}

function assertDurableSnapshot(state) {
  if (!state || typeof state !== "object" || state.gameId !== ACTIVE_GAME_ID
      || state.title !== ACTIVE_GAME_TITLE
      || state.deckVersion !== ACTIVE_DECK_VERSION || state.roundPlanVersion !== ACTIVE_ROUND_PLAN_VERSION
      || !Array.isArray(state.deck) || !Array.isArray(state.called) || !Array.isArray(state.claims)
      || !Number.isInteger(state.roundIndex) || state.roundIndex < 0 || state.roundIndex >= rounds.length
      || !["setup", "countdown", "playing", "paused", "break", "ended"].includes(state.status)
      || typeof state.updatedAt !== "number" || !Number.isFinite(state.updatedAt) || state.updatedAt <= 0) {
    throw new Error("The verified live bingo snapshot is missing or invalid; the game has not been reset");
  }
}

function usesDurableState(env) {
  return Boolean(env.BINGO_LIVE_STATE || env.__BINGO_DURABLE_CONTEXT);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const currentGame = await proxyMurderMystery(request, env);
    if (currentGame) return currentGame;
    if (url.pathname === "/trivia" || url.pathname === "/trivia/") {
      return Response.redirect(TRIVIA_CONTROL_ROOM_URL, 302);
    }
    if (url.pathname.startsWith("/murder-mystery/api/")) {
      return handleMurderMysteryApi(request, env);
    }
    if (url.pathname.startsWith("/api/")) {
      if (env.BINGO_LIVE_STATE && !["/api/client-config", "/api/moment-image", "/api/heartbeat"].includes(url.pathname)) {
        const id = env.BINGO_LIVE_STATE.idFromName(ACTIVE_GAME_ID);
        try {
          return await env.BINGO_LIVE_STATE.get(id).fetch(request);
        } catch (error) {
          return json({
            error: "Live bingo storage is temporarily unavailable. Please retry shortly.",
            code: "BINGO_STORAGE_UNAVAILABLE",
            storage: { provider: "cloudflare-durable-object", configured: true, available: false, error: error.message },
          }, 503);
        }
      }
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(assetRequest(request, url));
  },
};

async function handleApi(request, env, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/client-config") {
      return json({ ok: true, stateProvider: usesDurableState(env) ? "cloudflare-durable-object" : "supabase", supabase: browserSupabaseConfig(env) });
    }
    if (request.method === "GET" && url.pathname === "/api/storage-status") {
      return json({ ok: true, storage: storageStatus(env) });
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
      if (env.__BINGO_DURABLE_CONTEXT && role === "player") {
        return json({
          ...playerState(state, env), moments,
          activeGame: { id: state.gameId, title: state.title, theme: state.theme, status: "approved", wordCount: moments.length },
          storage: storageStatus(env),
        });
      }
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
      return json({ ok: true, roundIndex: state.roundIndex, deckVersion: state.deckVersion, recoveryId: state.recoveryId || null, cards });
    }

    let state = await loadState(env);
    if (pathname === "/api/start-countdown") {
      state = inheritStorageBase(startOpeningCountdown(), state);
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
      state = inheritStorageBase(freshState(), state);
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
    return json({
      error: error.message || "Request failed",
      ...(error.code ? { code: error.code } : {}),
      ...(error.code === "BINGO_STORAGE_UNAVAILABLE" ? { storage: storageStatus(env) } : {}),
    }, error.status || 500);
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
    ["/murder-mystery/promo", "/murder-mystery/promo.html"],
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
    gameId: ACTIVE_GAME_ID,
    deckVersion: ACTIVE_DECK_VERSION,
    roundPlanVersion: ACTIVE_ROUND_PLAN_VERSION,
    title: ACTIVE_GAME_TITLE,
    theme: ACTIVE_GAME_THEME,
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
  if (env.__BINGO_DURABLE_CONTEXT) return env.__BINGO_DURABLE_CONTEXT.loadState();
  if (allowCached && cachedState && Date.now() - cachedStateLoadedAt < PLAYER_STATE_CACHE_MS) {
    const cached = structuredClone(cachedState);
    stateStorageBases.set(cached, { exists: true, updatedAt: cached.updatedAt });
    return cached;
  }
  const rows = await supabaseRequest(env, `${SUPABASE_STATE_TABLE}?id=eq.${GAME_STATE_ROW_ID}&select=state`);
  storageHealth.available = true;
  storageHealth.lastLoadedAt = Date.now();
  storageHealth.error = null;
  const snapshot = Array.isArray(rows) ? rows[0]?.state : null;
  const state = normalizeState(snapshot);
  stateStorageBases.set(state, { exists: Array.isArray(rows) && rows.length > 0, updatedAt: snapshot?.updatedAt ?? null });
  if (snapshot?.gameId !== ACTIVE_GAME_ID || snapshot?.title !== ACTIVE_GAME_TITLE
      || snapshot?.deckVersion !== ACTIVE_DECK_VERSION
      || snapshot?.roundPlanVersion !== ACTIVE_ROUND_PLAN_VERSION) {
    state.updatedAt = Math.max(Date.now(), (Number(snapshot?.updatedAt) || 0) + 1);
    await saveState(env, state);
  }
  cachedState = structuredClone(state);
  cachedStateLoadedAt = Date.now();
  return state;
}

function normalizeState(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.deck)) return freshState();
  if (snapshot.gameId !== ACTIVE_GAME_ID || snapshot.title !== ACTIVE_GAME_TITLE || snapshot.deckVersion !== ACTIVE_DECK_VERSION) return freshState();
  const state = {
    ...freshState(),
    ...snapshot,
    roundPlanVersion: ACTIVE_ROUND_PLAN_VERSION,
    roundIndex: Math.max(0, Math.min(Number(snapshot.roundIndex) || 0, rounds.length - 1)),
    currentWord: compactMoment(snapshot.currentWord),
    called: compactMoments(snapshot.called),
    deck: compactMoments(snapshot.deck),
    claims: Array.isArray(snapshot.claims) ? snapshot.claims : [],
    autoPullEnabled: snapshot.autoPullEnabled !== false,
    updatedAt: Number(snapshot.updatedAt) || Date.now(),
  };
  if (snapshot.rounds) state.rounds = rounds;
  if (Number(snapshot.roundIndex) >= rounds.length
      || (snapshot.status === "break" && state.roundIndex === rounds.length - 1)) {
    state.status = "ended";
    state.countdownEndsAt = null;
    state.breakEndsAt = null;
    state.playEndsAt = null;
    state.pausedAt = null;
    state.playRemainingMs = null;
    state.nextPullAt = null;
  }
  return state;
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

function inheritStorageBase(nextState, previousState) {
  const base = stateStorageBases.get(previousState);
  if (base) stateStorageBases.set(nextState, base);
  return nextState;
}

function stateConflict() {
  const error = new Error("The live game changed while this action was being saved. Refresh and try again.");
  error.status = 409;
  error.code = "BINGO_STATE_CONFLICT";
  return error;
}

async function saveState(env, state) {
  if (env.__BINGO_DURABLE_CONTEXT) return env.__BINGO_DURABLE_CONTEXT.saveState(state);
  const base = stateStorageBases.get(state);
  if (!base) throw stateConflict();
  touch(state);
  const privatePayload = { id: GAME_STATE_ROW_ID, state, updated_at: new Date().toISOString() };
  let saved;
  if (base.exists) {
    const filters = new URLSearchParams({ id: `eq.${GAME_STATE_ROW_ID}`, "state->>updatedAt": base.updatedAt === null ? "is.null" : `eq.${base.updatedAt}` });
    saved = await supabaseRequest(env, `${SUPABASE_STATE_TABLE}?${filters}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(privatePayload),
    });
  } else {
    saved = await supabaseRequest(env, `${SUPABASE_STATE_TABLE}?on_conflict=id`, {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(privatePayload),
    });
  }
  if (!Array.isArray(saved) || !saved.length) throw stateConflict();
  stateStorageBases.set(state, { exists: true, updatedAt: state.updatedAt });

  const publicPayload = { id: GAME_STATE_ROW_ID, state: playerState(state, env), updated_at: new Date().toISOString() };
  // JSONB comparison is numeric; ->> would compare timestamp text lexically.
  const publicFilters = new URLSearchParams({ id: `eq.${GAME_STATE_ROW_ID}`, or: `(state->updatedAt.lte.${state.updatedAt},state->updatedAt.is.null)` });
  let published = await supabaseRequest(env, `${SUPABASE_PUBLIC_STATE_TABLE}?${publicFilters}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(publicPayload),
  });
  if (!Array.isArray(published) || !published.length) {
    // If a newer public row already exists, ignore the duplicate instead of
    // overwriting it. This also creates the public row on the first setup.
    published = await supabaseRequest(env, `${SUPABASE_PUBLIC_STATE_TABLE}?on_conflict=id`, {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(publicPayload),
    });
  }
  storageHealth.available = true;
  storageHealth.lastSavedAt = Date.now();
  storageHealth.error = null;
  if (Array.isArray(published) && published.length) {
    cachedState = structuredClone(state);
    cachedStateLoadedAt = Date.now();
  }
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
    storage: storageStatus(env),
    health: {
      ok: true,
      joinReady: true,
      deckReady: true,
      currentMomentReady: state.status !== "playing" || Boolean(state.currentWord || state.called.length),
      storageHealthy: storageStatus(env).available,
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
    recoveryId: full.recoveryId || null,
    deckVersion: full.deckVersion,
    roundPlanVersion: full.roundPlanVersion,
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
  if (rounds[roundIndex]?.pattern !== "Blackout") return shuffle(moments);
  const previousTexts = new Set(previousCalled.map((moment) => moment?.text).filter(Boolean));
  return [
    ...shuffle(moments.filter((moment) => !previousTexts.has(moment.text))),
    ...shuffle(moments.filter((moment) => previousTexts.has(moment.text))),
  ];
}

async function createSignedCard(env, state, player, number) {
  const pool = shuffle(moments.map((moment) => moment.text)).slice(0, 24);
  const cells = Array.from({ length: 25 }, (_, index) => (index === 12 ? "FREE" : pool.shift()));
  const payload = { v: 1, gameId: state.gameId, deckVersion: state.deckVersion, recoveryId: state.recoveryId || null, player, roundIndex: state.roundIndex, number, cells };
  return { number, cells, token: await sign(env, payload) };
}

async function validateClaim(env, state, body) {
  if (state.status !== "playing") return { error: "BINGO claims are only accepted during a live round.", status: 409 };
  const player = String(body.player || "Player").slice(0, 40);
  const cardNumber = Number(body.card || 1);
  const cells = Array.isArray(body.cells) && body.cells.length === 25 ? body.cells.map((cell) => String(cell || "").slice(0, 80)) : null;
  const tokenPayload = await verify(env, body.cardToken);
  if (!cells || !tokenPayload) return { error: "Could not verify this bingo card. Refresh your card and try again.", status: 400 };
  if (tokenPayload.gameId !== state.gameId || tokenPayload.deckVersion !== state.deckVersion
      || Number(tokenPayload.recoveryId || 0) !== Number(state.recoveryId || 0)
      || tokenPayload.player !== player || Number(tokenPayload.number) !== cardNumber || JSON.stringify(tokenPayload.cells) !== JSON.stringify(cells)) {
    return { error: "This bingo card does not match the current round. Refresh your card and try again.", status: 409 };
  }
  const cardRoundOk = tokenPayload.roundIndex === state.roundIndex
    || (rounds[state.roundIndex]?.pattern === "Blackout" && tokenPayload.roundIndex === state.roundIndex - 1);
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
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Storage did not respond within 15 seconds"));
      controller.abort();
    }, SUPABASE_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
          ...options,
          signal: controller.signal,
          headers: {
            apikey: config.key,
            Authorization: `Bearer ${config.key}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
        });
        if (!response.ok) throw new Error(`Storage returned HTTP ${response.status}`);
        if (response.status === 204) return null;
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      })(),
      deadline,
    ]);
  } catch (cause) {
    controller.abort();
    const error = new Error(`Live bingo storage is temporarily unavailable. Please retry shortly. ${cause.message || "Storage request failed"}.`);
    error.status = 503;
    error.code = "BINGO_STORAGE_UNAVAILABLE";
    storageHealth.available = false;
    storageHealth.error = error.message;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
    deckVersion: ACTIVE_DECK_VERSION,
    ...(usesDurableState(env) ? { enabled: false, stateProvider: "cloudflare-durable-object" } : {}),
  };
}

function signingSecret(env) {
  return env.BINGO_CARD_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
}

function storageStatus(env = {}) {
  return { ...(env.__BINGO_DURABLE_CONTEXT?.health || storageHealth) };
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
  state.updatedAt = Math.max(Date.now(), (Number(state.updatedAt) || 0) + 1);
  return state;
}

function slugId(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

async function findMomentImage(env, text) {
  const candidate = approvedArtwork.get(text);
  if (!candidate) return { ok: true, approved: false, status: "pending", imageStatus: "pending", url: null, title: text, source: "No approved image for this word" };
  return {
    ok: true, approved: true, status: "approved", imageStatus: "approved",
    url: candidate.imageUrl, title: text, source: "User-approved Spooky Season image",
    sourceUrl: candidate.sourceUrl || "", artist: candidate.artist || "",
    license: candidate.license || "", licenseUrl: candidate.licenseUrl || "", cached: true,
  };
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
