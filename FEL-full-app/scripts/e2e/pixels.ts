// Pixels from a screenshot, through sharp (already a dependency, with its own types). Used by the studio flow (has the
// 3D view drawn?) and by the visual gate (how far is a screen from its baseline?).
import sharp from 'sharp';

export interface Raster { data: Buffer; width: number; height: number; channels: number }

/** Decode an image to raw RGB, optionally resized to width x height (fit: fill — every pixel of the source counts). */
export async function raster(img: Buffer, size?: { width: number; height: number }, blur = 0): Promise<Raster> {
  let p = sharp(img).removeAlpha();
  if (size) p = p.resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' });
  if (blur > 0) p = p.blur(blur);
  const { data, info } = await p.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** How many distinct colours (4 bits a channel) a sample of the image holds: 1 is a flat fill. */
export function colourCount(r: Raster, stride = 97): number {
  const seen = new Set<number>();
  for (let i = 0; i + 2 < r.data.length; i += r.channels * stride) seen.add((r.data[i] >> 4) << 8 | (r.data[i + 1] >> 4) << 4 | (r.data[i + 2] >> 4));
  return seen.size;
}
