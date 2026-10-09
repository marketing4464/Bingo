const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const read = (filename) => fs.readFileSync(path.join(__dirname, "..", "public", filename), "utf8");
const silkUserAgent = "Mozilla/5.0 (Linux; Android 9; AFTMM) AppleWebKit/537.36 Silk/108.3.3 like Chrome/108.0.5359.220 Safari/537.36";

function eventSurface() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); },
  };
}

function tvFixture({ search = "", userAgent = silkUserAgent, requestFullscreen } = {}) {
  const properties = {};
  const classes = new Set();
  const document = Object.assign(eventSurface(), {
    hidden: false,
    documentElement: {
      classList: { add: (name) => classes.add(name) },
      style: { setProperty: (name, value) => { properties[name] = value; } },
      ...(requestFullscreen ? { requestFullscreen } : {}),
    },
    activeElement: null,
  });
  function control(tagName, left, top) {
    const attributes = {};
    return {
      tagName, tabIndex: 0, disabled: false, style: {}, attributes,
      querySelector: () => null, closest: () => null,
      getClientRects: () => [1],
      getBoundingClientRect: () => ({ left, top, width: 100, height: 48 }),
      setAttribute(name, value) { attributes[name] = value; },
      addEventListener(name, callback) { this[name] = callback; },
      focus() { document.activeElement = this; },
      scrollIntoView() {},
    };
  }
  const fullscreen = control("BUTTON", 0, 0);
  const command = control("BUTTON", 150, 0);
  const below = control("BUTTON", 0, 100);
  const disabled = control("BUTTON", 110, 0);
  disabled.disabled = true;
  const status = { textContent: "" };
  const toolbar = { hidden: true };
  const controls = [fullscreen, command, below, disabled];
  document.querySelector = () => fullscreen;
  document.querySelectorAll = (selector) => {
    if (selector === "[data-tv-controls]") return [toolbar];
    if (selector === "[data-tv-fullscreen]") return [fullscreen];
    if (selector === "[data-tv-screen-status]") return [status];
    if (selector.startsWith("a[target")) return [];
    return controls;
  };
  const navigations = [];
  const window = Object.assign(eventSurface(), {
    innerWidth: 960, innerHeight: 540,
    visualViewport: Object.assign(eventSurface(), { height: 500 }),
    location: { search, origin: "https://www.opebingo.com", assign: (url) => navigations.push(url) },
    open: (url) => navigations.push(url),
  });
  const context = vm.createContext({
    window, document, navigator: { userAgent }, URL, URLSearchParams,
    Event: class { constructor(type) { this.type = type; } },
    getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }),
  });
  vm.runInContext(read("fire-tv.js"), context);
  const key = (key, target = document.activeElement) => {
    const event = { type: "keydown", key, target, prevented: false, preventDefault() { this.prevented = true; } };
    document.dispatchEvent(event);
    return event;
  };
  return { window, document, properties, classes, fullscreen, command, below, status, toolbar, navigations, key };
}

test("TV detection respects explicit overrides and leaves Silk tablets and desktop keyboards alone", () => {
  assert.equal(tvFixture().window.BingoTV.enabled, true);
  assert.equal(tvFixture({ search: "?tv=1", userAgent: "Desktop Chrome" }).window.BingoTV.enabled, true);
  const desktop = tvFixture({ userAgent: "Desktop Chrome" });
  assert.equal(desktop.window.BingoTV.enabled, false);
  assert.equal(desktop.document.listeners.has("keydown"), false);
  assert.equal(tvFixture({ userAgent: "Mozilla/5.0 (Linux; Android 9; KFMAWI) Silk/108 Mobile" }).window.BingoTV.enabled, false);
  assert.equal(tvFixture({ search: "?tv=0" }).window.BingoTV.enabled, false);
});

test("TV fit uses actual available height; unavailable and denied fullscreen remain usable", async () => {
  const f = tvFixture();
  f.document.dispatchEvent({ type: "DOMContentLoaded" });
  assert.equal(f.properties["--tv-height"], "500px");
  assert.equal(f.properties["--tv-safe-x"], "48px");
  assert.equal(f.properties["--tv-safe-y"], "25px");
  assert.equal(f.toolbar.hidden, false);
  assert.equal(f.fullscreen.textContent, "Fit screen");
  await f.fullscreen.click();
  assert.match(f.status.textContent, /Screen fitted/);
  const denied = tvFixture({ requestFullscreen: () => Promise.reject(new Error("Unavailable")) });
  denied.document.dispatchEvent({ type: "DOMContentLoaded" });
  await denied.fullscreen.click();
  assert.match(denied.status.textContent, /Screen fitted/);
});

