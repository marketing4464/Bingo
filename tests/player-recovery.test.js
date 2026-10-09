const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function element(hidden = false) {
  const classes = new Set(hidden ? ["hidden"] : []);
  return {
    value: "1", textContent: "", innerHTML: "",
    classList: { contains: (name) => classes.has(name), add: (name) => classes.add(name), remove: (name) => classes.delete(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
    addEventListener() {},
  };
}
const cells = (word) => Array.from({ length: 25 }, (_, index) => index === 12 ? "FREE" : word);
const live = { deckVersion: "approved-deck", recoveryId: 1000, roundIndex: 2, status: "playing", round: { name: "Round 3", pattern: "X Pattern" }, called: [{ text: "Ghost" }] };
const recovered = { ...live, recoveryId: 2000, roundIndex: 1, status: "break", round: { name: "Round 2", pattern: "Four Corners" } };

function fixture() {
  const elements = new Map();
  const storage = new Map();
  const context = vm.createContext({
    $: (selector) => {
      if (["#bingoHorn", "#joinSound"].includes(selector)) return null;
      if (!elements.has(selector)) elements.set(selector, element(selector === "#gamePanel"));
      return elements.get(selector);
    }, $$: () => [],
    document: { addEventListener() {} }, console,
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    setBingoClientRole() {}, startHeartbeat: () => 1, setTimeout: () => 1, clearInterval() {},
    subscribe: (callback) => { context.onState = callback; },
    statusLabel: (status) => status, roundRuleLabel: (pattern) => pattern,
    calledSet: (state) => new Set((state.called || []).map((word) => word.text)),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "play.js"), "utf8"), context);
  storage.set("onParBingoPlayerSession", JSON.stringify({
    player: "Fixture Player", roundIndex: 2, deckVersion: "approved-deck", recoveryId: 1000,
    cards: [{ number: 1, cells: cells("Ghost"), token: "before-recovery", selected: [0, 12], claimedBingos: ["row-1"] }],
  }));
  return { context, elements, storage };
}

test("a recovered break renders immediately, discards old Round 3 cards, and persists fresh recovery-bound cards", async () => {
  const f = fixture();
  let requests = 0;
  f.context.api = async () => { requests += 1; throw new Error("Unexpected initial deal"); };
  await f.context.onState(live);
  assert.equal(requests, 0, "Valid cards in the same recovery generation remain intact");
  assert.equal(vm.runInContext("cards[0].selected.has(0)", f.context), true);
  let finishDeal;
  f.context.api = () => new Promise((resolve) => { requests += 1; finishDeal = resolve; });
  const recoveryRender = f.context.onState(recovered);
  assert.match(f.elements.get("#playerMeta").textContent, /break/);
  assert.equal(vm.runInContext("cards.length", f.context), 0, "Old cards disappear before the rollback round guard");
  finishDeal({ roundIndex: 1, deckVersion: "approved-deck", recoveryId: 2000, cards: [{ number: 1, cells: cells("Pumpkin"), token: "recovered-break-card" }] });
  await recoveryRender;
  assert.equal(vm.runInContext("currentCardRoundIndex", f.context), 1);
  assert.equal(vm.runInContext("currentCardRecoveryId", f.context), 2000);
  assert.equal(vm.runInContext("cards[0].selected.size", f.context), 1);
  assert.equal(vm.runInContext("cards[0].claimedBingos.size", f.context), 0);
  const saved = JSON.parse(f.storage.get("onParBingoPlayerSession"));
  assert.equal(saved.recoveryId, 2000);
  assert.equal(saved.cards[0].token, "recovered-break-card");
  f.context.api = async () => ({ roundIndex: 2, deckVersion: "approved-deck", recoveryId: 2000, cards: [{ number: 1, cells: cells("Witch"), token: "fresh-round-three" }] });
  await f.context.onState({ ...live, recoveryId: 2000 });
  assert.equal(vm.runInContext("cards[0].token", f.context), "fresh-round-three");
  assert.equal(vm.runInContext("currentCardRoundIndex", f.context), 2);
});

test("restoring saved older-generation Round 3 cards during the break deals fresh cards", async () => {
  const f = fixture();
  f.context.api = async () => ({ roundIndex: 1, deckVersion: "approved-deck", recoveryId: 2000, cards: [{ number: 1, cells: cells("Pumpkin"), token: "recovered-session" }] });
  await f.context.onState(recovered);
  assert.equal(vm.runInContext("cards[0].token", f.context), "recovered-session");
  assert.equal(f.elements.get("#gamePanel").classList.contains("hidden"), false);
  assert.match(f.elements.get("#playerMeta").textContent, /break/);
});

test("late card deals from an older recovery generation cannot replace current cards", async () => {
  const f = fixture();
  f.context.api = async () => ({ roundIndex: 1, deckVersion: "approved-deck", recoveryId: 2000, cards: [{ number: 1, cells: cells("Pumpkin"), token: "recovered-session" }] });
  await f.context.onState(recovered);
  f.context.api = async () => ({ roundIndex: 2, deckVersion: "approved-deck", recoveryId: 1000, cards: [{ number: 1, cells: cells("Ghost"), token: "late-old-token" }] });
  await assert.rejects(vm.runInContext("dealCards(1)", f.context), /event was restored/);
  assert.equal(vm.runInContext("cards[0].token", f.context), "recovered-session");
});
