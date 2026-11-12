// HOOPS RATINGS → GAME NUMBERS (lane/hoops-builder, owner 2026-11-12; HOOPS-AAA-GAP-PLAY §3.9 and phase 14).
//
// The owner: "Simple builder: pick height and a position, plus 5 ratings (speed, handle, shooting, finishing, defense) that really
// change how you play, within limits. Earn upgrade points by playing. Ranked, staked and arena games stay rating-free, as today."
// And earlier (HOOPS SHOOTING, 2026-10-20): "Creator ratings slightly widen the green in CASUAL modes only".
//
// This file is ONE thing: an athlete (five ratings, a position, a playing height) in, the game numbers a hoops mode reads out. It
// does not know where a rating came from (lib/creator/hoops/hoopsBuild.ts builds the athlete from the AthleteBuild row) and it does
// not touch a mode (phase B wires the modes through `tuningFor`).
//
// THREE RULES THE NUMBERS KEEP:
//   1. RATING 50 IS TODAY. A wing at 6'4" with every rating 50 (the default athlete, and every guest) gets `TODAY_TUNING`: every
//      scale exactly 1, every add exactly 0, the handle exactly HandleSystem's BASELINE_HANDLE. ratings.test.ts pins it.
//   2. THE BANDS ARE MODEST. A rating runs 40–90. At 90 a number moves by its band (top speed +6 %, the green +10 % …); at 40 it moves
//      the other way by a quarter of that. So the tuned feel stays recognisable at both ends; the band widths are feel knobs (group
//      "Hoops · ratings"), each with 0 = no effect.
//   3. RATING-FREE WHERE OTHERS COMPARE. A ranked, staked, arena, challenge, online or party run (playFrame's competitive stamp — the
//      same list the fairness gates already read) resolves to TODAY_TUNING whatever the athlete is. So does `hoops.ratingsOn` 0.
//
// Pure: no Babylon, no DOM, no fetch. The handle numbers are restated (not imported) so a menu page can price a step without
// pulling Babylon in; ratings.test.ts pins them against HandleSystem and the rulebook.

import { feel } from '../../feel-panel/feel';
import { playStampFor } from '../core/playFrame';

// ── the athlete ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const HOOPS_RATING_IDS = ['speed', 'handle', 'shooting', 'finishing', 'defense'] as const;
export type HoopsRatingId = (typeof HOOPS_RATING_IDS)[number];
export type HoopsRatings = Record<HoopsRatingId, number>;

/** The rating everyone plays today. */
export const RATING_BASE = 50;
/** The lowest a rating can sit (a position and a height can take a rating a little under 50; nothing takes it under this). */
export const RATING_MIN = 40;
/** The highest a rating can be raised to (a body scan can set a lower ceiling: lib/creator/schema/ceilings.ts). */
export const RATING_MAX = 90;

export const NEUTRAL_RATINGS: Readonly<HoopsRatings> = Object.freeze({ speed: 50, handle: 50, shooting: 50, finishing: 50, defense: 50 });

export const HOOPS_POSITIONS = ['guard', 'wing', 'big'] as const;
export type HoopsPosition = (typeof HOOPS_POSITIONS)[number];
/** The wing is the middle: no lean, so the default athlete is today's. */
export const DEFAULT_POSITION: HoopsPosition = 'wing';

/** What a position does to the five starting ratings. Each row adds up to 0: a position is a trade, never a free bonus. */
export const POSITION_LEAN: Readonly<Record<HoopsPosition, Readonly<HoopsRatings>>> = {
  guard: { speed: 3, handle: 4, shooting: 1, finishing: -4, defense: -4 },
  wing: { speed: 0, handle: 0, shooting: 0, finishing: 0, defense: 0 },
  big: { speed: -4, handle: -4, shooting: -2, finishing: 5, defense: 5 },
};

/** Playing height, in inches: 6'0" to 6'8". 6'4" is the standard frame every athlete plays at today. */
export const HEIGHT_MIN_IN = 72;
export const HEIGHT_MAX_IN = 80;
export const HEIGHT_DEFAULT_IN = 76;
/** What each inch over 6'4" does to the starting ratings (an inch under does the opposite). Adds up to 0: taller is a trade. */
export const HEIGHT_LEAN_PER_IN: Readonly<HoopsRatings> = { speed: -1, handle: -1, shooting: 0, finishing: 1, defense: 1 };

export interface HoopsAthlete {
  ratings: HoopsRatings;
  position: HoopsPosition;
  heightIn: number;
}

