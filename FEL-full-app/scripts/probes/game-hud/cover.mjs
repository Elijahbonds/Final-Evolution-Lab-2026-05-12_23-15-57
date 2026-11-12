// game-hud: how much of the play area the HUD hides, re-run OFFLINE from the rects hud.mts dumped (no browser).
//   node cover.mjs <outDir> [tagA=before] [tagB=after]
// The rule (one place, so before and after are read alike): on a 2 px grid over the game canvas, a cell is hidden when a
// PAINTED box is over it — a background of alpha >= 0.1 (a gradient counts too), a border, an <svg>/<img>, or a run of
// text's glyph boxes. A box the size of half the play area or more (a vignette, the juice overlay, a scrim) tints the
// picture and is left out. Split by who drew it: the mode's HUD, the touch deck, the shell's chrome (the ⋯, the corner
// buttons).
import fs from 'node:fs';
import path from 'node:path';

const [OUT, A = 'before', B = 'after'] = process.argv.slice(2);
const S = 2;
function cover(p) {
  if (!p || !p.canvasRect) return null;
  const cr = p.canvasRect; const gw = Math.ceil((cr.r - cr.x) / S), gh = Math.ceil((cr.b - cr.y) / S);
  const g = { hud: new Uint8Array(gw * gh), deck: new Uint8Array(gw * gh), chrome: new Uint8Array(gw * gh) };
  const paint = (arr, x, y, w, h) => {
    const x0 = Math.max(0, Math.floor((x - cr.x) / S)), x1 = Math.min(gw, Math.ceil((x + w - cr.x) / S));
    const y0 = Math.max(0, Math.floor((y - cr.y) / S)), y1 = Math.min(gh, Math.ceil((y + h - cr.y) / S));
    for (let yy = y0; yy < y1; yy++) if (x1 > x0) arr.fill(1, yy * gw + x0, yy * gw + x1);
  };
  for (const d of p.dump ?? []) {
    if (!g[d.cls] || d.big) continue;
    if (d.k === 'bg' && d.a < 0.1) continue;
    paint(g[d.cls], d.x, d.y, d.w, d.h);
  }
  for (const t of p.textDump ?? []) if (g[t.cls]) paint(g[t.cls], t.x, t.y, t.r - t.x, t.b - t.y);
  const n = (arr) => arr.reduce((s, v) => s + v, 0);
  const all = new Uint8Array(gw * gh); for (const a of Object.values(g)) for (let i = 0; i < a.length; i++) all[i] |= a[i];
  const pct = (k) => Math.round((k / (gw * gh)) * 1000) / 10;
  return { hud: pct(n(g.hud)), deck: pct(n(g.deck)), chrome: pct(n(g.chrome)), all: pct(n(all)) };
}
const views = [['playPortrait', 'upright phone'], ['playPhone', 'sideways phone'], ['playDesktop', 'desktop']];
const modes = [...new Set(fs.readdirSync(OUT).filter((f) => f.endsWith(`-${A}.json`)).map((f) => f.slice(0, -(`-${A}.json`).length)))].sort();
const rows = [];
for (const m of modes) {
  const rd = (t) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, `${m}-${t}.json`), 'utf8')); } catch { return null; } };
  const a = rd(A), b = rd(B);
  for (const [k, label] of views) {
    const ca = cover(a?.[k]?.play), cb = cover(b?.[k]?.play);
    rows.push({ mode: m, view: label, [`hud ${A}`]: ca?.hud, [`hud ${B}`]: cb?.hud, [`deck ${A}`]: ca?.deck, [`deck ${B}`]: cb?.deck, [`all ${A}`]: ca?.all, [`all ${B}`]: cb?.all,
      [`⋯ over HUD text px² ${A}`]: a?.[k]?.play?.capOverPx2, [`⋯ over HUD text px² ${B}`]: b?.[k]?.play?.capOverPx2 });
  }
}
console.table(rows);
fs.writeFileSync(path.join(OUT, `cover-${A}-${B}.json`), JSON.stringify(rows, null, 1));
