// RENDER SHAPE — a CreatorDoc's shape v2 on a body (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b).
//
// Called by the Creator hook (core/creatorLook.applyCreatorLayers) on every apply, so the shape shows in every mode that
// applies the player's identity and in the Closet's preview. What each value does to the body (lib/creator/look/shape.ts
// decides the values per place; doc.ts says why each is safe):
//
//   head       the Head bone's own scale. A leaf bone (nothing below it to compound into); the eyes, the hair and any
//              part or accessory on the head grow with it. No shoulder, elbow or hand moves.
//   neck       the Head JOINT moves up the body by (neck − 1) × the visible neck's length (measured off the mesh: the
//              kit's Neck→Head joint offset is only ~4 cm). Nothing is scaled, so nothing compounds.
//   hands,     a MESH scale about the wrist / the sole under the ankle, folded into the shape morph (inflate.ts). NOT a
//   feet       bone scale: the hand bone carries the ball (ballRig.attachBallToHand), a staff or a bat (arsenal,
//              MixedCombatMode), and scaling the bone would scale those and move them — a reach change. Creator parts on a
//              hand or a foot are scaled about the same pivot, so a glove still fits.
//   legs,      FRAME KEYS: the child joints' bind offsets lengthened (shape.lengthenedOffset — no node is scaled, so a bent
//   torso,     knee cannot shear), and for the legs the skeleton is lifted by the extra length so the feet stay on the
//   shoulders  floor. Clamped to the play clamp; exactly 1.0 when ranked or in a STANDARD_FRAME_MODES mode.
//   bulk       per-segment inflate on the body AND every visible garment and hair mesh (so clothes follow); the eyeballs
//              move whole with the face around them (inflate.groupTransfer). No bone moves.
//
// THE MORPH BUDGET. Every segment's bulk and both mesh scales are summed on the CPU into ONE morph target per mesh
// ('felShape'), so a body costs one more morph influence however many sliders moved: on WebGL1 / vertex-attribute
// morphs (cap MorphTargetManager.MaxActiveMorphTargetsInVertexAttributeMode = 8) the kit body's seven face morphs plus
// this one is exactly 8, and it is one position attribute; with morph textures (WebGL2: every phone in the target
// range) it is one more layer of the body's target texture. A target is created only when a mesh's shape first moves
// off neutral, and set to influence 0 (not removed) when it comes back, so a slider drag never recompiles a shader.
//
// CACHES. Everything measured here is measured at REST (paint/surfaceMap.restSkin: the bind pose through the rest
// matrices) and keyed by the mesh's geometry (surfaceMap.geometryKey), like the paint maps. The shape never writes a
// vertex buffer or a rest matrix (the morph is applied by the GPU; the bones move through their nodes), so the paint
// and ear maps, the parts' rest frames (parts/rigFrames) and this module's own caches all still hold under any shape —
// shape.render.test.ts proves it.
//
// Contract (creatorLook's): idempotent per body, absolute from the bind pose (applying twice is applying once), nothing
// pickable or colliding is made, everything made is disposed with the body's root. `root.metadata.felShape` records
// what was applied, for probes.

import { Matrix, MorphTarget, MorphTargetManager, Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Bone, Mesh, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode, findBone } from '../../anim/boneLookup';
import { playContextOf } from '../../core/playFrame';
import { bareBone } from '../paint/bodyChart';
import { absRest, fullIndices, geometryKey, isPaintBody, restSkin } from '../paint/surfaceMap';
import { partsOn } from '../parts/renderParts';
import {
  FRAME_JOINTS, GIRTH_BONES, SCALE_GROUPS, effectiveShape, isNeutralShape, legLift, lengthenedOffset, neckOffset,
  type EffectiveShape, type ScaleGroup,
} from '../../../creator/look/shape';
import { GIRTH_KEYS, type CreatorDoc, type GirthKey } from '../../../creator/look/doc';
import {
  dominantOn, emptyTable, groupTransfer, invert3, lowestAlong, segmentRadius, shapeDelta, spanAlong, tableIsNeutral, toLocal,
  weightOn, weldedNormals, type BoneShapeTable, type SkinField,
} from './inflate';

