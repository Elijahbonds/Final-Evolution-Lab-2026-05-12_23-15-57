// DEPTH-AUDIT (2026-11-25): the same crop of two pictures side by side, enlarged — for judging shading, shadows and edges at
// gameplay distance (a before/after, or the phone tier against the high tier).
//   node scripts/probes/depth-audit/crop-pair.mjs <out.jpg> <x> <y> <w> <h> <scale> <a.jpg> <b.jpg>
import sharp from 'sharp';
const [out, x, y, w, h, s, a, b] = process.argv.slice(2);
if (!b) { console.error('usage: crop-pair.mjs <out.jpg> <x> <y> <w> <h> <scale> <a.jpg> <b.jpg>'); process.exit(2); }
const box = { left: Number(x), top: Number(y), width: Number(w), height: Number(h) };
const W = Math.round(box.width * Number(s)), H = Math.round(box.height * Number(s));
const tile = (f) => sharp(f).extract(box).resize({ width: W, height: H }).jpeg().toBuffer();
const [ta, tb] = await Promise.all([tile(a), tile(b)]);
await sharp({ create: { width: W * 2 + 8, height: H, channels: 3, background: '#141414' } })
  .composite([{ input: ta, left: 0, top: 0 }, { input: tb, left: W + 8, top: 0 }]).jpeg({ quality: 85 }).toFile(out);
console.log(out);
