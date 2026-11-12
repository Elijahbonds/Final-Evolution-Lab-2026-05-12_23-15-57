// KIT-NO-HIGH-BOOTS (owner, 2026-10-24: "cap the shoe maps"): the rivals' low-cut shoe textures, back to the 256² the rival
// shoes had before, so no rival's GPU texture memory grows. A texture pass only (the import-mpfb `--textures-only` pattern):
// nodes, skin, joints, weights, morphs, extras and every accessor are the same data; only the kit shoes' maps change.
//
// Each rival's low shoe carries three maps where its old shoe carried two: the evo and flight base colours at 512² (were
// two 256² maps) and a 256² normal map the two shoes share (new). Capping the base colours at 256² still leaves the
// normal map as an extra 256² texture, ~0.33 MB of GPU memory over the rival's base, so `--drop-normal` also takes the
// shoe normal map off (the shoe keeps its geometry, base colour and the sneaker roughness the runtime sets).
//
//   npx tsx scripts/avatar/cap-rival-shoe-maps.mts [--px 256] [--drop-normal] public/models/rivals/*.glb   (in place)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const pxAt = args.indexOf('--px'); const PX = pxAt >= 0 ? Number(args[pxAt + 1]) : 256;
const DROP_NORMAL = args.includes('--drop-normal');
const files = args.filter((a, i) => a.endsWith('.glb') && args[i - 1] !== '--px');
if (!files.length || !(PX > 0)) { console.error('usage: cap-rival-shoe-maps.mts [--px 256] [--drop-normal] <rival.glb...>'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const SHOE_MATERIAL = /^shoes\./;   // the kit's shoe materials (shoes.shoes_evo, shoes.shoes_flight); the sock is untextured

for (const file of files) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(file)));
  const root = doc.getRoot();
  const shoes = root.listMaterials().filter((m) => SHOE_MATERIAL.test(m.getName()));
  if (!shoes.length) { console.log(`${file}: no kit shoe material, skipped`); continue; }
  const notes: string[] = [];
  const done = new Set<unknown>();
  for (const m of shoes) {
    const t = m.getBaseColorTexture();
    if (t && !done.has(t)) {
      done.add(t);
      const img = t.getImage()!; const meta = await sharp(img).metadata();
      const size = Math.min(PX, meta.width ?? PX);   // never upscale
      if (size < (meta.width ?? 0)) {
        const out = await sharp(img).resize(size, size, { fit: 'fill' }).webp({ quality: 82 }).toBuffer();
        t.setImage(new Uint8Array(out)).setMimeType('image/webp');
        notes.push(`${m.getName()} base ${meta.width}²→${size}²`);
      }
    }
  }
  if (DROP_NORMAL) {
    for (const m of shoes) { const t = m.getNormalTexture(); if (t) { m.setNormalTexture(null); notes.push(`${m.getName()} normal off`); if (!t.listParents().some((p) => p !== root)) t.dispose(); } }
  }
  writeFileSync(file, await io.writeBinary(doc));
  console.log(`${file}: ${notes.join(', ') || 'unchanged'}`);
}
