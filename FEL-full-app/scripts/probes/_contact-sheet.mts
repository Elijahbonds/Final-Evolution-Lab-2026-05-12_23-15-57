// contact sheet: tile every PNG in DIR (sorted, or the MODES order) into one labelled image at 320x180 a cell
import sharp from 'sharp';
import fs from 'node:fs';
const DIR = process.env.DIR!; const OUTF = process.env.OUTF ?? `${DIR}/_sheet.png`;
const COLS = Number(process.env.COLS ?? 4), CW = 320, CH = 180;
const files = (process.env.MODES ? process.env.MODES.split(',').map((m) => `${m}.png`) : fs.readdirSync(DIR).filter((f) => f.endsWith('.png') && !f.startsWith('_')).sort()).filter((f) => fs.existsSync(`${DIR}/${f}`));
const rows = Math.ceil(files.length / COLS);
const comps = await Promise.all(files.map(async (f, i) => {
  const img = await sharp(`${DIR}/${f}`).resize(CW, CH).toBuffer();
  const label = Buffer.from(`<svg width="${CW}" height="22"><rect width="${CW}" height="22" fill="black" opacity="0.7"/><text x="6" y="16" font-size="15" font-family="monospace" fill="#fff">${f.replace('.png', '')}</text></svg>`);
  const cell = await sharp(img).composite([{ input: label, top: CH - 22, left: 0 }]).toBuffer();
  return { input: cell, left: (i % COLS) * CW, top: Math.floor(i / COLS) * CH };
}));
await sharp({ create: { width: COLS * CW, height: rows * CH, channels: 3, background: '#000' } }).composite(comps).png().toFile(OUTF);
console.log(OUTF, files.length);
