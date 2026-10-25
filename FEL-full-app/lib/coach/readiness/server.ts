// lib/coach/readiness/server.ts — COACH-READINESS (2026-10-25): the check's reads and writes, under the gates in ./gate.ts.
//
//   checkContext   GET  /api/readiness/check        the athlete's own: may they check, is it kept, their history, the rule
//                                                   each coach has for them (the rule, never another athlete's data)
//   saveCheck      POST /api/readiness/check        a day's numbers (never frames): read against the saved history, kept
//                                                   once per day, and each coach whose rule reads Low and who has the
//                                                   athlete's coach_view grant is told — once per day (ReadinessAlert's key)
//   deleteHistory  DELETE /api/readiness/check      the athlete removes every check (and the alerts with them)
//   todayReadiness lib/coach/todayServer.ts        Today's session: this coach's CURRENT rule on today's saved check
//   coachBoard     GET  /api/coach/readiness        the coach's alerts and rules, roster athletes who share only
//   setCoachRule   PUT  /api/coach/readiness        a rule per athlete (live roster) or per team (one the coach runs)
//   draftFacts     lib/coach/weeklyDraft/server.ts the weekly draft's deload signal
//
// The route that writes checks gates with lib/privacy/scanSaveGate.ts canSaveScanNumbers BEFORE calling saveCheck (row 1l).

import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { isPlausibleToday } from '@/lib/health/readiness';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { profileGates } from '@/lib/profile-v2/gate';
import { myGroups } from '@/lib/groups/store';
import { coachMaySee } from './gate';
import { coachAlertLine, ruleLine } from './copy';
import { cleanRule, dayNumber, DEFAULT_RULE, ruleFor, applyRule } from './rules';
import {
  alertsForCoach, checksFor, checksForUsers, clearRule, deleteChecks, fireAlert, keepCheck, readinessReady, rulesForCoaches, seeAlert, setRule, toldFor,
  type RawDb, type StoredCheck,
} from './store';
import { ALERT_WINDOW_DAYS, BASELINE_WINDOW_DAYS, MIN_JUMPS, READINESS_TODAY_HOURS, TREND_CHECKS, TWICE_GAP_DAYS } from './thresholds';
import type { DayJumps, PriorCheck, ReadinessFacts, RuleScope, TodayReadiness } from './types';
import { readDay, viewOf, type CoachRuleCtx, type ReadinessView, type TrendPoint } from './view';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type ReadinessDb = RawDb & Pick<PrismaClient, 'coachClient' | 'user' | 'healthConsent' | 'scanSaveOptIn'>;

export interface Res { status: number; body: Record<string, unknown> }
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });

const nameOf = (u: { name: string | null; email: string | null } | null | undefined) => u?.name ?? u?.email?.split('@')[0] ?? 'coach';
const soft = <T,>(p: Promise<T>, empty: T, what: string): Promise<T> => p.catch((e: unknown) => {
  console.warn(`[coach/readiness] ${what} not read`, e instanceof Error ? e.name : typeof e);
  return empty;
});

// ── the request ──────────────────────────────────────────────────────────────────────────────────────────────────

const inRange = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

/** A day's numbers from a request, or why not. Plausible human jumps only (the T5 grader refuses over 130 cm). */
export function parseCheck(body: unknown, now: Date = new Date()): { ok: true; jumps: DayJumps; feel: number | null } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isPlausibleToday(b.day, now)) return { ok: false, error: 'not_today' };
  if (!inRange(b.bestCm, 3, 130) || !inRange(b.meanCm, 3, 130) || b.meanCm > b.bestCm) return { ok: false, error: 'bad_height' };
  if (!inRange(b.teCm, 0.1, 20)) return { ok: false, error: 'bad_te' };
  if (!inRange(b.jumps, MIN_JUMPS, 10) || !Number.isInteger(b.jumps)) return { ok: false, error: 'bad_jumps' };
  if (!inRange(b.poseHz, 10, 300)) return { ok: false, error: 'bad_pose_hz' };
  const feel = b.feel == null ? null : b.feel;
  if (feel !== null && (!inRange(feel, 1, 5) || !Number.isInteger(feel))) return { ok: false, error: 'bad_feel' };
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { ok: true, jumps: { day: b.day as string, bestCm: r1(b.bestCm), meanCm: r1(b.meanCm), teCm: r1(b.teCm), jumps: b.jumps, poseHz: r1(b.poseHz) }, feel };
}

