// accessories — headbands, wristbands, sleeves, socks and chains, built in code and hung on the bones.
//
// Owner, 2026-09-16: "character appearance improvement pass … how can I make the models look better, clothes, shoes,
// accessories", on the kit body, for everyone — and, on the look: realistic material AND bold graphics; rivals get a
// named signature, NPCs get variety.
//
// WHY THIS EXISTS AT ALL. The wardrobe is two tops, two shorts (which share one material, so really one) and two
// shoes, for every character in the game. Everybody is therefore the same person in a different colour, and no amount
// of material work changes that — a crowd of five in the dunk row is five identical bodies with five tints. New
// GARMENTS need the MPFB/Blender pipeline (scripts/avatar/mpfb/dress-kit.py) and cannot be authored from here.
// Accessories can: a headband is a torus, a shooting sleeve is a tapered tube, and hung on the right bone they follow
// the animation for free, cost one draw each, and are the difference between five clones and five players.
//
// WHAT THEY ATTACH TO. A bone's transform node, so skinning is not involved — the mesh is parented to the node the
// animation already drives. Nothing here touches the body's geometry, its skeleton, or the GLB.
//
// HOW BIG THEY ARE (CLOTHING-SOFT-RESIDUAL C2/C3/C4, 2026-09-21). The QA eye's "teal mesh clip through the shirt's
// shoulder", "teal shard detached on the lower-right leg" and "right-arm shoulder elongation" on the TRUE dunk body were
// these tubes: sized in metres off a reference body and centred by a fraction, the upper-arm sleeve was 0.30 m long on a
// 0.28 m upper arm (it started INSIDE the shoulder and stood out of the tee's sleeve), and the shin sleeve's fixed 0.155 m
// top ran under a calf wider than that. A tube is now described by where it sits on its segment (accessoryFit.TUBE_SPANS)
// and its rings are MEASURED off the body's skin at those fractions plus an ease — on whatever body it is hung on. A body
// that cannot be read yet (a spawn-in tween at scale 0.001, a rig before its first pose) gets the reference sizes and a
// refit on the first frame it can be; a tube a shown top covers is trimmed to start past the top's edge, or hidden, by
// bodyMask.trimTubesUnderTops once the wardrobe is known.
import { Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, Vector3 } from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { bareBoneName, boneNode } from '../anim/boneLookup';
import { applyFabric } from './fabric';
import { TUBE_SPANS, tubeFit, type TubeFit, type TubeSpan } from './accessoryFit';
import { isBodyMesh, isShrunk, scheduleBodyMask, skinnedWorld } from './bodyMask';

export type AccessoryId = 'headband' | 'wristbands' | 'armsleeve' | 'legsleeve' | 'crewsocks' | 'chain';
export const ACCESSORY_IDS: readonly AccessoryId[] = ['headband', 'wristbands', 'armsleeve', 'legsleeve', 'crewsocks', 'chain'];

/** Which side a one-sided accessory goes on — a shooting sleeve is on the shooting arm, not both. */
export type Side = 'Left' | 'Right';

export interface AccessorySet {
  items: readonly AccessoryId[];
  /** The accent the accessories are dyed with. */
  accent: Color3;
  /** The shooting/sleeve side. */
  side: Side;
}

/** What a limb tube carries in `mesh.metadata.felAccessory.tube`, for the trim under a shown top (bodyMask). */
export interface TubeMeta {
  kind: keyof typeof TUBE_SPANS;
  /** the parent and child joints it lives between */
  from: string; to: string;
  /** the span it was BUILT for, and the span it shows now (the trim moves `span`, never `built`) */
  built: TubeSpan; span: TubeSpan;
  /** joint-to-joint metres when built, its ring radii (m, world) and whether they were read off the skin */
  seg: number; r0: number; r1: number; measured: boolean;
  /** its bone-local position when built (the trim offsets from here) */
  pos0: [number, number, number];
  hidden: string | null;
}

/**
 * How big this body is compared with the one these numbers were measured on.
 *
 * The shoulder span is the most reliable thing to read: it is two bones far apart, it exists on every humanoid rig
 * here, and it scales with the body rather than with a pose. Clamped, because a rig that reports something absurd
 * should give a slightly wrong headband, not a hula hoop.
 */
