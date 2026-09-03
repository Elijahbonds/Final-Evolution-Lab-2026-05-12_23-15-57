/**
 * FEL BACKDROP PIPELINE — Meshy environment art → game-ready sky domes.
 *
 *   npx tsx scripts/backdrop/pipeline.mts
 *
 * Why this exists
 * ---------------
 * The venues' skies are hand-painted gradients (paintBackdrop in
 * NexusWebScene.ts). They read as *diagrams* of the Meshy environment art the
 * game is art-directed against (public/backdrops/*.jpg) — not as the art.
 * This pipeline is the environment twin of scripts/avatar/forge.mts: take the
 * source images, process them into textures that fit the sky-dome contract,
 * and ship them with a manifest the runtime can trust.
 *
 * The dome contract (must match NexusWebScene's nexus_sky):
 *  - 1024×512 equirect-ish wrap, BACKSIDE sphere diameter 400.
 *  - Horizon sits at v=0.6 (row ≈307) — sky stops span 0..0.6 there.
 *  - Below the horizon the dome is mostly behind the ground/arena, but the
 *    sliver that shows must fade to the venue's ground tone, not cut hard.
 *  - The wrap must not seam: the right edge is mirrored back onto itself.
 *
 * Each source image is re-projected so ITS horizon lands on v=0.6, graded
 * (gentle contrast + saturation so it survives emissive rendering), then
 * faded to the venue ground tone below the horizon line.
 *
 * Output: public/backdrops/baked/<kind>.jpg + manifest.json.
 * Runtime: NexusWebScene prefers the baked dome when the manifest lists the
 * venue's backdrop kind; the procedural painting stays as fallback.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';

const SRC_DIR = 'public/backdrops';
const OUT_DIR = 'public/backdrops/baked';
const W = 1024, H = 512;
const HORIZON_V = 0.6; // dome contract — see NexusWebScene BACKDROP_SKY_STOPS

interface BakeSpec {
  kind: string;
  src: string;
  /** Where the horizon sits in the SOURCE image, 0..1 from top. */
  srcHorizon: number;
  /** Venue ground/fog tone the sub-horizon fade lands on. */
  ground: [number, number, number];
  /** Extra warmth (golden-hour push), 0 = none. */
  warm?: number;
}

const BAKES: BakeSpec[] = [
  { kind: 'beach',     src: 'dunk.jpg',              srcHorizon: 0.52, ground: [62, 48, 44],  warm: 0.10 },
  { kind: 'ocean',     src: 'surf.jpg',              srcHorizon: 0.50, ground: [28, 52, 66],  warm: 0.06 },
  { kind: 'city',      src: 'venice-sky-sunset.jpg', srcHorizon: 0.55, ground: [40, 32, 40],  warm: 0.08 },
  { kind: 'stadium',   src: 'soccer.jpg',            srcHorizon: 0.50, ground: [24, 40, 26] },
  { kind: 'mountains', src: 'snowboard.jpg',         srcHorizon: 0.52, ground: [52, 58, 70] },
  { kind: 'dojo',      src: 'karate.jpg',            srcHorizon: 0.55, ground: [34, 26, 22] },
  { kind: 'neon',      src: 'skateboarding.jpg',     srcHorizon: 0.52, ground: [22, 18, 34] },
  { kind: 'links',     src: 'golf.jpg',              srcHorizon: 0.50, ground: [30, 48, 28] },
];

type RGBA = { data: Uint8Array; width: number; height: number };

/** Bilinear sample, clamped at edges. */
function sample(img: RGBA, u: number, v: number): [number, number, number] {
  const x = Math.min(img.width - 1.001, Math.max(0, u * img.width - 0.5));
  const y = Math.min(img.height - 1.001, Math.max(0, v * img.height - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number, c: number) => img.data[(yy * img.width + xx) * 4 + c];
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] =
      at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy) +
      at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy;
  }
  return out;
}

function bake(spec: BakeSpec, src: RGBA): RGBA {
  const out: RGBA = { data: new Uint8Array(W * H * 4), width: W, height: H };
  const horizonRow = HORIZON_V * H;
  const warm = spec.warm ?? 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // seamless 360 wrap: second half mirrors the first
      const u = x < W / 2 ? (x / (W / 2)) : 1 - (x - W / 2) / (W / 2);
      let r: number, g: number, b: number;
      if (y <= horizonRow) {
        // sky region: source rows 0..srcHorizon map to dome rows 0..horizonRow
        const sv = (y / horizonRow) * spec.srcHorizon;
        [r, g, b] = sample(src, u, sv);
      } else if (y <= horizonRow + H * 0.15) {
        // just below horizon: source's lowest sky rows fade into ground tone
        const f = (y - horizonRow) / (H * 0.15);
        const sv = spec.srcHorizon + (1 - spec.srcHorizon) * Math.min(1, f * 1.4);
        const [sr, sg, sb] = sample(src, u, sv);
        r = sr * (1 - f) + spec.ground[0] * f;
        g = sg * (1 - f) + spec.ground[1] * f;
        b = sb * (1 - f) + spec.ground[2] * f;
      } else {
        [r, g, b] = spec.ground;
      }
      // grade: gentle contrast + saturation so it survives emissive rendering
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = 1.12;
      r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
      const con = (c: number) => (c - 128) * 1.06 + 128;
      r = con(r) + 255 * warm * 0.10; g = con(g) + 255 * warm * 0.03; b = con(b) - 255 * warm * 0.06;
      const o = (y * W + x) * 4;
      out.data[o] = Math.max(0, Math.min(255, Math.round(r)));
      out.data[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      out.data[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      out.data[o + 3] = 255;
    }
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
const manifest: Record<string, { file: string; source: string }> = {};
for (const spec of BAKES) {
  const srcPath = join(SRC_DIR, spec.src);
  if (!existsSync(srcPath)) { console.error(`  ✗ ${spec.kind}: missing source ${srcPath}`); process.exitCode = 1; continue; }
  const decoded = jpeg.decode(readFileSync(srcPath), { maxMemoryUsageInMB: 512, formatAsRGBA: true });
  const baked = bake(spec, { data: decoded.data, width: decoded.width, height: decoded.height });
  const file = `${spec.kind}.jpg`;
  writeFileSync(join(OUT_DIR, file), jpeg.encode(baked, 88).data);
  manifest[spec.kind] = { file, source: spec.src };
  console.log(`  ✓ ${spec.kind.padEnd(9)} ← ${spec.src} (${decoded.width}×${decoded.height} → ${W}×${H})`);
}
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n✔ BACKDROP PIPELINE done — ${Object.keys(manifest).length}/${BAKES.length} domes baked to ${OUT_DIR}/`);
if (process.exitCode) process.exit(process.exitCode);
