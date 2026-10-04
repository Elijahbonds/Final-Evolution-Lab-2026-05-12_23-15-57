// Saved answers to the 8 health-intake questions, on this device only (SCREEN-JUMP-ONLY).
//
// WHO MAY KEEP THEM. A verified adult account — canWriteHealthData, which is verifiedAdult on the database year
// (lib/privacy/verifiedAdult.ts). This file does not invent another age rule: the caller passes that boolean.
// The screen's own band (lib/screen/age.ts isKid) can still refuse: under 13, 13–17 and "rather not say" never
// write, and a band that is a kid deletes the key. No screen answer yet (null) does not, by itself, refuse a
// verified account.
//
// The blob is localStorage key fel.intake.v1. It is never sent. A fresh submit may still use the intake's own
// POST; this blob is a copy the next visit can offer back. It expires 30 days after savedAt.
//
// assumption: a red-flag "yes" also blocks the one-tap, and the questions open pre-filled instead. The brief
// requires that only for a pain answer that is not "no".
import { INTAKE_IDS, PUBLIC_INTAKE_QUESTIONS, RED_FLAG_QUESTION_IDS } from '@/lib/health/intake';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { isKid, type AgeBand } from '@/lib/screen/age';
import { forgetIntakeMemory, INTAKE_MEMORY_KEY } from './intakeForget';

export { INTAKE_MEMORY_KEY, forgetIntakeMemory };

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type IntakeMemoryAnswers = Record<string, boolean | number>;

export interface IntakeBlob {
  v: 1;
  savedAt: string;
  answers: IntakeMemoryAnswers;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function localStore(): Store | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/**
 * Verified account AND a screen band that is not a kid. `verified` is canWriteHealthData's answer
 * (verifiedAdult on User.dobYear). Passing a birth year through verifiedAdult is the same check.
 */
export function mayKeepIntake(band: AgeBand | null, verified: boolean): boolean {
  if (!verified) return false;
  if (band !== null && isKid(band)) return false;
  return true;
}

/** The same rule, with the year run through verifiedAdult so this file does not re-decide 18+. */
export function mayKeepIntakeForYear(band: AgeBand | null, dobYear: number | null | undefined, now?: Date): boolean {
  return mayKeepIntake(band, verifiedAdult(dobYear, now));
}

/** Pain was not answered "no" (yes, skipped, or missing): the one-tap is not offered. */
export function painBlocksOneTap(answers: IntakeMemoryAnswers): boolean {
  return answers[INTAKE_IDS.currentPain] !== false;
}

/** assumption: a red-flag yes also blocks the one-tap. */
export function redFlagBlocksOneTap(answers: IntakeMemoryAnswers): boolean {
  return RED_FLAG_QUESTION_IDS.some((id) => answers[id] === true);
}

export type RecallPlan = 'one-tap' | 'pain' | 'full' | 'none';

export function recallPlan(band: AgeBand | null, verified: boolean, blob: IntakeBlob | null, now = Date.now()): RecallPlan {
  if (!blob) return 'none';
  if (!mayKeepIntake(band, verified)) return 'none';
  if (redFlagBlocksOneTap(blob.answers)) return 'full';
  if (painBlocksOneTap(blob.answers)) return 'pain';
  return 'one-tap';
}

function parse(raw: string | null, now: number, s: Store | null): IntakeBlob | null {
  try {
    const o = JSON.parse(raw ?? 'null') as IntakeBlob | null;
    if (!o || o.v !== 1 || typeof o.savedAt !== 'string' || !o.answers || typeof o.answers !== 'object') {
      forgetIntakeMemory(s);
      return null;
    }
    const saved = Date.parse(o.savedAt);
    if (!Number.isFinite(saved) || saved > now + 60_000 || now - saved > MAX_AGE_MS) {
      forgetIntakeMemory(s);
      return null;
    }
    return { v: 1, savedAt: o.savedAt, answers: o.answers };
  } catch {
    forgetIntakeMemory(s);
    return null;
  }
}

export function readIntakeMemory(s?: Store | null, now = Date.now()): IntakeBlob | null {
  const store = s === undefined ? localStore() : s;
  if (!store) return null;
  try { return parse(store.getItem(INTAKE_MEMORY_KEY), now, store); } catch { return null; }
}

/** Write the blob, or refuse and delete, when the band or the account may not keep it. */
export function writeIntakeMemory(
  answers: IntakeMemoryAnswers, band: AgeBand | null, verified: boolean, s?: Store | null, now = new Date(),
): boolean {
  const store = s === undefined ? localStore() : s;
  if (!mayKeepIntake(band, verified)) {
    forgetIntakeMemory(store);
    return false;
  }
  if (!store) return false;
  const blob: IntakeBlob = { v: 1, savedAt: now.toISOString(), answers };
  try { store.setItem(INTAKE_MEMORY_KEY, JSON.stringify(blob)); return true; } catch { return false; }
}

const SHORT: Record<string, string> = {
  [INTAKE_IDS.currentPain]: 'Pain',
  [INTAKE_IDS.recentInjuryOrSurgery]: 'Recent injury or surgery',
  [INTAKE_IDS.dizzinessFaintingChestPain]: 'Effort symptoms',
  [INTAKE_IDS.heartOrBpCondition]: 'Heart or blood pressure',
  [INTAKE_IDS.pregnancyOrPostpartum]: 'Pregnancy',
  [INTAKE_IDS.heartRateOrBalanceMedicine]: 'Heart-rate medicine',
  [INTAKE_IDS.clinicianToldToAvoid]: 'Told to avoid a movement',
  [INTAKE_IDS.birthYear]: 'Birth year',
};

/** One short line per question, in the intake's order. */
export function intakeShortLines(answers: IntakeMemoryAnswers): string[] {
  return PUBLIC_INTAKE_QUESTIONS.map((q) => {
    const v = answers[q.id];
    const name = SHORT[q.id] ?? q.id;
    if (q.type === 'birth_year') return `${name}: ${typeof v === 'number' ? v : 'skipped'}`;
    return `${name}: ${v === true ? 'yes' : v === false ? 'no' : 'skipped'}`;
  });
}
