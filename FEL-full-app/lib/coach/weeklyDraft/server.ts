// lib/coach/weeklyDraft/server.ts — COACH-AI-DRAFT (2026-10-24): what the app really knows about each athlete on a
// coach's roster this week, read under every gate the app already has, and the week's drafts built from it.
//
// WHO IS DRAFTED FOR. Athletes on the coach's LIVE roster (a CoachClient row, not ended — the link the athlete made by
// accepting an invite; a program row alone is not consent, the prescribe route's rule). Each one goes through the teen
// gate (lib/coach/teenGate.ts): an adult; or 13–17 with a guardian's consent that covers coach training (none does
// today, so every teen is skipped and said so); never under 13; a blank birth year is asked for first.
//
// WHAT IS READ, AND UNDER WHICH GATE (the gates are the existing ones, run inside the reads where they can be):
//   · the coach's own active program for them, its completed sessions and the set logs on it — training data, which a
//     guardian-consented teen may save (owner, ATHLETES 2026-10-20);
//   · compliance (lib/coach/compliance.ts driftFor, lib/coach/alerts.ts missedFactsFor) from the same rows, and the
//     coach's own Full / Limited / Out (lib/coach/availabilityServer.ts);
//   · ADULTS ONLY (Mirror scans, pain and every health read are adults-only data, whatever a guardian said):
//       - pain check-ins → lib/health/pain.ts coachPainFlag: "an exercise was paused" for everyone, the details only with
//         the athlete's live coach_view grant for THIS coach;
//       - readiness check-ins — only with that coach_view grant (the attention board's rule);
//       - Mirror form and jump numbers — only for a verified adult with a live jump_numbers opt-in (lib/profile-v2/gate.ts)
//         AND that coach_view grant. assumption: the profile's own numbers are the athlete's; sharing them with a coach
//         takes the same per-coach grant the health reads take (owner call, docs/COACH-AI-DRAFT.md);
//       - the Mirror screen → lib/coach/mirrorToProgram.ts coachDraft from the coach's own catalogue (the prescribe
//         route's read: the live link is the gate);
//   · PRQ history (what the attention board already reads for every roster athlete) and the daily drill's focus
//     (lib/daily-drill: PRQ for everyone; the jump and form readings only under the gates above).
// Every read but the roster's own fails soft to "not read": one missing table costs its line, never the inbox.

import 'server-only';
import type { PrismaClient } from '@/lib/generated/prisma';
import { abacusAvailable } from '@/lib/abacus/killSwitch';
import { callCoachLLM } from '@/lib/coach-service';
import { coachPainFlag, type PainCheckInHistoryRow } from '@/lib/health/pain';
import { readReadiness } from '@/lib/health/readiness';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { profileGates, SCAN_SAVE_SCOPE } from '@/lib/profile-v2/gate';
import { JUMP_SCAN_KINDS } from '@/lib/profile-v2/load';
import { jumpCmOf } from '@/lib/profile-v2/assemble';
import { compareWeeks, type Point } from '@/lib/profile-v2/week';
import { valueFromRow, CLEAN_SHARE_SAME_BAND } from '@/lib/mirror/progressReading';
import { JUMP_SAME_BAND_IN } from '@/lib/profile-v2/tiles';
import { MIRROR_SCREEN_KIND } from '@/lib/mirror/screen';
import { youthGateFor } from '@/lib/mirror/screenCorrectives';
import { skillsFrom } from '@/lib/daily-drill/skills';
import { pickFocus } from '@/lib/daily-drill/plan';
import { prqSnapshots } from '../attention';
import { missedFactsFor, missedThisWeek } from '../alerts';
import { driftFor } from '../compliance';
import { availabilityForCoach } from '../availabilityServer';
import { todayDay } from '../availability';
import { coachDraft, type CatalogueExercise } from '../mirrorToProgram';
import { TREE_INCLUDE, toTree } from '../server';
import { logHasContent, logHasWork } from '../setLog';
import { teenGate } from '../teenGate';
import { draftFacts as jumpReadinessFacts } from '../readiness/server';   // COACH-READINESS (2026-10-25): the jump check's lows
import type { AiCaller } from './ai';
import { polishWithAi } from './ai';
import { SKIP_COPY } from './copy';
import { draftForClient } from './rules';
import { decisionsFor, draftsForWeek, draftsReady, keepDraft, type RawDb, type StoredDecision } from './store';
import { DRAFT_LOOKBACK_DAYS, PAIN_WINDOW_DAYS } from './thresholds';
import type { ClientDraft, DraftCatalogueRow, DraftFacts, Exposure } from './types';
import { weekKeyOf } from './week';

