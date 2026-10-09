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
