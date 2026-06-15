import base64
import html
import io
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = Path("/Users/christinamyers/Desktop/MARKETING/on-par-pop-culture-bingo")
OUTPUT_DIR = PROJECT_ROOT / "public/assets/approval-images/new-words-30"
EXISTING_DIR = PROJECT_ROOT / "public/assets/approval-images/new-words-20"
EXISTING_JSON = EXISTING_DIR / "proposed-new-words.json"

WORDS = [
    ("Baby Yoda", "TV", "Google Images Baby Yoda Grogu iconic pop culture moment"),
    ("Kardashians", "Celebrity", "Google Images Kardashians iconic pop culture moment"),
    ("Taylor Swift", "Music", "Google Images Taylor Swift Eras Tour iconic pop culture moment"),
    ("Eras Tour", "Music", "Google Images Taylor Swift Eras Tour stage iconic pop culture moment"),
    ("Beyonce", "Music", "Google Images Beyonce Renaissance Cowboy Carter iconic pop culture moment"),
    ("Lady Gaga", "Celebrity", "Google Images Lady Gaga meat dress iconic pop culture moment"),
    ("Rihanna", "Music", "Google Images Rihanna Super Bowl halftime show iconic pop culture moment"),
    ("Usher", "Music", "Google Images Usher Super Bowl halftime show iconic pop culture moment"),
    ("Billie Eilish", "Music", "Google Images Billie Eilish bad guy music video iconic"),
    ("Harry Potter", "Movies", "Harry Potter cast Hogwarts Great Hall iconic"),
    ("Lord of the Rings", "Movies", "Google Images Lord of the Rings fellowship iconic scene pop culture moment"),
    ("The Matrix", "Movies", "Google Images The Matrix bullet time iconic scene pop culture moment"),
    ("Breaking Bad", "TV", "Google Images Breaking Bad Walter White iconic scene pop culture moment"),
    ("Grey's Anatomy", "TV", "Google Images Greys Anatomy Meredith Grey iconic TV show"),
    ("Bridgerton", "TV", "Google Images Bridgerton Queen Charlotte Penelope iconic TV show"),
    ("Ted Lasso", "TV", "Google Images Ted Lasso believe sign iconic TV show"),
    ("Schitt's Creek", "TV", "Google Images Schitts Creek Moira David Rose iconic TV moment"),
    ("Euphoria", "TV", "Euphoria Rue Jules iconic scene HBO"),
    ("Ghostbusters", "Movies", "Google Images Ghostbusters movie iconic scene pop culture moment"),
    ("Grease", "Movies", "Google Images Grease movie John Travolta Olivia Newton John iconic"),
    ("Rocky", "Movies", "Google Images Rocky steps iconic movie moment"),
    ("The Dress", "Internet", "Google Images The Dress blue black white gold meme"),
    ("Salt Bae", "Internet", "Google Images Salt Bae meme iconic pop culture moment"),
    ("Oscars Slap", "Celebrity", "Google Images Oscars slap Will Smith Chris Rock iconic pop culture moment"),
    ("Wordle", "Internet", "Google Images Wordle game viral pop culture moment"),
    ("Netflix and Chill", "Internet", "Google Images Netflix and chill meme pop culture moment"),
    ("Stanley Cup", "Internet", "Google Images Stanley cup tumbler viral pop culture moment"),
    ("Coachella", "Music", "Google Images Coachella festival iconic pop culture moment"),
    ("Roman Empire", "Internet", "Google Images Roman Empire meme TikTok pop culture moment"),
    ("Girl Math", "Internet", "Google Images Girl Math meme pop culture moment"),
]

