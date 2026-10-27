// lib/vbt/server.ts — VBT (2026-10-25): the bar-speed tool's reads and writes, under the gates in ./gate.ts.
//
//   athleteContext  GET    /api/vbt/sets         the athlete's own: their tier and features, whether sets are kept on the
//                                                server, their saved sets (for the load-velocity line and the readiness
//                                                baseline), their coaches' readiness rules, and the zone targets their
//                                                coaches set on their program's exercises
//   saveSet         POST   /api/vbt/sets         one set's NUMBERS (never a frame) — the route runs the movement-save gate
//                                                FIRST (canSaveScanNumbers, row 1n); a warm-up set's band is read again
//                                                here, from the saved history, under the coaches' rules
//   deleteAll       DELETE /api/vbt/sets         every set of the athlete's own
//   coachBoard      GET    /api/coach/vbt        the coach's roster athletes who share (live roster + live coach_view +
//                                                verified adult + live save opt-in): their recent sets, reps and velocity
//                                                loss; the coach's teams; the program slots and their zone targets
//   teamBoard       GET    /api/coach/vbt?team=  one team the coach runs: the members who are adults, can save and turned
//                                                on "share measured" (the groups lane's rule), each one's latest sets
//   setZone         PUT    /api/coach/vbt        a zone (+ stop line) on one of the coach's own program slots, or clear it
import 'server-only';
import { coachMaySee } from '@/lib/coach/readiness/gate';
import { coachRules } from '@/lib/coach/readiness/server';
import type { ReadinessDb } from '@/lib/coach/readiness/server';
import { profileGates } from '@/lib/profile-v2/gate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { groupById, members, membership, myGroups } from '@/lib/groups/store';
import { featuresFor, type VbtTier } from './gate';
import { isZoneId, LIFTS, type LiftId } from './lifts';
import { readBarSpeed } from './readiness';
import { barSpeedDays, cleanSet, type KeptSet } from './sets';
import { clearTarget, deleteSets, keepSet, setsFor, setsForUsers, setTarget, targetsFor, vbtReady, type RawDb, type StoredSet } from './store';
import { clampStop } from './live';

const DAY_MS = 86_400_000;
/** (new) How far back the athlete's own history reaches (the load-velocity line, the readiness baseline): 90 days. */
export const HISTORY_DAYS = 90;
/** (new) How far back a coach sees a client's sets: 28 days. */
export const COACH_DAYS = 28;

/** The Prisma reads this file makes (structural, so a test's fake fits), plus the raw calls of the stores. */
export type VbtDb = RawDb & ReadinessDb & {
  coachingProgram: { findMany(a: unknown): Promise<any[]> };
  sessionExercise: { findUnique(a: unknown): Promise<any> };
};

export interface Res { status: number; body: Record<string, unknown> }
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const soft = <T,>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);
const nameOf = (u: { name?: string | null; email?: string | null } | null | undefined) => u?.name ?? u?.email?.split('@')[0] ?? 'Athlete';

/** A program slot's lift, from the exercise's name (the catalogue has no lift id): the first lift whose words it has. */
export function liftFromName(name: string): LiftId | null {
  const n = name.toLowerCase();
  const rules: [RegExp, LiftId][] = [
    [/front squat/, 'front_squat'], [/goblet/, 'goblet_squat'], [/jump squat|squat jump/, 'jump_squat'], [/(body ?weight|air) squat/, 'bodyweight_squat'],
    [/squat/, 'back_squat'], [/(dumbbell|db).*bench|(dumbbell|db) (chest )?press/, 'db_bench_press'], [/bench/, 'bench_press'],
    [/deadlift|rdl|romanian/, 'deadlift'], [/(dumbbell|db).*(shoulder|overhead) press/, 'db_shoulder_press'], [/(overhead|military|shoulder|strict) press|ohp/, 'overhead_press'],
    [/hang.*clean/, 'hang_power_clean'], [/clean/, 'power_clean'], [/swing/, 'kb_swing'], [/push[- ]?up/, 'push_up'], [/pull[- ]?up|chin[- ]?up/, 'pull_up'],
    [/chest pass/, 'mb_chest_pass'], [/overhead throw/, 'mb_overhead_throw'], [/scoop/, 'mb_scoop_toss'],
  ];
  for (const [re, id] of rules) if (re.test(n)) return id;
  return null;
}

