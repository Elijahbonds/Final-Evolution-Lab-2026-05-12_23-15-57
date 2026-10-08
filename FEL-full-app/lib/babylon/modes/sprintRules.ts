// sprintRules — IMPROVE (2026-10-06): the pure rules behind the owner-picked Sprint improvements.
//
// SprintMode draws; everything here is arithmetic, so it is tested without a scene:
//   · the PACER'S RUN — a sprinter's acceleration curve that still breasts the tape at the signed-off 13.4 s (the rival
//     ran a constant 7.46 m/s from the gun: it jumped ahead instantly, which read as robotic and made the first 30 m
//     unreadable). The same curve, run to WIN_TIME, is the sub-13 pace light on the track;
//   · REPEAT FALSE STARTS cost time (the first is a warning, as before);
//   · the off-beat CALL — FASTER or SLOWER from the cadence's signed timing error;
//   · PB SPLITS — the clock at every 10 m of the best finished run, kept per viewer; the 30 / 60 m calls and the PB
//     marker on the track read it. racing/ghost's rule (compare at the same DISTANCE) and FreeRunSplits' shape;
//   · the HUD GATE — a push on a discrete change, else at SPRINT_HUD_HZ.
//
// No score bound depends on this: sprint is not Arena-staked (lib/arena-score-integrity.test.ts: retired), and the
// only scoring change, the false-start penalty, can only LOWER a score (a longer time).

import { deltaLabel } from '../racing/ghost';

// ── the pacer ────────────────────────────────────────────────────────────────

/**
 * The pacer's acceleration time constant, seconds. v(t) = vMax·(1 − e^(−t/τ)), the textbook sprint curve: ~63 % of top
 * speed after τ, ~95 % after 3τ. 1.2 s puts a club sprinter at 4.6 m/s one second out of the blocks and 8.2 m/s flat
 * out. // TUNE(elijah)
 */
export const PACER_TAU_S = 1.2;

/** The top speed that covers `distM` in exactly `raceS` on the curve (the closed form of d(raceS) = distM). */
export function pacerTopSpeed(raceS: number, distM: number, tau = PACER_TAU_S): number {
  if (!(raceS > 0) || !(distM > 0)) return 0;
  const t = tau > 0 ? tau * (1 - Math.exp(-raceS / tau)) : 0;
  return distM / (raceS - t);
}

/** Metres covered `t` seconds after the gun by a runner who finishes `distM` in `raceS`. Clamped to [0, distM]. */
export function pacerDistance(t: number, raceS: number, distM: number, tau = PACER_TAU_S): number {
  if (!(t > 0)) return 0;
  const v = pacerTopSpeed(raceS, distM, tau);
  const d = tau > 0 ? v * (t - tau * (1 - Math.exp(-t / tau))) : v * t;
  return Math.min(distM, Math.max(0, d));
}

/** That runner's speed `t` seconds after the gun (m/s) — what the rival's run cycle is played at. */
export function pacerSpeed(t: number, raceS: number, distM: number, tau = PACER_TAU_S): number {
  if (!(t > 0)) return 0;
  const v = pacerTopSpeed(raceS, distM, tau);
  return tau > 0 ? v * (1 - Math.exp(-t / tau)) : v;
}

