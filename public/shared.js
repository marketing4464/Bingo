const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
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
  if (!state.deckVersion || (config.deckVersion && state.deckVersion !== config.deckVersion)) {
    throw new Error("Supabase bingo state is waiting for the current deck");
  }
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
      if (stableState && (stableState.updatedAt !== lastUpdatedAt || stableState.deckVersion !== lastStableState?.deckVersion || stableState.roundPlanVersion !== lastStableState?.roundPlanVersion)) {
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
  if ((state.deckVersion && state.deckVersion !== previous.deckVersion)
    || (state.roundPlanVersion && state.roundPlanVersion !== previous.roundPlanVersion)) {
    return state;
  }
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
  const key = moment ? `${moment.text}|${moment.category || ""}` : "idle";
  const panel = image.parentElement;
  let note = panel.querySelector(".artwork-pending");
  if (!note) { note = document.createElement("div"); note.className = "artwork-pending"; panel.prepend(note); }
  let credit = panel.querySelector(".artwork-credit");
  if (!credit) { credit = document.createElement("div"); credit.className = "artwork-credit"; (panel.querySelector(".moment-copy") || panel).append(credit); }
  function holdArtwork() {
    image.hidden = true; image.removeAttribute("src"); credit.hidden = true;
    image.dataset.source = "unavailable"; note.hidden = false;
    note.textContent = moment ? "Artwork unavailable" : "Spooky Season Bingo";
  }
  if (image.dataset.momentKey !== key) { image.dataset.momentKey = key; holdArtwork(); }
  if (!moment || image.dataset.loadingKey === key) return;
  image.dataset.loadingKey = key;
  try {
    const params = new URLSearchParams({text: moment.text, category: moment.category || ""});
    const response = await fetch(`/api/moment-image?${params}`, {cache:"no-store"});
    const data = await response.json();
    if (image.dataset.momentKey !== key) return;
    if (!data.ok || !data.url || data.approved !== true) { holdArtwork(); return; }
    if (image.getAttribute("src") !== data.url) {
      const loaded = await preloadImage(data.url);
      if (image.dataset.momentKey !== key) return;
      image.src = loaded;
    }
    image.hidden = false; image.alt = `${moment.text} approved image`; image.dataset.source = "approved"; note.hidden = true;
    const label = [data.artist, data.license].filter(Boolean).join(" · ") || "Approved artwork";
    credit.textContent = "";
    if (data.sourceUrl && /^https?:\/\//.test(data.sourceUrl)) {
      const link = document.createElement("a"); link.href = data.sourceUrl; link.target = "_blank"; link.rel = "noopener"; link.textContent = label; credit.append(link);
    } else { credit.textContent = label; }
    credit.hidden = false;
    image.onerror = () => { holdArtwork(); note.textContent = "Approved artwork unavailable"; };
  } catch { if (image.dataset.momentKey === key) holdArtwork(); }
  finally { if (image.dataset.loadingKey === key) delete image.dataset.loadingKey; }
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const preview = new Image();
    preview.onload = () => resolve(url);
    preview.onerror = reject;
    preview.src = url;
  });
}
