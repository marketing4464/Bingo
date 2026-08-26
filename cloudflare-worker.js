const GAME_STATE_ROW_ID = "current";
const SUPABASE_STATE_TABLE = "on_par_bingo_state";
const SUPABASE_PUBLIC_STATE_TABLE = "on_par_bingo_public_state";
const DEFAULT_SUPABASE_URL = "https://tmnstuthbllnoqgepotn.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G74TdOYv0R0AML1WZTfxJQ_YZqJa7jE";
const PULL_INTERVAL_MS = 20 * 1000;
const PREGAME_COUNTDOWN_MS = 15 * 60 * 1000;
const BREAK_MS = 10 * 60 * 1000;
const PLAYER_STATE_CACHE_MS = 1000;
const TRIVIA_CONTROL_ROOM_URL = "https://on-par-themed-trivia.vercel.app/host";

let cachedState = null;
let cachedStateLoadedAt = 0;
let cachedImageManifest = null;

const HYPE_MESSAGES = [
  "make some noise - prizes for the loudest table",
];

const ACTIVE_GAME_ID = "disney-pixar-bingo";
const ACTIVE_GAME_TITLE = "Disney & Pixar Bingo";
const ACTIVE_GAME_THEME = "Disney and Pixar";

const moments = [
  ["Mickey Mouse", "Classic Disney"], ["Minnie Mouse", "Classic Disney"], ["Donald Duck", "Classic Disney"],
  ["Goofy", "Classic Disney"], ["Pluto", "Classic Disney"], ["Cinderella", "Princesses"],
  ["Snow White", "Princesses"], ["Aurora", "Princesses"], ["Ariel", "Princesses"], ["Belle", "Princesses"],
  ["Jasmine", "Princesses"], ["Mulan", "Princesses"], ["Tiana", "Princesses"], ["Rapunzel", "Princesses"],
  ["Moana", "Princesses"], ["Elsa", "Frozen"], ["Anna", "Frozen"], ["Olaf", "Frozen"], ["Let It Go", "Frozen"],
  ["Arendelle", "Frozen"], ["Simba", "The Lion King"], ["Nala", "The Lion King"],
  ["Timon and Pumbaa", "The Lion King"], ["Hakuna Matata", "The Lion King"], ["Pride Rock", "The Lion King"],
  ["Aladdin", "Aladdin"], ["Genie", "Aladdin"], ["Magic Carpet", "Aladdin"],
  ["A Whole New World", "Aladdin"], ["Agrabah", "Aladdin"], ["Toy Story", "Pixar"], ["Woody", "Pixar"],
  ["Buzz Lightyear", "Pixar"], ["Jessie", "Pixar"], ["Pizza Planet", "Pixar"], ["Finding Nemo", "Pixar"],
  ["Dory", "Pixar"], ["Crush", "Pixar"], ["P. Sherman 42 Wallaby Way", "Pixar"],
  ["Just Keep Swimming", "Pixar"], ["Monsters Inc.", "Pixar"], ["Mike Wazowski", "Pixar"], ["Sulley", "Pixar"],
  ["Boo", "Pixar"], ["The Door Vault", "Pixar"], ["The Incredibles", "Pixar"], ["Mr. Incredible", "Pixar"],
  ["Elastigirl", "Pixar"], ["Edna Mode", "Pixar"], ["No Capes", "Pixar"], ["Cars", "Pixar"],
  ["Lightning McQueen", "Pixar"], ["Mater", "Pixar"], ["Radiator Springs", "Pixar"], ["Ka-chow", "Pixar"],
  ["Up", "Pixar"], ["Carl and Ellie", "Pixar"], ["Russell", "Pixar"], ["Dug", "Pixar"],
  ["Adventure Is Out There", "Pixar"], ["Inside Out", "Pixar"], ["Joy", "Pixar"], ["Sadness", "Pixar"],
  ["Bing Bong", "Pixar"], ["Memory Orbs", "Pixar"], ["Coco", "Pixar"], ["Miguel", "Pixar"],
  ["Remember Me", "Pixar"], ["Encanto", "Disney Animation"], ["Mirabel", "Disney Animation"],
  ["Bruno", "Disney Animation"], ["WALL-E", "Pixar"], ["EVE", "Pixar"], ["Ratatouille", "Pixar"],
  ["Remy", "Pixar"], ["Stitch", "Disney Animation"], ["Baymax", "Disney Animation"],
  ["Judy Hopps", "Disney Animation"], ["Luca", "Pixar"], ["Merida", "Pixar"],
].map(([text, category]) => ({ id: slugId(text), text, category }));