const DAY = 86_400_000;

export type DraftReadDb = RawDb & Pick<PrismaClient,
  'coachClient' | 'user' | 'guardianConsent' | 'coachingProgram' | 'clientSession' | 'exerciseLog' | 'programExercise' | 'gameSession'
  | 'painCheckIn' | 'healthConsent' | 'readinessCheckIn' | 'workoutScan' | 'mirrorSession' | 'prqEntry' | 'scanSaveOptIn'>;

const soft = <T,>(p: Promise<T>, empty: T, what: string): Promise<T> => p.catch((e: unknown) => {
  console.warn(`[coach/drafts] ${what} not read`, e instanceof Error ? e.name : typeof e);
  return empty;
});
const groupBy = <T,>(rows: readonly T[], key: (r: T) => string) => {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
};
const lite = (c: ReturnType<typeof compareWeeks>) => ({ thisWeek: c.thisWeek, lastWeek: c.lastWeek, delta: c.delta });
const r1 = (n: number) => Math.round(n * 10) / 10;

function emptyDraft(coachId: string, clientId: string, name: string, nowMs: number, skipReason: string): ClientDraft {
  return {
    version: 1, weekKey: weekKeyOf(nowMs), coachId, clientId, name, programId: null, programName: null, band: null, status: 'skipped', skipReason,
    changes: [], held: [], context: [], engine: 'rules', summary: null,
    guard: { youth: true, painOpen: false, availability: null, lowCompliance: false, easierWeek: false, formDropPatterns: [] },
  };
}

