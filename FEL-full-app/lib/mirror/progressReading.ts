// progressReading — one comparable number per Mirror movement, for "vs your last 3" (MIRROR-PROGRESS, plan Phase 4,
// "progress you can see", 2026-10-07).
//
// WHAT IS COMPARED. Each review already reads every work-set rep (squatStage / lungeStage / sideRepStage) — which faults
// each rep showed, or that the camera could not read it. The headline is the share of READ work-set reps with no fault
// the review judges ("clean reps 75%"), higher is better. The press/row has no per-rep book on the page, only the
// session summary, so its headline is the zone faults it counted per rep, lower is better — the same two columns the
// server has always stored for it (MirrorSession.reps / faultCounts), so older press/row sessions compare too.
//
// WHERE IT GOES (owner decision 1, 2026-10-07: under-18s keep their progress ON THE DEVICE ONLY):
//   · an adult the server says may save (canSaveScan — lib/privacy/scanSaveGate.ts canSaveScanNumbers: verified 18+ AND
//     opted in) on the squat, lunge or press/row: the reading rides on the session POST the harness already makes
//     (squat and lunge also send their per-check `checkValues`), and the route answers with the last 3 saved values;
//   · everyone else — under 18, no birth year, an adult who has not opted in — and the hinge and push-up for EVERYONE
//     (those tabs send nothing for anyone, MIRROR-MOVES P2): the value is kept on this phone only
//     (lib/mirror/deviceProgress.ts) and compared there. Nothing is sent.
//
// A COMPARISON, NEVER A SCORE (lib/mirror/baselines.ts's rule): nothing here pays, ranks or changes what the review says
// faulted. Pure: no React, no storage, no fetch.
import type { CheckDirection, RecentComparison } from './baselines';
import { RECENT_SETS, readCheckValues } from './baselines';
import { lungeSideUnreadable, type LungeSessionState } from './lungeStage';
import type { SideRep } from './sideRepStage';

export type ProgressMovement = 'squat' | 'lunge' | 'pressRow' | 'hinge' | 'pushup';
export const PROGRESS_MOVEMENTS: readonly ProgressMovement[] = ['squat', 'lunge', 'pressRow', 'hinge', 'pushup'];

/** The movements whose sets an opted-in adult saves (the session POST). The hinge and push-up send nothing for anyone. */
export const SERVER_PROGRESS: readonly ProgressMovement[] = ['squat', 'lunge', 'pressRow'];

/**
 * The patternId a saved session carries, per Mirror tab. Before this, EVERY tab's End posted the runtime's own id
 * ('split-stance-press-row' — the pose runtime always runs the press/row zones), so a squat, a lunge, a jump or a screen
 * was saved as a press/row set and the correctives program (lib/mirror/correctives.ts findingFromRow) read it as one.
 */
export const SAVED_PATTERN_ID: Readonly<Record<string, string>> = {
  // = lib/mirror/correctives.ts PRESS_ROW_PATTERN_ID (a test holds them together; not imported, so the sessions route does
  // not pull the correctives' copy and the health intake into its bundle)
  pressRow: 'split-stance-press-row',
  squat: 'squat',
  lunge: 'lunge',
  hinge: 'hinge',
  pushup: 'pushup',
  jump: 'jump',
  screen: 'screen',
};
export const savedPatternId = (tab: string, runtimeId: string): string => SAVED_PATTERN_ID[tab] ?? runtimeId;

/** The movement a Mirror tab compares, or null (the jump and the screen have their own history and grades). */
export function progressMovementFor(tab: string): ProgressMovement | null {
  return (PROGRESS_MOVEMENTS as readonly string[]).includes(tab) ? (tab as ProgressMovement) : null;
}

/** The movement a saved session's patternId belongs to, or null. */
export function movementForPatternId(patternId: string): ProgressMovement | null {
  for (const m of PROGRESS_MOVEMENTS) if (SAVED_PATTERN_ID[m] === patternId) return m;
  return null;
}

/** Where this movement's history lives for this viewer. Only an exact `true` from the server's gate reads the server. */
export function progressSource(movement: ProgressMovement, canSaveScan: unknown): 'server' | 'device' {
  return canSaveScan === true && SERVER_PROGRESS.includes(movement) ? 'server' : 'device';
}

