// THE BEAT CUT — the stage camera cuts on the downbeat when the combo is up (vis-party, 2026-10-13; docs/VISUAL-PASS-PLAN.md
// Part B, dance: "beat-cut camera: cuts on downbeats at high combo").
//
// The stage camera (stageCamera.ts) sways and pushes on the beat and widens on a streak; this adds the one thing a TV director
// does at a peak: a hard CUT on the bar's downbeat to another angle on the same dancer — a low shot from one side, a high one
// from the other, a wide one — held for the bar. It changes where the camera stands, never what is judged: nothing here reads a
// step, a window or a score, and the camera is the dancer's only view, so it is flagged TUNED in the lane report (the owner's eye).
//
// SAFETY RULES, each held by a test:
//   · only at a high streak (CUT_STREAK) and only on a live bar (the count-in and the menu keep the neutral shot);
//   · never under the "still camera" comfort setting or reduced motion (the same switch stillCameraPref reads);
//   · the camera stays on the AUDIENCE side — the yaw is bounded (±22°), so it can never swing round behind the dancer and
//     into the LED wall and the crowd that stand there;
//   · the shot only ever backs off (distScale ≥ 1) and is clamped to the stage camera's own max distance — the whole body stays
//     in frame on every aspect the neutral shot frames it on (stageCamera.framesFullBody).
// Pure: a function of the bar index and the streak, so a pause holds the shot and a count-back-in resyncs it.

export interface CutShot {
  /** Radians the camera orbits the dancer from the audience-side line (+ = toward the dancer's right). */
  yawRad: number;
  /** Added to the neutral camera height (m). */
  heightM: number;
  /** Multiplies the neutral distance (never below 1). */
  distScale: number;
  /** Added to the aim height (m): a low shot looks up a little more, a high one down. */
  aimM: number;
}

/** TUNED (new): the streak at which the cuts begin (the stage camera's own streak widen is full at 24). */
export const CUT_STREAK = 16;

/** TUNED (new): the shots, one a bar, round-robin. The first is the neutral frame so a cut always has somewhere to come back to. */
export const CUT_SHOTS: readonly CutShot[] = [
  { yawRad: 0, heightM: 0, distScale: 1, aimM: 0 },
  { yawRad: -0.38, heightM: -0.45, distScale: 1.04, aimM: 0.25 },    // low, from the left: looks up at the dancer
  { yawRad: 0.38, heightM: 0.5, distScale: 1.06, aimM: -0.1 },       // high, from the right
  { yawRad: 0, heightM: 0.15, distScale: 1.18, aimM: 0 },            // wide, square on
];

/** The shot for bar `barIndex`, or null when the neutral stage camera should stand (no cut). Pure. */
export function cutShotFor(barIndex: number, streak: number, calm: boolean): CutShot | null {
  if (calm || barIndex < 0 || streak < CUT_STREAK) return null;
  return CUT_SHOTS[Math.floor(barIndex) % CUT_SHOTS.length];
}

/** True on the frame the bar number moves on while a cut is live: the frame the camera hard-cuts rather than glides. */
export function isCutFrame(prevBar: number, barIndex: number, streak: number, calm: boolean): boolean {
  return barIndex !== prevBar && cutShotFor(barIndex, streak, calm) !== null;
}

export interface CutFrame { x: number; z: number; heightM: number; targetAddM: number }

/**
 * Apply a shot to the neutral camera offset (x, z from the dancer) and height: orbit the offset by the shot's yaw, back it off by
 * `distScale` up to `maxDistanceM`, and lift the height. Returns the neutral frame untouched for a null shot. Writes `out`.
 */
export function applyCut(shot: CutShot | null, x: number, z: number, heightM: number, maxDistanceM: number, out: CutFrame): CutFrame {
  if (!shot) { out.x = x; out.z = z; out.heightM = heightM; out.targetAddM = 0; return out; }
  const d = Math.hypot(x, z);
  const k = d > 1e-6 ? Math.min(Math.max(1, shot.distScale), maxDistanceM / d) : 1;
  const c = Math.cos(shot.yawRad), s = Math.sin(shot.yawRad);
  out.x = (x * c - z * s) * k;
  out.z = (x * s + z * c) * k;
  out.heightM = heightM + shot.heightM;
  out.targetAddM = shot.aimM;
  return out;
}