const approvedImages = {
  "Mickey Mouse": "https://i.pinimg.com/736x/09/80/8e/09808e4311feb715ad8e8e4901dbebfc.jpg",
  "Minnie Mouse": "https://pngpix.com/images/hd/minnie-mouse-classic-pose-thibbgxrt14d7jcx.jpg",
  "Donald Duck": "https://freepngimg.com/thumb/donald_duck/30768-4-donald-duck-transparent.png",
  Goofy: "https://img.soutalomma.com/ArticleImgs/2018/1/24/79763-%D8%AC%D9%88%D9%81%D9%89.jpg",
  Pluto: "https://pngimg.com/uploads/pluto_disney/pluto_disney_PNG13.png",
  Cinderella: "https://www.freeshows.ru/i/rz/800/img20260105_007_jpg.jpg",
  "Snow White": "https://multiki-kartinki.narod.ru/belosnezhka/Snow-White18.jpg",
  Aurora: "https://www.youloveit.ru/uploads/gallery/main/617/youloveit_ru_disney_aurora04.jpg",
  Ariel: "https://assets.teenvogue.com/photos/5dcf159f9be4970008285039/master/pass/00-promo-little-mermaid.jpg",
  Belle: "https://lumiere-a.akamaihd.net/v1/images/gallery_princess_belle_2_f4a938c0.jpeg?width=1136",
  Jasmine: "https://www.pngall.com/wp-content/uploads/11/Princess-Jasmine-PNG-HD-Image.png",
  Mulan: "https://resource4.sodonsolution.org/undesniishuudan/image/2019/11/22/etg57dx9h3npqshf/1716995-mulan.jpg",
  Tiana: "https://ovicio.com.br/wp-content/uploads/2024/06/20240606-princess-tiana-disney-817x1024.webp",
  Rapunzel: "https://vignette.wikia.nocookie.net/frozen/images/3/3b/Rapunzel_1.png/revision/latest?cb=20180309165401&path-prefix=es",
  Moana: "https://images.squarespace-cdn.com/content/v1/608d9ef497633c6b6eb71caf/1620390733441-KY11R5EZV7TIT6DLL59G/ojegpbifz.jpg",
  Elsa: "https://1.bp.blogspot.com/-BdpIp5Hf0Ug/UrhPJhMlWJI/AAAAAAAAGlM/Tz1woA0HspA/s1600/elsaimag.jpg",
  Anna: "https://sev.h-cdn.co/assets/16/11/1024x1024/square-1458227475-frozen-anna-hd-images.jpg",
  Olaf: "https://lumiere-a.akamaihd.net/v1/images/191a0ea89f78d30cbc7acc07cb17d996372458c6.jpeg",
  "Let It Go": "https://awsimages.detik.net.id/customthumb/2015/09/18/228/letitgodlm.jpg?q=90&w=600",
  Arendelle: "https://m.media-amazon.com/images/M/MV5BYzllMjA1MDQtZmFjNC00NzA5LWI0NDEtY2MwM2NhNjMwZjc0XkEyXkFqcGc%40._V1_FMjpg_UX1000_.jpg",
  Simba: "https://akns-images.eonline.com/eol_images/Entire_Site/2024518/rs_1200x1200-240618070613-1200-the-lion-king-simba.jpg?crop=1200%3A1200%3Bcenter%2Ctop&fit=around%7C1200%3A1200&output-quality=90",
  Nala: "https://c04.castel.jp/800x/0/oak-j101479.webp",
  "Timon and Pumbaa": "https://i.pinimg.com/736x/9a/dc/0e/9adc0e0c382fe54a3f262b32fe3b5392.jpg",
  "Hakuna Matata": "https://wallpapers.com/images/hd/2560x1440-disney-hakuna-matata-characters-htbk9k6pvkjpyr2r.jpg",
  "Pride Rock": "https://s.movieinsider.com/images/p/62015_m1315434568.jpg",
  Aladdin: "https://super.abril.com.br/wp-content/uploads/2012/06/match-the-voice-actor-to-the-character-aladdin.jpeg?crop=1&h=440&quality=70&strip=info&w=720",
  Genie: "https://c04.castel.jp/1200x/0/genie-j115960.jpg?mod=20230217173323",
  "Magic Carpet": "https://img.buzzfeed.com/store-an-image-prod-us-east-1/Zr4tc7COr.png?output-format=jpg&output-quality=auto",
  "A Whole New World": "https://mickeyblog.com/wp-content/uploads/2023/12/Screenshot-2023-12-18-at-09-26-27-Aladdin-A-Whole-New-World.png",
  Agrabah: "https://i.pinimg.com/originals/27/6b/f5/276bf563e7c31078f9df49151bd074d7.png",
  "Toy Story": "https://c02.castel.jp/400x/0/toy-story-series-j70587.jpg?mod=20230216040104",
  Woody: "https://d1uzk9o9cg136f.cloudfront.net/f/16782943/rc/2019/07/12/8c0db170eb58d041f8dc00f16872cae9bf45a36b_large.jpg",
  "Buzz Lightyear": "https://lumiere-a.akamaihd.net/v1/images/t_toystory_buzzlightyear_characterimage_v3_dca01509.jpeg?region=75%2C0%2C450%2C600",
  Jessie: "https://cdn.ruwiki.ru/ruwiki/files/thumb/8/87/Jessie_%28Toy_Story%29.png/600px-Jessie_%28Toy_Story%29.png.webp",
  "Pizza Planet": "https://i.pinimg.com/originals/ca/de/46/cade46054c97668378f0fe6ede1772e8.jpg",
  "Finding Nemo": "https://cf-img-a-in.tosshub.com/sites/visualstory/wp/2024/11/5919a697bff3873f28f73992c95e5e5fITG-1732966381430.jpg?size=%2A%3A900",
  Dory: "https://www.informador.mx/__export/1506053117927/sites/elinformador/img/historico/11/885163.jpg_423682103.jpg",
  Crush: "https://lumiere-a.akamaihd.net/v1/images/crush_fc_finding-nemo_t_1a0ac0e5.jpeg?region=0%2C0%2C600%2C600",
  "P. Sherman 42 Wallaby Way": "https://fr.web.img2.acsta.net/newsv7/20/09/11/15/21/38029920.jpg",
  "Just Keep Swimming": "https://clip.cafe/clipimg/lt-i-gt-just-keep-swimming-swimming-swimming-lt-i-gt-lt-i-gt-what-do-we-do.jpg",
  "Monsters Inc.": "https://m.media-amazon.com/images/M/MV5BYTJhNjU5ZDItOTY2My00MGI1LTllMDEtNTQ2ZjQ4MTE1YTdjXkEyXkFqcGc%40._V1_.jpg",
  "Mike Wazowski": "https://hips.hearstapps.com/es.h-cdn.co/fotoes/images/media/imagenes/reportajes/las-11-joyas-de-la-corona-pixar/04/4658280-1-esl-ES/04.jpg",
  Sulley: "https://vignette.wikia.nocookie.net/disneyypixar/images/f/fe/Sullivan_KH3.png/revision/latest?cb=20181022033720&path-prefix=es",
  Boo: "https://tvazteca.brightspotcdn.com/dims4/default/46cd0cb/2147483647/strip/true/crop/748x415%2B0%2B0/resize/1024x568%21/format/webp/quality/90/?url=http%3A%2F%2Ftv-azteca-brightspot.s3.amazonaws.com%2Fbf%2F61%2F11c9aa1f12b97ad7d263a325d26f%2Fboo-2172848.jpg",
  "The Door Vault": "https://celebrationspress.com/wp-content/uploads/2025/01/012025m6.jpg",
  "The Incredibles": "https://hips.hearstapps.com/es.h-cdn.co/crfes/images/ninos/ocio/20-peliculas-para-ver-en-familia/los-increibles/2903733-1-esl-ES/Los-increibles.jpg",
  "Mr. Incredible": "https://i.pinimg.com/originals/96/da/de/96dade7fe73070c57af70b1b6ffabcb9.jpg",
  Elastigirl: "https://prod.assets.earlygamecdn.com/images/mrs-incredible.jpeg?transform=Gallery+Item+Webp",
  "Edna Mode": "https://www.toonarific.com/wp-content/uploads/2025/02/Edna-Mode-1.jpg",
  "No Capes": "https://www.factinate.com/storage/app/media/factinate/2018/07/Screenshot-666.jpg",
  Cars: "https://www.dailysportscar.com/wp-content/uploads/2020/04/Cars-Pixar-Movie-730x487.jpg",
  "Lightning McQueen": "https://lumiere-a.akamaihd.net/v1/images/lightning-mcqueen_fc_cars_t_966e6979.jpeg?region=0%2C0%2C600%2C600&width=480",
  Mater: "https://lumiere-a.akamaihd.net/v1/images/mater_fc_cars_s_cdc8b138.jpeg",
  "Radiator Springs": "https://resizer.mail.ru/p/221941a3-8622-5938-a0fc-cb9bad5a9ae7/AQABPYlgt_HaNrpOyPOZaZgx7b9qpFAn1AEhXSnWE3h4dnjGLRUpj_FyN49yd0mKcXKFl4B6AQIeb_Rjf5EBdaiNU4g.jpg",
  "Ka-chow": "https://up.autotitre.com/b4d7dc86eb.jpg",
  Up: "https://nofilmschool.com/media-library/up.jpg?coordinates=350%2C0%2C350%2C0&height=1200&id=34053143&width=1200",
  "Carl and Ellie": "https://cdn.mos.cms.futurecdn.net/v2/t%3A0%2Cl%3A160%2Ccw%3A960%2Cch%3A720%2Cq%3A80%2Cw%3A960/tPB5MHbMVz3PgGGrUfeahM.jpeg",
  Russell: "https://i.pinimg.com/736x/ec/c1/c3/ecc1c3a8d0ee612f942086c70d9f4365.jpg",
  Dug: "https://p2.trrsf.com/image/fget/cf/500/0/images.terra.com/2021/08/27/1372650300-dug-days.jpg",
  "Adventure Is Out There": "https://images.squarespace-cdn.com/content/v1/50c10ff1e4b0c562855be559/1426007437631-J5QYNZ2H44WPOBQH6EG3/image-asset.jpeg",
  "Inside Out": "https://myhotposters.com/cdn/shop/products/HP2826_7f75968f-ef08-453f-8e8d-656005e5e971_1024x1024.jpg?v=1748537320",
  Joy: "https://i.pinimg.com/736x/58/c2/a3/58c2a3f4507f687c28f9d0425ab58790.jpg",
  Sadness: "https://www.youloveit.ru/uploads/gallery/main/809/youloveit_ru_multfilm_golovolomka02.jpg",
  "Bing Bong": "https://pixar-planet.fr/wp-content/uploads/2015/05/bing-bong-personnage-vice-versa-002.jpg",
  "Memory Orbs": "https://img2.wikia.nocookie.net/__cb20150528204445/disney/images/2/2c/Inside-Out-296.png",
  Coco: "https://1.bp.blogspot.com/-MPiUts90VY0/Wbgn8t_2weI/AAAAAAAAjok/hCfUVULg4YYe4D-y3JIatJMgUVoJCSKOQCLcBGAs/s1600/DJiYv8SX0AAQ8fZ.jpg",
  Miguel: "https://www.sopitas.com/wp-content/uploads/2017/09/coco-dante.jpg",
  "Remember Me": "https://cdn11.bigcommerce.com/s-89ffd/images/stencil/728x728/products/28737/122790/4979817994306-1__73920.1519195509.jpg?c=2",
  Encanto: "https://pics.filmaffinity.com/Encanto-246546841-large.jpg",
  Mirabel: "https://p2.trrsf.com/image/fget/cf/1200/1200/middle/images.terra.com/2021/11/07/1949470743-disney-2021-animation-animated-encanto-film-musical-movie-mirabel.jpeg",
  Bruno: "https://r2-media.wdwnt.com/2022/01/BrunoMadrigal.jpg",
  "WALL-E": "https://agentetenta.wordpress.com/wp-content/uploads/2009/02/pixar_walle.jpg",
  EVE: "https://c01.castel.jp/400x400/0/wally-eve-j77672.jpg",
  Ratatouille: "https://www.cinehorizons.net/sites/default/files/affiches/Ratatouille-Cuistot.jpg",
  Remy: "https://static.tvtropes.org/pmwiki/pub/images/remy_webp.png",
  Stitch: "https://vignette4.wikia.nocookie.net/disney/images/e/e9/Stitch_OfficialDisney.jpg/revision/latest?cb=20140508112158",
  Baymax: "https://www.aceshowbiz.com/images/still/big-hero-6-08.jpg",
  "Judy Hopps": "https://vignette.wikia.nocookie.net/miguel-riveras-book-of-friends/images/e/e6/Judy_Hopps_pose_render.png/revision/latest?cb=20181229084312",
  Luca: "https://image.tmdb.org/t/p/original/9jPa6SlUYxPFMVZlEuceiPPAA15.jpg",
  Merida: "https://miro.medium.com/v2/resize%3Afit%3A1400/0%2ABZhOreOqhbk1TcSl",
};