// ── the athlete's coaches and their rules ─────────────────────────────────────────────────────────────────────────

/** Each live coach of this athlete, the rule they have for them (athlete > team > default), and whether they share. */
export async function coachRules(db: ReadinessDb, athleteId: string, now: number = Date.now()): Promise<CoachRuleCtx[]> {
  const links = await soft(db.coachClient.findMany({ where: { clientId: athleteId, endedAt: null }, select: { coachId: true, coach: { select: { name: true, email: true } } } }), [], 'coaches');
  if (!links.length) return [];
  const coachIds = [...new Set(links.map((l) => l.coachId))];
  const [rules, groups, grants] = await Promise.all([
    rulesForCoaches(db, coachIds, now),
    soft(myGroups(db, athleteId, now), null, 'teams'),
    soft(db.healthConsent.findMany({ where: { userId: athleteId, scope: 'coach_view', revokedAt: null, coachId: { in: coachIds } }, select: { coachId: true } }), [], 'coach_view'),
  ]);
  const teamIds = (groups ?? []).filter((g) => g.kind === 'team').map((g) => g.id);
  const shared = new Set(grants.map((g) => g.coachId));
  return coachIds.map((coachId) => ({
    coachId, coachName: nameOf(links.find((l) => l.coachId === coachId)?.coach),
    rule: ruleFor(rules.filter((r) => r.coachId === coachId), athleteId, teamIds), shared: shared.has(coachId),
  }));
}

const asPrior = (c: StoredCheck): PriorCheck => ({ day: c.day, bestCm: c.bestCm, meanCm: c.meanCm, teCm: c.teCm, jumps: c.jumps, poseHz: c.poseHz, belowReal: c.belowReal, band: c.band });
const trendOf = (cs: readonly StoredCheck[]): TrendPoint[] => [...cs].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-TREND_CHECKS).map((c) => ({ day: c.day, bestCm: c.bestCm, band: c.band }));

// ── GET: the athlete's context ─────────────────────────────────────────────────────────────────────────────────────

/**
 * What the check page needs before the camera starts. `canSave` comes from the route (canSaveScanNumbers). The coaches'
 * rules are sent so a phone-only check reads the same way; a coach's name is the only thing about anyone else in it.
 */
export async function checkContext(db: ReadinessDb, userId: string, canSave: boolean, day: string | null, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const coaches = (await coachRules(db, userId, nowMs)).map((c) => ({ ...c, ruleLine: ruleLine(c.rule) }));
  const ready = await readinessReady(db, nowMs);
  const history = canSave && ready ? await checksFor(db, userId, new Date(nowMs - 2 * BASELINE_WINDOW_DAYS * DAY_MS), TREND_CHECKS * 2, nowMs) : null;
  const todays = day && history ? history.find((c) => c.day === day) ?? null : null;
  return res(200, {
    ok: true, canSave, ready, kept: canSave && ready ? 'server' : 'device',
    coaches, history: history ? history.map(asPrior) : null, trend: history ? trendOf(history) : null,
    today: todays ? { day: todays.day, band: todays.band, reason: todays.reason, bestCm: todays.bestCm, dropPct: todays.dropPct } : null,
  });
}

// ── POST: a day's check ──────────────────────────────────────────────────────────────────────────────────────────

