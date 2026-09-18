/**
 * FEL AVATAR PIPELINE — image-generator GLB → Babylon-ready avatar.
 *
 *   npx tsx scripts/avatar/pipeline.mts <input.glb> <name> [--ref <ref.glb>] [--out public/models]
 *
 * Why this exists
 * ---------------
 * The Meshy-exported hero (elijah-hero.glb) cost days of T-pose debugging
 * because its encoding silently violated assumptions the runtime makes:
 * centimeter-scale animation translation tracks on a meter-scale rig,
 * UNSIGNED_BYTE skin attributes, and a node tree nobody had validated against
 * docs/avatar/AvatarSkeletonSpec.md. Every one of those is detectable and
 * fixable OFFLINE, before the asset ever reaches the engine. That is what
 * this pipeline does. An asset that fails here never ships; an asset that
 * passes here is boring — which is the point.
 *
 * Stages
 * ------
 *  1. INSPECT   — report skins, joints, animations, textures, scale probes.
 *  2. NORMALIZE — strip `mixamorig:` prefixes (spec: runtime resolves
 *                 UNPREFIXED names); detect + fix cm-scale animation
 *                 translation tracks; convert JOINTS_0/WEIGHTS_0 to float32
 *                 (procedural skins are float32; byte skins are the GLB-only
 *                 path that has never rendered correctly in this app);
 *                 renormalize weights per-vertex; dedup + prune.
 *  3. RETARGET  — copy the reference clip set (default: elijah-hero.glb's
 *                 nine authored clips) onto the target rig BY BONE NAME.
 *                 Channels whose bone is missing are dropped and counted;
 *                 coverage below 90% fails the build — a rig without arms
 *                 must not ship looking fine at rest.
 *  4. VALIDATE  — required bone-name set from AvatarSkeletonSpec.md (the
 *                 project ABI), exactly-one-skeleton sanity, float32 skins.
 *  5. EMIT      — <out>/<name>.glb + <out>/<name>.json manifest
 *                 ({ fps: 30, clips: [{ name, loop, seconds }] }), with loop
 *                 flags inherited from the reference manifest when present.
 *
 * The render proof (does it ACTUALLY deform in Babylon) is a separate gate:
 * scripts/avatar/validate-render.mts. Structural cleanliness here, visual
 * truth there. Both are required.
 *
 * Fix ledger: every mutation is logged with counts. Silent fixes are how
 * the original asset got broken; this file errs on the side of noise.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { NodeIO, type Document, type Node, type Animation } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';

// ── Spec contract (docs/avatar/AvatarSkeletonSpec.md — LOCKED) ──────────────
const REQUIRED_BONES = [
  'Hips',
  'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

const CLIP_COVERAGE_MIN = 0.9;
const CM_RATIO_MIN = 50;   // |track| / |node| above this ⇒ track is cm-scale
const CM_RATIO_MAX = 200;

type Ledger = { stage: string; msg: string }[];
const ledger: Ledger = [];
const note = (stage: string, msg: string) => { ledger.push({ stage, msg }); console.log(`  [${stage}] ${msg}`); };

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const opt = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
if (positional.length < 2) {
  console.error('usage: npx tsx scripts/avatar/pipeline.mts <input.glb> <name> [--ref public/models/elijah-hero.glb] [--out public/models]');
  process.exit(2);
}
const [inputPath, outName] = positional;
const refPath = opt('ref', 'public/models/elijah-hero.glb');
const outDir = opt('out', 'public/models');

// Draco: Meshy exports REQUIRE KHR_draco_mesh_compression (the hero GLB's
// geometry is Draco-encoded). Register the decoder; skip meshopt (unused).
import draco3d from 'draco3dgltf';
const dracoDecoder = await draco3d.createDecoderModule();
const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS.filter((E: any) => !/meshopt/i.test(E.EXTENSION_NAME ?? '')))
  .registerDependencies({ 'draco3d.decoder': dracoDecoder });

// ── helpers ─────────────────────────────────────────────────────────────────
const stripPrefix = (name: string) => name.replace(/^mixamorig:?/i, '');

function localT(n: Node): [number, number, number] {
  const t = n.getTranslation();
  return [t[0], t[1], t[2]];
}
const mag = (v: readonly number[]) => Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);

// ── 1+2. INSPECT & NORMALIZE ────────────────────────────────────────────────
async function inspectAndNormalize(doc: Document): Promise<void> {
  const root = doc.getRoot();
  console.log(`\n■ INSPECT ${inputPath}`);
  note('inspect', `meshes=${root.listMeshes().length} skins=${root.listSkins().length} nodes=${root.listNodes().length} anims=${root.listAnimations().length} textures=${root.listTextures().length}`);
  for (const tex of root.listTextures()) {
    if (tex.getMimeType().includes('ktx2')) note('inspect', `texture "${tex.getName() || tex.getURI()}" is KTX2 — runtime must have the Basis transcoder configured (FEL does).`);
  }

  // 2a. prefix strip
  let renamed = 0;
  for (const n of root.listNodes()) {
    const clean = stripPrefix(n.getName());
    if (clean !== n.getName()) { n.setName(clean); renamed++; }
  }
  if (renamed) note('normalize', `stripped mixamorig: prefix from ${renamed} nodes`);

  // 2b. skin audit + float32 conversion + weight renormalization
  for (const skin of root.listSkins()) {
    const joints = skin.listJoints();
    note('inspect', `skin "${skin.getName()}" joints=${joints.length}`);
    const skinnedMeshes = root.listNodes().filter((n) => n.getSkin() === skin && n.getMesh()).map((n) => n.getMesh()!);
    for (const mesh of skinnedMeshes) {
      for (const prim of mesh.listPrimitives()) {
        const jointsAttr = prim.getAttribute('JOINTS_0');
        const weightsAttr = prim.getAttribute('WEIGHTS_0');
        if (!jointsAttr || !weightsAttr) continue;
        const jArr = jointsAttr.getArray()!;
        const wArr = weightsAttr.getArray()!;
        const comps = jointsAttr.getElementSize();
        const count = jointsAttr.getCount();
        const jNorm = jointsAttr.getNormalized();
        const wNorm = weightsAttr.getNormalized();

        // JOINTS_0 → float32 (denormalize if needed)
        if (!(jArr instanceof Float32Array) || jNorm) {
          const out = new Float32Array(count * comps);
          const jMax = jArr instanceof Uint8Array ? 255 : jArr instanceof Uint16Array ? 65535 : 1;
          for (let i = 0; i < out.length; i++) out[i] = jNorm ? (jArr[i] / jMax) : jArr[i];
          jointsAttr.setArray(out).setNormalized(false);
          note('normalize', `${mesh.getName()}: JOINTS_0 → float32 (was ${jArr.constructor.name}${jNorm ? ' normalized' : ''})`);
        }
        // WEIGHTS_0 → float32 denormalized, then per-vertex renormalize
        {
          const out = new Float32Array(count * comps);
          const wMax = wArr instanceof Uint8Array ? 255 : wArr instanceof Uint16Array ? 65535 : 1;
          for (let i = 0; i < out.length; i++) out[i] = wNorm || !(wArr instanceof Float32Array) ? (wArr[i] / wMax) : wArr[i];
          let fixed = 0;
          for (let v = 0; v < count; v++) {
            let s = 0;
            for (let c = 0; c < comps; c++) s += out[v * comps + c];
            if (s > 1e-6 && Math.abs(s - 1) > 1e-3) {
              for (let c = 0; c < comps; c++) out[v * comps + c] /= s;
              fixed++;
            }
          }
          weightsAttr.setArray(out).setNormalized(false);
          note('normalize', `${mesh.getName()}: WEIGHTS_0 → float32, renormalized ${fixed}/${count} verts`);
        }
      }
    }
  }

  // 2c. cm-scale animation translation tracks.
  // Reference ratio: Hips track first key vs Hips node translation, when sane.
  let skeletonScaleHint = 1;
  const hips = root.listNodes().find((n) => n.getName() === 'Hips');
  for (const anim of root.listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== 'translation') continue;
      const node = ch.getTargetNode();
      if (!node) continue;
      const sampler = ch.getSampler()!;
      const out = sampler.getOutput()!.getArray()!;
      if (out.length < 3) continue;
      const nodeMag = mag(localT(node));
      const keyMag = mag([out[0], out[1], out[2]]);
      let ratio = nodeMag > 1e-4 ? keyMag / nodeMag : (node.getName() === 'Hips' ? 0 : skeletonScaleHint);
      if (node.getName() === 'Hips' && nodeMag > 1e-4) {
        if (ratio > CM_RATIO_MIN && ratio < CM_RATIO_MAX) skeletonScaleHint = ratio;
      }
      const useRatio = nodeMag > 1e-4 ? ratio : skeletonScaleHint;
      if (useRatio > CM_RATIO_MIN && useRatio < CM_RATIO_MAX) {
        const scale = 1 / Math.round(useRatio / 100) / 100 || 0.01; // ≈0.01
        const fixed = new Float32Array(out.length);
        for (let i = 0; i < out.length; i++) fixed[i] = out[i] * scale;
        sampler.getOutput()!.setArray(fixed);
        note('normalize', `anim "${anim.getName()}" ${node.getName()}.translation was ~${Math.round(useRatio)}× node scale — rescaled ×${scale}`);
      }
    }
  }
  void hips;

  await doc.transform(dedup(), prune());
}

// ── 3. RETARGET reference clips by bone name ────────────────────────────────
async function retargetClips(doc: Document, refDoc: Document): Promise<Map<string, number>> {
  console.log(`\n■ RETARGET clips from ${refPath}`);
  const targetNodes = new Map<string, Node>();
  for (const n of doc.getRoot().listNodes()) targetNodes.set(n.getName(), n);

  const durations = new Map<string, number>();
  let copiedChannels = 0;
  let droppedChannels = 0;

  for (const refAnim of refDoc.getRoot().listAnimations()) {
    const name = stripPrefix(refAnim.getName());
    const anim = doc.createAnimation(name);
    let dur = 0;
    for (const refCh of refAnim.listChannels()) {
      const refNode = refCh.getTargetNode();
      if (!refNode) { droppedChannels++; continue; }
      const boneName = stripPrefix(refNode.getName());
      const node = targetNodes.get(boneName);
      if (!node) { droppedChannels++; continue; }
      const refSampler = refCh.getSampler()!;
      const inArr = refSampler.getInput()!.getArray()!;
      const outArr = refSampler.getOutput()!.getArray()!;
      const input = doc.createAccessor()
        .setType(refSampler.getInput()!.getType())
        .setArray(new Float32Array(inArr));
      const output = doc.createAccessor()
        .setType(refSampler.getOutput()!.getType())
        .setArray(outArr instanceof Float32Array ? new Float32Array(outArr) : Float32Array.from(outArr as ArrayLike<number>));
      const sampler = doc.createAnimationSampler()
        .setInterpolation(refSampler.getInterpolation())
        .setInput(input)
        .setOutput(output);
      const channel = doc.createAnimationChannel()
        .setTargetNode(node)
        .setTargetPath(refCh.getTargetPath())
        .setSampler(sampler);
      anim.addSampler(sampler).addChannel(channel);
      copiedChannels++;
      dur = Math.max(dur, inArr[inArr.length - 1] ?? 0);
    }
    durations.set(name, dur);
    note('retarget', `clip "${name}" — ${anim.listChannels().length} channels, ${dur.toFixed(2)}s`);
  }

  const total = copiedChannels + droppedChannels;
  const coverage = total ? copiedChannels / total : 0;
  note('retarget', `channel coverage ${(coverage * 100).toFixed(1)}% (${copiedChannels}/${total})`);
  if (coverage < CLIP_COVERAGE_MIN) {
    throw new Error(`RETARGET COVERAGE ${(coverage * 100).toFixed(1)}% < ${CLIP_COVERAGE_MIN * 100}% — rig does not match the clip set's bone names. Check AvatarSkeletonSpec conformance of ${inputPath}.`);
  }
  return durations;
}

// ── 4. VALIDATE against the locked spec ─────────────────────────────────────
function validate(doc: Document): void {
  console.log(`\n■ VALIDATE vs AvatarSkeletonSpec.md`);
  const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
  const missing = REQUIRED_BONES.filter((b) => !names.has(b));
  if (missing.length) throw new Error(`MISSING REQUIRED BONES: ${missing.join(', ')} — the runtime resolves these by name; shipping this rig freezes those limbs.`);
  note('validate', `all ${REQUIRED_BONES.length} required bone names present`);
  const skins = doc.getRoot().listSkins();
  if (skins.length !== 1) note('validate', `skins=${skins.length} (spec prefers one skeleton per avatar — review if >1)`);
  for (const skin of skins) {
    const skinnedMeshes = doc.getRoot().listNodes().filter((n) => n.getSkin() === skin && n.getMesh()).map((n) => n.getMesh()!);
    for (const mesh of skinnedMeshes) {
      for (const prim of mesh.listPrimitives()) {
        const j = prim.getAttribute('JOINTS_0');
        const w = prim.getAttribute('WEIGHTS_0');
        if (j && !(j.getArray() instanceof Float32Array)) throw new Error(`${mesh.getName()}: JOINTS_0 is not float32 after normalize — pipeline bug.`);
        if (w && !(w.getArray() instanceof Float32Array)) throw new Error(`${mesh.getName()}: WEIGHTS_0 is not float32 after normalize — pipeline bug.`);
      }
    }
  }
  note('validate', 'skin attributes float32 ✓');
}

// ── 5. EMIT ─────────────────────────────────────────────────────────────────
async function emit(doc: Document, durations: Map<string, number>): Promise<void> {
  const glbPath = join(outDir, `${outName}.glb`);
  const jsonPath = join(outDir, `${outName}.json`);
  // Write UNCOMPRESSED: draco was decoded on ingest; disposing the extension
  // emits plain buffers so the runtime never needs the draco wasm at all.
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (/draco/i.test((ext.constructor as any).EXTENSION_NAME ?? '')) ext.dispose();
  }
  await io.write(glbPath, doc);

  // loop flags: inherit from the reference manifest when it exists
  const loopByClip = new Map<string, boolean>();
  const refManifest = refPath.replace(/\.glb$/, '.json');
  if (existsSync(refManifest)) {
    const m = JSON.parse(readFileSync(refManifest, 'utf8'));
    for (const c of m.clips ?? []) loopByClip.set(c.name, !!c.loop);
  }
  const manifest = {
    fps: 30,
    clips: [...durations.entries()].map(([name, seconds]) => ({
      name,
      loop: loopByClip.get(name) ?? /^(idle|run|walk|guard)/.test(name),
      seconds: +seconds.toFixed(3),
    })),
  };
  writeFileSync(jsonPath, JSON.stringify(manifest, null, 2) + '\n');
  note('emit', `${glbPath} + ${basename(jsonPath)} (${manifest.clips.length} clips)`);
}

// ── main ────────────────────────────────────────────────────────────────────
console.log(`FEL AVATAR PIPELINE\ninput: ${inputPath}\nname:  ${outName}\nref:   ${refPath}\nout:   ${outDir}`);
const doc = await io.read(inputPath);
const selfNormalize = inputPath === refPath;
await inspectAndNormalize(doc);
let durations: Map<string, number>;
if (selfNormalize) {
  // Normalizing the reference itself: clips are already on the rig — do not
  // copy them onto themselves. Durations come from the existing animations.
  durations = new Map();
  for (const a of doc.getRoot().listAnimations()) {
    let dur = 0;
    for (const ch of a.listChannels()) {
      const arr = ch.getSampler()?.getInput()?.getArray();
      if (arr && arr.length) dur = Math.max(dur, arr[arr.length - 1]);
    }
    durations.set(a.getName(), dur);
  }
  note('retarget', `skipped — input IS the reference (${durations.size} clips already on rig)`);
} else {
  const refDoc = await io.read(refPath);
  durations = await retargetClips(doc, refDoc);
}
validate(doc);
await emit(doc, durations);
console.log(`\n✔ PIPELINE GREEN — ${outName}.glb is structurally shippable.`);
console.log(`  Next gate: npx tsx scripts/avatar/validate-render.mts ${join(outDir, outName + '.glb')}`);
