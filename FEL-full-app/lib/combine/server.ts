// lib/combine/server.ts — COMBINE-DAY (2026-10-25): the server side. Reads the coach's roster under the existing gates,
// saves a combine's numbers, and answers each athlete with their own. Every function answers { status, body }, so a
// route is three lines and exports nothing but its handlers (tests/route-exports.test.ts).
//
// BEFORE THE PENDING SQL IS APPLIED: the roster read still works (CoachClient, User and GuardianConsent are live), so
// GET /api/coach/combine returns the athletes and their gates with { available: false } and the coach runs the combine
// as a draft on the phone; every write answers 503 combine_not_ready; the athlete's page says "coming soon".
//
// THE GATES, AND WHERE THEY RUN (lib/combine/gate.ts says which rule is which):
//   · who is on a combine: the coach's LIVE roster only (CoachClient, endedAt null), each through the team gate; a team
//     only narrows the pick to its members who are also on that roster (COACH-LOOP §3's rule, as lib/groups does);
//   · what is kept: re-decided here on every save from fresh rows — never from the client's flags;
//   · what the coach reads back: athletes still on the live roster, and a camera number only while that athlete still
//     passes the save gate (a revoked opt-in hides it), as lib/groups checks each member again on the way out;
//   · what an athlete reads: their own rows only; the group is used to place them, and no other athlete leaves the server.
import { athleteAccess, canKeepOnServer, heldToday } from './gate';
import { HELD_TODAY, todayHolds, type TodayHolds } from './today';
import { loadWarmupContext, type WarmupDb } from '@/lib/coach/warmupServer';
import { FALLBACK_WARMUP_CONTEXT } from '@/lib/coach/warmup';
import { STATIONS, parseStations, type StationConfig } from './catalogue';
import { CAMERA_TIMES_SAVED } from '@/lib/sprint/cameraSprint';
import { cleanName, cleanSlots, MAX_ATHLETES } from './draft';
import { bestOf, cleanWeights, rankValues } from './score';
import * as store from './store';
import { members as groupMembers, myGroups } from '@/lib/groups/store';
import { COMING_SOON_LINE } from './copy';
import type { CombineAthlete, ResultGrid, Slots } from './types';

