// lib/coach/habits/server.ts — COACH-PARITY (2026-10-26): coach-assigned habits, the coach's and the athlete's halves.
//
//   coachHabitBoard  GET   /api/coach/habits      the coach's habits, who each reaches, and each athlete's last-7-days
//                                                 compliance and streak (a health habit's ticks only per coachMaySee)
//   coachHabitAct    POST  /api/coach/habits      { action: 'create', preset|custom…, scope, scopeId } | { action: 'archive', id }
//   myHabits         GET   /api/coach/me/habits   today's habits for the athlete, ticked or not, with the streak
//   tickHabit        POST  /api/coach/me/habits   { habitId, done, value? } — today only (the PT day)
// Before the pending SQL: GET { available: false }, writes 503 parity_not_ready.
import 'server-only';
import { addDays, dayOf } from '@/lib/groups/week';
import { STREAK_LOOKBACK_DAYS } from '@/lib/groups/activity';
import { parityHealthEnabled, parityReady } from '../parity/probe';
import { coachPeople, healthViewers, liveCoaches, mayAssign, teamIdsOf, whoIs, type PeopleDb } from '../parity/people';
import { cleanHabit, compliance, frequencyLine, habitReaches, habitStreak, HABIT_PRESETS, LIMITS, targetLine, tickDone, tickValue, weekProgress } from './rules';
import { archiveHabit, clearTick, habitsFor, habitsForCoach, insertHabit, setTick, ticksForAthlete, ticksForHabits, type HabitRow } from './store';
import { HEALTH_CONSENT_NEEDED_DRAFT, HEALTH_HABIT_LINE_DRAFT, HEALTH_OFF_LINE, SEEN_LINE, TEAM_HEALTH_NOTE_DRAFT } from './copy';

export type HabitDb = PeopleDb;
export interface Res { status: number; body: Record<string, unknown> }
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const NOT_READY = res(503, { error: 'parity_not_ready' });
type Env = Readonly<Record<string, string | undefined>>;

const view = (h: HabitRow) => ({
  id: h.id, preset: h.preset, label: h.label, kind: h.kind, target: h.target, unit: h.unit, frequency: h.frequency, perWeek: h.perWeek, topic: h.topic,
  line: [frequencyLine(h), targetLine(h)].filter(Boolean).join(' · '),
});

// ── the coach ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function coachHabitBoard(db: HabitDb, coachId: string, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await parityReady(db, nowMs))) return res(200, { available: false });
  const [habits, people] = await Promise.all([habitsForCoach(db, coachId, nowMs), coachPeople(db, coachId, now)]);
  if (!habits) return res(200, { available: false });
  const since = addDays(dayOf(now), -STREAK_LOOKBACK_DAYS);
  const ticks = (await ticksForHabits(db, habits.map((h) => h.id), since, nowMs)) ?? [];
  const viewers = await healthViewers(db, coachId, people.roster);
  const healthEnabled = parityHealthEnabled(env);
  const list = habits.map((h) => {
    const reach = h.scope === 'athlete' ? [h.scopeId].filter((id) => people.roster.some((r) => r.id === id)) : people.teams.find((t) => t.id === h.scopeId)?.memberIds ?? [];
    const athletes = reach
      .map((id) => people.roster.find((r) => r.id === id)!)
      .filter((a) => a && habitReaches(h, { adult: a.adult, healthShown: healthEnabled }))
      .map((a) => {
        // a health habit's ticks are the athlete's health data: the coach sees them only with a live coach_view grant
        if (h.topic === 'health' && !viewers.has(a.id)) return { id: a.id, name: a.name, shared: false };
        const mine = ticks.filter((t) => t.habitId === h.id && t.athleteId === a.id);
        const s = habitStreak(h, mine, now);
        return { id: a.id, name: a.name, shared: true, compliance: compliance(h, mine, now), streak: s.n, streakUnit: s.unit, today: s.todayDone };
      }).sort((x, y) => x.name.localeCompare(y.name));
    const assignedTo = h.scope === 'team' ? people.teams.find((t) => t.id === h.scopeId)?.name : people.roster.find((r) => r.id === h.scopeId)?.name;
    return { ...view(h), scope: h.scope, scopeId: h.scopeId, assignedTo: assignedTo ?? 'No longer on your roster', athletes };
  });
  return res(200, {
    available: true, habits: list, roster: people.roster, teams: people.teams.map((t) => ({ id: t.id, name: t.name, members: t.memberIds.length })),
    presets: HABIT_PRESETS.filter((p) => p.topic === 'training' || healthEnabled), healthEnabled,
    lines: { health: healthEnabled ? TEAM_HEALTH_NOTE_DRAFT : HEALTH_OFF_LINE },
  });
}

