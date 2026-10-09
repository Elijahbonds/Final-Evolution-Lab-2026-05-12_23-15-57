// vehicle-lod — a lighter copy of a baked vehicle body for the racers seen from a distance (IMPROVE 2026-10-06,
// aeroaces #20: "Compress the vehicle GLBs … or a lighter rival LOD").
//
// The baked bodies (batch-vehicles.sh → bake-prop.py) are one mesh of ~20k vertices with three 2048² JPEG maps. The maps
// are ~2.5 MB of each ~3 MB file and, decoded with mips, ~64 MB of GPU memory per body. The field's body is seen from a
// chase camera tens of metres off, so its LOD keeps the mesh exactly and halves the maps to 1024² (JPEG, re-encoded by
// sharp through gltf-transform's textureCompress). Draco / meshopt would only touch the ~0.5 MB of geometry and need a
// decoder at runtime (the avatar pipeline deliberately ships none), so they are not used.
//
//   npx tsx scripts/meshy/vehicle-lod.mts public/models/vehicles/v-d5a0bbed.plane.glb public/models/vehicles/v-d5a0bbed-lod1.plane.glb [1024]
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const [src, out, sizeArg] = process.argv.slice(2);
if (!src || !out) { console.error('usage: vehicle-lod.mts <in.glb> <out.glb> [size=1024]'); process.exit(2); }
const size = Number(sizeArg ?? 1024);
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const doc = await io.read(src);
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [size, size], quality: 85 }));
await io.write(out, doc);
const kb = (f: string) => Math.round(statSync(f).size / 1024);
console.log(`[vehicle-lod] ${src} ${kb(src)} KB → ${out} ${kb(out)} KB (maps ≤ ${size}²)`);