/** The athlete's program slots (their live programs' exercises), with any zone target a coach set. */
async function slotsFor(db: VbtDb, where: Record<string, unknown>, nowMs: number) {
  const programs = await soft(db.coachingProgram.findMany({
    where, take: 5, orderBy: { startDate: 'desc' },
    select: { id: true, name: true, coachId: true, clientId: true, blocks: { select: { sessions: { select: { id: true, label: true, exercises: { select: { id: true, sets: true, reps: true, load: true, exercise: { select: { name: true } } } } } } } } },
  }), [] as any[]);
  const slots = programs.flatMap((p: any) => (p.blocks ?? []).flatMap((b: any) => (b.sessions ?? []).flatMap((s: any) => (s.exercises ?? []).flatMap((e: any) => {
    const lift = liftFromName(String(e.exercise?.name ?? ''));
    return lift ? [{ sessionExerciseId: String(e.id), programId: String(p.id), clientId: String(p.clientId), coachId: String(p.coachId), session: String(s.label), name: String(e.exercise?.name), lift, sets: e.sets, reps: e.reps, load: e.load }] : [];
  }))));
  const targets = await targetsFor(db, slots.map((s: { sessionExerciseId: string }) => s.sessionExerciseId), nowMs);
  return slots.map((s: any) => ({ ...s, target: targets.find((t) => t.sessionExerciseId === s.sessionExerciseId) ?? null }));
}

// ── the athlete ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function athleteContext(db: VbtDb, userId: string, tier: VbtTier, canSave: boolean, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const features = featuresFor(tier);
  const ready = await vbtReady(db, nowMs);
  const history = canSave && ready && features.keep ? await setsFor(db, userId, new Date(nowMs - HISTORY_DAYS * DAY_MS), 300, nowMs) : null;
  const adult = tier === 'adult';
  const coaches = adult && features.readiness ? (await soft(coachRules(db, userId, nowMs), [])).map((c) => ({ coachId: c.coachId, coachName: c.coachName, rule: c.rule, shared: c.shared })) : [];
  const slots = (await slotsFor(db, { clientId: userId }, nowMs)).filter((s) => s.target);
  return res(200, {
    ok: true, tier, features, canSave, ready, kept: !features.keep ? 'none' : canSave && ready ? 'server' : 'device',
    history: history ? history.map(({ id: _i, userId: _u, createdAt: _c, ...s }) => s) : null,
    coaches, targets: slots.map((s) => ({ sessionExerciseId: s.sessionExerciseId, name: s.name, lift: s.lift, zone: s.target!.zone, lossStopPct: s.target!.lossStopPct })),
  });
}

/** POST: one set. The route has already run canSaveScanNumbers (a verified adult who opted in). */
export async function saveSet(db: VbtDb, userId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const s = cleanSet(body);
  if (!s) return res(400, { error: 'bad_set' });
  let kept: KeptSet = { ...s, at: nowMs };
  if (s.warmup) {
    // the band is read again here, from the SAVED history and the coaches' rules — never taken from the request
    const history = await setsFor(db, userId, new Date(nowMs - HISTORY_DAYS * DAY_MS), 300, nowMs);
    if (history === null) return res(503, { error: 'vbt_not_ready', saved: false });
    const today = barSpeedDays([{ ...kept, band: 'normal' }])[0];
    if (today) {
      const coaches = await soft(coachRules(db, userId, nowMs), []);
      const { kept: day } = readBarSpeed(today, barSpeedDays(history), coaches);
      kept = { ...kept, band: day.band };
    } else kept = { ...kept, warmup: false, band: null };
  } else kept = { ...kept, band: null };
  const id = await keepSet(db, userId, kept, nowMs);
  return id ? res(200, { saved: true, id, band: kept.band }) : res(503, { error: 'vbt_not_ready', saved: false });
}

export async function deleteAll(db: VbtDb, userId: string, now: Date = new Date()): Promise<Res> {
  return (await deleteSets(db, userId, now.getTime())) ? res(200, { deleted: true }) : res(503, { error: 'vbt_not_ready' });
}

// ── the coach ────────────────────────────────────────────────────────────────────────────────────────────────────

const summary = (s: StoredSet) => ({ day: s.day, lift: s.lift, liftName: LIFTS[s.lift].name, loadKg: s.loadKg, reps: s.reps, partials: s.partials, bestMcv: s.bestMcv, lastMcv: s.lastMcv, bestPv: s.bestPv, lossPct: s.lossPct, stopPct: s.stopPct, repMcvs: s.repMcvs, source: s.source, fps: s.fps, warmup: s.warmup, band: s.band });

