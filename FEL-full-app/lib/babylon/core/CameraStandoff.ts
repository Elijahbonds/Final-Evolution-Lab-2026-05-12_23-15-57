// CameraStandoff — closes the last hole in the E26 camera work.
//
// WHAT THE LIVE PLAYTEST FOUND (karate, driven through the start gate)
//     [FEL-FRAME] hero off-screen 1x
//       at  {X: 0.028  Y: 0     Z: 2.816}
//       cam {X: 0.249  Y: 1.370 Z: 2.230}
//     [FEL-FRAME] auto-recentering camera on hero
// That camera is 0.63 units from the hero horizontally. The `fight` preset
// asks for 4.2, and MIN_SAFE_DISTANCE is 1.8 — so something is overriding
// both, and the watchdog M64 repaired is now correctly screaming about it.
// Reproduced on two separate runs; it is not a one-frame glitch.
//
// THE CAUSE: ORDER OF OPERATIONS
// In CameraDirector.follow():
//     const finalPos = this.clampToBounds(this.resolveOcclusion(...));
// resolveOcclusion() carefully honours MIN_SAFE_DISTANCE — and then
// clampToBounds() runs afterwards and moves the result, with no knowledge of
// the standoff it is undoing. In a big venue that is harmless. In
// Shimogamo Dojo's walled room the bounds are barely wider than the standoff
// itself, so the clamp squeezes the camera onto the hero. The final guard in
// the chain silently defeats the earlier one.
//
// THE FIX, AND WHY IT GOES UP INSTEAD OF BACK
// The obvious repair is to push the camera back out horizontally — but the
// clamp exists because there IS no room out there; pushing back just fights
// the clamp forever and oscillates. When a room is too small to back away
// in, the answer real camera operators use is to gain height and look down.
// So this preserves the 3D standoff by RAISING the camera, which the bounds
// never constrain from above (clampToBounds only enforces a floor). The
// result is always satisfiable, never oscillates, and degrades to a slightly
// high angle instead of a face full of hero.

import { Vector3 } from '@babylonjs/core';

/** Must match CameraDirector's constant. */
export const MIN_SAFE_DISTANCE = 1.8;

/** Never raise more than this above the subject — beyond it the shot reads
 *  as a top-down map view, which is worse than a slightly tight one. */
const MAX_RAISE = 3.2;

export interface StandoffResult {
  pos: Vector3;
  /** How much height was added to buy back separation. 0 = nothing needed. */
  raised: number;
}

/**
 * Final guard in the camera chain: call AFTER clampToBounds, so nothing can
 * quietly undo it.
 *
 * @param subject Where the hero is.
 * @param pos     The camera position everything else agreed on.
 */
export function enforceStandoff(subject: Vector3, pos: Vector3, minDistance = MIN_SAFE_DISTANCE): StandoffResult {
  const dx = pos.x - subject.x;
  const dz = pos.z - subject.z;
  const horizontal = Math.hypot(dx, dz);
  const dy = pos.y - subject.y;
  const current = Math.hypot(horizontal, dy);

  if (current >= minDistance) return { pos, raised: 0 };

  // Height that restores the full standoff as a 3D distance. Guaranteed real
  // because horizontal < minDistance in this branch.
  const neededY = Math.sqrt(Math.max(0, minDistance * minDistance - horizontal * horizontal));
  const targetY = subject.y + Math.min(MAX_RAISE, Math.max(dy, neededY));
  const raised = targetY - pos.y;

  if (raised > 0.01) {
    // Debug, not warn: this is the system working. It becomes interesting
    // only if it fires constantly, which means a venue is genuinely too
    // tight for its preset and the preset should shrink.
    console.debug(`[FEL-CAM] standoff: only ${current.toFixed(2)}m from subject `
      + `(min ${minDistance}) — raised ${raised.toFixed(2)}m to keep the shot legible.`);
  }
  return { pos: new Vector3(pos.x, targetY, pos.z), raised };
}

// ── WIRING ───────────────────────────────────────────────────────────────
// CameraDirector.follow() and followTwo(), ONE line each. Change:
//
//     const finalPos = this.clampToBounds(this.resolveOcclusion(subject, desired, back));
//
// to:
//
//     const finalPos = enforceStandoff(
//       subject,
//       this.clampToBounds(this.resolveOcclusion(subject, desired, back)),
//     ).pos;
//
// Import: `import { enforceStandoff } from './CameraStandoff';`
//
// ── SECONDARY OBSERVATION, NOT PART OF THIS FIX ──────────────────────────
// While tracing the above I noticed resolveOcclusion()'s return line:
//
//     return { pos: subject.add(dir.scale(clearDist))
//                          .add(new Vector3(0, candidate.y - subject.y, 0)), ... }
//
// `dir` is the normalised FULL 3D direction, so `dir.scale(clearDist)`
// already contains the vertical component of the desired offset; adding
// `candidate.y - subject.y` on top applies that height a second time. The
// camera should therefore sit higher than the preset asks whenever occlusion
// triggers, and the horizontal standoff should come out SHORTER than
// clearDist — which is consistent with what the logs show, and would make
// tight venues worse.
//
// I have NOT changed it here: it is a one-line change inside a file Abacus
// has already integrated and I cannot re-verify the framing of every preset
// from screenshots alone. The standoff guard above fixes the symptom safely
// regardless. If you want the root fix too, the corrected line is:
//
//     const flat = new Vector3(dir.x, 0, dir.z).normalize();
//     return { pos: subject.add(flat.scale(clearDist))
//                          .add(new Vector3(0, candidate.y - subject.y, 0)), clearance: clearDist };
//
// Ship that one on its own and re-run `node tools/smoke.mjs --modes karate`
// so the two changes stay separable if framing shifts.
