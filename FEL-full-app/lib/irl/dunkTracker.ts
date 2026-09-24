// lib/irl/dunkTracker.ts — Prove It's measurement heart.
//
// Turns a pose-landmark stream (the neuro-mirror MediaPipe pipeline, fully
// on-device) into MEASURED dunk metrics, then into the judge panel's three
// inputs. Nothing here touches the DOM or MediaPipe — feed it frames, get
// physics. The same honesty rules as the rest of the IRL stack: every number
// is computed from the stream; nothing is fabricated.
//
// Frame model (image space): x right, y DOWN, both normalized 0..1.
// A jump reads as: ankles leave the floor line (ankle y rises = DECREASES),
// hips rise, then everything comes back. Flight time = takeoff→landing on the
// ANKLE signal (the feet are what leave the floor); vertical height uses the
// same physics as IRLCore: h = g·t²/8.

import { G } from '../babylon/core/IRLCore';

// MediaPipe Pose indices (the adapter's POSE_IDX stops at hips; Prove It
// reads the full body, so it carries its own table).
export const DUNK_POSE_IDX = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
} as const;

export interface TrackerLandmark { x: number; y: number; visibility: number }
export interface TrackerFrame { landmarks: TrackerLandmark[]; timestampMs: number; present: boolean }

const MIN_VIS = 0.5;              // TUNE(elijah): landmark confidence floor
const AIRBORNE_RISE = 0.03;       // TUNE(elijah): ankle rise above floor, image units
const MIN_FLIGHT_MS = 180;        // TUNE(elijah): matches IRLCore MIN_FLIGHT
const MAX_FLIGHT_MS = 1200;       // TUNE(elijah): matches IRLCore MAX_FLIGHT
const SETTLE_MS = 500;            // TUNE(elijah): landing = this long re-grounded
const APPROACH_MS = 500;          // approachSpeed reads the hips over this long before takeoff
// The hip trail is kept by TIME: one attempt's span from the start of its approach to its settle, including a
// landing closed on the safety clock. A count cap (90) held 0.75 s at 120 Hz, so the approach was gone by the
// time the landing settled and approachSpeed read 0.
const HIP_TRAIL_MS = APPROACH_MS + MAX_FLIGHT_MS + 1500 + SETTLE_MS;

/** The tallest vertical /api/mirror/dunks will store (it imports this). Anything above it is refused HERE, with a
 *  reason, instead of being judged on screen and then silently dropped on upload. 130 cm is a ~1.03 s flight. */
export const MAX_VERTICAL_CM = 130;
/** Why a closed attempt was not measured. The route's own error codes, so a screen says what the route would. */
export type DunkRefusal = 'implausible_vertical' | 'implausible_flight';

/** What a screen can say about a refused attempt. */
export function refusalLine(r: DunkRefusal): string {
  return r === 'implausible_vertical'
    ? `Not counted: that read over ${MAX_VERTICAL_CM} cm, so the camera lost your feet. Go again.`
    : 'Not counted: the camera never saw you land. Keep your feet in the shot and go again.';
}

export type DunkFamily =
  | 'BETWEEN-THE-LEGS' | 'WINDMILL' | '360' | 'TOMAHAWK' | 'ONE-HAND JAM' | 'TWO-HAND JAM' | 'ATTEMPT';

export interface DunkMetrics {
  flightTimeMs: number;
  verticalCm: number;             // g·t²/8 — flight physics, not integrated accel
  approachSpeed: number;          // hip image-units/s over the 0.5s before takeoff
  takeoff: 'one-foot' | 'two-foot';
  rotationDeg: number;            // shoulder-line roll across the flight
  wristArc: number;               // total wrist path length while airborne (image units)
  wristBelowHip: boolean;         // a hand went under the hips mid-air
  bothHandsHigh: boolean;         // both wrists above the head at apex
  landingStability: number;       // 0..1 — hip stillness in the 0.4s after landing
  family: DunkFamily;
}

export interface IrlDunkScores { difficulty: number; execution: number; style: number }

/** PRQ-relative difficulty: a 60cm vert from a PRQ-50 athlete is not the same
 *  dunk as a 60cm vert from a PRQ-90 athlete. The panel scores the feat,
 *  not just the number. */
export function scoreIrlDunk(m: DunkMetrics, prqOverall: number): IrlDunkScores {
  const FAMILY_TIER: Record<DunkFamily, number> = {
    'ATTEMPT': 1.5, 'ONE-HAND JAM': 3, 'TWO-HAND JAM': 3.5, 'TOMAHAWK': 5,
    '360': 7, 'WINDMILL': 7.5, 'BETWEEN-THE-LEGS': 8,
  };
  // expected vert for this athlete's measured level (40cm at PRQ 0 → 90cm at 100)
  const expectedCm = 40 + (Math.max(0, Math.min(100, prqOverall)) / 100) * 50;
  // NB: the clamp floor must stay LOW or ordinary verts all pile onto it and
  // the PRQ relativity vanishes (measured: 0.4 floored PRQ-60 and PRQ-95 to
  // the same score for a 30cm jump).
  const vertRatio = Math.max(0.15, Math.min(1.5, m.verticalCm / expectedCm));

  const difficulty = Math.max(0, Math.min(10,
    FAMILY_TIER[m.family] * (0.55 + 0.45 * vertRatio) + (m.takeoff === 'one-foot' ? 0.5 : 0)));
  const execution = Math.max(0, Math.min(10,
    4 + m.landingStability * 4 + Math.min(2, m.flightTimeMs / 350)));
  const style = Math.max(0, Math.min(10,
    2 + Math.min(3, m.approachSpeed * 2.2) + Math.min(3, m.rotationDeg / 120) + Math.min(2, m.wristArc * 1.2)));
  return {
    difficulty: Math.round(difficulty * 10) / 10,
    execution: Math.round(execution * 10) / 10,
    style: Math.round(style * 10) / 10,
  };
}

