/**
 * The Adventure's camera, decided in the sim's terms (ADVENTURE PLAN A4: "camera (consume CameraHint each tick it
 * arrives; lock-on framing)"). Pure: it turns the systems' camera hints into a RIG — which follow preset, the follow
 * overlay (distance, height, lag, look-ahead), the extra FOV and the body to keep framed — and AdventureMode hands the
 * rig to the harness's CameraDirector (setPreset / tuneFollow / update), which does the occlusion, the standoff and
 * the orbit it already does for every mode.
 *
 *   follow  the run: the director's 'runner' shot.
 *   grind   lower and closer, looking further down the rail ('board').
 *   ride    a step further back for the mount's bulk.
 *   flight  further back and higher; the FOV opens with airspeed (A1's fovBoost).
 *   cruise  further again, a shorter lag (the camera keeps up at 40 m/s), more FOV.
 *   lock    the fight's three-quarter shot ('fight': fitTwo keeps you and the target framed), pulled out for the
 *           Adventure's bigger bodies.
 *   boss    the lock pulled out further and higher: a 4 m boss fills the frame otherwise.
 * The highest-priority hint of a step wins (contracts.CameraHint); a hint is HELD for HINT_HOLD_SEC after its last
 * arrival, so a hint that drops out for a tick (a hop between rails) does not snap the camera away and back.
 *
 * Every number here is a starting value. [TUNE]
 */

import type { ActorId, CameraHint } from '../contracts';

export type DirectorPreset = 'runner' | 'board' | 'fight';

export interface CameraRig {
  hint: CameraHint['preset'];
  preset: DirectorPreset;
  distance: number;
  height: number;
  lag: number;
  lookAhead: number;
  /** Extra FOV, degrees (eased by the view). */
  fovBoostDeg: number;
  /** The body to keep framed with the player (a lock, a boss), or null. */
  objectiveId: ActorId | null;
}

/** Seconds a hint outlives its last arrival. [TUNE] */
export const HINT_HOLD_SEC = 0.25;

/** The rig per hint. [TUNE] — the follow row is the director's 'runner' preset as it ships (no overlay change). */
export const CAMERA_RIGS: Readonly<Record<CameraHint['preset'], Omit<CameraRig, 'hint' | 'fovBoostDeg' | 'objectiveId'>>> = Object.freeze({
  follow: { preset: 'runner', distance: 7.5, height: 3.2, lag: 0.08, lookAhead: 3.0 },
  grind: { preset: 'board', distance: 6.5, height: 2.4, lag: 0.1, lookAhead: 5.0 },
  ride: { preset: 'runner', distance: 8.5, height: 3.4, lag: 0.08, lookAhead: 3.0 },
  flight: { preset: 'runner', distance: 9.0, height: 3.0, lag: 0.08, lookAhead: 3.0 },
  cruise: { preset: 'runner', distance: 11.0, height: 3.6, lag: 0.05, lookAhead: 6.0 },
  lock: { preset: 'fight', distance: 6.0, height: 2.6, lag: 0.12, lookAhead: 0.4 },
  boss: { preset: 'fight', distance: 9.5, height: 3.8, lag: 0.12, lookAhead: 0.4 },
  cutscene: { preset: 'runner', distance: 7.5, height: 3.2, lag: 0.08, lookAhead: 3.0 },
});

/** The most extra FOV any hint may ask for, degrees (a speed blur, not a fisheye). [TUNE] */
export const MAX_FOV_BOOST_DEG = 20;

export class AdventureCamera {
  private best: CameraHint = { preset: 'follow', priority: -Infinity };
  private bestFresh = false;
  private held: CameraHint = { preset: 'follow', priority: -Infinity };
  private heldUntil = -Infinity;
  private readonly rigOut: CameraRig = { hint: 'follow', ...CAMERA_RIGS.follow, fovBoostDeg: 0, objectiveId: null };

  /** A system's hint, during a step (the host forwards ctx.hint here). Keeps the highest priority of the step. */
  offer(h: CameraHint): void {
    if (!this.bestFresh || h.priority > this.best.priority) {
      this.best.preset = h.preset; this.best.priority = h.priority;
      this.best.targetId = h.targetId; this.best.fovBoost = h.fovBoost;
      this.bestFresh = true;
    }
  }

  /** The step is over: its winning hint (if any) becomes the held hint. `tSec` is the host's sim clock. */
  endStep(tSec: number): void {
    if (this.bestFresh) {
      const h = this.best;
      // a fresh hint replaces the held one when it outranks it, or when the held one has run out
      if (h.priority >= this.held.priority || tSec > this.heldUntil) {
        this.held.preset = h.preset; this.held.priority = h.priority; this.held.targetId = h.targetId; this.held.fovBoost = h.fovBoost;
      }
      if (h.preset === this.held.preset) this.heldUntil = tSec + HINT_HOLD_SEC;
    } else if (tSec > this.heldUntil) {
      this.held.preset = 'follow'; this.held.priority = -Infinity; this.held.targetId = undefined; this.held.fovBoost = 0;
    }
    this.bestFresh = false;
    this.best.priority = -Infinity;
  }