/** The Prisma calls this file makes (structural, so a test's fake fits), plus the two raw calls of the store. */
export interface CombineDb extends store.RawDb {
  coachClient: { findMany(a: unknown): Promise<any[]> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  user: { findMany(a: unknown): Promise<any[]> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  guardianConsent: { findMany(a: unknown): Promise<any[]> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Res { status: number; body: Record<string, unknown> }
const ok = (body: Record<string, unknown>): Res => ({ status: 200, body });
const err = (status: number, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { error, ...extra } });
export const NOT_READY: Res = err(503, 'combine_not_ready', { message: COMING_SOON_LINE });
const NOT_FOUND: Res = err(404, 'not_found');
const fromWrite = (w: store.Write<unknown>): Res | null => (w.ok ? null : w.error === 'not_ready' ? NOT_READY : err(500, 'write_failed'));
const soft = <T>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);

const displayName = (name: unknown, i: number): string => {
  const n = cleanName(typeof name === 'string' && !name.includes('@') ? name : '');
  return n || `Athlete ${i + 1}`;
};

/**
 * THE JUMP GATE today for one athlete: the warm-up's own reader (loadWarmupContext) through the drills page's verdict
 * (lib/combine/today.ts). A read that fails is the careful context (FALLBACK_WARMUP_CONTEXT), as /play/drills does.
 */
export async function todayFor(db: CombineDb, athleteId: string, now: Date): Promise<TodayHolds> {
  const ctx = await loadWarmupContext(db as unknown as WarmupDb, athleteId, now).catch(() => FALLBACK_WARMUP_CONTEXT);
  return todayHolds(ctx);
}

/**
 * The coach's live roster, each athlete with what the gates allow. A read that fails closes the gate (no athlete).
 * `today`: also read each camera athlete's jump gate (the context, the run and a save need it; a create does not).
 */
export async function rosterAthletes(db: CombineDb, coachId: string, now: Date, today = true): Promise<CombineAthlete[]> {
  const links = await soft(db.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true } }), []);
  const ids = [...new Set((links as { clientId: string }[]).map((l) => l.clientId))].filter((id) => id !== coachId);
  if (!ids.length) return [];
  const [users, consents] = await Promise.all([
    soft(db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, dobYear: true, scanSaveOptIn: { select: { scope: true, granted: true, revokedAt: true } } } }), []),
    soft(db.guardianConsent.findMany({ where: { menteeId: { in: ids } }, select: { menteeId: true, requestedAt: true, acceptedAt: true, revokedAt: true, menteeBirthYear: true } }), []),
  ]);
  type U = { id: string; name: string | null; dobYear: number | null; scanSaveOptIn: { scope: string; granted: boolean; revokedAt: Date | null } | null };
  type C = { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null; menteeBirthYear: number | null };
  const athletes = (users as U[]).map((u, i) => {
    const input = { dobYear: u.dobYear, consents: (consents as C[]).filter((c) => c.menteeId === u.id), optIn: u.scanSaveOptIn };
    return { id: u.id, name: displayName(u.name, i), source: 'roster' as const, input, access: athleteAccess(input, now) };
  });
  // the jump gate is read only for an athlete the camera stations are open to (everyone else is held there anyway)
  const holds = await Promise.all(athletes.map((a) => (today && a.access.camera ? todayFor(db, a.id, now) : Promise.resolve(HELD_TODAY))));
  return athletes.map((a, i) => ({ id: a.id, name: a.name, source: a.source, access: athleteAccess(a.input, now, holds[i]) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The teams the coach runs (owner or coach), each as its members on the coach's live roster. Before the teams SQL: none. */
async function coachTeams(db: CombineDb, coachId: string, roster: readonly CombineAthlete[], now: number): Promise<{ id: string; name: string; athleteIds: string[] }[]> {
  const groups = await soft(myGroups(db, coachId, now), null);
  const teams = (groups ?? []).filter((g) => g.kind === 'team' && (g.role === 'owner' || g.role === 'coach'));
  const onRoster = new Set(roster.map((a) => a.id));
  return Promise.all(teams.map(async (t) => {
    const rows = (await soft(groupMembers(db, t.id, now), null)) ?? [];
    return { id: t.id, name: t.name, athleteIds: rows.filter((m) => m.role === 'member' && onRoster.has(m.userId)).map((m) => m.userId) };
  }));
}

/** GET /api/coach/combine: the roster with its gates, the teams, and the coach's saved combines. */
export async function combineContext(db: CombineDb, coachId: string, now = new Date()): Promise<Res> {
  const t = now.getTime();
  const athletes = await rosterAthletes(db, coachId, now);
  const [available, teams] = await Promise.all([store.combineReady(db, t), coachTeams(db, coachId, athletes, t)]);
  const events = available ? ((await store.eventsForCoach(db, coachId, t)) ?? []) : [];
  return ok({ available, athletes, teams, events });
}

/** A request body's combine: a name, the stations, the weights, the team and the athletes, every one checked. */
function parseSetup(body: unknown, roster: readonly CombineAthlete[], teams: readonly { id: string }[]) {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const stations = parseStations(b.stations);
  const testable = new Set(roster.filter((a) => a.access.testable).map((a) => a.id));
  const athleteIds = [...new Set((Array.isArray(b.athleteIds) ? b.athleteIds : []).filter((x): x is string => typeof x === 'string' && testable.has(x)))].slice(0, MAX_ATHLETES);
  const teamId = typeof b.teamId === 'string' && teams.some((x) => x.id === b.teamId) ? b.teamId : null;
  return { name: cleanName(b.name, 'Combine'), stations, weights: cleanWeights(b.weights, stations), teamId, athleteIds };
}

/** POST /api/coach/combine: save a combine (made on the phone) to the account. */
export async function createCombine(db: CombineDb, coachId: string, body: unknown, now = new Date()): Promise<Res> {
  const t = now.getTime();
  if (!(await store.combineReady(db, t))) return NOT_READY;
  const roster = await rosterAthletes(db, coachId, now, false);
  const teams = await coachTeams(db, coachId, roster, t);
  const s = parseSetup(body, roster, teams);
  if (!s.stations.length) return err(400, 'no_stations');
  if (!s.athleteIds.length) return err(400, 'no_athletes');
  const w = await store.createEvent(db, { coachId, name: s.name, teamId: s.teamId, stations: s.stations, weights: s.weights, athleteIds: s.athleteIds }, t);
  if (!w.ok) return fromWrite(w)!;
  return ok({ id: w.value });
}

/** Stored rows → the grid, for the athletes and stations given; `keep` decides which rows may be shown. */
function gridOf(rows: readonly store.StoredResult[], athletes: readonly CombineAthlete[], stations: readonly StationConfig[], keep: (a: CombineAthlete, st: StationConfig) => boolean): ResultGrid {
  const grid: ResultGrid = {};
  for (const a of athletes) {
    for (const st of stations) {
      if (!keep(a, st)) continue;
      const mine = rows.filter((r) => r.athleteId === a.id && r.stationId === st.id && r.attempt <= st.attempts);
      if (!mine.length) continue;
      const slots: Slots = Array.from({ length: st.attempts }, () => null);
      // a camera-timed sprint or 5-10-5 attempt is shown only while saving them is on and the athlete passes the camera gate
      for (const r of mine.filter((x) => STATIONS[st.kind].method !== 'hand' || x.method !== 'camera' || (CAMERA_TIMES_SAVED && a.access.saveCamera))) slots[r.attempt - 1] = { value: r.value, at: r.recordedAt, ...(st.kind === 'approach' && r.touchCm != null ? { touchCm: r.touchCm } : {}), ...(r.method === 'camera' && (st.kind === 'sprint' || st.kind === 'agility') ? { method: 'camera' as const } : {}) };
      (grid[a.id] ??= {})[st.id] = slots;
    }
  }
  return grid;
}

/** GET /api/coach/combine/[id]: the coach's own saved combine, as the phone's draft shape. */
export async function loadCombine(db: CombineDb, coachId: string, id: string, now = new Date()): Promise<Res> {
  const t = now.getTime();
  if (!(await store.combineReady(db, t))) return ok({ available: false });
  const ev = await store.eventById(db, id, coachId, t);
  if (!ev) return NOT_FOUND;
  const [ids, rows, roster] = await Promise.all([store.entrants(db, id, t), store.resultsForEvent(db, id, t), rosterAthletes(db, coachId, now)]);
  const stations = parseStations(ev.stations);
  // still on the live roster, in the combine's order
  const athletes = (ids ?? []).flatMap((aid) => { const a = roster.find((x) => x.id === aid); return a ? [a] : []; });
  const results = gridOf(rows ?? [], athletes, stations, (a, st) => canKeepOnServer(a, st.kind));
  return ok({ available: true, event: { id: ev.id, name: ev.name, teamId: ev.teamId, stations, weights: cleanWeights(ev.weights, stations), createdAt: ev.createdAt, updatedAt: ev.updatedAt, athletes, results } });
}

/**
 * PUT /api/coach/combine/[id]: { name?, weights?, athleteIds?, results: { [athleteId]: { [stationId]: slots } } }.
 * Each slot is kept only where the gates allow it NOW; a camera number for an athlete who has not opted in is named
 * in `keptOnDevice` and not sent anywhere. A cleared slot is deleted (a redo).
 */
/** The athletes a save body names results for (at most MAX_ATHLETES): the route runs the scan-save gate on each. */
export function resultAthleteIds(body: unknown): string[] {
  const r = body && typeof body === 'object' ? (body as Record<string, unknown>).results : null;
  return r && typeof r === 'object' ? Object.keys(r).filter((k) => k.length <= 64).slice(0, MAX_ATHLETES) : [];
}

/**
 * `scanSave`: the athletes lib/privacy/scanSaveGate.ts canSaveScanNumbers said yes to, run by the route (row 1m). A camera
 * number is kept only when that AND this file's own read of the same rules (profileGates) agree.
 */
export async function saveCombine(db: CombineDb, coachId: string, id: string, body: unknown, scanSave: ReadonlySet<string>, now = new Date()): Promise<Res> {
  const t = now.getTime();
  if (!(await store.combineReady(db, t))) return NOT_READY;
  const ev = await store.eventById(db, id, coachId, t);
  if (!ev) return NOT_FOUND;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const stations = parseStations(ev.stations);
  const [entrantIds, roster] = await Promise.all([store.entrants(db, id, t), rosterAthletes(db, coachId, now)]);
  const on = new Set(entrantIds ?? []);
  const testable = roster.filter((a) => a.access.testable);

  // latecomers: on the live roster, through the gate, not yet on the combine
  const add = [...new Set((Array.isArray(b.athleteIds) ? b.athleteIds : []).filter((x): x is string => typeof x === 'string' && !on.has(x) && testable.some((a) => a.id === x)))]
    .slice(0, Math.max(0, MAX_ATHLETES - on.size));
  if (add.length) {
    const w = await store.addEntrants(db, id, add, on.size, t);
    if (!w.ok) return fromWrite(w)!;
    for (const x of add) on.add(x);
  }

  const raw = (b.results && typeof b.results === 'object' ? b.results : {}) as Record<string, Record<string, unknown>>;
  const rows: store.ResultWrite[] = [];
  const clear: { athleteId: string; stationId: string; attempt: number }[] = [];
  const keptOnDevice: { athleteId: string; stationId: string }[] = [];
  const held: { athleteId: string; stationId: string }[] = [];
  for (const [athleteId, byStation] of Object.entries(raw)) {
    const a = testable.find((x) => x.id === athleteId);
    if (!a || !on.has(athleteId) || !byStation || typeof byStation !== 'object') continue;
    for (const st of stations) {
      if (!(st.id in byStation)) continue;
      const slots = cleanSlots(byStation[st.id], st.attempts);
      // THE JUMP GATE: a station held today for this athlete takes nothing, whatever the phone sent
      if (heldToday(a, st)) {
        if (slots.some((s) => s !== null)) held.push({ athleteId, stationId: st.id });
        continue;
      }
      // SPRINT-SPEED: a camera-timed sprint or 5-10-5 attempt is a camera number: kept only as the camera stations' are
      // (a verified adult with the live opt-in, decided here and by the route's scan-save gate)
      const cameraTimed = slots.some((s) => s?.method === 'camera');
      const camera = STATIONS[st.kind].method !== 'hand' || cameraTimed;
      if (!canKeepOnServer(a, st.kind) || (cameraTimed && (!CAMERA_TIMES_SAVED || !a.access.saveCamera)) || (camera && !scanSave.has(athleteId))) {
        if (slots.some((s) => s !== null)) keptOnDevice.push({ athleteId, stationId: st.id });
        continue;
      }
      slots.forEach((s, i) => {
        if (s === null) clear.push({ athleteId, stationId: st.id, attempt: i + 1 });
        else rows.push({ athleteId, stationId: st.id, attempt: i + 1, value: s.value, touchCm: st.kind === 'approach' ? s.touchCm ?? null : null, method: s.method === 'camera' ? 'camera' : STATIONS[st.kind].method });
      });
    }
  }
  const w = await store.writeResults(db, id, rows, clear, t);
  if (!w.ok) return fromWrite(w)!;
  if (typeof b.name === 'string' || (b.weights && typeof b.weights === 'object')) {
    const u = await store.updateEvent(db, id, coachId, cleanName(b.name, ev.name), cleanWeights(b.weights ?? ev.weights, stations), t);
    if (!u.ok) return fromWrite(u)!;
  }
  return ok({ saved: w.value, keptOnDevice, heldToday: held });
}

/** DELETE /api/coach/combine/[id]: the coach's own combine and everything in it. */
export async function deleteCombine(db: CombineDb, coachId: string, id: string, now = new Date()): Promise<Res> {
  const w = await store.deleteEvent(db, id, coachId, now.getTime());
  if (!w.ok) return fromWrite(w)!;
  return w.value ? ok({ deleted: true }) : NOT_FOUND;
}

export interface MyStation { id: string; kind: StationConfig['kind']; variant: string; best: number | null; touchCm: number | null; attempts: (number | null)[]; rank: number | null; of: number }
export interface MyCombine { id: string; name: string; createdAt: number; stations: MyStation[] }

/** GET /api/combine/mine: the athlete's own combines — their numbers, and where they placed in each group. */
export async function myCombines(db: CombineDb, athleteId: string, now = new Date()): Promise<Res> {
  const t = now.getTime();
  if (!(await store.combineReady(db, t))) return ok({ available: false, events: [] });
  const events = (await store.eventsForAthlete(db, athleteId, t)) ?? [];
  const rows = (await store.resultsForEvents(db, events.map((e) => e.id), t)) ?? [];
  const out: MyCombine[] = events.map((e) => {
    const stations = parseStations(e.stations);
    const here = rows.filter((r) => r.eventId === e.id);
    const mine = stations.flatMap((st) => {
      const def = STATIONS[st.kind];
      const at = here.filter((r) => r.stationId === st.id && r.attempt <= st.attempts);
      const own = at.filter((r) => r.athleteId === athleteId).sort((x, y) => x.attempt - y.attempt);
      if (!own.length) return [];
      const slots: Slots = own.map((r) => ({ value: r.value, at: r.recordedAt }));
      const everyone = [...new Set(at.map((r) => r.athleteId))].map((aid) => ({ id: aid, value: bestOf(at.filter((r) => r.athleteId === aid).map((r) => ({ value: r.value, at: 0 })), def.better) }));
      const ranked = rankValues(everyone, def.better, def.decimals);
      const me = ranked.find((r) => r.id === athleteId);
      const touches = own.map((r) => r.touchCm).filter((x): x is number => x != null);
      return [{
        id: st.id, kind: st.kind, variant: st.variant, best: bestOf(slots, def.better), touchCm: touches.length ? Math.max(...touches) : null,
        attempts: own.map((r) => r.value), rank: me?.rank ?? null, of: ranked.filter((r) => r.rank !== null).length,
      }];
    });
    return { id: e.id, name: e.name, createdAt: e.createdAt, stations: mine };
  }).filter((e) => e.stations.length > 0);
  return ok({ available: true, events: out });
}
