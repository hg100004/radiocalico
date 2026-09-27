function makeSongKey(artist, title) { return (artist || '') + '|||' + (title || ''); }

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { makeSongKey, esc, formatElapsed };
}
