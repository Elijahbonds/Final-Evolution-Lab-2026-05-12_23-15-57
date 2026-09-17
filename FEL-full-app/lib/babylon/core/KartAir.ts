// KART AIR — the ramp, the flight, the trick and the landing.
//
// The kart had no airborne state at all: no ramps, no air, nothing to do in it. Rather than invent a second trick
// vocabulary beside the one skate, snow and surf already share, this borrows that one — BoardTrick's shape, and its
// fitsAir / basePts / scoreTrick / heldTrickDir helpers — and adds the four rows a kart can actually throw while
// strapped into a seat. A kart cannot kickflip. It can rotate, it can pull the nose up, and it can hold a wheelie
// through the air.
//
// WHY AIR TIME IS THE GATE, AND NOT A BOOST FLAG. The ask was "karting tricks after a boost off a ramp", and the
// cheap way to build that is a boolean: boosting && onRamp -> tricks allowed. What is here instead is physics, and it
// produces the same rule for a better reason. Air time from a ramp is 2·v·sin(pitch)/g, so:
//
//   ramp     pitch   at 26 m/s   at 35 m/s (boosting)
//   kicker     9°    0.42 s air  0.56 s air
//   jump      15°    0.69 s      0.92 s
//   gap       18°    0.82 s      1.10 s
//
// and each trick's airSec is set BETWEEN two of those, so every row is reachable and every row is earned:
//
//   NOSE LIFT   0.46   a boosted kicker, never a cold one
//   HALF SPIN   0.64   a cold jump
//   FULL SPIN   0.86   a boosted jump, or nothing
//   BACK FLIP   1.02   a boosted gap only
//
// and every trick already declares the `airSec` it needs. So a kicker taken cold gives you a hop and nothing fits;
// the same kicker with the boost lit gives you enough for a NOSE LIFT; and the big rotations only ever fit off a
// boosted jump or gap. Boost buys air, air buys tricks, and nothing has to be special-cased — which also means a
// faster kart out of the garage changes what it can throw, for free.
//
// Pure: numbers and BoardTrick rows. No scene, no meshes, no input polling.
//
// THE CLIPS ARE REGISTERED ONES (BOARD-10PHASE P10). The first cut of this table gave all four rows `clip:
// 'kart_air'`, which is not a registered clip and never was — BoardTricks' own field comment says never to invent
// one, because an unregistered name renders the body in BIND POSE. clipScope.test.ts could not catch it either:
// it only checks names it RECOGNISES against a mode's scope, so an invented name passes straight through. The
// rows now ride board_tuck (the nose lift is a held pose) and board_air (the rotations, whose angle comes from
// spinDeg/flipDeg, exactly as the board table's spins do), and velocitykart's clip scope owns the board suite to
// match. Note that VelocityKartMode currently PARKS the driver's animator, so nothing plays these yet; the point
// is that the day it stops parking it, the names resolve to real motion instead of a T-pose.

import {
  type BoardTrick, basePts, fitsAir, heldTrickDir, scoreTrick,
} from './BoardTricks';

/** Arcade gravity for kart air — about 2x real, which is what keeps a jump readable rather than floaty. */
export const KART_AIR_G = 19.6;
/** Below this there is not enough air for anything but a hop, whatever the stick says. */
export const MIN_TRICK_AIR = 0.34;
/** A trick still turning when the wheels touch lands dirty, scaled by how far through it got. */
export const BAIL_BELOW = 0.55;
/** Degrees of yaw error at touchdown that costs the whole landing bonus. */
export const LANDING_YAW_TOLERANCE = 55;

const T = (t: Omit<BoardTrick, 'discipline' | 'kind'>): BoardTrick =>
  ({ ...t, discipline: 'kart', kind: 'air' });

/**
 * What a kart can throw. Four, deliberately: a seated driver has a narrow vocabulary, and four readable tricks
 * beat twelve that all look like the car wobbling. `btn` and `dir` follow the board mapping so the BUTTONS map on
 * the start screen reads them without a special case.
 */
