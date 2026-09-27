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

const METADATA_SONG_A = {
  artist: 'Artist A', title: 'Title A', album: 'Album A', date: '2020',
  bit_depth: 24, sample_rate: 48000,
};
const METADATA_SONG_B = {
  artist: 'Artist B', title: 'Title B', album: 'Album B', date: '2021',
  bit_depth: 16, sample_rate: 44100,
};

let ratingsState;

function fetchMock(url, opts) {
  const u = String(url);

  if (u.includes('metadatav2.json')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(currentMetadata) });
  }

  if (u.startsWith('/api/ratings')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(ratingsState) });
  }

  if (u.startsWith('/api/vote')) {
    const body = JSON.parse(opts.body);
    if (ratingsState.user_vote) {
      return Promise.resolve({
        ok: false, status: 409,
        json: () => Promise.resolve(ratingsState),
      });
    }
    ratingsState = {
      up: ratingsState.up + (body.vote === 'up' ? 1 : 0),
      down: ratingsState.down + (body.vote === 'down' ? 1 : 0),
      user_vote: body.vote,
    };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ratingsState) });
  }

  return Promise.reject(new Error(`unexpected fetch: ${u}`));
}

const flush = () => vi.advanceTimersByTimeAsync(0);

let currentMetadata;

beforeAll(async () => {
  vi.useFakeTimers();
  document.body.innerHTML = loadBodyMarkup();
  localStorage.setItem('rc_uid', 'test-user');
  vi.stubGlobal('fetch', vi.fn(fetchMock));

  currentMetadata = METADATA_SONG_A;
  ratingsState = { up: 3, down: 1, user_vote: null };

  const logic = require('../logic.js');
  Object.assign(globalThis, logic);
  await import('../script.js');
  await flush();
  await flush();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('rating UI', () => {
  it('renders the fetched vote counts and enables both buttons for a fresh song', () => {
    expect(document.getElementById('count-up').textContent).toBe('3');
    expect(document.getElementById('count-down').textContent).toBe('1');
    expect(document.getElementById('rate-up').disabled).toBe(false);
    expect(document.getElementById('rate-down').disabled).toBe(false);
    expect(document.getElementById('rating-notice').textContent).toBe('');
  });

  it('submits a vote on click and updates counts, disabled state, and notice text', async () => {
    document.getElementById('rate-up').click();
    await flush();

    expect(fetch).toHaveBeenCalledWith('/api/vote', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ s: 'Artist A|||Title A', uid: 'test-user', vote: 'up' }),
    }));
    expect(document.getElementById('count-up').textContent).toBe('4');
    expect(document.getElementById('rate-up').disabled).toBe(true);
    expect(document.getElementById('rate-down').disabled).toBe(true);
    expect(document.getElementById('rate-up').classList.contains('active-up')).toBe(true);
    expect(document.getElementById('rating-notice').textContent).toBe('You rated this song');
  });

  it('resets the rating UI when a new song is metadata-polled in', async () => {
    currentMetadata = METADATA_SONG_B;
    ratingsState = { up: 0, down: 0, user_vote: null };

    await vi.advanceTimersByTimeAsync(15000);

    expect(document.getElementById('np-title').textContent).toBe('Title B');
    expect(document.getElementById('count-up').textContent).toBe('0');
    expect(document.getElementById('count-down').textContent).toBe('0');
    expect(document.getElementById('rate-up').disabled).toBe(false);
    expect(document.getElementById('rate-down').disabled).toBe(false);
    expect(document.getElementById('rate-up').classList.contains('active-up')).toBe(false);
    expect(document.getElementById('rating-notice').textContent).toBe('');
  });
});