const rounds = [
  { name: "Round 1", pattern: "Any Line", playMinutes: 20, points: 100 },
  { name: "Round 2", pattern: "Four Corners", playMinutes: 20, points: 100, bonusPoints: 50 },
  { name: "Round 3", pattern: "X Pattern", playMinutes: 20, points: 100, bonusPoints: 200 },
  { name: "Final Round", pattern: "Blackout", playMinutes: 30, points: 500 },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/trivia" || url.pathname === "/trivia/") {
      return Response.redirect(TRIVIA_CONTROL_ROOM_URL, 302);
    }
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(assetRequest(request, url));
  },
};

async function handleApi(request, env, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/client-config") {
      return json({ ok: true, supabase: browserSupabaseConfig(env) });
    }
    if (request.method === "GET" && url.pathname === "/api/storage-status") {
      return json({ ok: true, storage: storageStatus() });
    }
    if (request.method === "GET" && url.pathname === "/api/moment-image") {
      const text = url.searchParams.get("text") || "";
      const category = url.searchParams.get("category") || "";
      return json(await findMomentImage(env, text, category));
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      const role = roleFromRequest(request, url);
      let state = await loadState(env);
      if (role === "host" || role === "display") state = await advanceAndSave(env, state);
      return json(publicState(request, state, env));
    }

    if (request.method !== "POST") return json({ error: "Not found" }, 404);
    const body = await readJson(request);
    const pathname = url.pathname;

    if (pathname === "/api/heartbeat") {
      return json({ ok: true, id: String(body.id || crypto.randomUUID()).slice(0, 80) });
    }
    if (pathname === "/api/deal-cards") {
      const state = await loadState(env, { allowCached: true });
      const player = String(body.player || "Player").slice(0, 40);
      const count = Math.max(1, Math.min(3, Number(body.count || 1)));
      const cards = [];
      for (let index = 0; index < count; index += 1) cards.push(await createSignedCard(env, state, player, index + 1));
      return json({ ok: true, roundIndex: state.roundIndex, cards });
    }

    let state = await loadState(env);
    if (pathname === "/api/start-countdown") {
      state = startOpeningCountdown();
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/skip-countdown" || pathname === "/api/start-round") {
      state = startCurrentRound(state, { resetClaims: state.status === "countdown" || state.status === "setup" });
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/pull") {
      drawNextMoment(state);
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/pause-round") {
      if (state.status === "playing") {
        const now = Date.now();
        state.status = "paused";
        state.pausedAt = now;
        state.playRemainingMs = state.playEndsAt ? Math.max(0, state.playEndsAt - now) : null;
        state.nextPullRemainingMs = state.nextPullAt ? Math.max(0, state.nextPullAt - now) : PULL_INTERVAL_MS;
        state.playEndsAt = null;
        state.nextPullAt = null;
      }
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/resume-round") {
      if (state.status === "paused") {
        const now = Date.now();
        state.status = "playing";
        state.playEndsAt = state.playRemainingMs ? now + state.playRemainingMs : null;
        state.nextPullAt = now + Math.max(1000, Number(state.nextPullRemainingMs || PULL_INTERVAL_MS));
        state.pausedAt = null;
        state.playRemainingMs = null;
        state.nextPullRemainingMs = null;
      }
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/end-round" || pathname === "/api/start-break") {
      state = startBreakOrEndEvent(state);
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/next-round") {
      state = startNextRound(state);
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/undo-call") {
      const last = state.called.shift();
      if (last) {
        state.deck.unshift(last);
        state.currentWord = state.called[0] || null;
        state.nextPullAt = state.status === "playing" ? Date.now() + PULL_INTERVAL_MS : state.nextPullAt;
      }
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/toggle-auto-call") {
      state.autoPullEnabled = body.enabled !== undefined ? Boolean(body.enabled) : state.autoPullEnabled === false;
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/hype") {
      const fallback = HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)];
      state.hypeMessage = String(body.message || fallback).slice(0, 160);
      state.hypeUpdatedAt = Date.now();
      await saveState(env, touch(state));
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/reset") {
      if (body.confirm !== "RESET") return json({ error: "Reset confirmation required." }, 400);
      state = freshState();
      await saveState(env, state);
      return json(publicState(request, state, env));
    }
    if (pathname === "/api/claim") {
      const result = await validateClaim(env, state, body);
      if (result.error) return json({ error: result.error }, result.status || 400);
      state.claims.unshift(result.claim);
      await saveState(env, touch(state));
      return json({ ok: true, claim: result.claim, state: publicState(request, state, env) });
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Request failed" }, 500);
  }
}

