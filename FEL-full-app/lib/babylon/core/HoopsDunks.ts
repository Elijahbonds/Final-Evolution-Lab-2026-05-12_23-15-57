// HoopsDunks — WHICH dunk this drive deserves (owner, 2026-09-16: "improve the dunk animations in the 1v1 and 3v3
// modes, add different dunks").
//
// THE FAULT, WHICH IS NOT MISSING CONTENT. Every dunk in both hoops modes played the same two clips — `dunk_launch`
// held to feet-down, then `dunk_land_crouch` — whether you came down the middle at a jog or off the wing at full
// speed through a set body. Meanwhile the dunk contest's whole authored vocabulary (the windmill, the tomahawk, the
// cradle, the double clutch, the 360, the eastbay) is ALREADY REGISTERED on these bodies: ClipScope gives `onevone`
// and `threevthree` the suites `['hoops', 'dunk']`, so the library was sitting there unused. Nothing here authors a
// new clip. It decides which of the ones already on the rig to ask for.
//
// THE READ. A dunk in a game is not a dunk in a contest: you do not choose it from a menu, the drive chooses it. So
// the inputs are the things the drive already knows —
//
//   SPEED      how fast you got there. A windmill needs air; a jog gets a power dunk.
//   ANGLE      straight on, or across the face of the rim. The wind-up dunks want the angle; a baseline drive
//              cradles it. (`lateral01`: 0 = straight at the ring, 1 = running the baseline.)
//   CONTEST    a body in the way. You do not windmill through a chest — you hang and adjust, or you go through him.
//   POSTER     the contact read the mode already computes (checkDriveDunk's 'poster').
//   MOMENTUM   the showtime gate. The 360 and the eastbay only come out when the game is already yours; that is
//              what makes them mean something when they land.
//
// Pure — no Babylon, no scene, no clock — so it is unit-testable, which is the only way to know a table like this
// does what its comment claims.

/** What a picked dunk is: the clip to play, what to call it, and how long the clip was authored to run. */
export interface HoopsDunk {
  /** The registered clip name (ClipScope 'dunk' suite — already on every hoops body). */
  clip: string;
  /** The flight turns the back to the rim (a reverse) instead of squaring up to it. */
  reverse?: boolean;
  /** What the HUD calls it. The dunk contest names its dunks; a game dunk deserves the same. */
  label: string;
  /** The authored length in seconds — a caller fits it to the flight with a speedRatio. */
  sec: number;
  /** Showtime: worth a bigger camera pulse and a louder crowd. */
  flashy: boolean;
}

export interface DunkRead {
  /** Planar closing speed at the take-off, m/s. */
  speed: number;
  /** 0 = driving straight at the ring, 1 = running across its face. */
  lateral01: number;
  /** 0..1 — how much body is in the way (the mode's own contest read). */
  contest01: number;
  /** The mode already distinguishes a clean slam from one over somebody. */
  poster: boolean;
  /** 0..1 — the momentum meter. The showtime dunks are gated on it. */
  momentum01: number;
  /** Injectable for tests; defaults to Math.random. */
  roll?: () => number;
  /** DEFENSE-LOOK (2026-09-17): a STANDING dunk — R2 + Square under the rim with no run-up (checkDriveDunk 'standing'). */
  standing?: boolean;
}

// ── the vocabulary ────────────────────────────────────────────────────────────────────────────────────────────
// Every clip here is one the hoops bodies already register. The seconds are the authored lengths from
// anim/authored/dunkTricks.ts and the finish clips; a caller scales to the real flight.
export const POWER: HoopsDunk = { clip: 'dunk_finish_power', label: 'POWER SLAM', sec: 0.6, flashy: false };   // DUNK-CLIPS (2026-09-17): a flight (hang + hammer), not the 0.35 s launch stretched thin
export const TOMAHAWK: HoopsDunk = { clip: 'dunk_finish_tomahawk', label: 'TOMAHAWK', sec: 0.5, flashy: false };
export const WINDMILL: HoopsDunk = { clip: 'dunk_finish_windmill', label: 'WINDMILL', sec: 0.6, flashy: true };
/** PAUSIN' (2K21): the spin thrown into the takeoff — the 360 through the rise, flashy by definition. */
export const PAUSIN_DUNK: HoopsDunk = { clip: 'dunk_360_spin', label: "PAUSIN'", sec: 0.7, flashy: true };
export const CRADLE: HoopsDunk = { clip: 'dunk_cradle', label: 'CRADLE', sec: 0.75, flashy: true };
export const DOUBLE_CLUTCH: HoopsDunk = { clip: 'dunk_double_clutch', label: 'DOUBLE CLUTCH', sec: 0.7, flashy: true };
export const SPIN_360: HoopsDunk = { clip: 'dunk_360_spin', label: '360', sec: 0.8, flashy: true };
export const EASTBAY: HoopsDunk = { clip: 'dunk_360_eastbay', label: 'EASTBAY', sec: 0.95, flashy: true };
/** DEFENSE-LOOK (2026-09-17). The baseline dunk: a drive across the face of the rim steeper than BASELINE turns its back
 *  to the iron and flushes behind the head — the flight reads `reverse` and faces AWAY from the rim. */
