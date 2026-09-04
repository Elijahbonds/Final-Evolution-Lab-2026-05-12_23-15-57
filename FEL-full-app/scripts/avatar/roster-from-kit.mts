/**
 * roster-from-kit — the eight athletes derived from the KIT bodies (ship pass 3),
 * so rivals and the hero come from the same anatomy, skins and garments.
 *
 *   npx tsx scripts/avatar/roster-from-kit.mts [--out public/models/athletes-kit]
 *
 * Per athlete: a sex (male or female kit body), a height scale on the armature,
 * a skin factor over the kit's skin map, one garment per slot (the others are
 * dropped so the file stays small), one hair style (extras.hairStyle on the
 * armature, the runtime shows Hair_<key>), and the kit colourway on the
 * <jersey|shorts|shoes>.<itemId> and hair.<key> materials. Same keys, same
 * notes as scripts/avatar/roster.mts, so the runtime roster needs no change
 * beyond the folder.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';

const oi = process.argv.indexOf('--out'); const OUT_DIR = oi > 0 ? process.argv[oi + 1] : 'public/models/athletes-kit';
const TEMPLATE = { male: 'public/models/candidates/fel-kit-male.glb', female: 'public/models/candidates/fel-kit-female.glb' };
type RGB = [number, number, number];
interface Athlete { key: string; sex: 'male' | 'female'; scale: number; skin: RGB; jersey: RGB; shorts: RGB; shoes: RGB; hair: RGB; hairStyle: string; kit: { tops: string; shorts: string; shoes: string }; note: string }
// Eight bodies: skin tones span the Closet's range, every hair style ships on someone, kits never repeat.
// (no hijab asset in the packs yet — sage wears the cap until one exists)
const ATHLETES: Athlete[] = [
  { key: 'atlas', sex: 'male',   scale: 1.07, skin: [0.45, 0.30, 0.20], jersey: [0.10, 0.55, 0.60], shorts: [0.06, 0.20, 0.24], shoes: [0.90, 0.90, 0.88], hair: [0.05, 0.04, 0.03], hairStyle: 'buzz',     kit: { tops: 'top_bonds', shorts: 'shorts_court',  shoes: 'shoes_evo' },    note: 'tall, teal kit' },
  { key: 'blitz', sex: 'male',   scale: 0.94, skin: [0.85, 0.60, 0.42], jersey: [0.85, 0.20, 0.16], shorts: [0.10, 0.10, 0.12], shoes: [0.75, 0.16, 0.14], hair: [0.35, 0.20, 0.08], hairStyle: 'cap',      kit: { tops: 'top_lab',   shorts: 'shorts_glitch', shoes: 'shoes_flight' }, note: 'compact, red kit' },
  { key: 'nova',  sex: 'female', scale: 1.00, skin: [0.62, 0.42, 0.28], jersey: [0.45, 0.30, 0.80], shorts: [0.16, 0.10, 0.30], shoes: [0.92, 0.85, 0.60], hair: [0.02, 0.02, 0.03], hairStyle: 'braids',   kit: { tops: 'top_bonds', shorts: 'shorts_court',  shoes: 'shoes_flight' }, note: 'violet kit' },
  { key: 'titan', sex: 'male',   scale: 1.12, skin: [0.72, 0.50, 0.34], jersey: [0.90, 0.60, 0.15], shorts: [0.30, 0.18, 0.06], shoes: [0.20, 0.20, 0.22], hair: [0.16, 0.10, 0.06], hairStyle: 'afro',     kit: { tops: 'top_lab',   shorts: 'shorts_glitch', shoes: 'shoes_evo' },    note: 'big, amber kit' },
  { key: 'ember', sex: 'female', scale: 0.97, skin: [0.36, 0.22, 0.14], jersey: [0.95, 0.45, 0.10], shorts: [0.12, 0.08, 0.06], shoes: [0.95, 0.95, 0.92], hair: [0.03, 0.02, 0.02], hairStyle: 'ponytail', kit: { tops: 'top_lab',   shorts: 'shorts_court',  shoes: 'shoes_evo' },    note: 'deep skin, orange kit' },
  { key: 'frost', sex: 'female', scale: 1.03, skin: [0.93, 0.80, 0.70], jersey: [0.20, 0.35, 0.85], shorts: [0.95, 0.95, 0.95], shoes: [0.15, 0.15, 0.18], hair: [0.80, 0.68, 0.40], hairStyle: 'bun',      kit: { tops: 'top_bonds', shorts: 'shorts_glitch', shoes: 'shoes_flight' }, note: 'pale skin, royal blue kit' },
  { key: 'sage',  sex: 'female', scale: 1.00, skin: [0.55, 0.36, 0.24], jersey: [0.15, 0.60, 0.30], shorts: [0.06, 0.18, 0.10], shoes: [0.85, 0.85, 0.80], hair: [0.08, 0.05, 0.03], hairStyle: 'cap',      kit: { tops: 'top_lab',   shorts: 'shorts_court',  shoes: 'shoes_flight' }, note: 'green kit (hijab pending an asset)' },
  { key: 'vex',   sex: 'male',   scale: 1.09, skin: [0.78, 0.56, 0.40], jersey: [0.08, 0.08, 0.10], shorts: [0.85, 0.15, 0.55], shoes: [0.85, 0.15, 0.55], hair: [0.55, 0.05, 0.10], hairStyle: 'cap',      kit: { tops: 'top_bonds', shorts: 'shorts_glitch', shoes: 'shoes_evo' },    note: 'black and magenta kit' },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
mkdirSync(OUT_DIR, { recursive: true });
for (const a of ATHLETES) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(TEMPLATE[a.sex])));
  const root = doc.getRoot();
  const skin = root.listSkins()[0]; const hips = skin.listJoints()[0]; const armature = hips.getParentNode() ?? root.listNodes()[0];
  armature.setScale([a.scale, a.scale, a.scale]);
  armature.setExtras({ ...(armature.getExtras() ?? {}), hairStyle: a.hairStyle, athlete: a.key });
  const keep = new Set([`Kit_tops_${a.kit.tops}`, `Kit_shorts_${a.kit.shorts}`, `Kit_shoes_${a.kit.shoes}`, `Hair_${a.hairStyle}`]);
  // detach only: the two shorts nodes share one mesh after dedup, so disposing a dropped
  // node's mesh would take the kept garment with it — prune() removes true orphans
  for (const n of root.listNodes()) { const nm = n.getName(); if (/^(Kit|Hair)_/.test(nm) && !keep.has(nm)) { n.setMesh(null); n.dispose(); } }
  for (const mat of root.listMaterials()) {
    const name = mat.getName();
    const rgb = name === 'skin' ? a.skin : name.startsWith('jersey') ? a.jersey : name.startsWith('shorts') ? a.shorts : name.startsWith('shoes') ? a.shoes : name.startsWith('hair') ? a.hair : null;
    if (rgb) mat.setBaseColorFactor([rgb[0], rgb[1], rgb[2], 1]);
  }
  // rivals never wear the player's face: drop the seven morph targets (~1.2 MB of deltas per body)
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) for (const t of prim.listTargets()) { prim.removeTarget(t); t.dispose(); }
  for (const mesh of root.listMeshes()) mesh.setWeights([]);
  // KHR_mesh_quantization: 14-bit positions, 8-bit normals and weights, 12-bit UVs — Babylon reads it natively; roughly halves the geometry
  await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 8 }));
  // rivals stand further from the camera than the hero: skin at 1024, everything else at 512
  for (const t of root.listTextures()) { const img = t.getImage(); if (!img) continue; const size = (t.getName() || '').includes('diffuse') || root.listMaterials().some((m) => m.getName() === 'skin' && m.getBaseColorTexture() === t) ? 1024 : 512; const out = await sharp(img).resize(size, size, { fit: 'fill' }).webp({ quality: 78 }).toBuffer(); t.setImage(new Uint8Array(out)).setMimeType('image/webp'); }
  const glb = await io.writeBinary(doc); writeFileSync(join(OUT_DIR, `${a.key}.glb`), glb);
  writeFileSync(join(OUT_DIR, `${a.key}.json`), JSON.stringify({ fps: 30, clips: [], builtAtSpawn: true, athlete: a.key, sex: a.sex, note: a.note, source: TEMPLATE[a.sex] }, null, 2) + '\n');
  console.log(`  ✔ ${a.key.padEnd(6)} ${a.sex.padEnd(6)} ×${a.scale}  ${(glb.byteLength / 1024).toFixed(0)} KB  hair ${a.hairStyle}  — ${a.note}`);
}
console.log(`✔ ${ATHLETES.length} athletes from the kit bodies → ${OUT_DIR}/`);
