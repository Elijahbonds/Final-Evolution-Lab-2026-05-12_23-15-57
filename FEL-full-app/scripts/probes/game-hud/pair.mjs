// game-hud: the before / after photographs side by side, one JPG per mode and view (sharp, already in node_modules).
//   node pair.mjs <outDir> <destDir> [view=play-phone,play-desktop] [modes]
// Each pair is labelled BEFORE / AFTER over the top-left of each half.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const sharp = require('sharp');

const [OUT, DEST, VIEWS = 'play-phone,play-desktop', MODES] = process.argv.slice(2);
fs.mkdirSync(DEST, { recursive: true });
const shots = path.join(OUT, 'shots');
const modes = MODES ? MODES.split(',') : [...new Set(fs.readdirSync(shots).map((f) => f.replace(/-(before|after)-.*$/, '')))];
const label = (t, w) => Buffer.from(`<svg width="${w}" height="34"><rect x="0" y="0" width="${Math.min(w, 130)}" height="34" fill="#000" fill-opacity="0.75"/><text x="10" y="24" font-family="sans-serif" font-size="20" font-weight="700" fill="${t === 'BEFORE' ? '#ff6b8b' : '#5cffb4'}">${t}</text></svg>`);
for (const m of modes) for (const v of VIEWS.split(',')) {
  const a = path.join(shots, `${m}-before-${v}.jpg`), b = path.join(shots, `${m}-after-${v}.jpg`);
  if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const gap = 12, W = ma.width + gap + mb.width, H = Math.max(ma.height, mb.height);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: ma.width + gap, top: 0 }, { input: label('BEFORE', ma.width), left: 0, top: 0 }, { input: label('AFTER', mb.width), left: ma.width + gap, top: 0 }])
    .jpeg({ quality: 80 }).toFile(path.join(DEST, `${m}-${v}.jpg`));
  console.log(`${m}-${v}.jpg`);
}
