// THE HOOPS PART OF THE ATHLETE (lane/hoops-builder, owner 2026-11-12). Pure: no Prisma, no fetch, no React.
//
// WHERE IT LIVES. Inside `AthleteBuild.build`, under `hoops`, versioned (`v`). The Creator's rule is "one canonical record — no mode
// may persist its own parallel profile" (saveBuild.ts), so the hoops builder is a part of the athlete's build, not a table of its
// own: no schema change, it rides in the account export with the rest of the build, and the Creator's Finalize carries it over
// (app/api/v1/creator/athlete/route.ts).
//
//   build.hoops = {
//     v: 1,
//     position: 'guard' | 'wing' | 'big',
//     heightIn: 72–80,                      // playing height, 6'0"–6'8"
//     steps: { speed, handle, shooting, finishing, defense },   // upgrade steps bought, each ≥ 0
//     points: { earned, through, day, dayEarned },              // upgrade points: all ever earned, and the claim ledger
//   }
//
// A RATING = the position's and the height's starting point (ratings.ts startingRatings) + the steps bought, under a ceiling.
//
// THE CEILING IS THE CREATOR'S. Each hoops rating stands for one Creator attribute row, and that row's ceiling (PRQ sets the ceiling,
// the editor spends underneath it: lib/creator/schema/ceilings.ts) caps the hoops rating too, under the hoops cap of 90. Speed is the
// Creator's Speed row and Defense its Perimeter Defense row, both capped by a measured body axis; Handle, Shooting and Finishing are
// skill rows that nothing measured caps. No body scan = no ceiling below 90, exactly as the Creator rules.
//
// WHY THE CREATOR'S FREE ATTRIBUTE SHEET DOES NOT SET THE HOOPS RATINGS (assumption, flagged): that sheet spends 1,500 points freely
// across ~50 rows that start at 0, and nothing in any game reads it. Reading it would (1) make an untouched athlete play WORSE than
// today (every row 0), breaking "rating 50 is today", and (2) let anyone type a 90 in instead of earning it, which is the opposite of
// "earn upgrade points by playing". So the hoops ratings are their own five numbers in the same record, capped by the same ceilings.
//
// UPGRADE POINTS ARE NOT MONEY. They are not coins, shards or Lab Credits, they live in this JSON and not in the Wallet, they cannot
// be bought, and nothing spends them but this builder.
//
// HOW POINTS ARE EARNED (server-side only; lib/creator/hoops/hoopsBuild-server.ts reads the runs). A finished hoops run that the
// server started and closed (SessionRun status paid or recorded, payout-eligible: no agent, playtest or test-account run), at least
// MIN_GAME_MS long, pays POINTS_PER_GAME, plus POINTS_PER_WIN when it was won, up to POINTS_DAY_CAP a UTC day. Each run counts once:
// `through` is the finish time of the last run counted. A first visit counts today's runs.

import { ATTRIBUTES } from '../schema/attributes';
import { ceilingFor } from '../schema/ceilings';
import type { PrqAxisId, RatedRow } from '../schema/types';
import {
  HOOPS_RATING_IDS, HOOPS_POSITIONS, DEFAULT_POSITION, HEIGHT_DEFAULT_IN, HEIGHT_MIN_IN, HEIGHT_MAX_IN, RATING_MAX, RATING_MIN,
  RATING_LABEL, startingRatings, type HoopsAthlete, type HoopsPosition, type HoopsRatingId, type HoopsRatings,
} from '../../babylon/hoops/ratings';

export const HOOPS_BUILD_VERSION = 1;

export interface HoopsPoints {
  /** Every point ever earned. What is left to spend is this minus the cost of the steps bought. */
  earned: number;
  /** The finish time (ISO) of the last run counted, or null before the first claim. */
  through: string | null;
  /** The UTC day (YYYY-MM-DD) `dayEarned` is for. */
  day: string | null;
  /** Points earned on `day`, against POINTS_DAY_CAP. */
  dayEarned: number;
}

export interface HoopsBuild {
  v: number;
  position: HoopsPosition;
  heightIn: number;
  steps: HoopsRatings;
  points: HoopsPoints;
}

