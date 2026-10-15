// crowdClips — what a fan in the stands does (w3-crowds, A9.9).
//
// The five crowd bodies (`public/models/crowd/*.glb`) carry no clips (`builtAtSpawn`), so the vocabulary is AUTHORED, the way
// the quiz podium's and the kart driver's are (anim/poseClip.ts): torso, legs and head as bone eulers through the shared bind
// frame. The baker (crowdBake.ts) builds each clip on the live skeleton
// once, samples it into the vertex-animation texture and throws the animation away — a fan never runs a clip on the CPU.
//
// Ten clips in two postures, each starting and ending on its posture's REST so that any clip may follow any other of the
// same posture without a pop (crowdVat.ts switches a fan from one range to the next at a row boundary):
//   seated   — sit_idle (loop), sit_clap (loop), sit_cheer, sit_groan, rise (→ standing)
//   standing — stand_idle (loop), stand_clap (loop), stand_cheer (loop: a jumping cheer), stand_groan, sit_down (→ seated)
//
// THE ARMS DO NOT MOVE, and that is the asset, not a choice. The five bodies were cut from one Meshy sheet with their arms
// down (one holds a drink) and skin-transferred from the T-pose hero; the transfer weighted the hanging arms to the TORSO
// (measured off the GLBs: of ~5,000 vertices a body, the forearms and hands carry 0–40 between them, the spine 1,000–2,000).
// Rotating an arm bone moves a shoulder's worth of skin and tears it. So every reaction is legs, hips, spine and head — which
// is most of how a crowd reads from the field anyway: a seated fan who comes up off the seat and rocks back is cheering; a
// standing one who bounces is jumping; a body that folds forward with its head down is groaning; a rhythmic bob is applause.
// Arm-raising cheers and real claps need the bodies re-skinned: [ART].
//
// Sign conventions, from the seated driver (anim/authored/seated.ts) and the podium: UpLeg[0] NEGATIVE raises the thigh,
// Leg[0] POSITIVE bends the knee, Spine/Neck[0] POSITIVE pitches forward, [1] turns, [2] tilts. No wrist targets: the arms
// keep their bind pose, carried by the torso.
//
// Heights. Seated, the pelvis drops SEAT_DROP: thighs level, shins down — the hip joint sits ~0.53 m over the feet, the seat
// under it ~0.45 m (`SEAT_TOP_M`, the bench crowdStands lays under a seated row).

import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../../anim/poseClip';
import type { CrowdClipName } from './crowdVat';

/** How far the hips drop when a fan sits (m). */
export const SEAT_DROP = 0.42;
/** The seat's top over the fan's feet (m): where BakedCrowd lays the bench. */
export const SEAT_TOP_M = 0.45;

const SEATED_LEGS: Record<string, Deg3> = { LeftUpLeg: [-86, 0, 7], RightUpLeg: [-86, 0, -7], LeftLeg: [84, 0, 0], RightLeg: [84, 0, 0] };
/** Up off the seat: thighs at ~55°, weight over the feet (a seated fan's leap, and the middle of a rise). */
const PERCH_LEGS: Record<string, Deg3> = { LeftUpLeg: [-52, 0, 6], RightUpLeg: [-52, 0, -6], LeftLeg: [56, 0, 0], RightLeg: [56, 0, 0] };
const STAND_LEGS: Record<string, Deg3> = { LeftUpLeg: [-6, 0, 4], LeftLeg: [10, 0, 0], RightUpLeg: [-6, 0, -4], RightLeg: [10, 0, 0] };
const BOUNCE_LEGS: Record<string, Deg3> = { LeftUpLeg: [-26, 0, 5], LeftLeg: [44, 0, 0], RightUpLeg: [-26, 0, -5], RightLeg: [44, 0, 0] };
const TOE_LEGS: Record<string, Deg3> = { LeftUpLeg: [-2, 0, 4], LeftLeg: [2, 0, 0], RightUpLeg: [-2, 0, -4], RightLeg: [2, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0] };

interface K { spine?: number; twist?: number; neck?: Deg3; y?: number; legs?: Record<string, Deg3>; hips?: Deg3; hold?: boolean }
const sitKey = (t: number, o: K = {}): PoseKey => ({
  t, bones: { Hips: o.hips ?? [0, 0, 0], Spine: [o.spine ?? 6, o.twist ?? 0, 0], Neck: o.neck ?? [0, 0, 0], ...(o.legs ?? SEATED_LEGS) },
  hipsY: -SEAT_DROP + (o.y ?? 0), hold: o.hold,
});
const standKey = (t: number, o: K = {}): PoseKey => ({
  t, bones: { Hips: o.hips ?? [0, 0, 0], Spine: [o.spine ?? 3, o.twist ?? 0, 0], Neck: o.neck ?? [0, 0, 0], ...(o.legs ?? STAND_LEGS) },
  hipsY: o.y ?? 0, hold: o.hold,
});

