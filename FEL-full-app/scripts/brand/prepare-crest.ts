/**
 * prepare-crest — turn a black-on-white logo into a white-on-transparent mark for a dark interface.
 *
 * The supplied crest is an opaque JPG, so dropping it on a #050505 page paints a white rectangle with the
 * artwork buried inside it. Its luminance is the artwork, though: invert that and it becomes an alpha channel,
 * leaving the mark drawn in white over nothing. Run it again after replacing the source; it never edits in place.
 *
 *   npx tsx scripts/brand/prepare-crest.ts
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'public', 'brand', 'crest-source.jpg');
const OUT = join(process.cwd(), 'public', 'brand', 'crest-light.png');

async function main() {
  // trim() drops the paper margin so the mark can be positioned by its own bounds rather than by the scan's.
  const img = sharp(SRC).trim({ threshold: 12 });
  const { data, info } = await img.clone().greyscale().raw().toBuffer({ resolveWithObject: true });

  const alpha = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = 255 - data[i * info.channels]; // ink becomes opacity

  const mark = await sharp({ create: { width: info.width, height: info.height, channels: 3, background: '#ffffff' } })
    .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();

  const out = await sharp(mark).resize({ width: 640, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(OUT, out);
  const meta = await sharp(out).metadata();
  console.log(`crest-light.png ${meta.width}x${meta.height} ${(out.length / 1024).toFixed(1)}kB alpha=${meta.hasAlpha}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
