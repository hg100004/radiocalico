# Radio Calico

A single-page internet radio player built with Flask and vanilla JavaScript. Streams lossless HLS audio, displays live now-playing metadata and album art, and lets listeners rate tracks with a thumbs up/down.

![Radio Calico Logo](RadioCalicoLogoTM.png)

## Features

- Live HLS audio stream (48 kHz FLAC / lossless) via [hls.js](https://github.com/video-dev/hls.js/), with native HLS fallback on Safari
- Now-playing display: artist, title, album, source quality, and cover art — updated every 15 seconds
- Previous tracks list
- Per-song thumbs up / thumbs down ratings — one vote per user per song, persisted in SQLite
- Anonymous user identity via UUID stored in `localStorage` — no login required
- No build step; pure HTML, CSS, and JavaScript

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python / Flask |
| Database | SQLite |
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

Open [http://localhost:5000](http://localhost:5000) in your browser.

## Project Structure

```
radiocalico/
├── app.py          # Flask server — API routes and static file serving
├── index.html      # Single-page markup
├── style.css       # All styling (CSS custom properties, layout, animations)
├── script.js       # All client-side logic (streaming, metadata polling, ratings)
├── requirements.txt
└── ratings.db      # SQLite database (auto-created on first run)
```

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
