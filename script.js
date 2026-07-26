const STREAM_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8';
const audio = new Audio();
audio.volume = 0.8;

let hls = null;
let playing = false;

const btn       = document.getElementById('btn-play');
const iconPlay  = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const dot       = document.getElementById('dot');
const statusTxt = document.getElementById('status-text');
const artEl     = document.getElementById('art');
const waveform  = document.getElementById('waveform');
const volSlider = document.getElementById('volume');
const volLabel  = document.getElementById('vol-label');

const BAR_HEIGHTS = [6,12,18,24,20,14,8,16,22,18,10,6,14,20,16,10];
BAR_HEIGHTS.forEach((h, i) => {
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.style.setProperty('--h', h + 'px');
  bar.style.setProperty('--d', (.5 + Math.random() * .6).toFixed(2) + 's');
  bar.style.animationDelay = (i * 0.05).toFixed(2) + 's';
  waveform.appendChild(bar);
});

function setStatus(state, msg) {
  statusTxt.textContent = msg;
  dot.className = 'dot' + (state ? ' ' + state : '');
}

function initHls() {
  if (Hls.isSupported()) {
    hls = new Hls({ lowLatencyMode: true });
    hls.loadSource(STREAM_URL);
    hls.attachMedia(audio);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { audio.play().catch(() => {}); });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) { setStatus('error', 'Stream error'); setPlayState(false); }
    });
  } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
    audio.src = STREAM_URL;
    audio.play().catch(() => {});
  } else {
    setStatus('error', 'HLS not supported');
  }
}

function destroyHls() {
  if (hls) { hls.destroy(); hls = null; }
  audio.src = '';
}

function setPlayState(isPlaying) {
  playing = isPlaying;
  iconPlay.style.display  = isPlaying ? 'none' : '';
  iconPause.style.display = isPlaying ? ''     : 'none';
  if (isPlaying) {
    artEl.classList.add('playing');
    waveform.classList.add('playing-active');
  } else {
    artEl.classList.remove('playing');
    waveform.classList.remove('playing-active');
  }
}

btn.addEventListener('click', () => {
  if (!playing) {
    setStatus('', 'Connecting…');
    setPlayState(true);
    initHls();
  } else {
    setStatus('', 'Stopped');
    destroyHls();
    setPlayState(false);
  }
});

audio.addEventListener('playing', () => setStatus('live', 'Live'));
audio.addEventListener('waiting', () => setStatus('', 'Buffering…'));
audio.addEventListener('stalled', () => setStatus('', 'Stalled…'));
audio.addEventListener('error',   () => { setStatus('error', 'Playback error'); setPlayState(false); });

volSlider.addEventListener('input', () => {
  const v = volSlider.value;
  audio.volume = v / 100;
  volLabel.textContent = v + '%';
});

const META_URL  = 'https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json';
const COVER_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg';
const npTitle     = document.getElementById('np-title');
const npArtist    = document.getElementById('np-artist');
const npMeta      = document.getElementById('np-meta');
const npQuality   = document.getElementById('np-quality');
const npQText     = document.getElementById('np-quality-text');
const npPip       = document.getElementById('np-pip');
const npCover     = document.getElementById('np-cover');
const npCoverWrap = document.getElementById('np-cover-wrap');
const trackList   = document.getElementById('track-list');

const noteIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>`;

let lastTitle = null;

function loadCover(cacheKey) {
  npCover.classList.add('loading');
  npCoverWrap.classList.remove('loaded');
  const img = new Image();
  img.onload = () => {
    npCover.src = img.src;
    npCover.classList.remove('loading');
    npCoverWrap.classList.add('loaded');
  };
  img.onerror = () => { npCoverWrap.classList.add('loaded'); };
  img.src = COVER_URL + '?_=' + encodeURIComponent(cacheKey);
}

function renderMetadata(d) {
  if (d.title === lastTitle) return;
  lastTitle = d.title;

  npTitle.textContent  = d.title  || '—';
  npArtist.textContent = d.artist || '—';

  const parts = [];
  if (d.album) parts.push(d.album);
  if (d.date)  parts.push(d.date);
  npMeta.textContent = parts.join(' · ') || '';

  if (d.bit_depth && d.sample_rate) {
    const khz = (d.sample_rate / 1000).toFixed(1).replace('.0', '');
    npQText.textContent = `${d.bit_depth}-bit / ${khz} kHz`;
    npQuality.style.display = '';
  }

  loadCover(d.title + (d.artist || ''));
  npPip.classList.add('show');

  currentSongKey = makeSongKey(d.artist, d.title);
  npRating.style.display = '';
  countUp.textContent = '—';
  countDown.textContent = '—';
  rateUp.disabled = rateDown.disabled = true;
  rateUp.classList.remove('active-up', 'active-down');
  rateDown.classList.remove('active-up', 'active-down');
  ratingNotice.textContent = '';
  startRatingPoll(currentSongKey);

  const prev = [];
  for (let i = 1; i <= 5; i++) {
    const a = d[`prev_artist_${i}`];
    const t = d[`prev_title_${i}`];
    if (a || t) prev.push({ artist: a || '', title: t || '' });
  }

  trackList.innerHTML = prev.map((tr, i) => `
    <div class="track-item">
      <span class="track-num">${i + 1}</span>
      <div class="track-icon">${noteIcon}</div>
      <div class="track-info">
        <div class="t-artist">${esc(tr.artist)}</div>
        <div class="t-title">${esc(tr.title)}</div>
      </div>
    </div>`).join('');
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fetchMeta() {
  try {
    const r = await fetch(META_URL + '?_=' + Date.now());
    if (r.ok) renderMetadata(await r.json());
  } catch (_) {}
}

fetchMeta();
setInterval(fetchMeta, 15000);

// ── Ratings ──
const rateUp       = document.getElementById('rate-up');
const rateDown     = document.getElementById('rate-down');
const countUp      = document.getElementById('count-up');
const countDown    = document.getElementById('count-down');
const npRating     = document.getElementById('np-rating');
const ratingNotice = document.getElementById('rating-notice');

function getUserId() {
  let id = localStorage.getItem('rc_uid');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID()
            : Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem('rc_uid', id);
  }
  return id;
}
const USER_ID = getUserId();

let currentSongKey  = null;
let ratingPollTimer = null;

function makeSongKey(artist, title) { return (artist || '') + '|||' + (title || ''); }

function applyRatingData(data) {
  countUp.textContent   = data.up;
  countDown.textContent = data.down;
  if (data.user_vote) {
    rateUp.disabled = rateDown.disabled = true;
    rateUp.classList.toggle('active-up',    data.user_vote === 'up');
    rateDown.classList.toggle('active-down', data.user_vote === 'down');
    ratingNotice.textContent = 'You rated this song';
  } else {
    rateUp.disabled = rateDown.disabled = false;
    rateUp.classList.remove('active-up', 'active-down');
    rateDown.classList.remove('active-up', 'active-down');
    ratingNotice.textContent = '';
  }
}

async function fetchRatings(key) {
  try {
    const r = await fetch('/api/ratings?s=' + encodeURIComponent(key)
                        + '&uid=' + encodeURIComponent(USER_ID));
    if (r.ok) applyRatingData(await r.json());
  } catch (_) {}
}

function startRatingPoll(key) {
  clearInterval(ratingPollTimer);
  fetchRatings(key);
  ratingPollTimer = setInterval(() => fetchRatings(key), 30000);
}

async function submitVote(vote) {
  if (!currentSongKey) return;
  rateUp.disabled = rateDown.disabled = true;
  try {
    const r = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s: currentSongKey, uid: USER_ID, vote })
    });
    const data = await r.json();
    if (r.ok || r.status === 409) applyRatingData(data);
    else rateUp.disabled = rateDown.disabled = false;
  } catch (_) { rateUp.disabled = rateDown.disabled = false; }
}

rateUp.addEventListener('click',   () => submitVote('up'));
rateDown.addEventListener('click', () => submitVote('down'));

// ── Elapsed time display ──
const timeDisplay = document.getElementById('time-display');
let sessionStart = null;
let elapsedTimer = null;

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

audio.addEventListener('playing', () => {
  if (!sessionStart) sessionStart = Date.now();
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    timeDisplay.textContent = formatElapsed(Date.now() - sessionStart) + ' / Live';
  }, 1000);
  timeDisplay.textContent = '0:00 / Live';
});

audio.addEventListener('emptied', () => {
  clearInterval(elapsedTimer);
  sessionStart = null;
  timeDisplay.textContent = 'Live';
});
