const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);

function projectPath(...segments) {
  const cwdPath = path.join(process.cwd(), ...segments);
  if (fs.existsSync(cwdPath)) return cwdPath;
  return path.join(__dirname, ...segments);
}

const PUBLIC_DIR = projectPath("public");
const DATA_DIR = projectPath("data");
const THEMED_GAMES_PATH = process.env.BINGO_GAMES_DATA_PATH || path.join(DATA_DIR, "themed-bingo-games.json");
const GOOGLE_IMAGE_MANIFEST_PATH = path.join(PUBLIC_DIR, "assets", "google-image-manifest.json");
const PULL_INTERVAL_MS = 20 * 1000;
const BREAK_MS = 10 * 60 * 1000;
const PREGAME_COUNTDOWN_MS = 15 * 60 * 1000;
const GAME_STATE_ROW_ID = "current";
const GAME_STORE_ROW_ID = "themed-games";
const SUPABASE_STATE_TABLE = "on_par_bingo_state";
const SUPABASE_PUBLIC_STATE_TABLE = "on_par_bingo_public_state";
const DEFAULT_SUPABASE_URL = "https://tmnstuthbllnoqgepotn.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G74TdOYv0R0AML1WZTfxJQ_YZqJa7jE";
const PUBLIC_JOIN_URL = publicJoinUrlFromEnv();
const imageCache = new Map();
let googleImageManifest = loadGoogleImageManifest();
let storageHydrationPromise = null;
let storageHydrated = false;
let gameStoreHydrationPromise = null;
let gameStoreHydrated = false;
let storageSaveTimer = null;
let storageStatus = {
  provider: "supabase",
  configured: isSupabaseConfigured(),
  available: false,
  lastLoadedAt: null,
  lastSavedAt: null,
  error: null,
};
const presence = {
  host: new Map(),
  display: new Map(),
  player: new Map(),
};

const HYPE_MESSAGES = [
  "make some noise - prizes for the loudest table",
];

const moments = [
  { text: "Barbie", category: "Movies" },
  { text: "Mamma Mia", category: "Movies" },
  { text: "Top Gun", category: "Movies" },
  { text: "Titanic", category: "Movies" },
  { text: "Mean Girls", category: "Movies" },
  { text: "Wakanda", category: "Movies" },
  { text: "Avengers", category: "Movies" },
  { text: "Spider-Man", category: "Movies" },
  { text: "Star Wars", category: "Movies" },
  { text: "Jurassic Park", category: "Movies" },
  { text: "Shrek", category: "Movies" },
  { text: "Austin Powers", category: "Movies" },
  { text: "Scream", category: "Movies" },
  { text: "Wicked", category: "Movies" },
  { text: "Wednesday", category: "TV" },
  { text: "Friends", category: "TV" },
  { text: "Fresh Prince", category: "TV" },
  { text: "Seinfeld", category: "TV" },
  { text: "The Office", category: "TV" },
  { text: "Stranger Things", category: "TV" },
  { text: "The Upside Down", category: "TV" },
  { text: "Game of Thrones", category: "TV" },
  { text: "Golden Girls", category: "TV" },
  { text: "Saved by Bell", category: "TV" },
  { text: "Full House", category: "TV" },
  { text: "SpongeBob", category: "TV" },
  { text: "The Simpsons", category: "TV" },
  { text: "Real Housewives", category: "TV" },
  { text: "Survivor", category: "TV" },
  { text: "Oprah", category: "TV" },
  { text: "Dancing Queen", category: "Music" },
  { text: "Single Ladies", category: "Music" },
  { text: "Uptown Funk", category: "Music" },
  { text: "Thriller", category: "Music" },
  { text: "Purple Rain", category: "Music" },
  { text: "Material Girl", category: "Music" },
  { text: "Bye Bye Bye", category: "Music" },
  { text: "No Scrubs", category: "Music" },
  { text: "Hey Ya", category: "Music" },
  { text: "Old Town Road", category: "Music" },
  { text: "Moonwalk", category: "Music" },
  { text: "Super Bowl", category: "Sports" },
  { text: "World Cup", category: "Sports" },
  { text: "Olympics", category: "Sports" },
  { text: "March Madness", category: "Sports" },
  { text: "Space Jam", category: "Sports" },
  { text: "Halftime Show", category: "Sports" },
  { text: "Met Gala", category: "Celebrity" },
  { text: "Royal Wedding", category: "Celebrity" },
  { text: "You Get a Car", category: "Celebrity" },
  { text: "It Girl", category: "Internet" },
  { text: "Viral Dance", category: "Internet" },
  { text: "TikTok", category: "Internet" },
  { text: "Instagram", category: "Internet" },
  { text: "Y2K", category: "Style" },
  { text: "Friendship Bracelets", category: "Style" },
  { text: "Blockbuster", category: "Throwback" },
  { text: "TRL", category: "Throwback" },
  { text: "MTV", category: "Throwback" },
  { text: "Nickelodeon", category: "Throwback" },
  { text: "VHS", category: "Throwback" },
  { text: "Baby Yoda", category: "TV" },
  { text: "Kardashians", category: "Celebrity" },
  { text: "Taylor Swift", category: "Music" },
  { text: "Eras Tour", category: "Music" },
  { text: "Beyonce", category: "Music" },
  { text: "Lady Gaga", category: "Celebrity" },
  { text: "Rihanna", category: "Music" },
  { text: "Usher", category: "Music" },
  { text: "Billie Eilish", category: "Music" },
  { text: "Harry Potter", category: "Movies" },
  { text: "Lord of the Rings", category: "Movies" },
  { text: "The Matrix", category: "Movies" },
  { text: "Breaking Bad", category: "TV" },
  { text: "Grey's Anatomy", category: "TV" },
  { text: "Bridgerton", category: "TV" },
  { text: "Ted Lasso", category: "TV" },
  { text: "Schitt's Creek", category: "TV" },
  { text: "Euphoria", category: "TV" },
  { text: "Ghostbusters", category: "Movies" },
  { text: "Grease", category: "Movies" },
  { text: "Rocky", category: "Movies" },
  { text: "The Dress", category: "Internet" },
  { text: "Salt Bae", category: "Internet" },
  { text: "Oscars Slap", category: "Celebrity" },
  { text: "Wordle", category: "Internet" },
  { text: "Netflix and Chill", category: "Internet" },
  { text: "Coachella", category: "Music" },
  { text: "Roman Empire", category: "Internet" },
  { text: "Girl Math", category: "Internet" },
];

const disneyPixarMoments = [
  { text: "Mickey Mouse", category: "Classic Disney" },
  { text: "Minnie Mouse", category: "Classic Disney" },
  { text: "Donald Duck", category: "Classic Disney" },
  { text: "Goofy", category: "Classic Disney" },
  { text: "Pluto", category: "Classic Disney" },
  { text: "Cinderella", category: "Princesses" },
  { text: "Snow White", category: "Princesses" },
  { text: "Aurora", category: "Princesses" },
  { text: "Ariel", category: "Princesses" },
  { text: "Belle", category: "Princesses" },
  { text: "Jasmine", category: "Princesses" },
  { text: "Mulan", category: "Princesses" },
  { text: "Tiana", category: "Princesses" },
  { text: "Rapunzel", category: "Princesses" },
  { text: "Moana", category: "Princesses" },
  { text: "Elsa", category: "Frozen" },
  { text: "Anna", category: "Frozen" },
  { text: "Olaf", category: "Frozen" },
  { text: "Let It Go", category: "Frozen" },
  { text: "Arendelle", category: "Frozen" },
  { text: "Simba", category: "The Lion King" },
  { text: "Nala", category: "The Lion King" },
  { text: "Timon and Pumbaa", category: "The Lion King" },
  { text: "Hakuna Matata", category: "The Lion King" },
  { text: "Pride Rock", category: "The Lion King" },
  { text: "Aladdin", category: "Aladdin" },
  { text: "Genie", category: "Aladdin" },
  { text: "Magic Carpet", category: "Aladdin" },
  { text: "A Whole New World", category: "Aladdin" },
  { text: "Agrabah", category: "Aladdin" },
  { text: "Toy Story", category: "Pixar" },
  { text: "Woody", category: "Pixar" },
  { text: "Buzz Lightyear", category: "Pixar" },
  { text: "Jessie", category: "Pixar" },
  { text: "Pizza Planet", category: "Pixar" },
  { text: "Finding Nemo", category: "Pixar" },
  { text: "Dory", category: "Pixar" },
  { text: "Crush", category: "Pixar" },
  { text: "P. Sherman 42 Wallaby Way", category: "Pixar" },
  { text: "Just Keep Swimming", category: "Pixar" },
  { text: "Monsters Inc.", category: "Pixar" },
  { text: "Mike Wazowski", category: "Pixar" },
  { text: "Sulley", category: "Pixar" },
  { text: "Boo", category: "Pixar" },
  { text: "The Door Vault", category: "Pixar" },
  { text: "The Incredibles", category: "Pixar" },
  { text: "Mr. Incredible", category: "Pixar" },
  { text: "Elastigirl", category: "Pixar" },
  { text: "Edna Mode", category: "Pixar" },
  { text: "No Capes", category: "Pixar" },
  { text: "Cars", category: "Pixar" },
  { text: "Lightning McQueen", category: "Pixar" },
  { text: "Mater", category: "Pixar" },
  { text: "Radiator Springs", category: "Pixar" },
  { text: "Ka-chow", category: "Pixar" },
  { text: "Up", category: "Pixar" },
  { text: "Carl and Ellie", category: "Pixar" },
  { text: "Russell", category: "Pixar" },
  { text: "Dug", category: "Pixar" },
  { text: "Adventure Is Out There", category: "Pixar" },
  { text: "Inside Out", category: "Pixar" },
  { text: "Joy", category: "Pixar" },
  { text: "Sadness", category: "Pixar" },
  { text: "Bing Bong", category: "Pixar" },
  { text: "Memory Orbs", category: "Pixar" },
  { text: "Coco", category: "Pixar" },
  { text: "Miguel", category: "Pixar" },
  { text: "Remember Me", category: "Pixar" },
  { text: "Encanto", category: "Disney Animation" },
  { text: "Mirabel", category: "Disney Animation" },
  { text: "Bruno", category: "Disney Animation" },
  { text: "WALL-E", category: "Pixar" },
  { text: "EVE", category: "Pixar" },
  { text: "Ratatouille", category: "Pixar" },
  { text: "Remy", category: "Pixar" },
  { text: "Stitch", category: "Disney Animation" },
  { text: "Baymax", category: "Disney Animation" },
  { text: "Judy Hopps", category: "Disney Animation" },
  { text: "Luca", category: "Pixar" },
  { text: "Merida", category: "Pixar" },
];

