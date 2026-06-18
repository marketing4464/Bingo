const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const GOOGLE_IMAGE_MANIFEST_PATH = path.join(PUBLIC_DIR, "assets", "google-image-manifest.json");
const PULL_INTERVAL_MS = 30 * 1000;
const BREAK_MS = 10 * 60 * 1000;
const PREGAME_COUNTDOWN_MS = 15 * 60 * 1000;
const GAME_STATE_ROW_ID = "current";
const SUPABASE_STATE_TABLE = "on_par_bingo_state";
const DEFAULT_SUPABASE_URL = "https://tmnstuthbllnoqgepotn.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G74TdOYv0R0AML1WZTfxJQ_YZqJa7jE";
const PUBLIC_JOIN_URL = publicJoinUrlFromEnv();
const imageCache = new Map();
let googleImageManifest = loadGoogleImageManifest();
let storageHydrationPromise = null;
let storageHydrated = false;
let storageSaveTimer = null;
let storageStatus = {
  provider: "supabase",
  configured: isSupabaseConfigured(),
  available: false,
  lastLoadedAt: null,
  lastSavedAt: null,
  error: null,
};

const moments = [
  { text: "Barbie", category: "Movies" },
  { text: "Kenough", category: "Movies" },
  { text: "Mamma Mia", category: "Movies" },
  { text: "Top Gun", category: "Movies" },
  { text: "Maverick", category: "Movies" },
  { text: "Titanic", category: "Movies" },
  { text: "Mean Girls", category: "Movies" },
  { text: "The Notebook", category: "Movies" },
  { text: "Clueless", category: "Movies" },
  { text: "Legally Blonde", category: "Movies" },
  { text: "Wakanda", category: "Movies" },
  { text: "Avengers", category: "Movies" },
  { text: "Spider-Man", category: "Movies" },
  { text: "Star Wars", category: "Movies" },
  { text: "Jurassic Park", category: "Movies" },
  { text: "Shrek", category: "Movies" },
  { text: "Austin Powers", category: "Movies" },
  { text: "Men in Black", category: "Movies" },
  { text: "Scream", category: "Movies" },
  { text: "Beetlejuice", category: "Movies" },
  { text: "Wicked", category: "Movies" },
  { text: "Wednesday", category: "TV" },
  { text: "Friends", category: "TV" },
  { text: "The Rachel", category: "TV" },
  { text: "Fresh Prince", category: "TV" },
  { text: "Seinfeld", category: "TV" },
  { text: "The Office", category: "TV" },
  { text: "Dunder Mifflin", category: "TV" },
  { text: "Yellowstone", category: "TV" },
  { text: "Stranger Things", category: "TV" },
  { text: "The Upside Down", category: "TV" },
  { text: "Game of Thrones", category: "TV" },
  { text: "Winter Is Coming", category: "TV" },
  { text: "Golden Girls", category: "TV" },
  { text: "Saved by Bell", category: "TV" },
  { text: "Full House", category: "TV" },
  { text: "Family Matters", category: "TV" },
  { text: "Urkel", category: "TV" },
  { text: "SpongeBob", category: "TV" },
  { text: "Bikini Bottom", category: "TV" },
  { text: "The Simpsons", category: "TV" },
  { text: "Real Housewives", category: "TV" },
  { text: "Jersey Shore", category: "TV" },
  { text: "Love Island", category: "TV" },
  { text: "Survivor", category: "TV" },
  { text: "Hot Ones", category: "TV" },
  { text: "Oprah", category: "TV" },
  { text: "Carpool Karaoke", category: "TV" },
  { text: "Dancing Queen", category: "Music" },
  { text: "Single Ladies", category: "Music" },
  { text: "Cowboy Carter", category: "Music" },
  { text: "Pink Pony Club", category: "Music" },
  { text: "Espresso", category: "Music" },
  { text: "Bad Bunny", category: "Music" },
  { text: "Uptown Funk", category: "Music" },
  { text: "Thriller", category: "Music" },
  { text: "Purple Rain", category: "Music" },
  { text: "Material Girl", category: "Music" },
  { text: "Oops", category: "Music" },
  { text: "Bye Bye Bye", category: "Music" },
  { text: "No Scrubs", category: "Music" },
  { text: "Waterfalls", category: "Music" },
  { text: "Hey Ya", category: "Music" },
  { text: "Hollaback Girl", category: "Music" },
  { text: "Old Town Road", category: "Music" },
  { text: "Margaritaville", category: "Music" },
  { text: "Yacht Rock", category: "Music" },
  { text: "Disco Ball", category: "Music" },
  { text: "Moonwalk", category: "Music" },
  { text: "Super Bowl", category: "Sports" },
  { text: "World Cup", category: "Sports" },
  { text: "Olympics", category: "Sports" },
  { text: "March Madness", category: "Sports" },
  { text: "Space Jam", category: "Sports" },
  { text: "The Last Dance", category: "Sports" },
  { text: "Halftime Show", category: "Sports" },
  { text: "Red Carpet", category: "Celebrity" },
  { text: "Met Gala", category: "Celebrity" },
  { text: "Denim Duo", category: "Celebrity" },
  { text: "Left Shark", category: "Celebrity" },
  { text: "Royal Wedding", category: "Celebrity" },
  { text: "You Get a Car", category: "Celebrity" },
  { text: "Kenergy", category: "Celebrity" },
  { text: "Main Character", category: "Internet" },
  { text: "It Girl", category: "Internet" },
  { text: "Viral Dance", category: "Internet" },
  { text: "TikTok", category: "Internet" },
  { text: "Instagram", category: "Internet" },
  { text: "Meme Queen", category: "Internet" },
  { text: "Girl Dinner", category: "Internet" },
  { text: "Brat Summer", category: "Internet" },
  { text: "Very Demure", category: "Internet" },
  { text: "Y2K", category: "Style" },
  { text: "Bucket Hat", category: "Style" },
  { text: "Tracksuit", category: "Style" },
  { text: "Platform Shoes", category: "Style" },
  { text: "Friendship Bracelets", category: "Style" },
  { text: "Aviators", category: "Style" },
  { text: "Pink Carpet", category: "Style" },
  { text: "Slime Time", category: "Throwback" },
  { text: "Beanie Babies", category: "Throwback" },
  { text: "Blockbuster", category: "Throwback" },
  { text: "TRL", category: "Throwback" },
  { text: "MTV", category: "Throwback" },
  { text: "Nickelodeon", category: "Throwback" },
  { text: "TGIF", category: "Throwback" },
  { text: "VHS", category: "Throwback" },
  { text: "Fanny Pack", category: "Throwback" },
  { text: "Baby Yoda", category: "TV" },
  { text: "Kardashians", category: "Celebrity" },
  { text: "Taylor Swift", category: "Music" },
  { text: "Eras Tour", category: "Music" },
  { text: "Beyonce", category: "Music" },
  { text: "Lady Gaga", category: "Celebrity" },
  { text: "Rihanna", category: "Music" },
  { text: "Usher", category: "Music" },
  { text: "Billie Eilish", category: "Music" },
  { text: "Harry Potter", category: "Movies" },
  { text: "Lord of the Rings", category: "Movies" },
  { text: "The Matrix", category: "Movies" },
  { text: "Breaking Bad", category: "TV" },
  { text: "Grey's Anatomy", category: "TV" },
  { text: "Bridgerton", category: "TV" },
  { text: "Ted Lasso", category: "TV" },
  { text: "Schitt's Creek", category: "TV" },
  { text: "Euphoria", category: "TV" },
  { text: "Ghostbusters", category: "Movies" },
  { text: "Grease", category: "Movies" },
  { text: "Rocky", category: "Movies" },
  { text: "The Dress", category: "Internet" },
  { text: "Salt Bae", category: "Internet" },
  { text: "Oscars Slap", category: "Celebrity" },
  { text: "Wordle", category: "Internet" },
  { text: "Netflix and Chill", category: "Internet" },
  { text: "Stanley Cup", category: "Internet" },
  { text: "Coachella", category: "Music" },
  { text: "Roman Empire", category: "Internet" },
  { text: "Girl Math", category: "Internet" },
];

