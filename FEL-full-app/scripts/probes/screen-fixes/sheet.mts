// SCREEN-FIXES: join JPG shots side by side (rows separated by `--`) into one contact sheet, scaled to `--scale` (default 0.66).
//   npx tsx scripts/probes/screen-fixes/sheet.mts <out.jpg> [--scale=0.5] a.jpg b.jpg -- c.jpg d.jpg
import sharp from 'sharp';
const args = process.argv.slice(2);
const out = args.shift()!;
const scale = Number(args.find((a) => a.startsWith('--scale='))?.slice(8) ?? 0.66);
const files = args.filter((a) => !a.startsWith('--scale='));
const rows: string[][] = [[]];
for (const f of files) { if (f === '--') rows.push([]); else rows[rows.length - 1].push(f); }
const GAP = 12;
const meta = await Promise.all(rows.map((r) => Promise.all(r.map(async (f) => ({ f, ...(await sharp(f).metadata()) })))));
const W = Math.max(...meta.map((r) => r.reduce((a, m) => a + (m.width ?? 0) + GAP, 0)));
const rowH = meta.map((r) => Math.max(...r.map((m) => m.height ?? 0)));
const H = rowH.reduce((a, h) => a + h + GAP, 0);
const comp: sharp.OverlayOptions[] = [];
let y = 0;
meta.forEach((r, i) => { let x = 0; for (const m of r) { comp.push({ input: m.f, left: x, top: y }); x += (m.width ?? 0) + GAP; } y += rowH[i] + GAP; });
const big = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(comp).jpeg().toBuffer();
await sharp(big).resize(Math.round(W * scale)).jpeg({ quality: 78 }).toFile(out);
console.log('[sheet]', out, Math.round(W * scale), 'x', Math.round(H * scale));