// ── the tracker ────────────────────────────────────────────────────────────

type Phase = 'idle' | 'calibrating' | 'ready' | 'airborne' | 'settling';

export class DunkTracker {
  private phase: Phase = 'idle';
  private floorY = 0;
  private calibration: number[] = [];
  private hipTrail: { t: number; x: number; y: number }[] = [];
  private airFrames: TrackerFrame[] = [];
  private takeoffAt = 0;
  private landedAt = 0;
  private preFrames: TrackerFrame[] = [];
  private result: DunkMetrics | null = null;
  private refusal: DunkRefusal | null = null;

  /** Reset for the next attempt. */
  reset(): void {
    this.phase = 'idle';
    this.floorY = 0;
    this.calibration = [];
    this.hipTrail = [];
    this.airFrames = [];
    this.preFrames = [];
    this.result = null;
    this.refusal = null;
  }

  get state(): Phase { return this.phase; }
  get lastResult(): DunkMetrics | null { return this.result; }
  /** The refusal of the attempt that just closed, handed over once (feed() returns null for it). */
  takeRefusal(): DunkRefusal | null { const r = this.refusal; this.refusal = null; return r; }

  private lm(f: TrackerFrame, idx: number): TrackerLandmark | null {
    const p = f.landmarks[idx];
    return p && p.visibility >= MIN_VIS ? p : null;
  }

  /** Feed one pose frame. Returns the DunkMetrics once, when the landing settles. */
  feed(f: TrackerFrame): DunkMetrics | null {
    if (!f.present) return null;
    const la = this.lm(f, DUNK_POSE_IDX.leftAnkle);
    const ra = this.lm(f, DUNK_POSE_IDX.rightAnkle);
    const lh = this.lm(f, DUNK_POSE_IDX.leftHip);
    const rh = this.lm(f, DUNK_POSE_IDX.rightHip);
    if (!la || !ra || !lh || !rh) return null;

    // The LOWER ankle (y is down): a foot still on the floor keeps the body grounded. The mean let one lifted
    // foot carry a planted one over the line, so a step read as a jump. The floor is calibrated on the SAME
    // signal: a mean floor under a lower-ankle signal moved both lines by half the feet's stagger (a split
    // stance needed a taller rise to take off and landed early).
    const lowAnkleY = Math.max(la.y, ra.y);
    const hip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    // adapter.detect() hands back the same frame until the video advances; a repeat adds nothing to the trail
    const last = this.hipTrail[this.hipTrail.length - 1];
    if (!last || f.timestampMs > last.t) this.hipTrail.push({ t: f.timestampMs, x: hip.x, y: hip.y });
    while (this.hipTrail.length && this.hipTrail[0].t < f.timestampMs - HIP_TRAIL_MS) this.hipTrail.shift();

    switch (this.phase) {
      case 'idle':
        this.phase = 'calibrating';
        this.calibration = [];
        break;
      case 'calibrating':
        this.calibration.push(lowAnkleY);
        if (this.calibration.length >= 20) {         // ~0.65s of stillness
          this.calibration.sort((a, b) => a - b);
          this.floorY = this.calibration[Math.floor(this.calibration.length / 2)];
          this.phase = 'ready';
        }
        break;
      case 'ready': {
        this.preFrames.push(f);
        if (this.preFrames.length > 20) this.preFrames.shift();
        // both feet off the floor line = airborne
        if (lowAnkleY < this.floorY - AIRBORNE_RISE) {
          this.phase = 'airborne';
          this.takeoffAt = f.timestampMs;
          this.airFrames = [f];
        }
        break;
      }
      case 'airborne': {
        this.airFrames.push(f);
        // the first foot back down ends the flight (flight = both feet off)
        if (lowAnkleY >= this.floorY - AIRBORNE_RISE * 0.5) {
          this.phase = 'settling';
          this.landedAt = f.timestampMs;
        }
        // safety: never settle (occluded landing) — close the attempt anyway
        if (f.timestampMs - this.takeoffAt > MAX_FLIGHT_MS + 1500) {
          this.landedAt = f.timestampMs;
          this.phase = 'settling';
        }
        break;
      }
      case 'settling': {
        if (f.timestampMs - this.landedAt >= SETTLE_MS) {
          this.result = this.compute();
          this.phase = 'ready';
          return this.result;
        }
        break;
      }
    }
    return null;
  }

