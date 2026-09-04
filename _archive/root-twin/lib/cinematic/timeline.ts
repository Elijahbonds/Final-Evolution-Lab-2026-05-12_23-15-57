/**
 * lib/cinematic/timeline.ts
 * =========================
 * M14-P5 — Cinematic Event Engine (PURE core).
 *
 * A "cinematic" is a short, deterministic timeline that plays BEFORE a big
 * moment (e.g. a dunk launch). It is expressed as:
 *   • a CAMERA TRACK  — a list of time-stamped CameraFrame keys the player
 *                        interpolates between (eased), and
 *   • a list of BEATS  — time-stamped one-shot events (play a clip, crowd pop,
 *                        and finally the `launch` beat that hands control back
 *                        to the live sim).
 *
 * CinematicPlayer advances the timeline, samples the camera track, and reports
 * exactly which beats fired this tick (each beat fires once, even across a big
 * dt spike). Everything is deterministic and finite-safe — there are no dead
 * frames and no beat is ever skipped or double-fired.
 *
 * Pure math, no THREE / DOM. Both the live dunk scene and
 * scripts/cinematic-tests.ts import THIS module — never fork it.
 */

import { type CameraFrame, type Vec3, easeInOut } from '../camera/rigs';

/** One time-stamped camera pose on the track. */
export interface CameraKey {
  /** Seconds from the start of the cinematic. */
  t: number;
  frame: CameraFrame;
}

/** One time-stamped one-shot event. */
export interface Beat {
  /** Seconds from the start of the cinematic. */
  t: number;
  /** Stable identifier the scene switches on (e.g. 'gather', 'pop', 'launch'). */
  id: string;
  /** Optional animation clip name the beat asks the scene to play. */
  clip?: string;
  /** Optional free-form payload. */
  payload?: number | string;
}

/** A complete, self-contained cinematic. */
export interface Cinematic {
  id: string;
  /** Total length in seconds (> 0). */
  duration: number;
  /** Camera poses, ascending in time. */
  track: CameraKey[];
  /** One-shot events, ascending in time. */
  beats: Beat[];
}

const isFiniteVec = (v: Vec3): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
function lerpVec(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) };
}
function lerpFrame(a: CameraFrame, b: CameraFrame, k: number): CameraFrame {
  return {
    position: lerpVec(a.position, b.position, k),
    target: lerpVec(a.target, b.target, k),
    fov: lerp(a.fov, b.fov, k),
  };
}

/**
 * Sample the camera track at time `q` (seconds). Clamps to the first key before
 * the start and the last key after the end; eases between adjacent keys. Always
 * returns a finite frame (falls back to the nearest valid key).
 */
export function sampleTrack(track: CameraKey[], q: number): CameraFrame {
  if (!track || track.length === 0) {
    return { position: { x: 0, y: 2, z: 8 }, target: { x: 0, y: 1, z: 0 }, fov: 50 };
  }
  if (track.length === 1) return track[0].frame;
  const time = Number.isFinite(q) ? q : 0;
  if (time <= track[0].t) return track[0].frame;
  const last = track[track.length - 1];
  if (time >= last.t) return last.frame;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (time >= a.t && time < b.t) {
      const span = b.t - a.t;
      const raw = span > 1e-6 ? (time - a.t) / span : 0;
      const k = easeInOut(raw);
      const frame = lerpFrame(a.frame, b.frame, k);
      if (!isFiniteVec(frame.position) || !isFiniteVec(frame.target) || !Number.isFinite(frame.fov)) {
        return a.frame;
      }
      return frame;
    }
  }
  return last.frame;
}

export interface CinematicTick {
  /** Interpolated camera frame for this instant. */
  frame: CameraFrame;
  /** Beats that crossed the playhead this tick (may be empty). */
  fired: Beat[];
  /** True once the cinematic has reached its end. */
  done: boolean;
  /** Normalized progress 0..1. */
  progress: number;
}

/**
 * Deterministic cinematic player. Advances a loaded cinematic by dt, samples
 * the camera track, and returns any beats crossed since the previous tick.
 * Beats fire exactly once and in time order — a large dt fires every beat it
 * passed, so nothing is skipped. The final `done` tick is emitted once.
 */
export class CinematicPlayer {
  private cin: Cinematic | null = null;
  private prevT = 0;
  private t = 0;
  private endedEmitted = false;
  active = false;

  /** Load and start a cinematic from t=0. */
  play(cin: Cinematic): void {
    this.cin = cin;
    this.prevT = 0;
    this.t = 0;
    this.endedEmitted = false;
    this.active = true;
  }

  /** Abort the current cinematic. */
  stop(): void {
    this.active = false;
    this.cin = null;
  }

  get progress(): number {
    if (!this.cin || this.cin.duration <= 0) return 1;
    return Math.max(0, Math.min(1, this.t / this.cin.duration));
  }

  /**
   * Advance the timeline and report the sampled frame + beats fired this tick.
   * Returns `done: true` on the tick the playhead reaches the end (and clears
   * `active`). Calling update() while inactive returns a safe idle tick.
   */
  update(dtRaw: number): CinematicTick {
    const cin = this.cin;
    if (!cin || !this.active) {
      const frame = cin ? sampleTrack(cin.track, cin ? cin.duration : 0) : sampleTrack([], 0);
      return { frame, fired: [], done: true, progress: 1 };
    }
    const dt = Math.max(0, Math.min(dtRaw, 0.05));
    this.prevT = this.t;
    this.t = Math.min(this.t + dt, cin.duration);

    // Fire every beat in (prevT, t]; at the very end also fire beats sitting
    // exactly at duration. Sorted ascending so scene sees them in order.
    const atEnd = this.t >= cin.duration;
    const fired: Beat[] = [];
    for (const b of cin.beats) {
      const after = b.t > this.prevT || (this.prevT === 0 && b.t === 0);
      const before = atEnd ? b.t <= this.t : b.t <= this.t;
      // Guard against double-fire: only fire beats strictly after prevT, except
      // t=0 beats which fire on the first tick.
      const firstTickZero = this.prevT === 0 && b.t === 0;
      if ((firstTickZero || b.t > this.prevT) && before && after) fired.push(b);
    }
    fired.sort((a, b) => a.t - b.t);

    const frame = sampleTrack(cin.track, this.t);
    let done = false;
    if (atEnd && !this.endedEmitted) {
      this.endedEmitted = true;
      this.active = false;
      done = true;
    }
    return { frame, fired, done, progress: this.progress };
  }
}
