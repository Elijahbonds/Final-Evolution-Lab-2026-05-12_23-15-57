// Contact sheet: node sheet.cjs spec.json out.jpg — spec: {title, cols, w, items:[{label, path}]}
const sharp = require(require("path").resolve(__dirname, "../../../node_modules/sharp"));
const fs = require('fs');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
(async () => {
  const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const cols = spec.cols || 4, W = spec.w || 300, labelH = 44, pad = 16, titleH = 70;
  const items = spec.items.filter((i) => fs.existsSync(i.path));
  const thumbs = await Promise.all(items.map(async (i) => {
    const trimmed = await sharp(i.path).trim({ threshold: 18 }).toBuffer().catch(() => fs.readFileSync(i.path));
    const buf = await sharp(trimmed).resize({ width: W, height: Math.round(W * 1.8), fit: 'inside' }).png().toBuffer();
    const m = await sharp(buf).metadata();
    return { buf, h: m.height, w: m.width, label: i.label };
  }));
  const rows = Math.ceil(thumbs.length / cols);
  const rowH = []; for (let r = 0; r < rows; r++) rowH.push(Math.max(...thumbs.slice(r * cols, r * cols + cols).map((t) => t.h)) + labelH);
  const width = pad + cols * (W + pad), height = titleH + rowH.reduce((a, b) => a + b + pad, 0) + pad;
  const comps = []; let y = titleH;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = thumbs[r * cols + c]; if (!t) continue;
      const x = pad + c * (W + pad);
      comps.push({ input: t.buf, left: x + Math.round((W - t.w) / 2), top: y });
      comps.push({ input: Buffer.from(`<svg width="${W}" height="${labelH}"><text x="${W / 2}" y="28" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="600" fill="#e8eef3" text-anchor="middle">${esc(t.label)}</text></svg>`), left: x, top: y + rowH[r] - labelH });
    }
    y += rowH[r] + pad;
  }
  comps.push({ input: Buffer.from(`<svg width="${width}" height="${titleH}"><text x="${pad}" y="46" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">${esc(spec.title)}</text></svg>`), left: 0, top: 0 });
  await sharp({ create: { width, height, channels: 3, background: '#0b1117' } }).composite(comps).jpeg({ quality: 82 }).toFile(process.argv[3]);
  console.log(process.argv[3], width, height, thumbs.length);
})();
