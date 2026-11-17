// VENICE HUB MAP (lane/venice-hub, 2026-11-12): the top-down map of the hub and the zones, drawn FROM the layout data
// (lib/adventure/venice/layout.ts) in a headless browser canvas and saved as JPG. Nothing is hand-placed here: move a spot
// in the layout and the map moves with it.
//
//   OUT=<dir> npx tsx scripts/probes/venice-hub/map.mts     (run it under /home/user/wt/gate-run.sh: it starts a browser)
// Writes <OUT>/venice-hub-map.jpg (the hub, north up, 64 m grid) and <OUT>/venice-zones.jpg (the hub and the five zones to
// scale, first cut solid and full size dashed, beside the Adventure's 320 m BR map for scale).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import * as layoutNs from '../../../lib/adventure/venice/layout';

// the app's modules load as CommonJS under tsx: the named exports sit on the default (scripts/probes/_body-seam-live.mts)
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { DISTRICTS, SPOTS, ZONES, HUB_COLS, HUB_ROWS, PIECE_M, HUB_MIN_X, HUB_MIN_Z } = unwrap(layoutNs);

const OUT = process.env.OUT ?? '/tmp/venice-hub';
fs.mkdirSync(OUT, { recursive: true });
const data = { DISTRICTS, SPOTS, ZONES, HUB_COLS, HUB_ROWS, PIECE_M, HUB_MIN_X, HUB_MIN_Z };