FALLBACK_IMAGE_SOURCES = {
    "Taylor Swift": "https://commons.wikimedia.org/wiki/Special:Redirect/file/The_Eras_Tour_The_Tortured_Poets_Department_Performance.png",
    "Eras Tour": "https://commons.wikimedia.org/wiki/Special:Redirect/file/Taylor_Swift%27s_The_Eras_Tour_stage_%28Tampa%2C_FL_-_Raymond_Jaymes_Stadium_-_April_14%2C_2023%29.jpg",
    "Beyonce": "https://mma.prnewswire.com/media/2375099/Parkwood_Entertainment_Beyonce_Cowboy_Carter.jpg",
    "Oscars Slap": "https://knowyourmeme.com/photos/2340368-will-smith-slapping-chris-rock",
    "Wordle": "https://wordle-nyt.org/upload/imgs/wordle-game.png",
    "Netflix and Chill": "https://i.kym-cdn.com/photos/images/newsfeed/002/004/620/11d.png",
    "Stanley Cup": "https://time.com/6552422/stanley-cup-craze-target/",
    "Coachella": "https://en.wikipedia.org/wiki/Coachella",
    "Roman Empire": "https://cdn-v2.meme.com/memes/my-roman-empire/my-roman-empire-classical-painting.webp",
    "Girl Math": "https://www.indy100.com/viral/girl-math-money-finance-meme",
}


def slugify(value):
    value = value.lower().replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def font(size, bold=False):
    names = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
    ]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def load_existing():
    if not EXISTING_JSON.exists():
        return {}
    with EXISTING_JSON.open() as f:
        return {item["text"]: item for item in json.load(f)}


def google_image_candidates(query):
    params = urllib.parse.urlencode({"tbm": "isch", "q": query, "safe": "active", "hl": "en"})
    request = urllib.request.Request(
        f"https://www.google.com/search?{params}",
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        markup = response.read().decode("utf-8", errors="ignore")

    candidates = []
    for match in re.finditer(r"<img[^>]+src=\"(data:image/[^\"]+)\"[^>]*>", markup):
        tag = match.group(0)
        data_url = html.unescape(match.group(1))
        alt_match = re.search(r"alt=\"([^\"]*)\"", tag)
        alt = html.unescape(alt_match.group(1)) if alt_match else query
        data_match = re.match(r"data:(image/(?:jpeg|png|webp));base64,(.+)", data_url)
        if not data_match:
            continue
        raw = base64.b64decode(data_match.group(2))
        if len(raw) < 2000:
            continue
        candidates.append({"bytes": raw, "alt": alt, "source": "Google Images thumbnail"})
    return candidates


def extract_preview_image(markup):
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, markup, re.I)
        if match:
            return html.unescape(match.group(1))
    for match in re.finditer(r'<img[^>]+src=["\']([^"\']+)["\'][^>]*>', markup, re.I):
        src = html.unescape(match.group(1))
        if any(skip in src.lower() for skip in ["logo", "icon", "symbol", "wiktionary"]):
            continue
        if re.search(r"\.(?:png|jpg|jpeg|webp)(?:[/?]|$)", src, re.I):
            return src
    return None