export const REVERSE: HoopsDunk = { clip: 'dunk_finish_reverse', label: 'REVERSE', sec: 0.7, flashy: true, reverse: true };
/** The standing dunk: a two-foot gather under the rim and a two-hand flush — no wind-up to earn, nothing to spin. */
export const STANDING: HoopsDunk = { clip: 'dunk_finish_two_hand', label: 'TWO-HAND FLUSH', sec: 0.55, flashy: false };   // DUNK-CLIPS: a two-foot tuck and a two-hand flush (the launch clip was still crouched at rim height; the tomahawk is one-handed now)
/** Across the rim's face THIS steeply (0 straight at it, 1 along the baseline) is a baseline drive. */
export const BASELINE = 0.72;

/** Fast enough to wind one up. Below this you are laying your weight into it, not performing. */
export const WINDUP_SPEED = 5.0;
/** Across the face of the rim rather than at it — the angle the wind-up dunks want. */
export const ANGLED = 0.45;
/** A body this close to the flight path is one you adjust around, not one you wind up through. */
export const CROWDED = 0.45;
/** Showtime needs the game to be going your way. */
export const SHOWTIME_MOMENTUM = 0.62;

/**
 * Pick the dunk this drive earned.
 *
 * Ordered most-specific first, and the order IS the design: contact beats showtime (a body in the way settles the
 * argument), showtime beats style, style beats the default. A drive that satisfies nothing gets the power dunk,
 * which is the one the modes used to play for everything.
 */
export function pickHoopsDunk(read: DunkRead): HoopsDunk {
  const roll = read.roll ?? Math.random;

  // THROUGH HIM. A poster is decided by the body, not by the flourish — you go up strong, one hand, and wear it.
  if (read.poster) return TOMAHAWK;
  if (read.standing) return STANDING;                 // no run-up: nothing to wind

  // AROUND HIM. Contested but not a poster: there is a hand up and you have to hang and move the ball. This is
  // what the double clutch IS, and it is the one dunk here that exists because of the defender rather than in
  // spite of him.
  if (read.contest01 >= CROWDED) return DOUBLE_CLUTCH;

  if (read.lateral01 >= BASELINE) return REVERSE;     // along the baseline: the back turns to the iron
  const fast = read.speed >= WINDUP_SPEED;
  const angled = read.lateral01 >= ANGLED;

  // SHOWTIME. Only with the game going your way, only at full speed, and only some of the time — a 360 every
  // single trip is not showtime, it is a walk cycle.
  if (fast && read.momentum01 >= SHOWTIME_MOMENTUM) {
    const r = roll();
    if (r < 0.22) return EASTBAY;
    if (r < 0.55) return SPIN_360;
  }

  // STYLE OFF THE ANGLE. Running across the rim at speed is the windmill's shape; the same angle without the
  // speed is a cradle, which is a dunk you can do slowly and still look like you meant it.
  if (angled) return fast ? WINDMILL : CRADLE;

  // STRAIGHT ON. Fast and clean is a tomahawk; anything else is the power dunk.
  return fast ? TOMAHAWK : POWER;
}

/**
 * How fast to play the clip so it lands on the rim rather than before or after it.
 *
 * `holdEnd` covers a clip that finishes early — the last frame holds — but a clip that runs LONG than the flight
 * is still mid-wind-up when the ball is supposed to be through the ring, which reads as the ball going in by
 * itself. Clamped either side: past about half speed a dunk looks like slow motion, and past double it is a twitch.
 */
export function dunkSpeedRatio(dunk: HoopsDunk, flightSec: number): number {
  if (!Number.isFinite(flightSec) || flightSec <= 0) return 1;
  return Math.max(0.5, Math.min(2, dunk.sec / flightSec));
}
