// DYNAMIC POSTURE — the body answers what it is DOING, not just what state it is in (2026-09-12).
//
// Owner: "lets do an aesthetics of movement pass and dynamic posture next across the dunk, 1v1, 3v3 modes".
//
// HoopsPosture already does the hard part: a window resolver and a table of authored stances per window, riding
// PostureLayer onto the thoracic chain. It is good, and none of it is rewritten here. What it is NOT is DYNAMIC:
// the table is a lookup, so a drive at a walking pace and a drive at full speed get the IDENTICAL 12 degree lean,
// and a hard cut looks exactly like running straight. The body reports its STATE and nothing about its MOTION.
//
// Two things fall out of that, and the second is the big one:
//
//   1. NO RESPONSE TO SPEED OR ACCELERATION. A body should lean into acceleration and sit back against the brakes.
//      A pose table cannot express that because it does not know the difference.
//   2. NO LATERAL LEAN AT ALL. Every stance in HOOPS_POSTURE is authored as [x, 0, 0] — pitch only. The z slot is
//      roll, PostureLayer already applies all three axes, and nothing in hoops has ever written it. So a body
//      cutting hard left stays bolt upright, which is the single most obvious thing wrong with how it moves: a
//      human banks INTO a turn, and their head stays level while the chest does it.
//
// So this modulates the authored pose with live motion. The authored table stays the shape of the window; this
// decides how hard the body is living in it. Clip-owned windows (the flight, a knockdown) are left alone — the
// rule is that the layer never argues with a clip that is already doing the job.
//
// Pure: no Babylon, no scene. Every curve here is tunable and testable without a game running.

import type { PosturePose } from './DunkPosture';

/** What the body is doing, measured rather than declared. */
export interface BodySignals {
  /** 0..1 of top speed. */
  speed01: number;
  /**
   * Lateral acceleration in m/s^2, signed: + turning to the body's RIGHT.
   *
   * This is the bank. It is an acceleration and not a turn rate because banking is a response to the force a
   * turn puts through the body — the same corner taken slowly barely leans at all, which is exactly right.
   */
  lateralAccel: number;
  /** Longitudinal acceleration in m/s^2: + accelerating, − braking. */
  longAccel: number;
  /** 0..1 of how spent the body is: a drained turbo, a long possession, a deep wave. */
  exertion: number;
  /** Off the floor. The flight clips own the body, so the layer stands down. */
  airborne: boolean;
}

export const SIGNALS_IDLE: BodySignals = {
  speed01: 0, lateralAccel: 0, longAccel: 0, exertion: 0, airborne: false,
};

// ── The caps. Every one of these is an anatomical limit, not a taste knob ────────────────────────────────
/** Thoracic roll, degrees. A human spine rolls about this far before the hips have to follow. */
export const MAX_BANK_DEG = 13;
/** How much of the bank the head gives back to keep the horizon. Real bodies level their eyes. */
export const HEAD_LEVEL = 0.75;
/** Lateral acceleration that produces a full bank, m/s^2. Roughly a hard cut. */
export const BANK_FULL_ACCEL = 9;
/** Extra forward lean at full acceleration, degrees. */
export const ACCEL_LEAN_DEG = 7;
/** How far back the body sits under full braking, degrees. */
export const BRAKE_LEAN_DEG = 9;
/** Longitudinal acceleration that saturates the lean, m/s^2. */
export const LEAN_FULL_ACCEL = 8;
/** Extra lean from speed alone at the top end, degrees — a sprint carries further forward than a jog. */
export const SPEED_LEAN_DEG = 5;
/** Rounding and shrug a fully spent body carries, degrees. */
export const TIRED_FORWARD_DEG = 6, TIRED_SHRUG_DEG = 4;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const unit = (v: number, full: number): number => clamp(v / full, -1, 1);

/**
 * The windows this layer is allowed to touch — LOCOMOTION, and nothing else.
 *
 * An ALLOWLIST, deliberately, and it is the most important decision in this file. The obvious shape is a
 * denylist of authored beats, but then every beat anyone adds later is silently modulated by default, and the
 * failure mode is a layer quietly arguing with a clip that already knows what it is doing — which is exactly
 * what froze bodies for three seconds the last time two owners wrote the same bones.
 *
 * So: a body that is MOVING gets dynamic posture. A shot beat, a flight beat, a plant, a stagger and a
 * knockdown are choreography, paced to a meter or a clock, and they are left alone. The dunk's runway is in
 * ('stance'); the dunk's flight is not.
 */