export async function coachHabitAct(db: HabitDb, coachId: string, body: unknown, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!(await parityReady(db, nowMs))) return NOT_READY;
  if (b.action === 'archive') {
    if (typeof b.id !== 'string' || !b.id) return res(400, { error: 'bad_id' });
    return (await archiveHabit(db, b.id, coachId, nowMs)) ? res(200, { ok: true }) : res(404, { error: 'not_found' });
  }
  if (b.action !== 'create') return res(400, { error: 'unknown_action' });
  const c = cleanHabit(b, { healthEnabled: parityHealthEnabled(env) });
  if (!c.ok) return res(400, { error: c.error });
  const people = await coachPeople(db, coachId, now);
  if (!mayAssign(people, b.scope, b.scopeId)) return res(403, { error: b.scope === 'team' ? 'not_your_team' : 'not_your_athlete' });
  // a health habit, or body weight / diet, is never assigned to a minor (blank birth year included)
  if (b.scope === 'athlete' && (c.habit.topic === 'health' || c.habit.bodyOrDiet)) {
    const a = people.roster.find((r) => r.id === b.scopeId);
    if (!a?.adult) return res(400, { error: 'habit_adults_only' });
  }
  const mine = await habitsForCoach(db, coachId, nowMs);
  if (mine && mine.length >= LIMITS.habitsPerCoach) return res(409, { error: 'too_many_habits' });
  const { bodyOrDiet: _b, ...row } = c.habit;
  void _b;
  const id = await insertHabit(db, { coachId, scope: b.scope as 'athlete' | 'team', scopeId: String(b.scopeId), ...row }, nowMs);
  return id ? res(201, { ok: true, id }) : res(500, { error: 'not_saved' });
}

// ── the athlete ───────────────────────────────────────────────────────────────────────────────────────────────────────

async function reachable(db: HabitDb, athleteId: string, nowMs: number) {
  const coaches = await liveCoaches(db, athleteId);
  if (!coaches.length) return { coaches, habits: [] as HabitRow[] };
  const teamIds = await teamIdsOf(db, athleteId, nowMs);
  return { coaches, habits: (await habitsFor(db, athleteId, teamIds, coaches.map((c) => c.coachId), nowMs)) ?? [] };
}

export async function myHabits(db: HabitDb, athleteId: string, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await parityReady(db, nowMs))) return res(200, { available: false });
  const { coaches, habits } = await reachable(db, athleteId, nowMs);
  if (!habits.length) return res(200, { available: true, habits: [] });
  const who = await whoIs(db, athleteId, parityHealthEnabled(env), now);
  if (!who.ok) return res(200, { available: true, habits: [], blocked: who.body });
  const shown = habits.filter((h) => habitReaches(h, who));
  const ticks = (await ticksForAthlete(db, athleteId, shown.map((h) => h.id), addDays(dayOf(now), -STREAK_LOOKBACK_DAYS), nowMs)) ?? [];
  const today = dayOf(now);
  return res(200, {
    available: true, day: today, seenLine: SEEN_LINE,
    habits: shown.map((h) => {
      const mine = ticks.filter((t) => t.habitId === h.id);
      const t = mine.find((x) => x.day === today) ?? null;
      const s = habitStreak(h, mine, now);
      return {
        ...view(h), coachName: coaches.find((c) => c.coachId === h.coachId)?.name ?? 'Your coach',
        today: { ticked: !!t, value: t?.value ?? null, done: tickDone(h, t) }, streak: s.n, streakUnit: s.unit, week: weekProgress(h, mine, now),
        healthLine: h.topic === 'health' ? HEALTH_HABIT_LINE_DRAFT : null,
        locked: h.topic === 'health' && !who.healthConsent ? HEALTH_CONSENT_NEEDED_DRAFT : null,
      };
    }),
  });
}

export async function tickHabit(db: HabitDb, athleteId: string, body: unknown, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!(await parityReady(db, nowMs))) return NOT_READY;
  if (typeof b.habitId !== 'string' || !b.habitId) return res(400, { error: 'bad_id' });
  const { habits } = await reachable(db, athleteId, nowMs);
  const h = habits.find((x) => x.id === b.habitId);
  if (!h) return res(404, { error: 'not_found' });
  // the teen gate first (training data), then the health rules for a health habit — the same order as a check-in
  const who = await whoIs(db, athleteId, parityHealthEnabled(env), now);
  if (!who.ok) return res(403, who.body);
  if (!habitReaches(h, who)) return who.adult ? res(400, { error: 'health_off' }) : res(403, { error: 'health_data_adults_only', saved: false });
  if (h.topic === 'health' && !who.healthConsent) return res(412, { error: 'health_data_consent_required', saved: false });
  const day = dayOf(now);
  if (b.done === false) {
    const ok = await clearTick(db, h.id, athleteId, day, nowMs);
    return ok === null ? NOT_READY : res(200, { ok: true, day, done: false });
  }
  const value = tickValue(h, b.value);
  if (value === undefined) return res(400, { error: 'bad_value' });
  const ok = await setTick(db, h.id, athleteId, day, value, nowMs);
  return ok ? res(200, { ok: true, day, done: tickDone(h, { day, value }) }) : res(500, { error: 'not_saved' });
}

