// The install icons (app-feel, round 7, 2026-10-25): the PNGs the web app manifest and the iPhone home screen need.
//
//   npx tsx scripts/brand/make-app-icons.ts [source.svg]
//
// assumption: drawn from public/favicon.svg — the cyan "FEL" on a black hexagon — until the owner supplies logo art.
// Pass the new art's path to redraw all four; nothing else changes (the names are lib/pwa/manifest.ts APP_ICONS).
//
//   icon-192.png, icon-512.png   purpose "any": the mark as drawn, on transparency (Android's install sheet, Chrome)
//   icon-maskable-512.png        purpose "maskable": full-bleed --fel-bg, the mark inside the 80% safe circle, because
//                                Android crops a maskable icon to its own shape (circle, squircle, teardrop)
//   apple-touch-icon.png (180)   opaque --fel-bg: iOS fills transparency with black anyway and rounds the corners
//                                itself, so the mark sits with a margin on a square
//
// sharp is already a dependency (scripts/brand/prepare-brand.ts uses it); its librsvg draws the SVG.
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { THEME_COLOR } from '../../lib/pwa/manifest';

const ROOT = resolve(__dirname, '../..');
const SOURCE = resolve(process.argv[2] ?? join(ROOT, 'public/favicon.svg'));
const OUT = join(ROOT, 'public/icons');
mkdirSync(OUT, { recursive: true });
const svg = readFileSync(SOURCE);

/** The mark drawn `inner` px square, centred on a `size` px canvas filled with `bg` (or transparent). */
async function draw(file: string, size: number, inner: number, bg: string | null): Promise<void> {
  const mark = await sharp(svg, { density: 72 * Math.ceil(inner / 64) }).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const background = bg ?? { r: 0, g: 0, b: 0, alpha: 0 };
  const off = Math.round((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, left: off, top: off }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(OUT, file));
  const meta = await sharp(join(OUT, file)).metadata();
  console.log(`${file}: ${meta.width}x${meta.height}`);
}

async function main(): Promise<void> {
  await draw('icon-192.png', 192, 192, null);
  await draw('icon-512.png', 512, 512, null);
  // The safe zone is a circle of radius 0.4 × size (W3C maskable icons). The favicon's hexagon reaches 108/256 of its
  // box from the centre, so the mark at 0.75 × 512 = 384 px puts the hexagon's points 162 px out: inside the 204.8.
  await draw('icon-maskable-512.png', 512, 384, THEME_COLOR);
  await draw('apple-touch-icon.png', 180, 150, THEME_COLOR);
}

main().catch((e) => { console.error(e); process.exit(1); });
