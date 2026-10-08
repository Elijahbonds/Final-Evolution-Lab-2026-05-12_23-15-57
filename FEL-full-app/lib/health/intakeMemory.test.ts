// SCREEN-JUMP-ONLY: saved intake answers stay on this device, for a verified adult, for 30 days.
import { describe, expect, it } from 'vitest';
import { INTAKE_IDS, RED_FLAG_QUESTION_IDS } from '@/lib/health/intake';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import {
  INTAKE_MEMORY_KEY, forgetIntakeMemory, intakeShortLines, mayKeepIntake, mayKeepIntakeForYear, painBlocksOneTap,
  readIntakeMemory, recallPlan, redFlagBlocksOneTap, writeIntakeMemory, type IntakeMemoryAnswers,
} from './intakeMemory';

class Mem {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const NOW = new Date('2026-10-04T12:00:00Z');
const ADULT_YEAR = 1990;
const answers: IntakeMemoryAnswers = {
  [INTAKE_IDS.currentPain]: false,
  [INTAKE_IDS.recentInjuryOrSurgery]: false,
  [INTAKE_IDS.dizzinessFaintingChestPain]: false,
  [INTAKE_IDS.heartOrBpCondition]: false,
  [INTAKE_IDS.pregnancyOrPostpartum]: false,
  [INTAKE_IDS.heartRateOrBalanceMedicine]: false,
  [INTAKE_IDS.clinicianToldToAvoid]: false,
  [INTAKE_IDS.birthYear]: 1990,
};

describe('who may keep fel.intake.v1', () => {
  it('uses verifiedAdult: a year gap over 18 may keep when the screen band is adult or not answered yet', () => {
    expect(verifiedAdult(ADULT_YEAR, NOW)).toBe(true);
    expect(mayKeepIntakeForYear('18+', ADULT_YEAR, NOW)).toBe(true);
    expect(mayKeepIntakeForYear(null, ADULT_YEAR, NOW)).toBe(true);
    expect(mayKeepIntake('18+', true)).toBe(true);
  });

  it('a kid, teen, unknown, or unverified account never writes the key', () => {
    for (const band of ['under-13', '13-17', 'unknown'] as const) {
      const s = new Mem();
      expect(mayKeepIntakeForYear(band, ADULT_YEAR, NOW), band).toBe(false);
      expect(writeIntakeMemory(answers, band, true, s, NOW), band).toBe(false);
      expect(s.getItem(INTAKE_MEMORY_KEY), band).toBeNull();
    }
    const s = new Mem();
    expect(verifiedAdult(2010, NOW)).toBe(false);
    expect(writeIntakeMemory(answers, '18+', false, s, NOW)).toBe(false);
    expect(writeIntakeMemory(answers, null, false, s, NOW)).toBe(false);
    expect(s.getItem(INTAKE_MEMORY_KEY)).toBeNull();
  });

  it('a verified adult with no pain flag gets one tap; pain or a red flag does not', () => {
    const s = new Mem();
    expect(writeIntakeMemory(answers, '18+', true, s, NOW)).toBe(true);
    const blob = readIntakeMemory(s, NOW.getTime());
    expect(blob?.answers).toEqual(answers);
    expect(recallPlan('18+', true, blob, NOW.getTime())).toBe('one-tap');
    expect(intakeShortLines(answers).some((l) => l.startsWith('Pain: no'))).toBe(true);
    expect(painBlocksOneTap({ ...answers, [INTAKE_IDS.currentPain]: true })).toBe(true);
    expect(painBlocksOneTap({})).toBe(true);
    const painful = { ...answers, [INTAKE_IDS.currentPain]: true };
    expect(recallPlan('18+', true, { v: 1, savedAt: NOW.toISOString(), answers: painful })).toBe('pain');
    const flagged = { ...answers, [RED_FLAG_QUESTION_IDS[0]]: true };
    expect(redFlagBlocksOneTap(flagged)).toBe(true);
    expect(recallPlan('18+', true, { v: 1, savedAt: NOW.toISOString(), answers: flagged })).toBe('full');
  });

  it('answers older than 30 days are gone', () => {
    const s = new Mem();
    const old = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000);
    writeIntakeMemory(answers, '18+', true, s, old);
    expect(readIntakeMemory(s, NOW.getTime())).toBeNull();
    expect(s.getItem(INTAKE_MEMORY_KEY)).toBeNull();
    writeIntakeMemory(answers, '18+', true, s, new Date(NOW.getTime() - 29 * 24 * 60 * 60 * 1000));
    expect(readIntakeMemory(s, NOW.getTime())?.answers[INTAKE_IDS.birthYear]).toBe(1990);
  });

  it('Forget my answers clears the key, and a kid band clears one that was already there', () => {
    const s = new Mem();
    writeIntakeMemory(answers, null, true, s, NOW);
    forgetIntakeMemory(s);
    expect(s.getItem(INTAKE_MEMORY_KEY)).toBeNull();
    writeIntakeMemory(answers, '18+', true, s, NOW);
    writeIntakeMemory(answers, 'under-13', true, s, NOW);
    expect(s.getItem(INTAKE_MEMORY_KEY)).toBeNull();
  });
});
