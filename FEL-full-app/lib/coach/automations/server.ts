// lib/coach/automations/server.ts — COACH-DELIVERY COA-01 (2026-10-26): coach automations, the IO half.
//
//   automationBoard  GET   /api/coach/automations      the coach's automations, the presets, who each reaches, the last
//                                                      two weeks of runs (the audit)
//   automationAct    POST  /api/coach/automations      { action: 'create' | 'update' | 'enable' | 'disable' | 'archive' | 'run' }
//   runAutomations   POST  /api/cron/coach-automations the scheduled sweep (every coach), and a coach's "Run now" (theirs)
//
// THE RULES EVERY POST KEEPS (the brief's risks):
//   · ONLY INTO AN EXISTING PROGRAM THREAD: the athlete's newest ACTIVE CoachingProgram with this coach. No program, no
//     message (and no run row, so a join automation still fires once their first program is assigned, inside its window).
//   · THE TEEN GATE FIRST (lib/coach/teenGateServer.ts readTeenGate): an adult, or a 13–17 whose guardian accepted the
//     coach-training consent. Anyone else — every teen today (COACH_TRAINING_CONSENT_SINCE is null), under 13, a blank
//     birth year — is skipped, and the skip is the audit row ('skipped_teen').
//   · NEVER EMAIL: nothing here calls lib/mail. The message is a thread post the athlete reads in the app.
//   · LIVE ROSTER ONLY (lib/coach/parity/people.ts coachPeople): an athlete who left is never messaged; a team reaches only
//     its members who are on the coach's live roster (docs/COACH-LOOP.md §3).
import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { addDays, dayOf } from '@/lib/groups/week';
import { missedFactsFor } from '../alerts';
import { readTeenGate } from '../teenGateServer';
import { coachPeople, mayAssign, type PeopleDb, type RosterAthlete } from '../parity/people';
import { deliveryReady, NOT_READY, res, type Res } from '../delivery/probe';
import { cleanAutomation, isDue, LIMITS, MISSED_COOLDOWN_DAYS, OUTCOME_LINE, PRESETS, renderMessage, triggerLine, type CleanAutomation } from './rules';
import {
  archiveAutomation, automationsForCoach, claimRun, enabledAutomations, finishRun, insertAutomation, recentRuns, runsFor, setEnabled, updateAutomation,
  type AutomationRow,
} from './store';

export type AutomationDb = PeopleDb & Pick<PrismaClient, 'coachingProgram' | 'clientSession' | 'programMessage'>;

const DAY = 86_400_000;

const view = (a: AutomationRow, people: { roster: RosterAthlete[]; teams: { id: string; name: string }[] }) => ({
  id: a.id, trigger: a.trigger, scope: a.scope, scopeId: a.scopeId, missedN: a.missedN, weekday: a.weekday, hour: a.hour, preset: a.preset, text: a.text,
  enabled: a.enabled, when: triggerLine(a),
  reaches: a.scope === 'roster' ? 'Everyone on your roster' : a.scope === 'team' ? people.teams.find((t) => t.id === a.scopeId)?.name ?? 'A team you no longer run'
    : people.roster.find((r) => r.id === a.scopeId)?.name ?? 'No longer on your roster',
  preview: renderMessage(a, 'Sam'),
});

// ── the coach ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function automationBoard(db: AutomationDb, coachId: string, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await deliveryReady(db, nowMs))) return res(200, { available: false });
  const [list, people] = await Promise.all([automationsForCoach(db, coachId, nowMs), coachPeople(db, coachId, now)]);
  if (!list) return res(200, { available: false });
  const runs = (await recentRuns(db, coachId, new Date(nowMs - 14 * DAY), nowMs)) ?? [];
  const name = (id: string) => people.roster.find((r) => r.id === id)?.name ?? 'An athlete';
  return res(200, {
    available: true,
    automations: list.map((a) => view(a, people)),
    presets: PRESETS,
    roster: people.roster.map((r) => ({ id: r.id, name: r.name })), teams: people.teams.map((t) => ({ id: t.id, name: t.name })),
    runs: runs.map((r) => ({ ...r, name: name(r.athleteId), line: OUTCOME_LINE[r.outcome] ?? r.outcome })),
  });
}

export async function automationAct(db: AutomationDb, coachId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!(await deliveryReady(db, nowMs))) return NOT_READY;
  if (b.action === 'run') {
    const r = await runAutomations(db, { coachId }, now);
    return res(200, { ok: true, ...r });
  }
  if (b.action === 'create' || b.action === 'update') {
    const c = cleanAutomation(b);
    if (!c.ok) return res(400, { error: c.error });
    if (c.a.scope !== 'roster') {
      const people = await coachPeople(db, coachId, now);
      if (!mayAssign(people, c.a.scope, c.a.scopeId)) return res(403, { error: c.a.scope === 'team' ? 'not_your_team' : 'not_your_athlete' });
    }
    if (b.action === 'create') {
      const mine = await automationsForCoach(db, coachId, nowMs);
      if (mine && mine.length >= LIMITS.perCoach) return res(409, { error: 'too_many_automations' });
      const id = await insertAutomation(db, coachId, c.a, nowMs);
      return id ? res(201, { ok: true, id }) : res(500, { error: 'not_saved' });
    }
    if (typeof b.id !== 'string' || !b.id) return res(400, { error: 'bad_id' });
    return (await updateAutomation(db, b.id, coachId, c.a, nowMs)) ? res(200, { ok: true }) : res(404, { error: 'not_found' });
  }
  if (typeof b.id !== 'string' || !b.id) return res(400, { error: 'bad_id' });
  if (b.action === 'enable' || b.action === 'disable') return (await setEnabled(db, b.id, coachId, b.action === 'enable', nowMs)) ? res(200, { ok: true }) : res(404, { error: 'not_found' });
  if (b.action === 'archive') return (await archiveAutomation(db, b.id, coachId, nowMs)) ? res(200, { ok: true }) : res(404, { error: 'not_found' });
  return res(400, { error: 'unknown_action' });
}