test("TV arrows skip disabled controls and preserve text editing and browser Back", () => {
  const f = tvFixture();
  f.document.dispatchEvent({ type: "DOMContentLoaded" });
  assert.equal(f.document.activeElement, f.fullscreen);
  assert.equal(f.key("ArrowRight").prevented, true);
  assert.equal(f.document.activeElement, f.command);
  assert.equal(f.key("ArrowLeft").prevented, true);
  assert.equal(f.document.activeElement, f.fullscreen);
  assert.equal(f.key("ArrowDown").prevented, true);
  assert.equal(f.document.activeElement, f.below);
  assert.equal(f.key("ArrowRight", { tagName: "INPUT" }).prevented, false);
  assert.equal(f.key("ArrowRight", { isContentEditable: true }).prevented, false);
  assert.equal(f.key("BrowserBack").prevented, false);
  f.window.BingoTV.openPage("/display");
  assert.equal(f.navigations[0], "https://www.opebingo.com/display?tv=1");
});

function sharedFixture({ fetch, blockedStorage = false } = {}) {
  let nextTimer = 1;
  const timers = new Map();
  const document = Object.assign(eventSurface(), { hidden: false });
  const window = Object.assign(eventSurface(), { location: { pathname: "/display" } });
  const context = vm.createContext({
    localStorage: {
      getItem() { if (blockedStorage) throw new Error("Storage blocked"); return null; },
      setItem() { if (blockedStorage) throw new Error("Storage blocked"); },
    },
    window, document, URL, URLSearchParams, AbortController, console: { warn() {} },
    setTimeout(callback, delay) { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, fetch,
  });
  vm.runInContext(read("shared.js"), context);
  return { context, window, document, timers };
}

const flush = async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); };

test("state subscription recovers on resume, rejects stale pending results, and cleans up its timer", async () => {
  const f = sharedFixture();
  const requests = [];
  f.context.getState = (signal) => new Promise((resolve) => { requests.push({ signal, resolve }); });
  const rendered = [];
  f.context.onState = (state) => rendered.push(state.updatedAt);
  const subscription = vm.runInContext("subscribe(onState)", f.context);
  assert.equal(requests.length, 1);
  f.window.dispatchEvent({ type: "pageshow" });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve({ updatedAt: 20, status: "playing", roundIndex: 0, called: [{ text: "Ghost" }] });
  await flush();
  requests[0].resolve({ updatedAt: 10, status: "setup", roundIndex: 0, called: [] });
  await flush();
  assert.deepEqual(rendered, [20]);
  assert.equal(f.timers.size, 1);
  f.document.hidden = true;
  f.document.dispatchEvent({ type: "visibilitychange" });
  assert.equal(requests.length, 2);
  f.document.hidden = false;
  f.document.dispatchEvent({ type: "visibilitychange" });
  assert.equal(requests.length, 3);
  subscription.close();
  requests[2].resolve({ updatedAt: 21, status: "playing", roundIndex: 0, called: [{ text: "Ghost" }] });
  await flush();
  assert.deepEqual(rendered, [20]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.document.listeners.get("visibilitychange").size, 0);
  assert.equal(f.window.listeners.get("pageshow").size, 0);
});

test("a stalled state fetch has a deadline and storage restrictions do not stop scripts", async () => {
  let requestSignal;
  const f = sharedFixture({
    blockedStorage: true,
    fetch: (_, options) => { requestSignal = options.signal; return new Promise(() => {}); },
  });
  const request = vm.runInContext("getStateFromServer()", f.context);
  const timeout = Array.from(f.timers.values()).find((timer) => timer.delay === 50000);
  assert(timeout);
  timeout.callback();
  await assert.rejects(request, /timed out/);
  assert.equal(requestSignal.aborted, true);
  assert.equal(f.timers.size, 0);
  assert.equal(vm.runInContext('readBingoStorage("test")', f.context), null);
  assert.doesNotThrow(() => vm.runInContext('writeBingoStorage("test", "value")', f.context));
});


test("direct public/config state requests use a 15-second body deadline", async () => {
  const f = sharedFixture({ fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  const request = vm.runInContext('fetchBingoStateJson("/api/client-config")', f.context);
  await flush();
  const timeout = Array.from(f.timers.values()).find((timer) => timer.delay === 15000);
  assert(timeout, "Direct state/config reads allow queued DB responses but remain bounded");
  timeout.callback();
  await assert.rejects(request, /timed out/);
  assert.equal(f.timers.size, 0);
});
