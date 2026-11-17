// THE HOOPS RATINGS, WIRED (lane/hoops-builder phase B, owner 2026-11-12). The few places 1v1 and 3v3 read the hero's tuning, each a
// pure function so the mode edit is one call and "rating 50 is today" can be proved here, against TODAY_TUNING, rather than by reading
// two 4,000-line files: every helper below returns its input UNCHANGED for TODAY_TUNING (ratedPlay.test.ts).
//
//   speed      ratedSpeedScale   → DribbleController.speedScale (top speed; the gears reach a higher top in the same time, so the first
//                                  step scales with it — measured in scripts/probes/hoops-builder/bands.mts)
//   handle     tuning.handle     → the handle HandleSystem reads (chain window, tightness). Moves stay unlocked (H2 MOVES_UNLOCKED_GATE).
//              ratedManRead      → the rulebook's lean line (readTheMan), on the hero's moves against his man
//   shooting   ratedGreenStart   → the hero's meter on a jump shot (widen above 1, narrow below); ratedGreenRelease → the release judge
//   finishing  ratedFinishContest → the contest on the hero's finish (meter and release); jump shots untouched
//   defense    ratedSpeedScale(…, true) → the slide (the hero's speed on defense); ratedStealRange → his poke; ratedBlocker → his block
//   height     ratedBlocker / ratedRelease → reach; ratedLookScale → how tall he is drawn (drawing only)
//
// WHERE THE ATHLETE COMES FROM. loadRatedTuning reads GET /api/v1/creator/hoops once per run (the builder's own route: the server's
// ratings under the Creator's ceilings). A rating-free run never asks: a ranked, staked, arena, challenge, online or party run
// (ratings.ratingFreeRun, the harness's competitive stamp) plays TODAY_TUNING. So does an agent / probe run (`?agent=`): the rigs
// measure the shipped defaults (assumption: flagged), a guest (401), a slow or failed answer (RATED_LOAD_TIMEOUT_MS), and
// `hoops.ratingsOn` 0.
//
// No Babylon at runtime: the modes do the scene work (applyProportions with ratedLookScale).

import type { ShotStyle } from '../core/BasketballCore';
import type { Blocker } from './blocks';
import { isJumpShot, type ManRead } from './rulebook';
import {
  HOOPS_RATING_IDS, HOOPS_POSITIONS, HEIGHT_DEFAULT_IN, TODAY_TUNING, clampHeight, heightLookScale, ratingFreeRun, ratingsOn, runContextOf,
  tuningFor, type HoopsAthlete, type HoopsPosition, type HoopsTuning,
} from './ratings';

/** The tuning a run plays and the playing height its hero is drawn at. */
export interface RatedRun {
  tuning: HoopsTuning;
  /** Playing height (in). 76 = the standard frame. */
  heightIn: number;
  /** Why it is today's numbers, when it is (a log line). */
  why: 'rated' | 'ratingFree' | 'agent' | 'off' | 'guest' | 'failed';
}

export const TODAY_RUN: Readonly<RatedRun> = Object.freeze({ tuning: TODAY_TUNING, heightIn: HEIGHT_DEFAULT_IN, why: 'off' as const });

// ── the reads (each: TODAY_TUNING → the input, unchanged) ──────────────────────────────────────────────────────────────────────
/** The hero's speedScale: his top speed, and on defense his slide on top of it. Multiplies whatever else the mode scales by. */
export const ratedSpeedScale = (t: HoopsTuning, onDefense: boolean): number => t.topSpeedScale * (onDefense ? t.slideSpeedScale : 1);

/** A jump shot's green on the hero's meter: widened above 1, narrowed below (ShotMeter's own widen / narrow, which never cross). */
export function ratedGreenStart(m: { widenBy(f: number): void; narrowBy(f: number): void }, style: ShotStyle, t: HoopsTuning): void {
  if (!isJumpShot(style) || t.greenScale === 1) return;
  if (t.greenScale > 1) m.widenBy(t.greenScale); else m.narrowBy(t.greenScale);
}
/** The same scale for the release judge (SharedShot.releaseHalfSec's `ratingGreen`): 1 for a finish. */
export const ratedGreenRelease = (style: ShotStyle, t: HoopsTuning): number => (isJumpShot(style) ? t.greenScale : 1);

/** The contest a defender puts on the hero's FINISH (a jump shot's contest is the green's business, untouched). */
export const ratedFinishContest = (contest: number, style: ShotStyle, t: HoopsTuning): number =>
  isJumpShot(style) || t.finishContestScale === 1 ? contest : Math.max(0, Math.min(1, contest * t.finishContestScale));