/** The facts for every athlete on this coach's live roster who passes the teen gate; the rest come back as skipped drafts. */
export async function readRosterFacts(db: DraftReadDb, coachId: string, now: Date = new Date()): Promise<{ facts: DraftFacts[]; skipped: ClientDraft[] }> {
  const nowMs = now.getTime();
  const links = await db.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true, createdAt: true } });
  const ids = links.map((l) => l.clientId);
  if (!ids.length) return { facts: [], skipped: [] };
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, dobYear: true } });
  const nameOf = (id: string) => { const u = users.find((x) => x.id === id); return u?.name ?? u?.email?.split('@')[0] ?? 'athlete'; };
  const notAdult = users.filter((u) => !verifiedAdult(u.dobYear ?? null, now)).map((u) => u.id);
  const consents = notAdult.length
    ? await db.guardianConsent.findMany({ where: { menteeId: { in: notAdult } }, select: { menteeId: true, requestedAt: true, acceptedAt: true, revokedAt: true, menteeBirthYear: true } })
    : [];

  const band = new Map<string, 'adult' | 'teen'>();
  const skipped: ClientDraft[] = [];
  for (const id of ids) {
    const u = users.find((x) => x.id === id);
    if (!u) continue;
    if (verifiedAdult(u.dobYear ?? null, now)) { band.set(id, 'adult'); continue; }
    const g = teenGate({ dobYear: u.dobYear ?? null, consents: consents.filter((c) => c.menteeId === id) }, now);
    if (g.ok) band.set(id, g.band);
    else skipped.push(emptyDraft(coachId, id, nameOf(id), nowMs, SKIP_COPY[g.error]));
  }
  const allowed = [...band.keys()];
  if (!allowed.length) return { facts: [], skipped };
  const adults = allowed.filter((id) => band.get(id) === 'adult');

  const programs = await db.coachingProgram.findMany({
    where: { coachId, clientId: { in: allowed }, isActive: true }, include: TREE_INCLUDE, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
  const programOf = new Map<string, (typeof programs)[number]>();
  for (const p of programs) if (!programOf.has(p.clientId)) programOf.set(p.clientId, p);
  const programIds = [...programOf.values()].map((p) => p.id);
  const since60 = new Date(nowMs - 60 * DAY);
  const lookback = nowMs - DRAFT_LOOKBACK_DAYS * DAY;

  const [sessions, logs, catalogue, games, availability, prqRows] = await Promise.all([
    soft(db.clientSession.findMany({ where: { programId: { in: programIds }, clientId: { in: allowed } }, select: { programId: true, sessionId: true, clientId: true, completedAt: true } }), [], 'sessions'),
    soft(db.exerciseLog.findMany({
      where: { clientSession: { programId: { in: programIds } }, createdAt: { gte: since60 } },
      select: {
        sessionExerciseId: true, actualSets: true, actualReps: true, actualLoad: true, rpe: true, clientNote: true, videoUrl: true, coachComment: true, createdAt: true,
        setLogs: { select: { id: true, setIndex: true, reps: true, weightKg: true, rir: true, effort: true }, orderBy: { setIndex: 'asc' } },
        clientSession: { select: { clientId: true, completedAt: true } },
        sessionExercise: { select: { exerciseId: true, sets: true, reps: true, load: true, effortBand: true } },
      },
    }), [], 'logs'),
    soft(db.programExercise.findMany({ where: { coachId }, select: { id: true, name: true, category: true, pattern: true, skillLayer: true, regressionOfId: true, progressionOfId: true, defaultTempo: true } }), [], 'catalogue'),
    soft(db.gameSession.findMany({ where: { userId: { in: allowed }, createdAt: { gte: new Date(nowMs - 28 * DAY) } }, select: { userId: true, createdAt: true } }), [], 'games'),
    soft(availabilityForCoach(db, coachId, todayDay(now), nowMs), { available: false as const }, 'availability'),
    soft(db.prqEntry.findMany({ where: { userId: { in: allowed } }, select: { userId: true, attribute: true, value: true, unit: true, source: true, measuredAt: true }, orderBy: { measuredAt: 'desc' }, take: 400 * allowed.length }), [], 'prq'),
  ]);

  // ── adults only: pain, the coach_view grant, and through it readiness, form and jump; the Mirror screen ──────────
  const [painRows, grants, optIns, screens] = adults.length ? await Promise.all([
    soft(db.painCheckIn.findMany({
      where: { userId: { in: adults }, createdAt: { gte: new Date(nowMs - PAIN_WINDOW_DAYS * DAY) } },
      select: { id: true, userId: true, exerciseName: true, bodyArea: true, programExerciseId: true, score: true, kind: true, decision: true, createdAt: true },
    }), [], 'pain'),
    soft(db.healthConsent.findMany({ where: { coachId, scope: 'coach_view', userId: { in: adults }, revokedAt: null }, select: { userId: true } }), [], 'coach_view'),
    soft(db.scanSaveOptIn.findMany({ where: { userId: { in: adults } }, select: { userId: true, scope: true, granted: true, revokedAt: true } }), [], 'opt-in'),
    soft(db.workoutScan.findMany({ where: { userId: { in: adults }, kind: MIRROR_SCREEN_KIND }, select: { userId: true, metrics: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 * adults.length }), [], 'screens'),
  ]) : [[], [], [], []];
  const shared = new Set(grants.map((g) => g.userId));
  const canSave = new Set(adults.filter((id) => profileGates(users.find((u) => u.id === id)?.dobYear ?? null, optIns.find((o) => o.userId === id) ?? null, now).canSaveScan));
  const numbersFor = adults.filter((id) => shared.has(id) && canSave.has(id));
  const sharedOnly = adults.filter((id) => shared.has(id));
  const [readiness, jumpScans, mirror, jumpReady] = await Promise.all([
    sharedOnly.length ? soft(db.readinessCheckIn.findMany({ where: { userId: { in: sharedOnly }, updatedAt: { gte: new Date(nowMs - 7 * DAY) } }, select: { userId: true, sleep: true, soreness: true, energy: true, mood: true } }), [], 'readiness') : Promise.resolve([]),
    numbersFor.length ? soft(db.workoutScan.findMany({ where: { userId: { in: numbersFor }, kind: { in: [...JUMP_SCAN_KINDS] }, createdAt: { gte: new Date(nowMs - 28 * DAY) } }, select: { userId: true, kind: true, metrics: true, createdAt: true } }), [], 'jumps') : Promise.resolve([]),
    numbersFor.length ? soft(db.mirrorSession.findMany({ where: { userId: { in: numbersFor }, patternId: { in: ['squat', 'lunge'] }, createdAt: { gte: new Date(nowMs - 28 * DAY) } }, select: { userId: true, patternId: true, reps: true, faultCounts: true, createdAt: true } }), [], 'mirror') : Promise.resolve([]),
    soft(jumpReadinessFacts(db, numbersFor, nowMs), new Map<string, { lowDays: number; days: number }>(), 'jump readiness'),
  ]);

  const sessionsBy = groupBy(sessions, (s) => s.clientId);
  const logsBy = groupBy(logs, (l) => l.clientSession.clientId);
  const gamesBy = groupBy(games, (g) => g.userId);
  const prqBy = groupBy(prqRows, (p) => p.userId);
  const painBy = groupBy(painRows, (p) => p.userId);
  const readyBy = groupBy(readiness, (r) => r.userId);
  const jumpBy = groupBy(jumpScans, (s) => s.userId);
  const mirrorBy = groupBy(mirror, (s) => s.userId);
  const screensBy = groupBy(screens, (s) => s.userId);
  const cat: DraftCatalogueRow[] = catalogue.map((r) => ({ ...r, pattern: r.pattern ?? null }));
  const screenCatalogue: CatalogueExercise[] = catalogue.map((r) => ({ id: r.id, name: r.name, category: r.category, pattern: r.pattern, skillLayer: r.skillLayer, defaultTempo: r.defaultTempo }));
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const dayStart = Date.parse(`${day}T00:00:00Z`);

  const facts: DraftFacts[] = allowed.map((clientId) => {
    const youth = band.get(clientId) === 'teen';
    const p = programOf.get(clientId) ?? null;
    const mine = (sessionsBy.get(clientId) ?? []).filter((s) => p && s.programId === p.id);
    const completedTimes = mine.flatMap((s) => (s.completedAt ? [s.completedAt.getTime()] : []));
    const clientLogs = logsBy.get(clientId) ?? [];
    const exposures: Exposure[] = clientLogs
      .filter((l) => l.clientSession.completedAt && l.clientSession.completedAt.getTime() >= lookback && logHasWork(l))
      .map((l) => ({
        exerciseId: l.sessionExercise.exerciseId, atMs: l.clientSession.completedAt!.getTime(),
        prescribed: { sets: l.sessionExercise.sets, reps: l.sessionExercise.reps, load: l.sessionExercise.load, effortBand: l.sessionExercise.effortBand },
        sets: l.setLogs.map((s) => ({ reps: s.reps, weightKg: s.weightKg, rir: s.rir, effort: s.effort })),
        summary: { actualSets: l.actualSets, actualReps: l.actualReps, actualLoad: l.actualLoad, rpe: l.rpe },
      }));
    const drift = driftFor({
      clientId, name: nameOf(clientId), joinedAtMs: links.find((l) => l.clientId === clientId)?.createdAt.getTime() ?? null, hasProgram: !!p,
      completedAtMs: [...completedTimes].sort((a, b) => b - a), loggedAtMs: clientLogs.map((l) => l.createdAt.getTime()),
      gameAtMs: (gamesBy.get(clientId) ?? []).map((g) => g.createdAt.getTime()),
    }, nowMs);
    const missed = missedFactsFor(p ? [{
      startMs: p.startDate.getTime(), durationWeeks: p.durationWeeks,
      trainingSessions: p.blocks.flatMap((b) => b.sessions).filter((x) => x.kind !== 'recovery').length,
    }] : [], completedTimes, nowMs);
    const planned = missed.expectedPerWeek == null ? null : Math.round(missed.expectedPerWeek);

    let pain: DraftFacts['pain'] = null;
    let readinessFact: DraftFacts['readiness'] = null;
    let form: DraftFacts['form'] = null;
    let jump: DraftFacts['jump'] = null;
    let screen: DraftFacts['screen'] = null;
    if (!youth) {
      const view = coachPainFlag((painBy.get(clientId) ?? []) as unknown as PainCheckInHistoryRow[], shared.has(clientId));
      pain = {
        present: view.present, detailed: view.detailed,
        items: (view.items ?? []).map((i) => ({ exerciseName: i.exerciseName, bodyArea: i.bodyArea, decision: i.decision, atMs: Date.parse(i.createdAt) })),
      };
      if (shared.has(clientId)) {
        const reads = (readyBy.get(clientId) ?? []).map((r) => readReadiness(r).level).filter((l) => l !== 'skip');
        readinessFact = { lowDays: reads.filter((l) => l === 'low').length, days: reads.length };
      }
      if (numbersFor.includes(clientId)) {
        const jp: Point[] = (jumpBy.get(clientId) ?? []).flatMap((s) => { const cm = jumpCmOf(s.kind, s.metrics); return cm == null ? [] : [{ at: s.createdAt.getTime(), value: r1(cm / 2.54) }]; });
        const fp: Point[] = (mirrorBy.get(clientId) ?? []).flatMap((s) => { const v = valueFromRow(s); return v == null ? [] : [{ at: s.createdAt.getTime(), value: v }]; });
        jump = jp.length ? lite(compareWeeks(jp, nowMs, { reduce: 'max', sameBand: JUMP_SAME_BAND_IN })) : null;
        form = fp.length ? lite(compareWeeks(fp, nowMs, { reduce: 'mean', sameBand: CLEAN_SHARE_SAME_BAND })) : null;
      }
      const scans = screensBy.get(clientId) ?? [];
      if (scans.length) {
        const dob = users.find((u) => u.id === clientId)?.dobYear ?? null;
        const d = coachDraft(scans, screenCatalogue, { youth: youthGateFor(dob), answersShared: false });
        screen = { prescriptions: d.prescriptions, atIso: d.screenAt ? new Date(d.screenAt).toISOString() : null };
      }
    }

    const prq = (prqBy.get(clientId) ?? []).map((r) => ({ attribute: r.attribute, value: r.value, measuredAtMs: r.measuredAt.getTime() }));
    const snaps = prqSnapshots(prq);
    const nowSnap = snaps[snaps.length - 1];
    const beforeSnap = [...snaps].reverse().find((s) => Date.parse(s.at) <= nowMs - 14 * DAY);
    const skills = skillsFrom({
      jumpScans: numbersFor.includes(clientId) ? (jumpBy.get(clientId) ?? []) : [],
      mirrorSessions: numbersFor.includes(clientId) ? (mirrorBy.get(clientId) ?? []) : [],
      shotScans: [], prqEntries: (prqBy.get(clientId) ?? []),
    }, dayStart, numbersFor.includes(clientId));
    const pick = pickFocus(skills, clientId, day);

    return {
      coachId, clientId, name: nameOf(clientId), band: youth ? 'teen' : 'adult',
      program: p ? { id: p.id, name: p.name, tree: toTree(p) } : null,
      completedSessionIds: mine.filter((s) => s.completedAt).map((s) => s.sessionId),
      loggedRowIds: clientLogs.filter(logHasContent).map((l) => l.sessionExerciseId),
      exposures, catalogue: cat,
      compliance: { state: drift.state, note: drift.note, daysSince: drift.daysSince, planned, doneLast7: missed.doneLast7, missed: missedThisWeek(missed) },
      availability: availability.available ? (availability.byClient[clientId]?.status ?? null) : null,
      pain, readiness: readinessFact, form, jump, numbersShared: numbersFor.includes(clientId),
      ...(numbersFor.includes(clientId) ? { jumpReadiness: jumpReady.get(clientId) ?? null } : {}),
      prq: nowSnap && beforeSnap ? { now: nowSnap.composite, before: beforeSnap.composite } : null,
      screen,
      drill: pick.skill ? { focus: pick.skill.label, display: pick.skill.display } : null,
      nowMs,
    };
  });
  return { facts, skipped };
}

export interface DecisionView { decision: StoredDecision['decision']; decidedAt: string; note: string | null }
export type CoachDraftView = ClientDraft & { draftId: string | null; decisions: Record<string, DecisionView> };

/**
 * This week's drafts for a coach's roster. With the drafts tables there, a client's draft is made once a week and kept
 * (the AI layer runs then, once, when it is switched on), and every later request reads the kept one with its decisions.
 * Without them, the drafts are computed on each request (the rules are deterministic, so they read the same) and
 * `approvals` is false.
 */
export async function coachWeek(db: DraftReadDb, coachId: string, now: Date = new Date(), ai: AiCaller | null = null): Promise<{ weekKey: string; approvals: boolean; drafts: CoachDraftView[] }> {
  const nowMs = now.getTime();
  const weekKey = weekKeyOf(nowMs);
  const { facts, skipped } = await readRosterFacts(db, coachId, now);
  const approvals = await draftsReady(db, nowMs);
  const kept = approvals ? (await draftsForWeek(db, coachId, weekKey, nowMs)) ?? [] : [];
  const out: CoachDraftView[] = [];
  for (const f of facts) {
    const k = f.program ? kept.find((x) => x.clientId === f.clientId && x.programId === f.program!.id) : null;
    if (k) { out.push({ ...k.draft, draftId: k.id, decisions: {} }); continue; }
    let d = draftForClient(f);
    if (approvals && d.changes.length) {
      d = await polishWithAi(d, ai);
      const stored = await keepDraft(db, d, nowMs);
      if (stored) { out.push({ ...stored.draft, draftId: stored.id, decisions: {} }); continue; }
    }
    out.push({ ...d, draftId: null, decisions: {} });
  }
  const ids = out.flatMap((d) => (d.draftId ? [d.draftId] : []));
  const decisions = approvals && ids.length ? await soft(decisionsFor(db, ids), [], 'decisions') : [];
  for (const d of out) {
    for (const x of decisions.filter((y) => y.draftId === d.draftId)) d.decisions[x.changeId] = { decision: x.decision, decidedAt: x.decidedAt, note: x.note };
  }
  const rank = (d: CoachDraftView) => (d.changes.length ? 0 : d.status === 'ok' ? 1 : d.status === 'no_data' ? 2 : 3);
  out.sort((a, b) => rank(a) - rank(b) || (b.changes[0]?.priority ?? 0) - (a.changes[0]?.priority ?? 0) || a.name.localeCompare(b.name));
  return { weekKey, approvals, drafts: [...out, ...skipped.map((s) => ({ ...s, draftId: null, decisions: {} }))] };
}

/**
 * The AI layer's model call, or null — null whenever the Abacus kill switch is off (ABACUS_ENABLED is not exactly
 * 'true', or there is no key): then the drafts are the rules engine's alone. The call is lib/coach-service.ts
 * callCoachLLM, the existing kill-switched completion (it checks the switch again itself).
 */
export function aiCallerFromEnv(): AiCaller | null {
  if (!abacusAvailable()) return null;
  return (system, user) => callCoachLLM(system, [{ role: 'user', content: user }]);
}
