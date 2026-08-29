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

import {
  Bone, Matrix, Quaternion, Skeleton, TransformNode, Vector3,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

/** Mixamo-style bone names (NO 'mixamorig:' prefix) — the exact vocabulary the
 *  authored-clip infra, ballRig and GroundLock look up. */
export interface JointSpec {
  name: string;
  parent: string | null;   // null = child of root
  offset: [number, number, number]; // local position in the PARENT's frame (meters)
}

// Anatomical rest layout. Offsets are along clean axes so limb capsules orient
// trivially. Hips at y=1.02; feet land at ~y=0; head crown ~1.76.
export const JOINTS: JointSpec[] = [
  { name: 'Hips',          parent: null,          offset: [0, 1.02, 0] },
  { name: 'Spine',         parent: 'Hips',        offset: [0, 0.14, 0] },
  { name: 'Spine2',        parent: 'Spine',       offset: [0, 0.18, 0] },
  { name: 'Neck',          parent: 'Spine2',      offset: [0, 0.16, 0] },
  { name: 'Head',          parent: 'Neck',        offset: [0, 0.12, 0] },

  { name: 'LeftShoulder',  parent: 'Spine2',      offset: [0.05, 0.10, 0] },
  { name: 'LeftArm',       parent: 'LeftShoulder',offset: [0.13, 0, 0] },
  { name: 'LeftForeArm',   parent: 'LeftArm',     offset: [0, -0.27, 0] },
  { name: 'LeftHand',      parent: 'LeftForeArm', offset: [0, -0.25, 0] },

  { name: 'RightShoulder', parent: 'Spine2',      offset: [-0.05, 0.10, 0] },
  { name: 'RightArm',      parent: 'RightShoulder',offset: [-0.13, 0, 0] },
  { name: 'RightForeArm',  parent: 'RightArm',    offset: [0, -0.27, 0] },
  { name: 'RightHand',     parent: 'RightForeArm',offset: [0, -0.25, 0] },

  { name: 'LeftUpLeg',     parent: 'Hips',        offset: [0.10, -0.06, 0] },
  { name: 'LeftLeg',       parent: 'LeftUpLeg',   offset: [0, -0.44, 0] },
  { name: 'LeftFoot',      parent: 'LeftLeg',     offset: [0, -0.44, 0] },

  { name: 'RightUpLeg',    parent: 'Hips',        offset: [-0.10, -0.06, 0] },
  { name: 'RightLeg',      parent: 'RightUpLeg',  offset: [0, -0.44, 0] },
  { name: 'RightFoot',     parent: 'RightLeg',    offset: [0, -0.44, 0] },
];

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
  for (const j of JOINTS) {
    const n = new TransformNode(`${j.name}_${id}`, scene);
    n.rotationQuaternion = Quaternion.Identity();   // clean neutral rest
    n.position = new Vector3(j.offset[0], j.offset[1], j.offset[2]);
    n.parent = j.parent ? nodes[j.parent] : root;
    nodes[j.name] = n;
    offsets[j.name] = j.offset;
  }

  // 2) A real Skeleton whose Bones are pure name handles linked to the nodes.
  //    Bone matrices are identity — consumers read the LINKED node's transform,
  //    never the bone matrix, so this is sufficient and cannot desync.
  const skeleton = new Skeleton(`procSkel_${id}`, `procSkel_${id}`, scene);
  const bones: Record<string, Bone> = {};
  for (const j of JOINTS) {
    const parentBone = j.parent ? bones[j.parent] : undefined;
    const bone = new Bone(j.name, skeleton, parentBone, Matrix.Identity());
    bone.linkTransformNode(nodes[j.name]);
    bones[j.name] = bone;
  }

  return { root, nodes, skeleton, offsets };
}