const disneyPixarApprovedImages = {
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
  Encanto: "https://i.kym-cdn.com/photos/images/newsfeed/002/144/718/c33.jpg",
  Mirabel: "https://p2.trrsf.com/image/fget/cf/1200/1200/middle/images.terra.com/2021/11/07/1949470743-disney-2021-animation-animated-encanto-film-musical-movie-mirabel.jpeg",
  Bruno: "https://r2-media.wdwnt.com/2022/01/BrunoMadrigal.jpg",
  "WALL-E": "https://agentetenta.wordpress.com/wp-content/uploads/2009/02/pixar_walle.jpg",
  EVE: "https://c01.castel.jp/400x400/0/wally-eve-j77672.jpg",
  Ratatouille: "https://www.cinehorizons.net/sites/default/files/affiches/Ratatouille-Cuistot.jpg",
  Remy: "https://i.kym-cdn.com/photos/images/newsfeed/001/725/892/245.png",
  Stitch: "https://vignette4.wikia.nocookie.net/disney/images/e/e9/Stitch_OfficialDisney.jpg/revision/latest?cb=20140508112158",
  Baymax: "https://artfiles.alphacoders.com/114/thumb-1920-114897.png",
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

function isFinalRoundIndex(roundIndex) {
  return Number(roundIndex) === rounds.length - 1;
}

const clients = new Set();

let gameStore = loadGameStore();
let state = freshState();

function loadGameStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(THEMED_GAMES_PATH, "utf8"));
    const games = Array.isArray(parsed.games) ? parsed.games.map(normalizeGame).filter(Boolean) : [];
    if (games.length) {
      return {
        updatedAt: Number(parsed.updatedAt) || Date.now(),
        activeGameId: parsed.activeGameId || games[0].id,
        games,
      };
    }
  } catch {
    // First run uses the built-in pop culture deck.
  }
  const defaultGame = createDefaultDisneyPixarGame();
  return {
    updatedAt: Date.now(),
    activeGameId: defaultGame.id,
    games: [defaultGame],
  };
}

async function saveGameStore() {
  gameStore.updatedAt = Date.now();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(THEMED_GAMES_PATH, JSON.stringify(gameStore, null, 2));
  } catch (error) {
    console.warn("Could not save themed bingo games:", error.message);
  }
  try {
    await saveGameStoreToStorage();
  } catch (error) {
    console.warn("Could not save themed bingo games to Supabase:", error.message);
  }
}

function normalizeGameStoreSnapshot(snapshot) {
  const games = Array.isArray(snapshot?.games) ? snapshot.games.map(normalizeGame).filter(Boolean) : [];
  if (!games.length) return null;
  return {
    updatedAt: Number(snapshot.updatedAt) || Date.now(),
    activeGameId: snapshot.activeGameId || games[0].id,
    games,
  };
}

async function hydrateGameStoreFromStorage({ force = false } = {}) {
  if (!force && gameStoreHydrated) return;
  if (!force && gameStoreHydrationPromise) return gameStoreHydrationPromise;
  if (force) {
    gameStoreHydrationPromise = null;
    gameStoreHydrated = false;
  }
  gameStoreHydrationPromise = (async () => {
    if (!isSupabaseConfigured()) {
      gameStoreHydrated = true;
      return;
    }
    try {
      const rows = await supabaseRequest(
        `${SUPABASE_STATE_TABLE}?id=eq.${encodeURIComponent(GAME_STORE_ROW_ID)}&select=state`,
      );
      const snapshot = normalizeGameStoreSnapshot(Array.isArray(rows) ? rows[0]?.state : null);
      if (snapshot && (Number(snapshot.updatedAt) || 0) >= (Number(gameStore.updatedAt) || 0)) {
        gameStore = snapshot;
      }
    } catch (error) {
      console.warn("Supabase themed game load skipped:", error.message || error);
    } finally {
      gameStoreHydrated = true;
      gameStoreHydrationPromise = null;
    }
  })();
  return gameStoreHydrationPromise;
}