function assetRequest(request, url) {
  const rewrites = new Map([
    ["/", "/host.html"],
    ["/host", "/host.html"],
    ["/dashboard", "/dashboard.html"],
    ["/display", "/display.html"],
    ["/host-guide", "/host-guide.html"],
    ["/play", "/play.html"],
    ["/favicon.ico", "/assets/on-par-logo.png"],
  ]);
  const pathname = rewrites.get(url.pathname) || url.pathname;
  const nextUrl = new URL(request.url);
  nextUrl.pathname = pathname;
  return new Request(nextUrl, request);
}

function freshState() {
  const now = Date.now();
  return {
    gameId: ACTIVE_GAME_ID,
    title: ACTIVE_GAME_TITLE,
    theme: ACTIVE_GAME_THEME,
    venue: "On Par Entertainment",
    roundIndex: 0,
    status: "setup",
    currentWord: null,
    called: [],
    deck: shuffle(moments),
    claims: [],
    autoPullEnabled: true,
    hypeMessage: HYPE_MESSAGES[0],
    hypeUpdatedAt: now,
    countdownEndsAt: null,
    breakEndsAt: null,
    playEndsAt: null,
    pausedAt: null,
    playRemainingMs: null,
    nextPullAt: null,
    updatedAt: now,
  };
}

