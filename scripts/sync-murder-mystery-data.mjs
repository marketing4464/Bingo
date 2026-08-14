import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(process.env.MURDER_MYSTERY_SOURCE || path.join(projectRoot, "..", "ope-murder-mystery"));
const require = createRequire(import.meta.url);
const { game } = require(path.join(sourceRoot, "server.js"));

if (!game?.title || !Array.isArray(game.stations)) {
  throw new Error(`Could not load the murder mystery game definition from ${sourceRoot}`);
}

const outputPath = path.join(projectRoot, "murder-mystery-data.js");
const output = `// Generated from ope-murder-mystery/server.js by scripts/sync-murder-mystery-data.mjs.\nexport const mysteryGame = ${JSON.stringify(game, null, 2)};\n`;
fs.writeFileSync(outputPath, output);
console.log(outputPath);
