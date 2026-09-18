// venueThumbs — kills E12 (404 on /img/venues/*.jpg on every mode page).
// Procedural canvas thumbnails: zero assets, zero requests, on-brand gradients
// with a sport glyph. Replace every <img src="/img/venues/x.jpg"> with
// <img src={venueThumb('x')}>.

const PALETTES: Record<string, [string, string, string]> = {
  'venice-court':   ['#ff9a3d', '#1c4d8f', '#0b2036'],
  'shimogamo-dojo': ['#caa06a', '#5a3b22', '#1c120a'],
  'gridiron':       ['#0b3d1f', '#0f5c2e', '#04160c'],
  'skatepark':      ['#6d5a8c', '#3a2f52', '#171126'],
  'mountain-slope': ['#dfe8ee', '#9fb4c4', '#41586b'],
  'surf-break':     ['#37b6d9', '#12608f', '#062b45'],
  'tennis-court':   ['#2f7fb0', '#1c4d6e', '#0a2233'],
  'coastal-links':  ['#2e8b45', '#1c5c2e', '#0a2412'],
  'ballpark':       ['#3f7a3f', '#7a5230', '#141d10'],
  'fc-stadium':     ['#1f7a3a', '#123c68', '#071426'],
  default:          ['#22d3ee', '#134e5e', '#071a20'],
};

const GLYPHS: Record<string, string> = {
  'venice-court': '🏀', 'shimogamo-dojo': '🥋', 'gridiron': '🏈',
  'skatepark': '🛹', 'mountain-slope': '🏂', 'surf-break': '🏄',
  'tennis-court': '🎾', 'coastal-links': '⛳', 'ballpark': '⚾', 'fc-stadium': '⚽',
};

const cache = new Map<string, string>();

export function venueThumb(venueId: string, w = 480, h = 270): string {
  const key = `${venueId}_${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d')!;
  const [top, mid, bottom] = PALETTES[venueId] ?? PALETTES.default;

  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top); grad.addColorStop(0.55, mid); grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // horizon band + court-line accents give it a "venue" read
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(0, h * 0.52, w, 2);
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(w * 0.18, h); g.lineTo(w * 0.42, h * 0.55);
  g.moveTo(w * 0.82, h); g.lineTo(w * 0.58, h * 0.55);
  g.stroke();

  const glyph = GLYPHS[venueId];
  if (glyph) {
    g.font = `${Math.round(h * 0.30)}px serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = 0.9;
    g.fillText(glyph, w / 2, h * 0.40);
    g.globalAlpha = 1;
  }

  const url = canvas.toDataURL('image/jpeg', 0.82);
  cache.set(key, url);
  return url;
}

// SWEEP: grep `/img/venues/` — replace every reference; delete the dead dir
// from any manifest. Acceptance: zero 404s on all mode routes (E12).