// ── the sweep ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SweepSummary { automations: number; posted: number; skippedTeen: number; noThread: number; notDue: number }

/** Who an automation reaches on the coach's live roster. */
function recipients(a: Pick<CleanAutomation, 'scope' | 'scopeId'>, people: { roster: RosterAthlete[]; teams: { id: string; memberIds: string[] }[] }): RosterAthlete[] {
  if (a.scope === 'roster') return people.roster;
  if (a.scope === 'athlete') return people.roster.filter((r) => r.id === a.scopeId);
  const team = people.teams.find((t) => t.id === a.scopeId);
  return team ? people.roster.filter((r) => team.memberIds.includes(r.id)) : [];
}

/**
 * Run every enabled automation (or one coach's): each athlete it reaches, under the rules in the header, at most once a
 * PT day (claimed first). Never throws for one athlete's failure; the sweep goes on.
 */
export async function runAutomations(db: AutomationDb, o: { coachId?: string } = {}, now: Date = new Date()): Promise<SweepSummary> {
  const nowMs = now.getTime();
  const sum: SweepSummary = { automations: 0, posted: 0, skippedTeen: 0, noThread: 0, notDue: 0 };
  const all = await enabledAutomations(db, o.coachId ?? null, nowMs);
  if (!all?.length) return sum;
  sum.automations = all.length;
  const today = dayOf(now);
  const runs = (await runsFor(db, all.map((a) => a.id), addDays(today, -Math.max(MISSED_COOLDOWN_DAYS, 60)), nowMs)) ?? [];
  const byCoach = new Map<string, AutomationRow[]>();
  for (const a of all) (byCoach.get(a.coachId) ?? byCoach.set(a.coachId, []).get(a.coachId)!).push(a);

  for (const [coachId, autos] of byCoach) {
    const people = await coachPeople(db, coachId, now);
    if (!people.roster.length) continue;
    const ids = people.roster.map((r) => r.id);
    const [links, programs] = await Promise.all([
      db.coachClient.findMany({ where: { coachId, endedAt: null, clientId: { in: ids } }, select: { clientId: true, createdAt: true } }).catch(() => [] as { clientId: string; createdAt: Date }[]),
      db.coachingProgram.findMany({
        where: { coachId, clientId: { in: ids }, isActive: true },
        select: { id: true, clientId: true, startDate: true, durationWeeks: true, createdAt: true, blocks: { select: { sessions: { select: { kind: true } } } } },
        orderBy: { createdAt: 'desc' },
      }).catch(() => [] as never[]),
    ]);
    // completed sessions in THIS coach's programs (compliance is "are they doing the work I wrote", the attention board's rule)
    const done = programs.length && autos.some((a) => a.trigger === 'missed')
      ? await db.clientSession.findMany({ where: { programId: { in: programs.map((p) => p.id) }, completedAt: { gte: new Date(nowMs - 8 * DAY) } }, select: { clientId: true, completedAt: true } }).catch(() => [] as { clientId: string; completedAt: Date | null }[])
      : [];
    for (const a of autos) {
      for (const athlete of recipients(a, people)) {
        const mine = programs.filter((p) => p.clientId === athlete.id);
        const thread = mine[0] ?? null;
        const ranDays = runs.filter((r) => r.automationId === a.id && r.athleteId === athlete.id).map((r) => r.day).sort().reverse();
        const missed = a.trigger === 'missed' ? missedFactsFor(
          mine.map((p) => ({ startMs: p.startDate.getTime(), durationWeeks: p.durationWeeks, trainingSessions: p.blocks.flatMap((b) => b.sessions).filter((x) => x.kind !== 'recovery').length })),
          done.filter((d) => d.clientId === athlete.id && d.completedAt).map((d) => d.completedAt!.getTime()), nowMs,
        ) : null;
        const joinedAt = links.find((l) => l.clientId === athlete.id)?.createdAt ?? null;
        if (!isDue(a, { today, now, joinedAt, missed, ranDays })) { sum.notDue++; continue; }
        if (!thread) { sum.noThread++; continue; }
        // the teen gate before anything is written to the athlete's thread; the refusal is the audit row
        const gate = await readTeenGate(db, athlete.id, now);
        if (!gate.ok) {
          if (await claimRun(db, { automationId: a.id, coachId, athleteId: athlete.id, day: today, outcome: 'skipped_teen', programId: thread.id }, nowMs)) sum.skippedTeen++;
          runs.push({ automationId: a.id, athleteId: athlete.id, day: today, outcome: 'skipped_teen' });
          continue;
        }
        const runId = await claimRun(db, { automationId: a.id, coachId, athleteId: athlete.id, day: today, outcome: 'posting', programId: thread.id }, nowMs);
        runs.push({ automationId: a.id, athleteId: athlete.id, day: today, outcome: 'posting' });
        if (!runId) continue;   // already ran today (another sweep got there first)
        try {
          const m = await db.programMessage.create({ data: { programId: thread.id, authorId: coachId, body: renderMessage(a, athlete.name) }, select: { id: true } });
          await finishRun(db, runId, 'posted', m.id, nowMs);
          sum.posted++;
        } catch (e) {
          console.warn('[coach/automations] post failed', e instanceof Error ? e.name : typeof e);
          await finishRun(db, runId, 'failed', null, nowMs);
        }
      }
    }
  }
  return sum;
}