export interface ProgressHeadline {
  id: 'cleanShare' | 'faultsPerRep';
  direction: CheckDirection;
  /** Within this (absolute, the value's own unit) of the recent mean reads "about the same". PROPOSED — see the report. */
  sameBand: number;
  label: string;
  format: (n: number) => string;
}

/** assumption (PROPOSED, owner's eye): 0.1 of a share — under one rep of an 8-rep set — is noise; 0.25 zone faults a rep. */
export const CLEAN_SHARE_SAME_BAND = 0.1;
export const FAULTS_PER_REP_SAME_BAND = 0.25;

const CLEAN: ProgressHeadline = {
  id: 'cleanShare', direction: 'higherIsBetter', sameBand: CLEAN_SHARE_SAME_BAND, label: 'Clean reps',
  format: (n) => `${Math.round(n * 100)}%`,
};
const PER_REP: ProgressHeadline = {
  id: 'faultsPerRep', direction: 'lowerIsBetter', sameBand: FAULTS_PER_REP_SAME_BAND, label: 'Zone faults per rep',
  format: (n) => n.toFixed(1),
};
export const HEADLINE: Readonly<Record<ProgressMovement, ProgressHeadline>> = {
  squat: CLEAN, lunge: CLEAN, hinge: CLEAN, pushup: CLEAN, pressRow: PER_REP,
};

/** Fewer read reps than this and a set is not compared or kept: two reps say nothing about a trend. */
export const PROGRESS_MIN_REPS = 3;