export const HOOPS_DYNAMIC: ReadonlySet<string> = new Set([
  // hoops locomotion. 'spin' here is the PIVOT — a planted turn, which is locomotion.
  'idle', 'run', 'dribble', 'drive', 'protect', 'defend', 'slide', 'post', 'spin', 'footwork',
  // the dunk runway
  'stance',
]);

/**
 * Combat locomotion: the footwork a fighter does between strikes.
 *
 * Every strike, block, parry, react, knockdown and get-up is choreography — a strike's lean is the authored shape of
 * that strike, and modulating it would make a jab pitch forward by however fast the body happened to be moving.
 */
export const COMBAT_DYNAMIC: ReadonlySet<string> = new Set([
  'idle', 'guard', 'advance', 'strafe', 'retreat',
]);

/**
 * Board locomotion: riding, and nothing in the air.
 *
 * THIS IS WHY THE ALLOWLIST IS A PARAMETER. 'spin' means two different things: in hoops it is a planted PIVOT and is
 * locomotion; on a board it is an AIR SPIN and is choreography. One shared set would have started modulating board
 * air tricks the moment combat and boards were added — the collision is the argument.
 */
export const BOARD_DYNAMIC: ReadonlySet<string> = new Set([
  'idle', 'cruise', 'push', 'carve', 'tuck',
]);

/** The hoops set, which was the first one. Kept as the default so existing callers read the same. */
export const DYNAMIC_WINDOWS = HOOPS_DYNAMIC;

/** Is this window the layer's to modulate, against a given discipline's set? */
export function isDynamic(window: string, allow: ReadonlySet<string> = HOOPS_DYNAMIC): boolean {
  return allow.has(window);
}

/**
 * Modulate an authored stance with what the body is actually doing.
 *
 * Returns a NEW pose; the table is never mutated, because it is shared by every body on the floor.
 */
export function dynamicPose(base: PosturePose, s: BodySignals, window = 'run', allow: ReadonlySet<string> = HOOPS_DYNAMIC): PosturePose {
  // anything that is not locomotion is returned untouched: one owner per bone
  if (!isDynamic(window, allow) || s.airborne) return base;

  const sp = clamp(s.speed01, 0, 1);
  const ex = clamp(s.exertion, 0, 1);

  // THE BANK. A cut rolls the chest INTO the turn, split across the two thoracic bones (the upper carries more,
  // which is what a spine does), and the head gives most of it back to keep the eyes level.
  const bank = unit(s.lateralAccel, BANK_FULL_ACCEL) * MAX_BANK_DEG;
  const bank1 = bank * 0.4, bank2 = bank * 0.6;

  // LEAN. Acceleration pitches the body forward, braking sits it back, and speed alone carries it further
  // forward than a standstill does.
  const accel = unit(s.longAccel, LEAN_FULL_ACCEL);
  const leanFromAccel = accel >= 0 ? accel * ACCEL_LEAN_DEG : accel * BRAKE_LEAN_DEG;
  const leanFromSpeed = sp * SPEED_LEAN_DEG;

  return {
    ...base,
    lean: base.lean + leanFromAccel + leanFromSpeed,
    spine1: [base.spine1[0], base.spine1[1], base.spine1[2] + bank1],
    spine2: [base.spine2[0], base.spine2[1], base.spine2[2] + bank2],
    // the head counter-rolls to hold the horizon — the classic reason a banking body still reads as in control
    head: [base.head[0], base.head[1], base.head[2] - bank * HEAD_LEVEL],
    // a spent body rounds forward and carries its shoulders up
    forward: base.forward + ex * TIRED_FORWARD_DEG,
    shrug: base.shrug + ex * TIRED_SHRUG_DEG,
    // and stops looking quite so hard at the rim
    eyes: clamp(base.eyes - ex * 0.15, 0, 1),
  };
}

/**
 * MOTION TRACKER — turns a position or velocity stream into the signals above.
 *
 * Every mode needs the same differentiation and the same smoothing, and raw frame-to-frame velocity deltas are
 * far too noisy to drive a spine: one jittery frame would snap the chest sideways. One tracker, smoothed once.
 */