const ZERO_STEPS: Readonly<HoopsRatings> = Object.freeze({ speed: 0, handle: 0, shooting: 0, finishing: 0, defense: 0 });

export function defaultHoopsBuild(): HoopsBuild {
  return {
    v: HOOPS_BUILD_VERSION, position: DEFAULT_POSITION, heightIn: HEIGHT_DEFAULT_IN, steps: { ...ZERO_STEPS },
    points: { earned: 0, through: null, day: null, dayEarned: 0 },
  };
}

// ── earning ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The GameShell mode keys whose runs earn hoops points: ONES (1v1), THREES (3v3) and the three-point contest. */
export const HOOPS_POINT_MODES: readonly string[] = ['hoops1v1', 'hoops3v3', 'threePoint'];
/** Points for a finished game. */
export const POINTS_PER_GAME = 2;
/** Extra points for a won game. */
export const POINTS_PER_WIN = 1;
/** The most points a UTC day can earn. Raising every rating from 50 to 90 costs 325 points: about a month at the cap. */
export const POINTS_DAY_CAP = 10;
/** A run shorter than this is not a game (a start and a quit): it earns nothing. */
export const MIN_GAME_MS = 30_000;

/** One finished run, as the server read it. */
export interface HoopsRun {
  finishedAt: Date;
  durationMs: number | null;
  won: boolean;
}

/** The UTC day of a moment, YYYY-MM-DD. */
export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
/** Midnight UTC of the day `d` falls in. */
export const utcMidnight = (d: Date): Date => new Date(`${utcDay(d)}T00:00:00.000Z`);

/** The moment runs are counted from: the last run counted, or (first visit) the start of today. */
export function countFrom(points: HoopsPoints, now: Date): Date {
  const t = points.through ? new Date(points.through) : null;
  return t && Number.isFinite(t.getTime()) ? t : utcMidnight(now);
}

/**
 * Fold finished runs into the points, oldest first. Each run after `through` is counted once, a game pays POINTS_PER_GAME (+ the win
 * bonus), and no UTC day pays past POINTS_DAY_CAP. A run too short to be a game moves `through` past it and pays nothing.
 */
export function accrue(points: HoopsPoints, runs: readonly HoopsRun[], now: Date): { points: HoopsPoints; gained: number } {
  const from = countFrom(points, now).getTime();
  const next: HoopsPoints = { ...points, through: points.through ?? utcMidnight(now).toISOString() };
  let gained = 0;
  for (const run of [...runs].sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime())) {
    const at = run.finishedAt.getTime();
    if (!Number.isFinite(at) || at <= from || at > now.getTime()) continue;
    next.through = run.finishedAt.toISOString();
    if ((run.durationMs ?? 0) < MIN_GAME_MS) continue;
    const day = utcDay(run.finishedAt);
    if (next.day !== day) { next.day = day; next.dayEarned = 0; }
    const pay = Math.max(0, Math.min(POINTS_PER_GAME + (run.won ? POINTS_PER_WIN : 0), POINTS_DAY_CAP - next.dayEarned));
    next.dayEarned += pay;
    next.earned += pay;
    gained += pay;
  }
  return { points: next, gained };
}

// ── spending ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The first this-many steps on a rating cost 1 point each; every step after costs STEP_COST_HIGH. */
export const CHEAP_STEPS = 15;
export const STEP_COST_HIGH = 2;

/** What the n-th step (1-based) on a rating costs. */
export const stepCost = (n: number): number => (n <= CHEAP_STEPS ? 1 : STEP_COST_HIGH);

/** What `steps` steps on one rating cost in all. */
export function costOfSteps(steps: number): number {
  const s = Math.max(0, Math.floor(steps));
  return Math.min(s, CHEAP_STEPS) + Math.max(0, s - CHEAP_STEPS) * STEP_COST_HIGH;
}

export function pointsSpent(steps: HoopsRatings): number {
  return HOOPS_RATING_IDS.reduce((sum, id) => sum + costOfSteps(steps[id]), 0);
}

export function pointsLeft(b: HoopsBuild): number {
  return Math.max(0, b.points.earned - pointsSpent(b.steps));
}