/** "+1.2 m" ahead / "−0.8 m" behind — the gap the player actually races. */
export function gapLabel(m: number): string {
  if (!Number.isFinite(m)) return '';
  const r = Math.round(m * 10) / 10;
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(1)} m`;
}

// ── false starts ─────────────────────────────────────────────────────────────

/** False starts that cost nothing (the first is the warning). // TUNE(elijah) */
export const FALSE_START_FREE = 1;
/** Seconds added to the finish for every false start past the free one. // TUNE(elijah) */
export const FALSE_START_PENALTY_S = 0.2;

/** Seconds the false starts add to the finish. */
export function falseStartPenaltyS(falseStarts: number): number {
  return Math.max(0, Math.floor(falseStarts) - FALSE_START_FREE) * FALSE_START_PENALTY_S;
}

// ── the off-beat call ────────────────────────────────────────────────────────

/** Which way to correct an off-beat stride: + error = the stride came late (too slow). Null with nothing to say. */
export function cadenceCall(errMs: number | null): 'FASTER' | 'SLOWER' | null {
  if (errMs === null || !Number.isFinite(errMs) || errMs === 0) return null;
  return errMs > 0 ? 'FASTER' : 'SLOWER';
}

// ── PB splits ────────────────────────────────────────────────────────────────

/** A split every this many metres (the PB marker interpolates between them). */
export const SPRINT_MARK_M = 10;
/** The splits that are CALLED out loud. */
export const SPRINT_CALLED_SPLITS_M = [30, 60] as const;

export interface SprintPb {
  /** The finish time of the best finished run (the time on the result, dip and penalties in), ms. */
  totalMs: number;
  /** That run's race clock at 10, 20, … metres, ms (the last is the clock at the tape). */
  atM: number[];
}

export const SPRINT_PB_PREFIX = 'fel-sprint-pb-v1:';

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
function storage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function sprintPbKey(distM: number): string { return `${SPRINT_PB_PREFIX}${distM}`; }

function validPb(pb: unknown, marks: number): pb is SprintPb {
  const p = pb as SprintPb;
  if (!(typeof p?.totalMs === 'number' && p.totalMs > 0) || !Array.isArray(p.atM) || p.atM.length !== marks) return false;
  for (let i = 0; i < p.atM.length; i++) {
    const t = p.atM[i];
    if (!(typeof t === 'number' && Number.isFinite(t) && t > 0) || (i > 0 && t < p.atM[i - 1])) return false;
  }
  return true;
}

export function loadSprintPb(distM: number, store: StorageLike | null = storage()): SprintPb | null {
  if (!store) return null;
  try {
    const raw = store.getItem(sprintPbKey(distM));
    if (!raw) return null;
    const pb = JSON.parse(raw) as unknown;
    return validPb(pb, Math.floor(distM / SPRINT_MARK_M)) ? pb : null;
  } catch { return null; }
}

/** Keep the run if it is the first finish or beats the best. Only a complete run (a split at every mark) is kept. */
export function saveSprintPbIfFaster(distM: number, run: SprintPb, store: StorageLike | null = storage()): { improved: boolean; previous: SprintPb | null } {
  const previous = loadSprintPb(distM, store);
  if (!validPb(run, Math.floor(distM / SPRINT_MARK_M)) || (previous && previous.totalMs <= run.totalMs)) return { improved: false, previous };
  if (store) { try { store.setItem(sprintPbKey(distM), JSON.stringify({ totalMs: run.totalMs, atM: [...run.atM] })); } catch { /* full or blocked */ } }
  return { improved: true, previous };
}

/**
 * The marks crossed between two frames, each with its clock interpolated on the distance (a frame at 10 m/s covers
 * 0.17 m; reading the clock of the frame after the line would lose up to a frame on every split). `(prevM, nowM]`.
 */
export function marksCrossed(prevM: number, nowM: number, prevMs: number, nowMs: number, every = SPRINT_MARK_M): { m: number; ms: number }[] {
  const out: { m: number; ms: number }[] = [];
  if (!(nowM > prevM) || !(every > 0)) return out;
  for (let m = (Math.floor(prevM / every) + 1) * every; m <= nowM + 1e-9; m += every) {
    const f = (m - prevM) / (nowM - prevM);
    out.push({ m, ms: prevMs + (nowMs - prevMs) * f });
  }
  return out;
}

/** The delta at mark `m` (metres) in ms against the PB: negative is ahead. Null with no PB split there. */
export function splitDeltaMs(pb: SprintPb | null, m: number, ms: number): number | null {
  const at = pb?.atM[Math.round(m / SPRINT_MARK_M) - 1];
  return typeof at === 'number' ? ms - at : null;
}

/** "PB −0.08" / "PB +0.31", or '' with nothing to compare. */
export function pbSplitWords(deltaMs: number | null): string { return deltaMs == null ? '' : `PB ${deltaLabel(deltaMs)}`; }

/** Where the PB run was `tMs` into its race (metres) — the PB marker on the track. Linear between the 10 m splits. */
export function pbDistanceAt(pb: SprintPb | null, tMs: number): number | null {
  if (!pb || !(tMs > 0)) return pb ? 0 : null;
  let prevT = 0, prevM = 0;
  for (let i = 0; i < pb.atM.length; i++) {
    const t = pb.atM[i], m = (i + 1) * SPRINT_MARK_M;
    if (tMs <= t) return t > prevT ? prevM + (m - prevM) * (tMs - prevT) / (t - prevT) : m;
    prevT = t; prevM = m;
  }
  return prevM;
}

// ── the HUD gate ─────────────────────────────────────────────────────────────

/** The continuous read-outs (clock, distance, speed, gaps) are sent this often; a discrete change goes at once. */
export const SPRINT_HUD_HZ = 10;

/** Push the HUD now? On any discrete change (phase, banner, a stride, a false start), else once per 1/SPRINT_HUD_HZ. */
export function hudDue(prevKey: string | null, key: string, sinceS: number): boolean {
  return prevKey !== key || sinceS >= 1 / SPRINT_HUD_HZ;
}