export async function coachBoard(db: VbtDb, coachId: string, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await vbtReady(db, nowMs))) return res(200, { available: false });
  const links = await soft(db.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true } }), [] as { clientId: string }[]);
  const ids = [...new Set(links.map((l) => l.clientId))];
  const [users, grants, optIns, groups] = await Promise.all([
    ids.length ? soft(db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, dobYear: true } }), [] as any[]) : Promise.resolve([] as any[]),
    ids.length ? soft(db.healthConsent.findMany({ where: { coachId, scope: 'coach_view', userId: { in: ids }, revokedAt: null }, select: { userId: true } }), [] as any[]) : Promise.resolve([] as any[]),
    ids.length ? soft(db.scanSaveOptIn.findMany({ where: { userId: { in: ids } }, select: { userId: true, scope: true, granted: true, revokedAt: true } }), [] as any[]) : Promise.resolve([] as any[]),
    soft(myGroups(db, coachId, nowMs), null),
  ]);
  const shared = new Set(grants.map((g: { userId: string }) => g.userId));
  const visible = users.filter((u: any) => {
    const gates = profileGates(u.dobYear ?? null, optIns.find((o: { userId: string }) => o.userId === u.id) ?? null, now);
    return coachMaySee({ onRoster: true, coachView: shared.has(u.id), adult: gates.adult }) && gates.canSaveScan;
  });
  const sets = await setsForUsers(db, visible.map((u: { id: string }) => u.id), new Date(nowMs - COACH_DAYS * DAY_MS), nowMs);
  const slots = await slotsFor(db, { coachId }, nowMs);
  return res(200, {
    available: true,
    athletes: users.map((u: any) => ({
      id: u.id, name: nameOf(u), adult: verifiedAdult(u.dobYear ?? null, now), shares: visible.some((v: { id: string }) => v.id === u.id),
      sets: sets.filter((s) => s.userId === u.id).slice(0, 20).map(summary),
    })).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)),
    teams: (groups ?? []).filter((g) => g.kind === 'team' && (g.role === 'owner' || g.role === 'coach')).map((g) => ({ id: g.id, name: g.name })),
    slots: slots.map((s) => ({ sessionExerciseId: s.sessionExerciseId, clientId: s.clientId, client: nameOf(users.find((u: { id: string }) => u.id === s.clientId)), session: s.session, name: s.name, lift: s.lift, dose: `${s.sets} × ${s.reps} @ ${s.load}`, target: s.target })),
  });
}

/** One team the coach runs: the members who share measured numbers, each one's latest sets. */
export async function teamBoard(db: VbtDb, coachId: string, teamId: string, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  if (typeof teamId !== 'string' || !teamId || teamId.length > 64) return res(400, { error: 'bad_team' });
  const [g, me] = await Promise.all([groupById(db, teamId, nowMs), membership(db, teamId, coachId, nowMs)]);
  if (!g || g.kind !== 'team' || !me || (me.role !== 'owner' && me.role !== 'coach')) return res(403, { error: 'not_your_team' });
  const rows = (await members(db, teamId, nowMs)) ?? [];
  const ids = rows.map((r) => r.userId).filter((id) => id !== coachId);
  const [users, optIns] = await Promise.all([
    ids.length ? soft(db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, dobYear: true } }), [] as any[]) : Promise.resolve([] as any[]),
    ids.length ? soft(db.scanSaveOptIn.findMany({ where: { userId: { in: ids } }, select: { userId: true, scope: true, granted: true, revokedAt: true } }), [] as any[]) : Promise.resolve([] as any[]),
  ]);
  // the groups lane's rule for measured numbers on a group: an adult who can save AND turned on "share measured"
  const sharing = rows.filter((r) => {
    const u = users.find((x: { id: string }) => x.id === r.userId);
    const gates = profileGates(u?.dobYear ?? null, optIns.find((o: { userId: string }) => o.userId === r.userId) ?? null, now);
    return r.userId !== coachId && gates.adult && gates.canSaveScan && r.shareMeasured;
  }).map((r) => r.userId);
  const sets = await setsForUsers(db, sharing, new Date(nowMs - 14 * DAY_MS), nowMs);
  return res(200, {
    team: { id: g.id, name: g.name }, hidden: ids.length - sharing.length,
    members: sharing.map((id) => {
      const mine = sets.filter((s) => s.userId === id);
      return { id, name: (users.find((u: { id: string }) => u.id === id)?.name ?? 'Athlete').split(' ')[0], latest: mine.slice(0, 3).map(summary), lowDays: mine.filter((s) => s.band === 'low').length };
    }),
  });
}

/** PUT { sessionExerciseId, zone, lossStopPct? } or { sessionExerciseId, clear: true } — on the coach's own program only. */
export async function setZone(db: VbtDb, coachId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const se = b.sessionExerciseId;
  if (typeof se !== 'string' || !se || se.length > 64) return res(400, { error: 'bad_slot' });
  const row = await soft(db.sessionExercise.findUnique({ where: { id: se }, select: { session: { select: { block: { select: { program: { select: { coachId: true } } } } } } } }), null);
  if (row?.session?.block?.program?.coachId !== coachId) return res(403, { error: 'not_your_program' });
  if (!(await vbtReady(db, nowMs))) return res(503, { error: 'vbt_not_ready' });
  if (b.clear === true) return (await clearTarget(db, coachId, se, nowMs)) ? res(200, { ok: true, target: null }) : res(500, { error: 'not_saved' });
  if (!isZoneId(b.zone)) return res(400, { error: 'bad_zone' });
  const lossStopPct = clampStop(typeof b.lossStopPct === 'number' ? b.lossStopPct : null);
  const ok = await setTarget(db, coachId, { sessionExerciseId: se, zone: b.zone, lossStopPct }, nowMs);
  return ok ? res(200, { ok: true, target: { sessionExerciseId: se, zone: b.zone, lossStopPct } }) : res(500, { error: 'not_saved' });
}

