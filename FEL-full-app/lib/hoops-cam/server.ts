// lib/hoops-cam/server.ts — BBS-04 (2026-11-03): the shot tracker's kept sessions and the coach's shot charts, built dark
// on the VBT pattern (lib/vbt/server.ts): the same gates, the same pending-SQL seam, the same team rule.
//
//   saveSession   POST   /api/hoops-cam/sessions   one session's NUMBERS (never a frame). The route runs the movement-save
//                                                  gate FIRST (canSaveScanNumbers: verified 18+ AND opted in; row 1o of
//                                                  SCAN_SAVE_ROUTES), so a teen never reaches this.
//   deleteAll     DELETE /api/hoops-cam/sessions   every session of the athlete's own (taking your data back needs no age)
//   coachShots    GET    /api/coach/shots          the coach's roster athletes: a chart for each one who shares (live
//                                                  roster + live coach_view + verified adult + live save opt-in, the
//                                                  readiness check's coachMaySee); anyone else a name and nothing else;
//                                                  plus the teams the coach runs
//   teamShots     GET    /api/coach/shots?team=    one team the coach runs: a chart for each member who is an adult, can
//                                                  save and turned on "share measured" (the groups lane's rule); the rest
//                                                  are counted, never named with numbers
// Before prisma/pending/2026-11-03-hoops-cam.sql is applied: GETs answer { available: false } (the panel stays dark), POST
// and DELETE 503. Nothing 500s.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { coachMaySee } from '@/lib/coach/readiness/gate';
import { profileGates } from '@/lib/profile-v2/gate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { groupById, members, membership, myGroups } from '@/lib/groups/store';
import { athleteShots, type AthleteShots } from './coach';
import { cleanSession } from './log';
import { deleteSessions, hoopsReady, keepSession, sessionsForUsers, type RawDb } from './store';

const DAY_MS = 86_400_000;
/** (new) How far back a coach sees a client's sessions: 28 days (the VBT coach view's window). */
export const COACH_DAYS = 28;
/** (new) How far back a team's charts reach: 14 days (the VBT team view's window). */
export const TEAM_DAYS = 14;

export type HoopsDb = RawDb & Pick<PrismaClient, 'coachClient' | 'user' | 'healthConsent' | 'scanSaveOptIn'>;

export interface Res { status: number; body: Record<string, unknown> }
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const soft = <T,>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);
const nameOf = (u: { name?: string | null; email?: string | null } | null | undefined) => u?.name ?? u?.email?.split('@')[0] ?? 'Athlete';

// ── the athlete ──────────────────────────────────────────────────────────────────────────────────────────────────

/** POST: one session. The route has already run canSaveScanNumbers (a verified adult who opted in). */
export async function saveSession(db: HoopsDb, userId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const s = cleanSession(body);
  if (!s) return res(400, { error: 'bad_session', saved: false });
  if (s.kind === 'shots' ? s.shots.length === 0 : s.count === 0) return res(400, { error: 'empty_session', saved: false });
  const id = await keepSession(db, userId, s, now.getTime());
  return id ? res(200, { saved: true, id }) : res(503, { error: 'hoopscam_not_ready', saved: false });
}

export async function deleteAll(db: HoopsDb, userId: string, now: Date = new Date()): Promise<Res> {
  return (await deleteSessions(db, userId, now.getTime())) ? res(200, { deleted: true }) : res(503, { error: 'hoopscam_not_ready' });
}

/** Whether a saved session would be kept on the server for this athlete (the page asks before it offers to). */
export async function serverKeeps(db: HoopsDb, canSave: boolean, now: Date = new Date()): Promise<boolean> {
  return canSave && (await hoopsReady(db, now.getTime()));
}

// ── the coach ────────────────────────────────────────────────────────────────────────────────────────────────────

async function chartsFor(db: HoopsDb, ids: readonly string[], days: number, nowMs: number): Promise<Map<string, AthleteShots>> {
  const rows = await sessionsForUsers(db, ids, new Date(nowMs - days * DAY_MS), nowMs);
  const out = new Map<string, AthleteShots>();
  for (const id of ids) out.set(id, athleteShots(rows.filter((r) => r.userId === id).map((r) => r.session)));
  return out;
}

