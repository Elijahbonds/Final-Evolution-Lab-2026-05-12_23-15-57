// lib/coach/habits/rules.ts — COACH-PARITY (2026-10-26): a coach-assigned habit — the presets, a custom one checked, who it
// may go to, when a tick counts as done, the streak and the coach's compliance line. Pure.
//
// THE STREAK is the friend streak's rule (lib/groups/activity.ts friendStreak) for one person: consecutive PT days (the
// wallet's day, lib/groups/week.ts — the same clock as the daily drill) ending today when today is done, else yesterday,
// looked back at most STREAK_LOOKBACK_DAYS. A habit that is N days a week counts consecutive WEEKS that met N, ending this
// week when it is met, else last week. Computed on read from the ticks; never stored, never paid: a habit pays no Lab
// Credits and does not touch the play streak (PlayerProfile.streakDays), so ticking cannot be farmed.
//
// TEEN-SAFE. A habit's topic is settled by lib/coach/parity/topic.ts from its preset or its words. Health habits (sleep,
// body weight, food) are adults only, like every health write (lib/privacy/healthWriteGate.ts); body weight and diet are
// never for a minor whatever is decided later (the brief's rule). A coach cannot assign one to a minor; a team's health
// habit never reaches its teen members.
import { STREAK_LOOKBACK_DAYS } from '@/lib/groups/activity';
import { addDays, dayOf, weekKeyOf } from '@/lib/groups/week';
import { readTopic, settleTopic, type Topic } from '../parity/topic';

export type HabitKind = 'check' | 'count';
export type Frequency = 'daily' | 'weekly';

export interface HabitPreset { key: string; label: string; kind: HabitKind; target: number | null; unit: string | null; topic: Topic; bodyOrDiet?: true }

/**
 * The presets (new content, owner review: docs/COACH-PARITY.md). Targets are the common coaching defaults the brief names
 * ("8 h sleep", "10k steps", "drink water"), each editable by the coach. None is a clinical target and none says why.
 */
export const HABIT_PRESETS: readonly HabitPreset[] = [
  { key: 'steps', label: '10,000 steps', kind: 'count', target: 10_000, unit: 'steps', topic: 'training' },
  { key: 'water', label: 'Drink 2 litres of water', kind: 'count', target: 2, unit: 'L', topic: 'training' },
  { key: 'mobility', label: '10 minutes of mobility', kind: 'count', target: 10, unit: 'min', topic: 'training' },
  { key: 'practice', label: 'Skill practice', kind: 'count', target: 20, unit: 'min', topic: 'training' },
  { key: 'sleep', label: '8 hours of sleep', kind: 'count', target: 8, unit: 'h', topic: 'health' },
  { key: 'protein', label: 'Protein with every meal', kind: 'check', target: null, unit: null, topic: 'health', bodyOrDiet: true },
  { key: 'weigh_in', label: 'Morning weigh-in', kind: 'count', target: null, unit: 'kg', topic: 'health', bodyOrDiet: true },
];

export const LIMITS = { label: 60, unit: 12, target: 1_000_000, habitsPerCoach: 60 } as const;
export const PER_WEEK = { min: 1, max: 6 } as const;

export interface CleanHabit { preset: string; label: string; kind: HabitKind; target: number | null; unit: string | null; frequency: Frequency; perWeek: number | null; topic: Topic; bodyOrDiet: boolean }
export type HabitError = 'preset' | 'label_required' | 'habit_is_pain' | 'health_off' | 'kind' | 'target' | 'unit' | 'frequency';

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** A habit from a request: a preset (its fields may be edited) or 'custom'. */
export function cleanHabit(body: unknown, o: { healthEnabled: boolean }): { ok: true; habit: CleanHabit } | { ok: false; error: HabitError } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const preset = HABIT_PRESETS.find((p) => p.key === b.preset) ?? null;
  if (!preset && b.preset !== 'custom') return { ok: false, error: 'preset' };
  const label = text(b.label, LIMITS.label) || preset?.label || '';
  if (!label) return { ok: false, error: 'label_required' };
  const settled = settleTopic(label, preset?.topic === 'health' ? 'health' : b.topic);
  if (!settled) return { ok: false, error: 'habit_is_pain' };
  const bodyOrDiet = settled.bodyOrDiet || !!preset?.bodyOrDiet;
  const topic: Topic = settled.topic === 'health' || preset?.topic === 'health' ? 'health' : 'training';
  if (topic === 'health' && !o.healthEnabled) return { ok: false, error: 'health_off' };
  const kind = (b.kind ?? preset?.kind) as HabitKind;
  if (kind !== 'check' && kind !== 'count') return { ok: false, error: 'kind' };
  let target: number | null = null;
  let unit: string | null = null;
  if (kind === 'count') {
    const t = b.target === undefined ? preset?.target ?? null : b.target;
    if (t !== null && t !== '' && !(typeof t === 'number' && Number.isFinite(t) && t > 0 && t <= LIMITS.target)) return { ok: false, error: 'target' };
    target = typeof t === 'number' ? Math.round(t * 100) / 100 : null;
    unit = (b.unit === undefined ? preset?.unit ?? '' : text(b.unit, LIMITS.unit)) || null;
    if (unit && !/^[\p{L}%°/.,\s-]+$/u.test(unit)) return { ok: false, error: 'unit' };
  }
  const frequency = b.frequency ?? 'daily';
  if (frequency !== 'daily' && frequency !== 'weekly') return { ok: false, error: 'frequency' };
  let perWeek: number | null = null;
  if (frequency === 'weekly') {
    if (!(typeof b.perWeek === 'number' && Number.isInteger(b.perWeek) && b.perWeek >= PER_WEEK.min && b.perWeek <= PER_WEEK.max)) return { ok: false, error: 'frequency' };
    perWeek = b.perWeek;
  }
  return { ok: true, habit: { preset: preset?.key ?? 'custom', label, kind, target, unit, frequency, perWeek, topic, bodyOrDiet } };
}

