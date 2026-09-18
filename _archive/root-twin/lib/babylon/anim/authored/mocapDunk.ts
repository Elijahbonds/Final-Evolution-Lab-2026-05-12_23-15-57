// mocapDunk — the user's REAL motion capture, processed for the procedural rig.
//
// Source: public/mocap/dunk.json (DeepMotion capture, 92 frames @ 15fps,
// 16 world-space joints in cm). An offline processor derived per-bone LOCAL
// joint angles from that capture (arm elevation vs torso, elbow/knee flex, hip
// drive, spine lean) over the gather->extend->overhead window (source frames
// 14..66), light-smoothed, and mapped to a 1.3s clip. Only RELATIVE angles are
// baked here: the global hip rise is intentionally dropped because DunkMode
// applies the jump arc to the character root separately (baking it too would
// double the jump). Because the retarget is angle-based it is orientation-
// invariant and every value is anatomically clamped, so it is deterministic and
// safe to ship without a runtime JSON fetch. Constants are the validated output
// of that processor; see /tmp genMocapDunk.js history for the derivation.

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildClip } from '../clipBuilder';

const DUR = 1.3;

export function buildMocapDunk(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildClip(scene, sk, 'dunk_mocap', DUR, {
    Spine: [[0, -15, 0, 0], [0.2, -3.8, 0, 0], [0.4, -3.5, 0, 0], [0.6, -6.7, 0, 0], [0.8, -4.6, 0, 0], [1, 0.3, 0, 0], [1.15, 3.6, 0, 0], [1.3, 12.1, 0, 0]],
    Spine2: [[0, -7.5, 0, 0], [0.2, -1.9, 0, 0], [0.4, -1.7, 0, 0], [0.6, -3.3, 0, 0], [0.8, -2.3, 0, 0], [1, 0.2, 0, 0], [1.15, 1.8, 0, 0], [1.3, 6, 0, 0]],
    LeftArm: [[0, -34.9, 0, 8], [0.2, -20.8, 0, 8], [0.4, -27.6, 0, 8], [0.6, -45.8, 0, 8], [0.8, -81.5, 0, 8], [1, -130.7, 0, 8], [1.15, -154.6, 0, 8], [1.3, -154, 0, 8]],
    RightArm: [[0, -52.2, 0, -8], [0.2, -36.6, 0, -8], [0.4, -53.1, 0, -8], [0.6, -71.9, 0, -8], [0.8, -94.5, 0, -8], [1, -141.1, 0, -8], [1.15, -168.2, 0, -8], [1.3, -170, 0, -8]],
    LeftForeArm: [[0, 0.3, 0, 0], [0.2, 8.4, 0, 0], [0.4, 25, 0, 0], [0.6, 64, 0, 0], [0.8, 85.8, 0, 0], [1, 50.6, 0, 0], [1.15, 16.3, 0, 0], [1.3, 19.6, 0, 0]],
    RightForeArm: [[0, 95.2, 0, 0], [0.2, 33.9, 0, 0], [0.4, 34.7, 0, 0], [0.6, 41, 0, 0], [0.8, 18.2, 0, 0], [1, 2, 0, 0], [1.15, 7.3, 0, 0], [1.3, 28.5, 0, 0]],
    LeftUpLeg: [[0, -73.4, 0, 4], [0.2, -38.7, 0, 4], [0.4, -18.2, 0, 4], [0.6, -22.7, 0, 4], [0.8, -34.1, 0, 4], [1, -24.8, 0, 4], [1.15, -16.6, 0, 4], [1.3, -26.8, 0, 4]],
    RightUpLeg: [[0, -17.9, 0, -4], [0.2, -39.8, 0, -4], [0.4, -33.1, 0, -4], [0.6, -25.8, 0, -4], [0.8, -21.3, 0, -4], [1, -15.4, 0, -4], [1.15, -13.2, 0, -4], [1.3, -11.5, 0, -4]],
    LeftLeg: [[0, 55.8, 0, 0], [0.2, 34.2, 0, 0], [0.4, 56.7, 0, 0], [0.6, 77.6, 0, 0], [0.8, 64.2, 0, 0], [1, 45.6, 0, 0], [1.15, 25.6, 0, 0], [1.3, 11.8, 0, 0]],
    RightLeg: [[0, 69.8, 0, 0], [0.2, 51.1, 0, 0], [0.4, 58, 0, 0], [0.6, 75.6, 0, 0], [0.8, 79.9, 0, 0], [1, 57.3, 0, 0], [1.15, 23, 0, 0], [1.3, 8.2, 0, 0]],
  }, [[0, -0.1], [0.2, 0.048], [0.4, 0.12], [0.6, 0.12], [0.8, 0.12], [1, 0.12], [1.15, 0.12], [1.3, 0.12]]);
}
