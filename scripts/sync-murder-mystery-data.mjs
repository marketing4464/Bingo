import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(process.env.MURDER_MYSTERY_SOURCE || path.join(projectRoot, "..", "ope-murder-mystery"));
const sourcePublic = path.join(sourceRoot, "public");
const targetPublic = path.join(projectRoot, "public", "murder-mystery");
const basePath = "/murder-mystery";
const require = createRequire(import.meta.url);
const { game } = require(path.join(sourceRoot, "server.js"));

const textFiles = [
  "app.js",
  "display.html",
  "display.js",
  "host.html",
  "host.js",
  "index.html",
  "intro.html",
  "printable-module.html",
  "promo.html",
  "qrcode-generator.js",
  "station-kit.html",
  "station-kit.js",
  "station.html",
  "station.js",
  "styles.css",
];

const assetPaths = [
  "assets/case-board.svg",
  "assets/location-map.svg",
  "assets/downloads/ope-murder-mystery-printable-module.pdf",
  "assets/halloween",
  "assets/intro",
  "assets/on-par",
  "assets/on-par-scenes-halloween",
  "assets/stations-live",
  "assets/videos",
];

const hostingStyles = `

/* Shared On Par game navigation used by the combined Cloudflare site. */
.host-links {
  min-width: 0;
  flex-direction: column;
  align-items: flex-end;
}

.host-tools,
.mystery-app-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.host-tools {
  max-width: 740px;
}

.mystery-app-switcher {
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.24);
}

.mystery-app-switcher a {
  min-height: 40px;
  border-radius: 0;
  color: var(--ink);
  background: transparent;
  padding: 10px 13px;
  box-shadow: none;
}

.mystery-app-switcher a + a {
  border-left: 1px solid var(--line);
}

.mystery-app-switcher a.active {
  color: var(--button-ink);
  background: var(--gold);
}

@media (max-width: 760px) {
  .host-links {
    width: 100%;
    align-items: stretch;
    justify-content: stretch;
  }

  .host-tools,
  .mystery-app-switcher {
    width: 100%;
    max-width: none;
  }

  .mystery-app-switcher a {
    flex: 1 1 0;
    width: auto;
    text-align: center;
  }

  .host-tools a {
    width: 100%;
  }
}
`;

if (!game?.title || !Array.isArray(game.stations)) {
  throw new Error(`Could not load the murder mystery game definition from ${sourceRoot}`);
}

if (!fs.existsSync(sourcePublic)) {
  throw new Error(`Could not find the murder mystery public directory at ${sourcePublic}`);
}

fs.mkdirSync(targetPublic, { recursive: true });

for (const file of textFiles) {
  const sourcePath = path.join(sourcePublic, file);
  const targetPath = path.join(targetPublic, file);
  let contents = fs.readFileSync(sourcePath, "utf8");

  if (file.endsWith(".html")) contents = transformHtml(file, contents);
  if (file.endsWith(".js") && file !== "qrcode-generator.js") contents = transformJavaScript(file, contents);
  if (file === "styles.css") contents += hostingStyles;

  fs.writeFileSync(targetPath, contents);
}

for (const relativePath of assetPaths) {
  const sourcePath = path.join(sourcePublic, relativePath);
  const targetPath = path.join(targetPublic, relativePath);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing mystery asset: ${sourcePath}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.statSync(sourcePath).isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

const outputPath = path.join(projectRoot, "murder-mystery-data.js");
const output = `// Generated from ope-murder-mystery/server.js by scripts/sync-murder-mystery-data.mjs.\nexport const mysteryGame = ${JSON.stringify(game, null, 2)};\n`;
fs.writeFileSync(outputPath, output);

console.log(`Synced ${textFiles.length} game files and ${assetPaths.length} asset groups from ${sourceRoot}`);
console.log(outputPath);

function transformHtml(file, contents) {
  let transformed = contents.replace(/((?:href|src|poster)=")\/(?!murder-mystery(?:\/|"))/g, `$1${basePath}/`);

  if (file === "host.html") {
    const navigation = `        <nav class="host-links">
          <div class="mystery-app-switcher" role="group" aria-label="On Par game apps">
            <a href="/host">Bingo</a>
            <a href="/trivia">Trivia</a>
            <a class="active" href="${basePath}/host" aria-current="page">Murder Mystery</a>
          </div>
          <div class="host-tools">
            <a href="${basePath}/intro" target="_blank">Opening Video</a>
            <a href="${basePath}/promo" target="_blank">Promo Video</a>
            <a href="${basePath}/display" target="_blank">Open Display</a>
            <a href="${basePath}" target="_blank">Open Player View</a>
            <a href="${basePath}/station-kit" target="_blank">QR Station Kit</a>
            <a href="${basePath}/module" target="_blank">Printable Module</a>
            <a href="${basePath}/assets/downloads/ope-murder-mystery-printable-module.pdf" target="_blank">Download PDF</a>
          </div>
        </nav>`;
    transformed = transformed.replace(/        <nav class="host-links">[\s\S]*?        <\/nav>/, navigation);
  }

  return transformed;
}

function transformJavaScript(file, contents) {
  const declaration = `const OPE_MYSTERY_BASE = "${basePath}";\n\n`;

  if (file === "app.js" || file === "host.js" || file === "station.js") {
    contents = contents.replace("fetch(path, options)", "fetch(`${OPE_MYSTERY_BASE}${path}`, options)");
  }

  if (file === "display.js") {
    contents = contents
      .replace('fetch("/api/state")', "fetch(`${OPE_MYSTERY_BASE}/api/state`)")
      .replace('`${location.origin}/`', "`${location.origin}${OPE_MYSTERY_BASE}`");
  }

  if (file === "host.js") {
    contents = contents
      .replace('`${location.origin}/`', "`${location.origin}${OPE_MYSTERY_BASE}`")
      .replace("`/station/${encodeURIComponent(station.id)}`", "`${OPE_MYSTERY_BASE}/station/${encodeURIComponent(station.id)}`");
  }

  if (file === "station-kit.js") {
    contents = contents
      .replace('fetch("/api/stations")', "fetch(`${OPE_MYSTERY_BASE}/api/stations`)")
      .replace('src="/assets/on-par/on-par-logo-white.png"', 'src="${OPE_MYSTERY_BASE}/assets/on-par/on-par-logo-white.png"');
  }

  return declaration + contents;
}