const HUB_PAGE = `<!doctype html><html><body style="margin:0;background:#0d1117"><canvas id="c"></canvas><script>
const D = ${JSON.stringify(data)};
const S = 2.1, M = 70, LEG = 420;
const W = D.HUB_COLS * D.PIECE_M * S, H = D.HUB_ROWS * D.PIECE_M * S;
const cv = document.getElementById('c'); cv.width = W + M * 2 + LEG; cv.height = H + M * 2 + 40;
const g = cv.getContext('2d');
const X = (x) => M + (x - D.HUB_MIN_X) * S, Z = (z) => M + 40 + (z - D.HUB_MIN_Z) * S;
const strip = (s) => s.replace('[PLACEHOLDER] ', '');
g.fillStyle = '#0d1117'; g.fillRect(0, 0, cv.width, cv.height);
g.fillStyle = '#e6edf3'; g.font = 'bold 22px sans-serif'; g.fillText('Venice hub — layout draft (every name a placeholder)', M, 34);
g.font = '13px sans-serif'; g.fillStyle = '#8b949e'; g.fillText('North up. One square = one 64 m world piece. 5 x 8 pieces = 320 x 512 m. Drawn from lib/adventure/venice/layout.ts', M, 54);
for (const d of D.DISTRICTS) for (const [i, j] of d.cells) {
  const x0 = D.HUB_MIN_X + i * D.PIECE_M, z0 = D.HUB_MIN_Z + j * D.PIECE_M;
  g.fillStyle = d.color; g.fillRect(X(x0), Z(z0), D.PIECE_M * S, D.PIECE_M * S);
}
// the bike path and the boardwalk run the whole strip
g.fillStyle = '#2b2f36'; g.fillRect(X(22), Z(D.HUB_MIN_Z), 8 * S, H);
g.strokeStyle = '#e3c23a'; g.setLineDash([8, 8]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(26), Z(D.HUB_MIN_Z)); g.lineTo(X(26), Z(-D.HUB_MIN_Z)); g.stroke(); g.setLineDash([]);
g.fillStyle = 'rgba(232,222,200,0.55)'; g.fillRect(X(34), Z(D.HUB_MIN_Z), 16 * S, H);
// the pier
g.fillStyle = '#6b4f33'; g.fillRect(X(-160), Z(156), 128 * S, 7 * S);
// grid
g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
for (let i = 0; i <= D.HUB_COLS; i++) { g.beginPath(); g.moveTo(X(D.HUB_MIN_X + i * 64), Z(D.HUB_MIN_Z)); g.lineTo(X(D.HUB_MIN_X + i * 64), Z(-D.HUB_MIN_Z)); g.stroke(); }
for (let j = 0; j <= D.HUB_ROWS; j++) { g.beginPath(); g.moveTo(X(D.HUB_MIN_X), Z(D.HUB_MIN_Z + j * 64)); g.lineTo(X(-D.HUB_MIN_X), Z(D.HUB_MIN_Z + j * 64)); g.stroke(); }
// district names + phase, once per district at its first cell
for (const d of D.DISTRICTS) {
  const xs = d.cells.map(c => c[0]), zs = d.cells.map(c => c[1]);
  const cx = D.HUB_MIN_X + (Math.min(...xs)) * 64 + 4, cz = D.HUB_MIN_Z + (Math.min(...zs)) * 64 + 4;
  g.fillStyle = 'rgba(0,0,0,0.55)'; const label = strip(d.name) + '  ' + d.phase; g.font = 'bold 12px sans-serif';
  const w = g.measureText(label).width + 8; g.fillRect(X(cx), Z(cz), w, 17);
  g.fillStyle = d.phase === 'V1' ? '#ffd166' : '#ffffff'; g.fillText(label, X(cx) + 4, Z(cz) + 13);
}
// the four courts of the V1 park
for (const s of D.SPOTS.filter(s => s.run || s.district === 'courts' && s.modes.length && s.id !== 'court.camera')) {
  const hw = 9, hl = 15; g.strokeStyle = '#f2f6ff'; g.lineWidth = 2; g.strokeRect(X(s.at[0] - hw), Z(s.at[1] - hl), hw * 2 * S, hl * 2 * S);
  g.fillStyle = '#1f5a8e'; g.fillRect(X(s.at[0] - hw) + 2, Z(s.at[1] - hl) + 2, hw * 2 * S - 4, hl * 2 * S - 4);
  g.beginPath(); g.arc(X(s.at[0]), Z(s.at[1] - hl + 1.6), 6.75 * S, 0, Math.PI); g.strokeStyle = '#f2f6ff'; g.stroke();
  if (s.run) { g.fillStyle = '#c7a26b'; g.fillRect(X(s.at[0] + hw + 1), Z(s.at[1] - 6), 2 * S, 12 * S); }
}
// spots
for (const s of D.SPOTS) {
  const door = !!s.zone, home = s.id === 'plaza.home' || s.id === 'courts.entry';
  g.beginPath(); g.arc(X(s.at[0]), Z(s.at[1]), Math.max(5, s.radius * S * 0.5), 0, Math.PI * 2);
  g.fillStyle = door ? '#ff7b3d' : home ? '#58a6ff' : '#ffd166'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
  g.font = '11px sans-serif'; const t = strip(s.label); const w = g.measureText(t).width + 6;
  const tx = X(s.at[0]) + 9, tz = Z(s.at[1]) - 7;
  g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(tx, tz - 10, w, 14); g.fillStyle = '#fff'; g.fillText(t, tx + 3, tz + 1);
}
// compass
g.fillStyle = '#e6edf3'; g.font = 'bold 16px sans-serif'; g.fillText('N', X(D.HUB_MIN_X) - 40, Z(D.HUB_MIN_Z) + 18);
g.beginPath(); g.moveTo(X(D.HUB_MIN_X) - 35, Z(D.HUB_MIN_Z) + 24); g.lineTo(X(D.HUB_MIN_X) - 35, Z(D.HUB_MIN_Z) + 70); g.strokeStyle = '#e6edf3'; g.stroke();
g.font = '12px sans-serif'; g.fillStyle = '#8b949e';
g.save(); g.translate(X(D.HUB_MIN_X) - 22, Z(0) + 60); g.rotate(-Math.PI / 2); g.fillText('WEST: the sea', 0, 0); g.restore();
g.save(); g.translate(X(-D.HUB_MIN_X) + 18, Z(0) - 40); g.rotate(Math.PI / 2); g.fillText('EAST: the town', 0, 0); g.restore();
// legend
let ly = 90; const lx = W + M * 2 - 10;
g.fillStyle = '#e6edf3'; g.font = 'bold 15px sans-serif'; g.fillText('Spots (walk up to play)', lx, ly); ly += 8;
g.font = '12px sans-serif';
for (const s of D.SPOTS) {
  if (!s.modes.length && !s.zone) continue; ly += 17;
  g.fillStyle = s.zone ? '#ff7b3d' : '#ffd166'; g.fillRect(lx, ly - 10, 10, 10);
  g.fillStyle = '#c9d1d9'; g.fillText(strip(s.label) + ': ' + (s.zone ? 'door to ' + (s.zone === '*' ? 'every zone' : s.zone) : s.modes.join(', ')), lx + 16, ly);
}
ly += 30; g.fillStyle = '#e6edf3'; g.font = 'bold 15px sans-serif'; g.fillText('Build phases', lx, ly); g.font = '12px sans-serif';
for (const [p, t] of [['V1', 'the courts (hoops park), first'], ['V2', 'the run, party, online'], ['V3', 'the boardwalk spine + streaming'], ['V4', 'the other Venice places'], ['V5', 'town, pier, first zone'], ['V6+', 'story worlds, more zones']]) { ly += 17; g.fillStyle = '#c9d1d9'; g.fillText(p + '  ' + t, lx, ly); }
ly += 30; g.fillStyle = '#ffd166'; g.fillRect(lx, ly - 10, 10, 10); g.fillStyle = '#c9d1d9'; g.fillText('a game spot', lx + 16, ly);
ly += 17; g.fillStyle = '#ff7b3d'; g.fillRect(lx, ly - 10, 10, 10); g.fillStyle = '#c9d1d9'; g.fillText('a door to an open zone', lx + 16, ly);
ly += 17; g.fillStyle = '#58a6ff'; g.fillRect(lx, ly - 10, 10, 10); g.fillStyle = '#c9d1d9'; g.fillText('home spawn (V1: court gate, V3+: plaza)', lx + 16, ly);
ly += 17; g.fillStyle = '#c7a26b'; g.fillRect(lx, ly - 10, 10, 10); g.fillStyle = '#c9d1d9'; g.fillText('the run\\'s bench (queue, next up, watch)', lx + 16, ly);
document.title = 'done';
</script></body></html>`;

