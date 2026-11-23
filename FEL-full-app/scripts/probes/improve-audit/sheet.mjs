// IMPROVE-AUDIT: a contact sheet of JPGs with a caption under each.  node sheet.mjs <out.jpg> <cols> <w> <file[=caption]>...
import sharp from 'sharp';
const [out, colsS, wS, ...items] = process.argv.slice(2);
const cols = Number(colsS), W = Number(wS);
const tiles = [];
for (const it of items) {
  const [file, cap = file.split('/').pop()] = it.split('=');
  const img = sharp(file).resize({ width: W });
  const buf = await img.jpeg().toBuffer(); const meta = await sharp(buf).metadata();
  const esc = cap.replace(/&/g, 'and').replace(/</g, '').replace(/>/g, '');
  const per = Math.floor(W / 7.6); let cut = esc.length <= per ? esc.length : esc.lastIndexOf(' ', per); if (cut <= 0) cut = per;
  const l1 = esc.slice(0, cut), l2 = esc.slice(cut).trim().slice(0, per);
  const capSvg = Buffer.from(`<svg width="${W}" height="44"><rect width="100%" height="100%" fill="#111"/><text x="6" y="18" font-size="14" font-family="sans-serif" fill="#fff">${l1}</text><text x="6" y="37" font-size="13" font-family="sans-serif" fill="#fc6">${l2}</text></svg>`);
  tiles.push({ buf, h: meta.height, capSvg });
}
const H = Math.max(...tiles.map((t) => t.h)) + 44, rows = Math.ceil(tiles.length / cols);
const comp = [];
tiles.forEach((t, i) => { const x = (i % cols) * W, y = Math.floor(i / cols) * H; comp.push({ input: t.buf, left: x, top: y }, { input: t.capSvg, left: x, top: y + H - 44 }); });
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#222' } }).composite(comp).jpeg({ quality: 72 }).toFile(out);
console.log(out);
