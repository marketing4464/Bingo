# On Par Pop Culture Bingo

Digital bingo software for **Pop Culture Moments Bingo** at On Par Entertainment.

## Run it

```bash
npm install
npm run dev
```

Open the host console:

```text
http://localhost:3000
```

Open the themed-game admin dashboard:

```text
http://localhost:3000/dashboard
```

For the original local Node server, run:

```bash
npm run local
```

That opens the host console at `http://localhost:4173`.

## Cloudflare deployment

The `opebingo` Cloudflare Worker serves Bingo and the venue murder mystery from the same domain:

- Bingo host: `https://www.opebingo.com/host`
- Murder Mystery player: `https://www.opebingo.com/murder-mystery`
- Murder Mystery host: `https://www.opebingo.com/murder-mystery/host`
- Murder Mystery display: `https://www.opebingo.com/murder-mystery/display`
- QR station kit: `https://www.opebingo.com/murder-mystery/station-kit`
- Printable event module: `https://www.opebingo.com/murder-mystery/module`

The mystery route is mapped to public landmarks visible in On Par's December 2025 venue tour: the Wild Axe public rail, shuffleboard end cap, mini-golf pencil return, Great Escape entrance, Level Up overlook, darts lounge, and central wave-mural lounge. Scarlet and Ivory starting orders split traffic while three progressive hints at each station keep the deduction difficult but fair.

The murder mystery uses the `MURDER_MYSTERY_STATE` SQLite-backed Durable Object. Its teams, notes, progress, scores, and accusations are isolated from the Supabase-backed Bingo event.

Preview or deploy with:

```bash
npm run cf:preview
npm run cf:deploy
```

When the source mystery definition changes in the sibling `ope-murder-mystery` project, regenerate the Worker-safe game data with `npm run mystery:sync`.

## Deploy to Vercel

This project is Next.js-compatible for Vercel:

- Static app screens live in `public/`
- Clean routes are configured in `next.config.mjs`
- API routes are handled by `app/api/[...path]/route.js`
- Browser clients poll `/api/state`, which avoids long-lived EventSource connections on Vercel

After connecting the GitHub repo to Vercel, use the default Next.js build command:

```bash
npm run build
```

Use the dashboard to create themed games, edit decks, review image recommendations, approve images, and start a saved game live. Then use the host console to open the big-screen display and show the QR code. Players scan the QR code, enter their name, and choose 1-3 bingo cards.

If players see a Vercel login after scanning the QR code, the display is likely running on a protected preview deployment. Open the production deployment for the event, or set `PUBLIC_JOIN_URL` / `NEXT_PUBLIC_JOIN_URL` to the public player URL, for example `https://your-public-domain.com/play`.

## Event Format

- Round 1: Red Carpet Warm-Up, 15 minutes, Any Line
- Round 2: TV & Movie Icons, 15 minutes, regular bingo with a +50 four corners bonus
- Round 3: Music Video Moments, 15 minutes, regular bingo with a +50 X bingo bonus
- Round 4: Viral Finale, 15 minutes, Blackout
- Breaks: 10 minutes between rounds

This creates a roughly 90-105 minute event with a few minutes for welcome, winner checks, and prize handoffs. Add music, prize calls, or a final bonus round if you want to stretch it closer to 2 hours.

## Host Flow

1. Start the server.
2. Open `http://localhost:4173`.
3. Open the display page on the TV/projector.
4. Let players scan the QR code.
5. Click **Start Round**.
6. The display pulls a new random moment every 20 seconds. Click **Pull Next Moment** only if the caller wants to advance early.
7. Verify any claims shown in the host console.
8. Click **Start 10-Min Break** between rounds.
9. Click **Next Round**, then **Start Round** again.

Players must tap/select their own squares as the moments are called. Their BINGO button turns on only when the selected squares match that round's pattern.

Each regular BINGO is worth 100 points. Four corners, X bingo, and coverup add a 50-point bonus; the coverup round scores 150 points for the coverup claim. A player can claim multiple BINGOs on the same card as new lines or patterns are completed, and the break screen shows the overall points leaderboard.

Pulled-word images use approved images from the active saved game. The default Pop Culture game is pre-approved from `public/assets/google-image-manifest.json`. New themed games can fetch recommendations through official image-search APIs only:

- Google Custom Search JSON API: `GOOGLE_API_KEY` and `GOOGLE_CX`
- Bing Image Search: `BING_IMAGE_SEARCH_KEY` and optional `BING_IMAGE_SEARCH_ENDPOINT`
- SerpAPI Google Images: `SERPAPI_KEY`

If no image-search API is configured, the dashboard creates generated placeholder recommendations so admins can still test the approval workflow without scraping image search pages.

Without Supabase configuration, game state is stored in memory and a server restart resets the event.

## Supabase Storage

The server persists the live game snapshot to the Supabase table `public.on_par_bingo_state`. The app reads and writes the single row with `id = 'current'`.

Use these environment variables when you want to override the built-in project defaults:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a fallback

After Supabase is reachable, `/api/storage-status` reports storage as configured and available.