export interface ProgressReading {
  movement: ProgressMovement;
  /** The headline (HEADLINE[movement]). */
  value: number;
  /** The read work-set reps it is built from. */
  reps: number;
  /** The per-check values sent with an opted-in adult's squat or lunge (route → baselines.ts recordCheckValues). */
  checkValues: Record<string, number>;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** cleanShare over these reps, plus each fault's share of them (a fault on no rep is left out). */
function shares(reps: readonly (readonly string[])[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!reps.length) return out;
  const counts = new Map<string, number>();
  let clean = 0;
  for (const rep of reps) {
    const faults = new Set(rep);
    if (faults.size === 0) clean += 1;
    for (const f of faults) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  out.cleanShare = r3(clean / reps.length);
  for (const [f, n] of counts) out[f] = r3(n / reps.length);
  return out;
}

/**
 * The guided squat's work set. `judged` keeps only the faults the review judges (cue-engine.ts cueableFaults, and the
 * knee only when it was read square — the same filter squatReviewVerdict gets), so an unjudged read never costs a clean rep.
 */
export function squatReading(workReps: readonly (readonly string[])[], judged: (faults: readonly string[]) => readonly string[]): ProgressReading | null {
  if (workReps.length < PROGRESS_MIN_REPS) return null;
  const reps = workReps.map((r) => judged(r));
  const values = shares(reps);
  return { movement: 'squat', value: values.cleanShare, reps: reps.length, checkValues: { ...values, reps: reps.length } };
}

/** The lunge: both sides' reps, a side read off square left out (the review says "not read" for it), and each side's share. */
export function lungeReading(state: Pick<LungeSessionState, 'workReps' | 'framedOk' | 'framedWrong'>): ProgressReading | null {
  const sides = (['left', 'right'] as const).filter((s) => !lungeSideUnreadable(state, s));
  const reps = sides.flatMap((s) => state.workReps[s]);
  if (reps.length < PROGRESS_MIN_REPS) return null;
  const values = shares(reps);
  const perSide: Record<string, number> = {};
  for (const s of sides) if (state.workReps[s].length) perSide[`${s}.cleanShare`] = shares(state.workReps[s]).cleanShare;
  return { movement: 'lunge', value: values.cleanShare, reps: reps.length, checkValues: { ...values, ...perSide, reps: reps.length } };
}

/** The hinge or the push-up: the work set's READ reps (a rep the view or the light hid is neither clean nor faulted). */
export function sideRepReading(movement: 'hinge' | 'pushup', state: { workReps: readonly SideRep<string>[] }): ProgressReading | null {
  const read = state.workReps.filter((r) => r.read).map((r) => r.faults);
  if (read.length < PROGRESS_MIN_REPS) return null;
  const values = shares(read);
  return { movement, value: values.cleanShare, reps: read.length, checkValues: { ...values, reps: read.length } };
}

/** Zone faults counted per rep (keys with a leading underscore are stored values, never counts — baselines.ts). */
function faultsPerRep(reps: number, faultCounts: unknown): number | null {
  if (!(reps >= PROGRESS_MIN_REPS) || !faultCounts || typeof faultCounts !== 'object' || Array.isArray(faultCounts)) return null;
  let sum = 0;
  for (const [k, v] of Object.entries(faultCounts as Record<string, unknown>)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) sum += v;
  }
  return r3(sum / reps);
}

/** The press/row, from the session summary End shows (the runtime's reps and zone fault counts). */
export function pressRowReading(summary: { reps: number; faultCounts: unknown }): ProgressReading | null {
  const v = faultsPerRep(summary.reps, summary.faultCounts);
  return v === null ? null : { movement: 'pressRow', value: v, reps: summary.reps, checkValues: { faultsPerRep: v, reps: summary.reps } };
}

/** A saved session's headline, or null (another movement, too few reps, or a row saved before its values were sent). */
export function valueFromRow(row: { patternId: string; reps?: number | null; faultCounts: unknown }): number | null {
  const m = movementForPatternId(row.patternId);
  if (!m) return null;
  if (m === 'pressRow') return faultsPerRep(typeof row.reps === 'number' ? row.reps : 0, row.faultCounts);
  const v = readCheckValues(row.faultCounts)?.cleanShare;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

// ── what the review says ────────────────────────────────────────────────────────────────────────────────────────────

export type ProgressSource = 'server' | 'device';

export interface ProgressView {
  movement: ProgressMovement;
  source: ProgressSource;
  kind: 'compared' | 'first' | 'tooFew' | 'unavailable';
  heading: string;
  line: string;
  /** Where the history lives — always said, so a phone-only history is never mistaken for a saved one. */
  where: string;
}

export const WHERE_SERVER = 'From your saved sessions.';
export const WHERE_DEVICE = 'Kept on this phone only — never sent. Forget it any time.';
export const TOO_FEW_LINE = `Too few reps were read to compare — ${PROGRESS_MIN_REPS} or more counts.`;
export const FIRST_LINE = 'First one on record — your next set is compared with this one.';
export const SERVER_UNAVAILABLE_LINE = 'Your saved sessions could not be read just now — no comparison this time.';
export const DEVICE_UNAVAILABLE_LINE = 'This phone is not keeping a history (private browsing or blocked storage), so there is nothing to compare.';

const STATUS_LINE: Record<'better' | 'same' | 'worse', (n: number) => string> = {
  better: (n) => `Better than your last ${n === 1 ? 'set' : n}.`,
  same: (n) => `About the same as your last ${n === 1 ? 'set' : n}.`,
  worse: (n) => `Not as clean as your last ${n === 1 ? 'set' : n}.`,
};

/** The review's "vs your last 3" block, from a comparison (null: the set was too short to read, or there is no history to read). */
export function progressView(
  movement: ProgressMovement, source: ProgressSource,
  outcome: { kind: 'tooFew' } | { kind: 'unavailable' } | { kind: 'read'; comparison: RecentComparison },
): ProgressView {
  const where = source === 'server' ? WHERE_SERVER : WHERE_DEVICE;
  const h = HEADLINE[movement];
  const base = { movement, source, where, heading: `vs your last ${RECENT_SETS}` };
  if (outcome.kind === 'tooFew') return { ...base, kind: 'tooFew', line: TOO_FEW_LINE };
  if (outcome.kind === 'unavailable') return { ...base, kind: 'unavailable', line: source === 'server' ? SERVER_UNAVAILABLE_LINE : DEVICE_UNAVAILABLE_LINE };
  const c = outcome.comparison;
  if (c.kind === 'first') return { ...base, kind: 'first', line: FIRST_LINE };
  const ago = c.n === 1 ? 'your last set' : `your last ${c.n} averaged`;
  return {
    ...base, kind: 'compared', heading: `vs your last ${c.n}`,
    line: `${h.label} ${h.format(c.value)} — ${ago} ${h.format(c.recentMean)}. ${STATUS_LINE[c.status](c.n)}`,
  };
}
