# On Par Spooky Season Bingo

Digital bingo software for **Spooky Season Bingo** at On Par Entertainment, live at https://www.opebingo.com/. The active deck has 40 Halloween words, 20 fall favorites, and 20 iconic horror films, with all 80 images individually approved.

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

- Round 1: 20 minutes, Any Line worth 100 points
- Round 2: 20 minutes, regular bingo with a +50 four corners bonus
- Round 3 (final): 20 minutes, regular bingo worth 100 points with a +200 X bingo bonus
- Breaks: 10 minutes after Rounds 1 and 2
- Fresh cards are dealt at the start of each round

The event has exactly three rounds: 60 minutes of play and 20 minutes of breaks. Including the 15-minute opening countdown, the schedule takes 95 minutes before winner checks and prize handoffs.

## Host Flow

1. Start the server.
2. Open `http://localhost:4173`.
3. Open the display page on the TV/projector.
4. Let players scan the QR code.
5. Click **Start 15-Min Countdown**. Round 1 starts automatically at zero, or use **Start Round Now** if the room is ready early.
6. The display pulls a new random word every 20 seconds. Click **Pull Next Word** if the caller wants to advance early.
7. Verify any claims shown in the host console.
8. After Rounds 1 and 2, the leaderboard and 10-minute break appear automatically. Use **Start 10-Min Break** to end a round early.
9. The next round starts automatically after the break, or use **Next Round** to start early. After Round 3, the final winners appear.

Players must tap/select their own squares as the words are called. Their BINGO button turns on only when the selected squares match that round's pattern.

Each regular BINGO is worth 100 points in all three rounds. Round 2 Four Corners adds 50 points, and final Round 3 X Bingo adds 200 points. A player can claim multiple BINGOs on the same card as new lines or patterns are completed, and the break screen shows the overall points leaderboard.

Spooky Season uses the saved deck in `data/spooky-season-deck.json`, explicit decisions in `data/image-review-decisions.json`, and the matching approved local assets in `public/assets/spooky-season/`. `npm run cf:deploy` checks all 80 approvals and image hashes before using the existing Cloudflare worker/domain/storage configuration. A deck version changes saved cards and rejects old card claims. New themed games can fetch recommendations through official image-search APIs only:

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