export const KART_TRICKS: readonly BoardTrick[] = [
  T({ id: 'kart_nose', label: 'NOSE LIFT', dir: 'up', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'none',
      difficulty: 1.2, airSec: 0.46, clip: 'board_tuck' }),
  T({ id: 'kart_spin180', label: 'HALF SPIN', dir: 'left', btn: 'B', spinDeg: 180, flipDeg: 0, grab: 'none',
      difficulty: 1.9, airSec: 0.64, clip: 'board_air' }),
  T({ id: 'kart_spin360', label: 'FULL SPIN', dir: 'right', btn: 'B', spinDeg: 360, flipDeg: 0, grab: 'none',
      difficulty: 2.8, airSec: 0.86, clip: 'board_air' }),
  T({ id: 'kart_backflip', label: 'BACK FLIP', dir: 'down', btn: 'Y', spinDeg: 0, flipDeg: 360, grab: 'none',
      difficulty: 3.6, airSec: 1.02, clip: 'board_air' }),
];

export const kartTrickById = (id: string): BoardTrick | null =>
  KART_TRICKS.find((t) => t.id === id) ?? null;

/**
 * Pick the trick the stick and button asked for, IF it fits the air available.
 *
 * Returns the asked-for trick or null — deliberately not "the nearest thing that fits". A player who flicks for a
 * FULL SPIN off a kicker should be told there was not enough air, not silently handed a HALF SPIN they did not
 * ask for and cannot tell apart on the replay.
 */
export function kartTrickFor(
  dir: BoardTrick['dir'], btn: BoardTrick['btn'], airSec: number,
): { trick: BoardTrick | null; refusal: string | null } {
  if (airSec < MIN_TRICK_AIR) return { trick: null, refusal: 'NO AIR' };
  const asked = KART_TRICKS.find((t) => t.dir === dir && t.btn === btn);
  if (!asked) return { trick: null, refusal: null };
  if (!fitsAir(asked, airSec)) return { trick: null, refusal: `NOT ENOUGH AIR FOR ${asked.label}` };
  return { trick: asked, refusal: null };
}

/** The biggest trick that WOULD fit this much air — for the hint on the ramp, not for silent substitution. */
export function biggestFitting(airSec: number): BoardTrick | null {
  const fits = KART_TRICKS.filter((t) => fitsAir(t, airSec));
  return fits.length ? fits.reduce((a, b) => (basePts(b) > basePts(a) ? b : a)) : null;
}

/**
 * Did the kart pass `lip` this frame, measured as distance along the lap?
 *
 * Measured along the line rather than by touching the ramp mesh, because at 26 m/s a kart covers 0.43 m a frame
 * and a contact test misses between frames. The wrap case is the one worth having a test for: on the frame the
 * kart crosses the start line, `now` is a small number and `prev` is nearly a full lap, so a naive prev < lip <= now
 * silently stops firing for every ramp on the lap.
 */
export function crossedLip(prev: number, now: number, lip: number, lapLength: number): boolean {
  if (lapLength <= 0) return false;
  const wrapped = now < prev - lapLength * 0.5;
  return wrapped ? (prev < lip || lip <= now) : (prev < lip && lip <= now);
}

export interface KartAirState {
  airborne: boolean;
  /** Seconds since the wheels left. */
  t: number;
  /** Vertical velocity, m/s. */
  vy: number;
  /** Height above the road, metres. */
  height: number;
  /** Air time predicted at launch — what gates the trick list. */
  airSec: number;
  /** True when the launch happened with the boost lit. */
  boosted: boolean;
  trick: BoardTrick | null;
  /** Degrees of the trick's rotation completed so far. */
  spun: number;
  /** Set for one frame on touchdown. */
  landed: KartLanding | null;
  /** Set for one frame when a trick was asked for and could not be thrown. */
  refusal: string | null;
}

export interface KartLanding {
  /** 0..1 — how cleanly it came down. 1 is straight and complete. */
  clean01: number;
  /** Trick score, already scaled by clean01. 0 when nothing was thrown. */
  pts: number;
  trick: BoardTrick | null;
  /** True when the trick was still turning at touchdown. */
  bailed: boolean;
  /** How far through the trick it got, 0..1. */
  progress01: number;
  airSec: number;
}

export const idleAir = (): KartAirState => ({
  airborne: false, t: 0, vy: 0, height: 0, airSec: 0, boosted: false,
  trick: null, spun: 0, landed: null, refusal: null,
});

