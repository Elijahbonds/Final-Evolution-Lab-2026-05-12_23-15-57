// lib/coach/schedule/server.ts — COACH-DELIVERY COA-05 (2026-10-26): roster sessions on a calendar, the IO half.
//
//   scheduleBoard  GET   /api/coach/schedule            the coach's calendar (yesterday → 4 weeks), who each session reaches,
//                                                       the roster and teams, the feed link
//   scheduleAct    POST  /api/coach/schedule            { action: 'create' | 'update' | 'cancel' } | { action: 'feed_on' |
//                                                       'feed_reset' | 'feed_off' } (the feed is per person: their coaching
//                                                       calendar and their own sessions as an athlete, one link)
//   mySchedule     GET   /api/coach/me/schedule         an athlete's upcoming sessions from their live coaches
//   feedIcs        GET   /api/coach/schedule/feed/<token>.ics   the .ics feed (no session: the signed link is the access)
//
// GATES: a coach writes only their own sessions, for their live roster or a team they run (lib/coach/parity/people.ts
// mayAssign); an athlete sees only sessions from a LIVE coach that reach them (the whole roster, them, or a team of theirs),
// and only past the teen gate (lib/coach/teenGateServer.ts: coached training, fails closed for every teen today).
import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { calendarFeedIcs, type FeedEvent } from '@/lib/coach-store/ics';
import type { BusyRange } from '@/lib/coach-store/slots';
import { readTeenGate } from '../teenGateServer';
import { teenGateBody } from '../teenGate';
import { coachPeople, liveCoaches, mayAssign, teamIdsOf, type PeopleDb } from '../parity/people';
import { deliveryReady, NOT_READY, res, type Res } from '../delivery/probe';
import { cleanSession, clashWith, endOf, LIMITS, reaches, type CleanSession } from './rules';
import { cancelSession, dropFeed, feedNonce, insertSession, sessionsForCoach, sessionsForCoaches, setFeedNonce, updateSession, type SessionRow } from './store';
import { feedPath, feedToken, newFeedNonce, readFeedToken } from './feedToken';

export type ScheduleDb = PeopleDb & Partial<Pick<PrismaClient, 'instructor' | 'booking'>>;

const DAY = 86_400_000;
const soft = <T,>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);

const view = (s: SessionRow) => ({ id: s.id, title: s.title, startsAt: s.startsAt.toISOString(), endsAt: endOf(s).toISOString(), minutes: s.minutes, place: s.place, scope: s.scope, scopeId: s.scopeId, cancelled: !!s.cancelledAt });

/** The feed link is a bearer key a calendar app holds with no session, so only a verified adult may have one: a leaked
 *  teen link would say where and when a minor will be, whatever their guardian has consented to. Fails closed. */
async function feedAllowed(db: ScheduleDb, userId: string, nowMs: number): Promise<boolean> {
  const g = await readTeenGate(db, userId, new Date(nowMs));
  return g.ok && g.band === 'adult';
}

async function feedState(db: ScheduleDb, userId: string, nowMs: number) {
  const nonce = await feedNonce(db, userId, nowMs);
  const token = nonce ? feedToken(userId, nonce) : null;
  return { on: !!token, path: token ? feedPath(token) : null };
}

/** The coach's busy ranges near a session: their other sessions, and their HELD/PAID store bookings (slotCheck's rule). */
async function busyNear(db: ScheduleDb, coachId: string, s: CleanSession, exceptId: string | null, nowMs: number): Promise<BusyRange[]> {
  const from = new Date(s.startsAt.getTime() - DAY), to = new Date(endOf(s).getTime() + DAY);
  const mine = ((await sessionsForCoach(db, coachId, from, to, nowMs)) ?? []).filter((x) => !x.cancelledAt && x.id !== exceptId).map((x) => ({ startsAt: x.startsAt, endsAt: endOf(x) }));
  if (!db.instructor || !db.booking) return mine;
  const inst = await soft(db.instructor.findUnique({ where: { userId: coachId }, select: { id: true } }), null);
  if (!inst) return mine;
  const bookings = await soft(db.booking.findMany({
    where: { instructorId: inst.id, slotLock: { not: null }, status: { in: ['HELD', 'PAID'] }, startsAt: { lt: to }, endsAt: { gt: from } },
    select: { startsAt: true, endsAt: true },
  }), [] as { startsAt: Date | null; endsAt: Date | null }[]);
  return [...mine, ...bookings.flatMap((b) => (b.startsAt && b.endsAt ? [{ startsAt: b.startsAt, endsAt: b.endsAt }] : []))];
}

// ── the coach ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function scheduleBoard(db: ScheduleDb, coachId: string, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await deliveryReady(db, nowMs))) return res(200, { available: false });
  const [sessions, people, feed] = await Promise.all([
    sessionsForCoach(db, coachId, new Date(nowMs - DAY), new Date(nowMs + 28 * DAY), nowMs), coachPeople(db, coachId, now), feedState(db, coachId, nowMs),
  ]);
  if (!sessions) return res(200, { available: false });
  const reachLine = (s: SessionRow) => s.scope === 'roster' ? 'Whole roster' : s.scope === 'team' ? people.teams.find((t) => t.id === s.scopeId)?.name ?? 'A team you no longer run'
    : people.roster.find((r) => r.id === s.scopeId)?.name ?? 'No longer on your roster';
  return res(200, {
    available: true, sessions: sessions.map((s) => ({ ...view(s), reaches: reachLine(s) })), feed,
    roster: people.roster.map((r) => ({ id: r.id, name: r.name })), teams: people.teams.map((t) => ({ id: t.id, name: t.name })),
  });
}