export async function coachShots(db: HoopsDb, coachId: string, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await hoopsReady(db, nowMs))) return res(200, { available: false });
  const links = await soft(db.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true } }), [] as { clientId: string }[]);
  const ids = [...new Set(links.map((l) => l.clientId))];
  const [users, grants, optIns, groups] = await Promise.all([
    ids.length ? soft(db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, dobYear: true } }), [] as { id: string; name: string | null; email: string | null; dobYear: number | null }[]) : Promise.resolve([]),
    ids.length ? soft(db.healthConsent.findMany({ where: { coachId, scope: 'coach_view', userId: { in: ids }, revokedAt: null }, select: { userId: true } }), [] as { userId: string }[]) : Promise.resolve([]),
    ids.length ? soft(db.scanSaveOptIn.findMany({ where: { userId: { in: ids } }, select: { userId: true, scope: true, granted: true, revokedAt: true } }), [] as { userId: string; scope: string; granted: boolean; revokedAt: Date | null }[]) : Promise.resolve([]),
    soft(myGroups(db, coachId, nowMs), null),
  ]);
  const shared = new Set(grants.map((g) => g.userId));
  const visible = users.filter((u) => {
    const gates = profileGates(u.dobYear ?? null, optIns.find((o) => o.userId === u.id) ?? null, now);
    return coachMaySee({ onRoster: true, coachView: shared.has(u.id), adult: gates.adult }) && gates.canSaveScan;
  }).map((u) => u.id);
  const charts = await chartsFor(db, visible, COACH_DAYS, nowMs);
  return res(200, {
    available: true, days: COACH_DAYS,
    athletes: users.map((u) => ({
      id: u.id, name: nameOf(u), adult: verifiedAdult(u.dobYear ?? null, now), shares: visible.includes(u.id),
      shots: charts.get(u.id) ?? null,
    })).sort((a, b) => a.name.localeCompare(b.name)),
    teams: (groups ?? []).filter((g) => g.kind === 'team' && (g.role === 'owner' || g.role === 'coach')).map((g) => ({ id: g.id, name: g.name })),
  });
}

/** One team the coach runs: a chart for each member who shares measured numbers; the others counted. */
export async function teamShots(db: HoopsDb, coachId: string, teamId: string, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  if (typeof teamId !== 'string' || !teamId || teamId.length > 64) return res(400, { error: 'bad_team' });
  if (!(await hoopsReady(db, nowMs))) return res(200, { available: false });
  const [g, me] = await Promise.all([groupById(db, teamId, nowMs), membership(db, teamId, coachId, nowMs)]);
  if (!g || g.kind !== 'team' || !me || (me.role !== 'owner' && me.role !== 'coach')) return res(403, { error: 'not_your_team' });
  const rows = (await members(db, teamId, nowMs)) ?? [];
  // the athletes: a team's coaches and owner run it, they are not charted
  const athletes = rows.filter((r) => r.userId !== coachId && r.role === 'member');
  const ids = athletes.map((r) => r.userId);
  const [users, optIns] = await Promise.all([
    ids.length ? soft(db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, dobYear: true } }), [] as { id: string; name: string | null; dobYear: number | null }[]) : Promise.resolve([]),
    ids.length ? soft(db.scanSaveOptIn.findMany({ where: { userId: { in: ids } }, select: { userId: true, scope: true, granted: true, revokedAt: true } }), [] as { userId: string; scope: string; granted: boolean; revokedAt: Date | null }[]) : Promise.resolve([]),
  ]);
  // the groups lane's rule for measured numbers on a group: an adult who can save AND turned on "share measured"
  const sharing = athletes.filter((r) => {
    const u = users.find((x) => x.id === r.userId);
    const gates = profileGates(u?.dobYear ?? null, optIns.find((o) => o.userId === r.userId) ?? null, now);
    return gates.adult && gates.canSaveScan && r.shareMeasured;
  }).map((r) => r.userId);
  const charts = await chartsFor(db, sharing, TEAM_DAYS, nowMs);
  return res(200, {
    available: true, days: TEAM_DAYS, team: { id: g.id, name: g.name }, hidden: ids.length - sharing.length,
    members: sharing.map((id) => ({ id, name: (users.find((u) => u.id === id)?.name ?? 'Athlete').split(' ')[0], shots: charts.get(id)! }))
      .sort((a, b) => b.shots.total.taken - a.shots.total.taken || a.name.localeCompare(b.name)),
  });
}