const rounds = [
  { name: "Red Carpet Warm-Up", pattern: "Any Line", playMinutes: 15 },
  { name: "TV & Movie Icons", pattern: "Four Corners", playMinutes: 15 },
  { name: "Music Video Moments", pattern: "X Pattern", playMinutes: 15 },
  { name: "Viral Finale", pattern: "Blackout", playMinutes: 15 },
];

const clients = new Set();

let state = freshState();

function freshState() {
  return {
    title: "Pop Culture Moments Bingo",
    venue: "On Par Entertainment",
    roundIndex: 0,
    status: "setup",
    currentWord: null,
    called: [],
    deck: shuffle(moments),
    claims: [],
    countdownEndsAt: null,
    breakEndsAt: null,
    playEndsAt: null,
    nextPullAt: null,
    updatedAt: Date.now(),
  };
}

function publicState(req) {
  const round = rounds[state.roundIndex] || rounds[rounds.length - 1];
  const origin = getOrigin(req);
  const joinUrl = joinUrlForOrigin(origin);
  return {
    ...state,
    round,
    rounds,
    moments,
    joinUrl,
    qrUrl: joinUrl,
    autoPullEverySeconds: PULL_INTERVAL_MS / 1000,
    pregameCountdownSeconds: PREGAME_COUNTDOWN_MS / 1000,
    leaderboard: leaderboardFromClaims(),
    latestClaim: state.claims[0] || null,
    storage: publicStorageStatus(),
    serverTime: Date.now(),
  };
}

