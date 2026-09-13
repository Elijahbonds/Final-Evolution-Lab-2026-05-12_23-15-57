// BOARD TRICKS — the vocabulary the board sports never had (2026-09-12).
//
// Owner: "board sports need huge mechanic upgrades", "surf, skateboarding, snowboarding — all should be as built out
// and developed as dunk".
//
// AUDITED FIRST, and the gap is specific. The boards are NOT missing their machine: ComboChain is a real THPS loop
// (links raise a multiplier, the pot banks on a clean stop, a bail burns it) and SkateRunMode already drives it. What
// they are missing is a VOCABULARY to feed it. Every link today is generic:
//
//     combo.add('GRAB', pts, 'air')      combo.add('GRIND', pts, 'grind')      combo.add('MANUAL', pts, 'manual')
//
// A skater can do "a grab". He cannot do a kickflip rather than a heelflip, and nothing distinguishes a 180 from a
// 900. Dunk, by contrast, has DUNK_TRICKS: named tricks with an input grammar (hold a direction, tap a button), a
// difficulty and a clip each. That table IS the difference in depth, so boards get the same thing.
//
// THE CLIP CONSTRAINT IS REAL AND SHAPES THIS DESIGN. Only eleven board clips are registered —
// board_air, board_carve_left/right, board_grab, board_grind, board_land, board_push, board_ride_idle, board_tuck,
// skate_bail, skate_kickflip — and exactly one of them is a named trick. Dunk has a dedicated set of authored dunk
// clips; the boards never got that investment. Inventing clip names here would render bodies in BIND POSE, which is
// the worst-looking bug in this engine and one this repo has already paid for twice.
//
// So variety comes from COMBINATION, which is also how real board games build their lists: a trick is a base clip
// plus a spin, plus a grab shape, plus a flip, plus a difficulty. A 360 kickflip indy is a different trick from a
// kickflip because the spin, the grab and the score all differ — and every one of them rides a clip that exists.

export type BoardDiscipline = 'skate' | 'snow' | 'surf';

/** Which kind of ComboChain link this trick lands as. */
export type TrickKind = 'air' | 'grind' | 'manual' | 'revert';

/** The grab shape the posture layer holds through the air. */
export type GrabShape = 'none' | 'indy' | 'melon' | 'method' | 'stalefish' | 'nose' | 'tail' | 'japan';

export interface BoardTrick {
  id: string;
  label: string;
  discipline: BoardDiscipline;
  kind: TrickKind;
  /** The held direction, matching the dunk's grammar. null = no direction (a bare button). */
  dir: 'up' | 'down' | 'left' | 'right' | null;
  btn: 'A' | 'B' | 'X' | 'Y';
  /** Board rotation in degrees about the rider's own up axis. 0 for a straight air. */
  spinDeg: number;
  /** Board flip about its long axis (a kickflip is 360). */
  flipDeg: number;
  grab: GrabShape;
  /** 1 = a straight air. Scales the score and the air-time it needs. */
  difficulty: number;
  /** Seconds of air this trick needs to land clean. A 900 cannot be thrown off a kerb. */
  airSec: number;
  /** A REGISTERED clip. Never invent one: a missing clip renders the body in bind pose. */
  clip: string;
}

const T = (t: Omit<BoardTrick, 'basePts'>): BoardTrick => t;

/** Points before the combo multiplier: difficulty is the score, so the table cannot drift from the feel. */
export function basePts(t: BoardTrick): number {
  return Math.round(40 * t.difficulty + t.spinDeg * 0.18 + t.flipDeg * 0.08);
}