/** The hero's poke range. */
export const ratedStealRange = (range: number, t: HoopsTuning): number => range * t.stealReachScale;

/** The hero as a blocker: his Defense rating's block reach and his playing height's reach on the arm. */
export function ratedBlocker(b: Blocker, t: HoopsTuning): Blocker {
  const add = t.blockReachAddM + t.reachAddM;
  return add === 0 ? b : { ...b, reachAddM: (b.reachAddM ?? 0) + add };
}

/** The hero's release point against an AI block: his playing height's reach on its height. */
export function ratedRelease<P extends { x: number; y: number; z: number }>(p: P, t: HoopsTuning): P {
  return t.reachAddM === 0 ? p : { ...p, y: p.y + t.reachAddM };
}

/** The hero's man read for a move: his handle's lean line. */
export function ratedManRead(r: ManRead, t: HoopsTuning): ManRead {
  return t.moveLeanScale === 1 ? r : { ...r, leanScale: (r.leanScale ?? 1) * t.moveLeanScale };
}

/** How tall the hero is drawn: 1 in a run that is not rated (the standard frame these modes always spawn), else his playing height. */
export const ratedLookScale = (r: RatedRun): number => (r.why === 'rated' ? heightLookScale(r.heightIn) : 1);

// ── the athlete ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A slow answer must not hold the court: past this the run plays today's numbers. */
export const RATED_LOAD_TIMEOUT_MS = 2500;

/** The route's answer (the builder's HoopsView: ratings, position, heightIn) → an athlete, or null when it is not one. */
export function athleteFromView(v: unknown): HoopsAthlete | null {
  const o = v as { ratings?: Record<string, unknown>; position?: unknown; heightIn?: unknown } | null;
  if (!o || typeof o !== 'object' || !o.ratings) return null;
  const ratings = {} as HoopsAthlete['ratings'];
  for (const id of HOOPS_RATING_IDS) {
    const r = o.ratings[id];
    if (typeof r !== 'number' || !Number.isFinite(r)) return null;
    ratings[id] = r;
  }
  const position = (HOOPS_POSITIONS as readonly unknown[]).includes(o.position) ? (o.position as HoopsPosition) : 'wing';
  return { ratings, position, heightIn: clampHeight(o.heightIn) };
}

/** The run's tuning, from the page's query, the scene's stamp and the builder's route. Never throws. */
export async function loadRatedTuning(
  metadata: unknown,
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  fetcher: typeof fetch | undefined = typeof fetch !== 'undefined' ? fetch : undefined,
  timeoutMs = RATED_LOAD_TIMEOUT_MS,
): Promise<RatedRun> {
  if (ratingFreeRun(search) || runContextOf(metadata).ratingFree) return { ...TODAY_RUN, why: 'ratingFree' };
  if (new URLSearchParams(search).has('agent')) return { ...TODAY_RUN, why: 'agent' };
  if (!ratingsOn() || !fetcher) return { ...TODAY_RUN, why: 'off' };
  try {
    const answer = await Promise.race([
      fetcher('/api/v1/creator/hoops', { credentials: 'same-origin' }).then(async (r) => (r.ok ? r.json() : r.status === 401 ? 'guest' : null)),
      new Promise<null>((res) => setTimeout(() => res(null), timeoutMs)),
    ]);
    if (answer === 'guest') return { ...TODAY_RUN, why: 'guest' };
    const athlete = athleteFromView((answer as { hoops?: unknown } | null)?.hoops);
    if (!athlete) return { ...TODAY_RUN, why: 'failed' };
    return { tuning: tuningFor(athlete, { ratingFree: false }), heightIn: athlete.heightIn, why: 'rated' };
  } catch {
    return { ...TODAY_RUN, why: 'failed' };
  }
}

/** One line for the console: what this run plays. */
export function ratedLog(r: RatedRun): string {
  const t = r.tuning;
  return r.why !== 'rated' ? `standard (${r.why})`
    : `speed ×${t.topSpeedScale.toFixed(3)} handle ${t.handle.toFixed(1)} lean ×${t.moveLeanScale.toFixed(3)} green ×${t.greenScale.toFixed(3)} `
      + `finish contest ×${t.finishContestScale.toFixed(3)} slide ×${t.slideSpeedScale.toFixed(3)} poke ×${t.stealReachScale.toFixed(3)} `
      + `block +${(t.blockReachAddM + t.reachAddM).toFixed(3)} m · drawn ×${ratedLookScale(r).toFixed(2)} (${r.heightIn} in)`;
}