async function loadState(env, { allowCached = false } = {}) {
  if (allowCached && cachedState && Date.now() - cachedStateLoadedAt < PLAYER_STATE_CACHE_MS) return structuredClone(cachedState);
  const rows = await supabaseRequest(env, `${SUPABASE_STATE_TABLE}?id=eq.${GAME_STATE_ROW_ID}&select=state`);
  const snapshot = Array.isArray(rows) ? rows[0]?.state : null;
  const state = normalizeState(snapshot);
  cachedState = structuredClone(state);
  cachedStateLoadedAt = Date.now();
  return state;
}

function normalizeState(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.deck)) return freshState();
  if (snapshot.gameId !== ACTIVE_GAME_ID || snapshot.title !== ACTIVE_GAME_TITLE) return freshState();
  return {
    ...freshState(),
    ...snapshot,
    currentWord: compactMoment(snapshot.currentWord),
    called: compactMoments(snapshot.called),
    deck: compactMoments(snapshot.deck),
    claims: Array.isArray(snapshot.claims) ? snapshot.claims : [],
    autoPullEnabled: snapshot.autoPullEnabled !== false,
    updatedAt: Number(snapshot.updatedAt) || Date.now(),
  };
}

async function advanceAndSave(env, state) {
  const before = state.updatedAt;
  advanceState(state);
  if (state.updatedAt !== before) await saveState(env, state);
  return state;
}

function advanceState(state) {
  const now = Date.now();
  if (state.status === "countdown" && state.countdownEndsAt && now >= state.countdownEndsAt) {
    Object.assign(state, startCurrentRound(state, { resetClaims: true }));
    return;
  }
  if (state.status === "playing" && state.playEndsAt && now >= state.playEndsAt) {
    Object.assign(state, startBreakOrEndEvent(state));
    return;
  }
  if (state.status === "break" && state.breakEndsAt && now >= state.breakEndsAt) {
    Object.assign(state, startNextRound(state));
    return;
  }
  if (state.status === "playing" && state.autoPullEnabled !== false && state.nextPullAt && now >= state.nextPullAt) {
    if (drawNextMoment(state)) touch(state);
  }
}

