// COACH-PARITY (2026-10-26): coach habits — presets, custom habits checked, who they reach, done, streak, compliance.
import { describe, expect, it } from 'vitest';
import { cleanHabit, compliance, frequencyLine, habitReaches, habitStreak, HABIT_PRESETS, isBodyOrDiet, targetLine, tickDone, tickValue, weekProgress, type HabitDef, type Tick } from './rules';

const ON = { healthEnabled: true };
const OFF = { healthEnabled: false };
const NOW = new Date('2026-10-28T18:00:00Z');   // Wed; PT day 2026-10-28; PT week 2026-10-26
const day = (n: number) => new Date(Date.parse('2026-10-28T12:00:00Z') - n * 86_400_000).toISOString().slice(0, 10);
const daily: HabitDef = { kind: 'count', target: 10_000, frequency: 'daily', perWeek: null, createdAt: '2026-09-01T00:00:00Z' };
const ticks = (days: number[], value = 12_000): Tick[] => days.map((n) => ({ day: day(n), value }));

describe('presets and cleanHabit', () => {
  it('the presets: steps, water, mobility and practice are training; sleep, protein and weigh-in are health', () => {
    expect(HABIT_PRESETS.map((p) => [p.key, p.topic])).toEqual([['steps', 'training'], ['water', 'training'], ['mobility', 'training'], ['practice', 'training'], ['sleep', 'health'], ['protein', 'health'], ['weigh_in', 'health']]);
  });
  it('a preset as is, and edited', () => {
    expect(cleanHabit({ preset: 'steps' }, OFF)).toEqual({ ok: true, habit: { preset: 'steps', label: '10,000 steps', kind: 'count', target: 10000, unit: 'steps', frequency: 'daily', perWeek: null, topic: 'training', bodyOrDiet: false } });
    expect(cleanHabit({ preset: 'steps', label: '8,000 steps', target: 8000, frequency: 'weekly', perWeek: 5 }, OFF)).toMatchObject({ ok: true, habit: { label: '8,000 steps', target: 8000, frequency: 'weekly', perWeek: 5 } });
  });
  it('health presets need the switch; body weight and diet are marked', () => {
    expect(cleanHabit({ preset: 'sleep' }, OFF)).toEqual({ ok: false, error: 'health_off' });
    expect(cleanHabit({ preset: 'sleep' }, ON)).toMatchObject({ ok: true, habit: { topic: 'health', bodyOrDiet: false } });
    expect(cleanHabit({ preset: 'weigh_in' }, ON)).toMatchObject({ ok: true, habit: { topic: 'health', bodyOrDiet: true, target: null, unit: 'kg' } });
  });
  it('a custom habit is settled by its words: pain refused, diet raised to health', () => {
    expect(cleanHabit({ preset: 'custom', label: 'Ice the sore knee pain', kind: 'check' }, ON)).toEqual({ ok: false, error: 'habit_is_pain' });
    expect(cleanHabit({ preset: 'custom', label: 'No sugar after 8pm', kind: 'check', topic: 'training' }, OFF)).toEqual({ ok: false, error: 'health_off' });
    expect(cleanHabit({ preset: 'custom', label: 'Shoot 100 free throws', kind: 'count', target: 100, unit: 'shots' }, OFF)).toMatchObject({ ok: true, habit: { topic: 'training', preset: 'custom' } });
  });
  it.each([
    [{ preset: 'yoga' }, 'preset'], [{ preset: 'custom' }, 'label_required'], [{ preset: 'custom', label: 'Read', kind: 'scale' }, 'kind'],
    [{ preset: 'steps', target: -5 }, 'target'], [{ preset: 'steps', target: 'lots' }, 'target'], [{ preset: 'steps', unit: '<script>' }, 'unit'],
    [{ preset: 'steps', frequency: 'monthly' }, 'frequency'], [{ preset: 'steps', frequency: 'weekly', perWeek: 7 }, 'frequency'], [{ preset: 'steps', frequency: 'weekly' }, 'frequency'],
  ])('refuses %j', (b, error) => expect(cleanHabit(b, ON)).toEqual({ ok: false, error }));
});

