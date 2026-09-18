// Ship Pass 2, Phase 3 — how much do the baked venue maps shrink under the
// lossless-ish gltf-transform passes (dedup, prune, weld, quantize)? Writes the
// result to OUT (scratchpad), never over public/. usage: OUT=<dir> npx tsx scripts/maps/_optimize-probe.mts <glb...>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize } from '@gltf-transform/functions';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const OUT = process.env.OUT ?? '/tmp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);   // quantize adds KHR_mesh_quantization; it must be declared
for (const f of process.argv.slice(2)) {
  const before = statSync(f).size;
  const doc = await io.readBinary(new Uint8Array(readFileSync(f)));
  await doc.transform(dedup(), prune(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  const bin = await io.writeBinary(doc);
  const out = join(OUT, basename(f)); writeFileSync(out, bin);
  console.log(`${basename(f).padEnd(26)} ${(before / 1048576).toFixed(2)} MB → ${(bin.byteLength / 1048576).toFixed(2)} MB  (${Math.round(100 - bin.byteLength / before * 100)}% smaller)`);
}