export const REF_SHOULDER_SPAN = 0.36;
export function rigScale(skeleton: Skeleton): number {
  try {
    const l = boneNode(skeleton, 'LeftArm'), r = boneNode(skeleton, 'RightArm');
    if (!l || !r) return 1;
    l.computeWorldMatrix(true); r.computeWorldMatrix(true);
    const span = Vector3.Distance(l.getAbsolutePosition(), r.getAbsolutePosition());
    if (!Number.isFinite(span) || span <= 0.01) return 1;
    return Math.max(0.6, Math.min(1.6, span / REF_SHOULDER_SPAN));
  } catch { return 1; }
}

/** Frames a tube waits for a shrunk or unposed body to become readable before it settles for the reference sizes. */
const REFIT_WAIT_FRAMES = 180;
/** The reference-body diameters (m, parent end → child end) a tube falls back to when the skin cannot be read. */
const TUBE_DEFAULTS: Record<keyof typeof TUBE_SPANS, [number, number]> = {
  armsleeve: [0.105, 0.082], armsleeve2: [0.082, 0.070], legsleeve: [0.125, 0.10], crewsocks: [0.10, 0.092],
};

function band(scene: Scene, name: string, diameter: number, thickness: number, mat: PBRMaterial, k = 1): Mesh {
  const m = MeshBuilder.CreateTorus(name, { diameter: diameter * k, thickness: thickness * k, tessellation: 14 }, scene);
  m.material = mat; m.isPickable = false; m.receiveShadows = false;
  return m;
}

function accessoryMaterial(scene: Scene, name: string, color: Color3, kind: 'jersey' | 'sock' | 'shoes' | 'band'): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = color;
  applyFabric(mat, kind);
  return mat;
}

/**
 * Hang a set of accessories on a body. Returns a disposer — every mode that spawns a character already has somewhere
 * to put one, and an accessory that outlives its body is a torus floating over the court.
 *
 * Best-effort throughout, like every other spawn-time pass here: a rig missing a bone simply does not get that item,
 * and nothing in this file throws into a spawn.
 */
