// crop3: the same box of N pictures side by side, enlarged.  node crop3.mjs out x y w h scale a.jpg b.jpg c.jpg ...
import sharp from 'sharp';
const [out, x, y, w, h, s, ...fs] = process.argv.slice(2);
const box = { left: +x, top: +y, width: +w, height: +h }; const W = Math.round(+w * +s), H = Math.round(+h * +s);
const t = await Promise.all(fs.map((f) => sharp(f).extract(box).resize({ width: W, height: H }).jpeg().toBuffer()));
await sharp({ create: { width: (W + 8) * t.length - 8, height: H, channels: 3, background: '#141414' } }).composite(t.map((b, i) => ({ input: b, left: i * (W + 8), top: 0 }))).jpeg({ quality: 88 }).toFile(out);
console.log(out);
