// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadBodyMarkup() {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const match = html.match(/<body>([\s\S]*?)<script src="\/logic\.js">/);
  return match[1];
}

class FakeHls {
  constructor(opts) { this.opts = opts; this.listeners = {}; FakeHls.instances.push(this); }
  loadSource(url) { this.src = url; }
  attachMedia(el) { this.media = el; }
  on(event, cb) { this.listeners[event] = cb; }
  destroy() { this.destroyed = true; }
}
FakeHls.isSupported = () => true;
FakeHls.Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError' };
FakeHls.instances = [];

function fetchMock(url) {
  return Promise.reject(new Error(`unexpected fetch in this test: ${url}`));
}

const flush = () => vi.advanceTimersByTimeAsync(0);

let capturedAudio;

beforeAll(async () => {
  vi.useFakeTimers();
  document.body.innerHTML = loadBodyMarkup();
  localStorage.setItem('rc_uid', 'test-user');
  vi.stubGlobal('fetch', vi.fn(fetchMock));
  vi.stubGlobal('Hls', FakeHls);

  const RealAudio = globalThis.Audio;
  vi.stubGlobal('Audio', function (...args) {
    capturedAudio = new RealAudio(...args);
    return capturedAudio;
  });

  const logic = require('../logic.js');
  Object.assign(globalThis, logic);
  await import('../script.js');
  await flush();
});

afterAll(() => {
  vi.useRealTimers();
});

function iconState() {
  return {
    play: document.getElementById('icon-play').style.display,
    pause: document.getElementById('icon-pause').style.display,
    artPlaying: document.getElementById('art').classList.contains('playing'),
    wavePlaying: document.getElementById('waveform').classList.contains('playing-active'),
  };
}

describe('player controls', () => {
  it('builds the waveform bars on load', () => {
    expect(document.getElementById('waveform').querySelectorAll('.bar').length).toBe(16);
  });

  it('starts paused, with the play icon visible', () => {
    const s = iconState();
    expect(s.play).toBe('');
    expect(s.pause).toBe('none');
    expect(s.artPlaying).toBe(false);
    expect(s.wavePlaying).toBe(false);
  });

  it('clicking play shows "Connecting…", switches icons, and initializes HLS', () => {
    document.getElementById('btn-play').click();

    expect(document.getElementById('status-text').textContent).toBe('Connecting…');
    const s = iconState();
    expect(s.play).toBe('none');
    expect(s.pause).toBe('');
    expect(s.artPlaying).toBe(true);
    expect(s.wavePlaying).toBe(true);
    expect(FakeHls.instances).toHaveLength(1);
    expect(FakeHls.instances[0].src).toContain('live.m3u8');
    expect(FakeHls.instances[0].media).toBe(capturedAudio);
  });

  it('the audio "playing" event sets status to Live and starts the elapsed timer', async () => {
    capturedAudio.dispatchEvent(new Event('playing'));

    expect(document.getElementById('status-text').textContent).toBe('Live');
    expect(document.getElementById('time-display').textContent).toBe('0:00 / Live');

    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById('time-display').textContent).toBe('0:01 / Live');
  });

  it('the audio "waiting" and "stalled" events update the status text', () => {
    capturedAudio.dispatchEvent(new Event('waiting'));
    expect(document.getElementById('status-text').textContent).toBe('Buffering…');

    capturedAudio.dispatchEvent(new Event('stalled'));
    expect(document.getElementById('status-text').textContent).toBe('Stalled…');
  });

  it('moving the volume slider updates audio volume and the label', () => {
    const slider = document.getElementById('volume');
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));

    expect(capturedAudio.volume).toBeCloseTo(0.3);
    expect(document.getElementById('vol-label').textContent).toBe('30%');
  });

  it('clicking play again stops playback and resets the UI', () => {
    document.getElementById('btn-play').click();

    expect(document.getElementById('status-text').textContent).toBe('Stopped');
    const s = iconState();
    expect(s.play).toBe('');
    expect(s.pause).toBe('none');
    expect(s.artPlaying).toBe(false);
    expect(s.wavePlaying).toBe(false);
    expect(FakeHls.instances[0].destroyed).toBe(true);
  });

  it('the audio "emptied" event resets the elapsed time display', () => {
    capturedAudio.dispatchEvent(new Event('emptied'));
    expect(document.getElementById('time-display').textContent).toBe('Live');
  });

  it('an audio "error" event shows a playback error and resets play state', () => {
    document.getElementById('btn-play').click();
    capturedAudio.dispatchEvent(new Event('error'));

    expect(document.getElementById('status-text').textContent).toBe('Playback error');
    const s = iconState();
    expect(s.play).toBe('');
    expect(s.pause).toBe('none');
    expect(s.artPlaying).toBe(false);
  });
});
