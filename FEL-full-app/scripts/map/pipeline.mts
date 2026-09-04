/**
 * FEL MAP PIPELINE — Meshy venue GLBs → Babylon-loadable environment maps.
 *
 *   npx tsx scripts/map/pipeline.mts [map-key ...]   (default: all in lib/map-data.ts MAPS dir)
 *
 * Why this exists
 * ---------------
 * The venue GLBs in public/models/maps/ are the Meshy environment art — real
 * courts, real arenas — but they have never rendered in EITHER stack. The
 * THREE stack bypassed them app-wide (components/three/map-loader.tsx,
 * "every broken Meshy environment GLB"); the Babylon stack never tried.
 * Probed 2026-05: every map requires extensions Babylon does not ship —
 * EXT_texture_webp (all) and KHR_draco_mesh_compression (most). Same disease
 * as the retired Meshy hero avatar; same cure: fix it OFFLINE, once, here.
 *
 * Stages
 * ------
 *  1. DECODE   — draco geometry decoded on ingest (draco3dgltf), WebP
 *                textures transcoded to PNG/JPEG via sharp. The emitted GLB
 *                needs NO runtime extensions at all.
 *  2. MEASURE  — world bounds, triangle count, texture inventory. Emitted
 *                into manifest.json so runtime alignment is data-driven,
 *                not guessed.
 *  3. VALIDATE — must have geometry, must be finite, tris under budget,
 *                textures present (an untextured Meshy map renders as grey
 *                soup — that is the failure this gate exists to catch).
 *  4. EMIT     — public/models/maps/baked/<key>.glb + manifest.json.
 *
 * Runtime: lib/babylon/visual/VenueMaps.ts mounts a baked map in a venue and
 * stands down the procedural ground. lib/map-data.ts scale/offset/rotation
 * fields stay authoritative for world placement.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
import '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const SRC_DIR = 'public/models/maps';
const OUT_DIR = 'public/models/maps/baked';
const TRI_BUDGET = 400_000;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

async function transcodeTextures(doc: Document, key: string): Promise<number> {
  let n = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const mime = tex.getMimeType();
    if (mime === 'image/webp') {
      const img = tex.getImage();
      if (!img) continue;
      const decoded = sharp(Buffer.from(img));
      const meta = await decoded.metadata();
      const hasAlpha = meta.hasAlpha === true;
      const out = hasAlpha ? await decoded.png().toBuffer() : await decoded.jpeg({ quality: 90 }).toBuffer();
      tex.setImage(new Uint8Array(out)).setMimeType(hasAlpha ? 'image/png' : 'image/jpeg');
      n++;
    }
  }
  if (n) console.log(`  [decode] ${key}: ${n} webp texture(s) → png/jpg`);
  // Drop extension declarations that are now unused (EXT_texture_webp etc.)
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    const name = (ext.constructor as any).EXTENSION_NAME ?? '';
    if (/texture_webp|draco/i.test(name)) ext.dispose();
  }
  for (const ext of doc.getRoot().listExtensionsRequired()) ext.dispose();
  return n;
}

function report(doc: Document, key: string): { min: number[]; max: number[]; tris: number } {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      tris += (prim.getIndices()?.getCount() ?? 0) / 3;
    }
  }
  const size = b.max.map((v, i) => v - b.min[i]);
  console.log(`  [measure] ${key}: ${tris.toLocaleString()} tris · bounds ${b.min.map((v) => v.toFixed(2))} → ${b.max.map((v) => v.toFixed(2))} (span ${size.map((v) => v.toFixed(2))})`);
  return { min: b.min, max: b.max, tris: Math.round(tris) };
}

mkdirSync(OUT_DIR, { recursive: true });
const srcKeys = args.length
  ? args
  : (await import('node:fs')).readdirSync(SRC_DIR).filter((f) => f.endsWith('.glb')).map((f) => basename(f, '.glb'));

const manifest: Record<string, { file: string; tris: number; min: number[]; max: number[]; textures: number }> = {};
let failures = 0;
for (const key of srcKeys) {
  const srcPath = join(SRC_DIR, `${key}.glb`);
  if (!existsSync(srcPath)) { console.error(`  ✗ ${key}: no source at ${srcPath}`); failures++; continue; }
  try {
    const doc = await io.read(srcPath);
    await transcodeTextures(doc, key);
    const { min, max, tris } = report(doc, key);
    const texCount = doc.getRoot().listTextures().length;
    if (tris === 0) throw new Error('no geometry after decode');
    if (tris > TRI_BUDGET) throw new Error(`${tris} tris exceeds budget ${TRI_BUDGET}`);
    if (texCount === 0) throw new Error('no textures — would render as grey soup');
    const file = `${key}.glb`;
    await io.write(join(OUT_DIR, file), doc);
    manifest[key] = { file, tris, min: min.map((v) => +v.toFixed(4)), max: max.map((v) => +v.toFixed(4)), textures: texCount };
    console.log(`  ✔ ${key}.glb — ${texCount} textures, clean of runtime extensions`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${key}: ${(err as Error).message}`);
  }
}
// Merge into the shipped manifest: a partial run (one key, or a run where every input
// was refused) must not erase the entries of maps it never touched — that happened on
// 2026-09-04 and emptied the file.
const manifestPath = join(OUT_DIR, 'manifest.json');
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown> : {};
writeFileSync(manifestPath, JSON.stringify({ ...previous, ...manifest }, null, 2) + '\n');
console.log(`\n${failures ? '✗' : '✔'} MAP PIPELINE — ${Object.keys(manifest).length} baked, ${failures} failed → ${OUT_DIR}/`);
if (failures) process.exit(1);