export function attachAccessories(scene: Scene, skeleton: Skeleton, root: TransformNode | null, set: AccessorySet, tag = 'acc'): () => void {
  const made: { dispose(): void }[] = [];
  const mats: PBRMaterial[] = [];
  let disposed = false;
  // MEASURE THE RIG, DO NOT ASSUME IT. Every number below was read off the kit body, and the anti-clone rule spawns
  // NPCs on ROSTER bodies whose bones are scaled differently — so on rc46 a headband sat high and thick and a forearm
  // sleeve landed past the hand. One factor, taken from the shoulder span, scales every size and offset with the body.
  const k = rigScale(skeleton);
  // THE BODY'S FRAME, NOT THE BONE'S. Every offset below is written the way a person would say it — "a bit up and a
  // bit forward" — and `forward` has to mean the way the body FACES. A bone's own local axes are whatever the rig was
  // bound with, which for this skeleton is not the body frame: written as bone-local offsets, the chain came out as a
  // ring on everybody's BACK (rc49, five of them on court). So the offset is built in the body's frame, converted into
  // whatever local space the bone happens to have, and the bone can be oriented however it likes.
  const fwd = root ? root.getDirection(new Vector3(0, 0, 1)).normalize() : new Vector3(0, 0, 1);
  const up = new Vector3(0, 1, 0);
  const right = Vector3.Cross(up, fwd).normalize();
  /** `pos` is (right, up, forward) in the body's frame, metres on the reference body. */
  const on = (bone: string, mesh: Mesh, pos: Vector3, rot?: Vector3): boolean => {
    const node: TransformNode | null = boneNode(skeleton, bone);
    if (!node) { mesh.dispose(); return false; }
    node.computeWorldMatrix(true);
    const world = node.getAbsolutePosition()
      .add(right.scale(pos.x * k)).add(up.scale(pos.y * k)).add(fwd.scale(pos.z * k));
    mesh.parent = node;
    mesh.position.copyFrom(Vector3.TransformCoordinates(world, Matrix.Invert(node.getWorldMatrix())));
    // the ring/tube axes are the BODY's too: build the rotation from the frame rather than from Euler guesses
    if (rot) mesh.rotation.copyFrom(rot);
    made.push(mesh);
    return true;
  };

  /**
   * A LIMB ITEM LIVES BETWEEN TWO JOINTS, and that is the only description of it that survives a change of rig.
   *
   * A wristband is "just before the hand", a shooting sleeve is "the upper arm", a crew sock is "the bottom of the
   * shin". Written as an offset down a bone's local −y they depend on the rig having been bound that way, which is how
   * a forearm sleeve ended up floating past a hand. Written as a fraction of the way from one joint to the next they
   * land correctly on any humanoid, at any scale, and the tube is aimed along the segment it wraps.
   */
  const joints = (from: string, to: string): { a: TransformNode; b: TransformNode; pa: Vector3; pb: Vector3 } | null => {
    const a: TransformNode | null = boneNode(skeleton, from), b: TransformNode | null = boneNode(skeleton, to);
    if (!a || !b) return null;
    a.computeWorldMatrix(true); b.computeWorldMatrix(true);
    return { a, b, pa: a.getAbsolutePosition(), pb: b.getAbsolutePosition() };
  };
  /** Hang `mesh` on `parent` with its local +y running from world `p0` to `p1`, centred between them. */
  const placeAlong = (parent: TransformNode, p0: Vector3, p1: Vector3, mesh: Mesh): void => {
    const inv = Matrix.Invert(parent.getWorldMatrix());
    mesh.parent = parent;
    mesh.position.copyFrom(Vector3.TransformCoordinates(Vector3.Center(p0, p1), inv));
    // aim the tube down its line, in the bone's own space
    const axis = Vector3.TransformNormal(p1.subtract(p0).normalize(), inv).normalize();
    mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(new Vector3(0, 1, 0), axis, new Quaternion());
  };
  const placeOnSegment = (j: NonNullable<ReturnType<typeof joints>>, t: number, mesh: Mesh): void => {
    const c = Vector3.Lerp(j.pa, j.pb, t), d = j.pb.subtract(j.pa).scale(0.01);
    placeAlong(j.a, c.subtract(d), c.add(d), mesh);
  };
  const onSegment = (from: string, to: string, t: number, mesh: Mesh): boolean => {
    const j = joints(from, to);
    if (!j) { mesh.dispose(); return false; }
    placeOnSegment(j, t, mesh);
    made.push(mesh);
    return true;
  };

  // THE SKIN THE TUBES ARE MEASURED ON: the kit body's skin mesh under this root, CPU-skinned once in the pose it holds
  // now (the same math bodyMask measures the garments with). A roster rig without a `Body` mesh, or a body still shrunk
  // in its spawn-in tween, reads null and the tube takes the reference sizes (and a refit later, below).
  const bodyMesh = root ? ((root.getChildMeshes(false).find((m) => isBodyMesh(m.name) && (m as Mesh).skeleton) as Mesh | undefined) ?? null) : null;
  let skin: Float32Array | null | undefined;
  const skinP = (): Float32Array | null => {
    if (skin !== undefined) return skin;
    try { skin = bodyMesh && !bodyMesh.isDisposed() && !isShrunk(bodyMesh) ? (skinnedWorld(bodyMesh)?.P ?? null) : null; } catch { skin = null; }
    return skin;
  };
  // THE LIMB'S OWN SKIN, BY ITS WEIGHTS. A slab across the upper arm near the armpit cuts the torso too, one across the ankle
  // cuts the instep, one across the elbow the forearm — and the skin is continuous into all of them, so a radius read off
  // "every point in the slab" ran out to the cap (14 cm rings on every tube, measured on the dev body). The skin that
  // belongs to a segment is the skin that rides its parent bone: vertices with at least LIMB_WEIGHT on it. Low enough to
  // reach the joint at the far end (the elbow's skin is half ForeArm, the ankle's half Foot — at 0.4 the ring at 97 % of the
  // upper arm found under eight points and every arm tube fell back to the reference sizes), high enough that the instep
  // (Foot) and the flank (Spine) stay out.
  const LIMB_WEIGHT = 0.25;
  const limbCache = new Map<string, Float32Array | null>();
  const limbPoints = (bone: string): Float32Array | null => {
    const P = skinP(); if (!P || !bodyMesh?.skeleton) return null;
    const hit = limbCache.get(bone); if (hit !== undefined) return hit;
    const mi = bodyMesh.getVerticesData('matricesIndices'), mw = bodyMesh.getVerticesData('matricesWeights');
    const mie = bodyMesh.getVerticesData('matricesIndicesExtra'), mwe = bodyMesh.getVerticesData('matricesWeightsExtra');
    if (!mi || !mw) { limbCache.set(bone, null); return null; }
    const want = new Set<number>(); bodyMesh.skeleton.bones.forEach((b, i) => { if (bareBoneName(b.name) === bone) want.add(i); });
    if (!want.size) { limbCache.set(bone, null); return null; }
    const out: number[] = [];
    for (let v = 0; v < P.length / 3; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++) { if (want.has(mi[v * 4 + k])) w += mw[v * 4 + k]; if (mie && mwe && want.has(mie[v * 4 + k])) w += mwe[v * 4 + k]; }
      if (w >= LIMB_WEIGHT) out.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    }
    const arr = out.length ? new Float32Array(out) : null;
    limbCache.set(bone, arr);
    return arr;
  };
  type TubeKind = keyof typeof TUBE_SPANS;
  interface TubeSpec { kind: TubeKind; name: string; from: string; to: string; mat: PBRMaterial }
  const tubes: { spec: TubeSpec; mesh: Mesh; fitted: boolean }[] = [];
  const measure = (spec: TubeSpec, P: Float32Array | null): TubeFit | null => {
    const j = P ? joints(spec.from, spec.to) : null;
    const limb = j ? limbPoints(spec.from) : null;
    return j && limb ? tubeFit(limb, j.pa, j.pb, TUBE_SPANS[spec.kind]) : null;
  };
  /** A tube between two joints: its rings the fit's — centred on the limb's skin, which is not the bone (the calf sits behind
   *  the shin) — or the reference sizes on the bone; its length the span's share of the LIVE joint-to-joint distance. */
  const buildTube = (spec: TubeSpec, fit: TubeFit | null): Mesh | null => {
    const j = joints(spec.from, spec.to);
    if (!j) return null;
    const seg = Vector3.Distance(j.pa, j.pb);
    if (!(seg > 0.02)) return null;
    const span = TUBE_SPANS[spec.kind];
    const Wm = j.a.getWorldMatrix().m; const s = Math.hypot(Wm[0], Wm[1], Wm[2]) || 1;   // bone-local units per world metre
    const [dTop, dBot] = TUBE_DEFAULTS[spec.kind];
    // a measured ring outside 0.6–1.4× the reference is a slab that read the next body part (a roster rig's ankle ring came
    // out 10 cm — the instep, on a rig whose shin weights run into the foot; its calf ring 9.6): that ring takes the
    // reference size instead. The kit male measures inside the band on every tube (arm 6.9/5.6, shin 7.4/4.5 cm).
    const sane = (r: number | undefined, ref: number): number => { const d = ref * k; return r != null && r * 2 >= d * 0.6 && r * 2 <= d * 1.4 ? r * 2 : d; };
    const top = (fit ? sane(fit.r0, dTop) : dTop * k) / s, bottom = (fit ? sane(fit.r1, dBot) : dBot * k) / s;
    const p0 = fit ? new Vector3(fit.c0.x, fit.c0.y, fit.c0.z) : Vector3.Lerp(j.pa, j.pb, span.from);
    const p1 = fit ? new Vector3(fit.c1.x, fit.c1.y, fit.c1.z) : Vector3.Lerp(j.pa, j.pb, span.to);
    const length = Vector3.Distance(p0, p1) / s;
    const m = MeshBuilder.CreateCylinder(spec.name, { diameterTop: top, diameterBottom: bottom, height: length, tessellation: 16, cap: Mesh.NO_CAP }, scene);
    m.material = spec.mat; m.isPickable = false; m.receiveShadows = false;
    placeAlong(j.a, p0, p1, m);
    const meta: TubeMeta = { kind: spec.kind, from: spec.from, to: spec.to, built: { ...span }, span: { ...span }, seg, r0: top * s / 2, r1: bottom * s / 2, measured: !!fit, pos0: [m.position.x, m.position.y, m.position.z], hidden: null };
    m.metadata = { ...(m.metadata ?? {}), felAccessory: { tube: meta } };
    made.push(m);
    return m;
  };
  // Built at the reference sizes NOW and measured AFTER the first render (below). The skin is only worth reading after a
  // render: measured at spawn, and inside a frame before the mode's own arm IK has run, the joints stood 8 cm from where
  // the skinning matrices (the previous frame's final pose) put the skin, and the arm's rings read nothing at all.
  const tube = (spec: TubeSpec): void => {
    const m = buildTube(spec, null);
    if (m) tubes.push({ spec, mesh: m, fitted: false });
  };
  const tubeLine = (t: { spec: TubeSpec; mesh: Mesh; fitted: boolean }): string => {
    const meta = (t.mesh.metadata as { felAccessory?: { tube?: TubeMeta } })?.felAccessory?.tube;
    return `${t.spec.kind} ${meta ? `${(meta.r0 * 100).toFixed(1)}/${(meta.r1 * 100).toFixed(1)} cm on ${(meta.seg * 100).toFixed(0)} cm` : '?'} ${t.fitted ? 'measured' : 'reference'}`;
  };

  try {
    const accent = set.accent;
    const dark = accent.scale(0.45);
    const mat = (n: string, c: Color3, k: 'jersey' | 'sock' | 'shoes' | 'band') => { const m = accessoryMaterial(scene, `${tag}_${n}`, c, k); mats.push(m); return m; };

    for (const id of set.items) {
      if (id === 'headband') {
        // across the brow, not around the crown: a headband sits low and tips back a few degrees
        // ACROSS THE BROW. The Head bone's origin is at the TOP OF THE NECK on this rig, not in the middle of the
        // skull, so +0.055 put the band round the base of the skull like a neck pillow — which is what a close crop
        // showed. The brow is about 0.13 above that origin and a little forward.
        const m = band(scene, `${tag}_headband`, 0.175, 0.026, mat('headband', accent, 'band'), k);
        on('Head', m, new Vector3(0, 0.132, 0.018), new Vector3(0.14, 0, 0));
      } else if (id === 'wristbands') {
        for (const s of ['Left', 'Right'] as const) {
          const m = band(scene, `${tag}_wrist_${s}`, 0.085, 0.028, mat(`wrist_${s}`, accent, 'band'), k);
          onSegment(`${s}ForeArm`, `${s}Hand`, 0.86, m);
        }
      } else if (id === 'armsleeve') {
        // THE SHOOTING SLEEVE: below the deltoid to the elbow, then the elbow to above the wrist, on ONE arm — a compression
        // fabric, so it is dark. It never starts inside the shoulder (TUBE_SPANS): the eye's teal clip through the tee.
        const s = set.side;
        tube({ kind: 'armsleeve', name: `${tag}_armsleeve`, from: `${s}Arm`, to: `${s}ForeArm`, mat: mat('armsleeve', dark, 'sock') });
        tube({ kind: 'armsleeve2', name: `${tag}_armsleeve2`, from: `${s}ForeArm`, to: `${s}Hand`, mat: mat('armsleeve2', dark, 'sock') });
      } else if (id === 'legsleeve') {
        const s = set.side === 'Left' ? 'Right' : 'Left';   // the opposite leg to the sleeve arm: it reads as deliberate
        tube({ kind: 'legsleeve', name: `${tag}_legsleeve`, from: `${s}Leg`, to: `${s}Foot`, mat: mat('legsleeve', dark, 'sock') });
      } else if (id === 'crewsocks') {
        for (const s of ['Left', 'Right'] as const) {
          tube({ kind: 'crewsocks', name: `${tag}_sock_${s}`, from: `${s}Leg`, to: `${s}Foot`, mat: mat(`sock_${s}`, new Color3(0.94, 0.94, 0.92), 'sock') });
        }
      } else if (id === 'chain') {
        // A CHAIN HANGS ON THE CHEST. At 0.15 m on the NECK bone it read as a white surgical collar in the frame —
        // too big, too high, and blown out to white by metallic 0.9 under the IBL. It sits at the collarbone now, on
        // the chest bone, small, tipped forward the way a chain lies on a body rather than clamped round a throat.
        const m = band(scene, `${tag}_chain`, 0.125, 0.011, mat('chain', new Color3(0.72, 0.56, 0.16), 'shoes'), k);
        const mt = m.material as PBRMaterial;
        mt.metallic = 0.7; mt.roughness = 0.34; mt.bumpTexture = null;   // the one thing here that is not cloth
        if (!on('Spine2', m, new Vector3(0, 0.15, 0.035), new Vector3(0.42, 0, 0))) {
          const m2 = band(scene, `${tag}_chain`, 0.125, 0.011, mat('chain2', new Color3(0.72, 0.56, 0.16), 'shoes'), k);
          (m2.material as PBRMaterial).metallic = 0.7; (m2.material as PBRMaterial).bumpTexture = null;
          on('Spine', m2, new Vector3(0, 0.34, 0.035), new Vector3(0.42, 0, 0));   // a rig without a chest bone
        }
      }
    }
  } catch { /* a rig that cannot take them simply does not get them */ }

  // A TUBE THE SKIN COULD NOT SIZE YET is rebuilt on the first frame it can be (a materialise tween is ~20 frames; a rig
  // poses on its first render), then the wardrobe's trim runs again over the rebuilt tubes.
  // THE TUBES ARE MEASURED AFTER A RENDER — the joints and the skinning matrices agree only then (bodyMask measures the
  // garments at the same moment for the same reason) — on the first frame the body is at its real size, then rebuilt on
  // the limb's own skin and handed to the wardrobe's trim. A body that cannot be read in REFIT_WAIT_FRAMES keeps the
  // reference sizes and says so.
  if (bodyMesh && tubes.some((t) => !t.fitted)) {
    let waited = 0;
    const late = (): void => {
      try {
        if (disposed || bodyMesh.isDisposed()) return;
        skin = undefined; limbCache.clear();
        const P = isShrunk(bodyMesh) ? null : skinP();
        let changed = false, pending = false;
        for (const t of tubes) {
          if (t.fitted || t.mesh.isDisposed()) continue;
          const fit = P ? measure(t.spec, P) : null;
          if (!fit) { pending = true; continue; }
          const nm = buildTube(t.spec, fit); if (!nm) { t.fitted = true; continue; }
          const i = made.indexOf(t.mesh); if (i >= 0) made.splice(i, 1);
          t.mesh.dispose(); t.mesh = nm; t.fitted = true; changed = true;
        }
        if (changed) { console.info(`[FEL-ACC] ${tag}: measured after ${waited + 1} frame(s) — ${tubes.map(tubeLine).join(' · ')}`); scheduleBodyMask([bodyMesh]); }
        if (pending && waited++ < REFIT_WAIT_FRAMES) scene.onAfterRenderObservable.addOnce(late);
        else if (pending) console.warn(`[FEL-ACC] ${tag}: ${tubes.filter((t) => !t.fitted).map((t) => t.spec.kind).join(', ')} kept the reference sizes — the skin could not be read in ${REFIT_WAIT_FRAMES} frames (${P ? `${P.length / 3} skin points, shrunk ${isShrunk(bodyMesh)}` : 'no skin'})`);
      } catch (e) { console.warn(`[FEL-ACC] ${tag}: refit skipped: ${String((e as Error)?.message ?? e).slice(0, 120)}`); }
    };
    scene.onAfterRenderObservable.addOnce(late);
  }

  return () => {
    disposed = true;
    for (const m of made) { try { m.dispose(); } catch { /* already gone with the scene */ } }
    for (const m of mats) { try { m.dispose(); } catch { /* already gone */ } }
    made.length = 0; mats.length = 0; tubes.length = 0;
  };
}