async function saveState(env, state) {
  touch(state);
  cachedState = structuredClone(state);
  cachedStateLoadedAt = Date.now();
  await Promise.all([
    supabaseRequest(env, `${SUPABASE_STATE_TABLE}?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: GAME_STATE_ROW_ID, state, updated_at: new Date().toISOString() }),
    }),
    supabaseRequest(env, `${SUPABASE_PUBLIC_STATE_TABLE}?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: GAME_STATE_ROW_ID, state: playerState(state, env), updated_at: new Date().toISOString() }),
    }),
  ]);
}

function publicState(request, state, env) {
  const joinUrl = joinUrlForRequest(request, env);
  const round = rounds[state.roundIndex] || rounds[0];
  return {
    ...state,
    round,
    rounds,
    moments,
    activeGame: { id: state.gameId, title: state.title, theme: state.theme, status: "approved", wordCount: moments.length },
    joinUrl,
    qrUrl: joinUrl,
    autoPullEverySeconds: PULL_INTERVAL_MS / 1000,
    pregameCountdownSeconds: PREGAME_COUNTDOWN_MS / 1000,
    leaderboard: leaderboardFromClaims(state.claims),
    latestClaim: state.claims[0] || null,
    storage: storageStatus(),
    health: {
      ok: true,
      joinReady: true,
      deckReady: true,
      currentMomentReady: state.status !== "playing" || Boolean(state.currentWord || state.called.length),
      storageHealthy: true,
      displayConnected: true,
      hostConnected: true,
      activePlayers: 0,
      lastDisplaySeenAt: null,
      lastPlayerSeenAt: null,
    },
    serverTime: Date.now(),
  };
}

function playerState(state, env) {
  const full = publicState(new Request(env.PUBLIC_JOIN_URL || "https://www.opebingo.com/play"), state, env);
  return {
    gameId: full.gameId,
    title: full.title,
    theme: full.theme,
    venue: full.venue,
    roundIndex: full.roundIndex,
    status: full.status,
    currentWord: full.currentWord,
    called: full.called,
    autoPullEnabled: full.autoPullEnabled,
    hypeMessage: full.hypeMessage,
    hypeUpdatedAt: full.hypeUpdatedAt,
    countdownEndsAt: full.countdownEndsAt,
    breakEndsAt: full.breakEndsAt,
    playEndsAt: full.playEndsAt,
    pausedAt: full.pausedAt,
    playRemainingMs: full.playRemainingMs,
    nextPullAt: full.nextPullAt,
    updatedAt: full.updatedAt,
    round: full.round,
    rounds: full.rounds,
    joinUrl: full.joinUrl,
    qrUrl: full.qrUrl,
    autoPullEverySeconds: full.autoPullEverySeconds,
    pregameCountdownSeconds: full.pregameCountdownSeconds,
    latestClaim: full.latestClaim,
    serverTime: full.serverTime,
  };
}

function startOpeningCountdown() {
  const state = freshState();
  state.status = "countdown";
  state.countdownEndsAt = Date.now() + PREGAME_COUNTDOWN_MS;
  return touch(state);
}

function startCurrentRound(state, { resetClaims = false } = {}) {
  const round = rounds[state.roundIndex] || rounds[0];
  const previousCalled = state.called || [];
  state.status = "playing";
  state.currentWord = null;
  state.called = [];
  state.deck = buildRoundDeck(state.roundIndex, previousCalled);
  if (resetClaims) state.claims = [];
  state.countdownEndsAt = null;
  state.breakEndsAt = null;
  state.pausedAt = null;
  state.playRemainingMs = null;
  state.playEndsAt = Date.now() + round.playMinutes * 60 * 1000;
  state.nextPullAt = Date.now() + PULL_INTERVAL_MS;
  drawNextMoment(state);
  return touch(state);
}

function startBreakOrEndEvent(state) {
  state.currentWord = null;
  state.countdownEndsAt = null;
  state.playEndsAt = null;
  state.pausedAt = null;
  state.playRemainingMs = null;
  state.nextPullAt = null;
  if (state.roundIndex >= rounds.length - 1) {
    state.status = "ended";
    state.breakEndsAt = null;
  } else {
    state.status = "break";
    state.breakEndsAt = Date.now() + BREAK_MS;
  }
  return touch(state);
}

function startNextRound(state) {
  if (state.roundIndex >= rounds.length - 1) return startBreakOrEndEvent(state);
  state.roundIndex += 1;
  return startCurrentRound(state);
}

function drawNextMoment(state) {
  if (state.status !== "playing") return false;
  if (!state.deck.length) state.deck = buildRoundDeck(state.roundIndex, state.called);
  const next = state.deck.shift();
  if (!next) return false;
  state.currentWord = next;
  state.called.unshift(next);
  state.nextPullAt = Date.now() + PULL_INTERVAL_MS;
  return true;
}