export const NEUTRAL_ATHLETE: Readonly<HoopsAthlete> = Object.freeze({
  ratings: { ...NEUTRAL_RATINGS }, position: DEFAULT_POSITION, heightIn: HEIGHT_DEFAULT_IN,
});

/** Feet and inches, the way a player reads a height: 76 → 6'4". */
export function heightLabel(inches: number): string {
  const n = Math.round(inches);
  return `${Math.floor(n / 12)}'${n % 12}"`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A height made legal: an integer inside 6'0"–6'8"; anything that is not a number is 6'4". */
export function clampHeight(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), HEIGHT_MIN_IN, HEIGHT_MAX_IN) : HEIGHT_DEFAULT_IN;
}

/** The five ratings a position and a height start you on, before any upgrade. A wing at 6'4" starts on all 50. */
export function startingRatings(position: HoopsPosition, heightIn: number): HoopsRatings {
  const lean = POSITION_LEAN[position] ?? POSITION_LEAN[DEFAULT_POSITION];
  const dh = clampHeight(heightIn) - HEIGHT_DEFAULT_IN;
  const out = {} as HoopsRatings;
  for (const id of HOOPS_RATING_IDS) out[id] = clamp(RATING_BASE + lean[id] + HEIGHT_LEAN_PER_IN[id] * dh, RATING_MIN, RATING_MAX);
  return out;
}

// ── today's numbers the bands sit on (restated; pinned by ratings.test.ts) ───────────────────────────────────────────────────
/** HandleSystem.BASELINE_HANDLE: the handle every player has today. */
export const TODAY_HANDLE = 50;
/** HandleSystem.chainWindowSec: 0.18 s + 0.52 s × handle / 100, so a handle point is this many seconds of combo window. */
export const CHAIN_WINDOW_SEC_PER_HANDLE = 0.0052;
/** CourtMovement.DEFAULT_MOVEMENT.maxSpeed: today's top speed (m/s). */
export const TODAY_TOP_SPEED_MPS = 6.4;
/** steals.STRIP_REACH_M: how far a reach gets from the reacher's root to the ball today (m). */
export const TODAY_STRIP_REACH_M = 1.2;

// ── the bands (every one NEW; a feel knob each, group "Hoops · ratings"; 0 = that rating changes nothing) ──────────────────────
/** 1 = ratings change play in casual runs; 0 = everyone plays today's numbers, everywhere. Knob `hoops.ratingsOn`. */
export const RATINGS_ON = 1;
/** Speed 90: top speed and first-step acceleration × (1 + this). Speed 40: × (1 − this / 4). Knob `hoops.rateSpeedBand`. */
export const RATE_SPEED_BAND = 0.06;
/** Handle 90: the handle the moves read is 50 + this (the combo window and the dribble's tightness follow it). Knob `hoops.rateHandleBand`. */
export const RATE_HANDLE_BAND = 20;
/** Handle 90: a defender is beatable at (1 − this) of the "moving the wrong way" line (rulebook MOVE_LEAN_MPS). Knob `hoops.rateReadBand`. */
export const RATE_READ_BAND = 0.15;
/** Shooting 90: the jump-shot green × (1 + this). Casual runs only, like every rating. Knob `hoops.rateGreenBand`. */
export const RATE_GREEN_BAND = 0.1;
/** Finishing 90: the contest a defender puts on a layup or a dunk × (1 − this). Knob `hoops.rateFinishBand`. */
export const RATE_FINISH_BAND = 0.15;
/** Defense 90: the defensive slide's speed × (1 + this). Knob `hoops.rateSlideBand`. */
export const RATE_SLIDE_BAND = 0.06;
/** Defense 90: the steal reach (STRIP_REACH_M) × (1 + this). Knob `hoops.rateStealReachBand`. */
export const RATE_STEAL_REACH_BAND = 0.05;
/** Defense 90: the block reach + this (m). Knob `hoops.rateBlockReachM`. */
export const RATE_BLOCK_REACH_M = 0.04;
/** Each inch of playing height over 6'4": standing reach + this (m) — blocks, contests and the rim. Knob `hoops.heightReachMPerIn`. */
export const HEIGHT_REACH_M_PER_IN = 0.015;

export const ratingsOn = (): boolean => feel('hoops.ratingsOn', RATINGS_ON) >= 0.5;

/** Where a rating sits in its band: 0 at 50, 1 at 90, −0.25 at 40. */
export function lift(rating: number): number {
  const r = typeof rating === 'number' && Number.isFinite(rating) ? clamp(rating, RATING_MIN, RATING_MAX) : RATING_BASE;
  return (r - RATING_BASE) / (RATING_MAX - RATING_BASE);
}

