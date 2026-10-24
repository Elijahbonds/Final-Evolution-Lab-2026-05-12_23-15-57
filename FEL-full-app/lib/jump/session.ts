// session — a jump trial's quality, a session's numbers, the verified rule, and when a change is real (JUMP-PRO).
//
//   trialQuality   what keeps ONE trial from being lab-grade, as flags with a tip each (never a score)
//   sessionStats   the valid trials as a set: best, mean ± SD, CV, the typical error and the smallest real change
//   verifyJump     the owner's rule (2026-10-24): verified only on a high-trust live read — good fps, a clean landing,
//                  the full body in frame — or on a slow-mo upload. Consumes the trust rating of PR #424 through a hook
//                  (`trust`), without importing it: pass that PR's jump.height level once it lands
//   realChange     is the difference between two sessions bigger than both sessions' noise? (the "you improved" gate)
//
// Pure.
import type { RefinedFlight } from './refine';
import { jr } from './PROPOSED-jump';

export type TrialFlag =
  | 'frameRate'      // timed under the lab frame rate: an estimate
  | 'framesOnly'     // the refiner could not re-time it: the finder's frame edges
  | 'landedLow'      // landed flexed or flat-footed (corrected)
  | 'feetUnclear'    // its own ± is wide: blur or something in the way
  | 'moved'          // landed nearer or further from the lens than it left
  | 'outlier';       // far above the session's other jumps

export interface TrialQuality {
  flags: TrialFlag[];
  /** No flag but (at most) frameRate: the trial counts toward a verified best. */
  clean: boolean;
}

/** One tip per flag, said plainly (the first flag's tip is the one shown). */
export const TRIAL_TIPS: Record<TrialFlag, string> = {
  landedLow: 'Land tall, on your toes, then bend. Landing with bent knees makes a jump read high, so it was corrected.',
  feetUnclear: 'Your feet were hard to see. Use good light and keep your whole body, feet too, in the shot.',
  moved: 'Jump straight up and land on the same spot.',
  outlier: 'One jump was far above the others, so it was not used as your verified best.',
  framesOnly: 'This jump was timed from whole frames only, so its range is wider.',
  frameRate: 'Your camera ran under 120 frames a second, so this is an estimate. A slow-motion video gives a lab-grade read.',
};

const FLAG_ORDER: TrialFlag[] = ['landedLow', 'feetUnclear', 'moved', 'outlier', 'framesOnly', 'frameRate'];

/** A trial's flags, from its refined read (null = the finder's frames) and the pose rate it was timed at. */
export function trialQuality(o: { refined: RefinedFlight | null; poseHz: number; valid: boolean }): TrialQuality {
  const f = new Set<TrialFlag>();
  const r = o.refined;
  if (o.poseHz < jr('jump.labFps')) f.add('frameRate');
  if (!r) f.add('framesOnly');
  else {
    if (r.landDropCm !== null && r.landDropCm < -jr('jump.landedLowCm') && Math.abs(r.landDropCm) > 2 * (r.landDropSdCm ?? 0)) f.add('landedLow');
    if (r.heightTovSdCm > jr('jump.unclearSdCm')) f.add('feetUnclear');
    if (r.dropSkipped === 'moved') f.add('moved');
  }
  const flags = FLAG_ORDER.filter((x) => f.has(x));
  return { flags, clean: o.valid && flags.every((x) => x === 'frameRate') };
}

/** The tip a set of flags gets: the most important one. */
export const tipFor = (q: TrialQuality | undefined): string | null => (q?.flags.length ? TRIAL_TIPS[q.flags[0]] : null);

/** The session's one tip: the most important flag on any counted jump (a low landing before "estimate"). */
export function sessionTip(trials: readonly { valid: boolean; quality?: TrialQuality }[]): string | null {
  const seen = new Set(trials.filter((t) => t.valid).flatMap((t) => t.quality?.flags ?? []));
  const f = FLAG_ORDER.find((x) => seen.has(x));
  return f ? TRIAL_TIPS[f] : null;
}

/** The trial shape session.ts reads (JumpRead's fields). */
export interface TrialLike { index: number; heightCm: number; heightSdCm?: number | null; quality?: TrialQuality }