export async function scheduleAct(db: ScheduleDb, userId: string, body: unknown, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!(await deliveryReady(db, nowMs))) return NOT_READY;
  if (b.action === 'feed_on' || b.action === 'feed_reset') {
    if (!(await feedAllowed(db, userId, nowMs))) return res(403, { error: 'feed_adults_only' });
    const have = b.action === 'feed_on' ? await feedNonce(db, userId, nowMs) : null;
    if (!have && !(await setFeedNonce(db, userId, newFeedNonce(), nowMs))) return res(500, { error: 'not_saved' });
    const feed = await feedState(db, userId, nowMs);
    return feed.on ? res(200, { ok: true, feed }) : res(503, { error: 'feed_unavailable' });
  }
  if (b.action === 'feed_off') return (await dropFeed(db, userId, nowMs)) ? res(200, { ok: true, feed: { on: false, path: null } }) : NOT_READY;
  if (b.action === 'cancel') {
    if (typeof b.id !== 'string' || !b.id) return res(400, { error: 'bad_id' });
    return (await cancelSession(db, b.id, userId, nowMs)) ? res(200, { ok: true }) : res(404, { error: 'not_found' });
  }
  if (b.action !== 'create' && b.action !== 'update') return res(400, { error: 'unknown_action' });
  const c = cleanSession(b, now);
  if (!c.ok) return res(400, { error: c.error });
  if (c.s.scope !== 'roster') {
    const people = await coachPeople(db, userId, now);
    if (!mayAssign(people, c.s.scope, c.s.scopeId)) return res(403, { error: c.s.scope === 'team' ? 'not_your_team' : 'not_your_athlete' });
  }
  const id = b.action === 'update' ? (typeof b.id === 'string' && b.id ? b.id : null) : null;
  if (b.action === 'update' && !id) return res(400, { error: 'bad_id' });
  const clash = clashWith(c.s, await busyNear(db, userId, c.s, id, nowMs));
  if (clash) return res(409, { error: 'clash', with: { startsAt: clash.startsAt.toISOString(), endsAt: clash.endsAt.toISOString() } });
  if (id) return (await updateSession(db, id, userId, c.s, nowMs)) ? res(200, { ok: true, id }) : res(404, { error: 'not_found' });
  const upcoming = (await sessionsForCoach(db, userId, now, new Date(nowMs + LIMITS.daysAhead * DAY), nowMs)) ?? [];
  if (upcoming.filter((s) => !s.cancelledAt).length >= LIMITS.perCoachUpcoming) return res(409, { error: 'too_many_sessions' });
  const newId = await insertSession(db, userId, c.s, nowMs);
  return newId ? res(201, { ok: true, id: newId }) : res(500, { error: 'not_saved' });
}

// ── the athlete ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The sessions that reach this athlete from their live coaches, in [from, to). null = the tables are not there. */
async function athleteSessions(db: ScheduleDb, athleteId: string, from: Date, to: Date, nowMs: number): Promise<{ rows: (SessionRow & { coachName: string })[] } | { blocked: ReturnType<typeof teenGateBody> } | null> {
  const coaches = await liveCoaches(db, athleteId);
  if (!coaches.length) return (await deliveryReady(db, nowMs)) ? { rows: [] } : null;
  const gate = await readTeenGate(db, athleteId, new Date(nowMs));
  if (!gate.ok) return { blocked: teenGateBody(gate.error) };
  const rows = await sessionsForCoaches(db, coaches.map((c) => c.coachId), from, to, nowMs);
  if (!rows) return null;
  const teams = await teamIdsOf(db, athleteId, nowMs);
  return { rows: rows.filter((s) => reaches(s, athleteId, teams)).map((s) => ({ ...s, coachName: coaches.find((c) => c.coachId === s.coachId)?.name ?? 'Your coach' })) };
}

export async function mySchedule(db: ScheduleDb, athleteId: string, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const r = await athleteSessions(db, athleteId, new Date(nowMs - 2 * 3_600_000), new Date(nowMs + 28 * DAY), nowMs);
  if (!r) return res(200, { available: false });
  if ('blocked' in r) return res(200, { available: true, sessions: [], blocked: r.blocked });
  return res(200, { available: true, sessions: r.rows.map((s) => ({ ...view(s), coachName: s.coachName })), feed: await feedState(db, athleteId, nowMs) });
}

/** The .ics text for a feed link, or null (bad link, reset, feed off, tables not there). */
export async function feedIcs(db: ScheduleDb, token: string, now: Date = new Date()): Promise<string | null> {
  const nowMs = now.getTime();
  if (!(await deliveryReady(db, nowMs))) return null;
  const userId = await readFeedToken(token, (id) => feedNonce(db, id, nowMs));
  if (!userId || !(await feedAllowed(db, userId, nowMs))) return null;
  const from = new Date(nowMs - 30 * DAY), to = new Date(nowMs + 180 * DAY);
  const [own, asAthlete] = await Promise.all([sessionsForCoach(db, userId, from, to, nowMs), athleteSessions(db, userId, from, to, nowMs)]);
  const events: FeedEvent[] = [
    ...(own ?? []).map((s) => ({ uid: s.id, startsAt: s.startsAt, endsAt: endOf(s), title: s.title, place: s.place, cancelled: !!s.cancelledAt, updatedAt: s.updatedAt })),
    ...(asAthlete && 'rows' in asAthlete ? asAthlete.rows : []).map((s) => ({ uid: `${s.id}-a`, startsAt: s.startsAt, endsAt: endOf(s), title: `${s.title} (${s.coachName})`, place: s.place, cancelled: !!s.cancelledAt, updatedAt: s.updatedAt })),
  ];
  return calendarFeedIcs({ name: 'FEL coaching', events, now });
}
