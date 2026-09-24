// Dribble — the ball leaves the hand. Until 2026-09-03 the ball was parented
// to the palm in every basketball mode, so a drive read as carrying. This is
// the pure cycle: where the ball is between palm and floor at time t, and
// where the hand should be to meet it (the hand IK target). No scene.
export interface DribbleParams {
  /** Palm height above the character root when the ball is in hand (m). */
  palmY: number;
  /** Ball radius (m) — the floor contact height. */
  ballR: number;
  /** Bounces per second standing still / at full speed. */
  hzIdle: number;
  hzFast: number;
  /** Sideways offset of the dribble from the root centre (+ = the hand's side). */
  side: number;
  /** Forward offset from the root centre. */
  forward: number;
  /** How far below the palm the hand follows the ball before waiting for it. */
  followDepth: number;
}

// The forged hero's arm (Arm→ForeArm→Hand) is 0.55 m from a 1.47 m shoulder,
// so a standing hand hangs at ~0.92 m. The palm height is the hanging hand;
// the follow depth asks a little more and the solver clamps to full reach,
// which reads as reaching for the ball (measured on the node test rig).
export const DEFAULT_DRIBBLE: DribbleParams = {
  palmY: 0.98, ballR: 0.12, hzIdle: 1.7, hzFast: 2.6, side: 0.26, forward: 0.16, followDepth: 0.12,
};

export interface DribbleState {
  /** 0..1 within the bounce; 0 = ball at the palm, 0.5 = on the floor. */
  phase: number;
  /** Ball centre height above the root (m). */
  ballY: number;
  /** Where the palm should be, in root-local metres (x = side, y, z = forward). */
  hand: { x: number; y: number; z: number };
  /** 1 when the hand is on the ball, easing toward 0.6 while it waits at the top. */
  handWeight: number;
  /** The ball's local position for the same frame. */
  ball: { x: number; y: number; z: number };
}

/** Advance the phase by dt at the cadence for `speed01`; returns the new phase. */
export function advancePhase(phase: number, dtSec: number, speed01: number, p: DribbleParams = DEFAULT_DRIBBLE): number {
  const hz = p.hzIdle + (p.hzFast - p.hzIdle) * Math.min(1, Math.max(0, speed01));
  const next = phase + dtSec * hz;
  return next - Math.floor(next);
}

/** Ball and hand for a phase. The ball falls and rises on a parabola in time
 *  (quadratic, like gravity); the hand rides it down `followDepth`, then waits
 *  for it to come back up and meets it at the palm. */
export function dribbleAt(phase: number, p: DribbleParams = DEFAULT_DRIBBLE): DribbleState {
  const ph = phase - Math.floor(phase);
  const u = 2 * ph - 1;                 // -1 at palm, 0 on the floor, +1 back at palm
  const ballY = p.ballR + (p.palmY - p.ballR) * u * u;
  const handFloor = p.palmY - p.followDepth;
  const onBall = ballY + p.ballR;       // palm on top of the ball
  const handY = Math.max(onBall, handFloor);
  const gap = handY - onBall;           // 0 while touching the ball
  const handWeight = gap <= 1e-6 ? 1 : Math.max(0.6, 1 - gap / (p.palmY - handFloor));
  return {
    phase: ph,
    ballY,
    ball: { x: p.side, y: ballY, z: p.forward },
    hand: { x: p.side, y: handY, z: p.forward },
    handWeight,
  };
}

/**
 * Lift a dribble so the WHOLE stroke is inside the arm's reach.
 *
 * WHY (2026-09-20, owner: "fix the dribbling and running to look more like a basketball player"). The defaults put
 * the palm at 0.98 m and followed the ball 0.12 m down — a stroke bottoming at 0.86 m. The forged hero's hand cannot
 * get below about 0.92 m (shoulder 1.43 m, arm 0.486 m), so the solver clamped the bottom half away and the hand
 * moved about 6 cm of the 12 cm asked for. Measured on the runway: the ball travelled 0.853 m while the dribbling
 * hand travelled 0.177 m — and the OFF hand, which is doing nothing but riding the torso, travelled 0.16 m. The hand
 * was not dribbling the ball, it was hanging beside it.
 *
 * The author's `followDepth` is the intent and is kept exactly; only the palm moves, and only upward, and only as far
 * as it must. A body with a long enough arm is left alone.
 *
 * HOOPS-DEPTH S8 (2026-09-23): and the stroke's bottom stops DRIBBLE_ELBOW_HEADROOM short of the straight arm. Fitted to the
 * lowest hand exactly, every bounce bottomed out on a locked elbow: in a live 3v3 the ball arm averaged 150-165 degrees on the
 * dribbling loops and both arms read straight on 71 of 208 jog frames (body smoke). A dribbler's elbow stays bent at the bottom.
 */
export const DRIBBLE_ELBOW_HEADROOM = 0.1;
export function fitDribbleToReach(p: DribbleParams, lowestHandY: number, headroom = DRIBBLE_ELBOW_HEADROOM): DribbleParams {
  if (!Number.isFinite(lowestHandY) || !Number.isFinite(p.palmY) || !Number.isFinite(p.followDepth)) return p;
  const needed = lowestHandY + Math.max(0, headroom) + p.followDepth;
  return needed > p.palmY ? { ...p, palmY: needed } : p;
}
