# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
pip install -r requirements.txt   # Flask, gunicorn, psycopg2-binary
python app.py                     # starts on http://localhost:5000, SQLite by default
```

A `Makefile` wraps the common commands: `make install`/`make dev` for the above, `make prod`/`make prod-down` for the docker-compose production stack, `make test`/`make test-backend`/`make test-backend-pg`/`make test-frontend` for the test suites. `make` itself isn't guaranteed to be installed on every dev machine (confirmed absent in at least one sandbox this was developed in) — fall back to the underlying commands (documented throughout this file and in README.md) if `make` isn't available.

The Flask server is typically already running. Restart it in the background if a restart is needed; never start it in the foreground.

## Architecture

Radio Calico is a single-page internet radio player. There is no build step — the entire frontend lives in one `index.html` with all CSS and JS inline.

**Backend (`app.py`)** — Flask, port 5000:
- Serves `index.html` and whitelisted static extensions (`.png`, `.jpg`, `.css`, `.js`, etc.) from the project root — this is only the *dev* static path; in production nginx serves these instead (see Production deployment below)
- `GET /api/ratings?s=<song_key>&uid=<user_id>` — returns `{up, down, user_vote}` for the current song
- `POST /api/vote` — records a thumbs up/down; returns 409 if the user already voted for this song
- Dual database backend, selected by the `DATABASE_URL` env var: unset → SQLite (`ratings.db`, for local dev/tests); `postgres://...`/`postgresql://...` → PostgreSQL, for production. Same `votes` table shape either way — `(song_key, user_id)` primary key, one vote per user per song, never changed once cast. `get_db()`/`PgConnection` in `app.py` adapt psycopg2's cursor-based API to look like sqlite3's connection-level `.execute()`, and translate `?` placeholders to `%s` for Postgres, so the query strings and route handlers are backend-agnostic.
  - Known limitation carried into the Postgres path: `submit_vote` does a SELECT-then-INSERT without a DB-level upsert, so two concurrent requests for the same `(song_key, user_id)` under multiple gunicorn workers could both pass the "not existing" check and race on the `PRIMARY KEY` — the loser gets an unhandled `IntegrityError` (500) instead of a clean 409. Not fixed here; would need `INSERT ... ON CONFLICT DO NOTHING` (Postgres) / `INSERT OR IGNORE` (SQLite) plus a re-fetch.

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

## Production deployment

`docker-compose.yml` runs three services:
- **postgres** — `postgres:16-alpine`, exposed on host port 5432 (for local testing/`test_app_postgres.py`), credentials `radiocalico`/`radiocalico`/db `radiocalico`.
- **app** — built from `Dockerfile`, runs `gunicorn -w 4 -b 0.0.0.0:8000 wsgi:app`. `wsgi.py` (not `app.py`) is the entrypoint for gunicorn because it explicitly calls `init_db()` on import — `app.py` deliberately does *not* call `init_db()` at module import time, only inside its `if __name__ == '__main__'` guard, so that `import app` (as the pytest suite does) never touches a real database as a side effect.
- **nginx** — built from `nginx/Dockerfile`, exposed on host port 8080. Copies only the whitelisted static files (`index.html`, `style.css`, `script.js`, `logic.js`, `RadioCalicoLogoTM.png`) into the image — never the whole repo — and `nginx/default.conf` serves them by explicit extension whitelist (mirroring `app.py`'s `static_files` whitelist) while reverse-proxying `/api/*` to the `app` service on port 8000. Everything else 404s.

```bash
docker compose up --build
# app: http://localhost:8080
```

To run the Postgres integration tests locally without the full stack: `docker compose up -d postgres`, then `python -m pytest tests/test_app_postgres.py` (it auto-skips if Postgres isn't reachable on `localhost:5432` or `psycopg2` isn't installed).

## Testing

**Backend**:
- `tests/test_app.py` — pytest against Flask's test client, with `app.DB` monkeypatched to a temp SQLite file per test (never touches real `ratings.db`). Covers the ratings/vote endpoints: validation, vote recording, multi-user accumulation, duplicate-vote 409 behavior, per-song isolation, CORS headers.
- `tests/test_app_postgres.py` — same behaviors, run against real PostgreSQL by monkeypatching `app.IS_POSTGRES`/`app.DATABASE_URL`. Self-skips via `pytest.importorskip('psycopg2')` and a connection probe if Postgres isn't reachable, so the default `pytest` run is unaffected when it isn't running. Uses a random `pg-test-<uuid>` song key per test and deletes it in teardown (no table truncation, since a shared docker-compose Postgres may be used across other work).
```bash
pip install -r requirements-dev.txt
python -m pytest
```

**Frontend**:
- `tests/logic.test.js` — Vitest, unit-tests the pure helpers in `logic.js` (node environment, via `require`).
- `tests/rating-ui.test.js` — Vitest + jsdom (`// @vitest-environment jsdom`), loads the real `index.html` body markup and imports `logic.js`/`script.js` against it to test the rating UI end-to-end: initial vote counts render from a mocked `/api/ratings`, clicking a rate button posts to `/api/vote` and updates counts/disabled state/notice text, and polling in new metadata (via `vi.useFakeTimers` + `vi.advanceTimersByTimeAsync`) resets the rating UI for the new song. `fetch` is fully mocked; no real network calls.
  - Note: `logic.js` and `script.js` are loaded as ES modules under Vitest, so `logic.js`'s functions don't become globals automatically the way they do via real `<script>` tags in the browser — the test does `Object.assign(globalThis, require('../logic.js'))` before importing `script.js` to bridge this.
- `tests/player-controls.test.js` — Vitest + jsdom, same markup/import setup, with `Hls` stubbed (a `FakeHls` class tracking instances) and the global `Audio` constructor stubbed to capture the real jsdom `HTMLAudioElement` instance `script.js` creates internally (`capturedAudio`), since it isn't otherwise exposed. Covers: waveform bar generation, play/pause icon and status-text toggling on click, HLS init/destroy, audio events (`playing`/`waiting`/`stalled`/`error`) driving status text and the elapsed-time display (via `vi.advanceTimersByTimeAsync`), and the volume slider.
- Metadata rendering beyond the rating UI (cover art, previous-tracks list) is still not covered.
```bash
npm install
npm test
```

## Security Scanning

`make security` runs `npm audit` against `package-lock.json` (fails with non-zero exit if any known vulnerability is found — there's no npm runtime dependency surface to scan since the frontend has zero npm runtime deps, only devDependencies for the Vitest toolchain). Currently reports 0 vulnerabilities (`vitest` is pinned to `^5.0.2`, upgraded from `^2.1.4` specifically to resolve 5 known vulnerabilities in the `vitest`/`vite`/`esbuild`/`@vitest/mocker` chain — all 24 frontend tests were re-verified passing after the upgrade, run 4x to check for flakiness).
```bash
npm audit
```

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
