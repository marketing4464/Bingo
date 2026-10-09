const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const shared = fs.readFileSync(path.join(__dirname, "..", "public", "shared.js"), "utf8");

test("host, display, and players read worker state without contacting cached Supabase config", async () => {
  const requests = [];
  const state = { status: "playing", roundIndex: 2, updatedAt: 100, recoveryId: null, called: [{ text: "Ghost" }] };
  const context = vm.createContext({
    window: { location: { pathname: "/play" } },
    localStorage: { getItem: () => null },
    URL, URLSearchParams, AbortController,
    setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options) => {
      assert.match(url, /^\/api\/state\?role=(host|display|player)$/);
      requests.push({ url, options });
      return Response.json(state);
    },
  });
  vm.runInContext(shared, context);
  vm.runInContext(`
    supabaseClientConfigPromise = Promise.resolve({url:'https://stale-supabase.fixture.invalid', key:'fixture', publicStateTable:'public_state'});
    getPlayerStateFromSupabase = () => { throw new Error('Direct Supabase polling must not run'); };
    loadSupabaseClientConfig = () => { throw new Error('Worker state does not depend on client config'); };
  `, context);
  for (const role of ["host", "display", "player"]) {
    context.role = role;
    vm.runInContext("setBingoClientRole(role)", context);
    const snapshot = await vm.runInContext("getState()", context);
    assert.deepEqual(snapshot, state);
    const request = requests.at(-1);
    assert.equal(request.url, `/api/state?role=${role}`);
    assert.equal(request.options.cache, "no-store");
    assert.equal(request.options.headers["X-Bingo-Role"], role);
  }
  assert.equal(requests.length, 3);
});