function buildRoundDeck(roundIndex, previousCalled = []) {
  if (roundIndex !== rounds.length - 1) return shuffle(moments);
  const previousTexts = new Set(previousCalled.map((moment) => moment?.text).filter(Boolean));
  return [
    ...shuffle(moments.filter((moment) => !previousTexts.has(moment.text))),
    ...shuffle(moments.filter((moment) => previousTexts.has(moment.text))),
  ];
}

async function createSignedCard(env, state, player, number) {
  const pool = shuffle(moments.map((moment) => moment.text)).slice(0, 24);
  const cells = Array.from({ length: 25 }, (_, index) => (index === 12 ? "FREE" : pool.shift()));
  const payload = { v: 1, player, roundIndex: state.roundIndex, number, cells };
  return { number, cells, token: await sign(env, payload) };
}

async function validateClaim(env, state, body) {
  if (state.status !== "playing") return { error: "BINGO claims are only accepted during a live round.", status: 409 };
  const player = String(body.player || "Player").slice(0, 40);
  const cardNumber = Number(body.card || 1);
  const cells = Array.isArray(body.cells) && body.cells.length === 25 ? body.cells.map((cell) => String(cell || "").slice(0, 80)) : null;
  const tokenPayload = await verify(env, body.cardToken);
  if (!cells || !tokenPayload) return { error: "Could not verify this bingo card. Refresh your card and try again.", status: 400 };
  if (tokenPayload.player !== player || Number(tokenPayload.number) !== cardNumber || JSON.stringify(tokenPayload.cells) !== JSON.stringify(cells)) {
    return { error: "This bingo card does not match the current round. Refresh your card and try again.", status: 409 };
  }
  const cardRoundOk = tokenPayload.roundIndex === state.roundIndex || (state.roundIndex === rounds.length - 1 && tokenPayload.roundIndex === state.roundIndex - 1);
  if (!cardRoundOk) return { error: "This bingo card does not match the current round. Refresh your card and try again.", status: 409 };
  const selected = normalizeSelected(body.selected);
  const calledWords = new Set(state.called.map((word) => word.text));
  const completed = completedBingos(cells, selected, rounds[state.roundIndex].pattern, calledWords);
  const requestedIds = new Set((Array.isArray(body.bingos) ? body.bingos : []).map((bingo) => String(bingo?.id || "")));
  const candidates = completed.filter((bingo) => !requestedIds.size || requestedIds.has(bingo.id));
  if (!completed.length || !candidates.length) return { error: "No completed BINGO pattern was submitted.", status: 400 };
  const fingerprint = await digest(JSON.stringify(cells));
  const freshBingos = candidates.filter((bingo) => !alreadyClaimed(state, player, cardNumber, bingo.id, fingerprint));
  if (!freshBingos.length) return { error: "That BINGO was already claimed on this card.", status: 409 };
  const points = freshBingos.reduce((sum, bingo) => sum + bingo.points, 0);
  return {
    claim: {
      id: `${Date.now()}-${crypto.randomUUID()}`,
      player,
      card: cardNumber,
      cardFingerprint: fingerprint,
      bingos: freshBingos,
      bingoCount: freshBingos.length,
      points,
      pattern: rounds[state.roundIndex].pattern,
      round: rounds[state.roundIndex].name,
      roundIndex: state.roundIndex,
      createdAt: Date.now(),
    },
  };
}

function completedBingos(cells, selected, pattern, calledWords) {
  const marked = cells.map((word, index) => selected.has(index) && (word === "FREE" || calledWords.has(word)));
  const lines = bingoLines()
    .filter((line) => line.cells.every((index) => marked[index]))
    .map((line) => ({ ...line, words: line.cells.map((index) => cells[index]), points: 100 }));
  if (pattern === "Blackout") return marked.every(Boolean) ? [{ id: "blackout", label: "Blackout Bingo", cells: [...Array(25).keys()], words: cells, points: 500 }] : [];
  if (pattern === "X Pattern") {
    const x = [0, 4, 6, 8, 12, 16, 18, 20, 24];
    return x.every((index) => marked[index]) ? [...lines, { id: "x-pattern", label: "X Bingo Bonus", cells: x, words: x.map((index) => cells[index]), points: 200 }] : lines;
  }
  if (pattern === "Four Corners") {
    const corners = [0, 4, 20, 24];
    return corners.every((index) => marked[index]) ? [...lines, { id: "four-corners", label: "Four Corners Bonus", cells: corners, words: corners.map((index) => cells[index]), points: 50 }] : lines;
  }
  return lines;
}

function bingoLines() {
  return [
    ["row-1", "Top Row", [0, 1, 2, 3, 4]], ["row-2", "Second Row", [5, 6, 7, 8, 9]],
    ["row-3", "Middle Row", [10, 11, 12, 13, 14]], ["row-4", "Fourth Row", [15, 16, 17, 18, 19]],
    ["row-5", "Bottom Row", [20, 21, 22, 23, 24]], ["col-1", "B Column", [0, 5, 10, 15, 20]],
    ["col-2", "I Column", [1, 6, 11, 16, 21]], ["col-3", "N Column", [2, 7, 12, 17, 22]],
    ["col-4", "G Column", [3, 8, 13, 18, 23]], ["col-5", "O Column", [4, 9, 14, 19, 24]],
    ["diag-1", "Diagonal", [0, 6, 12, 18, 24]], ["diag-2", "Diagonal", [4, 8, 12, 16, 20]],
  ].map(([id, label, cells]) => ({ id, label, cells }));
}

