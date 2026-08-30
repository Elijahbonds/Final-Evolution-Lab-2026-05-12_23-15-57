// proceduralRig — builds a code-generated humanoid rig with ZERO asset
// dependency. It creates a hierarchy of TransformNodes (the things that are
// actually animated + that all consumers read) PLUS a real Skeleton whose
// Bones are name-linked to those nodes, so every existing name-lookup
// (clipBuilder, ballRig.attachBallToHand, GroundLock.track) resolves exactly
// as it did for the GLB — but without any vertex skinning, so the skinning
// artifact class that broke the Meshy asset simply cannot occur here.
//
// Rest pose = arms straight DOWN at the sides, legs straight, ~1.76m tall so
// the camera framing tuned for the ~1.8m hero still frames it correctly. Every
// node's rotationQuaternion is identity at rest, so authored clip angles are
// measured from a clean neutral standing pose (no arms-out bind to solve away).
//
// ── GATE 0 (Mixamo rig standard) ────────────────────────────────────────────
// The skeleton is the FULL 65-bone Mixamo hierarchy and its Bones carry the
// 'mixamorig:' prefix, which is what Gate0Validator checks. Two deliberate
// separations make that possible without rewriting every clip and mesh:
//
//   • BONES are prefixed ('mixamorig:LeftArm') — this is what Gate 0 reads.
//   • NODES, the `nodes` map key, and TransformNode names stay UNPREFIXED
//     ('LeftArm', 'LeftArm_p3') — this is what proceduralMesh, proceduralClips,
//     mirrored-clips, ballRig and GroundLock look up. They are untouched.
//
// Bones also carry a real rest matrix (their local offset) rather than
// Identity. Gate 0 verifies Y-up by asserting a "Shoulder" bone sits above the
// root; with identity matrices every bone reports absolute position (0,0,0) and
// that check can never pass, no matter how many bones exist.
//
// Honest scope note: Gate0Validator's "T-pose" test is an approximation — it
// only asserts the root bone is not displaced in XZ (its own comment says so).
// This rig satisfies that, but its rest pose is arms-DOWN, not a true T-pose.
// Changing the rest pose would invalidate every authored clip angle, so it is
// deliberately unchanged. Do not read a Gate 0 pass as "this is a T-pose rig".