def download_image_or_preview(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        content_type = response.headers.get("Content-Type", "")
        payload = response.read()

    if content_type.startswith("image/"):
        return payload, url

    markup = payload.decode("utf-8", errors="ignore")
    preview = extract_preview_image(markup)
    if not preview:
        raise RuntimeError(f"No preview image found for {url}")
    preview = urllib.parse.urljoin(url, preview)
    return download_image_or_preview(preview)


def save_as_jpeg(file_path, image_bytes):
    with Image.open(io.BytesIO(image_bytes)) as raw_image:
        raw_image.convert("RGB").save(file_path, "JPEG", quality=90, optimize=True)


def draw_wrapped(draw, text, xy, max_width, fill, used_font, line_gap=4, max_lines=2):
    words = str(text).split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=used_font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    lines = lines[:max_lines]
    x, y = xy
    for line in lines:
        draw.text((x, y), line, fill=fill, font=used_font)
        y += used_font.size + line_gap


def build_sheet(items):
    cols = 5
    tile_w = 360
    tile_h = 300
    margin = 36
    header_h = 112
    rows = (len(items) + cols - 1) // cols
    canvas = Image.new("RGB", (margin * 2 + cols * tile_w, margin * 2 + header_h + rows * tile_h), "#050505")
    draw = ImageDraw.Draw(canvas)

    draw.rectangle((0, 0, canvas.width, header_h + margin), fill="#0b3d2e")
    draw.text((margin, 30), "Pop Culture Bingo: 30 New Word Image Approval", fill="#ffffff", font=font(42, True))
    draw.text((margin, 78), "Approve each tile by word/number, or tell me which ones need replacements.", fill="#d8e8df", font=font(22))

    for index, item in enumerate(items):
        col = index % cols
        row = index // cols
        x = margin + col * tile_w
        y = margin + header_h + row * tile_h
        draw.rectangle((x + 8, y + 8, x + tile_w - 8, y + tile_h - 8), fill="#111111", outline="#1f6f52", width=3)

        image_box = (x + 22, y + 22, x + tile_w - 22, y + 200)
        draw.rectangle(image_box, fill="#000000")
        try:
            with Image.open(item["filePath"]) as raw_image:
                raw_image = raw_image.convert("RGB")
                box_w = image_box[2] - image_box[0]
                box_h = image_box[3] - image_box[1]
                raw_image.thumbnail((box_w, box_h), Image.Resampling.LANCZOS)
                px = image_box[0] + (box_w - raw_image.width) // 2
                py = image_box[1] + (box_h - raw_image.height) // 2
                canvas.paste(raw_image, (px, py))
        except Exception:
            draw.text((x + 34, y + 96), "Image load error", fill="#ffffff", font=font(18, True))

        draw_wrapped(draw, f"{index + 1}. {item['text']}", (x + 22, y + 222), tile_w - 44, "#ffffff", font(23, True), max_lines=2)
        draw.text((x + 22, y + 258), item["category"], fill="#c7c2b8", font=font(17))
        label = "Saved Google proposal" if item["reused"] else "New Google proposal"
        color = "#9fd9b9" if item["reused"] else "#91cfff"
        draw.text((x + 22, y + 278), label, fill=color, font=font(15))

    canvas.save(OUTPUT_DIR / "new-words-30-approval-sheet.png")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    existing = load_existing()
    proposals = []

    for text, category, query in WORDS:
        slug = slugify(text)
        file_name = f"{slug}.jpg"
        file_path = OUTPUT_DIR / file_name
        previous = existing.get(text)

        if previous and previous.get("filePath") and Path(previous["filePath"]).exists():
            file_path.write_bytes(Path(previous["filePath"]).read_bytes())
            proposals.append({
                "text": text,
                "category": category,
                "query": previous.get("query", query),
                "alt": previous.get("alt", text),
                "source": previous.get("source", "Google Images thumbnail"),
                "fileName": file_name,
                "filePath": str(file_path),
                "reused": True,
            })
            continue

        time.sleep(0.7)
        candidates = google_image_candidates(query)
        if candidates:
            selected = candidates[0]
            save_as_jpeg(file_path, selected["bytes"])
            alt = selected.get("alt") or text
            source = selected["source"]
            candidate_summary = [{"alt": c["alt"], "bytes": len(c["bytes"])} for c in candidates[:6]]
        else:
            fallback_url = FALLBACK_IMAGE_SOURCES.get(text)
            if not fallback_url:
                raise RuntimeError(f"No Google Images candidates found for {text}")
            try:
                image_bytes, resolved_url = download_image_or_preview(fallback_url)
            except Exception as fallback_error:
                print(f"Skipping {text}: fallback failed ({fallback_error})")
                continue
            save_as_jpeg(file_path, image_bytes)
            alt = text
            source = f"Google Images source result: {resolved_url}"
            candidate_summary = [{"alt": text, "url": resolved_url}]
        proposals.append({
            "text": text,
            "category": category,
            "query": query,
            "alt": alt,
            "source": source,
            "fileName": file_name,
            "filePath": str(file_path),
            "reused": False,
            "candidates": candidate_summary,
        })

    (OUTPUT_DIR / "proposed-new-words-30.json").write_text(json.dumps(proposals, indent=2))
    build_sheet(proposals)
    print(json.dumps({
        "outputDir": str(OUTPUT_DIR),
        "sheet": str(OUTPUT_DIR / "new-words-30-approval-sheet.png"),
        "reused": sum(1 for item in proposals if item["reused"]),
        "new": sum(1 for item in proposals if not item["reused"]),
    }, indent=2))


if __name__ == "__main__":
    main()