type V3 = [number, number, number];
export const SHAPE_TARGET = 'felShape';

// ── per-mesh preparation (rest pose, cached per kit mesh) ────────────────────────────────────────────────────────────

export interface MeshPrep {
  key: string;
  field: SkinField;
  /** L⁻¹ per skin joint (joints × 9): rest space → the mesh's own vertex space */
  linv: Float32Array;
  /** the mesh's own vertex positions (what a morph target holds, plus the offset) */
  base: Float32Array;
  /** bare bone name per skin joint */
  bones: string[];
}

const preps = new Map<string, MeshPrep | null>();
/** Per mesh object too, so a re-apply (every Closet edit) does not re-checksum the geometry. */
let prepOfMesh = new WeakMap<Mesh, MeshPrep | null>();

export function shapeKey(mesh: Mesh): string {
  return `${geometryKey(mesh)}#${mesh.skeleton?.bones.length ?? 0}`;
}

/** A skinned mesh's rest field, cached per kit mesh; null when it has no skin, no indices or no positions. */
export function prepFor(mesh: Mesh): MeshPrep | null {
  if (prepOfMesh.has(mesh)) return prepOfMesh.get(mesh) ?? null;
  const key = shapeKey(mesh);
  if (preps.has(key)) { const hit = preps.get(key) ?? null; prepOfMesh.set(mesh, hit); return hit; }
  const skin = mesh.skeleton ? restSkin(mesh) : null;
  const ind = fullIndices(mesh);
  const pos = mesh.getVerticesData('position');
  let prep: MeshPrep | null = null;
  if (skin && ind && pos && mesh.skeleton) {
    const linv = new Float32Array(mesh.skeleton.bones.length * 9);
    mesh.skeleton.bones.forEach((b, j) => {
      const m = b.getAbsoluteInverseBindMatrix().multiply(absRest(b)).m;
      linv.set(invert3([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]), j * 9);
    });
    const P = skin.P instanceof Float32Array ? skin.P : Float32Array.from(skin.P);
    prep = {
      key,
      field: { P, N: weldedNormals(P, ind), J: skin.J, W: skin.W, J2: skin.J2, W2: skin.W2 },
      linv, base: Float32Array.from(pos), bones: skin.bones.map(bareBone),
    };
  }
  preps.set(key, prep);
  prepOfMesh.set(mesh, prep);
  return prep;
}

// ── the body's measurements (radii, pivots, the neck, the legs), cached per body ─────────────────────────────────────

export interface BodyMeasure {
  /** the body's up direction in the skeleton's space (unit) */
  up: V3;
  /** each girth bone's radius, metres */
  radius: Record<string, number>;
  /** each mesh-scale group's pivot, skeleton space */
  pivot: Record<ScaleGroup, V3>;
  /** the visible neck's length (the span of the vertices the Neck bone dominates), metres */
  neckLength: number;
  /** the hip joints' rest height above the ankles, metres */
  hipToAnkle: number;
  /** the body's left direction in the skeleton's space (unit): which side an eyeball is on */
  side: V3;
  /** the midline point (between the hips), skeleton space */
  mid: V3;
}

/** The joint each girth bone's radius is measured to (the head carries on up). */
const RADIUS_TO: Record<string, string> = {
  Neck: 'Head', Spine2: 'Neck', LeftShoulder: 'LeftArm', RightShoulder: 'RightArm', Spine: 'Spine1', Spine1: 'Spine2',
  LeftArm: 'LeftForeArm', RightArm: 'RightForeArm', LeftForeArm: 'LeftHand', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', RightUpLeg: 'RightLeg', LeftLeg: 'LeftFoot', RightLeg: 'RightFoot',
};
const NECK_FALLBACK_M = 0.08;
/** How far round an eyeball the face skin that carries it reaches (metres). assumption: 4 cm takes in the lids, the
 *  brow and the cheek above the bone; judged from the kit's proportions, not a rendered view. */