// ── seated ───────────────────────────────────────────────────────────────────────────────────────────────────────
function sitIdle(): PoseKey[] {
  // a breath, a glance one way, a glance back: a person watching, not a statue
  return [sitKey(0), sitKey(1.0, { spine: 8, neck: [2, 10, 0], y: 0.004 }), sitKey(2.0, { spine: 6.5, neck: [-2, -8, 0] }), sitKey(3.0)];
}
function sitClap(): PoseKey[] {
  // applause, as these bodies can give it: a rhythmic rock forward and back with the head nodding on it
  const ks: PoseKey[] = [sitKey(0)];
  [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].forEach((t, i) => ks.push(sitKey(t, { spine: i % 2 ? 4 : 13, neck: [i % 2 ? -6 : 6, 0, 0], y: i % 2 ? 0.01 : 0 })));
  ks.push(sitKey(1.2));
  return ks;
}
function sitCheer(): PoseKey[] {
  // up off the seat, rocked back with the head thrown up, bounced twice, and down
  return [
    sitKey(0),
    sitKey(0.16, { spine: 16, neck: [6, 0, 0], legs: PERCH_LEGS, y: 0.2 }),
    sitKey(0.34, { spine: -12, neck: [-24, 0, 0], legs: PERCH_LEGS, y: 0.27 }),
    sitKey(0.58, { spine: -4, neck: [-14, 8, 0], legs: PERCH_LEGS, y: 0.2 }),
    sitKey(0.82, { spine: -12, neck: [-24, -6, 0], legs: PERCH_LEGS, y: 0.27 }),
    sitKey(1.12, { spine: -2, neck: [-12, 0, 0], legs: PERCH_LEGS, y: 0.18 }),
    sitKey(1.38, { spine: 10, neck: [-2, 0, 0], y: 0.02 }),
    sitKey(1.6),
  ];
}
function sitGroan(): PoseKey[] {
  // thrown back by it, then folded forward with the head hung and shaking
  return [
    sitKey(0),
    sitKey(0.2, { spine: -10, neck: [-18, 0, 0] }),
    sitKey(0.5, { spine: 30, neck: [34, 0, 0], hold: true }),
    sitKey(0.85, { spine: 32, neck: [36, 14, 0] }),
    sitKey(1.15, { spine: 32, neck: [36, -14, 0] }),
    sitKey(1.5, { spine: 18, neck: [16, 0, 0] }),
    sitKey(1.8),
  ];
}

// ── standing ─────────────────────────────────────────────────────────────────────────────────────────────────────
function rise(): PoseKey[] {
  return [sitKey(0), { t: 0.28, bones: { Hips: [0, 0, 0], Spine: [26, 0, 0], Neck: [-12, 0, 0], ...PERCH_LEGS }, hipsY: -0.22 }, standKey(0.6)];
}
function sitDown(): PoseKey[] {
  return [standKey(0), { t: 0.3, bones: { Hips: [0, 0, 0], Spine: [24, 0, 0], Neck: [-10, 0, 0], ...PERCH_LEGS }, hipsY: -0.22 }, sitKey(0.6)];
}
function standIdle(): PoseKey[] {
  return [standKey(0), standKey(1.0, { spine: 4.5, neck: [2, 10, 0], hips: [0, 0, 2], y: -0.006 }), standKey(2.0, { spine: 3.5, neck: [-2, -8, 0], hips: [0, 0, -2] }), standKey(3.0)];
}
function standClap(): PoseKey[] {
  // the applause bounce: a dip at the knees on every beat, the head nodding
  const ks: PoseKey[] = [standKey(0)];
  [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].forEach((t, i) => ks.push(standKey(t, { spine: i % 2 ? 3 : 8, neck: [i % 2 ? -6 : 5, 0, 0], legs: i % 2 ? STAND_LEGS : BOUNCE_LEGS, y: i % 2 ? 0 : -0.06 })));
  ks.push(standKey(1.2));
  return ks;
}
function standCheer(): PoseKey[] {
  // the jump: down into the knees, up onto the toes with the head thrown back, down, up again — a loop
  return [
    standKey(0),
    standKey(0.15, { spine: 12, neck: [4, 0, 0], legs: BOUNCE_LEGS, y: -0.12 }),
    standKey(0.33, { spine: -10, neck: [-22, 0, 0], legs: TOE_LEGS, y: 0.16 }),
    standKey(0.55, { spine: 10, neck: [0, 6, 0], legs: BOUNCE_LEGS, y: -0.12 }),
    standKey(0.77, { spine: -10, neck: [-22, -6, 0], legs: TOE_LEGS, y: 0.16 }),
    standKey(1.0, { spine: 8, neck: [-2, 0, 0], legs: BOUNCE_LEGS, y: -0.08 }),
    standKey(1.2),
  ];
}
function standGroan(): PoseKey[] {
  return [
    standKey(0),
    standKey(0.2, { spine: -12, neck: [-20, 0, 0], y: 0.01 }),
    standKey(0.45, { spine: 28, neck: [30, 0, 0], legs: BOUNCE_LEGS, y: -0.08, hold: true }),   // doubled over
    standKey(0.85, { spine: 26, neck: [32, 16, 0], legs: BOUNCE_LEGS, y: -0.08 }),
    standKey(1.2, { spine: 14, neck: [16, -10, 0], twist: 10 }),   // …and turning away
    standKey(1.6),
  ];
}

/** The keys of one clip. Pure data. */
export function crowdClipKeys(name: CrowdClipName): PoseKey[] {
  switch (name) {
    case 'sit_idle': return sitIdle();
    case 'sit_clap': return sitClap();
    case 'sit_cheer': return sitCheer();
    case 'sit_groan': return sitGroan();
    case 'rise': return rise();
    case 'stand_idle': return standIdle();
    case 'stand_clap': return standClap();
    case 'stand_cheer': return standCheer();
    case 'stand_groan': return standGroan();
    case 'sit_down': return sitDown();
  }
}

/** Build one crowd clip on a live skeleton (the baker samples it, then disposes it). */
export function buildCrowdClip(scene: Scene, sk: Skeleton, name: CrowdClipName, seconds: number): AnimationGroup | null {
  const keys = crowdClipKeys(name);
  return buildPoseClip(scene, sk, `crowd_${name}`, seconds, keys, { smooth: true });
}
