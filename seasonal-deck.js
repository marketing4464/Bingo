const crypto = require("node:crypto");

const GAME_ID = "spooky-season-bingo";
const EXPECTED_COUNT = 80;

function approvedDeck() {
  const document = require("./data/spooky-season-deck.json");
  const manifestDocument = require("./public/assets/spooky-season/image-candidates.json");
  const reviewDocument = require("./data/image-review-decisions.json");
  const rows = Array.isArray(document) ? document : document.items || document.wordDeck || [];
  const manifest = Array.isArray(manifestDocument) ? manifestDocument : manifestDocument.items || [];
  const decisions = reviewDocument.decisions || {};
  if (rows.length !== EXPECTED_COUNT || new Set(rows.map((item) => item.id)).size !== EXPECTED_COUNT
      || new Set(rows.map((item) => String(item.word).toLowerCase())).size !== EXPECTED_COUNT) {
    throw new Error("Spooky Season requires 80 distinct approved words.");
  }
  return rows.map((row) => {
    const word = String(row.word || row.text || "").trim();
    const decision = decisions[row.id];
    const item = manifest.find((entry) => entry.id === row.id && entry.word === word);
    const image = item?.candidates?.find((candidate) => candidate.id === decision?.candidateId
      && candidate.imageUrl === decision?.approvedImageUrl
      && (!candidate.sha256 || candidate.sha256 === decision?.sha256));
    if (!word || decision?.decision !== "approved" || decision.word !== word || !image
        || !image.imageUrl.startsWith("/assets/spooky-season/")) {
      throw new Error(`Spooky Season artwork is not approved for ${word || row.id}.`);
    }
    return {
      id: String(row.id), word,
      description: String(row.category || row.description || "Spooky Season"),
      filmYear: row.filmYear || null,
      imageStatus: "approved",
      approvedImageUrl: image.imageUrl,
      imageSourceUrl: image.sourceUrl || "",
      imageArtist: image.artist || "",
      imageLicense: image.license || "",
      imageLicenseUrl: image.licenseUrl || "",
      notes: decision.note || "",
      imageRecommendations: [{ ...image, sourceName: "User-approved seasonal image", status: "approved" }],
    };
  });
}

function deckVersion(deck = approvedDeck()) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(deck.map(({ id, word }) => ({ id, word }))))
    .digest("hex");
}

function game(roundSettings) {
  const wordDeck = approvedDeck();
  return {
    id: GAME_ID,
    title: "Spooky Season Bingo",
    theme: "Halloween, Horror Films, and Fall",
    status: "approved",
    roundSettings,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    deckVersion: deckVersion(wordDeck),
    wordDeck,
  };
}

module.exports = { GAME_ID, approvedDeck, deckVersion, game };