// ── SKATE ────────────────────────────────────────────────────────────────────────────────────────────────
// The street list. Flips ride skate_kickflip (the one named clip there is); grabs and spins ride board_air and
// board_grab with the spin and the grab doing the distinguishing.
export const SKATE_TRICKS: readonly BoardTrick[] = [
  T({ id: 'ollie', label: 'OLLIE', discipline: 'skate', kind: 'air', dir: null, btn: 'A', spinDeg: 0, flipDeg: 0, grab: 'none', difficulty: 1.0, airSec: 0.25, clip: 'board_air' }),
  T({ id: 'kickflip', label: 'KICKFLIP', discipline: 'skate', kind: 'air', dir: 'left', btn: 'A', spinDeg: 0, flipDeg: 360, grab: 'none', difficulty: 1.6, airSec: 0.38, clip: 'skate_kickflip' }),
  T({ id: 'heelflip', label: 'HEELFLIP', discipline: 'skate', kind: 'air', dir: 'right', btn: 'A', spinDeg: 0, flipDeg: -360, grab: 'none', difficulty: 1.7, airSec: 0.38, clip: 'skate_kickflip' }),
  T({ id: 'shuvit', label: 'SHUV-IT', discipline: 'skate', kind: 'air', dir: 'down', btn: 'A', spinDeg: 180, flipDeg: 0, grab: 'none', difficulty: 1.4, airSec: 0.32, clip: 'board_air' }),
  T({ id: 'tre', label: '360 FLIP', discipline: 'skate', kind: 'air', dir: 'down', btn: 'B', spinDeg: 360, flipDeg: 360, grab: 'none', difficulty: 3.2, airSec: 0.58, clip: 'skate_kickflip' }),
  T({ id: 'indy', label: 'INDY', discipline: 'skate', kind: 'air', dir: 'up', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'indy', difficulty: 1.5, airSec: 0.36, clip: 'board_grab' }),
  T({ id: 'melon', label: 'MELON', discipline: 'skate', kind: 'air', dir: 'left', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'melon', difficulty: 1.6, airSec: 0.36, clip: 'board_grab' }),
  T({ id: 'japan', label: 'JAPAN AIR', discipline: 'skate', kind: 'air', dir: 'up', btn: 'Y', spinDeg: 0, flipDeg: 0, grab: 'japan', difficulty: 2.6, airSec: 0.5, clip: 'board_grab' }),
  T({ id: 'bs180', label: 'BACKSIDE 180', discipline: 'skate', kind: 'air', dir: 'right', btn: 'B', spinDeg: 180, flipDeg: 0, grab: 'none', difficulty: 1.8, airSec: 0.4, clip: 'board_air' }),
  T({ id: 'fs360', label: 'FRONTSIDE 360', discipline: 'skate', kind: 'air', dir: 'right', btn: 'Y', spinDeg: 360, flipDeg: 0, grab: 'none', difficulty: 2.6, airSec: 0.54, clip: 'board_air' }),
  T({ id: 'spin540', label: '540', discipline: 'skate', kind: 'air', dir: 'left', btn: 'Y', spinDeg: 540, flipDeg: 0, grab: 'indy', difficulty: 3.6, airSec: 0.72, clip: 'board_grab' }),
  // ground links
  T({ id: 'boardslide', label: 'BOARDSLIDE', discipline: 'skate', kind: 'grind', dir: null, btn: 'X', spinDeg: 90, flipDeg: 0, grab: 'none', difficulty: 1.6, airSec: 0, clip: 'board_grind' }),
  T({ id: 'noseslide', label: 'NOSESLIDE', discipline: 'skate', kind: 'grind', dir: 'up', btn: 'X', spinDeg: 90, flipDeg: 0, grab: 'nose', difficulty: 2.0, airSec: 0, clip: 'board_grind' }),
  T({ id: 'tailslide', label: 'TAILSLIDE', discipline: 'skate', kind: 'grind', dir: 'down', btn: 'X', spinDeg: 90, flipDeg: 0, grab: 'tail', difficulty: 2.2, airSec: 0, clip: 'board_grind' }),
  T({ id: 'nosemanual', label: 'NOSE MANUAL', discipline: 'skate', kind: 'manual', dir: 'up', btn: 'A', spinDeg: 0, flipDeg: 0, grab: 'nose', difficulty: 1.8, airSec: 0, clip: 'board_ride_idle' }),
];