/** Read, keep (once per day), and tell each coach whose rule reads Low and who has the athlete's grant. Gated by the route. */
export async function saveCheck(db: ReadinessDb, userId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const p = parseCheck(body, now);
  if (!p.ok) return res(400, { error: p.error });
  const prior = await checksFor(db, userId, new Date(nowMs - (BASELINE_WINDOW_DAYS + 2) * DAY_MS), TREND_CHECKS * 2, nowMs);
  if (prior === null) return res(503, { error: 'readiness_not_ready', saved: false });
  const coaches = await coachRules(db, userId, nowMs);
  const already = prior.find((c) => c.day === p.jumps.day);
  if (already) {
    // the day's first check stands: answer with it, read again under today's rules
    const { facts, read } = readStored(already, prior.filter((c) => c.day !== already.day), coaches);
    const told = await toldFor(db, userId, already.day, nowMs);
    const view = viewOf({ today: asPrior(already), facts, read, priorChecks: prior.length - 1, coaches, told, saved: true });
    return res(200, { saved: true, first: false, view, trend: trendOf(prior) });
  }
  const { facts, read, perCoach } = readDay(p.jumps, prior.map(asPrior), p.feel, coaches);
  const kept = await keepCheck(db, {
    userId, day: p.jumps.day, bestCm: p.jumps.bestCm, meanCm: p.jumps.meanCm, teCm: p.jumps.teCm, jumps: p.jumps.jumps, poseHz: p.jumps.poseHz,
    feel: p.feel, band: read.band, reason: read.reason, belowReal: facts.belowReal,
    baselineCm: facts.baseline?.bestCm ?? null, baselineMeanCm: facts.baseline?.meanCm ?? null, baselineN: facts.baseline?.n ?? null, dropPct: facts.dropPct,
  }, nowMs);
  if (!kept) return res(503, { error: 'readiness_not_ready', saved: false });
  const told: string[] = [];
  if (kept.inserted) {
    for (const pc of perCoach) {
      const c = coaches.find((x) => x.coachId === pc.coachId)!;
      if (pc.read.band !== 'low' || !c.shared) continue;
      if (await fireAlert(db, { coachId: c.coachId, athleteId: userId, day: p.jumps.day, checkId: kept.check.id, action: c.rule.action, reason: pc.read.reason, dropPct: facts.dropPct }, nowMs)) told.push(c.coachId);
    }
  }
  const view = viewOf({ today: p.jumps, facts, read, priorChecks: prior.length, coaches, told, saved: true });
  return res(200, { saved: true, first: kept.inserted, view, trend: trendOf([kept.check, ...prior]) });
}

/** A stored check's facts again (for a re-read under the rules in force now). */
export function factsOf(c: StoredCheck): ReadinessFacts {
  return {
    baseline: c.baselineN && c.baselineCm != null ? { n: c.baselineN, bestCm: c.baselineCm, meanCm: c.baselineMeanCm ?? c.baselineCm, dayTeCm: 0, days: [] } : null,
    dropPct: c.dropPct, meanDropPct: null, realChangeCm: null, belowReal: c.belowReal, aboveReal: c.band === 'ready', feel: c.feel,
  };
}

function readStored(c: StoredCheck, prior: readonly StoredCheck[], coaches: readonly CoachRuleCtx[]) {
  const facts = factsOf(c);
  const prev = prior.filter((x) => x.day < c.day).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const reads = coaches.map((x) => applyRule(facts, x.rule, prev ? asPrior(prev) : null, c.day));
  const read = reads.find((r) => r.band === 'low' && r.ease) ?? reads.find((r) => r.band === 'low') ?? reads[0] ?? applyRule(facts, DEFAULT_RULE, prev ? asPrior(prev) : null, c.day);
  return { facts, read };
}

/** DELETE: every check of the athlete's own (and so every alert about them). */
export async function deleteHistory(db: ReadinessDb, userId: string, now: Date = new Date()): Promise<Res> {
  const ok = await deleteChecks(db, userId, now.getTime());
  return ok ? res(200, { deleted: true }) : res(503, { error: 'readiness_not_ready' });
}

