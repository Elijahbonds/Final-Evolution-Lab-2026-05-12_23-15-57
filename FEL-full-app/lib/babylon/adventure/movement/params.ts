/**
 * The Adventure's traversal tuning (lane A1; docs/ADVENTURE-PLAN.md, pillar 1 "Movement").
 *
 * EVERY NUMBER HERE IS A STARTING VALUE, marked [TUNE]: the owner's eye on a pad, a phone and a keyboard is the judge
 * (CLAUDE.md: a tuned feel number is flagged, never silent). The plan fixed a few of them (jog 6, run 9, a FLOW top of
 * 14, homing in a 45° cone inside 9 m at 22 m/s, lean +3 / −4 m/s², a 24 m/s rail top); the rest are chosen here and
 * listed in the lane report.
 *
 * Feel references are feel only (the plan's IP line): a momentum runner whose speed BUILDS on a straight, a jump that is
 * also an attack, a dash that snaps to a target and bounces off it so targets chain, rails you land on and ride.
 */

import type { ActorStats, PrqBand } from '../contracts';
import { arcadeParamsFromPRQ } from '@/lib/loco/movement';
import { MAX_SPEED_MULT, MIN_SPEED_MULT } from '@/lib/babylon/core/PrqVitals';
import { clamp } from './math';

/**
 * FreeRunCore's momentum gates, copied by value: FreeRunCore imports LandingSystem, which pulls Babylon in, and the
 * sim must stay Babylon-free (the plan's rule; movement/purity.test.ts walks the imports). params.test.ts pins both
 * numbers to FreeRunCore's, so they cannot drift apart.
 */
export const FREERUN_WALK_MAX = 3.2;
export const FREERUN_SPRINT_GATE = 5.2;

export interface GroundParams {
  /** m/s at a part tilt (below `jogTilt`). [TUNE] plan: 6. */
  jogSpeed: number;
  /** m/s at full tilt with an empty FLOW meter. [TUNE] plan: 9. */
  runSpeed: number;
  /** Top speed per FLOW tier 0..3 (FreeRunFlow's tiers); tier 3 is the plan's 14. [TUNE] */
  flowTopSpeeds: readonly [number, number, number, number];
  /** Stick magnitude at and above which the runner runs rather than jogs. [TUNE] */
  jogTilt: number;
  /** m/s² from a standstill up to the run speed: quick off the mark. [TUNE] */
  accel: number;
  /** m/s² above the run speed toward the tier's top: the "speed builds" creep. [TUNE] */
  buildAccel: number;
  /** m/s² with the stick released. [TUNE] */
  decel: number;
  /** m/s² while skidding through a reversal. [TUNE] */
  skidDecel: number;
  /** A wish this far (rad) off the heading at speed is a skid, not a turn. [TUNE] */
  skidAngle: number;
  /** m/s² above the current top (after a slope or a dash) while the stick is held: momentum is kept, slowly. [TUNE] */
  overspeedDecay: number;
  /** Held dash (sprint) multiplies the acceleration; A2 spends the stamina for it. [TUNE] */
  sprintAccelMult: number;
  /** The hard cap on the ground, slopes included. [TUNE] */
  maxSpeed: number;
  /** Heading turn rate at the run speed and below (rad/s) and at the FLOW top: wide turns at speed. [TUNE] */
  turnRate: number;
  turnRateAtTop: number;
  /** m/s² of gravity along the ground per unit of slope sine: downhill adds speed, uphill costs it. [TUNE] */
  slopeGravity: number;
  /** Uphill, the top speed the legs hold drops by this × the slope's sine (floored at 40%). [TUNE] */
  uphillTopLoss: number;
  /** The tallest rise walked up in one tick, and the furthest drop stuck to rather than fallen off (m). [TUNE] */
  stepUp: number;
  stepDown: number;
  /** Radial stick deadzone, rescaled (a worn pad's drift and a thumb resting on the touch stick do nothing). [TUNE] */
  deadzone: number;
  /** FLOW gained per second running at ≥ 90% of the current top on a straight (FreeRunFlow meter). [TUNE] */
  runFlowPerSec: number;
  /** FLOW lost per second in a skid. [TUNE] */
  skidFlowPerSec: number;
}

export interface AirParams {
  /** m/s². Snappier than 9.81: a platformer jump, not a ballistic one. [TUNE] */
  gravity: number;
  /** Take-off speed: apex = v² / 2g ≈ 2.2 m. [TUNE] */
  jumpSpeed: number;
  /** Letting go of jump while rising keeps this share of the rise (a short hop on a tap). [TUNE] */
  jumpCutMult: number;
  /** Seconds after running off a ledge that a jump still counts as from the ground. [TUNE] */
  coyoteSec: number;
  /** Seconds a jump pressed just before landing waits for the ground. [TUNE] */
  jumpBufferSec: number;
  /** m/s² of air steering toward the stick. [TUNE] */
  airAccel: number;
  /** The air steering's minimum reach (m/s) when the jump had no run-up. [TUNE] */
  airMinSpeed: number;
  maxFall: number;
  /** The air dash: speed, duration, the lift it gives, and gravity's share while it lasts. [TUNE] */
  airDashSpeed: number;
  airDashSec: number;
  airDashLift: number;
  airDashGravity: number;
}