export class BodyMotion {
  private vx = 0;
  private vz = 0;
  private haveVel = false;
  /** Smoothed accelerations, in the body's own frame. */
  private latAcc = 0;
  private longAcc = 0;
  /** Seconds of smoothing. Short enough to feel immediate, long enough that a spine never twitches. */
  constructor(private readonly tau = 0.12) {}

  /**
   * Feed this frame's velocity and heading.
   *
   * `heading` is the body's yaw, so the acceleration can be resolved into FORWARD and LATERAL — a world-space
   * acceleration tells you nothing about whether a body is braking or turning.
   */
  update(vx: number, vz: number, heading: number, dt: number): void {
    if (dt <= 1e-5) return;
    if (!this.haveVel) { this.vx = vx; this.vz = vz; this.haveVel = true; return; }
    const ax = (vx - this.vx) / dt, az = (vz - this.vz) / dt;
    this.vx = vx; this.vz = vz;
    // resolve into the body's frame: forward is (sin yaw, cos yaw), right is (cos yaw, −sin yaw)
    const s = Math.sin(heading), c = Math.cos(heading);
    const fwd = ax * s + az * c;
    const lat = ax * c - az * s;
    const k = Math.min(1, dt / Math.max(1e-4, this.tau));
    this.longAcc += (fwd - this.longAcc) * k;
    this.latAcc += (lat - this.latAcc) * k;
  }

  /** The signals, ready for dynamicPose. */
  signals(speed01: number, exertion: number, airborne: boolean): BodySignals {
    return {
      speed01,
      lateralAccel: this.latAcc,
      longAccel: this.longAcc,
      exertion,
      airborne,
    };
  }

  /** A teleport (a reset, a check-up) must not read as an enormous acceleration. */
  reset(): void { this.vx = 0; this.vz = 0; this.haveVel = false; this.latAcc = 0; this.longAcc = 0; }
}

// ── ANGULATION — the board half of the ask ───────────────────────────────────────────────────────────────
// Boards are the one discipline that ALREADY banks: BoardPosture.boardBank rolls the ROOT up to 22 degrees, and it is
// driven by the rider's lean rather than the yaw rate, which is right (a slow pivot has no lean in it).
//
// What is missing is ANGULATION. A real rider banks the BOARD and keeps their upper body more upright than it — the
// spine counter-angles against the edge, which is the difference between a snowboarder and a plank on a hinge. Every
// authored board stance is [x, 0, 0], so nothing counter-angles today: the whole body rolls as one rigid piece.
//
// So this is deliberately the OPPOSITE sign to the hoops bank. A cutting basketball player rolls their chest INTO the
// turn because nothing else is tilted; a rider's board is already over, so their chest comes BACK out of it.

/** How much of the root's bank the spine gives back. Real angulation is most of it, not all. */
export const ANGULATION = 0.55;
/** Anatomical cap on the counter-angle, degrees. */
export const MAX_ANGULATION_DEG = 16;

/**
 * Counter-angle a board stance against the root's bank.
 *
 * `rootBankRad` is what boardBank() returned for this frame — positive rolling one way, negative the other. The spine
 * takes the opposite sign, split across the thoracic bones with the upper carrying more, and the head comes back level
 * on top of that, because a rider's eyes stay on the line whatever the board is doing.
 */
export function angulate(base: PosturePose, rootBankRad: number, window: string): PosturePose {
  if (!isDynamic(window, BOARD_DYNAMIC)) return base;
  const deg = -(rootBankRad * 180 / Math.PI) * ANGULATION;
  const capped = Math.max(-MAX_ANGULATION_DEG, Math.min(MAX_ANGULATION_DEG, deg));
  return {
    ...base,
    spine1: [base.spine1[0], base.spine1[1], base.spine1[2] + capped * 0.4],
    spine2: [base.spine2[0], base.spine2[1], base.spine2[2] + capped * 0.6],
    // the head levels against the TOTAL tilt — the board's bank plus the counter-angle the spine just added
    head: [base.head[0], base.head[1], base.head[2] - (rootBankRad * 180 / Math.PI + capped) * HEAD_LEVEL],
  };
}
