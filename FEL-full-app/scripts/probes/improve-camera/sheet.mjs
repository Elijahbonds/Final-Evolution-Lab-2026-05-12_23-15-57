// improve-camera (phase 8): the owner's before/after picture — rows of [today | new] tiles from the probes' SHOT_AT frames.
//   node sheet.mjs <out.jpg> "<title>" "<row label>" <before.jpg> <after.jpg> ["<row label>" <before.jpg> <after.jpg> ...]
// Each row is one moment of the same scripted play on both builds: today's camera on the left, the new one on the right.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const sharp = require('sharp');
const [OUT, TITLE, ...ROWS] = process.argv.slice(2);
if (!OUT || ROWS.length < 3 || ROWS.length % 3) { console.error('usage: node sheet.mjs <out.jpg> <title> (<label> <before> <after>)+'); process.exit(2); }
const W = 1600, PAD = 16, HEAD = 56, CAP = 34, TH = 620;
const esc = (s) => s.replace(/&/g, 'and').replace(/[<>"']/g, '');
const label = (text, w, h, size = 22) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b1220"/><text x="${w / 2}" y="${h / 2 + size / 3}" font-family="DejaVu Sans, Arial" font-size="${size}" font-weight="700" fill="#e5edf7" text-anchor="middle">${esc(text)}</text></svg>`);
const tw = (W - 3 * PAD) / 2;
const comps = [{ input: label(TITLE, W, HEAD, 22), left: 0, top: 0 }];
let y = HEAD;
for (let i = 0; i < ROWS.length; i += 3) {
  const [lab, a, b] = ROWS.slice(i, i + 3);
  comps.push({ input: label(`TODAY - ${lab}`, tw, CAP, 20), left: PAD, top: y }, { input: label(`NEW - ${lab}`, tw, CAP, 20), left: PAD * 2 + tw, top: y });
  for (const [j, f] of [a, b].entries()) comps.push({ input: await sharp(f).resize(tw, TH, { fit: 'contain', background: '#0b1220' }).toBuffer(), left: PAD + j * (tw + PAD), top: y + CAP });
  y += CAP + TH + PAD;
}
await sharp({ create: { width: W, height: y, channels: 3, background: '#0b1220' } }).composite(comps).jpeg({ quality: 82 }).toFile(OUT);
console.log(`wrote ${OUT} (${W}x${y})`);
