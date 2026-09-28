# Radio Calico

A single-page internet radio player built with Flask and vanilla JavaScript. Streams lossless HLS audio, displays live now-playing metadata and album art, and lets listeners rate tracks with a thumbs up/down.

![Radio Calico Logo](RadioCalicoLogoTM.png)

## Features

- Live HLS audio stream (48 kHz FLAC / lossless) via [hls.js](https://github.com/video-dev/hls.js/), with native HLS fallback on Safari
- Now-playing display: artist, title, album, source quality, and cover art — updated every 15 seconds
- Previous tracks list
- Per-song thumbs up / thumbs down ratings — one vote per user per song
- Anonymous user identity via UUID stored in `localStorage` — no login required
- No build step; pure HTML, CSS, and JavaScript

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python / Flask (gunicorn in production) |
| Database | SQLite (dev) / PostgreSQL (production) |
| Web server | nginx (production) — serves static files, reverse-proxies `/api/*` |
| Frontend | Vanilla JS, CSS custom properties |
| Streaming | HLS via hls.js (CDN) |
| Fonts | Montserrat, Open Sans (Google Fonts) |
| CDN | AWS CloudFront (stream, metadata, cover art) |

## Getting Started

**Prerequisites:** Python 3.8+

```bash
git clone https://github.com/hg100004/radiocalico.git
cd radiocalico
pip install -r requirements.txt
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser. This runs against SQLite (`ratings.db`) by default; set `DATABASE_URL` to a `postgresql://...` URL to use PostgreSQL instead.

## Project Structure

```
radiocalico/
├── app.py                # Flask server — API routes; SQLite/PostgreSQL selected by DATABASE_URL
├── wsgi.py                # Production entrypoint for gunicorn (calls init_db() on import)
├── index.html            # Single-page markup
├── style.css             # All styling (CSS custom properties, layout, animations)
├── logic.js              # Pure, DOM-free helpers (makeSongKey, esc, formatElapsed) — unit-tested
├── script.js             # All client-side logic (streaming, metadata polling, ratings)
├── requirements.txt        # Flask, gunicorn, psycopg2-binary
├── requirements-dev.txt   # + pytest, for running the backend test suite
├── package.json           # Vitest + jsdom, for running the frontend test suite
├── Dockerfile              # App image — gunicorn serving wsgi:app
├── docker-compose.yml      # postgres + app (gunicorn) + nginx, for a production-like stack
├── nginx/
│   ├── Dockerfile           # Copies only the whitelisted static assets into the nginx image
│   └── default.conf         # Serves static files, proxies /api/* to the app service
├── tests/
│   ├── test_app.py             # pytest — ratings/vote API endpoints (SQLite)
│   ├── test_app_postgres.py    # pytest — same, against real PostgreSQL (auto-skips if unreachable)
│   ├── logic.test.js           # Vitest — pure helpers in logic.js
│   ├── rating-ui.test.js       # Vitest + jsdom — rating UI end-to-end
│   └── player-controls.test.js # Vitest + jsdom — play/pause, HLS, volume, audio events
└── ratings.db            # SQLite database (auto-created on first run, dev only)
```

## Testing

```bash
# Backend (SQLite)
pip install -r requirements-dev.txt
python -m pytest

# Backend (PostgreSQL) — requires a reachable Postgres, e.g.:
docker compose up -d postgres
python -m pytest tests/test_app_postgres.py

# Frontend
npm install
npm test
```

## Production Deployment

```bash
docker compose up --build
```

Runs PostgreSQL, the Flask app under gunicorn, and nginx together. The app is served at [http://localhost:8080](http://localhost:8080) — nginx serves the static frontend files directly and reverse-proxies `/api/*` to the app container.

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/ratings?s=<song_key>&uid=<user_id>` | Returns `{up, down, user_vote}` for a song |
| `POST` | `/api/vote` | Cast a vote — body: `{s, uid, vote: "up"\|"down"}`. Returns 409 if already voted. |

## External Dependencies

The stream, metadata, and cover art are served from AWS CloudFront and are not part of this repository:

- **Stream:** `https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8`
- **Metadata:** `https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json`
- **Cover art:** `https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg`

## Brand Colors

| Token | Hex | Role |
|---|---|---|
| `--mint` | `#D8F2D5` | Backgrounds, accents |
| `--forest` | `#1F4E23` | Primary buttons, headings, borders |
| `--teal` | `#38A29D` | Nav bar, focus rings, hover states |
| `--charcoal` | `#231F20` | Body text, player bar |
| Calico Orange | `#EFA63C` | Call-to-action accents |