async function saveGameStoreToStorage() {
  if (!isSupabaseConfigured()) return;
  await supabaseRequest(`${SUPABASE_STATE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: GAME_STORE_ROW_ID,
      state: gameStore,
      updated_at: new Date().toISOString(),
    }),
  });
}

function createDefaultPopCultureGame() {
  const now = new Date().toISOString();
  return {
    id: "pop-culture-default",
    title: "Pop Culture Moments Bingo",
    theme: "Pop Culture",
    status: "approved",
    roundSettings: rounds,
    createdAt: now,
    updatedAt: now,
    wordDeck: moments.map((moment) => {
      const manifestItem = googleImageManifest[moment.text] || {};
      const imageUrl = manifestItem.image || generatedImageDataUrl(moment.text, "Pop Culture");
      return {
        id: slugId(moment.text),
        word: moment.text,
        description: moment.category,
        approvedImageUrl: imageUrl,
        imageSourceUrl: manifestItem.sourceUrl || manifestItem.page || imageUrl,
        imageStatus: "approved",
        notes: "",
        imageRecommendations: [{
          id: `${slugId(moment.text)}-default`,
          imageUrl,
          thumbnailUrl: imageUrl,
          sourceUrl: manifestItem.sourceUrl || manifestItem.page || imageUrl,
          sourceName: manifestItem.source || "Approved image",
          status: "approved",
        }],
      };
    }),
  };
}

function createDefaultDisneyPixarGame() {
  const now = new Date().toISOString();
  return {
    id: "disney-pixar-bingo",
    title: "Disney & Pixar Bingo",
    theme: "Disney and Pixar",
    status: "approved",
    roundSettings: rounds,
    createdAt: now,
    updatedAt: now,
    wordDeck: disneyPixarMoments.map((moment, index) => {
      const approvedImageUrl = disneyPixarApprovedImages[moment.text];
      const imageUrl = approvedImageUrl || generatedImageDataUrl(moment.text, "Disney + Pixar", index);
      const sourceName = approvedImageUrl ? "Approved Google Images result" : "Generated title card";
      return {
        id: slugId(moment.text),
        word: moment.text,
        description: moment.category,
        approvedImageUrl: imageUrl,
        imageSourceUrl: imageUrl,
        imageStatus: "approved",
        notes: "",
        imageRecommendations: [{
          id: `${slugId(moment.text)}-default`,
          imageUrl,
          thumbnailUrl: imageUrl,
          sourceUrl: imageUrl,
          sourceName,
          status: "approved",
        }],
      };
    }),
  };
}

function normalizeGame(game) {
  if (!game || typeof game !== "object") return null;
  const now = new Date().toISOString();
  const id = String(game.id || crypto.randomUUID());
  const title = String(game.title || game.theme || "Untitled Bingo Game").slice(0, 100);
  const theme = String(game.theme || title).slice(0, 100);
  const wordDeck = Array.isArray(game.wordDeck) ? game.wordDeck.map(normalizeDeckItem).filter(Boolean) : [];
  return {
    id,
    title,
    theme,
    status: normalizeGameStatus(game.status, wordDeck),
    roundSettings: Array.isArray(game.roundSettings) ? game.roundSettings : rounds,
    createdAt: game.createdAt || now,
    updatedAt: game.updatedAt || now,
    wordDeck,
  };
}

function normalizeDeckItem(item) {
  if (!item || typeof item !== "object") return null;
  const word = String(item.word || item.text || "").trim().slice(0, 80);
  if (!word) return null;
  const imageRecommendations = Array.isArray(item.imageRecommendations)
    ? item.imageRecommendations.map(normalizeRecommendation).filter(Boolean)
    : [];
  return {
    id: String(item.id || slugId(word)),
    word,
    description: String(item.description || item.category || "").slice(0, 160),
    approvedImageUrl: String(item.approvedImageUrl || item.imageUrl || ""),
    imageSourceUrl: String(item.imageSourceUrl || ""),
    imageStatus: ["pending", "approved", "denied"].includes(item.imageStatus) ? item.imageStatus : "pending",
    notes: String(item.notes || "").slice(0, 500),
    imageRecommendations,
  };
}

function normalizeRecommendation(item) {
  if (!item || typeof item !== "object") return null;
  const imageUrl = String(item.imageUrl || item.link || item.url || "");
  if (!imageUrl) return null;
  return {
    id: String(item.id || crypto.randomUUID()),
    imageUrl,
    thumbnailUrl: String(item.thumbnailUrl || item.thumbnail || imageUrl),
    sourceUrl: String(item.sourceUrl || item.contextLink || imageUrl),
    sourceName: String(item.sourceName || item.displayLink || item.source || "Image result").slice(0, 120),
    status: ["pending", "approved", "denied"].includes(item.status) ? item.status : "pending",
  };
}

function normalizeGameStatus(status, wordDeck) {
  const safeStatus = String(status || "draft");
  if (["draft", "image review", "approved", "live", "completed"].includes(safeStatus)) return safeStatus;
  return gameReadyFromDeck(wordDeck).ready ? "approved" : "draft";
}

function slugId(value) {
  const slug = String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "item";
  return `${slug}-${crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8)}`;
}

function getActiveGame() {
  return gameStore.games.find((game) => game.id === gameStore.activeGameId)
    || gameStore.games.find((game) => game.status === "live")
    || gameStore.games[0]
    || createDefaultPopCultureGame();
}

function gameReadyFromDeck(wordDeck) {
  const deck = Array.isArray(wordDeck) ? wordDeck : [];
  const approved = deck.filter((item) => item.imageStatus === "approved" && item.approvedImageUrl);
  const missing = deck.length - approved.length;
  return {
    ready: deck.length >= 24 && missing === 0,
    approvedCount: approved.length,
    totalCount: deck.length,
    missingCount: missing,
  };
}

function publicGameSummary(game) {
  const progress = gameReadyFromDeck(game.wordDeck);
  return {
    id: game.id,
    title: game.title,
    theme: game.theme,
    status: game.status,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    wordCount: game.wordDeck.length,
    imageApprovalProgress: progress,
  };
}

function compactMoment(moment) {
  if (!moment || typeof moment !== "object") return null;
  const text = String(moment.text || moment.word || "").slice(0, 80);
  if (!text) return null;
  return {
    id: String(moment.id || slugId(text)),
    text,
    category: String(moment.category || moment.description || "").slice(0, 160),
  };
}

function compactMoments(items) {
  return (Array.isArray(items) ? items : [])
    .map(compactMoment)
    .filter(Boolean);
}

function publicGameDetail(game) {
  return {
    ...publicGameSummary(game),
    roundSettings: game.roundSettings,
    wordDeck: game.wordDeck,
  };
}

function activeMoments() {
  const game = getActiveGame();
  const approvedDeck = game.wordDeck
    .filter((item) => item.imageStatus === "approved" && item.approvedImageUrl)
    .map((item) => momentFromDeckItem(item, game.theme));
  return approvedDeck.length >= 24 ? approvedDeck : moments;
}

function momentFromDeckItem(item, theme) {
  return {
    id: item.id,
    text: item.word,
    category: item.description || theme || "Theme Bingo",
  };
}

function createGameFromTheme({ title, theme, count = 75 }) {
  const now = new Date().toISOString();
  const safeTheme = String(theme || title || "Theme Night").trim().slice(0, 100) || "Theme Night";
  const safeTitle = String(title || `${safeTheme} Bingo`).trim().slice(0, 100) || `${safeTheme} Bingo`;
  const wordDeck = generateThemeDeck(safeTheme, count).map((item) => ({
    ...item,
    imageRecommendations: [],
  }));
  return normalizeGame({
    id: crypto.randomUUID(),
    title: safeTitle,
    theme: safeTheme,
    status: "draft",
    roundSettings: rounds,
    createdAt: now,
    updatedAt: now,
    wordDeck,
  });
}

function generateThemeDeck(theme, count = 75) {
  const themeName = String(theme || "Theme").trim() || "Theme";
  const lower = themeName.toLowerCase();
  const selected = [];
  const add = (word, description = themeName) => {
    const clean = String(word || "").trim();
    if (!clean || selected.some((item) => item.word.toLowerCase() === clean.toLowerCase())) return;
    selected.push({
      id: slugId(`${themeName}-${clean}`),
      word: clean.slice(0, 80),
      description: String(description || themeName).slice(0, 160),
      approvedImageUrl: "",
      imageSourceUrl: "",
      imageStatus: "pending",
      notes: "",
    });
  };

  const pools = [
    ["love island", ["Bombshell", "Casa Amor", "Text Alert", "Recoupling", "Fire Pit", "Hideaway", "Snog Marry Pie", "Movie Night", "Daybeds", "Pull for a Chat", "Head Turned", "Loyalty Test", "The Villa", "Beach Hut", "Final Dates"]],
    ["golf", ["Birdie", "Bogey", "Eagle", "Putter", "Driver", "Fairway", "Green", "Caddy", "Tee Time", "Mulligan", "Hole in One", "Sand Trap", "Clubhouse", "Scorecard", "Cart Path"]],
    ["christmas", ["Santa", "Reindeer", "Snowman", "Candy Cane", "Hot Cocoa", "Tree Lighting", "Ugly Sweater", "Mistletoe", "Stocking", "Sleigh Bells", "Gingerbread", "North Pole", "Gift Wrap", "Holiday Lights", "Snow Globe"]],
    ["karaoke", ["Power Ballad", "Duet", "Mic Drop", "Crowd Favorite", "Encore", "High Note", "Sing Along", "Stage Lights", "Opening Act", "Dance Break", "Air Guitar", "Classic Hit", "Request Slip", "Chorus", "Final Song"]],
    ["sports", ["Championship", "Mascot", "Overtime", "Halftime", "Fan Cam", "Touchdown", "Home Run", "Fast Break", "Penalty Shot", "Victory Lap", "Bracket", "Rivalry", "MVP", "Tailgate", "Final Score"]],
    ["pop", moments.map((moment) => moment.text)],
  ];
  for (const [key, words] of pools) {
    if (lower.includes(key)) words.forEach((word) => add(word));
  }

  const genericNouns = ["Opening Moment", "Fan Favorite", "Plot Twist", "Signature Look", "Catchphrase", "Dance Break", "Wildcard", "Throwback", "Icon", "Glow Up", "Challenge", "Double Take", "Big Reveal", "Main Character", "Photo Op", "Hot Take", "Soundtrack", "Scene Stealer", "Finale", "Crowd Reaction", "Team Player", "Lucky Shot", "Bonus Round", "Table Toast", "Victory Pose"];
  const templates = [
    (word) => `${themeName} ${word}`,
    (word) => `${word}`,
    (word) => `${themeName} ${word.replace("Moment", "Memory")}`,
  ];
  let templateIndex = 0;
  while (selected.length < Math.max(24, Math.min(100, Number(count) || 75))) {
    const noun = genericNouns[selected.length % genericNouns.length];
    const cycle = Math.floor(templateIndex / genericNouns.length) + 1;
    const candidate = templates[templateIndex % templates.length](noun);
    add(cycle > 2 ? `${candidate} ${cycle}` : candidate);
    templateIndex += 1;
    if (templateIndex > 400) break;
  }
  return selected.slice(0, Math.max(24, Math.min(100, Number(count) || 75)));
}

function freshState() {
  const activeGame = getActiveGame();
  return {
    gameId: activeGame.id,
    title: activeGame.title,
    theme: activeGame.theme,
    venue: "On Par Entertainment",
    roundIndex: 0,
    status: "setup",
    currentWord: null,
    called: [],
    deck: shuffle(activeMoments()),
    claims: [],
    autoPullEnabled: true,
    hypeMessage: HYPE_MESSAGES[0],
    hypeUpdatedAt: Date.now(),
    countdownEndsAt: null,
    breakEndsAt: null,
    playEndsAt: null,
    pausedAt: null,
    playRemainingMs: null,
    nextPullAt: null,
    updatedAt: Date.now(),
  };
}

function publicState(req) {
  const round = rounds[state.roundIndex] || rounds[rounds.length - 1];
  const origin = getOrigin(req);
  const joinUrl = joinUrlForOrigin(origin);
  const health = eventHealth(joinUrl);
  return {
    ...state,
    round,
    rounds,
    moments: activeMoments(),
    activeGame: publicGameSummary(getActiveGame()),
    joinUrl,
    qrUrl: joinUrl,
    autoPullEverySeconds: PULL_INTERVAL_MS / 1000,
    pregameCountdownSeconds: PREGAME_COUNTDOWN_MS / 1000,
    leaderboard: leaderboardFromClaims(),
    latestClaim: state.claims[0] || null,
    storage: publicStorageStatus(),
    health,
    serverTime: Date.now(),
  };
}

function playerPublicStateForOrigin(origin) {
  const publicState = publicStateForOrigin(origin);
  return {
    gameId: publicState.gameId,
    title: publicState.title,
    theme: publicState.theme,
    venue: publicState.venue,
    roundIndex: publicState.roundIndex,
    status: publicState.status,
    currentWord: publicState.currentWord,
    called: publicState.called,
    autoPullEnabled: publicState.autoPullEnabled,
    hypeMessage: publicState.hypeMessage,
    hypeUpdatedAt: publicState.hypeUpdatedAt,
    countdownEndsAt: publicState.countdownEndsAt,
    breakEndsAt: publicState.breakEndsAt,
    playEndsAt: publicState.playEndsAt,
    pausedAt: publicState.pausedAt,
    playRemainingMs: publicState.playRemainingMs,
    nextPullAt: publicState.nextPullAt,
    updatedAt: publicState.updatedAt,
    round: publicState.round,
    rounds: publicState.rounds,
    joinUrl: publicState.joinUrl,
    qrUrl: publicState.qrUrl,
    autoPullEverySeconds: publicState.autoPullEverySeconds,
    pregameCountdownSeconds: publicState.pregameCountdownSeconds,
    latestClaim: publicState.latestClaim,
    serverTime: publicState.serverTime,
  };
}

function shuffle(items) {
  const copy = items.map((item) => ({ ...item }));
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function markUpdated() {
  state.updatedAt = Date.now();
  broadcast();
  scheduleStorageSave();
}

async function commitState() {
  markUpdated();
  await flushStateToStorage();
}

function supabaseConfig() {
  return {
    url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, ""),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || process.env.SUPABASE_ANON_KEY
      || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

function supabaseBrowserConfig() {
  const config = supabaseConfig();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  return {
    url: config.url,
    key: publishableKey,
    publicStateTable: SUPABASE_PUBLIC_STATE_TABLE,
  };
}

function isSupabaseConfigured() {
  const config = supabaseConfig();
  return Boolean(config.url && config.key);
}

function publicStorageStatus() {
  return {
    provider: storageStatus.provider,
    configured: storageStatus.configured,
    available: storageStatus.available,
    lastLoadedAt: storageStatus.lastLoadedAt,
    lastSavedAt: storageStatus.lastSavedAt,
    error: storageStatus.error ? "Supabase storage unavailable" : null,
  };
}

function shouldBlockUnhydratedStateResponse() {
  return Boolean(
    storageStatus.configured
    && !storageStatus.available
    && !storageStatus.lastLoadedAt
    && !storageStatus.lastSavedAt
  );
}

function unavailableStateResponse() {
  return {
    error: "Game state is temporarily unavailable. Keep your current card on screen.",
    storage: publicStorageStatus(),
  };
}

function roleCanAdvanceGameClock(role) {
  return role === "host" || role === "display";
}

function roleFromNodeRequest(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return String(url.searchParams.get("role") || req.headers["x-bingo-role"] || "").toLowerCase();
}

function roleFromWebRequest(request) {
  const url = new URL(request.url);
  return String(url.searchParams.get("role") || request.headers.get("x-bingo-role") || "").toLowerCase();
}

async function prepareStateForRequest(canAdvanceGameClock) {
  await hydrateGameStoreFromStorage();
  await hydrateStateFromStorage({ force: true });
  if (!canAdvanceGameClock) return;
  const timingClamped = clampLivePullTimer();
  if (advanceState() || timingClamped) await flushStateToStorage();
}

async function hydrateStateFromStorage({ force = false } = {}) {
  if (!force && storageHydrated) return;
  if (!force && storageHydrationPromise) return storageHydrationPromise;
  if (force) {
    storageHydrationPromise = null;
    storageHydrated = false;
  }
  storageHydrationPromise = (async () => {
    storageStatus.configured = isSupabaseConfigured();
    if (!storageStatus.configured) {
      storageHydrated = true;
      return;
    }
    try {
      const rows = await supabaseRequest(
        `${SUPABASE_STATE_TABLE}?id=eq.${encodeURIComponent(GAME_STATE_ROW_ID)}&select=state`,
      );
      const snapshot = Array.isArray(rows) ? rows[0]?.state : null;
      if (isValidStateSnapshot(snapshot) && shouldUseStorageSnapshot(snapshot)) {
        state = normalizeStateSnapshot(snapshot);
        storageStatus.lastLoadedAt = Date.now();
      }
      storageStatus.available = true;
      storageStatus.error = null;
    } catch (error) {
      storageStatus.available = false;
      storageStatus.error = error.message || "Could not load Supabase state";
      console.warn("Supabase state load skipped:", storageStatus.error);
    } finally {
      storageHydrated = true;
      storageHydrationPromise = null;
    }
  })();
  return storageHydrationPromise;
}

function isValidStateSnapshot(snapshot) {
  return Boolean(snapshot && typeof snapshot === "object" && typeof snapshot.status === "string" && Array.isArray(snapshot.deck));
}

function shouldUseStorageSnapshot(snapshot) {
  if (!storageStatus.lastLoadedAt && !storageStatus.lastSavedAt) return true;
  const snapshotUpdatedAt = Number(snapshot.updatedAt) || 0;
  const localUpdatedAt = Number(state.updatedAt) || 0;
  return snapshotUpdatedAt >= localUpdatedAt;
}

function normalizeStateSnapshot(snapshot) {
  return {
    ...freshState(),
    ...snapshot,
    currentWord: compactMoment(snapshot.currentWord),
    called: compactMoments(snapshot.called),
    deck: Array.isArray(snapshot.deck) ? compactMoments(snapshot.deck) : shuffle(activeMoments()),
    claims: Array.isArray(snapshot.claims) ? snapshot.claims : [],
    autoPullEnabled: snapshot.autoPullEnabled !== false,
    updatedAt: Number(snapshot.updatedAt) || Date.now(),
  };
}

function clampLivePullTimer() {
  if (state.status !== "playing" || !state.nextPullAt) return false;
  const latestAllowedPullAt = Date.now() + PULL_INTERVAL_MS;
  if (state.nextPullAt <= latestAllowedPullAt) return false;
  state.nextPullAt = latestAllowedPullAt;
  markUpdated();
  return true;
}

function scheduleStorageSave() {
  if (!isSupabaseConfigured()) return;
  clearTimeout(storageSaveTimer);
  storageSaveTimer = setTimeout(() => {
    saveStateToStorage().catch((error) => {
      storageStatus.available = false;
      storageStatus.error = error.message || "Could not save Supabase state";
      console.warn("Supabase state save skipped:", storageStatus.error);
    });
  }, 250);
}

async function flushStateToStorage() {
  if (!isSupabaseConfigured()) return;
  clearTimeout(storageSaveTimer);
  storageSaveTimer = null;
  try {
    await saveStateToStorage();
  } catch (error) {
    storageStatus.available = false;
    storageStatus.error = error.message || "Could not save Supabase state";
    console.warn("Supabase state save skipped:", storageStatus.error);
  }
}

async function saveStateToStorage() {
  await Promise.all([
    saveFullStateToStorage(),
    savePublicStateToStorage(),
  ]);
  storageStatus.configured = true;
  storageStatus.available = true;
  storageStatus.lastSavedAt = Date.now();
  storageStatus.error = null;
}

async function saveFullStateToStorage() {
  await supabaseRequest(`${SUPABASE_STATE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: GAME_STATE_ROW_ID,
      state,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function savePublicStateToStorage() {
  await supabaseRequest(`${SUPABASE_PUBLIC_STATE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: GAME_STATE_ROW_ID,
      state: playerPublicStateForOrigin(""),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function supabaseRequest(pathname, options = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.key) throw new Error("Supabase is not configured");
  const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail || response.statusText}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function leaderboardFromClaims() {
  const scores = new Map();
  for (const claim of state.claims) {
    const current = scores.get(claim.player) || { player: claim.player, points: 0, bingos: 0 };
    current.points += claim.points || 100;
    current.bingos += claim.bingoCount || 1;
    scores.set(claim.player, current);
  }
  return [...scores.values()].sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

function bingoLines() {
  return [
    { id: "row-1", label: "Top Row", cells: [0, 1, 2, 3, 4] },
    { id: "row-2", label: "Second Row", cells: [5, 6, 7, 8, 9] },
    { id: "row-3", label: "Middle Row", cells: [10, 11, 12, 13, 14] },
    { id: "row-4", label: "Fourth Row", cells: [15, 16, 17, 18, 19] },
    { id: "row-5", label: "Bottom Row", cells: [20, 21, 22, 23, 24] },
    { id: "col-1", label: "B Column", cells: [0, 5, 10, 15, 20] },
    { id: "col-2", label: "I Column", cells: [1, 6, 11, 16, 21] },
    { id: "col-3", label: "N Column", cells: [2, 7, 12, 17, 22] },
    { id: "col-4", label: "G Column", cells: [3, 8, 13, 18, 23] },
    { id: "col-5", label: "O Column", cells: [4, 9, 14, 19, 24] },
    { id: "diag-1", label: "Diagonal", cells: [0, 6, 12, 18, 24] },
    { id: "diag-2", label: "Diagonal", cells: [4, 8, 12, 16, 20] },
  ];
}

function cardSigningSecret() {
  return process.env.BINGO_CARD_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
}

function signCardPayload(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", cardSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyCardToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;
  const expected = crypto
    .createHmac("sha256", cardSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function createSignedCard(player, number) {
  const sourceMoments = activeMoments();
  const pool = shuffleValues(sourceMoments.map((moment) => moment.text)).slice(0, 24);
  const cells = [];
  for (let index = 0; index < 25; index += 1) {
    cells.push(index === 12 ? "FREE" : pool.shift());
  }
  const payload = {
    v: 1,
    player,
    roundIndex: state.roundIndex,
    number,
    cells,
  };
  return {
    number,
    cells,
    token: signCardPayload(payload),
  };
}

function shuffleValues(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function dealSignedCards(player, count) {
  const cardCount = Math.max(1, Math.min(3, Number(count || 1)));
  return Array.from({ length: cardCount }, (_, index) => createSignedCard(player, index + 1));
}

function normalizeCardCells(cells) {
  if (!Array.isArray(cells) || cells.length !== 25) return null;
  return cells.map((cell) => String(cell || "").slice(0, 80));
}

function sameCells(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((cell, index) => cell === right[index]);
}

function cardFingerprint(cells) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(cells))
    .digest("base64url");
}

function normalizeSelectedIndices(selected) {
  const set = new Set(Array.isArray(selected) ? selected : []);
  set.add(12);
  return new Set([...set]
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < 25));
}

function completedBingosForCard(cells, selectedIndices, pattern, calledWords) {
  const marked = Array.from({ length: 25 }, (_, index) => {
    if (!selectedIndices.has(index)) return false;
    const word = cells[index];
    return word === "FREE" || calledWords.has(word);
  });
  const allCells = marked.map((_, index) => index);
  const regularBingos = bingoLines()
    .filter((line) => line.cells.every((index) => marked[index]))
    .map((line) => ({ ...line, words: line.cells.map((index) => cells[index]), points: 100 }));

  if (pattern === "Blackout") {
    return marked.every(Boolean)
      ? [{ id: "blackout", label: "Blackout Bingo", cells: allCells, words: cells, points: 500 }]
      : [];
  }

  if (pattern === "X Pattern") {
    const x = [0, 4, 6, 8, 12, 16, 18, 20, 24];
    const bonus = x.every((index) => marked[index])
      ? [{ id: "x-pattern", label: "X Bingo Bonus", cells: x, words: x.map((index) => cells[index]), points: 200 }]
      : [];
    return [...regularBingos, ...bonus];
  }

  if (pattern === "Four Corners") {
    const corners = [0, 4, 20, 24];
    const bonus = corners.every((index) => marked[index])
      ? [{ id: "four-corners", label: "Four Corners Bonus", cells: corners, words: corners.map((index) => cells[index]), points: 50 }]
      : [];
    return [...regularBingos, ...bonus];
  }

  return regularBingos;
}

function cardRoundMatchesCurrentRound(cardRoundIndex) {
  return cardRoundIndex === state.roundIndex
    || (isFinalRoundIndex(state.roundIndex) && cardRoundIndex === state.roundIndex - 1);
}

function alreadyClaimedPattern(player, cardNumber, bingoId, fingerprint) {
  const currentRound = rounds[state.roundIndex]?.name;
  return state.claims.some((claim) => {
    const sameRound = claim.roundIndex === state.roundIndex || claim.round === currentRound;
    const sameCard = claim.cardFingerprint && fingerprint
      ? claim.cardFingerprint === fingerprint
      : Number(claim.card) === Number(cardNumber);
    return sameRound
      && claim.player === player
      && sameCard
      && Array.isArray(claim.bingos)
      && claim.bingos.some((bingo) => bingo.id === bingoId);
  });
}

function validateClaimBody(body) {
  if (state.status !== "playing") {
    return { status: 409, body: { error: "BINGO claims are only accepted during a live round." } };
  }

  const player = String(body.player || "Player").slice(0, 40);
  const cardNumber = Number(body.card || 1);
  const cells = normalizeCardCells(body.cells);
  const tokenPayload = verifyCardToken(body.cardToken);
  if (!cells || !tokenPayload) {
    return { status: 400, body: { error: "Could not verify this bingo card. Refresh your card and try again." } };
  }
  if (
    tokenPayload.v !== 1
    || tokenPayload.player !== player
    || !cardRoundMatchesCurrentRound(tokenPayload.roundIndex)
    || Number(tokenPayload.number) !== cardNumber
    || !sameCells(tokenPayload.cells, cells)
  ) {
    return { status: 409, body: { error: "This bingo card does not match the current round. Refresh your card and try again." } };
  }

  const calledWords = new Set(state.called.map((word) => word.text));
  const selectedIndices = normalizeSelectedIndices(body.selected);
  const fingerprint = cardFingerprint(cells);
  const requestedIds = new Set((Array.isArray(body.bingos) ? body.bingos : [])
    .map((bingo) => String(bingo?.id || "").slice(0, 80))
    .filter(Boolean));
  const completed = completedBingosForCard(cells, selectedIndices, rounds[state.roundIndex].pattern, calledWords);
  const candidateBingos = completed.filter((bingo) => !requestedIds.size || requestedIds.has(bingo.id));
  const uniqueBingos = [...new Map(candidateBingos.map((bingo) => [bingo.id, bingo])).values()];
  const newBingos = uniqueBingos.filter((bingo) => !alreadyClaimedPattern(player, cardNumber, bingo.id, fingerprint));

  if (!completed.length || !candidateBingos.length) {
    return { status: 400, body: { error: "No completed BINGO pattern was submitted." } };
  }
  if (!newBingos.length) {
    return { status: 409, body: { error: "That BINGO was already claimed on this card." } };
  }

  const points = newBingos.reduce((sum, bingo) => sum + bingo.points, 0);
  const claim = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    player,
    card: cardNumber,
    cardFingerprint: fingerprint,
    bingos: newBingos,
    bingoCount: newBingos.length,
    points,
    pattern: rounds[state.roundIndex].pattern,
    round: rounds[state.roundIndex].name,
    roundIndex: state.roundIndex,
    createdAt: Date.now(),
  };
  return { status: 200, body: { ok: true, claim } };
}

function drawNextMoment({ resetTimer = true } = {}) {
  if (state.status !== "playing") return false;
  if (!hasEnoughTimeForNextPull()) return false;
  const sourceMoments = activeMoments();
  if (!state.deck.length) {
    state.deck = shuffle(sourceMoments.filter((moment) => !state.called.some((word) => word.text === moment.text)));
    if (!state.deck.length) state.deck = shuffle(sourceMoments);
  }
  const next = state.deck.shift();
  if (!next) {
    state.nextPullAt = null;
    return false;
  }
  state.currentWord = next;
  state.called.unshift(next);
  state.nextPullAt = resetTimer ? Date.now() + PULL_INTERVAL_MS : state.nextPullAt;
  return true;
}

function hasEnoughTimeForNextPull(now = Date.now()) {
  if (!state.playEndsAt) return true;
  return state.playEndsAt - now >= PULL_INTERVAL_MS;
}

function ensureLiveRoundHasMoment() {
  if (state.status !== "playing") return false;
  if (state.currentWord || state.called.length) return false;
  return drawNextMoment({ resetTimer: true });
}

function buildRoundDeck(previousRoundCalled = []) {
  const sourceMoments = activeMoments();
  if (!isFinalRoundIndex(state.roundIndex)) return shuffle(sourceMoments);
  const previousTexts = new Set((previousRoundCalled || []).map((moment) => moment?.text).filter(Boolean));
  const newMoments = sourceMoments.filter((moment) => !previousTexts.has(moment.text));
  const duplicateMoments = sourceMoments.filter((moment) => previousTexts.has(moment.text));
  return [...shuffle(newMoments), ...shuffle(duplicateMoments)];
}

function startCurrentRound({ resetClaims = false, previousRoundCalled = state.called } = {}) {
  const round = rounds[state.roundIndex] || rounds[rounds.length - 1];
  state.status = "playing";
  state.currentWord = null;
  state.called = [];
  state.deck = buildRoundDeck(previousRoundCalled);
  if (resetClaims) state.claims = [];
  state.countdownEndsAt = null;
  state.breakEndsAt = null;
  state.pausedAt = null;
  state.playRemainingMs = null;
  state.playEndsAt = Date.now() + round.playMinutes * 60 * 1000;
  state.nextPullAt = Date.now() + PULL_INTERVAL_MS;
  drawNextMoment({ resetTimer: true });
}

function startOpeningCountdown() {
  state.roundIndex = 0;
  state.status = "countdown";
  state.currentWord = null;
  state.called = [];
  state.deck = shuffle(moments);
  state.claims = [];
  state.countdownEndsAt = Date.now() + PREGAME_COUNTDOWN_MS;
  state.breakEndsAt = null;
  state.playEndsAt = null;
  state.pausedAt = null;
  state.playRemainingMs = null;
  state.nextPullAt = null;
  state.autoPullEnabled = true;
}

function startBreakOrEndEvent() {
  state.currentWord = null;
  state.countdownEndsAt = null;
  state.playEndsAt = null;
  state.pausedAt = null;
  state.playRemainingMs = null;
  state.nextPullAt = null;
  if (state.roundIndex >= rounds.length - 1) {
    state.status = "ended";
    state.breakEndsAt = null;
    return;
  }
  state.status = "break";
  state.breakEndsAt = Date.now() + BREAK_MS;
}

function startNextRound() {
  if (state.roundIndex >= rounds.length - 1) {
    startBreakOrEndEvent();
    return;
  }
  const previousRoundCalled = state.called;
  state.roundIndex += 1;
  startCurrentRound({ previousRoundCalled });
}

function advanceState() {
  const now = Date.now();
  if (state.status === "countdown" && state.countdownEndsAt && now >= state.countdownEndsAt) {
    startCurrentRound({ resetClaims: true });
    markUpdated();
    return true;
  }
  if (state.status === "playing" && state.playEndsAt && now >= state.playEndsAt) {
    startBreakOrEndEvent();
    markUpdated();
    return true;
  }
  if (state.status === "break" && state.breakEndsAt && now >= state.breakEndsAt) {
    startNextRound();
    markUpdated();
    return true;
  }
  if (state.status === "playing" && state.nextPullAt && now >= state.nextPullAt && !hasEnoughTimeForNextPull(now)) {
    state.nextPullAt = null;
    markUpdated();
    return true;
  }
  if (state.status === "playing" && state.autoPullEnabled !== false && state.nextPullAt && now >= state.nextPullAt && drawNextMoment()) {
    markUpdated();
    return true;
  }
  if (ensureLiveRoundHasMoment()) {
    markUpdated();
    return true;
  }
  return false;
}

function pauseRound() {
  if (state.status !== "playing") return false;
  const now = Date.now();
  state.status = "paused";
  state.pausedAt = now;
  state.playRemainingMs = state.playEndsAt ? Math.max(0, state.playEndsAt - now) : null;
  state.nextPullRemainingMs = state.nextPullAt ? Math.max(0, state.nextPullAt - now) : PULL_INTERVAL_MS;
  state.playEndsAt = null;
  state.nextPullAt = null;
  return true;
}

function resumeRound() {
  if (state.status !== "paused") return false;
  const now = Date.now();
  state.status = "playing";
  state.playEndsAt = state.playRemainingMs ? now + state.playRemainingMs : null;
  state.nextPullAt = now + Math.max(1000, Number(state.nextPullRemainingMs || PULL_INTERVAL_MS));
  state.pausedAt = null;
  state.playRemainingMs = null;
  state.nextPullRemainingMs = null;
  return true;
}

function undoLastCall() {
  const last = state.called.shift();
  if (!last) return false;
  state.deck.unshift(last);
  state.currentWord = state.called[0] || null;
  state.nextPullAt = state.status === "playing" ? Date.now() + PULL_INTERVAL_MS : state.nextPullAt;
  return true;
}

function sendHypeReminder(message) {
  const clean = String(message || HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)]).slice(0, 160);
  state.hypeMessage = clean || HYPE_MESSAGES[0];
  state.hypeUpdatedAt = Date.now();
}

function prunePresence() {
  const cutoff = Date.now() - 45 * 1000;
  for (const roleMap of Object.values(presence)) {
    for (const [id, entry] of roleMap.entries()) {
      if (!entry.lastSeenAt || entry.lastSeenAt < cutoff) roleMap.delete(id);
    }
  }
}

function updatePresence(role, id, detail = {}) {
  const safeRole = ["host", "display", "player"].includes(role) ? role : "player";
  const safeId = String(id || `${safeRole}-${Math.random().toString(16).slice(2)}`).slice(0, 80);
  presence[safeRole].set(safeId, {
    ...presence[safeRole].get(safeId),
    ...detail,
    id: safeId,
    role: safeRole,
    lastSeenAt: Date.now(),
  });
  prunePresence();
  return safeId;
}

function eventHealth(joinUrl) {
  prunePresence();
  const hasCurrentMoment = state.status !== "playing" || Boolean(state.currentWord || state.called.length);
  const storageHealthy = !storageStatus.configured || storageStatus.available;
  return {
    ok: Boolean(joinUrl && storageHealthy && state.deck.length >= 0 && hasCurrentMoment),
    joinReady: Boolean(joinUrl),
    deckReady: state.status === "playing" ? Boolean(state.deck.length || state.currentWord) : activeMoments().length >= 24,
    currentMomentReady: hasCurrentMoment,
    storageHealthy,
    displayConnected: presence.display.size > 0,
    hostConnected: presence.host.size > 0,
    activePlayers: presence.player.size,
    lastDisplaySeenAt: latestPresenceTime("display"),
    lastPlayerSeenAt: latestPresenceTime("player"),
  };
}

function latestPresenceTime(role) {
  return Math.max(0, ...[...presence[role].values()].map((entry) => entry.lastSeenAt || 0)) || null;
}

function startStateTimer() {
  return setInterval(() => {
    advanceState();
  }, 500);
}

function broadcast() {
  const data = `data: ${JSON.stringify({ type: "state", updatedAt: state.updatedAt })}\n\n`;
  for (const res of clients) res.write(data);
}

function getLocalIp() {
  for (const network of Object.values(os.networkInterfaces())) {
    for (const address of network || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "localhost";
}

function getOrigin(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return `http://${getLocalIp()}:${PORT}`;
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function publicJoinUrlFromEnv() {
  const explicitUrl = process.env.PUBLIC_JOIN_URL || process.env.NEXT_PUBLIC_JOIN_URL;
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}/play`;
  }
  return "";
}

function joinUrlForOrigin(origin) {
  return PUBLIC_JOIN_URL || `${origin}/play`;
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function adminGamesPayload() {
  return {
    ok: true,
    activeGameId: gameStore.activeGameId,
    imageSearchConfigured: imageSearchConfigured(),
    games: gameStore.games.map(publicGameSummary),
    details: gameStore.games.map(publicGameDetail),
  };
}

function findGameOrThrow(id) {
  const game = gameStore.games.find((candidate) => candidate.id === id);
  if (!game) {
    const error = new Error("Game not found.");
    error.status = 404;
    throw error;
  }
  return game;
}

function touchGame(game) {
  game.updatedAt = new Date().toISOString();
  game.status = normalizeGameStatus(game.status, game.wordDeck);
}

async function handleAdminApi(pathname, body = {}) {
  if (pathname === "/api/admin/games/create") {
    const game = createGameFromTheme(body);
    gameStore.games.unshift(game);
    await saveGameStore();
    return { ok: true, game: publicGameDetail(game), ...adminGamesPayload() };
  }

  if (pathname === "/api/admin/games/save") {
    const incoming = normalizeGame(body.game || body);
    if (!incoming) return { error: "Invalid game payload.", status: 400 };
    const index = gameStore.games.findIndex((game) => game.id === incoming.id);
    incoming.updatedAt = new Date().toISOString();
    if (index >= 0) gameStore.games[index] = incoming;
    else gameStore.games.unshift(incoming);
    await saveGameStore();
    return { ok: true, game: publicGameDetail(incoming), ...adminGamesPayload() };
  }

  if (pathname === "/api/admin/games/delete") {
    const id = String(body.id || "");
    if (gameStore.games.length <= 1) return { error: "Keep at least one saved game.", status: 409 };
    gameStore.games = gameStore.games.filter((game) => game.id !== id);
    if (gameStore.activeGameId === id) gameStore.activeGameId = gameStore.games[0]?.id || "";
    await saveGameStore();
    return adminGamesPayload();
  }

  if (pathname === "/api/admin/games/duplicate") {
    const source = findGameOrThrow(String(body.id || ""));
    const now = new Date().toISOString();
    const copy = normalizeGame({
      ...JSON.parse(JSON.stringify(source)),
      id: crypto.randomUUID(),
      title: `${source.title} Copy`,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    gameStore.games.unshift(copy);
    await saveGameStore();
    return { ok: true, game: publicGameDetail(copy), ...adminGamesPayload() };
  }

  if (pathname === "/api/admin/games/generate-words") {
    const game = findGameOrThrow(String(body.id || ""));
    game.theme = String(body.theme || game.theme).slice(0, 100);
    game.title = String(body.title || game.title || `${game.theme} Bingo`).slice(0, 100);
    game.wordDeck = generateThemeDeck(game.theme, body.count || game.wordDeck.length || 75);
    game.status = "draft";
    touchGame(game);
    await saveGameStore();
    return { ok: true, game: publicGameDetail(game), ...adminGamesPayload() };
  }

  if (pathname === "/api/admin/games/recommend-images") {
    const game = findGameOrThrow(String(body.id || ""));
    const itemIds = body.itemId
      ? [String(body.itemId)]
      : game.wordDeck.filter((item) => item.imageStatus !== "approved").map((item) => item.id);
    for (const itemId of itemIds.slice(0, 100)) {
      const item = game.wordDeck.find((candidate) => candidate.id === itemId);
      if (!item) continue;
      item.imageRecommendations = await getImageRecommendations(game, item);
      if (item.imageStatus !== "approved") item.imageStatus = "pending";
    }
    game.status = "image review";
    touchGame(game);
    await saveGameStore();
    return { ok: true, game: publicGameDetail(game), ...adminGamesPayload() };
  }

  if (pathname === "/api/admin/games/approve-image") {
    const game = findGameOrThrow(String(body.id || ""));
    const item = game.wordDeck.find((candidate) => candidate.id === String(body.itemId || ""));
    if (!item) return { error: "Word deck item not found.", status: 404 };
    const rec = item.imageRecommendations.find((candidate) => candidate.id === String(body.recommendationId || ""))
      || normalizeRecommendation({
        imageUrl: body.imageUrl,
        thumbnailUrl: body.imageUrl,
        sourceUrl: body.sourceUrl || body.imageUrl,
        sourceName: body.sourceName || "Custom image",
      });
    if (!rec) return { error: "Choose an image to approve.", status: 400 };
    item.imageRecommendations = item.imageRecommendations.map((candidate) => ({
      ...candidate,
      status: candidate.id === rec.id ? "approved" : candidate.status === "approved" ? "pending" : candidate.status,
    }));
    if (!item.imageRecommendations.some((candidate) => candidate.id === rec.id)) {
      rec.status = "approved";
      item.imageRecommendations.unshift(rec);
    }
    item.approvedImageUrl = rec.imageUrl;
    item.imageSourceUrl = rec.sourceUrl || rec.imageUrl;
    item.imageStatus = "approved";
    game.status = gameReadyFromDeck(game.wordDeck).ready ? "approved" : "image review";
    touchGame(game);
    await saveGameStore();
    imageCache.clear();
    return { ok: true, game: publicGameDetail(game), ...adminGamesPayload() };
  }

  if (pathname === "/api/admin/games/deny-image") {
    const game = findGameOrThrow(String(body.id || ""));
    const item = game.wordDeck.find((candidate) => candidate.id === String(body.itemId || ""));
    if (!item) return { error: "Word deck item not found.", status: 404 };
    const rec = item.imageRecommendations.find((candidate) => candidate.id === String(body.recommendationId || ""));
    if (rec) rec.status = "denied";
    if (item.approvedImageUrl && rec?.imageUrl === item.approvedImageUrl) {
      item.approvedImageUrl = "";
      item.imageSourceUrl = "";
      item.imageStatus = "pending";
    }
    game.status = "image review";
    touchGame(game);
    await saveGameStore();
    imageCache.clear();
    return { ok: true, game: publicGameDetail(game), ...adminGamesPayload() };
  }

  if (pathname === "/api/admin/games/custom-image") {
    const game = findGameOrThrow(String(body.id || ""));
    const item = game.wordDeck.find((candidate) => candidate.id === String(body.itemId || ""));
    const imageUrl = String(body.imageUrl || "").trim();
    if (!item) return { error: "Word deck item not found.", status: 404 };
    if (!imageUrl) return { error: "Paste an image URL first.", status: 400 };
    const rec = normalizeRecommendation({
      imageUrl,
      thumbnailUrl: imageUrl,
      sourceUrl: String(body.sourceUrl || imageUrl),
      sourceName: "Custom image",
      status: "approved",
    });
    item.imageRecommendations.unshift(rec);
    item.approvedImageUrl = imageUrl;
    item.imageSourceUrl = rec.sourceUrl;
    item.imageStatus = "approved";
    game.status = gameReadyFromDeck(game.wordDeck).ready ? "approved" : "image review";
    touchGame(game);
    await saveGameStore();
    imageCache.clear();
    return { ok: true, game: publicGameDetail(game), ...adminGamesPayload() };
  }

  if (pathname === "/api/admin/games/start-live") {
    const game = findGameOrThrow(String(body.id || ""));
    const progress = gameReadyFromDeck(game.wordDeck);
    if (!progress.ready) {
      return {
        error: `Approve images for every word before going live. ${progress.approvedCount}/${progress.totalCount} approved.`,
        status: 409,
      };
    }
    for (const candidate of gameStore.games) {
      if (candidate.status === "live") candidate.status = "completed";
    }
    game.status = "live";
    touchGame(game);
    gameStore.activeGameId = game.id;
    state = freshState();
    await saveGameStore();
    await commitState();
    imageCache.clear();
    return { ok: true, liveState: publicStateForOrigin(""), game: publicGameDetail(game), ...adminGamesPayload() };
  }

  return { error: "Not found", status: 404 };
}

function imageSearchQuery(text, category) {
  const overrides = {
    "Barbie": "Barbie 2023 film",
    "Kenough": "Kenough Barbie",
    "Mamma Mia": "Mamma Mia film",
    "Top Gun": "Top Gun film",
    "Maverick": "Top Gun Maverick film",
    "The Notebook": "The Notebook film",
    "Mean Girls": "Mean Girls film",
    "Legally Blonde": "Legally Blonde film",
    "Star Wars": "Star Wars film",
    "Jurassic Park": "Jurassic Park film",
    "Men in Black": "Men in Black film",
    "Austin Powers": "Austin Powers film",
    "The Office": "The Office (American TV series)",
    "The Rachel": "The Rachel haircut Friends",
    "Fresh Prince": "The Fresh Prince of Bel-Air",
    "Saved by Bell": "Saved by the Bell",
    "Game of Thrones": "Game of Thrones TV series",
    "Winter Is Coming": "Winter Is Coming Game of Thrones",
    "The Upside Down": "Upside Down Stranger Things",
    "Real Housewives": "The Real Housewives",
    "Jersey Shore": "Jersey Shore TV series",
    "Love Island": "Love Island TV series",
    "Hot Ones": "Hot Ones",
    "Carpool Karaoke": "Carpool Karaoke",
    "Dancing Queen": "Dancing Queen ABBA",
    "Single Ladies": "Single Ladies Beyoncé",
    "Cowboy Carter": "Cowboy Carter Beyoncé",
    "Pink Pony Club": "Pink Pony Club Chappell Roan",
    "Espresso": "Espresso Sabrina Carpenter song",
    "Bad Bunny": "Bad Bunny musician",
    "Uptown Funk": "Uptown Funk",
    "Thriller": "Thriller Michael Jackson",
    "Purple Rain": "Purple Rain Prince",
    "Material Girl": "Material Girl Madonna",
    "Oops": "Oops I Did It Again",
    "Bye Bye Bye": "Bye Bye Bye NSYNC",
    "No Scrubs": "No Scrubs TLC",
    "Waterfalls": "Waterfalls TLC song",
    "Hey Ya": "Hey Ya Outkast",
    "Hollaback Girl": "Hollaback Girl Gwen Stefani",
    "Old Town Road": "Old Town Road",
    "Margaritaville": "Margaritaville Jimmy Buffett",
    "Yacht Rock": "Yacht rock",
    "Super Bowl": "Super Bowl halftime show",
    "World Cup": "FIFA World Cup",
    "March Madness": "NCAA March Madness",
    "The Last Dance": "The Last Dance documentary",
    "Halftime Show": "Super Bowl halftime show",
    "Denim Duo": "Britney Spears Justin Timberlake denim",
    "Left Shark": "Left Shark",
    "Royal Wedding": "wedding of Prince William and Catherine Middleton",
    "You Get a Car": "Oprah You get a car",
    "Kenergy": "Barbie Ken Kenergy",
    "Main Character": "main character syndrome",
    "It Girl": "It girl fashion icon",
    "Meme Queen": "internet meme",
    "Viral Dance": "viral dance TikTok",
    "Girl Dinner": "girl dinner meme",
    "Brat Summer": "Brat summer Charli XCX",
    "Very Demure": "very demure meme",
    "Slime Time": "Nickelodeon slime",
    "Beanie Babies": "Beanie Babies",
    "Blockbuster": "Blockbuster LLC",
    "TRL": "Total Request Live",
  };

  if (overrides[text]) return ["Internet", "Celebrity", "Style", "Throwback"].includes(category)
    ? `pop culture moment ${overrides[text]}`
    : overrides[text];
  if (category === "Movies") return `${text} film`;
  if (category === "TV") return `${text} TV series`;
  if (category === "Music") return `${text} song`;
  if (category === "Internet") return `pop culture moment ${text} meme`;
  return `pop culture moment ${text}`;
}

async function findMomentImage(text, category) {
  const key = `${text}|${category || ""}`;
  if (imageCache.has(key)) return imageCache.get(key);

  const activeItem = getActiveGame().wordDeck.find((item) => item.word === text && item.approvedImageUrl);
  if (activeItem) {
    const result = {
      ok: true,
      url: activeItem.approvedImageUrl,
      title: activeItem.word,
      query: imageSearchQuery(text, category),
      source: activeItem.imageSourceUrl || "Approved theme image",
      cached: true,
    };
    imageCache.set(key, result);
    return result;
  }

  const query = imageSearchQuery(text, category);
  const manifestItem = googleImageManifest[text];
  if (manifestItem?.image) {
    const result = {
      ok: true,
      url: manifestItem.image,
      title: manifestItem.alt || text,
      query: manifestItem.query || query,
      source: manifestItem.source || "Google Images",
      width: manifestItem.width,
      height: manifestItem.height,
      qualityScore: manifestItem.qualityScore,
      cached: true,
    };
    imageCache.set(key, result);
    return result;
  }

  try {
    const googleResult = await googleImageSearch(query);
    if (googleResult) {
      const result = { ...googleResult, query, source: "Google Images" };
      imageCache.set(key, result);
      return result;
    }

    const result = {
      ok: false,
      query,
      source: "Google Images",
      error: "No usable Google Images result returned.",
    };
    imageCache.set(key, result);
    return result;
  } catch (error) {
    const result = { ok: false, query, source: "Google Images", error: error.message };
    imageCache.set(key, result);
    return result;
  }
}

function loadGoogleImageManifest() {
  try {
    return require("./public/assets/google-image-manifest.json");
  } catch {
    // Fall through to filesystem loading for the standalone local server.
  }
  try {
    return JSON.parse(fs.readFileSync(GOOGLE_IMAGE_MANIFEST_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function googleImageSearch(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_CX || process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (apiKey && searchEngineId) {
    const params = new URLSearchParams({
      key: apiKey,
      cx: searchEngineId,
      searchType: "image",
      num: "1",
      safe: "active",
      q: query,
    });
    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (response.ok) {
      const data = await response.json();
      const item = data.items?.[0];
      if (item?.link) return { ok: true, url: item.link, title: item.title || query };
    }
  }
  return null;
}

function imageSearchConfigured() {
  return Boolean(
    (process.env.GOOGLE_API_KEY && (process.env.GOOGLE_CX || process.env.GOOGLE_SEARCH_ENGINE_ID))
    || process.env.BING_IMAGE_SEARCH_KEY
    || process.env.SERPAPI_KEY
  );
}

async function getImageRecommendations(game, item) {
  const query = `${item.word} ${game.theme} bingo visual`;
  const results = [];
  results.push(...await googleImageRecommendations(query));
  results.push(...await bingImageRecommendations(query));
  results.push(...await serpApiImageRecommendations(query));
  if (!results.length) {
    results.push(...[0, 1, 2].map((index) => generatedRecommendation(game, item, index)));
  }
  return results.slice(0, 6).map((result, index) => normalizeRecommendation({
    id: `${item.id}-rec-${Date.now()}-${index}`,
    ...result,
    status: "pending",
  }));
}

async function googleImageRecommendations(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_CX || process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!apiKey || !searchEngineId) return [];
  const params = new URLSearchParams({
    key: apiKey,
    cx: searchEngineId,
    searchType: "image",
    num: "6",
    safe: "active",
    q: query,
  });
  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.items || []).map((item) => ({
    imageUrl: item.link,
    thumbnailUrl: item.image?.thumbnailLink || item.link,
    sourceUrl: item.image?.contextLink || item.link,
    sourceName: item.displayLink || "Google Custom Search",
  }));
}

async function bingImageRecommendations(query) {
  const key = process.env.BING_IMAGE_SEARCH_KEY;
  if (!key) return [];
  const endpoint = (process.env.BING_IMAGE_SEARCH_ENDPOINT || "https://api.bing.microsoft.com/v7.0/images/search").replace(/\/$/, "");
  const params = new URLSearchParams({ q: query, safeSearch: "Moderate", count: "6" });
  const response = await fetch(`${endpoint}?${params}`, {
    headers: { "Ocp-Apim-Subscription-Key": key },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.value || []).map((item) => ({
    imageUrl: item.contentUrl,
    thumbnailUrl: item.thumbnailUrl || item.contentUrl,
    sourceUrl: item.hostPageUrl || item.contentUrl,
    sourceName: item.hostPageDisplayUrl || "Bing Image Search",
  }));
}

async function serpApiImageRecommendations(query) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    engine: "google_images",
    api_key: key,
    safe: "active",
    q: query,
  });
  const response = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.images_results || []).slice(0, 6).map((item) => ({
    imageUrl: item.original || item.thumbnail,
    thumbnailUrl: item.thumbnail || item.original,
    sourceUrl: item.link || item.original,
    sourceName: item.source || "SerpAPI",
  }));
}

function generatedRecommendation(game, item, index = 0) {
  const imageUrl = generatedImageDataUrl(item.word, game.theme, index);
  return {
    imageUrl,
    thumbnailUrl: imageUrl,
    sourceUrl: imageUrl,
    sourceName: "Generated placeholder",
  };
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function generatedImageDataUrl(word, theme, variant = 0) {
  const palettes = [
    ["#071407", "#dfffc5", "#1f6f52"],
    ["#101010", "#ffffff", "#2d7f3e"],
    ["#082319", "#f4ffed", "#4d9a44"],
  ];
  const [background, foreground, accent] = palettes[variant % palettes.length];
  const safeWord = escapeSvg(word);
  const safeTheme = escapeSvg(theme || "Theme Bingo");
  const initials = escapeSvg(String(word || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase());
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760">
      <rect width="1200" height="760" rx="34" fill="${background}"/>
      <path d="M0 620 C210 520 332 720 520 606 C720 486 850 552 1200 402 L1200 760 L0 760 Z" fill="${accent}" opacity="0.7"/>
      <rect x="56" y="56" width="1088" height="648" rx="28" fill="none" stroke="${foreground}" stroke-width="10" opacity="0.84"/>
      <circle cx="600" cy="312" r="132" fill="${foreground}" opacity="0.92"/>
      <text x="600" y="354" text-anchor="middle" font-family="Arial, sans-serif" font-size="108" font-weight="900" fill="${background}">${initials}</text>
      <text x="600" y="536" text-anchor="middle" font-family="Arial, sans-serif" font-size="66" font-weight="900" fill="${foreground}">${safeWord}</text>
      <text x="600" y="608" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="${foreground}" opacity="0.78">${safeTheme}</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function routeStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/host.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
    };
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

async function routeApi(req, res, pathname) {
  await prepareStateForRequest(roleCanAdvanceGameClock(roleFromNodeRequest(req)));
  if (req.method === "GET" && pathname === "/api/state") {
    if (shouldBlockUnhydratedStateResponse()) {
      sendJson(res, unavailableStateResponse(), 503);
      return;
    }
    sendJson(res, publicState(req));
    return;
  }

  if (req.method === "GET" && pathname === "/api/storage-status") {
    sendJson(res, { ok: true, storage: publicStorageStatus() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/client-config") {
    sendJson(res, { ok: true, supabase: supabaseBrowserConfig() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/games") {
    sendJson(res, adminGamesPayload());
    return;
  }

  if (req.method === "GET" && pathname === "/api/moment-image") {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const text = String(url.searchParams.get("text") || "").slice(0, 80);
    const category = String(url.searchParams.get("category") || "").slice(0, 40);
    if (!text) {
      sendJson(res, { ok: false, error: "Missing text" }, 400);
      return;
    }
    sendJson(res, await findMomentImage(text, category));
    return;
  }

  if (req.method === "GET" && pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(`data: ${JSON.stringify({ type: "connected", updatedAt: state.updatedAt })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, { error: "Not found" }, 404);
    return;
  }

  let body = {};
  try {
    body = await parseBody(req);
  } catch (error) {
    sendJson(res, { error: "Invalid JSON" }, 400);
    return;
  }

  if (shouldBlockUnhydratedStateResponse() && pathname !== "/api/heartbeat") {
    sendJson(res, unavailableStateResponse(), 503);
    return;
  }

  if (pathname.startsWith("/api/admin/games/")) {
    try {
      const result = await handleAdminApi(pathname, body);
      sendJson(res, result, result.status || 200);
    } catch (error) {
      sendJson(res, { error: error.message || "Admin action failed." }, error.status || 500);
    }
    return;
  }

  if (pathname === "/api/deal-cards") {
    const player = String(body.player || "Player").slice(0, 40);
    const cards = dealSignedCards(player, body.count);
    sendJson(res, { ok: true, roundIndex: state.roundIndex, cards });
    return;
  }

  if (pathname === "/api/start-round") {
    startCurrentRound({ resetClaims: state.roundIndex === 0 && state.status !== "break" });
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/heartbeat") {
    const id = updatePresence(
      String(body.role || "player"),
      body.id,
      {
        player: String(body.player || "").slice(0, 40),
        cards: Number(body.cards || 0),
        path: String(body.path || "").slice(0, 80),
      },
    );
    sendJson(res, { ok: true, id, health: eventHealth(joinUrlForOrigin(getOrigin(req))) });
    return;
  }

  if (pathname === "/api/start-countdown") {
    if (state.status === "playing" || state.status === "break") {
      sendJson(res, { error: "Reset the event before starting a new countdown." }, 409);
      return;
    }
    startOpeningCountdown();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/skip-countdown") {
    if (state.status !== "countdown") {
      sendJson(res, { error: "There is no opening countdown to skip." }, 409);
      return;
    }
    startCurrentRound({ resetClaims: true });
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/pull") {
    if (state.status !== "playing") {
      sendJson(res, { error: "Start the round before pulling words." }, 409);
      return;
    }
    if (!hasEnoughTimeForNextPull()) {
      sendJson(res, { error: "Round is ending in less than 20 seconds. No more moments will be pulled." }, 409);
      return;
    }
    if (!drawNextMoment({ resetTimer: true })) {
      sendJson(res, { error: "No more words available." }, 409);
      return;
    }
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/pause-round") {
    if (!pauseRound()) {
      sendJson(res, { error: "Only a live round can be paused." }, 409);
      return;
    }
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/resume-round") {
    if (!resumeRound()) {
      sendJson(res, { error: "Only a paused round can be resumed." }, 409);
      return;
    }
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/end-round") {
    startBreakOrEndEvent();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/undo-call") {
    if (!undoLastCall()) {
      sendJson(res, { error: "There is no called word to undo." }, 409);
      return;
    }
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/toggle-auto-call") {
    state.autoPullEnabled = body.enabled === undefined ? state.autoPullEnabled === false : Boolean(body.enabled);
    if (state.status === "playing" && state.autoPullEnabled && !state.nextPullAt) state.nextPullAt = Date.now() + PULL_INTERVAL_MS;
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/hype") {
    sendHypeReminder(body.message);
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/start-break") {
    startBreakOrEndEvent();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/next-round") {
    startNextRound();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/reset") {
    if (String(body.confirm || "") !== "RESET") {
      sendJson(res, { error: "Type RESET to confirm a full event reset." }, 409);
      return;
    }
    state = freshState();
    await commitState();
    sendJson(res, publicState(req));
    return;
  }

  if (pathname === "/api/claim") {
    const result = validateClaimBody(body);
    if (result.status !== 200) {
      sendJson(res, result.body, result.status);
      return;
    }
    state.claims.unshift(result.body.claim);
    state.claims = state.claims.slice(0, 200);
    await commitState();
    sendJson(res, result.body);
    return;
  }

  sendJson(res, { error: "Not found" }, 404);
}

function webJson(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function webOrigin(request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return `${url.protocol}//${host}`;
  }
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

function publicStateForOrigin(origin) {
  const round = rounds[state.roundIndex] || rounds[rounds.length - 1];
  const joinUrl = joinUrlForOrigin(origin);
  const health = eventHealth(joinUrl);
  return {
    ...state,
    round,
    rounds,
    moments: activeMoments(),
    activeGame: publicGameSummary(getActiveGame()),
    joinUrl,
    qrUrl: joinUrl,
    autoPullEverySeconds: PULL_INTERVAL_MS / 1000,
    pregameCountdownSeconds: PREGAME_COUNTDOWN_MS / 1000,
    leaderboard: leaderboardFromClaims(),
    latestClaim: state.claims[0] || null,
    storage: publicStorageStatus(),
    health,
    serverTime: Date.now(),
  };
}

async function handleApiWebRequest(request, pathname) {
  const method = request.method;
  const origin = webOrigin(request);
  const requestUrl = new URL(request.url);
  await prepareStateForRequest(roleCanAdvanceGameClock(roleFromWebRequest(request)));

  if (method === "GET" && pathname === "/api/state") {
    if (shouldBlockUnhydratedStateResponse()) {
      return webJson(unavailableStateResponse(), 503);
    }
    return webJson(publicStateForOrigin(origin));
  }

  if (method === "GET" && pathname === "/api/moment-image") {
    const text = String(requestUrl.searchParams.get("text") || "").slice(0, 80);
    const category = String(requestUrl.searchParams.get("category") || "").slice(0, 40);
    if (!text) return webJson({ ok: false, error: "Missing text" }, 400);
    return webJson(await findMomentImage(text, category));
  }

  if (method === "GET" && pathname === "/api/storage-status") {
    return webJson({ ok: true, storage: publicStorageStatus() });
  }

  if (method === "GET" && pathname === "/api/client-config") {
    return webJson({ ok: true, supabase: supabaseBrowserConfig() });
  }

  if (method === "GET" && pathname === "/api/admin/games") {
    return webJson(adminGamesPayload());
  }

  if (method !== "POST") {
    return webJson({ error: "Not found" }, 404);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (shouldBlockUnhydratedStateResponse() && pathname !== "/api/heartbeat") {
    return webJson(unavailableStateResponse(), 503);
  }

  if (pathname.startsWith("/api/admin/games/")) {
    try {
      const result = await handleAdminApi(pathname, body);
      return webJson(result, result.status || 200);
    } catch (error) {
      return webJson({ error: error.message || "Admin action failed." }, error.status || 500);
    }
  }

  if (pathname === "/api/deal-cards") {
    const player = String(body.player || "Player").slice(0, 40);
    const cards = dealSignedCards(player, body.count);
    return webJson({ ok: true, roundIndex: state.roundIndex, cards });
  }

  if (pathname === "/api/start-round") {
    startCurrentRound({ resetClaims: state.roundIndex === 0 && state.status !== "break" });
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/heartbeat") {
    const id = updatePresence(
      String(body.role || "player"),
      body.id,
      {
        player: String(body.player || "").slice(0, 40),
        cards: Number(body.cards || 0),
        path: String(body.path || "").slice(0, 80),
      },
    );
    return webJson({ ok: true, id, health: eventHealth(joinUrlForOrigin(origin)) });
  }

  if (pathname === "/api/start-countdown") {
    if (state.status === "playing" || state.status === "break") {
      return webJson({ error: "Reset the event before starting a new countdown." }, 409);
    }
    startOpeningCountdown();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/skip-countdown") {
    if (state.status !== "countdown") {
      return webJson({ error: "There is no opening countdown to skip." }, 409);
    }
    startCurrentRound({ resetClaims: true });
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/pull") {
    if (state.status !== "playing") {
      return webJson({ error: "Start the round before pulling words." }, 409);
    }
    if (!hasEnoughTimeForNextPull()) {
      return webJson({ error: "Round is ending in less than 20 seconds. No more moments will be pulled." }, 409);
    }
    if (!drawNextMoment({ resetTimer: true })) {
      return webJson({ error: "No more words available." }, 409);
    }
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/pause-round") {
    if (!pauseRound()) return webJson({ error: "Only a live round can be paused." }, 409);
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/resume-round") {
    if (!resumeRound()) return webJson({ error: "Only a paused round can be resumed." }, 409);
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/end-round") {
    startBreakOrEndEvent();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/undo-call") {
    if (!undoLastCall()) return webJson({ error: "There is no called word to undo." }, 409);
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/toggle-auto-call") {
    state.autoPullEnabled = body.enabled === undefined ? state.autoPullEnabled === false : Boolean(body.enabled);
    if (state.status === "playing" && state.autoPullEnabled && !state.nextPullAt) state.nextPullAt = Date.now() + PULL_INTERVAL_MS;
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/hype") {
    sendHypeReminder(body.message);
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/start-break") {
    startBreakOrEndEvent();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/next-round") {
    startNextRound();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/reset") {
    if (String(body.confirm || "") !== "RESET") {
      return webJson({ error: "Type RESET to confirm a full event reset." }, 409);
    }
    state = freshState();
    await commitState();
    return webJson(publicStateForOrigin(origin));
  }

  if (pathname === "/api/claim") {
    const result = validateClaimBody(body);
    if (result.status !== 200) return webJson(result.body, result.status);
    state.claims.unshift(result.body.claim);
    state.claims = state.claims.slice(0, 200);
    await commitState();
    return webJson(result.body);
  }

  return webJson({ error: "Not found" }, 404);
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/favicon.ico") {
    routeStatic(req, res, "/assets/on-par-logo.png");
    return;
  }
  if (url.pathname === "/host") {
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }
  if (url.pathname === "/dashboard") {
    routeStatic(req, res, "/dashboard.html");
    return;
  }
  if (url.pathname === "/display") {
    routeStatic(req, res, "/display.html");
    return;
  }
  if (url.pathname === "/host-guide") {
    routeStatic(req, res, "/host-guide.html");
    return;
  }
  if (url.pathname === "/play") {
    routeStatic(req, res, "/play.html");
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname === "/events") {
    routeApi(req, res, url.pathname).catch((error) => {
      console.error(error);
      sendJson(res, { error: "Server error" }, 500);
    });
    return;
  }
  routeStatic(req, res, url.pathname);
}

module.exports = handleRequest;
module.exports.handleApiWebRequest = handleApiWebRequest;

if (require.main === module) {
  const server = http.createServer(handleRequest);
  startStateTimer();
  server.listen(PORT, "0.0.0.0", () => {
    const local = `http://localhost:${PORT}`;
    const network = `http://${getLocalIp()}:${PORT}`;
    console.log(`On Par Pop Culture Bingo is running:`);
    console.log(`Host:    ${local}`);
    console.log(`Display: ${local}/display`);
    console.log(`Players: ${network}/play`);
  });
}
