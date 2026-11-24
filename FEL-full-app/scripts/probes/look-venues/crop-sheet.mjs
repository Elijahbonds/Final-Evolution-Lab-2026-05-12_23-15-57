// LOOK-VENUES: a before/after sheet of the SAME crop from several pictures, enlarged without smoothing so the stair-steps show.
//   node scripts/probes/look-venues/crop-sheet.mjs <out.jpg> <cols> <x0,y0,x1,y1 fractions> <zoom> <file=caption> ...
import sharp from 'sharp';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [out, cols, cropS, zoomS, ...items] = process.argv.slice(2);
if (!out || !items.length) { console.error('usage: crop-sheet.mjs out.jpg cols x0,y0,x1,y1 zoom file=caption ...'); process.exit(2); }
const [fx0, fy0, fx1, fy1] = cropS.split(',').map(Number), zoom = Number(zoomS);
const tmp = mkdtempSync(join(process.env.LV_TMP ?? tmpdir(), 'lv-crop-'));
const args = [];
let w = 0;
for (const [i, it] of items.entries()) {
  const m = it.match(/^(.*?\.(?:png|jpe?g))(?:=(.*))?$/i);
  const file = m ? m[1] : it, cap = (m?.[2] ?? file.split('/').pop()).replace(/=/g, ' ');
  const { width, height } = await sharp(file).metadata();
  const left = Math.round(fx0 * width), top = Math.round(fy0 * height), cw = Math.round((fx1 - fx0) * width), chh = Math.round((fy1 - fy0) * height);
  const f = join(tmp, `${i}.png`);
  await sharp(file).extract({ left, top, width: cw, height: chh }).resize({ width: Math.round(cw * zoom), kernel: 'nearest' }).png().toFile(f);
  w = Math.round(cw * zoom);
  args.push(`${f}=${cap}`);
}
const SHEET = join(dirname(fileURLToPath(import.meta.url)), '../improve-audit/sheet.mjs');
execFileSync(process.execPath, [SHEET, out, cols, String(w), ...args], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