// ── the numbers a mode reads ────────────────────────────────────────────────────────────────────────────────────────────────
/** Every number is relative to today: a scale (× today's) or an add (+ today's), so a mode keeps its own constant and applies this. */
export interface HoopsTuning {
  /** false: today's numbers, exactly (rating-free run, ratings off, or the default athlete). */
  rated: boolean;
  /** Speed: × top speed (CourtMovement.maxSpeed, the handler's and the defender's). */
  topSpeedScale: number;
  /** Speed: × first-step acceleration (CourtMovement.accel / sprintAccel). */
  accelScale: number;
  /** Handle: the handle value HandleSystem reads (chain window, tightness). Today BASELINE_HANDLE 50. Moves stay unlocked (H2). */
  handle: number;
  /** Handle: × the rulebook's "moving the wrong way" line (MOVE_LEAN_MPS): lower = a move beats a defender on a smaller lean. */
  moveLeanScale: number;
  /** Shooting: × the jump-shot green (ShotMeter.widenBy above 1; the narrow path below 1). */
  greenScale: number;
  /** Finishing: × the contest a defender puts on a finish. */
  finishContestScale: number;
  /** Defense: × the on-ball slide speed. */
  slideSpeedScale: number;
  /** Defense: × the steal reach (STRIP_REACH_M). */
  stealReachScale: number;
  /** Defense: + block reach (m). */
  blockReachAddM: number;
  /** Height: + standing reach (m) — the block, the contest hand and the rim. */
  reachAddM: number;
}

/** Today's numbers, exactly. What every rating-free run, every guest and every 50 athlete plays. */
export const TODAY_TUNING: Readonly<HoopsTuning> = Object.freeze({
  rated: false,
  topSpeedScale: 1, accelScale: 1, handle: TODAY_HANDLE, moveLeanScale: 1, greenScale: 1, finishContestScale: 1,
  slideSpeedScale: 1, stealReachScale: 1, blockReachAddM: 0, reachAddM: 0,
});

/** The band widths in force (the knobs). */
export interface RatingBands {
  speed: number; handle: number; read: number; green: number; finish: number; slide: number; stealReach: number; blockReachM: number; heightReachMPerIn: number;
}
export function bands(): RatingBands {
  return {
    speed: feel('hoops.rateSpeedBand', RATE_SPEED_BAND),
    handle: feel('hoops.rateHandleBand', RATE_HANDLE_BAND),
    read: feel('hoops.rateReadBand', RATE_READ_BAND),
    green: feel('hoops.rateGreenBand', RATE_GREEN_BAND),
    finish: feel('hoops.rateFinishBand', RATE_FINISH_BAND),
    slide: feel('hoops.rateSlideBand', RATE_SLIDE_BAND),
    stealReach: feel('hoops.rateStealReachBand', RATE_STEAL_REACH_BAND),
    blockReachM: feel('hoops.rateBlockReachM', RATE_BLOCK_REACH_M),
    heightReachMPerIn: feel('hoops.heightReachMPerIn', HEIGHT_REACH_M_PER_IN),
  };
}

/** Where the run is being played. */
export interface RunContext {
  /** A ranked, staked, arena, challenge, online or party run: ratings do not apply. */
  ratingFree: boolean;
}

/**
 * Is this run rating-free? The page's query, read the way playFrame's stamp reads it (the harness stamps the same answer on the scene
 * as `felCompetitive`): `?arena=` `?mp=` `?c=` `?signature=` `?net=` `?party=` `?ranked=`, present even empty. Fails closed.
 */
export function ratingFreeRun(search: string | URLSearchParams | null | undefined): boolean {
  return playStampFor(search).felCompetitive;
}

/** The context for a scene the harness has stamped (scene.metadata.felCompetitive / felRanked). No stamp = casual. */
export function runContextOf(metadata: unknown): RunContext {
  const md = (metadata ?? {}) as { felCompetitive?: unknown; felRanked?: unknown };
  return { ratingFree: md.felCompetitive === true || md.felRanked === true };
}

