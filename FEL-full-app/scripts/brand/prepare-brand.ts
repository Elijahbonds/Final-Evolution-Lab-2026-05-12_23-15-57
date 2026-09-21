/**
 * prepare-brand — the owner's supplied artwork, prepared for the app.
 *
 * TWO JOBS, because the source material has two problems.
 *
 * MARKS. The logos arrive as opaque JPGs: black line art on white paper. Dropping one on a #050505 page paints a
 * white rectangle with the artwork buried inside it. The luminance IS the artwork, though — invert it and it
 * becomes an alpha channel, leaving the mark drawn in white over nothing. Never edits in place; re-run it after
 * replacing a source.
 *
 * PHOTOS. The dunk photographs are 4000x6000 and 15 MB each. public/ is copied WHOLESALE into the deployed
 * function bundle (that is how the Prisma client ships — see docs/DEPLOY-NOTES-PRISMA.md), so shipping them as
 * supplied would add ~45 MB to every single deploy, forever, to show a photograph a few hundred pixels wide. The
 * originals stay outside the repo; what ships is a web-sized copy.
 *
 *   npx tsx scripts/brand/prepare-brand.ts
 */
import sharp from 'sharp';
import { writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BRAND = join(process.cwd(), 'public', 'brand');

/** Black-on-white artwork → white-on-transparent, at `width`. */
const MARKS: { src: string; out: string; width: number }[] = [
  { src: 'crest-source.jpg', out: 'crest-light.png', width: 640 },
  { src: 'wordmark-source.jpg', out: 'wordmark-light.png', width: 720 },
];

/**
 * The round badge is a DISC on a square of white. It arrives with an alpha channel that is entirely opaque, so on
 * a #050505 page it paints a white square with the badge sitting in the middle of it (seen, not assumed —
 * composited against the page colour and looked at). Luminance-to-alpha is wrong here: the badge is not line art,
 * it is a white disc with black text and a photograph in it, and inverting it would erase the disc. What it needs
 * is the corners taken off, so the mask is the inscribed circle.
 */
async function disc(src: string, out: string): Promise<void> {
  const from = join(BRAND, src);
  if (!existsSync(from)) { console.log(`  ${src} — not here, skipped`); return; }
  const { width = 0, height = 0 } = await sharp(from).metadata();
  const d = Math.min(width, height);
  // A hair inside the edge: the supplied art has a faint ring of off-white right at the bounds.
  const r = d / 2 - 1;
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="#fff"/></svg>`);
  const buf = await sharp(from).ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(BRAND, out), buf);
  const meta = await sharp(buf).metadata();
  console.log(`  ${out} ${meta.width}x${meta.height} ${(buf.length / 1024).toFixed(1)}kB — corners removed`);
}

/** Photographs → a long edge no bigger than this, because public/ ships in the function bundle. */
const PHOTO_MAX = 1400;
const PHOTOS = ['bonds-dunk-arena.jpg', 'bonds-dunk-arena-alt.jpg', 'bonds-dunk-gym.jpg'];

async function mark(src: string, out: string, width: number): Promise<void> {
  const from = join(BRAND, src);
  if (!existsSync(from)) { console.log(`  ${src} — not here, skipped`); return; }
  // trim() drops the paper margin so the mark can be positioned by its own bounds rather than by the scan's.
  const img = sharp(from).trim({ threshold: 12 });
  const { data, info } = await img.clone().greyscale().raw().toBuffer({ resolveWithObject: true });

  const alpha = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = 255 - data[i * info.channels]; // ink becomes opacity

  const white = await sharp({ create: { width: info.width, height: info.height, channels: 3, background: '#ffffff' } })
    .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();

  const buf = await sharp(white).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(BRAND, out), buf);
  const meta = await sharp(buf).metadata();
  console.log(`  ${out} ${meta.width}x${meta.height} ${(buf.length / 1024).toFixed(1)}kB alpha=${meta.hasAlpha}`);
}

async function photo(name: string): Promise<void> {
  const at = join(BRAND, name);
  if (!existsSync(at)) { console.log(`  ${name} — not here, skipped`); return; }
  const before = statSync(at).size;
  const meta0 = await sharp(at).metadata();
  // ALREADY PREPARED → LEAVE IT ALONE. This resizes in place, so a second run would re-encode an already-lossy
  // JPEG and quietly shave quality off every time the script is run (measured: 209 kB → 205 kB on the second
  // pass, for no gain). An idempotent tool is one you can run without thinking about whether you already did.
  if (meta0.format === 'jpeg' && Math.max(meta0.width ?? 0, meta0.height ?? 0) <= PHOTO_MAX) {
    console.log(`  ${name} ${meta0.width}x${meta0.height} ${(before / 1024).toFixed(0)}kB — already prepared`);
    return;
  }
  const buf = await sharp(at).rotate()   // honour EXIF orientation before resizing, or a portrait ships sideways
    .resize({ width: PHOTO_MAX, height: PHOTO_MAX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  writeFileSync(at, buf);
  const meta = await sharp(buf).metadata();
  console.log(`  ${name} ${meta.width}x${meta.height} ${(before / 1024 / 1024).toFixed(1)}MB → ${(buf.length / 1024).toFixed(0)}kB`);
}

async function main() {
  console.log('marks:');
  for (const m of MARKS) await mark(m.src, m.out, m.width);
  console.log('badge:');
  await disc('badge-source.png', 'badge-est2020.png');
  console.log('photos:');
  for (const p of PHOTOS) await photo(p);
}

main().catch((e) => { console.error(e); process.exit(1); });