export interface HomingParams {
  /** Plan: within 9 m. */
  range: number;
  /** HALF-angle of the cone, rad. assumption: the plan's "45° cone" read as ±45° (generous), see the report. [TUNE] */
  coneHalfRad: number;
  /** A target may sit this far above / below the dasher's centre (m). [TUNE] */
  maxAbove: number;
  maxBelow: number;
  /** Plan: a 22 m/s snap. */
  speed: number;
  /** A dash that has not connected by now is a miss. [TUNE] */
  maxSec: number;
  /** Contact = the two radii plus this (m). [TUNE] */
  hitPad: number;
  /** The bounce off a hit: up and a little back, so the next target is in reach. [TUNE] */
  bounceUp: number;
  bounceBack: number;
}

export interface WallParams {
  /** Planar speed needed to take a wall (FreeRunCore's SPRINT_GATE). */
  minSpeed: number;
  /** The kick off the wall: out along the normal, and up. [TUNE] */
  kickOut: number;
  kickUp: number;
}

export interface RailParams {
  /** Plan: a 24 m/s rail top speed. [TUNE] */
  topSpeed: number;
  /** Plan: lean WITH the curve +3 m/s², AGAINST it −4 m/s². */
  leanWith: number;
  leanAgainst: number;
  /** A rail turning less than this (rad/m) is a straight: lean does nothing there, the tuck does. [TUNE] */
  straightTurn: number;
  /** Stick forward along the rail on a straight (a tuck) adds this; back brakes this. [TUNE] */
  tuckAccel: number;
  brakeDecel: number;
  /** m/s² of gravity along the rail per unit of slope sine. [TUNE] */
  gravity: number;
  /** Rolling friction on the rail. [TUNE] */
  friction: number;
  /** THE CATCH (RailMagnet's window, generous on purpose — the owner asked for it). [TUNE] */
  catchReach: number;
  catchAlign: number;
  catchHeightSlack: number;
  /** Metres at each end that do not catch (a lock needs runway; RailMagnet's endBand, in metres). [TUNE] */
  catchEndM: number;
  /** A rider rising faster than this does not catch (you land on a rail). [TUNE] */
  catchMaxRiseSpeed: number;
  /** The least speed a caught rider keeps along the rail. [TUNE] */
  catchMinSpeed: number;
  /** Jumping off: up, and sideways per unit of lean. [TUNE] */
  jumpSpeed: number;
  jumpSide: number;
  /** Lean needed to call a switch, the hop's duration and its arc height. [TUNE] */
  switchLean: number;
  switchSec: number;
  switchArcM: number;
  /** The rail just left does not re-catch for this long. [TUNE] */
  recatchSec: number;
  /** A trick: its duration and base points. [TUNE] */
  trickSec: number;
  trickPoints: number;
  /** The balance needle (GrindManual.BalanceChannel's integrator): its random wander's share, and the curve's push. [TUNE] */
  balanceWander: number;
  curvePush: number;
}

export interface RideParams {
  /** How close the partner must be to mount it (m). [TUNE] */
  mountReach: number;
  /** The hop off a mount (m/s up) and the sideways step (m). [TUNE] */
  dismountHop: number;
  dismountSide: number;
  /** A knock this hard (m/s) throws a rider off. [TUNE] */
  throwOffImpulse: number;
}

export interface MovementParams {
  ground: GroundParams;
  air: AirParams;
  homing: HomingParams;
  wall: WallParams;
  rail: RailParams;
  ride: RideParams;
}