// ── SNOW ─────────────────────────────────────────────────────────────────────────────────────────────────
// Bigger air, longer spins, and the grabs are the read. A cork is a spin thrown OFF axis, so it carries its own
// difficulty rather than a separate clip.
export const SNOW_TRICKS: readonly BoardTrick[] = [
  T({ id: 'straight_air', label: 'STRAIGHT AIR', discipline: 'snow', kind: 'air', dir: null, btn: 'A', spinDeg: 0, flipDeg: 0, grab: 'none', difficulty: 1.0, airSec: 0.3, clip: 'board_air' }),
  T({ id: 'indy_snow', label: 'INDY', discipline: 'snow', kind: 'air', dir: 'up', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'indy', difficulty: 1.4, airSec: 0.4, clip: 'board_grab' }),
  T({ id: 'method', label: 'METHOD', discipline: 'snow', kind: 'air', dir: 'left', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'method', difficulty: 2.2, airSec: 0.55, clip: 'board_grab' }),
  T({ id: 'stalefish', label: 'STALEFISH', discipline: 'snow', kind: 'air', dir: 'right', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'stalefish', difficulty: 2.0, airSec: 0.5, clip: 'board_grab' }),
  T({ id: 'tailgrab', label: 'TAIL GRAB', discipline: 'snow', kind: 'air', dir: 'down', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'tail', difficulty: 1.8, airSec: 0.45, clip: 'board_grab' }),
  T({ id: 'snow360', label: '360', discipline: 'snow', kind: 'air', dir: 'right', btn: 'A', spinDeg: 360, flipDeg: 0, grab: 'none', difficulty: 2.4, airSec: 0.6, clip: 'board_air' }),
  T({ id: 'snow540', label: '540 MELON', discipline: 'snow', kind: 'air', dir: 'left', btn: 'A', spinDeg: 540, flipDeg: 0, grab: 'melon', difficulty: 3.4, airSec: 0.8, clip: 'board_grab' }),
  T({ id: 'snow720', label: '720', discipline: 'snow', kind: 'air', dir: 'right', btn: 'Y', spinDeg: 720, flipDeg: 0, grab: 'indy', difficulty: 4.4, airSec: 1.0, clip: 'board_grab' }),
  T({ id: 'cork720', label: 'CORK 720', discipline: 'snow', kind: 'air', dir: 'left', btn: 'Y', spinDeg: 720, flipDeg: 180, grab: 'melon', difficulty: 5.2, airSec: 1.15, clip: 'board_grab' }),
  T({ id: 'rodeo', label: 'RODEO 540', discipline: 'snow', kind: 'air', dir: 'down', btn: 'Y', spinDeg: 540, flipDeg: 180, grab: 'tail', difficulty: 4.6, airSec: 0.95, clip: 'board_grab' }),
  T({ id: 'boardslide_snow', label: 'BOARDSLIDE', discipline: 'snow', kind: 'grind', dir: null, btn: 'X', spinDeg: 90, flipDeg: 0, grab: 'none', difficulty: 1.8, airSec: 0, clip: 'board_grind' }),
  T({ id: 'press', label: 'NOSE PRESS', discipline: 'snow', kind: 'manual', dir: 'up', btn: 'A', spinDeg: 0, flipDeg: 0, grab: 'nose', difficulty: 2.0, airSec: 0, clip: 'board_ride_idle' }),
];