const EYE_REACH_M = 0.04;
const measures = new Map<string, BodyMeasure | null>();

function jointsOf(sk: Skeleton): Record<string, V3> {
  const out: Record<string, V3> = {};
  for (const b of sk.bones) { const t = absRest(b).getTranslation(); out[bareBone(b.name)] = [t.x, t.y, t.z]; }
  return out;
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The body's measurements, from its own mesh at rest; null on a rig without the joints a body needs. */
export function measureBody(body: Mesh): BodyMeasure | null {
  const prep = prepFor(body);
  if (!prep || !body.skeleton) return null;
  if (measures.has(prep.key)) return measures.get(prep.key) ?? null;
  const J = jointsOf(body.skeleton);
  const need = ['Hips', 'Head', 'Neck', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftUpLeg', 'RightUpLeg'];
  if (need.some((b) => !J[b])) { measures.set(prep.key, null); return null; }
  const { P } = prep.field;
  const n = P.length / 3;
  const idx = (names: readonly string[]) => new Set(prep.bones.flatMap((b, j) => (names.includes(b) ? [j] : [])));
  const up = unit(sub(J.Head, J.Hips));
  const radius: Record<string, number> = {};
  for (const bones of Object.values(GIRTH_BONES)) for (const b of bones) {
    if (!J[b]) continue;
    const to: V3 = RADIUS_TO[b] && J[RADIUS_TO[b]] ? J[RADIUS_TO[b]] : [J[b][0] + up[0] * 0.25, J[b][1] + up[1] * 0.25, J[b][2] + up[2] * 0.25];
    radius[b] = segmentRadius(P, dominantOn(prep.field, idx([b]), n), J[b], to);
  }
  const pivot = {} as Record<ScaleGroup, V3>;
  for (const [g, def] of Object.entries(SCALE_GROUPS) as [ScaleGroup, (typeof SCALE_GROUPS)[ScaleGroup]][]) {
    const joint = J[def.bones[0]];
    if (def.key === 'hands') { pivot[g] = [...joint]; continue; }
    // a foot scales about the point on the sole straight under the ankle, so a big foot stays on the floor
    const sole = lowestAlong(P, weightOn(prep.field, idx(def.bones), n), up);
    const drop = sole == null ? 0 : dot(joint, up) - sole;
    pivot[g] = [joint[0] - up[0] * drop, joint[1] - up[1] * drop, joint[2] - up[2] * drop];
  }
  const neckLength = spanAlong(P, dominantOn(prep.field, idx(['Neck']), n), up) || NECK_FALLBACK_M;
  const hipToAnkle = (dot(sub(J.LeftUpLeg, J.LeftFoot), up) + dot(sub(J.RightUpLeg, J.RightFoot), up)) / 2;
  const side = unit(sub(J.LeftUpLeg, J.RightUpLeg));
  const mid: V3 = [(J.LeftUpLeg[0] + J.RightUpLeg[0]) / 2, (J.LeftUpLeg[1] + J.RightUpLeg[1]) / 2, (J.LeftUpLeg[2] + J.RightUpLeg[2]) / 2];
  const m: BodyMeasure = { up, radius, pivot, neckLength, hipToAnkle, side, mid };
  measures.set(prep.key, m);
  return m;
}

/** A mesh's bone table for a shape: the bulk (metres) and the mesh scale per skin joint. */
export function tableFor(prep: MeshPrep, m: BodyMeasure, s: EffectiveShape): BoneShapeTable {
  const t = emptyTable(prep.bones.length);
  const segOf: Record<string, GirthKey> = {};
  for (const k of GIRTH_KEYS) for (const b of GIRTH_BONES[k]) segOf[b] = k;
  prep.bones.forEach((b, j) => {
    const seg = segOf[b];
    if (seg && s.girth[seg] !== 1) t.girth[j] = (s.girth[seg] - 1) * (m.radius[b] ?? 0);
    for (const [g, def] of Object.entries(SCALE_GROUPS) as [ScaleGroup, (typeof SCALE_GROUPS)[ScaleGroup]][]) {
      if (!(def.bones as readonly string[]).includes(b)) continue;
      const f = s.body[def.key];
      if (f !== 1) { t.scale[j] = f - 1; t.pivot.set(m.pivot[g], j * 3); }
    }
  });
  return t;
}

// ── the bones ────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Bind { pos: Vector3; scale: Vector3 }
const binds = new WeakMap<TransformNode, Bind>();
function bindOf(n: TransformNode): Bind {
  let b = binds.get(n);
  if (!b) { b = { pos: n.position.clone(), scale: n.scaling.clone() }; binds.set(n, b); }
  return b;
}
const v3 = (v: Vector3): V3 => [v.x, v.y, v.z];

/** A direction in the skeleton's space, in a bone's own (rest) space — in that space's units, not normalised. */
function intoBone(bone: Bone, d: V3): V3 {
  const inv = absRest(bone).clone().invert();
  const r = Vector3.TransformNormal(new Vector3(d[0], d[1], d[2]), inv);
  return [r.x, r.y, r.z];
}

/** The node the skeleton hangs from (the Hips' parent), unless it is the body's root: modes own the root. */
function armatureOf(skeleton: Skeleton, root: TransformNode): TransformNode | null {
  const p = boneNode(skeleton, 'Hips')?.parent as TransformNode | null | undefined;
  return p && p !== root && typeof (p as TransformNode).position === 'object' ? p : null;
}

function applyBones(spawn: { root: TransformNode; skeleton: Skeleton }, s: EffectiveShape, m: BodyMeasure): void {
  const sk = spawn.skeleton;
  const head = boneNode(sk, 'Head');
  if (head) {
    const b = bindOf(head);
    head.scaling.copyFrom(b.scale).scaleInPlace(s.body.head);
    const neckBone = findBone(sk, 'Neck');
    const up = neckBone ? intoBone(neckBone, m.up) : [0, 0, 0] as V3;
    const p = neckOffset(v3(b.pos), up, s.body.neck, m.neckLength);
    head.position.set(p[0], p[1], p[2]);
  }
  for (const [key, joints] of Object.entries(FRAME_JOINTS) as [keyof typeof FRAME_JOINTS, readonly string[]][]) {
    for (const name of joints) {
      const n = boneNode(sk, name); if (!n) continue;
      const p = lengthenedOffset(v3(bindOf(n).pos), s.body[key]);
      n.position.set(p[0], p[1], p[2]);
    }
  }
  // longer legs stand on the floor: lift the skeleton (its parent node, never the mode-owned root) by the extra length
  const arm = armatureOf(sk, spawn.root);
  if (arm) {
    const b = bindOf(arm);
    const lift = legLift(s.body.legs, m.hipToAnkle);
    const rot = arm.rotationQuaternion ?? Quaternion.FromEulerVector(arm.rotation);
    const d = Vector3.TransformNormal(new Vector3(m.up[0] * lift, m.up[1] * lift, m.up[2] * lift), Matrix.Compose(b.scale, rot, Vector3.Zero()));
    arm.position.copyFrom(b.pos).addInPlace(d);
  }
}

// ── the parts on a hand or a foot, and the jersey plate ──────────────────────────────────────────────────────────────

function fitParts(spawn: { root: TransformNode; skeleton: Skeleton }, s: EffectiveShape, m: BodyMeasure): void {
  const meshes = partsOn(spawn.root).meshes;
  if (!meshes.length) return;
  for (const [g, def] of Object.entries(SCALE_GROUPS) as [ScaleGroup, (typeof SCALE_GROUPS)[ScaleGroup]][]) {
    const f = s.body[def.key];
    for (const name of def.bones) {
      const node = boneNode(spawn.skeleton, name), bone = findBone(spawn.skeleton, name);
      if (!node || !bone) continue;
      // the pivot in the bone node's own space at rest: what the part's vertices are baked in (parts/placement.ts)
      const pv = Vector3.TransformCoordinates(new Vector3(...m.pivot[g]), absRest(bone).clone().invert());
      for (const mesh of meshes) {
        if (mesh.parent !== node) continue;
        mesh.scaling.setAll(f);
        mesh.position.copyFrom(pv.scale(1 - f));
      }
    }
  }
}

/** The jersey number plate hangs a few cm off the back (playerIdentity.attachJerseyPlate): a bulked chest would swallow
 *  it, so it moves out with the chest's bulk, along its own offset. */
function fitPlate(spawn: { meshes?: readonly AbstractMesh[] }, s: EffectiveShape, m: BodyMeasure): void {
  for (const plate of spawn.meshes ?? []) {
    if (!plate.name.startsWith('jersey_decal_') || plate.isDisposed()) continue;
    const md = (plate.metadata ??= {}) as { felPlateBase?: Vector3 };
    md.felPlateBase ??= plate.position.clone();
    const base = md.felPlateBase;
    const out = (s.girth.chest - 1) * (m.radius.Spine2 ?? 0);
    const l = base.length();
    plate.position.copyFrom(l > 1e-6 ? base.scale(1 + out / l) : base);
  }
}

// ── the morph ────────────────────────────────────────────────────────────────────────────────────────────────────────

interface MeshState { target: MorphTarget; mgr: MorphTargetManager; own: boolean; sig: string }
interface BodyShapeState { meshes: Map<AbstractMesh, MeshState>; hooked: boolean }
const bodies = new WeakMap<TransformNode, BodyShapeState>();

const isEyes = (m: AbstractMesh) => /^eyes(\b|_|$)/i.test(m.name);

/** The skinned mesh a shape is measured on: the kit's `Body`, or else the skinned mesh with the most vertices. */
export function bodyMeshOf(meshes: readonly AbstractMesh[]): Mesh | null {
  const skinned = meshes.filter((m) => !m.isDisposed() && m.skeleton && m.getTotalVertices() > 0) as Mesh[];
  return skinned.find((m) => isPaintBody(m.name)) ?? skinned.sort((a, b) => b.getTotalVertices() - a.getTotalVertices())[0] ?? null;
}

function setTarget(mesh: Mesh, st: BodyShapeState, positions: Float32Array, sig: string): void {
  const have = st.meshes.get(mesh);
  if (have) {
    have.target.setPositions(positions);
    have.target.influence = 1;
    have.sig = sig;
    have.mgr.synchronize();
    return;
  }
  const scene = mesh.getScene();
  const own = !mesh.morphTargetManager;
  const mgr = mesh.morphTargetManager ?? new MorphTargetManager(scene);
  const target = new MorphTarget(SHAPE_TARGET, 1, scene);
  target.setPositions(positions);
  mgr.addTarget(target);
  if (own) mesh.morphTargetManager = mgr;
  st.meshes.set(mesh, { target, mgr, own, sig });
}

function release(st: BodyShapeState): void {
  for (const [mesh, s] of st.meshes) {
    try {
      s.mgr.removeTarget(s.target);
      if (s.own) { if (!mesh.isDisposed()) mesh.morphTargetManager = null; s.mgr.dispose(); }
    } catch { /* gone with the scene */ }
  }
  st.meshes.clear();
}

export interface ShapeSummary {
  /** the values applied here (after the per-place rule) */
  shape: EffectiveShape;
  /** meshes wearing a non-neutral shape morph */
  morphed: number;
  /** morph influences this module adds per mesh (always 1: everything is summed into one target) */
  targetsPerMesh: 1;
}

/**
 * Make the body wear the doc's shape here (or none, with null). Idempotent and absolute from the bind pose.
 */
export function syncShape(
  spawn: { root: TransformNode; skeleton?: Skeleton | null; meshes?: readonly AbstractMesh[] },
  doc: CreatorDoc | null,
): ShapeSummary | null {
  const { root } = spawn;
  if (root.isDisposed() || !spawn.skeleton) return null;
  const s = effectiveShape(doc?.shape, playContextOf(root.getScene()?.metadata));
  let st = bodies.get(root);
  const neutral = isNeutralShape(s);
  if (neutral && !st) return null;   // never shaped, nothing to undo: the cheap path every NPC takes
  const body = bodyMeshOf(spawn.meshes ?? []);
  const m = body ? measureBody(body) : null;
  if (!m || !body) return null;
  if (!st) { st = { meshes: new Map(), hooked: false }; bodies.set(root, st); }
  if (!st.hooked) { st.hooked = true; root.onDisposeObservable.addOnce(() => { const b = bodies.get(root); if (b) { release(b); bodies.delete(root); } }); }
  const sk = spawn.skeleton;
  applyBones({ root, skeleton: sk }, s, m);
  fitParts({ root, skeleton: sk }, s, m);
  fitPlate(spawn, s, m);

  // the morph: one summed target per mesh
  const sig = JSON.stringify([s.girth, s.body.hands, s.body.feet]);
  const bodyPrep = prepFor(body);
  let bodyDelta: Float32Array | null = null;
  let morphed = 0;
  for (const mesh of (spawn.meshes ?? []) as Mesh[]) {
    if (mesh.isDisposed() || !mesh.skeleton || !mesh.getTotalVertices()) continue;
    const have = st.meshes.get(mesh);
    const prep = prepFor(mesh);
    if (!prep) continue;
    const table = tableFor(prep, m, s);
    const eyes = isEyes(mesh);
    if (tableIsNeutral(table) && !(eyes && !tableIsNeutral(tableFor(bodyPrep!, m, s)))) {
      if (have) { have.target.influence = 0; have.sig = sig; }
      continue;
    }
    if (!mesh.isEnabled() || !mesh.isVisible) { continue; }   // a hidden garment or hair: shaped when it is worn
    morphed++;
    if (have && have.sig === sig && have.target.influence === 1) continue;
    let rest: Float32Array;
    if (eyes && bodyPrep) {
      bodyDelta ??= shapeDelta(bodyPrep.field, tableFor(bodyPrep, m, s));
      // each eyeball moves whole, with the face around it (inflate.groupTransfer): grouped by side of the midline
      const P = prep.field.P, nv = P.length / 3;
      const groupOf = new Int8Array(nv);
      for (let v = 0; v < nv; v++) groupOf[v] = (P[v * 3] - m.mid[0]) * m.side[0] + (P[v * 3 + 1] - m.mid[1]) * m.side[1] + (P[v * 3 + 2] - m.mid[2]) * m.side[2] >= 0 ? 1 : 0;
      rest = groupTransfer(bodyPrep.field.P, bodyDelta, P, groupOf, EYE_REACH_M);
    } else {
      rest = mesh === body && bodyDelta ? bodyDelta : shapeDelta(prep.field, table);
      if (mesh === body) bodyDelta = rest;
    }
    const local = toLocal(rest, prep.field, prep.linv);
    const out = new Float32Array(prep.base.length);
    for (let i = 0; i < out.length; i++) out[i] = prep.base[i] + local[i];
    setTarget(mesh, st, out, sig);
  }
  const summary: ShapeSummary = { shape: s, morphed, targetsPerMesh: 1 };
  root.metadata = { ...(root.metadata ?? {}), felShape: { body: s.body, girth: s.girth, morphed } };
  return summary;
}

/** The shape target on a mesh (tests and probes), or null. */
export function shapeTargetOf(mesh: AbstractMesh): MorphTarget | null {
  const mgr = mesh.morphTargetManager;
  if (!mgr) return null;
  for (let i = 0; i < mgr.numTargets; i++) if (mgr.getTarget(i).name === SHAPE_TARGET) return mgr.getTarget(i);
  return null;
}

/** Tests: forget every cached prep and measurement. */
export function resetShapeCaches(): void { preps.clear(); measures.clear(); prepOfMesh = new WeakMap(); }
/** How many preps are cached, and their bytes (for the memory report). */
export function shapeCacheStats(): { preps: number; bytes: number } {
  let bytes = 0;
  for (const p of preps.values()) if (p) bytes += p.field.P.byteLength + p.field.N.byteLength + p.base.byteLength + p.linv.byteLength;
  return { preps: preps.size, bytes };
}
