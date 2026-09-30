// MIRROR-COACH P6 (2026-09-29): the readiness card and the Prep section must agree about today's warm-up.
//
// MIRROR-COACH P6 FIX (2026-09-29, code review). This file used to pin one thing: the card's "Warm-up today: about N
// minutes" equals the Prep section's suggested length (10 / 14). The review found the promise false on the sessions this
// file never looked at: Today mounts the card on EVERY session, but the generated warm-up runs only when the coach wrote
// no Prep (every Mirror one-tap prescription lands in Prep — lib/coach/mirrorToProgram.ts) and never on an off day. There
// the card said "Running low today, so your warm-up runs 4 minutes longer" while the coach's Prep ran as written. And the
// number itself was wrong for youth and pain-day plans. So the card names no minutes now, picks its line by what today's
// warm-up really is (lib/coach/cooldown.ts todayWarmupKind → lib/health/readiness.ts readinessSuggestion), and this file
// holds the card's words to what the Prep section does on each kind of session.
import { describe, expect, it } from 'vitest';
import { readReadiness, readinessSuggestion, warmupReadinessOf } from './readiness';
import { DEFAULT_WARMUP_MINUTES, WARMUP_MINUTES, generateWarmup, suggestedMinutes } from '../coach/warmup';
import { todayWarmupKind } from '../coach/cooldown';
import { OFF_DAY_ITEMS } from '../coach/offDay';

const days = {
  skip: readReadiness(null),
  ok: readReadiness({ sleep: 4, soreness: 2, energy: 4, mood: 4 }),
  low: readReadiness({ sleep: 1, soreness: 5, energy: 2, mood: 2 }),
};
const item = (section: string, order: number) => ({ section, order });
const TRAINING = [item('key', 1), item('assist', 2)];
const WITH_COACH_PREP = [item('prep', 0), ...TRAINING];                     // e.g. a Mirror one-tap prescription
const OFF_DAY = OFF_DAY_ITEMS.map((i, k) => item(i.prescription.section, k + 1));

describe('what today\'s warm-up is, per session', () => {
  it('generated only when the coach wrote no Prep on a training day; coach Prep runs as written; an off day adds none', () => {
    expect(todayWarmupKind(TRAINING, 'training')).toBe('generated');
    expect(todayWarmupKind(WITH_COACH_PREP, 'training')).toBe('coach');
    expect(todayWarmupKind(OFF_DAY, 'recovery')).toBe('none');
    expect(todayWarmupKind([], 'training')).toBe('none');
  });
});

describe('the card\'s words match what the Prep section does', () => {
  for (const [name, read] of Object.entries(days)) {
    it(`${name}: the Prep section's suggested length is a real chip, and a skip is "not asked", never ok`, () => {
      expect(WARMUP_MINUTES as readonly number[]).toContain(suggestedMinutes(read.level));
      expect(suggestedMinutes(warmupReadinessOf(read))).toBe(suggestedMinutes(read.level));
    });
  }

  it('a generated warm-up on a low day: the card says "set longer and gentler", and the plan is (adult and youth)', () => {
    expect(readinessSuggestion('low', 'generated')).toMatch(/set longer and gentler/);
    for (const isYouth of [false, true]) {
      const usual = generateWarmup({ pattern: 'squat', weakestZone: null, minutes: suggestedMinutes('ok'), isYouth, painDecision: null, readiness: 'ok' });
      const low = generateWarmup({ pattern: 'squat', weakestZone: null, minutes: suggestedMinutes('low'), isYouth, painDecision: null, readiness: 'low' });
      expect(low.totalSec, `youth=${isYouth}`).toBeGreaterThan(usual.totalSec);
      expect(low.notes.map((n) => n.id)).toContain('low_day');
    }
    expect(suggestedMinutes('ok')).toBe(DEFAULT_WARMUP_MINUTES);
  });

  it('a COACH-PREP session on a low day: the card promises nothing about a longer warm-up — none is generated', () => {
    const line = readinessSuggestion(days.low.level, todayWarmupKind(WITH_COACH_PREP, 'training'));
    expect(line).not.toMatch(/longer|minutes|warm-up below/i);
    expect(line).toMatch(/easier version/);
  });

  it('an OFF DAY on a low day: no warm-up, and the card says nothing about one', () => {
    const line = readinessSuggestion(days.low.level, todayWarmupKind(OFF_DAY, 'recovery'));
    expect(line).not.toMatch(/warm-up|longer|minutes/i);
    for (const level of ['ok', 'skip'] as const) expect(readinessSuggestion(level, 'none')).not.toMatch(/warm-up/i);
  });

  it('a skip reaches the Prep section as "not asked" (null), never as ok', () => {
    expect(warmupReadinessOf(days.skip)).toBeNull();
    expect(warmupReadinessOf(null)).toBeNull();
    expect(warmupReadinessOf(days.ok)).toBe('ok');
    expect(warmupReadinessOf(days.low)).toBe('low');
  });
});