  private compute(): DunkMetrics | null {
    this.refusal = null;
    const flightMs = this.landedAt - this.takeoffAt;
    if (flightMs < MIN_FLIGHT_MS || this.airFrames.length < 3) return null;   // a hop, not an attempt
    if (flightMs > MAX_FLIGHT_MS) { this.refusal = 'implausible_flight'; return null; }

    const verticalCm = (G * (flightMs / 1000) ** 2) / 8 * 100;
    // checked on the value that is reported (and uploaded), so the tracker and the route agree at the boundary
    if (Math.round(verticalCm * 10) / 10 > MAX_VERTICAL_CM) { this.refusal = 'implausible_vertical'; return null; }

    // approach speed: hip travel over the 0.5s before takeoff
    const pre = this.hipTrail.filter((p) => p.t <= this.takeoffAt && p.t >= this.takeoffAt - APPROACH_MS);
    let travel = 0;
    for (let i = 1; i < pre.length; i++) travel += Math.hypot(pre[i].x - pre[i - 1].x, pre[i].y - pre[i - 1].y);
    const spanS = pre.length > 1 ? (pre[pre.length - 1].t - pre[0].t) / 1000 : 0;
    const approachSpeed = spanS > 0.1 ? travel / spanS : 0;

    // takeoff feet: ankle SEPARATION at takeoff (a one-foot gather steps)
    const t0 = this.preFrames[this.preFrames.length - 1] ?? this.airFrames[0];
    const la0 = t0.landmarks[DUNK_POSE_IDX.leftAnkle], ra0 = t0.landmarks[DUNK_POSE_IDX.rightAnkle];
    const ankleSep = la0 && ra0 ? Math.abs(la0.x - ra0.x) : 0;
    const takeoff = ankleSep > 0.12 ? 'one-foot' : 'two-foot';

    // rotation: shoulder-line roll, takeoff → apex
    const apex = this.airFrames[Math.floor(this.airFrames.length / 2)];
    const roll = (f: TrackerFrame): number => {
      const ls = f.landmarks[DUNK_POSE_IDX.leftShoulder], rs = f.landmarks[DUNK_POSE_IDX.rightShoulder];
      return ls && rs ? Math.atan2(rs.y - ls.y, rs.x - ls.x) : 0;
    };
    const rotationDeg = Math.abs(((roll(apex) - roll(t0)) * 180) / Math.PI);

    // arms: wrist path + signals
    let wristArc = 0;
    let wristBelowHip = false;
    let bothHandsHigh = false;
    for (let i = 0; i < this.airFrames.length; i++) {
      const f = this.airFrames[i];
      const lw = f.landmarks[DUNK_POSE_IDX.leftWrist], rw = f.landmarks[DUNK_POSE_IDX.rightWrist];
      const lh2 = f.landmarks[DUNK_POSE_IDX.leftHip], rh2 = f.landmarks[DUNK_POSE_IDX.rightHip];
      const nose = f.landmarks[DUNK_POSE_IDX.nose];
      if (lw && rw) {
        if (i > 0) {
          const pf = this.airFrames[i - 1];
          const plw = pf.landmarks[DUNK_POSE_IDX.leftWrist], prw = pf.landmarks[DUNK_POSE_IDX.rightWrist];
          if (plw && prw) wristArc += Math.hypot(lw.x - plw.x, lw.y - plw.y) + Math.hypot(rw.x - prw.x, rw.y - prw.y);
        }
        if (lh2 && rh2 && (lw.y > (lh2.y + rh2.y) / 2 + 0.05 || rw.y > (lh2.y + rh2.y) / 2 + 0.05)) wristBelowHip = true;
        if (nose && lw.y < nose.y && rw.y < nose.y) bothHandsHigh = true;
      }
    }

    // landing stability: hip travel in the 0.4s after touchdown
    const post = this.hipTrail.filter((p) => p.t >= this.landedAt && p.t <= this.landedAt + 400);
    let sway = 0;
    for (let i = 1; i < post.length; i++) sway += Math.hypot(post[i].x - post[i - 1].x, post[i].y - post[i - 1].y);
    const landingStability = Math.max(0, Math.min(1, 1 - sway / 0.35));

    const family: DunkFamily =
      wristBelowHip ? 'BETWEEN-THE-LEGS'
      : rotationDeg > 140 ? '360'
      : wristArc > 1.6 ? 'WINDMILL'
      : bothHandsHigh ? 'TWO-HAND JAM'
      : wristArc > 0.9 ? 'TOMAHAWK'
      : 'ONE-HAND JAM';

    return {
      flightTimeMs: Math.round(flightMs),
      verticalCm: Math.round(verticalCm * 10) / 10,
      approachSpeed: Math.round(approachSpeed * 100) / 100,
      takeoff,
      rotationDeg: Math.round(rotationDeg),
      wristArc: Math.round(wristArc * 100) / 100,
      wristBelowHip,
      bothHandsHigh,
      landingStability: Math.round(landingStability * 100) / 100,
      family,
    };
  }
}
