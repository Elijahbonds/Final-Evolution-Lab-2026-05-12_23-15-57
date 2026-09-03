/**
 * avatar-pipeline-tests — offline structural gate for every shipped avatar GLB.
 *
 *   npx tsx scripts/avatar-pipeline-tests.ts
 *
 * Guards the defects that cost days of T-pose debugging (all were silent at
 * load time, all are detectable offline — that is why pipeline.mts exists):
 *   1. required bone names from docs/avatar/AvatarSkeletonSpec.md (the ABI)
 *   2. JOINTS_0 / WEIGHTS_0 are float32 (byte skins never rendered in-app)
 *   3. KHR_draco_mesh_compression is NOT required (the runtime loader path
 *      has no draco decoder configured for these assets)
 *   4. animation translation tracks are meter-scale (cm tracks are ~99× and
 *      exploded vertices in bare Babylon)
 *   5. weights are normalized per vertex
 *   6. every GLB has a sibling manifest whose clip names match the GLB's
 *
 * Runs on: public/models/fel-hero.glb + public/models/athletes/*.glb.
 * No browser, no server — pure gltf-transform reads.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

const REQUIRED_BONES = [
  'Hips',
  'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];
const CM_RATIO_MIN = 50;
const CM_RATIO_MAX = 200;

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string) {
  checks++;
  if (ok) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}`); }
}

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

async function main() {
const targets = ['public/models/fel-hero.glb'];
const athletesDir = 'public/models/athletes';
if (existsSync(athletesDir)) {
  for (const f of readdirSync(athletesDir)) if (f.endsWith('.glb')) targets.push(join(athletesDir, f));
}
check(targets.length >= 2, `avatar targets found (${targets.length}: hero + roster)`);

for (const path of targets) {
  console.log(`\n■ ${path}`);
  const doc = await io.read(path);
  const root = doc.getRoot();

  const names = new Set(root.listNodes().map((n) => n.getName()));
  const missing = REQUIRED_BONES.filter((b) => !names.has(b));
  check(missing.length === 0, missing.length ? `MISSING BONES: ${missing.join(',')}` : `all ${REQUIRED_BONES.length} spec bones present`);

  const required = root.listExtensionsRequired().map((e) => (e.constructor as any).EXTENSION_NAME ?? '');
  check(!required.some((e) => /draco/i.test(e)), `no required draco compression (required=[${required.join(', ') || 'none'}])`);

  check(root.listSkins().length >= 1, `skeleton present (${root.listSkins().length} skins)`);

  let skinsFloat = true;
  let weightsNormalized = true;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const j = prim.getAttribute('JOINTS_0');
      const w = prim.getAttribute('WEIGHTS_0');
      if (!j || !w) continue;
      if (!(j.getArray() instanceof Float32Array) || j.getNormalized()) skinsFloat = false;
      if (!(w.getArray() instanceof Float32Array) || w.getNormalized()) skinsFloat = false;
      const wArr = w.getArray()!;
      const comps = w.getElementSize();
      for (let v = 0; v < Math.min(w.getCount(), 200); v++) {
        let s = 0;
        for (let c = 0; c < comps; c++) s += wArr[v * comps + c];
        if (s > 1e-6 && Math.abs(s - 1) > 1e-2) weightsNormalized = false;
      }
    }
  }
  check(skinsFloat, 'skin attributes float32, non-normalized');
  check(weightsNormalized, 'skin weights normalized per vertex (sampled 200)');

  let cmTracks = 0;
  let animCount = 0;
  const clipNames: string[] = [];
  for (const anim of root.listAnimations()) {
    animCount++;
    clipNames.push(anim.getName());
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== 'translation') continue;
      const node = ch.getTargetNode();
      if (!node) continue;
      const out = ch.getSampler()!.getOutput()!.getArray()!;
      if (out.length < 3) continue;
      const t = node.getTranslation();
      const nodeMag = Math.hypot(t[0], t[1], t[2]);
      const keyMag = Math.hypot(out[0], out[1], out[2]);
      if (nodeMag > 1e-4) {
        const ratio = keyMag / nodeMag;
        if (ratio > CM_RATIO_MIN && ratio < CM_RATIO_MAX) cmTracks++;
      }
    }
  }
  check(animCount >= 8, `clip set shipped (${animCount} clips)`);
  check(cmTracks === 0, `animation translation tracks meter-scale (${cmTracks} cm-scale tracks)`);

  const manifestPath = path.replace(/\.glb$/, '.json');
  const manifestOk = existsSync(manifestPath);
  check(manifestOk, 'sibling .json manifest exists');
  if (manifestOk) {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const names = new Set((m.clips ?? []).map((c: any) => c.name));
    const missingClips = clipNames.filter((c) => !names.has(c));
    check(missingClips.length === 0, `manifest covers every GLB clip (${names.size}/${clipNames.length})`);
  }
}

console.log(`\navatar-pipeline: ${checks} checks ${failures ? `— ${failures} FAILED` : 'green'}`);
process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
