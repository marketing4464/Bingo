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

Use the host console to open the big-screen display and show the QR code. Players scan the QR code, enter their name, and choose 1-3 bingo cards.

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
6. The display pulls a new random moment every 30 seconds. Click **Pull Next Moment** only if the caller wants to advance early.
7. Verify any claims shown in the host console.
8. Click **Start 10-Min Break** between rounds.
9. Click **Next Round**, then **Start Round** again.

Players must tap/select their own squares as the moments are called. Their BINGO button turns on only when the selected squares match that round's pattern.

Each regular BINGO is worth 100 points. Four corners, X bingo, and coverup add a 50-point bonus; the coverup round scores 150 points for the coverup claim. A player can claim multiple BINGOs on the same card as new lines or patterns are completed, and the break screen shows the overall points leaderboard.

Pulled-word images use the saved Google Images manifest at `public/assets/google-image-manifest.json`. It contains one Google Images thumbnail for every bingo phrase. If a new phrase is added later and is not in the manifest, the app can still try Google Custom Search with `GOOGLE_API_KEY` and `GOOGLE_CX`, then fall back to local art if Google returns no usable image.

Without Blob configuration, game state is stored in memory and a server restart resets the event.

## Vercel Blob Storage

The server can persist the live game snapshot to Vercel Blob at `on-par-bingo/game-state/current.json` when `BLOB_READ_WRITE_TOKEN` is available. Create and connect a private Blob store to the Vercel project with:

```bash
vercel blob create-store bingo-game-state --access private --yes --scope tina-marketing4464 --project bingo
```

After Vercel injects the Blob environment variables, `/api/storage-status` will report storage as configured and available.
