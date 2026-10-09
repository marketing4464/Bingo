const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.join(__dirname, "..", "public");
const shared = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const state = {
  updatedAt: 100, status: "playing", roundIndex: 2,
  deckVersion: "approved-spooky-deck", roundPlanVersion: "three-rounds",
  currentWord: { text: "Ghost" }, called: [{ text: "Ghost" }],
  claims: [{ player: "Fixture Player", points: 100 }],
};
const flush = async () => { for (let index = 0; index < 25; index += 1) await Promise.resolve(); };

function eventSurface(properties = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    dispatch(name) { for (const callback of listeners.get(name) || []) callback(); },
  }, properties);
}

function fixture({ fetch, abortController = true } = {}) {
  let id = 0;
  const timers = new Map();
  const notice = { hidden: true };
  const document = eventSurface({
    hidden: false,
    querySelector: (selector) => selector === "[data-state-connection]" ? notice : null,
  });
  const window = eventSurface({ location: { pathname: "/display" } });
  const rendered = [];
  const context = vm.createContext({
    document, window, URL, URLSearchParams,
    ...(abortController ? { AbortController } : {}),
    localStorage: { getItem: () => null },
    console: { warn() {} }, fetch,
    setTimeout(callback, delay) { const next = ++id; timers.set(next, { callback, delay }); return next; },
    clearTimeout(next) { timers.delete(next); },
    onState: (snapshot) => rendered.push(snapshot),
  });
  vm.runInContext(shared, context);
  const tick = (delay) => {
    const [timerId, timer] = Array.from(timers.entries()).find(([, value]) => value.delay === delay) || [];
    assert(timer, `Expected ${delay}ms timer`);
    timers.delete(timerId);
    timer.callback();
  };
  return { context, notice, document, window, rendered, timers, tick };
}

test("a 503 poll preserves the rendered game and clears its warning on unchanged successful refresh", async () => {
  let requests = 0;
  const f = fixture({ fetch: async (url) => {
    assert.match(url, /^\/api\/state\?role=display$/);
    requests += 1;
    if (requests === 2) return Response.json({ error: "Bingo storage temporarily unavailable" }, { status: 503 });
    return Response.json(state);
  } });
  const subscription = vm.runInContext("subscribe(onState)", f.context);
  await flush();
  assert.equal(f.rendered.length, 1);
  const displayedState = f.rendered[0];
  f.tick(1000);
  await flush();
  assert.equal(f.notice.hidden, false);
  assert.equal(f.rendered.length, 1, "Failure does not publish a reset or replacement snapshot");
  assert.equal(f.rendered[0], displayedState);
  assert.deepEqual(displayedState.claims, state.claims);
  f.tick(1000);
  await flush();
  assert.equal(f.notice.hidden, true, "Connection recovery clears even if updatedAt is unchanged");
  assert.equal(f.rendered.length, 1);
  subscription.close();
  assert.equal(f.timers.size, 0);
});

test("cancelled and superseded failures do not show a connection warning", async () => {
  const f = fixture();
  const requests = [];
  f.context.getState = (signal) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject }));
  const subscription = vm.runInContext("subscribe(onState)", f.context);
  f.window.dispatch("pageshow");
  requests[1].resolve(state);
  await flush();
  requests[0].reject(new Error("Old request failed"));
  await flush();
  assert.equal(f.notice.hidden, true);
  assert.equal(f.rendered.length, 1);
  f.window.dispatch("online");
  subscription.close();
  requests[2].reject(new Error("Closed request failed"));
  await flush();
  assert.equal(f.notice.hidden, true);
});

test("a stalled Silk request without AbortController warns at its deadline and recovers", async () => {
  let requests = 0;
  const f = fixture({
    abortController: false,
    fetch: async () => ++requests === 1 ? new Promise(() => {}) : Response.json(state),
  });
  const subscription = vm.runInContext("subscribe(onState)", f.context);
  f.tick(12000);
  await flush();
  assert.equal(f.notice.hidden, false);
  assert.equal(f.rendered.length, 0);
  f.tick(1000);
  await flush();
  assert.equal(f.notice.hidden, true);
  assert.equal(f.rendered.length, 1);
  subscription.close();
});

test("host, display, and phone expose the same noninteractive accessible connection notice", () => {
  for (const page of ["host.html", "display.html", "play.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /data-state-connection role="status" aria-live="polite" hidden>Connection interrupted — reconnecting<\/div>/);
  }
  const css = fs.readFileSync(path.join(root, "spooky-theme.css"), "utf8");
  assert.match(css, /\.connection-notice\s*\{[^}]*pointer-events:none/s);
  assert.match(css, /\.fire-tv \.connection-notice\s*\{[^}]*--tv-safe-y/s);
});
