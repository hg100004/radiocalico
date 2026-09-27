import { describe, it, expect } from 'vitest';
const { makeSongKey, esc, formatElapsed } = require('../logic.js');

describe('makeSongKey', () => {
  it('joins artist and title with a separator', () => {
    expect(makeSongKey('Artist', 'Title')).toBe('Artist|||Title');
  });

  it('treats missing artist as empty string', () => {
    expect(makeSongKey(null, 'Title')).toBe('|||Title');
  });

  it('treats missing title as empty string', () => {
    expect(makeSongKey('Artist', undefined)).toBe('Artist|||');
  });

  it('produces distinct keys for different songs', () => {
    expect(makeSongKey('A', 'B')).not.toBe(makeSongKey('B', 'A'));
  });
});

describe('esc', () => {
  it('escapes ampersands, angle brackets, and quotes', () => {
    expect(esc('<a href="x">Tom & Jerry</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;'
    );
  });

  it('leaves plain text unchanged', () => {
    expect(esc('Plain Title')).toBe('Plain Title');
  });

  it('escapes ampersands before other entities are introduced', () => {
    expect(esc('&lt;')).toBe('&amp;lt;');
  });
});

describe('formatElapsed', () => {
  it('formats zero as 0:00', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('pads seconds under 10', () => {
    expect(formatElapsed(5000)).toBe('0:05');
  });

  it('rolls over into minutes', () => {
    expect(formatElapsed(65000)).toBe('1:05');
  });

  it('truncates partial seconds', () => {
    expect(formatElapsed(1999)).toBe('0:01');
  });

  it('handles durations over an hour without hour formatting', () => {
    expect(formatElapsed(3661000)).toBe('61:01');
  });
});
