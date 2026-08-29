// dunk_360_eastbay — the reference dunk. Six beats (see timing.ts):
// gather → rise/knee up → ball under the knee → hand-to-hand → carry up →
// one-hand extension → hang. Ball choreography in ballRig uses these timestamps.

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildClip } from '../clipBuilder';
import { EASTBAY_TIMING as T } from './timing';

export function buildEastbay(scene: Scene, skeleton: Skeleton): AnimationGroup | null {
  return buildClip(scene, skeleton, 'dunk_360_eastbay', T.duration, {
    Spine: [
      [T.gather, 22, 0, 0], [T.rise, 8, 0, 0], [T.underKnee, 18, 6, 0],
      [T.handOff, 16, -6, 0], [T.carryUp, -6, 0, 0], [T.extend, -14, 0, 0], [T.hang, -8, 0, 0],
    ],
    Spine2: [
      [T.gather, 12, 0, 0], [T.rise, 4, 0, 0], [T.underKnee, 10, 8, 0],
      [T.handOff, 8, -8, 0], [T.carryUp, -6, 0, 0], [T.extend, -10, 0, 0], [T.hang, -6, 0, 0],
    ],
    Neck: [
      [T.gather, 10, 0, 0], [T.underKnee, 24, 0, 0], [T.carryUp, -10, 0, 0],
      [T.extend, -18, 0, 0], [T.hang, -8, 0, 0],
    ],
    // Left knee drives up and STAYS up while the ball passes beneath it
    LeftUpLeg: [
      [T.gather, -18, 0, 0], [T.rise, -95, 0, 8], [T.handOff, -100, 0, 8],
      [T.carryUp, -60, 0, 4], [T.extend, -30, 0, 0], [T.hang, -20, 0, 0],
    ],
    LeftLeg: [
      [T.gather, 24, 0, 0], [T.rise, 96, 0, 0], [T.handOff, 100, 0, 0],
      [T.carryUp, 55, 0, 0], [T.extend, 30, 0, 0], [T.hang, 25, 0, 0],
    ],
    RightUpLeg: [
      [T.gather, -20, 0, -4], [T.rise, -20, 0, -6], [T.extend, -12, 0, -4], [T.hang, -16, 0, -4],
    ],
    RightLeg: [
      [T.gather, 30, 0, 0], [T.rise, 24, 0, 0], [T.extend, 14, 0, 0], [T.hang, 18, 0, 0],
    ],
    // RIGHT hand takes the ball down under the raised knee…
    RightShoulder: [
      [T.gather, 0, 0, 8], [T.underKnee, 4, 0, 30], [T.handOff, 4, 0, 34],
      [T.carryUp, 0, 0, 10], [T.extend, 0, 0, -6],
    ],
    RightArm: [
      [T.gather, 55, 0, -12], [T.rise, 40, 10, -10], [T.underKnee, 78, 30, -35],
      [T.handOff, 82, 34, -40], [T.carryUp, 20, 0, -10], [T.extend, -35, 0, -8], [T.hang, -20, 0, -8],
    ],
    RightForeArm: [
      [T.gather, 30, 0, 0], [T.underKnee, 55, 0, 0], [T.handOff, 60, 0, 0],
      [T.carryUp, 15, 0, 0], [T.extend, 5, 0, 0],
    ],
    // …LEFT hand receives beneath the leg and carries up to the flush
    LeftShoulder: [
      [T.gather, 0, 0, -8], [T.underKnee, 4, 0, -26], [T.handOff, 6, 0, -34],
      [T.carryUp, 0, 0, -12], [T.extend, 0, 0, 6],
    ],
    LeftArm: [
      [T.gather, 55, 0, 12], [T.rise, 45, -8, 10], [T.underKnee, 70, -26, 30],
      [T.handOff, 80, -32, 38], [T.carryUp, -60, 0, 14], [T.extend, -160, 0, 10], [T.hang, -120, 0, 10],
    ],
    LeftForeArm: [
      [T.gather, 30, 0, 0], [T.underKnee, 50, 0, 0], [T.handOff, 58, 0, 0],
      [T.carryUp, 25, 0, 0], [T.extend, 8, 0, 0], [T.hang, 30, 0, 0],
    ],
    Hips: [
      [T.gather, 14, 0, 0], [T.rise, 4, 18, 0], [T.handOff, 8, 40, 0],
      [T.carryUp, -4, 12, 0], [T.extend, -8, 0, 0], [T.hang, -4, 0, 0],
    ],
  });
}