const ZONE_PAGE = `<!doctype html><html><body style="margin:0;background:#0d1117"><canvas id="c"></canvas><script>
const D = ${JSON.stringify(data)};
const S = 0.42, cv = document.getElementById('c'); cv.width = 1600; cv.height = 1000;
const g = cv.getContext('2d'); g.fillStyle = '#0d1117'; g.fillRect(0, 0, cv.width, cv.height);
g.fillStyle = '#e6edf3'; g.font = 'bold 22px sans-serif'; g.fillText('The hub town and the open zones, to scale (one square = 64 m)', 30, 36);
g.font = '13px sans-serif'; g.fillStyle = '#8b949e'; g.fillText('Solid: the first cut a phone holds at budget. Dashed: the full size once streaming is proven. Grey: the Adventure BR map (5 x 5 pieces, 320 m), measured on the phone profile.', 30, 58);
const box = (x, y, wP, hP, color, label, sub, dashed) => {
  const w = wP * 64 * S, h = hP * 64 * S;
  if (!dashed) { g.fillStyle = color; g.globalAlpha = 0.85; g.fillRect(x, y, w, h); g.globalAlpha = 1; }
  g.strokeStyle = dashed ? color : 'rgba(255,255,255,0.35)'; g.lineWidth = dashed ? 2 : 1; g.setLineDash(dashed ? [7, 6] : []);
  if (!dashed) { for (let i = 0; i <= wP; i++) { g.beginPath(); g.moveTo(x + i * 64 * S, y); g.lineTo(x + i * 64 * S, y + h); g.stroke(); } for (let j = 0; j <= hP; j++) { g.beginPath(); g.moveTo(x, y + j * 64 * S); g.lineTo(x + w, y + j * 64 * S); g.stroke(); } }
  else g.strokeRect(x, y, w, h);
  g.setLineDash([]);
  if (label) { g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.fillText(label, x + 4, y + 16); g.font = '11px sans-serif'; g.fillStyle = '#e6edf3'; (sub || []).forEach((t, k) => g.fillText(t, x + 4, y + 31 + k * 13)); }
};
const strip = (s) => s.replace('[PLACEHOLDER] ', '');
// the hub in the middle
const hx = 700, hy = 330;
box(hx, hy, D.HUB_COLS, D.HUB_ROWS, '#e0a040', 'Venice (hub town)', ['5 x 8 pieces', '320 x 512 m', '22 game spots'], false);
const slots = { coast: [hx - 520, hy + 60], wilds: [hx - 330, 90], city: [hx + 220, 90], alpine: [hx + 360, hy + 40], canyon: [hx + 170, hy + 290] };
for (const z of D.ZONES) {
  const [x, y] = slots[z.id] || [40, 40];
  box(x, y, z.fullPieces[0], z.fullPieces[1], z.color, '', [], true);
  box(x, y, z.firstPieces[0], z.firstPieces[1], z.color, strip(z.name), [z.firstPieces.join(' x ') + ' first (' + z.firstPieces[0] * 64 + ' x ' + z.firstPieces[1] * 64 + ' m)', 'full ' + z.fullPieces.join(' x '), 'home: ' + (z.homes.join(', ') || '-'), 'door: ' + z.door, z.phase], false);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(x + z.firstPieces[0] * 32 * S, y + z.firstPieces[1] * 32 * S); g.lineTo(hx + 160 * S, hy + 256 * S); g.stroke(); g.setLineDash([]);
}
box(40, 800, 5, 5, '#6e7681', 'BR map', ['5 x 5, 320 m', 'phone: 86 draws'], false);
document.title = 'done';
</script></body></html>`;

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox'] });
try {
  for (const [name, html, w, h] of [['venice-hub-map', HUB_PAGE, 1300, 1300], ['venice-zones', ZONE_PAGE, 1600, 1000]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(html);
    await page.waitForFunction(() => document.title === 'done', null, { timeout: 15000 });
    const file = path.join(OUT, `${name}.jpg`);
    await page.locator('#c').screenshot({ path: file, type: 'jpeg', quality: 88 });
    console.log('wrote', file);
    await page.close();
  }
} finally {
  await browser.close();
}
