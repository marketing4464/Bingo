# On Par Digital Bingo Build Notes

Use this file as the starting brief for future themed bingo games at On Par Entertainment.

## Current Game

- Theme: Pop Culture Moments Bingo
- Title: That Was Iconic: Pop Culture Bingo
- Venue branding: On Par Entertainment
- Main app folder: `/Users/christinamyers/Desktop/MARKETING/on-par-pop-culture-bingo`
- Host link: `http://localhost:4173`
- Display link: `http://localhost:4173/display`
- Player link on local network: `http://192.168.10.169:4173/play`
- Saved marketing link file: `/Users/christinamyers/Desktop/MARKETING/On_Par_Bingo_Game_Link.md`

## Event Format

- Total event target: roughly 2 hours
- Rounds: 4 rounds
- Round play time: 15 minutes each
- Breaks: 10 minutes between rounds
- Words/images rotate automatically every 30 seconds while a round is playing
- Event flow is automatic after the host starts the 15-minute opening countdown:
  - Opening countdown lasts 15 minutes
  - Host can skip the countdown and jump straight into Round 1
  - When the opening countdown reaches zero, Round 1 starts automatically
  - Round plays for 15 minutes
  - Display switches to 10-minute break countdown and leaderboard
  - Next round starts automatically when the countdown ends
  - Repeats until the final round ends
  - Final display shows the final leaderboard
- Players scan a QR code to enter the game
- Players must enter their name before getting cards
- Players can request up to 3 cards
- Players manually select/tap squares on their cards

## Bingo Rules

- Players can get multiple bingos on the same card
- Each regular bingo is worth 100 points
- Four corners, X bingo, and coverup add a 50-point bonus; the coverup round scores 150 points for the coverup claim
- Overall winner is determined by total points
- Leaderboard is shown between rounds and at the end of the event
- When someone gets bingo, their name appears on the display
- False bingo prevention is required:
  - The app cross-checks the player's claimed squares against the words actually pulled
  - If a word was not pulled, the claim is rejected

## Display Requirements

- Display page should show:
  - On Par logo
  - Current word/phrase
  - Category
  - Image matching the word/phrase
  - Recent called words
  - Leaderboard during breaks
  - Bingo winner alert when a valid claim is submitted
- Display images should use `object-fit: contain` so the full image is visible.
- Display font should be sized to avoid wrapping on the big screen.

## Visual Direction

- Brand vibe: On Par Entertainment, dark upscale sports/bar entertainment feel
- Primary color: dark forest green
- Avoid gold as the main accent
- Keep the look bold, clean, high-contrast, and easy to read from across a room
- Use the On Par logo on host/display/player pages
- Avoid clutter on the display page; it needs to work on a TV/projector

## Image Workflow

- User preference: images should come from Google Images only.
- For each word/phrase, search with `pop culture moment` added to the phrase.
- Better search examples:
  - `pop culture moment Barbie movie scene`
  - `Titanic movie Jack Rose bow scene iconic`
  - `Britney Spears Justin Timberlake denim duo 2001`
  - `Jools Lebron very demure meme`
  - `Charli XCX brat summer green album cover`
- Do not insert weak/low-quality images directly.
- Build an approval sheet first when changing several images.
- Let the user approve or request replacements before changing the live deck.
- Current approved replacement set was saved under:
  - `/Users/christinamyers/Desktop/MARKETING/on-par-pop-culture-bingo/public/assets/approval-images`

## Current Deck Notes

- Cheugy was removed from the deck.
- Tam Ghost was removed from the deck.
- Current deck size after removal: 108 phrases.
- Current manifest files:
  - `public/assets/google-image-manifest.json`
  - `public/assets/google-image-manifest-quality.json`
- Both manifest files should stay in sync.

## Approved Image Replacement Process

1. Create a proposed image set in `public/assets/approval-images`.
2. Generate a contact sheet image for review.
3. Show the contact sheet in chat.
4. If the user requests a replacement, create a smaller option sheet for that phrase.
5. Update the proposed set with the approved option.
6. Only after user approval, write the approved images into both manifest files.
7. Restart the local server so the image manifest reloads.
8. Spot-check `/api/moment-image` for a few changed phrases.

## Server/App Behavior To Preserve

- Next/Vercel dev server runs with: `npm run dev`
- Original local Node server still runs with: `npm run local`
- Original local Node app port: `4173`
- Core files:
  - `server.js`
  - `public/display.html`
  - `public/display.js`
  - `public/host.html`
  - `public/host.js`
  - `public/play.html`
  - `public/play.js`
  - `public/styles.css`
  - `next.config.mjs`
  - `app/api/[...path]/route.js`
  - `package.json`
- Important timing constant:
  - `PULL_INTERVAL_MS = 30 * 1000`
- The player cards should not auto-mark squares.
- Players must select squares themselves.
- Player card marks reset automatically when the next round starts.

## Future Theme Template

When making a new themed bingo, collect:

- Theme name
- Target audience
- Event date/month
- Number of rounds
- Round length
- Break length
- Desired categories
- Word/phrase list
- Image style preferences
- Any words to exclude
- Whether the user wants an approval sheet before images go live

Recommended future prompt:

> Make a new On Par digital bingo theme using the existing bingo app as the template. Keep the same player name entry, QR join flow, manual square selection, 30-second word rotation, 15-minute rounds, 10-minute breaks, leaderboard between rounds, 100 points per regular bingo, 50-point special bingo bonuses, up to 3 cards per player, multiple bingos per card, and false-bingo cross-checking. Build a new themed word list, create a Google Images approval sheet, and do not update the live deck until I approve the images.