import {
  Bone, Matrix, Quaternion, Skeleton, TransformNode, Vector3,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

/** Mixamo bone-name prefix required by Gate 0. Applied to BONES only. */
export const MIXAMO_PREFIX = 'mixamorig:';

/** Mixamo-standard joint names (stored WITHOUT the prefix — the vocabulary the
 *  authored-clip infra, ballRig and GroundLock look up). */
export interface JointSpec {
  name: string;
  parent: string | null;   // null = child of root
  offset: [number, number, number]; // local position in the PARENT's frame (meters)
}

/** Build the 4-bone chain Mixamo uses for every finger. */
function finger(
  side: 'Left' | 'Right', digit: string, hand: string,
  base: [number, number, number], step: [number, number, number],
): JointSpec[] {
  const p = `${side}Hand${digit}`;
  return [
    { name: `${p}1`, parent: hand, offset: base },
    { name: `${p}2`, parent: `${p}1`, offset: step },
    { name: `${p}3`, parent: `${p}2`, offset: step },
    { name: `${p}4`, parent: `${p}3`, offset: step },
  ];
}

/** Arm + hand + all five fingers for one side. `s` is the X-axis sign. */
function arm(side: 'Left' | 'Right', s: number): JointSpec[] {
  const hand = `${side}Hand`;
  return [
    { name: `${side}Shoulder`, parent: 'Spine2', offset: [s * 0.05, 0.10, 0] },
    { name: `${side}Arm`, parent: `${side}Shoulder`, offset: [s * 0.13, 0, 0] },
    { name: `${side}ForeArm`, parent: `${side}Arm`, offset: [0, -0.27, 0] },
    { name: hand, parent: `${side}ForeArm`, offset: [0, -0.25, 0] },
    // Fingers hang along -Y because the rest pose is arms-down.
    ...finger(side, 'Thumb', hand, [s * 0.02, -0.02, 0.02], [s * 0.012, -0.022, 0.012]),
    ...finger(side, 'Index', hand, [s * 0.03, -0.08, 0.015], [0, -0.03, 0]),
    ...finger(side, 'Middle', hand, [s * 0.01, -0.085, 0.005], [0, -0.032, 0]),
    ...finger(side, 'Ring', hand, [s * -0.01, -0.08, -0.005], [0, -0.029, 0]),
    ...finger(side, 'Pinky', hand, [s * -0.03, -0.07, -0.015], [0, -0.024, 0]),
  ];
}

/** Leg chain including the toe bones Mixamo ships. */
function leg(side: 'Left' | 'Right', s: number): JointSpec[] {
  return [
    { name: `${side}UpLeg`, parent: 'Hips', offset: [s * 0.10, -0.06, 0] },
    { name: `${side}Leg`, parent: `${side}UpLeg`, offset: [0, -0.44, 0] },
    { name: `${side}Foot`, parent: `${side}Leg`, offset: [0, -0.44, 0] },
    { name: `${side}ToeBase`, parent: `${side}Foot`, offset: [0, -0.06, 0.12] },
    { name: `${side}Toe_End`, parent: `${side}ToeBase`, offset: [0, 0, 0.08] },
  ];
}

// Anatomical rest layout. Offsets are along clean axes so limb capsules orient
// trivially. Hips at y=1.02; feet land at ~y=0; head crown ~1.76.
//
// Spine1 is new (Mixamo splits the spine into Spine/Spine1/Spine2). The three
// offsets still sum to the original Spine→Spine2 rise of 0.32m, so Spine2 —
// which the chest, back number and shoulders all hang off — is exactly where it
// was before. See CHEST_RISE in proceduralMesh for the segment that spans it.
export const JOINTS: JointSpec[] = [
  { name: 'Hips', parent: null, offset: [0, 1.02, 0] },
  { name: 'Spine', parent: 'Hips', offset: [0, 0.14, 0] },
  { name: 'Spine1', parent: 'Spine', offset: [0, 0.09, 0] },
  { name: 'Spine2', parent: 'Spine1', offset: [0, 0.09, 0] },
  { name: 'Neck', parent: 'Spine2', offset: [0, 0.16, 0] },
  { name: 'Head', parent: 'Neck', offset: [0, 0.12, 0] },
  { name: 'HeadTop_End', parent: 'Head', offset: [0, 0.19, 0] },

  ...arm('Left', 1),
  ...arm('Right', -1),
  ...leg('Left', 1),
  ...leg('Right', -1),
];

/** Total rise from Spine to Spine2, for meshes that span the whole trunk. */
export const SPINE_TO_SPINE2: [number, number, number] = [0, 0.18, 0];

export interface ProceduralRig {
  root: TransformNode;
  nodes: Record<string, TransformNode>;
  skeleton: Skeleton;
  /** local child offset in the parent frame, by joint name (for mesh builder). */
  offsets: Record<string, [number, number, number]>;
}

/** Build the node hierarchy + a name-linked Skeleton. No geometry here. */
export function buildRig(scene: Scene, id: string): ProceduralRig {
  const root = new TransformNode(`procAthlete_${id}`, scene);
  root.rotationQuaternion = Quaternion.Identity();

  const nodes: Record<string, TransformNode> = {};
  const offsets: Record<string, [number, number, number]> = {};

  // 1) TransformNodes (parents created before children — JOINTS is ordered).
  //    Names stay unprefixed: these are what every consumer looks up.
  for (const j of JOINTS) {
    const n = new TransformNode(`${j.name}_${id}`, scene);
    n.rotationQuaternion = Quaternion.Identity();   // clean neutral rest
    n.position = new Vector3(j.offset[0], j.offset[1], j.offset[2]);
    n.parent = j.parent ? nodes[j.parent] : root;
    nodes[j.name] = n;
    offsets[j.name] = j.offset;
  }

  // 2) A real Skeleton whose Bones are name handles linked to the nodes.
  //    Consumers read the LINKED node's transform, never the bone matrix, so
  //    the rest matrix here is purely so the skeleton describes itself honestly
  //    — and so Gate 0's absolute-position checks have real values to read.
  const skeleton = new Skeleton(`procSkel_${id}`, `procSkel_${id}`, scene);
  const bones: Record<string, Bone> = {};
  for (const j of JOINTS) {
    const parentBone = j.parent ? bones[j.parent] : undefined;
    const rest = Matrix.Translation(j.offset[0], j.offset[1], j.offset[2]);
    const bone = new Bone(`${MIXAMO_PREFIX}${j.name}`, skeleton, parentBone, rest);
    bone.linkTransformNode(nodes[j.name]);
    bones[j.name] = bone;
  }

  return { root, nodes, skeleton, offsets };
}
