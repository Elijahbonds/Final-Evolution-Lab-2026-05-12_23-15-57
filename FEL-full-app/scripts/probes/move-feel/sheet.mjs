// move-feel / sheet — the one JPG (lane/move-feel, 2026-11-12): simple charts from analyze.mjs --series and the frame strips feel-ext.mjs
// saved (STRIPS=1), drawn as one HTML page and photographed by the rig's Chromium (no project dependency; a browser job: run it through
// /home/user/wt/gate-run.sh, it holds the lock for a few seconds).
//   node scripts/probes/move-feel/sheet.mjs <series.json> <shotsDir> <out.jpg> <rel-tag> <main-tag> <try-tag> <rel-3v3-tag> <main-3v3-tag>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '../../../package.json'));
const [seriesF, shots, out, rel, main, tr, r3, m3] = process.argv.slice(2);
const S = JSON.parse(fs.readFileSync(seriesF, 'utf8'));
const test = (tag, name) => (S[tag] || []).find((t) => t.name === name) || null;
const COL = ['#2662c8', '#e67814', '#289646', '#8c3caa', '#6e6e6e'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function chart(title, lines, ymax, unit, bars = [], xmax = 120, marks = [], asDots = false) {
  const W = 860, H = 330, px = 56, py = 40, pw = W - 80, ph = H - 80;
  const X = (i) => px + (pw * i) / xmax, Y = (v) => py + ph - (ph * Math.min(Math.max(v, 0), ymax)) / ymax;
  let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#ccc"/><text x="10" y="24" font-size="18" fill="#222">${esc(title)}</text>`;
  for (let k = 0; k <= 5; k++) { const v = (ymax * k) / 5; g += `<line x1="${px}" x2="${px + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e4e4e8"/><text x="8" y="${Y(v) + 5}" font-size="13">${v.toFixed(v < 10 ? 1 : 0)}</text>`; }
  for (let k = 0; k * 30 <= xmax; k++) g += `<line x1="${X(k * 30)}" x2="${X(k * 30)}" y1="${py}" y2="${py + ph}" stroke="#e4e4e8"/><text x="${X(k * 30) - 8}" y="${py + ph + 18}" font-size="13">${(k * 0.5).toFixed(1)}</text>`;
  g += `<text x="${px + pw - 60}" y="${py + ph + 36}" font-size="13">seconds</text><text x="${px}" y="${py - 4}" font-size="13" fill="#666">${unit}</text>`;
  for (const [v, lab] of bars) g += `<line x1="${px}" x2="${px + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="#c82828" stroke-width="2"/><text x="${px + pw - 250}" y="${Y(v) - 6}" font-size="13" fill="#c82828">${esc(lab)}</text>`;
  for (const [i, lab] of marks) g += `<line x1="${X(i)}" x2="${X(i)}" y1="${py}" y2="${py + ph}" stroke="#aaa"/><text x="${X(i) + 3}" y="${py + 14}" font-size="12" fill="#888">${esc(lab)}</text>`;
  lines.forEach(([lab, v, col], ci) => {
    const pts = v.slice(0, xmax).map((y, i) => (y === null || y === undefined ? null : [X(i), Y(y)]));
    if (asDots) pts.forEach((p) => { if (p) g += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${col}"/>`; });
    else g += `<polyline fill="none" stroke="${col}" stroke-width="3" points="${pts.filter(Boolean).map((p) => p.join(',')).join(' ')}"/>`;
    g += `<text x="${W - 340}" y="${22 + ci * 17}" font-size="13" fill="${col}">— ${esc(lab)}</text>`;
  });
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}
const marksOf = (t) => (t ? t.series.marks.map(([i, m]) => [i, m]) : []);
const c = [];
{ const j = test(rel, 'jog'), s = test(rel, 'sprint'); c.push(chart('1. Speed on a start and a stop (1v1, m/s)', [j && ['jog: push, hold, let go', j.series.sp, COL[0]], s && ['turbo: push, hold, let go', s.series.sp, COL[1]]].filter(Boolean), 7, 'm/s', [[4.33 * 0.9, '90 % of the jog: reached at 0.25 s (bar)']], 120, marksOf(j))); }
{ const a = test(rel, 'cutSprint'), b = test(tr, 'cutSprint'), j = test(rel, 'cut'); c.push(chart('2. Speed through a 90° cut (1v1, m/s)', [a && ['turbo cut, shipped (cost lands in a frame)', a.series.sp, COL[1]], b && ['turbo cut, try values (cut cost over 0.08 s)', b.series.sp, COL[2]], j && ['jog cut, shipped', j.series.sp, COL[0]]].filter(Boolean), 7, 'm/s', [], 120, marksOf(a))); }
{ const s = test(rel, 'sprint'), a = test(m3, 'slide'), b = test(r3, 'slide'); c.push(chart('3. Planted-foot slide per frame (cm)', [s && ['1v1 turbo run and stop, release', s.series.slide, COL[1]], a && ['3v3 defence slide, live (main)', a.series.slide, COL[4]], b && ['3v3 defence slide, release', b.series.slide, COL[3]]].filter(Boolean), 18, 'cm', [[3, 'bar: 3 cm a frame']], 160, [], true)); }
{ const a = test(rel, 'reverse'), b = test(tr, 'reverse'), j = test(rel, 'jog'); c.push(chart('4. Camera turn rate (°/s): one-frame whips', [a && ['stick thrown back, shipped', a.series.camYawRate, COL[1]], b && ['stick thrown back, hoops.camLeadEase 1', b.series.camYawRate, COL[2]], j && ['jog then let go, shipped', j.series.camYawRate, COL[0]]].filter(Boolean), 320, '°/s', [[120, 'bar: p99 ≤ 120 °/s']], 140, marksOf(a))); }
const STRIPS = [['jog', 'Let go at a jog (every 2nd frame from the release): the body glides to a stop on its loop, no plant clip'], ['sprint', 'Let go at full turbo: 0.68 m of glide, the feet sliding 15 cm a frame'], ['cut', 'A 90° cut at a jog: the run turns while the legs keep their loop'], ['reverse', 'The stick thrown back at a jog: brake through zero, the camera whips (291 °/s)'], ['slide', 'Defence (1v1): slide right, then left — the planted foot slides at the change']];
let strips = '';
for (const [n, cap] of STRIPS) {
  const dir = path.join(shots, `strip-onevone-mf-${n}`); if (!fs.existsSync(dir)) continue;
  const fr = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort().slice(0, 6);
  strips += `<div class="cap">${esc(cap)}</div><div class="row">${fr.map((f) => `<img src="data:image/jpeg;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}">`).join('')}</div>`;
}
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#f4f4f6;font:16px sans-serif;color:#222;width:1760px}.g{display:grid;grid-template-columns:860px 860px;gap:16px}.cap{margin:14px 0 6px;font-size:17px}.row{display:flex;gap:6px}.row img{width:288px;height:162px;object-fit:cover}</style>
<h2 style="margin:0 0 12px">Why the movement feels off — measured on the real 1v1 / 3v3 (lane/move-feel). Red lines are the bars.</h2><div class="g">${c.join('')}</div>${strips}`;
const htmlF = out.replace(/\.jpg$/, '.html'); fs.writeFileSync(htmlF, html);
const { chromium } = require('playwright-core');
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1792, height: 900 } });
await p.goto('file://' + htmlF); await p.screenshot({ path: out, type: 'jpeg', quality: 82, fullPage: true }); await b.close();
console.log('wrote', out);