// ── Today ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Today's saved check (one saved in the last READINESS_TODAY_HOURS, on a day that is plausibly today) under THIS coach's
 * rule as it stands now. null = no check today (Today is served as written), or the tables are not there.
 */
export async function todayReadiness(db: ReadinessDb, userId: string, coachId: string, now: Date = new Date()): Promise<TodayReadiness | null> {
  const nowMs = now.getTime();
  const recent = await checksFor(db, userId, new Date(nowMs - (TWICE_GAP_DAYS + 1) * DAY_MS), 8, nowMs);
  if (!recent?.length) return null;
  const today = recent.find((c) => Date.parse(c.createdAt) >= nowMs - READINESS_TODAY_HOURS * HOUR_MS && isPlausibleToday(c.day, now));
  if (!today) return null;
  const ctx = (await coachRules(db, userId, nowMs)).find((c) => c.coachId === coachId);
  if (!ctx) return null;
  const prev = recent.filter((c) => c.day < today.day).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const read = applyRule(factsOf(today), ctx.rule, prev ? asPrior(prev) : null, today.day);
  const told = await toldFor(db, userId, today.day, nowMs);
  return { band: read.band, reason: read.reason, ease: read.ease, dropPct: today.dropPct, feel: today.feel, baselineN: today.baselineN ?? 0, rule: ctx.rule, coachTold: told.includes(coachId), shared: ctx.shared, day: today.day };
}

