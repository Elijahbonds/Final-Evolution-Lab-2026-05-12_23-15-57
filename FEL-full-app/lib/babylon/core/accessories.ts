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
import { Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, Vector3 } from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from '../anim/boneLookup';
import { applyFabric } from './fabric';

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

/** A tube around a limb: the shape almost every one of these is. */
function sleeve(scene: Scene, name: string, top: number, bottom: number, length: number, mat: PBRMaterial, k = 1): Mesh {
  const m = MeshBuilder.CreateCylinder(name, { diameterTop: top * k, diameterBottom: bottom * k, height: length * k, tessellation: 12, cap: Mesh.NO_CAP }, scene);
  m.material = mat; m.isPickable = false; m.receiveShadows = false;
  return m;
}

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
  const onSegment = (from: string, to: string, t: number, mesh: Mesh): boolean => {
    const a: TransformNode | null = boneNode(skeleton, from), b: TransformNode | null = boneNode(skeleton, to);
    if (!a || !b) { mesh.dispose(); return false; }
    a.computeWorldMatrix(true); b.computeWorldMatrix(true);
    const pa = a.getAbsolutePosition(), pb = b.getAbsolutePosition();
    const world = Vector3.Lerp(pa, pb, t);
    const inv = Matrix.Invert(a.getWorldMatrix());
    mesh.parent = a;
    mesh.position.copyFrom(Vector3.TransformCoordinates(world, inv));
    // aim the tube down the segment, in the bone's own space
    const axis = Vector3.TransformNormal(pb.subtract(pa).normalize(), inv).normalize();
    mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(new Vector3(0, 1, 0), axis, new Quaternion());
    made.push(mesh);
    return true;
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
        // THE SHOOTING SLEEVE: shoulder to wrist on ONE arm, tapering, and it is a compression fabric so it is dark
        const s = set.side;
        const m = sleeve(scene, `${tag}_armsleeve`, 0.115, 0.082, 0.30, mat('armsleeve', dark, 'sock'), k);
        onSegment(`${s}Arm`, `${s}ForeArm`, 0.52, m);
        const m2 = sleeve(scene, `${tag}_armsleeve2`, 0.082, 0.070, 0.22, mat('armsleeve2', dark, 'sock'), k);
        onSegment(`${s}ForeArm`, `${s}Hand`, 0.46, m2);
      } else if (id === 'legsleeve') {
        const s = set.side === 'Left' ? 'Right' : 'Left';   // the opposite leg to the sleeve arm: it reads as deliberate
        const m = sleeve(scene, `${tag}_legsleeve`, 0.155, 0.115, 0.26, mat('legsleeve', dark, 'sock'), k);
        onSegment(`${s}Leg`, `${s}Foot`, 0.42, m);
      } else if (id === 'crewsocks') {
        for (const s of ['Left', 'Right'] as const) {
          const m = sleeve(scene, `${tag}_sock_${s}`, 0.10, 0.092, 0.15, mat(`sock_${s}`, new Color3(0.94, 0.94, 0.92), 'sock'), k);
          onSegment(`${s}Leg`, `${s}Foot`, 0.80, m);
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

  return () => {
    for (const m of made) { try { m.dispose(); } catch { /* already gone with the scene */ } }
    for (const m of mats) { try { m.dispose(); } catch { /* already gone */ } }
    made.length = 0; mats.length = 0;
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