/** Body weight or diet, from the stored row (the preset, or the words). */
export const isBodyOrDiet = (h: { preset: string; label: string }): boolean =>
  !!HABIT_PRESETS.find((p) => p.key === h.preset)?.bodyOrDiet || readTopic(h.label).bodyOrDiet;

/** May this habit reach this athlete? Training: anyone the teen gate lets train. Health: an adult, with the switch on. */
export function habitReaches(h: { topic: Topic; preset: string; label: string }, who: { adult: boolean; healthShown: boolean }): boolean {
  if (h.topic === 'training') return !isBodyOrDiet(h) || who.adult;
  return who.adult && who.healthShown;
}

export interface HabitDef { kind: HabitKind; target: number | null; frequency: Frequency; perWeek: number | null; createdAt: string }
export interface Tick { day: string; value: number | null }

/** Does this tick count as done? A check: ticked. A count: at or over the target (or any number when there is none). */
export function tickDone(h: Pick<HabitDef, 'kind' | 'target'>, t: Tick | null | undefined): boolean {
  if (!t) return false;
  if (h.kind === 'check') return true;
  if (t.value == null) return false;
  return h.target == null ? true : t.value >= h.target;
}

/** A tick's value from a request: a check takes none; a count takes 0 … LIMITS.target. undefined = refused. */
export function tickValue(h: Pick<HabitDef, 'kind'>, v: unknown): number | null | undefined {
  if (h.kind === 'check') return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > LIMITS.target) return undefined;
  return Math.round(v * 100) / 100;
}

const doneDays = (h: HabitDef, ticks: readonly Tick[]) => new Set(ticks.filter((t) => tickDone(h, t)).map((t) => t.day));

/** The streak (see the header): days for a daily habit, weeks for an N-a-week one. */
export function habitStreak(h: HabitDef, ticks: readonly Tick[], now: Date | number): { n: number; unit: 'day' | 'week'; todayDone: boolean } {
  const done = doneDays(h, ticks);
  const today = dayOf(now);
  const todayDone = done.has(today);
  if (h.frequency === 'daily') {
    let day = todayDone ? today : addDays(today, -1);
    let n = 0;
    while (n < STREAK_LOOKBACK_DAYS && done.has(day)) { n += 1; day = addDays(day, -1); }
    return { n, unit: 'day', todayDone };
  }
  const need = h.perWeek ?? 1;
  const met = (wk: string) => Array.from({ length: 7 }, (_, i) => addDays(wk, i)).filter((d) => done.has(d)).length >= need;
  const thisWeek = weekKeyOf(now);
  let wk = met(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let n = 0;
  while (n < Math.ceil(STREAK_LOOKBACK_DAYS / 7) && met(wk)) { n += 1; wk = addDays(wk, -7); }
  return { n, unit: 'week', todayDone };
}

/** This week so far: done days and what the habit asks for (7 for a daily habit, N otherwise). */
export function weekProgress(h: HabitDef, ticks: readonly Tick[], now: Date | number): { done: number; need: number } {
  const done = doneDays(h, ticks);
  const wk = weekKeyOf(now);
  const n = Array.from({ length: 7 }, (_, i) => addDays(wk, i)).filter((d) => done.has(d)).length;
  return { done: n, need: h.frequency === 'daily' ? 7 : h.perWeek ?? 1 };
}

/**
 * The coach's compliance line for one athlete: the last 7 PT days (fewer when the habit is newer). A daily habit expects
 * every day; an N-a-week habit expects N per 7 days (prorated for a newer habit, at least 1).
 */
export function compliance(h: HabitDef, ticks: readonly Tick[], now: Date | number): { done: number; expected: number; pct: number } {
  const done = doneDays(h, ticks);
  const today = dayOf(now);
  const started = dayOf(Date.parse(h.createdAt));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((d) => d >= started);
  const n = days.filter((d) => done.has(d)).length;
  const expected = h.frequency === 'daily' ? days.length : Math.max(1, Math.round(((h.perWeek ?? 1) * days.length) / 7));
  const capped = Math.min(n, expected);
  return { done: capped, expected, pct: expected ? Math.round((capped / expected) * 100) : 0 };
}

/** "Daily", "3 days a week". */
export const frequencyLine = (h: Pick<HabitDef, 'frequency' | 'perWeek'>): string => (h.frequency === 'daily' ? 'Daily' : `${h.perWeek} day${h.perWeek === 1 ? '' : 's'} a week`);

/** "10,000 steps" / "8 h". */
export const targetLine = (h: { kind: HabitKind; target: number | null; unit: string | null }): string | null =>
  (h.kind === 'count' && h.target != null ? `${h.target.toLocaleString('en-US')}${h.unit ? ` ${h.unit}` : ''}` : null);
