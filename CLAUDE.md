# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
pip install -r requirements.txt   # installs Flask only
python app.py                     # starts on http://localhost:5000
```

The Flask server is typically already running. Restart it in the background if a restart is needed; never start it in the foreground.

## Architecture

Radio Calico is a single-page internet radio player. There is no build step — the entire frontend lives in one `index.html` with all CSS and JS inline.

**Backend (`app.py`)** — Flask, port 5000:
- Serves `index.html` and whitelisted static extensions (`.png`, `.jpg`, `.css`, `.js`, etc.) from the project root
- `GET /api/ratings?s=<song_key>&uid=<user_id>` — returns `{up, down, user_vote}` for the current song
- `POST /api/vote` — records a thumbs up/down; returns 409 if the user already voted for this song
- SQLite (`ratings.db`): single `votes` table with `(song_key, user_id)` as the primary key — one vote per user per song, never changed once cast

**Frontend** — no framework, no build tooling. Four files:
- `index.html` — markup only; links `style.css`, `logic.js`, and `script.js` (loaded in that order)
- `style.css` — all styling, including CSS custom properties (brand colors), layout, and animations
- `logic.js` — pure helper functions with no DOM dependency, extracted so they're unit-testable: `makeSongKey`, `esc`, `formatElapsed`. Dual-mode (plain global for the browser `<script>` tag, `module.exports` for Node/Vitest)
- `script.js` — all client-side logic, DOM-coupled (grabs elements via `getElementById` at top level on load):
  - HLS stream via [hls.js](https://github.com/video-dev/hls.js/) loaded from CDN; falls back to native HLS on Safari
  - Polls `metadatav2.json` on CloudFront every 15 s for now-playing data (artist, title, album, bit depth, previous tracks)
  - Fetches `cover.jpg` from CloudFront on each song change (cache-busted by song key)
  - User identity: a UUID stored in `localStorage` under `rc_uid` — no login, no server-side sessions
  - Rating UI polls `/api/ratings` every 30 s while a song is playing

**External CloudFront endpoints (read-only, not in this repo):**
- Stream: `https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8`
- Metadata: `https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json`
- Cover art: `https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg`

## Testing

**Backend** (`tests/test_app.py`) — pytest against Flask's test client, with `app.DB` monkeypatched to a temp SQLite file per test (never touches real `ratings.db`). Covers the ratings/vote endpoints: validation, vote recording, multi-user accumulation, duplicate-vote 409 behavior, per-song isolation, CORS headers.
```bash
pip install -r requirements-dev.txt
python -m pytest
```

**Frontend**:
- `tests/logic.test.js` — Vitest, unit-tests the pure helpers in `logic.js` (node environment, via `require`).
- `tests/rating-ui.test.js` — Vitest + jsdom (`// @vitest-environment jsdom`), loads the real `index.html` body markup and imports `logic.js`/`script.js` against it to test the rating UI end-to-end: initial vote counts render from a mocked `/api/ratings`, clicking a rate button posts to `/api/vote` and updates counts/disabled state/notice text, and polling in new metadata (via `vi.useFakeTimers` + `vi.advanceTimersByTimeAsync`) resets the rating UI for the new song. `fetch` is fully mocked; no real network calls.
  - Note: `logic.js` and `script.js` are loaded as ES modules under Vitest, so `logic.js`'s functions don't become globals automatically the way they do via real `<script>` tags in the browser — the test does `Object.assign(globalThis, require('../logic.js'))` before importing `script.js` to bridge this.
- Player controls (HLS init, play/pause) and metadata rendering beyond the rating UI are still not covered.
```bash
npm install
npm test
```

## Style Guide

A text version of the styling guide for the webpage is at `/home/student/radiocalico/RadioCalico_Style_Guide.txt`

The Radio Calico logo is at `/home/student/radiocalico/RadioCalicoLogoTM.png`

## Brand / style constraints

See `RadioCalico_Style_Guide.txt` for the full guide. Key values used throughout the CSS:

| CSS var / token | Hex       | Role |
|----------------|-----------|------|
| `--mint`       | `#D8F2D5` | Backgrounds, accents, logo circle |
| `--forest`     | `#1F4E23` | Primary buttons, headings, borders |
| `--teal`       | `#38A29D` | Nav bar, focus rings, hover states |
| Calico Orange  | `#EFA63C` | Call-to-action accents (not yet a CSS var) |
| `--charcoal`   | `#231F20` | Body text, player bar background |
| Cream          | `#F5EADA` | Secondary backgrounds (not yet a CSS var) |

Headings use **Montserrat** (700/600/500), body uses **Open Sans** (400), both loaded from Google Fonts.