/** The numbers this athlete plays in this run. Rating-free, ratings off, or no athlete → TODAY_TUNING. */
export function tuningFor(athlete: HoopsAthlete | null | undefined, ctx: RunContext, b: RatingBands = bands()): HoopsTuning {
  if (!athlete || ctx.ratingFree || !ratingsOn()) return { ...TODAY_TUNING };
  const r = athlete.ratings;
  const sp = lift(r.speed), ha = lift(r.handle), sh = lift(r.shooting), fi = lift(r.finishing), de = lift(r.defense);
  const dh = clampHeight(athlete.heightIn) - HEIGHT_DEFAULT_IN;
  const t: HoopsTuning = {
    rated: true,
    topSpeedScale: 1 + sp * b.speed,
    accelScale: 1 + sp * b.speed,
    handle: TODAY_HANDLE + ha * b.handle,
    moveLeanScale: 1 - ha * b.read,
    greenScale: 1 + sh * b.green,
    finishContestScale: 1 - fi * b.finish,
    slideSpeedScale: 1 + de * b.slide,
    stealReachScale: 1 + de * b.stealReach,
    blockReachAddM: de * b.blockReachM,
    reachAddM: dh * b.heightReachMPerIn,
  };
  t.rated = !sameAsToday(t);
  return t;
}

/** Every number equal to today's (a 50 athlete at 6'4", or every band at 0). */
export function sameAsToday(t: HoopsTuning): boolean {
  const k = Object.keys(TODAY_TUNING) as (keyof HoopsTuning)[];
  return k.every((key) => key === 'rated' || t[key] === TODAY_TUNING[key]);
}

// ── the words a player reads ────────────────────────────────────────────────────────────────────────────────────────────────
export const RATING_LABEL: Readonly<Record<HoopsRatingId, string>> = {
  speed: 'Speed', handle: 'Handle', shooting: 'Shooting', finishing: 'Finishing', defense: 'Defense',
};
export const POSITION_LABEL: Readonly<Record<HoopsPosition, string>> = { guard: 'Guard', wing: 'Wing', big: 'Big' };
/** One short line: what the rating is about. */
export const RATING_ABOUT: Readonly<Record<HoopsRatingId, string>> = {
  speed: 'How fast you run and how quick your first step is.',
  handle: 'How long your moves chain, and how easily a move beats your man.',
  shooting: 'How wide the green is on your jump shot.',
  finishing: 'How much a defender bothers your layups and dunks.',
  defense: 'How fast you slide, and how far you reach for steals and blocks.',
};
export const POSITION_ABOUT: Readonly<Record<HoopsPosition, string>> = {
  guard: 'Quicker, better handle. Finishes and defends a bit less.',
  wing: 'Even across the board.',
  big: 'Finishes and defends better. Slower, looser handle.',
};

/** Rounded on the size, then signed, so +x and −x always read as the same number. */
const signed = (x: number, digits: number, unit: string) => {
  const a = Math.round(Math.abs(x) * 10 ** digits) / 10 ** digits;
  return `${a === 0 ? '' : x > 0 ? '+' : '−'}${digits > 1 && unit === ' s' ? a.toFixed(2) : a}${unit}`;
};
const pct = (x: number) => signed(x * 100, 1, '%');
const cm = (m: number) => signed(m * 100, 1, ' cm');
const sec = (s: number) => signed(s, 2, ' s');

/**
 * What a rating does, in plain words, against today's standard — the line the builder prints under each rating. `rating` 50 reads
 * "Standard". Built from the same bands as `tuningFor`, so the screen cannot promise a number the game does not play.
 */
export function effectLine(id: HoopsRatingId, rating: number, b: RatingBands = bands()): string {
  const l = lift(rating);
  if (l === 0) return 'Standard';
  switch (id) {
    case 'speed': return `Top speed and first step ${pct(l * b.speed)}`;
    case 'handle': return `Combo window ${sec(l * b.handle * CHAIN_WINDOW_SEC_PER_HANDLE)}, moves beat a defender ${l > 0 ? 'more' : 'less'} easily`;
    case 'shooting': return `Green window ${pct(l * b.green)}`;
    case 'finishing': return `Defenders bother your finishes ${pct(l * b.finish).replace(/^[+−]/, '')} ${l > 0 ? 'less' : 'more'}`;
    case 'defense': return `Slide ${pct(l * b.slide)}, steal reach ${cm(l * b.stealReach * TODAY_STRIP_REACH_M)}, block reach ${cm(l * b.blockReachM)}`;
  }
}

/** What a playing height does, in plain words: 6'4" reads "Standard reach". */
export function heightLine(heightIn: number, b: RatingBands = bands()): string {
  const dh = clampHeight(heightIn) - HEIGHT_DEFAULT_IN;
  return dh === 0 ? 'Standard reach' : `Reach ${cm(dh * b.heightReachMPerIn)}`;
}
