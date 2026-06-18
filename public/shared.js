const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const momentImageCache = new Map();
let heartbeatId = localStorage.getItem("bingoHeartbeatId") || "";

function api(path, body = {}) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}

function getState() {
  return fetch("/api/state", { cache: "no-store" }).then((response) => response.json());
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
  if (status === "break") return "10-Minute Break";
  if (status === "ended") return "Event Complete";
  return "Ready";
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
    await applyMomentImage(image, key, momentImageUrl(null), "fallback", "Pop Culture Moments Bingo image");
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
  const fallback = { text: "Pop Culture Moments Bingo", category: "Bingo" };
  const item = moment || fallback;
  const palettes = [
    ["#050505", "#0b3d2e", "#151515"],
    ["#101010", "#123f2d", "#0d1712"],
    ["#020202", "#ffffff", "#111111"],
    ["#171717", "#00d084", "#0e1712"],
    ["#111111", "#1f6f52", "#0d1712"],
    ["#181818", "#0b3d2e", "#08120d"],
  ];
  const hash = [...item.text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const [primary, accent, background] = palettes[hash % palettes.length];
  const shape = ["star", "bolt", "record", "screen", "ticket", "sparkle"][hash % 6];
  const category = escapeSvg(item.category || "Pop Culture");
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