// ── the coach ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The coach's readiness panel: today's alerts and the latest band of each athlete who shares, and every rule they set. */
export async function coachBoard(db: ReadinessDb, coachId: string, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await readinessReady(db, nowMs))) return res(200, { available: false });
  const links = await db.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true } });
  const ids = [...new Set(links.map((l) => l.clientId))];
  const [users, grants, optIns, rules, groups] = await Promise.all([
    ids.length ? db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, dobYear: true } }) : Promise.resolve([]),
    ids.length ? soft(db.healthConsent.findMany({ where: { coachId, scope: 'coach_view', userId: { in: ids }, revokedAt: null }, select: { userId: true } }), [], 'coach_view') : Promise.resolve([]),
    ids.length ? soft(db.scanSaveOptIn.findMany({ where: { userId: { in: ids } }, select: { userId: true, scope: true, granted: true, revokedAt: true } }), [], 'opt-in') : Promise.resolve([]),
    rulesForCoaches(db, [coachId], nowMs),
    soft(myGroups(db, coachId, nowMs), null, 'teams'),
  ]);
  const shared = new Set(grants.map((g) => g.userId));
  const visible = new Set(users.filter((u) => {
    const gates = profileGates(u.dobYear ?? null, optIns.find((o) => o.userId === u.id) ?? null, now);
    return coachMaySee({ onRoster: true, coachView: shared.has(u.id), adult: gates.adult }) && gates.canSaveScan;
  }).map((u) => u.id));
  const name = (id: string) => nameOf(users.find((u) => u.id === id));
  const alerts = ((await alertsForCoach(db, coachId, new Date(nowMs - ALERT_WINDOW_DAYS * DAY_MS), nowMs)) ?? [])
    .filter((a) => visible.has(a.athleteId))
    .map((a) => ({ ...a, name: name(a.athleteId), line: coachAlertLine({ name: name(a.athleteId), dropPct: a.dropPct, reason: a.reason, action: a.action }) }));
  const checks = await checksForUsers(db, [...visible], new Date(nowMs - 7 * DAY_MS), nowMs);
  const latest = [...visible].flatMap((id) => {
    const c = checks.filter((x) => x.userId === id).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
    return c ? [{ athleteId: id, name: name(id), day: c.day, band: c.band, dropPct: c.dropPct }] : [];
  });
  const teams = (groups ?? []).filter((g) => g.kind === 'team' && (g.role === 'owner' || g.role === 'coach')).map((g) => ({ id: g.id, name: g.name }));
  const athletes = users.map((u) => {
    const own = rules.find((r) => r.scope === 'athlete' && r.scopeId === u.id);
    return { id: u.id, name: name(u.id), adult: verifiedAdult(u.dobYear ?? null, now), shares: visible.has(u.id), rule: own ? { kind: own.kind, dropPct: own.dropPct, action: own.action } : null };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return res(200, {
    available: true, alerts, latest, athletes,
    teams: teams.map((t) => { const r = rules.find((x) => x.scope === 'team' && x.scopeId === t.id); return { ...t, rule: r ? { kind: r.kind, dropPct: r.dropPct, action: r.action } : null }; }),
    defaultRule: { kind: DEFAULT_RULE.kind, dropPct: DEFAULT_RULE.dropPct, action: DEFAULT_RULE.action, line: ruleLine(DEFAULT_RULE) },
  });
}

/** PUT: a rule for one athlete on the live roster, or one team the coach runs; `clear: true` goes back to the default. */
export async function setCoachRule(db: ReadinessDb, coachId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const scope = b.scope, scopeId = b.scopeId;
  if ((scope !== 'athlete' && scope !== 'team') || typeof scopeId !== 'string' || !scopeId || scopeId.length > 64) return res(400, { error: 'bad_scope' });
  if (scope === 'athlete') {
    const link = await db.coachClient.findFirst({ where: { coachId, clientId: scopeId, endedAt: null }, select: { clientId: true } });
    if (!link) return res(403, { error: 'not_your_athlete' });
  } else {
    const mine = await myGroups(db, coachId, nowMs);
    if (mine === null) return res(503, { error: 'teams_not_ready' });
    if (!mine.some((g) => g.id === scopeId && g.kind === 'team' && (g.role === 'owner' || g.role === 'coach'))) return res(403, { error: 'not_your_team' });
  }
  if (!(await readinessReady(db, nowMs))) return res(503, { error: 'readiness_not_ready' });
  if (b.clear === true) return (await clearRule(db, coachId, scope as RuleScope, scopeId, nowMs)) ? res(200, { ok: true, rule: null }) : res(500, { error: 'not_saved' });
  const c = cleanRule(b);
  if (!c.ok) return res(400, { error: c.error });
  const ok = await setRule(db, { coachId, scope: scope as RuleScope, scopeId, ...c.rule }, nowMs);
  return ok ? res(200, { ok: true, rule: { ...c.rule, line: ruleLine({ ...c.rule, source: scope }) } }) : res(500, { error: 'not_saved' });
}

/** PATCH: the coach dismisses one of their alerts. */
export async function seeCoachAlert(db: ReadinessDb, coachId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const id = (body && typeof body === 'object' ? (body as { id?: unknown }).id : null);
  if (typeof id !== 'string' || !id || id.length > 64) return res(400, { error: 'bad_id' });
  return (await seeAlert(db, coachId, id, now.getTime())) ? res(200, { ok: true }) : res(404, { error: 'not_found' });
}

// ── the weekly draft ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The jump check's lows over the last 7 days, per athlete, for the weekly draft's deload rule. The caller passes only
 * athletes whose numbers this coach may read (the drafts lane's numbersFor: verified adult, live opt-in, coach_view).
 */
export async function draftFacts(db: RawDb, userIds: readonly string[], nowMs: number): Promise<Map<string, { lowDays: number; days: number }>> {
  const out = new Map<string, { lowDays: number; days: number }>();
  if (!userIds.length) return out;
  const today = dayNumber(new Date(nowMs).toISOString().slice(0, 10));
  const rows = await checksForUsers(db, userIds, new Date(nowMs - 8 * DAY_MS), nowMs);
  for (const id of userIds) {
    const mine = rows.filter((r) => r.userId === id && today - dayNumber(r.day) <= 7 && r.band !== 'building');
    if (mine.length) out.set(id, { lowDays: mine.filter((r) => r.band === 'low').length, days: mine.length });
  }
  return out;
}

export type { ReadinessView };
