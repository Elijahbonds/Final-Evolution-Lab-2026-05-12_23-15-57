// lib/vbt/milestones.ts — VBT (2026-10-25): the game tie-in. Bar-speed milestones that open practice challenges, kept on
// the device, and the typed seam a game reads (the jump check's pattern: lib/jump/seam.ts; the device ladder's pattern:
// lib/babylon/core/DunkUnlocks.ts).
//
// FAIRNESS (owner rule, the jump seam's): a real rep NEVER sells an advantage in ranked, staked or paid play. A milestone
// here opens a PRACTICE challenge card and a badge — nothing that changes a score, a stake, a payout or a match. Whoever
// consumes the seam in a game applies that rule; this file only says what was reached. Nothing here is sent anywhere.
//
// WHAT COUNTS. A counted rep's MCV (or a ballistic move's PV, or a throw's release) at or over a rung, from a set read at
// a usable frame rate. Rungs are ranges a coach would recognise from the zone table (lib/vbt/lifts.ts), not records.
// A teen earns the technique-speed rungs only (no loaded max-effort rung; lib/vbt/gate.ts), and they are kept on the
// device as rung ids only — never a number.
//
// Pure apart from the two storage helpers, which take the storage as an argument.
import type { LiftFamily, LiftId } from './lifts';
import { LIFTS } from './lifts';

export interface Milestone {
  id: string;
  label: string;
  /** What reaches it: a family (or one lift), the measure, and the speed (m/s). */
  family: LiftFamily | 'any';
  measure: 'mcv' | 'pv' | 'release';
  atLeast: number;
  /** The practice challenge it opens (a card on /train/velocity; no game mode is changed by this lane). */
  challenge: string;
  /** Adults only (a loaded, near-max effort). */
  adultOnly: boolean;
}

/** (new) The ladder. Labels and rungs are draft product copy for the owner's eye. */
export const MILESTONES: readonly Milestone[] = [
  { id: 'first_set', label: 'First tracked set', family: 'any', measure: 'mcv', atLeast: 0, challenge: 'Five reps, all in one colour zone', adultOnly: false },
  { id: 'body_1ms', label: 'Body-only 1.0 m/s', family: 'body', measure: 'mcv', atLeast: 1.0, challenge: 'Ten push-ups, none under 0.6 m/s', adultOnly: false },
  { id: 'bar_speed_strength', label: 'Bar in the speed-strength zone', family: 'barbell', measure: 'mcv', atLeast: 1.0, challenge: 'Three sets of three, all over 1.0 m/s', adultOnly: false },
  { id: 'bar_power_2ms', label: 'Peak bar speed 2.0 m/s', family: 'barbell', measure: 'pv', atLeast: 2.0, challenge: 'Beat your best clean peak by 0.1 m/s', adultOnly: true },
  { id: 'kb_2ms', label: 'Kettlebell swing peak 2.0 m/s', family: 'dbkb', measure: 'pv', atLeast: 2.0, challenge: 'Ten swings, none under 1.8 m/s peak', adultOnly: true },
  { id: 'ball_6ms', label: 'Med-ball release 6 m/s', family: 'medball', measure: 'release', atLeast: 6, challenge: 'Five throws inside 0.3 m/s of each other', adultOnly: true },
];

export interface SpeedRecord { lift: LiftId; mcv: number | null; pv: number | null; release: number | null; fps: number }

/** (new) A set read under this pose rate earns nothing (the numbers are too coarse to celebrate). */
export const MILESTONE_MIN_FPS = 24;

/** The rungs a set reaches. */
export function reached(rec: SpeedRecord, teen: boolean): string[] {
  if (rec.fps < MILESTONE_MIN_FPS) return [];
  const fam = LIFTS[rec.lift].family;
  return MILESTONES.filter((m) => {
    if (teen && m.adultOnly) return false;
    if (m.family !== 'any' && m.family !== fam) return false;
    const v = m.measure === 'mcv' ? rec.mcv : m.measure === 'pv' ? rec.pv : rec.release;
    return v != null && v >= m.atLeast;
  }).map((m) => m.id);
}

// ── the device's record: rung ids only ───────────────────────────────────────────────────────────────────────────

export const MILESTONES_KEY = 'fel.vbt.milestones.v1';
interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function readMilestones(s: StorageLike | null): string[] {
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(MILESTONES_KEY) ?? '[]');
    const ids = new Set(MILESTONES.map((m) => m.id));
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && ids.has(x)) : [];
  } catch {
    return [];
  }
}

/** Add the rungs a set reached; returns the NEW ones (for the "unlocked" line). */
export function addMilestones(s: StorageLike | null, ids: readonly string[]): string[] {
  const have = readMilestones(s);
  const fresh = ids.filter((id) => !have.includes(id));
  if (!fresh.length || !s) return fresh;
  try { s.setItem(MILESTONES_KEY, JSON.stringify([...have, ...fresh])); } catch { /* the session still shows them */ }
  return fresh;
}

/** The seam a game reads: which practice challenges are open. Never a speed, never a stat boost. */
export function openChallenges(s: StorageLike | null): { id: string; label: string; challenge: string }[] {
  const have = new Set(readMilestones(s));
  return MILESTONES.filter((m) => have.has(m.id)).map((m) => ({ id: m.id, label: m.label, challenge: m.challenge }));
}