export interface JumpSession {
  n: number;
  /** The best valid jump (cm) and its index; and the best CLEAN one, the one a verified best can come from. */
  bestCm: number | null;
  bestIndex: number | null;
  bestCleanCm: number | null;
  bestCleanIndex: number | null;
  meanCm: number | null;
  /** Sample SD of the valid heights (null under 2). */
  sdCm: number | null;
  cvPct: number | null;
  /** The measurement's own ±1 SD (cm): the RMS of the trials' own SDs. */
  measurementSdCm: number | null;
  /** The session's typical error (cm): the larger of its spread, its measurement SD, and the body's own CV. */
  typicalErrorCm: number | null;
  /** The smallest change (cm) from this session to the next that is real (realChange), against a session like it. */
  realChangeCm: number | null;
  /** Indices flagged as outliers. */
  outliers: number[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** z of a two-sided 95 % range: a jump's ± is 1.96 × its own SD. */
export const CI95_Z = 1.96;

/** The valid trials as a set. Outliers (3+ trials) are flagged on the trial's quality as a side effect. */
export function sessionStats(valid: readonly TrialLike[]): JumpSession {
  const n = valid.length;
  const empty: JumpSession = { n, bestCm: null, bestIndex: null, bestCleanCm: null, bestCleanIndex: null, meanCm: null, sdCm: null, cvPct: null, measurementSdCm: null, typicalErrorCm: null, realChangeCm: null, outliers: [] };
  if (!n) return empty;
  const hs = valid.map((j) => j.heightCm);
  // outliers: far above the others' median (needs 3+, so "the others" means something)
  const outliers: number[] = [];
  if (n >= 3) {
    for (const j of valid) {
      const others = valid.filter((x) => x !== j).map((x) => x.heightCm).sort((a, b) => a - b);
      const med = others.length % 2 ? others[others.length >> 1] : (others[others.length / 2 - 1] + others[others.length / 2]) / 2;
      if (j.heightCm > med * (1 + jr('jump.outlierPct') / 100)) {
        outliers.push(j.index);
        if (j.quality && !j.quality.flags.includes('outlier')) {
          const has = new Set<TrialFlag>([...j.quality.flags, 'outlier']);
          j.quality.flags = FLAG_ORDER.filter((x) => has.has(x));
          j.quality.clean = false;
        }
      }
    }
  }
  const best = valid.reduce((a, j) => (j.heightCm > a.heightCm ? j : a));
  const clean = valid.filter((j) => j.quality?.clean !== false && !outliers.includes(j.index));
  const bestClean = clean.length ? clean.reduce((a, j) => (j.heightCm > a.heightCm ? j : a)) : null;
  const mean = hs.reduce((a, b) => a + b, 0) / n;
  const sd = n >= 2 ? Math.sqrt(hs.reduce((a, h) => a + (h - mean) ** 2, 0) / (n - 1)) : null;
  const sds = valid.map((j) => j.heightSdCm).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const msd = sds.length ? Math.sqrt(sds.reduce((a, s) => a + s * s, 0) / sds.length) : null;
  const te = Math.max(sd ?? 0, msd ?? 0, (mean * jr('jump.bioCvPct')) / 100);
  return {
    n, bestCm: best.heightCm, bestIndex: best.index,
    bestCleanCm: bestClean ? bestClean.heightCm : null, bestCleanIndex: bestClean ? bestClean.index : null,
    meanCm: r1(mean), sdCm: sd === null ? null : r1(sd), cvPct: sd === null ? null : r1((sd / mean) * 100),
    measurementSdCm: msd === null ? null : r1(msd), typicalErrorCm: r1(te),
    realChangeCm: r1(jr('jump.realChangeZ') * Math.SQRT2 * te), outliers,
  };
}

/**
 * Is `now` really different from `before`? Each is a session's best (cm) with its typical error. "same" unless the
 * difference beats z·√(te₁² + te₂²): the owner's promise is "get measurably better", so "better" must be measured.
 */
export function realChange(now: { cm: number; teCm: number }, before: { cm: number; teCm: number }): { kind: 'up' | 'down' | 'same'; deltaCm: number; bandCm: number } {
  const d = now.cm - before.cm, band = jr('jump.realChangeZ') * Math.hypot(now.teCm, before.teCm);
  return { kind: Math.abs(d) <= band ? 'same' : d > 0 ? 'up' : 'down', deltaCm: r1(d), bandCm: r1(band) };
}

/** The typical error a saved best carries when nothing else is known: the bench's ±1 SD at that pose rate and the body's CV. */
export function defaultTypicalErrorCm(heightCm: number, poseHz: number | null): number {
  // bench (docs/JUMP-PRO.md), refined, realistic noise: ~1.5 cm at 30 fps, ~1.4 at 60, ~1.0 at 120, ~0.7 at 240
  const meas = poseHz === null ? 1.5 : poseHz >= 200 ? 0.7 : poseHz >= 100 ? 1.0 : poseHz >= 50 ? 1.4 : 1.5;
  return Math.max(meas, (heightCm * jr('jump.bioCvPct')) / 100);
}

// ── verified ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** PR #424's levels, restated (its trust-rows.ts is not imported, so this lane never edits or depends on it). */
export type TrustLevelHook = 'high' | 'medium' | 'low';

export type VerifyBlock = 'notValid' | 'frameRate' | 'landing' | 'unclear' | 'moved' | 'outlier' | 'framesOnly' | 'trustLow' | 'notBest';

export interface Verified { verified: boolean; source: 'live' | 'slowmo'; blocks: VerifyBlock[] }

/**
 * The owner's verified rule (2026-10-24). A jump is verified only on:
 *   · a high-trust live read: timed at jump.verifiedFps or more, re-timed (not frame edges), a clean landing, its own
 *     ±1 SD within jump.verifiedSdCm, the feet seen throughout (no blur/occlusion flag), no move toward the lens, not
 *     an outlier — and, when PR #424's rating is passed in, not rated Low;
 *   · or a slow-mo upload (source 'slowmo') at jump.labFps or more with the same per-trial rules.
 * A coach's sign-off is a badge on top (not here: it needs storage — docs/JUMP-PRO.md, follow-ups).
 */
export function verifyJump(j: TrialLike & { valid: boolean; method?: 'refined' | 'frames' }, ctx: { poseHz: number; source: 'live' | 'slowmo'; trust?: TrustLevelHook | null }): Verified {
  const b = new Set<VerifyBlock>();
  if (!j.valid) b.add('notValid');
  const minFps = ctx.source === 'slowmo' ? jr('jump.labFps') : jr('jump.verifiedFps');
  if (ctx.poseHz < minFps) b.add('frameRate');
  if (j.method !== 'refined') b.add('framesOnly');
  const fl = j.quality?.flags ?? [];
  if (fl.includes('landedLow')) b.add('landing');
  if (fl.includes('feetUnclear') || (j.heightSdCm ?? Infinity) > jr('jump.verifiedSdCm')) b.add('unclear');
  if (fl.includes('moved')) b.add('moved');
  if (fl.includes('outlier')) b.add('outlier');
  if (ctx.trust === 'low') b.add('trustLow');
  return { verified: b.size === 0, source: ctx.source, blocks: [...b] };
}