export const DEFAULT_MOVEMENT: Readonly<MovementParams> = Object.freeze({
  ground: Object.freeze({
    jogSpeed: 6, runSpeed: 9, flowTopSpeeds: [9, 10.5, 12.2, 14] as const, jogTilt: 0.6,
    accel: 12, buildAccel: 2.0, decel: 16, skidDecel: 30, skidAngle: 2.3, overspeedDecay: 2.5, sprintAccelMult: 1.5,
    maxSpeed: 22, turnRate: 10, turnRateAtTop: 4.5, slopeGravity: 16, uphillTopLoss: 1.2, stepUp: 0.45, stepDown: 0.6, deadzone: 0.12,
    runFlowPerSec: 40, skidFlowPerSec: 60,
  }),
  air: Object.freeze({
    gravity: 28, jumpSpeed: 11.1, jumpCutMult: 0.45, coyoteSec: 0.1, jumpBufferSec: 0.12, airAccel: 12, airMinSpeed: 6,
    maxFall: 40, airDashSpeed: 17, airDashSec: 0.22, airDashLift: 2, airDashGravity: 0.25,
  }),
  homing: Object.freeze({
    range: 9, coneHalfRad: Math.PI / 4, maxAbove: 5, maxBelow: 9, speed: 22, maxSec: 0.6, hitPad: 0.5,
    bounceUp: 10, bounceBack: 2,
  }),
  wall: Object.freeze({ minSpeed: FREERUN_SPRINT_GATE, kickOut: 7, kickUp: 10 }),
  rail: Object.freeze({
    topSpeed: 24, leanWith: 3, leanAgainst: 4, straightTurn: 0.015, tuckAccel: 1.5, brakeDecel: 6, gravity: 14,
    friction: 0.3, catchReach: 1.4, catchAlign: 0.3, catchHeightSlack: 0.45, catchEndM: 0.25, catchMaxRiseSpeed: 2,
    catchMinSpeed: 4, jumpSpeed: 10, jumpSide: 4, switchLean: 0.5, switchSec: 0.3, switchArcM: 0.9, recatchSec: 0.3,
    trickSec: 0.45, trickPoints: 100, balanceWander: 0.25, curvePush: 0.08,
  }),
  ride: Object.freeze({ mountReach: 2.5, dismountHop: 6, dismountSide: 1.2, throwOffImpulse: 6 }),
}) as Readonly<MovementParams>;

/** Defaults with any group overridden field by field. */
export function movementParams(over: { [K in keyof MovementParams]?: Partial<MovementParams[K]> } = {}): MovementParams {
  return {
    ground: { ...DEFAULT_MOVEMENT.ground, ...over.ground },
    air: { ...DEFAULT_MOVEMENT.air, ...over.air },
    homing: { ...DEFAULT_MOVEMENT.homing, ...over.homing },
    wall: { ...DEFAULT_MOVEMENT.wall, ...over.wall },
    rail: { ...DEFAULT_MOVEMENT.rail, ...over.rail },
    ride: { ...DEFAULT_MOVEMENT.ride, ...over.ride },
  };
}

/** Below this planar speed a runner pivots on the spot (FreeRunCore.WALK_MAX). */
export const PIVOT_SPEED = FREERUN_WALK_MAX;

// ── PRQ: the body you trained, felt in the run (owner rule: never a paywall) ─────────────────────────────────────────

/**
 * How PRQ shapes traversal. `arcadeParamsFromPRQ` is the app's own map ("low PRQ = the base adventure hero, high PRQ
 * approaches the fastest-runner tier"), but its raw scales run 0.6–2.8× — handed straight to a run speed, an ELITE
 * player would run 25 m/s and a RECOVERING one 5. PrqVitals' rule is the authority on how much a band may matter (a
 * fifth, not more; a guest is READY and never penalised), so the scales are taken RELATIVE TO READY, damped, and
 * clamped to PrqVitals' own speed window.
 */
export interface MoveFeel {
  /** Run and FLOW top speed. */
  run: number;
  /** Rail acceleration and top speed. */
  grind: number;
  /** Flight speed. */
  flight: number;
  /** Jump apex (a share of the hang time). */
  hang: number;
}

export const NEUTRAL_FEEL: Readonly<MoveFeel> = Object.freeze({ run: 1, grind: 1, flight: 1, hang: 1 });

/** A representative PRQ score per band (prqGrade's thresholds: 40 / 60 / 80). [TUNE] */
export const BAND_SCORE: Readonly<Record<PrqBand, number>> = { RECOVERING: 30, READY: 50, PRIMED: 70, ELITE: 90 };
/** How much of arcadeParamsFromPRQ's spread reaches the feel. [TUNE] */
export const PRQ_FEEL_DAMP = 0.25;

export function movementFeelFor(stats?: Pick<ActorStats, 'prqBand' | 'attrs'> | null): MoveFeel {
  const band: PrqBand = stats?.prqBand ?? 'READY';
  const mental = stats?.attrs?.mental;
  const neural = Number.isFinite(mental) ? (mental as number) : BAND_SCORE.READY;
  const me = arcadeParamsFromPRQ(BAND_SCORE[band] ?? BAND_SCORE.READY, neural);
  const ref = arcadeParamsFromPRQ(BAND_SCORE.READY, BAND_SCORE.READY);
  const damp = (mine: number, base: number): number =>
    clamp(1 + (mine / base - 1) * PRQ_FEEL_DAMP, MIN_SPEED_MULT, MAX_SPEED_MULT);
  return {
    run: damp(me.movementSpeedScale, ref.movementSpeedScale),
    grind: damp(me.grindAcceleration, ref.grindAcceleration),
    flight: damp(me.flightSpeedScale, ref.flightSpeedScale),
    hang: damp(me.hangTimeMultiplier, ref.hangTimeMultiplier),
  };
}