// ── ceilings (the Creator's) ────────────────────────────────────────────────────────────────────────────────────────────────
/** The Creator attribute row each hoops rating stands for: its ceiling is the hoops rating's ceiling. */
export const CREATOR_ROW_FOR: Readonly<Record<HoopsRatingId, string>> = {
  speed: 'speed', handle: 'ballHandle', shooting: 'threePoint', finishing: 'drivingLayup', defense: 'perimeterD',
};

const rowById = new Map(ATTRIBUTES.rows.map((r) => [r.id, r] as const));

/** The highest each rating may go: 90, or lower where the Creator's PRQ ceiling for that row says so. */
export function ratingCeilings(prq?: Partial<Record<PrqAxisId, number>> | null): HoopsRatings {
  const out = {} as HoopsRatings;
  for (const id of HOOPS_RATING_IDS) {
    const row = rowById.get(CREATOR_ROW_FOR[id]) as RatedRow | undefined;
    out[id] = Math.min(RATING_MAX, row ? ceilingFor(row, prq) : RATING_MAX);
  }
  return out;
}

/** The body axis that caps a rating (Speed: speed, Defense: agility), or null for a skill rating. */
export function ceilingAxis(id: HoopsRatingId): PrqAxisId | null {
  return (rowById.get(CREATOR_ROW_FOR[id]) as RatedRow | undefined)?.prqAxis ?? null;
}

/** The five ratings this build plays at: start + steps, never past its ceiling, never under RATING_MIN. */
export function ratingsOf(b: HoopsBuild, prq?: Partial<Record<PrqAxisId, number>> | null): HoopsRatings {
  const start = startingRatings(b.position, b.heightIn);
  const cap = ratingCeilings(prq);
  const out = {} as HoopsRatings;
  for (const id of HOOPS_RATING_IDS) out[id] = Math.max(RATING_MIN, Math.min(cap[id], start[id] + b.steps[id]));
  return out;
}

export function athleteOf(b: HoopsBuild, prq?: Partial<Record<PrqAxisId, number>> | null): HoopsAthlete {
  return { ratings: ratingsOf(b, prq), position: b.position, heightIn: b.heightIn };
}

// ── reading what is stored ──────────────────────────────────────────────────────────────────────────────────────────────────
const nonNegInt = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : d);

/**
 * The stored `build.hoops`, made safe. Never throws: a missing or broken part reads as its default. A part from a NEWER version
 * (`v` above this build's) is still read, and `fromFuture` says so: the server then refuses to write over it, so an older build
 * cannot amputate what a newer one stored (the same rule athleteProfile.ts keeps).
 */
export function readHoopsBuild(raw: unknown): { build: HoopsBuild; fromFuture: boolean } {
  const d = defaultHoopsBuild();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { build: d, fromFuture: false };
  const o = raw as Record<string, unknown>;
  const v = typeof o.v === 'number' && Number.isFinite(o.v) ? o.v : HOOPS_BUILD_VERSION;
  const position = (HOOPS_POSITIONS as readonly string[]).includes(o.position as string) ? (o.position as HoopsPosition) : d.position;
  const h = o.heightIn;
  const heightIn = typeof h === 'number' && Number.isInteger(h) && h >= HEIGHT_MIN_IN && h <= HEIGHT_MAX_IN ? h : d.heightIn;
  const s = (o.steps && typeof o.steps === 'object' ? o.steps : {}) as Record<string, unknown>;
  const steps = {} as HoopsRatings;
  for (const id of HOOPS_RATING_IDS) steps[id] = nonNegInt(s[id]);
  const p = (o.points && typeof o.points === 'object' ? o.points : {}) as Record<string, unknown>;
  const through = typeof p.through === 'string' && Number.isFinite(new Date(p.through).getTime()) ? p.through : null;
  const day = typeof p.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : null;
  return {
    build: {
      v: HOOPS_BUILD_VERSION, position, heightIn, steps,
      points: { earned: nonNegInt(p.earned), through, day, dayEarned: day ? nonNegInt(p.dayEarned) : 0 },
    },
    fromFuture: v > HOOPS_BUILD_VERSION,
  };
}

