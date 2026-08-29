// proceduralClips — authored keyframe clips tuned to the procedural rig's OWN
// local frames (rest = arms down, identity rotationQuaternion everywhere). We
// register them under the small set of BASE names the CLIP_ALIASES table maps
// to (guard, run, walk, jab, hook, uppercut, roundhouse, high_kick, jumpshot)
// plus idle_stand, so every sport-specific registry name (dunk_*, karate_*,
// soccer_*, skate_* …) resolves through the alias table onto a real, good
// looking clip — exactly as the GLB path resolved onto the baked clips.
//
// Sign convention on this rig (limbs hang -Y from their joint node):
//   Arm/Leg +X = swing backward,  -X = swing forward / raise front
//   Left  +Z = abduct outward,    Right -Z = abduct outward
//   Fore-arm/Lower-leg +X = flex (elbow / knee bend)
//   Spine +X = lean forward,  +Y = twist

import { buildClip, type BoneKeys, type HipsYKeys } from '../anim/clipBuilder';
import type { CharacterAnimator } from '../anim/CharacterAnimator';
import type { Scene, Skeleton } from '@babylonjs/core';

interface ClipDef { name: string; dur: number; bones: BoneKeys; hipsY?: HipsYKeys }

const CLIPS: ClipDef[] = [
  // ── idle: quiet breathing, arms resting just off the torso ──
  { name: 'idle_stand', dur: 3.0, bones: {
      Spine: [[0, 2, 0, 0], [1.5, 4, 0, 0], [3, 2, 0, 0]],
      Neck: [[0, 0, 0, 0], [1.5, 1, 2, 0], [3, 0, 0, 0]],
      LeftArm: [[0, 0, 0, 5], [1.5, 0, 0, 7], [3, 0, 0, 5]],
      RightArm: [[0, 0, 0, -5], [1.5, 0, 0, -7], [3, 0, 0, -5]],
      LeftForeArm: [[0, 3, 0, 0], [1.5, 6, 0, 0], [3, 3, 0, 0]],
      RightForeArm: [[0, 3, 0, 0], [1.5, 6, 0, 0], [3, 3, 0, 0]],
    }, hipsY: [[0, 0], [1.5, -0.012], [3, 0]] },

  // ── guard: athletic ready stance (defend / karate stance / jump-land) ──
  { name: 'guard', dur: 1.6, bones: {
      Hips: [[0, 6, 0, 0], [0.8, 7, 0, 0], [1.6, 6, 0, 0]],
      Spine: [[0, 6, 0, 0], [0.8, 7, 0, 0], [1.6, 6, 0, 0]],
      LeftUpLeg: [[0, -12, 0, 7], [1.6, -12, 0, 7]],
      LeftLeg: [[0, 26, 0, 0], [1.6, 26, 0, 0]],
      RightUpLeg: [[0, -12, 0, -7], [1.6, -12, 0, -7]],
      RightLeg: [[0, 26, 0, 0], [1.6, 26, 0, 0]],
      LeftArm: [[0, -34, 0, 18], [0.8, -36, 0, 20], [1.6, -34, 0, 18]],
      LeftForeArm: [[0, -74, 0, 0], [1.6, -74, 0, 0]],
      RightArm: [[0, -34, 0, -18], [0.8, -36, 0, -20], [1.6, -34, 0, -18]],
      RightForeArm: [[0, -74, 0, 0], [1.6, -74, 0, 0]],
    }, hipsY: [[0, -0.07], [0.8, -0.09], [1.6, -0.07]] },

  // ── walk cycle ──
  { name: 'walk', dur: 1.0, bones: {
      Spine: [[0, 3, 2, 0], [0.5, 3, -2, 0], [1.0, 3, 2, 0]],
      LeftUpLeg: [[0, 28, 0, 4], [0.5, -26, 0, 4], [1.0, 28, 0, 4]],
      LeftLeg: [[0, 8, 0, 0], [0.25, 45, 0, 0], [0.5, 6, 0, 0], [1.0, 8, 0, 0]],
      RightUpLeg: [[0, -26, 0, -4], [0.5, 28, 0, -4], [1.0, -26, 0, -4]],
      RightLeg: [[0, 6, 0, 0], [0.75, 45, 0, 0], [1.0, 6, 0, 0]],
      LeftArm: [[0, -22, 0, 7], [0.5, 22, 0, 7], [1.0, -22, 0, 7]],
      RightArm: [[0, 22, 0, -7], [0.5, -22, 0, -7], [1.0, 22, 0, -7]],
      LeftForeArm: [[0, -18, 0, 0], [1.0, -18, 0, 0]],
      RightForeArm: [[0, -18, 0, 0], [1.0, -18, 0, 0]],
    }, hipsY: [[0, 0], [0.25, 0.022], [0.5, 0], [0.75, 0.022], [1.0, 0]] },

  // ── run cycle (forward lean, pumping bent arms) ──
  { name: 'run', dur: 0.8, bones: {
      Spine: [[0, 14, 3, 0], [0.4, 14, -3, 0], [0.8, 14, 3, 0]],
      LeftUpLeg: [[0, 44, 0, 4], [0.4, -42, 0, 4], [0.8, 44, 0, 4]],
      LeftLeg: [[0, 22, 0, 0], [0.2, 82, 0, 0], [0.4, 12, 0, 0], [0.8, 22, 0, 0]],
      RightUpLeg: [[0, -42, 0, -4], [0.4, 44, 0, -4], [0.8, -42, 0, -4]],
      RightLeg: [[0, 12, 0, 0], [0.6, 82, 0, 0], [0.8, 12, 0, 0]],
      LeftArm: [[0, -44, 0, 8], [0.4, 26, 0, 8], [0.8, -44, 0, 8]],
      RightArm: [[0, 26, 0, -8], [0.4, -44, 0, -8], [0.8, 26, 0, -8]],
      LeftForeArm: [[0, -82, 0, 0], [0.8, -82, 0, 0]],
      RightForeArm: [[0, -82, 0, 0], [0.8, -82, 0, 0]],
    }, hipsY: [[0, 0], [0.2, 0.045], [0.4, 0], [0.6, 0.045], [0.8, 0]] },

  // ── jab: quick right straight (karate light / stiff-arm / putt) ──
  { name: 'jab', dur: 0.42, bones: {
      Spine: [[0, 0, -6, 0], [0.16, 0, 10, 0], [0.42, 0, -6, 0]],
      RightArm: [[0, -20, 0, -12], [0.16, -92, 0, -4], [0.42, -20, 0, -12]],
      RightForeArm: [[0, -60, 0, 0], [0.16, -6, 0, 0], [0.42, -60, 0, 0]],
      LeftArm: [[0, -40, 0, 16], [0.42, -40, 0, 16]],
      LeftForeArm: [[0, -78, 0, 0], [0.42, -78, 0, 0]],
    } },

  // ── hook: right horizontal (heavy punch / golf swing / bat swing) ──
  { name: 'hook', dur: 0.52, bones: {
      Hips: [[0, 0, -6, 0], [0.22, 0, 12, 0], [0.52, 0, -6, 0]],
      Spine: [[0, 0, -10, 0], [0.22, 0, 20, 0], [0.52, 0, -10, 0]],
      RightArm: [[0, -40, 0, -18], [0.22, -68, -46, -6], [0.52, -40, 0, -18]],
      RightForeArm: [[0, -86, 0, 0], [0.52, -86, 0, 0]],
      LeftArm: [[0, -38, 0, 16], [0.52, -38, 0, 16]],
      LeftForeArm: [[0, -70, 0, 0], [0.52, -70, 0, 0]],
    } },

  // ── uppercut: right rising (counter-throw / celebrate / fist-pump) ──
  { name: 'uppercut', dur: 0.5, bones: {
      Spine: [[0, 6, -8, 0], [0.2, -6, 10, 0], [0.5, 6, -8, 0]],
      RightArm: [[0, 10, 0, -14], [0.2, -106, 0, -8], [0.5, 10, 0, -14]],
      RightForeArm: [[0, -96, 0, 0], [0.2, -70, 0, 0], [0.5, -96, 0, 0]],
      LeftArm: [[0, -40, 0, 16], [0.5, -40, 0, 16]],
      LeftForeArm: [[0, -80, 0, 0], [0.5, -80, 0, 0]],
    }, hipsY: [[0, -0.04], [0.2, 0.06], [0.5, -0.04]] },

  // ── roundhouse: right leg horizontal sweep (spin move) ──
  { name: 'roundhouse', dur: 0.62, bones: {
      Hips: [[0, 0, 0, 0], [0.31, 0, -16, 0], [0.62, 0, 0, 0]],
      Spine: [[0, 0, 10, 0], [0.31, 0, -24, 0], [0.62, 0, 10, 0]],
      RightUpLeg: [[0, -10, 0, -10], [0.31, -62, -42, -16], [0.62, -10, 0, -10]],
      RightLeg: [[0, 70, 0, 0], [0.31, 14, 0, 0], [0.62, 70, 0, 0]],
      LeftArm: [[0, -30, 0, 30], [0.62, -30, 0, 30]],
      RightArm: [[0, -22, 0, -20], [0.62, -22, 0, -20]],
    } },

  // ── high_kick: right front high (soccer shot / skate flip) ──
  { name: 'high_kick', dur: 0.5, bones: {
      Spine: [[0, -4, 0, 0], [0.25, -16, 0, 0], [0.5, -4, 0, 0]],
      RightUpLeg: [[0, -10, 0, -6], [0.25, -116, 0, -6], [0.5, -10, 0, -6]],
      RightLeg: [[0, 60, 0, 0], [0.25, 8, 0, 0], [0.5, 60, 0, 0]],
      LeftArm: [[0, -40, 0, 26], [0.5, -40, 0, 26]],
      RightArm: [[0, -40, 0, -26], [0.5, -40, 0, -26]],
    } },

  // ── jumpshot: dip, jump, both arms overhead (shots / dunks / snow jump) ──
  { name: 'jumpshot', dur: 0.9, bones: {
      Spine: [[0, 4, 0, 0], [0.4, -6, 0, 0], [0.9, 4, 0, 0]],
      LeftUpLeg: [[0, -10, 0, 4], [0.3, -34, 0, 4], [0.55, -6, 0, 4], [0.9, -10, 0, 4]],
      LeftLeg: [[0, 14, 0, 0], [0.3, 46, 0, 0], [0.55, 6, 0, 0], [0.9, 14, 0, 0]],
      RightUpLeg: [[0, -10, 0, -4], [0.3, -34, 0, -4], [0.55, -6, 0, -4], [0.9, -10, 0, -4]],
      RightLeg: [[0, 14, 0, 0], [0.3, 46, 0, 0], [0.55, 6, 0, 0], [0.9, 14, 0, 0]],
      LeftArm: [[0, -30, 0, 10], [0.4, -150, 0, 6], [0.9, -30, 0, 10]],
      RightArm: [[0, -30, 0, -10], [0.4, -150, 0, -6], [0.9, -30, 0, -10]],
      LeftForeArm: [[0, -40, 0, 0], [0.4, -10, 0, 0], [0.9, -40, 0, 0]],
      RightForeArm: [[0, -40, 0, 0], [0.4, -10, 0, 0], [0.9, -40, 0, 0]],
    }, hipsY: [[0, 0], [0.3, -0.11], [0.55, 0.14], [0.9, 0]] },
];

/** Build + register every procedural clip onto the animator. */
export function registerProceduralClips(
  animator: CharacterAnimator, scene: Scene, skeleton: Skeleton,
): void {
  for (const def of CLIPS) {
    const g = buildClip(scene, skeleton, def.name, def.dur, def.bones, def.hipsY);
    if (g) animator.register(g);
    else console.warn(`[FEL-PROC] clip "${def.name}" produced no targets`);
  }
}
