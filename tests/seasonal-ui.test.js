const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", "public", file), "utf8");
const previous = {
  deckVersion: "approved-seasonal-deck",
  roundPlanVersion: "spooky-season-four-rounds-v1",
  roundIndex: 3,
  status: "playing",
  updatedAt: 100,
  called: [{ text: "Ghost" }],
};
const migrated = {
  ...previous,
  roundPlanVersion: "spooky-season-three-rounds-v1",
  roundIndex: 2,
  status: "ended",
  updatedAt: 101,
};

function sharedContext() {
  const context = vm.createContext({
    localStorage: { getItem: () => null },
    window: { location: { pathname: "/display" } },
    URL, URLSearchParams, console,
  });
  vm.runInContext(read("shared.js"), context);
  context.previous = previous;
  context.migrated = migrated;
  return context;
}

test("client accepts obsolete fourth-round migration before the monotonic round guard", () => {
  const context = sharedContext();
  assert.equal(vm.runInContext("stabilizeLiveState(migrated, previous)", context), migrated);
  assert.equal(vm.runInContext("stabilizeLiveState({...previous, roundIndex: 2, updatedAt: 101}, previous)", context), null,
    "Round regressions remain blocked without a plan change");
  assert.equal(vm.runInContext("stabilizeLiveState({...previous, updatedAt: 99}, previous)", context), null,
    "Old snapshots of the same plan remain blocked");
});

test("display clears held countdown and artwork when the round plan changes", () => {
  const context = vm.createContext({
    previous, migrated, Date,
    $: () => ({}),
    setBingoClientRole() {}, startHeartbeat() {}, subscribe() {},
    setInterval: () => 1,
    window: { addEventListener() {} },
  });
  vm.runInContext(read("display.js"), context);
  vm.runInContext(`
    displayState = previous;
    heldCountdownState = {...previous, status:"countdown", countdownEndsAt:Date.now()+900000};
    lastDisplayedMoment = {text:"Ghost"};
  `, context);
  assert.equal(vm.runInContext("stableDisplayState(migrated)", context), migrated);
  assert.equal(vm.runInContext("heldCountdownState", context), null);
  assert.equal(vm.runInContext("lastDisplayedMoment", context), null);
});