// ── a player's choice, checked (the server runs this on every save) ────────────────────────────────────────────────────────
export interface HoopsChoice {
  position: unknown;
  heightIn: unknown;
  steps: unknown;
}

export interface HoopsIssue {
  /** 'position', 'heightIn', 'points', or the rating id. */
  field: string;
  message: string;
}

/**
 * Check a choice against what the athlete has earned and the ceilings. On success, the build to store (the points ledger is the
 * stored one: a client cannot send points). Refuses — never clamps — so a hand-rolled request cannot buy what it cannot pay for.
 */
export function applyChoice(current: HoopsBuild, choice: HoopsChoice, prq?: Partial<Record<PrqAxisId, number>> | null):
  { ok: true; build: HoopsBuild } | { ok: false; issues: HoopsIssue[] } {
  const issues: HoopsIssue[] = [];
  const position = choice.position;
  if (!(HOOPS_POSITIONS as readonly unknown[]).includes(position)) issues.push({ field: 'position', message: 'Pick Guard, Wing or Big.' });
  const h = choice.heightIn;
  if (!(typeof h === 'number' && Number.isInteger(h) && h >= HEIGHT_MIN_IN && h <= HEIGHT_MAX_IN)) {
    issues.push({ field: 'heightIn', message: 'Height must be from 6\'0" to 6\'8".' });
  }
  const raw = (choice.steps && typeof choice.steps === 'object' && !Array.isArray(choice.steps) ? choice.steps : null) as Record<string, unknown> | null;
  const steps = {} as HoopsRatings;
  if (!raw) issues.push({ field: 'points', message: 'No ratings were sent.' });
  for (const id of HOOPS_RATING_IDS) {
    const v = raw?.[id] ?? 0;
    if (!(typeof v === 'number' && Number.isInteger(v) && v >= 0)) {
      issues.push({ field: id, message: `${RATING_LABEL[id]} steps must be a whole number, 0 or more.` });
      steps[id] = 0;
    } else steps[id] = v;
  }
  if (issues.length) return { ok: false, issues };

  const next: HoopsBuild = { ...current, v: HOOPS_BUILD_VERSION, position: position as HoopsPosition, heightIn: h as number, steps };
  const start = startingRatings(next.position, next.heightIn);
  const cap = ratingCeilings(prq);
  for (const id of HOOPS_RATING_IDS) {
    if (steps[id] > 0 && start[id] + steps[id] > cap[id]) {
      const axis = ceilingAxis(id);
      issues.push({
        field: id,
        message: axis && cap[id] < RATING_MAX
          ? `${RATING_LABEL[id]} can go to ${cap[id]}. Your body scan sets that ceiling: train ${axis} to raise it.`
          : `${RATING_LABEL[id]} can go to ${cap[id]}.`,
      });
    }
  }
  const cost = pointsSpent(steps);
  if (cost > current.points.earned) {
    issues.push({ field: 'points', message: `That needs ${cost} points. You have earned ${current.points.earned}.` });
  }
  return issues.length ? { ok: false, issues } : { ok: true, build: next };
}

/** What the screen and the route show: the build, the ratings it plays at, their ceilings, and the points. */
export interface HoopsView {
  position: HoopsPosition;
  heightIn: number;
  steps: HoopsRatings;
  start: HoopsRatings;
  ratings: HoopsRatings;
  ceilings: HoopsRatings;
  points: { earned: number; spent: number; left: number; today: number; dayCap: number };
}

export function viewOf(b: HoopsBuild, prq: Partial<Record<PrqAxisId, number>> | null | undefined, now: Date): HoopsView {
  const spent = pointsSpent(b.steps);
  return {
    position: b.position, heightIn: b.heightIn, steps: { ...b.steps },
    start: startingRatings(b.position, b.heightIn), ratings: ratingsOf(b, prq), ceilings: ratingCeilings(prq),
    points: {
      earned: b.points.earned, spent, left: Math.max(0, b.points.earned - spent),
      today: b.points.day === utcDay(now) ? b.points.dayEarned : 0, dayCap: POINTS_DAY_CAP,
    },
  };
}