function shuffle(items) {
  const copy = items.map((item) => ({ ...item }));
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function markUpdated() {
  state.updatedAt = Date.now();
  broadcast();
  scheduleStorageSave();
}

async function commitState() {
  markUpdated();
  await flushStateToStorage();
}

function supabaseConfig() {
  return {
    url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, ""),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || process.env.SUPABASE_ANON_KEY
      || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

function isSupabaseConfigured() {
  const config = supabaseConfig();
  return Boolean(config.url && config.key);
}

function publicStorageStatus() {
  return {
    provider: storageStatus.provider,
    configured: storageStatus.configured,
    available: storageStatus.available,
    lastLoadedAt: storageStatus.lastLoadedAt,
    lastSavedAt: storageStatus.lastSavedAt,
    error: storageStatus.error ? "Supabase storage unavailable" : null,
  };
}

async function hydrateStateFromStorage({ force = false } = {}) {
  if (!force && storageHydrated) return;
  if (!force && storageHydrationPromise) return storageHydrationPromise;
  if (force) {
    storageHydrationPromise = null;
    storageHydrated = false;
  }
  storageHydrationPromise = (async () => {
    storageStatus.configured = isSupabaseConfigured();
    if (!storageStatus.configured) {
      storageHydrated = true;
      return;
    }
    try {
      const rows = await supabaseRequest(
        `${SUPABASE_STATE_TABLE}?id=eq.${encodeURIComponent(GAME_STATE_ROW_ID)}&select=state`,
      );
      const snapshot = Array.isArray(rows) ? rows[0]?.state : null;
      if (isValidStateSnapshot(snapshot)) {
        state = {
          ...freshState(),
          ...snapshot,
          updatedAt: Number(snapshot.updatedAt) || Date.now(),
        };
        storageStatus.lastLoadedAt = Date.now();
      }
      storageStatus.available = true;
      storageStatus.error = null;
    } catch (error) {
      storageStatus.available = false;
      storageStatus.error = error.message || "Could not load Supabase state";
      console.warn("Supabase state load skipped:", storageStatus.error);
    } finally {
      storageHydrated = true;
      storageHydrationPromise = null;
    }
  })();
  return storageHydrationPromise;
}

function isValidStateSnapshot(snapshot) {
  return Boolean(snapshot && typeof snapshot === "object" && typeof snapshot.status === "string" && Array.isArray(snapshot.deck));
}

function scheduleStorageSave() {
  if (!isSupabaseConfigured()) return;
  clearTimeout(storageSaveTimer);
  storageSaveTimer = setTimeout(() => {
    saveStateToStorage().catch((error) => {
      storageStatus.available = false;
      storageStatus.error = error.message || "Could not save Supabase state";
      console.warn("Supabase state save skipped:", storageStatus.error);
    });
  }, 250);
}

async function flushStateToStorage() {
  if (!isSupabaseConfigured()) return;
  clearTimeout(storageSaveTimer);
  storageSaveTimer = null;
  try {
    await saveStateToStorage();
  } catch (error) {
    storageStatus.available = false;
    storageStatus.error = error.message || "Could not save Supabase state";
    console.warn("Supabase state save skipped:", storageStatus.error);
  }
}

async function saveStateToStorage() {
  await supabaseRequest(`${SUPABASE_STATE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: GAME_STATE_ROW_ID,
      state,
      updated_at: new Date().toISOString(),
    }),
  });
  storageStatus.configured = true;
  storageStatus.available = true;
  storageStatus.lastSavedAt = Date.now();
  storageStatus.error = null;
}

async function supabaseRequest(pathname, options = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.key) throw new Error("Supabase is not configured");
  const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail || response.statusText}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function leaderboardFromClaims() {
  const scores = new Map();
  for (const claim of state.claims) {
    const current = scores.get(claim.player) || { player: claim.player, points: 0, bingos: 0 };
    current.points += claim.points || 100;
    current.bingos += claim.bingoCount || 1;
    scores.set(claim.player, current);
  }
  return [...scores.values()].sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

function pointsForBingo(bingo, pattern) {
  if (bingo.id === "coverup" || bingo.id === "blackout") return pattern === "Blackout" ? 150 : 50;
  if (bingo.id === "four-corners" || bingo.id === "x-pattern") return 50;
  return 100;
}

function drawNextMoment({ resetTimer = true } = {}) {
  if (state.status !== "playing") return false;
  if (!state.deck.length) {
    state.deck = shuffle(moments.filter((moment) => !state.called.some((word) => word.text === moment.text)));
  }
  const next = state.deck.shift();
  if (!next) {
    state.nextPullAt = null;
    return false;
  }
  state.currentWord = next;
  state.called.unshift(next);
  state.nextPullAt = resetTimer ? Date.now() + PULL_INTERVAL_MS : state.nextPullAt;
  return true;
}

function startCurrentRound({ resetClaims = false } = {}) {
  const round = rounds[state.roundIndex] || rounds[rounds.length - 1];
  state.status = "playing";
  state.currentWord = null;
  state.called = [];
  state.deck = shuffle(moments);
  if (resetClaims) state.claims = [];
  state.countdownEndsAt = null;
  state.breakEndsAt = null;
  state.playEndsAt = Date.now() + round.playMinutes * 60 * 1000;
  state.nextPullAt = Date.now() + PULL_INTERVAL_MS;
  drawNextMoment({ resetTimer: true });
}

function startOpeningCountdown() {
  state.roundIndex = 0;
  state.status = "countdown";
  state.currentWord = null;
  state.called = [];
  state.deck = shuffle(moments);
  state.claims = [];
  state.countdownEndsAt = Date.now() + PREGAME_COUNTDOWN_MS;
  state.breakEndsAt = null;
  state.playEndsAt = null;
  state.nextPullAt = null;
}

function startBreakOrEndEvent() {
  state.currentWord = null;
  state.countdownEndsAt = null;
  state.playEndsAt = null;
  state.nextPullAt = null;
  if (state.roundIndex >= rounds.length - 1) {
    state.status = "ended";
    state.breakEndsAt = null;
    return;
  }
  state.status = "break";
  state.breakEndsAt = Date.now() + BREAK_MS;
}

function startNextRound() {
  if (state.roundIndex >= rounds.length - 1) {
    startBreakOrEndEvent();
    return;
  }
  state.roundIndex += 1;
  startCurrentRound();
}

function advanceState() {
  const now = Date.now();
  if (state.status === "countdown" && state.countdownEndsAt && now >= state.countdownEndsAt) {
    startCurrentRound({ resetClaims: true });
    markUpdated();
    return true;
  }
  if (state.status === "playing" && state.playEndsAt && now >= state.playEndsAt) {
    startBreakOrEndEvent();
    markUpdated();
    return true;
  }
  if (state.status === "break" && state.breakEndsAt && now >= state.breakEndsAt) {
    startNextRound();
    markUpdated();
    return true;
  }
  if (state.status === "playing" && state.nextPullAt && now >= state.nextPullAt && drawNextMoment()) {
    markUpdated();
    return true;
  }
  return false;
}

function startStateTimer() {
  return setInterval(() => {
    advanceState();
  }, 500);
}

function broadcast() {
  const data = `data: ${JSON.stringify({ type: "state", updatedAt: state.updatedAt })}\n\n`;
  for (const res of clients) res.write(data);
}

function getLocalIp() {
  for (const network of Object.values(os.networkInterfaces())) {
    for (const address of network || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "localhost";
}

function getOrigin(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return `http://${getLocalIp()}:${PORT}`;
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function publicJoinUrlFromEnv() {
  const explicitUrl = process.env.PUBLIC_JOIN_URL || process.env.NEXT_PUBLIC_JOIN_URL;
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}/play`;
  }
  return "";
}

function joinUrlForOrigin(origin) {
  return PUBLIC_JOIN_URL || `${origin}/play`;
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function imageSearchQuery(text, category) {
  const overrides = {
    "Barbie": "Barbie 2023 film",
    "Kenough": "Kenough Barbie",
    "Mamma Mia": "Mamma Mia film",
    "Top Gun": "Top Gun film",
    "Maverick": "Top Gun Maverick film",
    "The Notebook": "The Notebook film",
    "Mean Girls": "Mean Girls film",
    "Legally Blonde": "Legally Blonde film",
    "Star Wars": "Star Wars film",
    "Jurassic Park": "Jurassic Park film",
    "Men in Black": "Men in Black film",
    "Austin Powers": "Austin Powers film",
    "The Office": "The Office (American TV series)",
    "The Rachel": "The Rachel haircut Friends",
    "Fresh Prince": "The Fresh Prince of Bel-Air",
    "Saved by Bell": "Saved by the Bell",
    "Game of Thrones": "Game of Thrones TV series",
    "Winter Is Coming": "Winter Is Coming Game of Thrones",
    "The Upside Down": "Upside Down Stranger Things",
    "Real Housewives": "The Real Housewives",
    "Jersey Shore": "Jersey Shore TV series",
    "Love Island": "Love Island TV series",
    "Hot Ones": "Hot Ones",
    "Carpool Karaoke": "Carpool Karaoke",
    "Dancing Queen": "Dancing Queen ABBA",
    "Single Ladies": "Single Ladies Beyoncé",
    "Cowboy Carter": "Cowboy Carter Beyoncé",
    "Pink Pony Club": "Pink Pony Club Chappell Roan",
    "Espresso": "Espresso Sabrina Carpenter song",
    "Bad Bunny": "Bad Bunny musician",
    "Uptown Funk": "Uptown Funk",
    "Thriller": "Thriller Michael Jackson",
    "Purple Rain": "Purple Rain Prince",
    "Material Girl": "Material Girl Madonna",
    "Oops": "Oops I Did It Again",
    "Bye Bye Bye": "Bye Bye Bye NSYNC",
    "No Scrubs": "No Scrubs TLC",
    "Waterfalls": "Waterfalls TLC song",
    "Hey Ya": "Hey Ya Outkast",
    "Hollaback Girl": "Hollaback Girl Gwen Stefani",
    "Old Town Road": "Old Town Road",
    "Margaritaville": "Margaritaville Jimmy Buffett",
    "Yacht Rock": "Yacht rock",
    "Super Bowl": "Super Bowl halftime show",
    "World Cup": "FIFA World Cup",
    "March Madness": "NCAA March Madness",
    "The Last Dance": "The Last Dance documentary",
    "Halftime Show": "Super Bowl halftime show",
    "Denim Duo": "Britney Spears Justin Timberlake denim",
    "Left Shark": "Left Shark",
    "Royal Wedding": "wedding of Prince Harry and Meghan Markle",
    "You Get a Car": "Oprah You get a car",
    "Kenergy": "Barbie Ken Kenergy",
    "Main Character": "main character syndrome",
    "It Girl": "It girl fashion icon",
    "Meme Queen": "internet meme",
    "Viral Dance": "viral dance TikTok",
    "Girl Dinner": "girl dinner meme",
    "Brat Summer": "Brat summer Charli XCX",
    "Very Demure": "very demure meme",
    "Slime Time": "Nickelodeon slime",
    "Beanie Babies": "Beanie Babies",
    "Blockbuster": "Blockbuster LLC",
    "TRL": "Total Request Live",
  };

  if (overrides[text]) return ["Internet", "Celebrity", "Style", "Throwback"].includes(category)
    ? `pop culture moment ${overrides[text]}`
    : overrides[text];
  if (category === "Movies") return `${text} film`;
  if (category === "TV") return `${text} TV series`;
  if (category === "Music") return `${text} song`;
  if (category === "Internet") return `pop culture moment ${text} meme`;
  return `pop culture moment ${text}`;
}

async function findMomentImage(text, category) {
  const key = `${text}|${category || ""}`;
  if (imageCache.has(key)) return imageCache.get(key);

  const query = imageSearchQuery(text, category);
  const manifestItem = googleImageManifest[text];
  if (manifestItem?.image) {
    const result = {
      ok: true,
      url: manifestItem.image,
      title: manifestItem.alt || text,
      query: manifestItem.query || query,
      source: "Google Images",
      width: manifestItem.width,
      height: manifestItem.height,
      qualityScore: manifestItem.qualityScore,
      cached: true,
    };
    imageCache.set(key, result);
    return result;
  }

  try {
    const googleResult = await googleImageSearch(query);
    if (googleResult) {
      const result = { ...googleResult, query, source: "Google Images" };
      imageCache.set(key, result);
      return result;
    }

    const result = {
      ok: false,
      query,
      source: "Google Images",
      error: "No usable Google Images result returned.",
    };
    imageCache.set(key, result);
    return result;
  } catch (error) {
    const result = { ok: false, query, source: "Google Images", error: error.message };
    imageCache.set(key, result);
    return result;
  }
}

function loadGoogleImageManifest() {
  try {
    return require("./public/assets/google-image-manifest.json");
  } catch {
    // Fall through to filesystem loading for the standalone local server.
  }
  try {
    return JSON.parse(fs.readFileSync(GOOGLE_IMAGE_MANIFEST_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function googleImageSearch(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_CX || process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (apiKey && searchEngineId) {
    const params = new URLSearchParams({
      key: apiKey,
      cx: searchEngineId,
      searchType: "image",
      num: "1",
      safe: "active",
      q: query,
    });
    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (response.ok) {
      const data = await response.json();
      const item = data.items?.[0];
      if (item?.link) return { ok: true, url: item.link, title: item.title || query };
    }
  }

  const params = new URLSearchParams({ tbm: "isch", q: query, safe: "active", hl: "en" });
  const response = await fetch(`https://www.google.com/search?${params}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) return null;
  const html = await response.text();
  const candidates = [...html.matchAll(/https?:\/\/[^"'<>\\ ]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'<>\\ ]*)?/gi)]
    .map((match) => match[0].replaceAll("\\u003d", "=").replaceAll("\\u0026", "&"))
    .filter((url) => !/google|gstatic|logo|favicon|sprite/i.test(url));
  return candidates[0] ? { ok: true, url: candidates[0], title: query } : null;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function routeStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/host.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".mp4": "video/mp4",
    };
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

async function routeApi(req, res, pathname) {
  await hydrateStateFromStorage({ force: true });
  if (advanceState()) await flushStateToStorage();
  if (req.method === "GET" && pathname === "/api/state") {
    sendJson(res, publicState(req));
    return;
  }

  if (req.method === "GET" && pathname === "/api/storage-status") {
    sendJson(res, { ok: true, storage: publicStorageStatus() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/moment-image") {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const text = String(url.searchParams.get("text") || "").slice(0, 80);
    const category = String(url.searchParams.get("category") || "").slice(0, 40);
    if (!text) {
      sendJson(res, { ok: false, error: "Missing text" }, 400);
      return;
    }
    sendJson(res, await findMomentImage(text, category));
    return;
  }

  if (req.method === "GET" && pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(`data: ${JSON.stringify({ type: "connected", updatedAt: state.updatedAt })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, { error: "Not found" }, 404);
    return;
  }

  let body = {};
  try {
    body = await parseBody(req);
  } catch (error) {
    sendJson(res, { error: "Invalid JSON" }, 400);
    return;
  }

  if (pathname === "/api/start-round") {
    startCurrentRound({ resetClaims: state.roundIndex === 0 && state.status !== "break" });
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/start-countdown") {
    if (state.status === "playing" || state.status === "break") {
      sendJson(res, { error: "Reset the event before starting a new countdown." }, 409);
      return;
    }
    startOpeningCountdown();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/skip-countdown") {
    if (state.status !== "countdown") {
      sendJson(res, { error: "There is no opening countdown to skip." }, 409);
      return;
    }
    startCurrentRound({ resetClaims: true });
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/pull") {
    if (state.status !== "playing") {
      sendJson(res, { error: "Start the round before pulling words." }, 409);
      return;
    }
    if (!drawNextMoment({ resetTimer: true })) {
      sendJson(res, { error: "No more words available." }, 409);
      return;
    }
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/start-break") {
    startBreakOrEndEvent();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/next-round") {
    startNextRound();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/reset") {
    state = freshState();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/claim") {
    if (state.status !== "playing") {
      sendJson(res, { error: "BINGO claims are only accepted during a live round." }, 409);
      return;
    }
    const calledWords = new Set(state.called.map((word) => word.text));
    const rawBingos = Array.isArray(body.bingos) && body.bingos.length ? body.bingos.slice(0, 12) : [];
    const invalidWords = [];
    const bingos = rawBingos.map((bingo) => {
      const words = Array.isArray(bingo.words) ? bingo.words.map((word) => String(word || "").slice(0, 80)) : [];
      for (const word of words) {
        if (word !== "FREE" && !calledWords.has(word)) invalidWords.push(word);
      }
      const id = String(bingo.id || "bingo").slice(0, 80);
      return {
        id,
        label: String(bingo.label || "BINGO").slice(0, 80),
        words,
        points: pointsForBingo({ id }, rounds[state.roundIndex].pattern),
      };
    });
    if (!bingos.length) {
      sendJson(res, { error: "No BINGO pattern was submitted." }, 400);
      return;
    }
    if (invalidWords.length) {
      sendJson(res, {
        error: `False BINGO: these words have not been pulled yet: ${[...new Set(invalidWords)].join(", ")}`,
        invalidWords: [...new Set(invalidWords)],
      }, 409);
      return;
    }
    const bingoCount = bingos.length;
    const points = bingos.reduce((sum, bingo) => sum + bingo.points, 0);
    const claim = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      player: String(body.player || "Player").slice(0, 40),
      card: Number(body.card || 1),
      bingos,
      bingoCount,
      points,
      pattern: rounds[state.roundIndex].pattern,
      round: rounds[state.roundIndex].name,
      createdAt: Date.now(),
    };
    state.claims.unshift(claim);
    state.claims = state.claims.slice(0, 200);
    await commitState();
    sendJson(res, { ok: true, claim });
    return;
  }

  sendJson(res, { error: "Not found" }, 404);
}

function webJson(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function webOrigin(request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return `${url.protocol}//${host}`;
  }
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

function publicStateForOrigin(origin) {
  const round = rounds[state.roundIndex] || rounds[rounds.length - 1];
  return {
    ...state,
    round,
    rounds,
    moments,
    joinUrl: joinUrlForOrigin(origin),
    qrUrl: joinUrlForOrigin(origin),
    autoPullEverySeconds: PULL_INTERVAL_MS / 1000,
    pregameCountdownSeconds: PREGAME_COUNTDOWN_MS / 1000,
    leaderboard: leaderboardFromClaims(),
    latestClaim: state.claims[0] || null,
    storage: publicStorageStatus(),
    serverTime: Date.now(),
  };
}

async function handleApiWebRequest(request, pathname) {
  await hydrateStateFromStorage({ force: true });
  if (advanceState()) await flushStateToStorage();
  const method = request.method;
  const origin = webOrigin(request);
  const requestUrl = new URL(request.url);

  if (method === "GET" && pathname === "/api/state") {
    return webJson(publicStateForOrigin(origin));
  }

  if (method === "GET" && pathname === "/api/moment-image") {
    const text = String(requestUrl.searchParams.get("text") || "").slice(0, 80);
    const category = String(requestUrl.searchParams.get("category") || "").slice(0, 40);
    if (!text) return webJson({ ok: false, error: "Missing text" }, 400);
    return webJson(await findMomentImage(text, category));
  }

  if (method === "GET" && pathname === "/api/storage-status") {
    return webJson({ ok: true, storage: publicStorageStatus() });
  }

  if (method !== "POST") {
    return webJson({ error: "Not found" }, 404);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (pathname === "/api/start-round") {
    startCurrentRound({ resetClaims: state.roundIndex === 0 && state.status !== "break" });
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/start-countdown") {
    if (state.status === "playing" || state.status === "break") {
      return webJson({ error: "Reset the event before starting a new countdown." }, 409);
    }
    startOpeningCountdown();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/skip-countdown") {
    if (state.status !== "countdown") {
      return webJson({ error: "There is no opening countdown to skip." }, 409);
    }
    startCurrentRound({ resetClaims: true });
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/pull") {
    if (state.status !== "playing") {
      return webJson({ error: "Start the round before pulling words." }, 409);
    }
    if (!drawNextMoment({ resetTimer: true })) {
      return webJson({ error: "No more words available." }, 409);
    }
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/start-break") {
    startBreakOrEndEvent();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/next-round") {
    startNextRound();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/reset") {
    state = freshState();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/claim") {
    if (state.status !== "playing") {
      return webJson({ error: "BINGO claims are only accepted during a live round." }, 409);
    }
    const calledWords = new Set(state.called.map((word) => word.text));
    const rawBingos = Array.isArray(body.bingos) && body.bingos.length ? body.bingos.slice(0, 12) : [];
    const invalidWords = [];
    const bingos = rawBingos.map((bingo) => {
      const words = Array.isArray(bingo.words) ? bingo.words.map((word) => String(word || "").slice(0, 80)) : [];
      for (const word of words) {
        if (word !== "FREE" && !calledWords.has(word)) invalidWords.push(word);
      }
      const id = String(bingo.id || "bingo").slice(0, 80);
      return {
        id,
        label: String(bingo.label || "BINGO").slice(0, 80),
        words,
        points: pointsForBingo({ id }, rounds[state.roundIndex].pattern),
      };
    });
    if (!bingos.length) return webJson({ error: "No BINGO pattern was submitted." }, 400);
    if (invalidWords.length) {
      return webJson({
        error: `False BINGO: these words have not been pulled yet: ${[...new Set(invalidWords)].join(", ")}`,
        invalidWords: [...new Set(invalidWords)],
      }, 409);
    }
    const bingoCount = bingos.length;
    const points = bingos.reduce((sum, bingo) => sum + bingo.points, 0);
    const claim = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      player: String(body.player || "Player").slice(0, 40),
      card: Number(body.card || 1),
      bingos,
      bingoCount,
      points,
      pattern: rounds[state.roundIndex].pattern,
      round: rounds[state.roundIndex].name,
      createdAt: Date.now(),
    };
    state.claims.unshift(claim);
    state.claims = state.claims.slice(0, 200);
    await commitState();
    return webJson({ ok: true, claim });
  }

  return webJson({ error: "Not found" }, 404);
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/host") {
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }
  if (url.pathname === "/display") {
    routeStatic(req, res, "/display.html");
    return;
  }
  if (url.pathname === "/play") {
    routeStatic(req, res, "/play.html");
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname === "/events") {
    routeApi(req, res, url.pathname).catch((error) => {
      console.error(error);
      sendJson(res, { error: "Server error" }, 500);
    });
    return;
  }
  routeStatic(req, res, url.pathname);
}

module.exports = handleRequest;
module.exports.handleApiWebRequest = handleApiWebRequest;

if (require.main === module) {
  const server = http.createServer(handleRequest);
  startStateTimer();
  server.listen(PORT, "0.0.0.0", () => {
    const local = `http://localhost:${PORT}`;
    const network = `http://${getLocalIp()}:${PORT}`;
    console.log(`On Par Pop Culture Bingo is running:`);
    console.log(`Host:    ${local}`);
    console.log(`Display: ${local}/display`);
    console.log(`Players: ${network}/play`);
  });
}