// ── Who wears what ────────────────────────────────────────────────────────────
//
// Owner's call: rivals get a NAMED signature they keep every night; NPCs get variety so a row of five is five people.
// Both come out of the same deterministic function, because "varied" must not mean "different every time you look at
// it" — a body that re-spawns between rounds has to come back wearing what it had on.

/**
 * A small deterministic hash: the same name or seed always dresses the same way.
 *
 * THE FINALISER IS NOT OPTIONAL. Plain FNV-1a avalanches badly in its HIGH bits — the last byte of the key barely
 * moves them — and this reads the top bits by dividing by 2³². Without the finishing mix, `body_0` … `body_7` all
 * landed in the SAME bucket: eight NPCs standing in a row wearing identical kit, which is the precise thing these
 * exist to prevent. Caught by the test below, not by looking at it.
 */
export function seedOf(key: string | number): number {
  const s = String(key);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The looks an NPC can be dealt, coarsest first. Nobody gets everything: a player wearing all six is a Christmas tree. */
const NPC_LOOKS: readonly (readonly AccessoryId[])[] = [
  [],
  ['crewsocks'],
  ['headband'],
  ['wristbands', 'crewsocks'],
  ['armsleeve', 'crewsocks'],
  ['headband', 'wristbands'],
  ['armsleeve', 'legsleeve'],
  ['chain', 'crewsocks'],
  ['headband', 'armsleeve', 'crewsocks'],
];

// ACCENTS ARE SATURATED ON PURPOSE. `#f4f1de` was in here, and a near-white band on a light body reads as a surgical
// dressing rather than a choice — which is exactly what I saw in the rc46 frame and briefly mistook for a colour
// override. (There was none: the material held the accent it was dealt. The accent was the problem.)
const ACCENTS = ['#e63946', '#f1a208', '#2a9d8f', '#457b9d', '#8d5bd6', '#e76f51', '#1d3557', '#111418'];

/**
 * What this character wears. `key` is whatever identifies them — a rival's name, an NPC's index, the player's id — and
 * the same key always produces the same look.
 */
export function accessoriesFor(key: string | number, opts: { accent?: string; maxItems?: number } = {}): AccessorySet {
  const r = seedOf(key);
  const r2 = seedOf(`${key}#2`);
  const items = NPC_LOOKS[Math.floor(r * NPC_LOOKS.length) % NPC_LOOKS.length];
  const capped = opts.maxItems != null ? items.slice(0, opts.maxItems) : items;
  return {
    items: capped,
    accent: Color3.FromHexString(opts.accent ?? ACCENTS[Math.floor(r2 * ACCENTS.length) % ACCENTS.length]),
    side: r2 > 0.5 ? 'Right' : 'Left',
  };
}

/**
 * The named rivals' signatures. A rival is somebody, and somebody wears the same thing every night — this is the
 * difference between an opponent and a body with a tint. Anyone not named here falls through to `accessoriesFor`,
 * which still gives them a look they keep.
 */
export const RIVAL_LOOKS: Readonly<Record<string, { items: readonly AccessoryId[]; accent: string; side: Side }>> = {
  SILK: { items: ['headband', 'armsleeve'], accent: '#8d5bd6', side: 'Right' },
  DOC: { items: ['wristbands', 'crewsocks'], accent: '#f1a208', side: 'Right' },
  MAC: { items: ['chain', 'crewsocks'], accent: '#e63946', side: 'Left' },
  REIGN: { items: ['headband', 'wristbands', 'crewsocks'], accent: '#2a9d8f', side: 'Right' },
  PRIME: { items: ['armsleeve', 'legsleeve', 'chain'], accent: '#1d3557', side: 'Left' },
};

/** A rival's signature if they have one, otherwise the deterministic look their name earns them. */
export function lookFor(name: string): AccessorySet {
  const sig = RIVAL_LOOKS[name.toUpperCase()];
  if (sig) return { items: sig.items, accent: Color3.FromHexString(sig.accent), side: sig.side };
  return accessoriesFor(name);
}
