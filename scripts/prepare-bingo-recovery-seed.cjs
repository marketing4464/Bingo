const fs = require("node:fs");
const path = require("node:path");

// The recovery snapshot contains player records and stays local. A fresh
// checkout can bundle a null seed; an empty Durable Object then fails closed.
function prepareRecoverySeed(seedPath = path.join(__dirname, "../data/recovery-seed.json")) {
  fs.mkdirSync(path.dirname(seedPath), { recursive: true });
  try {
    fs.writeFileSync(seedPath, "null\n", { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

if (require.main === module) prepareRecoverySeed();
module.exports = { prepareRecoverySeed };
