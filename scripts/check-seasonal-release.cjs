const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const seasonal = require("../seasonal-deck.js");
const release = require("../data/spooky-season-release.json");
const decisions = require("../data/image-review-decisions.json").decisions;
const deck = seasonal.approvedDeck();
assert.equal(seasonal.deckVersion(deck), release.deckVersion, "Release version must match the approved word deck.");
const publicRoot = path.resolve(__dirname, "../public");
for (const item of deck) {
  const file = path.resolve(publicRoot, item.approvedImageUrl.slice(1));
  assert.ok(file.startsWith(publicRoot + path.sep));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), decisions[item.id].sha256, item.word);
}
console.log(`Spooky Season release verified: ${deck.length} approved words and images.`);
