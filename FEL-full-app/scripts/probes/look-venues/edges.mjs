// LOOK-VENUES B1 (2026-11-24): an edge-stair count on a lossless picture, so "smoother edges" is a number beside the eye's verdict.
//   node scripts/probes/look-venues/edges.mjs <x0,y0,x1,y1 as fractions of the picture> <file.png> [file.png ...]
// For every pair of neighbouring pixels (across and down) in the crop, the luminance step |dL| (0-255):
//   hard   pairs with a step of 64 or more per 10,000 pixels: a stair-stepped edge is all hard steps, an anti-aliased one spreads the
//          same contrast over two or three pixels in partial steps, so AA lowers this;
//   energy the sum of steps of 8 or more per pixel: the picture's detail. A blur lowers it too, so the verdict is the RATIO:
//   share  hard steps' share of the energy (hard x 64 / energy, %). AA that smooths edges cuts `hard` far more than `energy`;
//          a pass that only blurs cuts both alike.
// The same crop on every run and variant; the HUD (DOM) is the same on both sides of an A/B, so it adds the same to each.
import sharp from 'sharp';

const [cropS, ...files] = process.argv.slice(2);
if (!cropS || !files.length) { console.error('usage: edges.mjs x0,y0,x1,y1 file.png ...'); process.exit(2); }
const [fx0, fy0, fx1, fy1] = cropS.split(',').map(Number);
for (const f of files) {
  const img = sharp(f);
  const { width, height } = await img.metadata();
  const left = Math.round(fx0 * width), top = Math.round(fy0 * height);
  const w = Math.round((fx1 - fx0) * width), h = Math.round((fy1 - fy0) * height);
  const { data, info } = await img.extract({ left, top, width: w, height: h }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = 0.2126 * data[i * ch] + 0.7152 * data[i * ch + 1] + 0.0722 * data[i * ch + 2];
  let hard = 0, energy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = L[y * w + x];
      if (x + 1 < w) { const d = Math.abs(L[y * w + x + 1] - v); if (d >= 64) hard++; if (d >= 8) energy += d; }
      if (y + 1 < h) { const d = Math.abs(L[(y + 1) * w + x] - v); if (d >= 64) hard++; if (d >= 8) energy += d; }
    }
  }
  const px = w * h;
  const out = { file: f.split('/').pop(), crop: `${left},${top} ${w}x${h}`, hardPer10k: +(hard / px * 1e4).toFixed(1), energyPerPx: +(energy / px).toFixed(2), hardSharePct: +(hard * 64 / Math.max(1, energy) * 100).toFixed(2) };
  console.log(JSON.stringify(out));
}