function alreadyClaimed(state, player, card, bingoId, fingerprint) {
  return state.claims.some((claim) => claim.player === player
    && claim.roundIndex === state.roundIndex
    && (claim.cardFingerprint === fingerprint || Number(claim.card) === Number(card))
    && Array.isArray(claim.bingos)
    && claim.bingos.some((bingo) => bingo.id === bingoId));
}

function normalizeSelected(selected) {
  const set = new Set(Array.isArray(selected) ? selected.map(Number) : []);
  set.add(12);
  return new Set([...set].filter((index) => Number.isInteger(index) && index >= 0 && index < 25));
}

async function sign(env, payload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(env, encoded);
  return `${encoded}.${signature}`;
}

async function verify(env, token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature || await hmac(env, encoded) !== signature) return null;
  try {
    return JSON.parse(base64UrlDecode(encoded));
  } catch {
    return null;
  }
}

async function hmac(env, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return arrayBufferToBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function digest(value) {
  return arrayBufferToBase64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function arrayBufferToBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function supabaseRequest(env, pathname, options = {}) {
  const config = supabaseConfig(env);
  const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function supabaseConfig(env) {
  return {
    url: String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

function browserSupabaseConfig(env) {
  const config = supabaseConfig(env);
  return {
    url: config.url,
    key: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    publicStateTable: SUPABASE_PUBLIC_STATE_TABLE,
  };
}

function signingSecret(env) {
  return env.BINGO_CARD_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
}

function storageStatus() {
  return {
    provider: "supabase",
    configured: true,
    available: true,
    lastLoadedAt: Date.now(),
    lastSavedAt: Date.now(),
    error: null,
  };
}

function joinUrlForRequest(request, env) {
  if (env.PUBLIC_JOIN_URL) return env.PUBLIC_JOIN_URL;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/play`;
}

function leaderboardFromClaims(claims) {
  const scores = new Map();
  for (const claim of claims || []) {
    const current = scores.get(claim.player) || { player: claim.player, points: 0, bingos: 0 };
    current.points += claim.points || 100;
    current.bingos += claim.bingoCount || 1;
    scores.set(claim.player, current);
  }
  return [...scores.values()].sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

function compactMoment(moment) {
  if (!moment || typeof moment !== "object") return null;
  const text = String(moment.text || moment.word || "").slice(0, 80);
  if (!text) return null;
  return { id: String(moment.id || slugId(text)), text, category: String(moment.category || moment.description || "").slice(0, 160) };
}

function compactMoments(items) {
  return (Array.isArray(items) ? items : []).map(compactMoment).filter(Boolean);
}

function shuffle(items) {
  const copy = items.map((item) => (item && typeof item === "object" ? { ...item } : item));
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function touch(state) {
  state.updatedAt = Date.now();
  return state;
}

function slugId(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

async function findMomentImage(env, text, category = "") {
  const approvedUrl = approvedImages[text];
  if (approvedUrl) {
    return {
      ok: true,
      url: approvedUrl,
      title: text,
      query: imageSearchQuery(text, category),
      source: "Approved Disney/Pixar image",
      cached: true,
    };
  }

  const manifest = await loadImageManifest(env);
  const manifestItem = manifest[text];
  if (manifestItem?.image) {
    return {
      ok: true,
      url: manifestItem.image,
      title: manifestItem.alt || text,
      query: manifestItem.query || imageSearchQuery(text, category),
      source: manifestItem.source || "Approved image manifest",
      width: manifestItem.width,
      height: manifestItem.height,
      qualityScore: manifestItem.qualityScore,
      cached: true,
    };
  }

  return {
    ok: true,
    url: momentImageUrl(text),
    title: text,
    query: imageSearchQuery(text, category),
    source: "cloudflare-static-fallback",
  };
}

async function loadImageManifest(env) {
  if (cachedImageManifest) return cachedImageManifest;
  try {
    const response = await env.ASSETS.fetch(new Request("https://assets.local/assets/google-image-manifest.json"));
    if (response.ok) {
      cachedImageManifest = await response.json();
      return cachedImageManifest;
    }
  } catch {
    // Fall through to an empty manifest so the generated fallback still works.
  }
  cachedImageManifest = {};
  return cachedImageManifest;
}

function imageSearchQuery(text, category) {
  if (category === "Pixar") return `${text} Pixar`;
  if (category === "Disney Animation" || category === "Classic Disney" || category === "Princesses") return `${text} Disney`;
  return `${text} Disney Pixar`;
}

function momentImageUrl(text) {
  return text ? `/assets/approval-images/${slugId(text)}.jpg` : "/assets/event-art/bingo-leaderboard-screen.png";
}

function roleFromRequest(request, url) {
  return String(url.searchParams.get("role") || request.headers.get("x-bingo-role") || "").toLowerCase();
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
