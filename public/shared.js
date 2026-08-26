const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const momentImageCache = new Map();
let heartbeatId = localStorage.getItem("bingoHeartbeatId") || "";
let bingoClientRole = inferBingoClientRole();
let supabaseClientConfigPromise = null;

function inferBingoClientRole() {
  const pathname = window.location.pathname;
  if (pathname.includes("display")) return "display";
  if (pathname.includes("host") || pathname === "/" || pathname.endsWith("/host.html")) return "host";
  return "player";
}

function setBingoClientRole(role) {
  bingoClientRole = String(role || "player").toLowerCase();
}

function api(path, body = {}) {
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bingo-Role": bingoClientRole,
    },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}

function getState() {
  if (bingoClientRole === "player") {
    return getPlayerStateFromSupabase().catch((error) => {
      console.warn("Could not refresh bingo state from Supabase; falling back to server.", error);
      return getStateFromServer();
    });
  }
  return getStateFromServer();
}

function getStateFromServer() {
  const params = new URLSearchParams({ role: bingoClientRole });
  return fetch(`/api/state?${params.toString()}`, {
    cache: "no-store",
    headers: { "X-Bingo-Role": bingoClientRole },
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not refresh bingo state");
    return data;
  });
}

async function getPlayerStateFromSupabase() {
  const config = await loadSupabaseClientConfig();
  if (!config?.url || !config?.key || !config?.publicStateTable) throw new Error("Supabase client config is incomplete");
  const params = new URLSearchParams({
    id: "eq.current",
    select: "state",
    limit: "1",
  });
  const response = await fetch(`${config.url}/rest/v1/${config.publicStateTable}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
  });
  const rows = await response.json();
  if (!response.ok) throw new Error(rows?.message || "Could not refresh bingo state from Supabase");
  const state = Array.isArray(rows) ? rows[0]?.state : null;
  if (!state) throw new Error("Supabase bingo state is not ready yet");
  return normalizeRemotePlayerState(state);
}

function loadSupabaseClientConfig() {
  if (!supabaseClientConfigPromise) {
    supabaseClientConfigPromise = fetch("/api/client-config", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load client config");
        return data.supabase;
      });
  }
  return supabaseClientConfigPromise;
}

function normalizeRemotePlayerState(state) {
  const joinUrl = absoluteUrl(state.joinUrl || "/play");
  return {
    ...state,
    joinUrl,
    qrUrl: absoluteUrl(state.qrUrl || joinUrl),
  };
}

function absoluteUrl(value) {
  try {
    return new URL(value, window.location.origin).href;
  } catch {
    return new URL("/play", window.location.origin).href;
  }
}

function subscribe(onState) {
  let stopped = false;
  let lastUpdatedAt = null;
  let lastStableState = null;

  async function poll() {
    if (stopped) return;
    try {
      const state = await getState();
      const stableState = stabilizeLiveState(state, lastStableState);
      if (stableState && stableState.updatedAt !== lastUpdatedAt) {
        lastUpdatedAt = stableState.updatedAt;
        lastStableState = stableState;
        onState(stableState);
      }
    } catch (error) {
      console.warn("Could not refresh bingo state", error);
    } finally {
      if (!stopped) setTimeout(poll, 1000);
    }
  }

  poll();
  return {
    close() {
      stopped = true;
    },
  };
}

function startHeartbeat(role, detailProvider = () => ({})) {
  async function sendHeartbeat() {
    try {
      const detail = detailProvider() || {};
      const response = await api("/api/heartbeat", {
        role,
        id: heartbeatId,
        path: window.location.pathname,
        ...detail,
      });
      if (response.id && response.id !== heartbeatId) {
        heartbeatId = response.id;
        localStorage.setItem("bingoHeartbeatId", heartbeatId);
      }
    } catch (error) {
      console.warn("Could not send bingo heartbeat", error);
    }
  }

  sendHeartbeat();
  return setInterval(sendHeartbeat, 10000);
}

function stabilizeLiveState(state, previous) {
  if (!previous) return state;
  const incomingUpdatedAt = Number(state.updatedAt) || 0;
  const previousUpdatedAt = Number(previous.updatedAt) || 0;
  if (incomingUpdatedAt < previousUpdatedAt) return null;

  const previousRound = Number(previous.roundIndex) || 0;
  const incomingRound = Number(state.roundIndex) || 0;
  if (previous.status !== "ended" && incomingRound < previousRound) return null;
  if ((previous.status === "playing" || previous.status === "break") && state.status === "setup") return null;

  const sameLiveRound = state.status === "playing"
    && previous.status === "playing"
    && state.roundIndex === previous.roundIndex;
  if (sameLiveRound && !(state.called || []).length && (previous.called || []).length) {
    return null;
  }

  return state;
}

function formatClock(ms) {
  if (!ms || ms < 0) return "00:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusLabel(status) {
  if (status === "countdown") return "Countdown to Start";
  if (status === "playing") return "Live Round";
  if (status === "paused") return "Round Paused";
  if (status === "break") return "10-Minute Break";
  if (status === "ended") return "Event Complete";
  return "Ready";
}

function roundRuleLabel(pattern) {
  if (pattern === "Four Corners") return "Any line bingo + Four Corners bonus";
  if (pattern === "X Pattern") return "Any line bingo + X bonus";
  if (pattern === "Blackout") return "Cover-all blackout only";
  return "Any line bingo";
}

function bonusRuleLabel(pattern) {
  if (pattern === "Four Corners") return "Four Corners bonus +50";
  if (pattern === "X Pattern") return "X bingo bonus +200";
  if (pattern === "Blackout") return "Blackout bingo +500";
  return "No bonus pattern";
}

function calledSet(state) {
  return new Set((state.called || []).map((word) => word.text));
}

function renderQrImage(image, value) {
  if (!window.qrcode || !image || !value) return;
  const qr = window.qrcode(0, "M");
  qr.addData(value);
  qr.make();
  image.src = qr.createDataURL(8, 2);
}

async function setMomentImage(image, moment) {
  if (!image) return;
  const key = moment ? `${moment.text}|${moment.category || ""}` : "fallback";
  if (image.dataset.momentKey === key || image.dataset.pendingMomentKey === key) return;
  image.dataset.pendingMomentKey = key;
  image.decoding = "async";
  image.onerror = () => {
    const fallbackUrl = momentImageUrl(null);
    if (image.src !== fallbackUrl) {
      image.src = fallbackUrl;
      image.dataset.source = "fallback";
    }
  };

  if (!moment) {
    await applyMomentImage(image, key, momentImageUrl(null), "fallback", "Disney and Pixar Bingo image");
    return;
  }

  if (!image.getAttribute("src")) image.src = momentImageUrl(moment);

  let nextImage = momentImageCache.get(key);
  try {
    if (!nextImage) {
      const params = new URLSearchParams({
        text: moment.text,
        category: moment.category || "",
      });
      const response = await fetch(`/api/moment-image?${params}`, { cache: "force-cache" });
      const data = await response.json();
      nextImage = data.ok && data.url
        ? { url: data.url, source: data.source || "internet" }
        : { url: momentImageUrl(moment), source: "fallback" };
      momentImageCache.set(key, nextImage);
    }
  } catch (error) {
    nextImage = { url: momentImageUrl(moment), source: "fallback" };
    momentImageCache.set(key, nextImage);
  }

  await applyMomentImage(image, key, nextImage.url, nextImage.source, `${moment.text} image`);
}

function applyMomentImage(image, key, url, source, alt) {
  return preloadImage(url)
    .catch(() => source === "fallback" ? null : preloadImage(momentImageUrl(null)))
    .then((fallbackUrl) => {
      if (image.dataset.pendingMomentKey !== key) return;
      const nextUrl = fallbackUrl || url;
      if (image.src !== nextUrl) image.src = nextUrl;
      image.dataset.momentKey = key;
      image.dataset.source = fallbackUrl ? "fallback" : source;
      image.alt = alt;
      image.removeAttribute("data-pending-moment-key");
    });
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const preview = new Image();
    preview.onload = () => resolve(url);
    preview.onerror = reject;
    preview.src = url;
  });
}

function momentImageUrl(moment) {
  const fallback = { text: "Disney & Pixar Bingo", category: "Story Magic" };
  const item = moment || fallback;
  const palettes = [
    ["#233dff", "#ffd66b", "#070b2d"],
    ["#9b2cff", "#6bd6ff", "#111548"],
    ["#e33b72", "#ffe8a3", "#15103d"],
    ["#16b6c8", "#ff8a4c", "#061735"],
    ["#f4b83f", "#ff6f91", "#17113b"],
    ["#475cff", "#9ee7c5", "#09143a"],
  ];
  const hash = [...item.text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const [primary, accent, background] = palettes[hash % palettes.length];
  const shape = ["star", "castle", "sparkle", "screen", "ticket", "badge"][hash % 6];
  const category = escapeSvg(item.category || "Disney & Pixar");
  const initials = escapeSvg(item.text.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "!");
  const art = shapeSvg(shape, primary, accent);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.22"/>
        </filter>
        <pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="3" fill="${primary}" opacity="0.14"/>
        </pattern>
      </defs>
      <rect width="1200" height="760" rx="34" fill="${background}"/>
      <rect width="1200" height="760" fill="url(#dots)"/>
      <circle cx="1015" cy="120" r="150" fill="${accent}" opacity="0.34"/>
      <circle cx="155" cy="645" r="190" fill="${primary}" opacity="0.14"/>
      <rect x="48" y="48" width="1104" height="664" rx="30" fill="none" stroke="${accent}" stroke-width="10" opacity="0.9"/>
      <g filter="url(#shadow)">${art}</g>
      <circle cx="600" cy="315" r="118" fill="#ffffff" opacity="0.88"/>
      <text x="600" y="350" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="108" fill="#141414">${initials}</text>
      <rect x="305" y="560" width="590" height="82" rx="41" fill="#050505" opacity="0.94"/>
      <text x="600" y="614" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="${accent}" letter-spacing="4">${category.toUpperCase()}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function shapeSvg(shape, primary, accent) {
  if (shape === "castle") {
    return `<path d="M290 610 h620 v-260 l-70 -38 v-92 h-86 v46 l-70 -38 v-92 h-96 v92 l-70 38 v-46 h-86 v92 l-70 38z" fill="${primary}"/><path d="M355 610 v-170 h100 v170 M550 610 v-210 h100 v210 M745 610 v-170 h100 v170" fill="${accent}" opacity="0.9"/><path d="M430 220 l45 -90 l45 90 M565 136 l70 -105 l70 105 M780 220 l45 -90 l45 90" fill="${accent}"/>`;
  }
  if (shape === "badge") {
    return `<path d="M600 92 l105 118 l156 18 l-78 137 l31 153 l-151 -32 l-137 78 l-15 -156 l-116 -104 l142 -65z" fill="${primary}"/><circle cx="600" cy="330" r="150" fill="${accent}" opacity="0.9"/><circle cx="600" cy="330" r="78" fill="${primary}" opacity="0.92"/>`;
  }
  if (shape === "bolt") {
    return `<polygon points="590,95 405,385 555,385 500,665 790,300 625,310 700,95" fill="${primary}"/><polygon points="625,145 505,340 640,335 600,520 725,285 590,295" fill="${accent}" opacity="0.88"/>`;
  }
  if (shape === "record") {
    return `<circle cx="600" cy="315" r="210" fill="${primary}"/><circle cx="600" cy="315" r="122" fill="${backgroundSafe(accent)}" opacity="0.96"/><circle cx="600" cy="315" r="42" fill="${primary}"/><path d="M800 445 L945 590" stroke="${accent}" stroke-width="38" stroke-linecap="round"/>`;
  }
  if (shape === "screen") {
    return `<rect x="330" y="115" width="540" height="335" rx="28" fill="${primary}"/><rect x="374" y="160" width="452" height="235" rx="18" fill="${accent}" opacity="0.9"/><rect x="535" y="450" width="130" height="70" fill="${primary}"/><rect x="455" y="515" width="290" height="34" rx="17" fill="${primary}"/>`;
  }
  if (shape === "ticket") {
    return `<path d="M310 205 h580 a60 60 0 0 0 0 120 a60 60 0 0 0 0 120 h-580 a60 60 0 0 0 0-120 a60 60 0 0 0 0-120z" fill="${primary}"/><path d="M430 250 h340 M430 325 h340 M430 400 h340" stroke="${accent}" stroke-width="28" stroke-linecap="round"/>`;
  }
  if (shape === "sparkle") {
    return `<path d="M600 80 L675 275 L880 350 L675 425 L600 640 L525 425 L320 350 L525 275 Z" fill="${primary}"/><path d="M860 135 L895 225 L990 260 L895 295 L860 390 L825 295 L730 260 L825 225 Z" fill="${accent}"/>`;
  }
  return `<path d="M600 80 L665 255 L850 260 L705 375 L755 555 L600 450 L445 555 L495 375 L350 260 L535 255 Z" fill="${primary}"/><circle cx="600" cy="345" r="105" fill="${accent}" opacity="0.9"/>`;
}

function backgroundSafe(color) {
  return color === "#ffffff" ? "#fff9ef" : color;
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}