/**
 * Leave a ramp.
 *
 * `pitch` is the ramp's take-off angle in degrees and `speed` the kart's speed along the road, so a faster kart off
 * the same ramp gets more air and the garage's top-speed trade shows up in the air as well as on the straight.
 */
export function launch(
  state: KartAirState, opts: { speed: number; pitchDeg: number; boosting: boolean },
): KartAirState {
  const vy = Math.max(0, opts.speed) * Math.sin((opts.pitchDeg * Math.PI) / 180);
  return {
    ...idleAir(),
    airborne: true,
    vy,
    airSec: (2 * vy) / KART_AIR_G,
    boosted: opts.boosting,
  };
}

/** Ask for a trick mid-air. Returns the state with the trick attached, or with a refusal to show. */
export function startTrick(
  state: KartAirState, stickX: number, stickY: number, btn: BoardTrick['btn'],
): KartAirState {
  if (!state.airborne) return { ...state, refusal: 'NOT IN THE AIR' };
  if (state.trick) return { ...state, refusal: 'ALREADY IN A TRICK' };
  // remaining air, not total: a trick asked for halfway up has less time than one asked for at the lip
  const left = Math.max(0, state.airSec - state.t);
  const { trick, refusal } = kartTrickFor(heldTrickDir(stickX, stickY), btn, left);
  return trick ? { ...state, trick, spun: 0, refusal: null } : { ...state, refusal };
}

/**
 * One frame of flight. `groundY` is the road height under the kart, `kartY` its current height.
 *
 * Landing quality is yaw error at touchdown times trick completion. Both matter and neither alone is enough: a
 * perfectly straight landing with a half-finished backflip is still a bail, and a completed spin that comes down
 * sideways still costs.
 */
export function stepAir(
  state: KartAirState, dt: number, opts: { groundClearance: number; yawErrorDeg: number },
): KartAirState {
  if (!state.airborne) return { ...state, landed: null, refusal: null };

  const t = state.t + dt;
  const vy = state.vy - KART_AIR_G * dt;
  const height = Math.max(0, state.height + (state.vy + vy) * 0.5 * dt);
  const spun = state.trick
    ? Math.min(Math.abs(state.trick.spinDeg || state.trick.flipDeg || 360),
               state.spun + (Math.abs(state.trick.spinDeg || state.trick.flipDeg || 360) / Math.max(0.05, state.trick.airSec)) * dt)
    : 0;

  const touching = opts.groundClearance <= 0 && vy <= 0;
  if (!touching) {
    return { ...state, t, vy, height, spun, landed: null, refusal: null };
  }

  const total = state.trick
    ? Math.abs(state.trick.spinDeg || state.trick.flipDeg || 360) : 0;
  const progress01 = state.trick ? (total > 0 ? Math.min(1, spun / total) : 1) : 1;
  const yaw01 = Math.max(0, 1 - Math.abs(opts.yawErrorDeg) / LANDING_YAW_TOLERANCE);
  const bailed = !!state.trick && progress01 < BAIL_BELOW;
  const clean01 = Math.max(0, Math.min(1, yaw01 * (state.trick ? progress01 : 1)));

  return {
    ...idleAir(),
    landed: {
      clean01,
      pts: state.trick ? Math.round(scoreTrick(state.trick, clean01)) : 0,
      trick: state.trick,
      bailed,
      progress01,
      airSec: state.airSec,
    },
  };
}

/**
 * What a landing is worth to the shared boost meter.
 *
 * Graded against core/BoostKit's own earn table rather than a second currency — the owner's call on the racing
 * lane was that kart and aero grade against the shared boost, never build their own.
 */
export function boostEarnFor(landing: KartLanding): { what: 'trickBig' | 'trickSmall' | 'landingClean'; scale: number } | null {
  if (landing.bailed) return null;
  if (landing.trick) {
    const big = basePts(landing.trick) >= basePts(KART_TRICKS[2]);
    return { what: big ? 'trickBig' : 'trickSmall', scale: landing.clean01 };
  }
  // no trick, but a clean touchdown off a real jump is still worth something
  return landing.airSec >= MIN_TRICK_AIR && landing.clean01 > 0.7
    ? { what: 'landingClean', scale: landing.clean01 }
    : null;
}