  /** The rig for the held hint (one object, refreshed per call: read it now). */
  rig(): Readonly<CameraRig> {
    const h = this.held, r = this.rigOut, base = CAMERA_RIGS[h.preset] ?? CAMERA_RIGS.follow;
    r.hint = h.preset; r.preset = base.preset; r.distance = base.distance; r.height = base.height; r.lag = base.lag;
    r.lookAhead = base.lookAhead;
    r.fovBoostDeg = Math.max(0, Math.min(MAX_FOV_BOOST_DEG, Number.isFinite(h.fovBoost) ? h.fovBoost! : 0));
    r.objectiveId = (h.preset === 'lock' || h.preset === 'boss') && h.targetId ? h.targetId : null;
    return r;
  }

  reset(): void {
    this.bestFresh = false; this.best.priority = -Infinity;
    this.held.preset = 'follow'; this.held.priority = -Infinity; this.held.targetId = undefined; this.held.fovBoost = 0;
    this.heldUntil = -Infinity;
  }
}

// ── THE CLEAR VIEW (improve pass phase 9, lane/improve-world, 2026-11-22; docs/IMPROVE-10-PHASE-AUDIT.md §2.8, finding #15) ──
// Measured before: on desktop the Coast camera went INSIDE the boat after a short walk (the "Boat to Venice" sign filled a quarter of
// the screen). The shared director's occlusion probe only sees pickable meshes with collisions or a venue-shell name; the zone's boat,
// houses, palms and rocks are none of those, so nothing kept the eye out of them. This is the 1v1 high camera's rule
// (HighSidelineCam: "in along the look, out of a prop") for the Adventure host's follow camera, done by the mode AFTER the director
// has placed the eye, so the director and every number it was tuned with stay as they are: when a solid's box (with ROOM) stands
// between the player's chest and the eye, or holds the eye, the eye comes in along its own line to just short of it, never closer
// than MIN_PULL. Nothing else moves: not the aim, the distance it wants, the height, the lag or the FOV — next frame the director
// eases back out from where the eye is, as it does after its own occlusion pull. `venue.camClearView` 0 = no check (as before).

/** venue.camClearView: 1 = the zone and story cameras keep out of solid props; 0 = they pass through them (before this pass). */
export const VENUE_CAM_CLEAR_VIEW = 1;
/** A solid's box (world metres). `insideOnly`: a thin prop (a palm, a tree, a rock) — the eye only keeps out of it, it is not a wall
 *  between you and the eye (a palm's crown box between them would pull the camera in and out all along a beach). */
export interface CamBox { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; insideOnly?: boolean }
/** Room kept between the eye and a solid (m), and the closest the eye comes to the chest (m). [TUNE] new numbers, this pass */
export const CAM_CLEAR = { room: 0.3, minPull: 1.2 } as const;
/** The chest the director frames from: the player's feet plus this (CameraDirector.resolveOcclusion's eye offset). */
export const CAM_CHEST_Y = 1.2;

interface P3 { x: number; y: number; z: number }

/** Where the segment chest → eye first enters `b` grown by `room`, as a fraction in [0, 1]; null if it does not (or starts inside). */
export function enterFraction(c: P3, e: P3, b: CamBox, room: number = CAM_CLEAR.room): number | null {
  // less room up and down: a low rim the chest stands just above is not in the way of an eye looking down over it
  const ry = Math.min(room, 0.1);
  const lo = [b.minX - room, b.minY - ry, b.minZ - room], hi = [b.maxX + room, b.maxY + ry, b.maxZ + room];
  const o = [c.x, c.y, c.z], d = [e.x - c.x, e.y - c.y, e.z - c.z];
  if (o[0] > lo[0] && o[0] < hi[0] && o[1] > lo[1] && o[1] < hi[1] && o[2] > lo[2] && o[2] < hi[2]) return null;   // the chest is inside: not a blocker
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] <= lo[k] || o[k] >= hi[k]) return null; continue; }
    let u0 = (lo[k] - o[k]) / d[k], u1 = (hi[k] - o[k]) / d[k];
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
    if (u0 > t0) t0 = u0;
    if (u1 < t1) t1 = u1;
    if (t0 > t1) return null;
  }
  return t0;
}

/** The eye kept clear of every box: null when it already is, else the eye pulled in along chest → eye. */
export function clearViewEye(chest: P3, eye: P3, boxes: readonly CamBox[]): P3 | null {
  const len = Math.hypot(eye.x - chest.x, eye.y - chest.y, eye.z - chest.z);
  if (!(len > CAM_CLEAR.minPull)) return null;
  let first = Infinity;
  for (const b of boxes) {
    // cheap reject: a box wholly further than the eye from the chest, in x or z
    if (b.minX - CAM_CLEAR.room > Math.max(chest.x, eye.x) || b.maxX + CAM_CLEAR.room < Math.min(chest.x, eye.x)) continue;
    if (b.minZ - CAM_CLEAR.room > Math.max(chest.z, eye.z) || b.maxZ + CAM_CLEAR.room < Math.min(chest.z, eye.z)) continue;
    if (b.insideOnly && !(eye.x > b.minX - CAM_CLEAR.room && eye.x < b.maxX + CAM_CLEAR.room && eye.y > b.minY && eye.y < b.maxY && eye.z > b.minZ - CAM_CLEAR.room && eye.z < b.maxZ + CAM_CLEAR.room)) continue;
    const t = enterFraction(chest, eye, b);
    if (t !== null && t < first) first = t;
  }
  if (first === Infinity) return null;
  const t = Math.max(CAM_CLEAR.minPull / len, first - 0.02);
  if (t >= 1) return null;
  return { x: chest.x + (eye.x - chest.x) * t, y: chest.y + (eye.y - chest.y) * t, z: chest.z + (eye.z - chest.z) * t };
}
