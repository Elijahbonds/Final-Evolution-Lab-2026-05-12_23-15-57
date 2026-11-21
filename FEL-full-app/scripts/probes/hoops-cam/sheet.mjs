// hoops-cam: the owner's before/after picture. One moment of the scripted 1v1 possession, today's follow camera on the left and the
// high sideline view on the right: a desktop row, then a phone row (upright and on its side).
//   node sheet.mjs <dir> <out.jpg> <at>      reads <dir>/{base,new}-{d,pp,pl}1-at<at>.jpg (possession.mjs SHOT_AT; SUF= another run)
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const sharp = require('sharp');
const [DIR, OUT, AT] = process.argv.slice(2);
const SUF = process.env.SUF ?? '1';   // the run's number in its tag (base-d1, new-pp1 …)
const f = (tag) => path.join(DIR, `${tag}${SUF}-at${AT}.jpg`);
const W = 1920, PAD = 16, HEAD = 56, CAP = 34;
const esc = (s) => s.replace(/&/g, 'and');
const label = (text, w, h, size = 26, weight = 700) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b1220"/><text x="${w / 2}" y="${h / 2 + size / 3}" font-family="DejaVu Sans, Arial" font-size="${size}" font-weight="${weight}" fill="#e5edf7" text-anchor="middle">${esc(text)}</text></svg>`);
const tile = async (file, w, h) => sharp(file).resize(w, h, { fit: 'contain', background: '#0b1220' }).toBuffer();
const dw = (W - 3 * PAD) / 2, dh = Math.round(dw * 9 / 16);
const ph = 560, ppw = Math.round(ph * 390 / 844), plw = Math.round(ph * 844 / 390 * 0.5);   // upright full height; on its side half height
const plh = Math.round(plw * 390 / 844);
const rowH = Math.max(ph, plh * 2 + PAD);
const H = HEAD + CAP + dh + PAD + CAP + rowH + PAD * 2;
const comps = [];
comps.push({ input: label(`1v1 camera, the same moment of the same possession (${AT} s in): today's follow camera (left) and the new high sideline view (right)`, W, HEAD, 24), left: 0, top: 0 });
comps.push({ input: label('FOLLOW (today) - desktop', dw, CAP, 22), left: PAD, top: HEAD });
comps.push({ input: label('HIGH SIDELINE (new, default) - desktop', dw, CAP, 22), left: PAD * 2 + dw, top: HEAD });
comps.push({ input: await tile(f('base-d'), dw, dh), left: PAD, top: HEAD + CAP });
comps.push({ input: await tile(f('new-d'), dw, dh), left: PAD * 2 + dw, top: HEAD + CAP });
const y2 = HEAD + CAP + dh + PAD;
for (const [i, side] of [['base', 'FOLLOW (today) - phone'], ['new', 'HIGH SIDELINE (new) - phone']].entries()) {
  const x0 = PAD + i * (dw + PAD);
  comps.push({ input: label(side[1], dw, CAP, 22), left: x0, top: y2 });
  comps.push({ input: await tile(f(`${side[0]}-pp`), ppw, ph), left: x0, top: y2 + CAP });
  comps.push({ input: await tile(f(`${side[0]}-pl`), plw, plh), left: x0 + ppw + PAD, top: y2 + CAP + Math.round((ph - plh) / 2) });
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#0b1220' } }).composite(comps).jpeg({ quality: 82 }).toFile(OUT);
console.log(`wrote ${OUT} (${W}x${H})`);