describe('who a habit reaches', () => {
  const adult = { adult: true, healthShown: true }, teen = { adult: false, healthShown: false };
  it('training habits reach anyone the teen gate lets train', () => {
    expect(habitReaches({ topic: 'training', preset: 'steps', label: '10,000 steps' }, teen)).toBe(true);
    expect(habitReaches({ topic: 'training', preset: 'water', label: 'Drink 2 litres of water' }, teen)).toBe(true);
  });
  it('health habits reach adults only, with the switch on', () => {
    expect(habitReaches({ topic: 'health', preset: 'sleep', label: '8 hours of sleep' }, teen)).toBe(false);
    expect(habitReaches({ topic: 'health', preset: 'sleep', label: '8 hours of sleep' }, { adult: true, healthShown: false })).toBe(false);
    expect(habitReaches({ topic: 'health', preset: 'sleep', label: '8 hours of sleep' }, adult)).toBe(true);
  });
  it('body weight and diet never reach a minor, even stored as training', () => {
    expect(isBodyOrDiet({ preset: 'custom', label: 'Log your meals' })).toBe(true);
    expect(habitReaches({ topic: 'training', preset: 'custom', label: 'Log your meals' }, teen)).toBe(false);
  });
});

describe('done, streak, week and compliance', () => {
  it('tickDone and tickValue', () => {
    expect(tickDone({ kind: 'check', target: null }, { day: 'x', value: null })).toBe(true);
    expect(tickDone(daily, { day: 'x', value: 9_999 })).toBe(false);
    expect(tickDone(daily, { day: 'x', value: 10_000 })).toBe(true);
    expect(tickDone({ kind: 'count', target: null }, { day: 'x', value: 81.2 })).toBe(true);
    expect(tickDone(daily, null)).toBe(false);
    expect(tickValue({ kind: 'check' }, 5)).toBeNull();
    expect(tickValue({ kind: 'count' }, 1.234)).toBe(1.23);
    expect(tickValue({ kind: 'count' }, -1)).toBeUndefined();
    expect(tickValue({ kind: 'count' }, '5')).toBeUndefined();
  });
  it('a daily streak ends today when today is done, else yesterday; a short day breaks it', () => {
    expect(habitStreak(daily, ticks([0, 1, 2, 3]), NOW)).toEqual({ n: 4, unit: 'day', todayDone: true });
    expect(habitStreak(daily, ticks([1, 2, 3]), NOW)).toEqual({ n: 3, unit: 'day', todayDone: false });
    expect(habitStreak(daily, [...ticks([0, 1]), { day: day(2), value: 4_000 }, ...ticks([3, 4])], NOW).n).toBe(2);
    expect(habitStreak(daily, ticks([2, 3]), NOW).n).toBe(0);
  });
  it('an N-a-week streak counts weeks that met N', () => {
    const three: HabitDef = { kind: 'check', target: null, frequency: 'weekly', perWeek: 3, createdAt: '2026-09-01T00:00:00Z' };
    // this week (Mon 26–Wed 28): 2 so far; last week: 3; the week before: 3; before that: 1
    const t = [0, 1, 3, 4, 5, 10, 11, 12, 15].map((n) => ({ day: day(n), value: null }));
    expect(habitStreak(three, t, NOW)).toEqual({ n: 2, unit: 'week', todayDone: true });
    expect(weekProgress(three, t, NOW)).toEqual({ done: 2, need: 3 });
  });
  it('compliance: the last 7 days, prorated for a new habit', () => {
    expect(compliance(daily, ticks([0, 1, 2, 4, 6]), NOW)).toEqual({ done: 5, expected: 7, pct: 71 });
    expect(compliance({ ...daily, createdAt: '2026-10-26T20:00:00Z' }, ticks([0, 1]), NOW)).toEqual({ done: 2, expected: 3, pct: 67 });
    expect(compliance({ ...daily, frequency: 'weekly', perWeek: 3 }, ticks([0, 1, 2, 3, 4]), NOW)).toEqual({ done: 3, expected: 3, pct: 100 });
  });
  it('lines', () => {
    expect(frequencyLine(daily)).toBe('Daily');
    expect(frequencyLine({ frequency: 'weekly', perWeek: 1 })).toBe('1 day a week');
    expect(targetLine({ kind: 'count', target: 10_000, unit: 'steps' })).toBe('10,000 steps');
    expect(targetLine({ kind: 'check', target: null, unit: null })).toBeNull();
  });
});