// ── SURF ─────────────────────────────────────────────────────────────────────────────────────────────────
// A wave is not a ramp: most of the list happens ON the face, so most of these are 'manual' and 'revert' links rather
// than airs — a cutback is a direction change you hold, not a jump.
export const SURF_TRICKS: readonly BoardTrick[] = [
  T({ id: 'bottom_turn', label: 'BOTTOM TURN', discipline: 'surf', kind: 'manual', dir: 'down', btn: 'A', spinDeg: 0, flipDeg: 0, grab: 'none', difficulty: 1.0, airSec: 0, clip: 'board_carve_right' }),
  T({ id: 'cutback', label: 'CUTBACK', discipline: 'surf', kind: 'revert', dir: 'left', btn: 'A', spinDeg: 180, flipDeg: 0, grab: 'none', difficulty: 1.8, airSec: 0, clip: 'board_carve_left' }),
  T({ id: 'snap', label: 'SNAP', discipline: 'surf', kind: 'revert', dir: 'up', btn: 'A', spinDeg: 180, flipDeg: 0, grab: 'none', difficulty: 2.4, airSec: 0, clip: 'board_carve_right' }),
  T({ id: 'floater', label: 'FLOATER', discipline: 'surf', kind: 'manual', dir: 'up', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'none', difficulty: 2.0, airSec: 0, clip: 'board_tuck' }),
  T({ id: 'tube', label: 'TUBE RIDE', discipline: 'surf', kind: 'manual', dir: 'down', btn: 'B', spinDeg: 0, flipDeg: 0, grab: 'none', difficulty: 3.6, airSec: 0, clip: 'board_tuck' }),
  T({ id: 'air_reverse', label: 'AIR REVERSE', discipline: 'surf', kind: 'air', dir: 'right', btn: 'Y', spinDeg: 360, flipDeg: 0, grab: 'tail', difficulty: 4.0, airSec: 0.6, clip: 'board_grab' }),
  T({ id: 'alley_oop', label: 'ALLEY-OOP', discipline: 'surf', kind: 'air', dir: 'left', btn: 'Y', spinDeg: 180, flipDeg: 0, grab: 'indy', difficulty: 3.4, airSec: 0.5, clip: 'board_grab' }),
];

export const TRICKS_BY_DISCIPLINE: Readonly<Record<BoardDiscipline, readonly BoardTrick[]>> = {
  skate: SKATE_TRICKS, snow: SNOW_TRICKS, surf: SURF_TRICKS,
};

/** Every trick, for a registry check or a trick list screen. */
export function allBoardTricks(): BoardTrick[] {
  return [...SKATE_TRICKS, ...SNOW_TRICKS, ...SURF_TRICKS];
}

/**
 * Resolve an input to a trick — the dunk's grammar exactly: a held direction plus a tapped button.
 *
 * A bare button with no direction is the discipline's simplest version of that button, which is what keeps the list
 * approachable: every button does SOMETHING before you learn the directions.
 */
export function trickFor(discipline: BoardDiscipline, dir: BoardTrick['dir'], btn: BoardTrick['btn']): BoardTrick | null {
  const list = TRICKS_BY_DISCIPLINE[discipline];
  return list.find((t) => t.btn === btn && t.dir === dir)
    ?? list.find((t) => t.btn === btn && t.dir === null)
    ?? null;
}

/** Could this trick have landed in the air the rider actually had? */
export function fitsAir(t: BoardTrick, airSec: number): boolean {
  return airSec >= t.airSec;
}

/**
 * The best version of a button the rider's air can actually hold.
 *
 * A 900 off a kerb is the classic way a trick list feels broken: the player throws it, the body cannot finish, and the
 * game calls it a bail. Asking for the best trick that FITS turns the air budget into the skill.
 */
export function bestFitting(discipline: BoardDiscipline, btn: BoardTrick['btn'], airSec: number): BoardTrick | null {
  const fits = TRICKS_BY_DISCIPLINE[discipline].filter((t) => t.btn === btn && fitsAir(t, airSec));
  if (!fits.length) return null;
  return fits.reduce((best, t) => (t.difficulty > best.difficulty ? t : best));
}

/**
 * Score a landed trick.
 *
 * `landed01` is how much of the spin the rider actually completed — a trick rotated 80% of the way is a sketchy land
 * and pays like one, which is what stops a spin being a free button.
 */
export function scoreTrick(t: BoardTrick, landed01 = 1): number {
  const clean = Math.max(0, Math.min(1, landed01));
  // under-rotation hurts more than it helps: a 0.8 land pays well under 80%
  return Math.round(basePts(t) * clean * clean);
}

/** Does this trick need a rail under it? For the modes' own gating. */
export function needsRail(t: BoardTrick): boolean { return t.kind === 'grind'; }
