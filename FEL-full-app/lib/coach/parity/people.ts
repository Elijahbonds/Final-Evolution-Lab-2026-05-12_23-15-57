// lib/coach/parity/people.ts — COACH-PARITY (2026-10-26): the reads check-ins and habits share — who coaches this athlete,
// which teams they are on, who this coach may assign to, and who the athlete is under the gates. Every rule is one the app
// already has; this file only reads the rows those rules need.
//
//   · an ATHLETE's coaches = their live CoachClient rows (endedAt null). A form or habit from anyone else never reaches them.
//   · a TEAM counts only while its member is on the coach's live roster (docs/COACH-LOOP.md §3, kept in code by the teams
//     lane): an assignment to a team reaches a member only through a live coach link.
//   · the ANSWERER: lib/coach/teenGateServer.ts readTeenGate (adult, or a teen with the guardian's coach-training consent;
//     anyone else may not save coached training at all — fails closed today, COACH_TRAINING_CONSENT_SINCE), then the
//     health rules: lib/privacy/healthWriteGate.ts canWriteHealthData (verified 18+ from the DB) and lib/health/consent.ts
//     activeHealthDataConsent (a live health_data grant). The health switch (COACH_PARITY_HEALTH_ENABLED) sits in front.
//   · what a COACH sees of health answers: the readiness rule (lib/coach/readiness/gate.ts coachMaySee) — on the live
//     roster, a live coach_view grant from that athlete to THAT coach, and a verified adult.
import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { myGroups, members } from '@/lib/groups/store';
import { readTeenGate } from '../teenGateServer';
import { teenGateBody, type TeenGateRefusal } from '../teenGate';
import { coachMaySee } from '../readiness/gate';
import { canWriteHealthData } from '@/lib/privacy/healthWriteGate';
import type { GateDb } from '@/lib/privacy/scanSaveGate';
import { activeHealthDataConsent, type ConsentRow } from '@/lib/health/consent';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import type { RawDb } from './probe';

export type PeopleDb = RawDb & Pick<PrismaClient, 'coachClient' | 'user' | 'guardianConsent' | 'healthConsent'>;

const nameOf = (u: { name: string | null; email: string | null } | null | undefined) => u?.name ?? u?.email?.split('@')[0] ?? 'Athlete';
const soft = <T,>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);

/** The athlete's live coaches, with the name the card shows. */
export async function liveCoaches(db: PeopleDb, athleteId: string): Promise<{ coachId: string; name: string }[]> {
  const links = await soft(db.coachClient.findMany({ where: { clientId: athleteId, endedAt: null }, select: { coachId: true, coach: { select: { name: true, email: true } } } }), []);
  const seen = new Map<string, string>();
  for (const l of links) if (!seen.has(l.coachId)) seen.set(l.coachId, nameOf(l.coach));
  return [...seen].map(([coachId, name]) => ({ coachId, name }));
}

/** The teams (not squads) this athlete is on; [] when the teams tables are not there. */
export async function teamIdsOf(db: PeopleDb, athleteId: string, now: number): Promise<string[]> {
  const g = await soft(myGroups(db, athleteId, now), null);
  return (g ?? []).filter((x) => x.kind === 'team').map((x) => x.id);
}

export interface RosterAthlete { id: string; name: string; adult: boolean }
export interface CoachTeam { id: string; name: string; memberIds: string[] }

/** The coach's live roster (who they may assign to) and the teams they run, each team's members cut to that roster. */
export async function coachPeople(db: PeopleDb, coachId: string, now: Date): Promise<{ roster: RosterAthlete[]; teams: CoachTeam[] }> {
  const links = await soft(db.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true } }), []);
  const ids = [...new Set(links.map((l) => l.clientId))];
  const users = ids.length ? await soft(db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, dobYear: true } }), []) : [];
  const roster = users.map((u) => ({ id: u.id, name: nameOf(u), adult: verifiedAdult(u.dobYear ?? null, now) })).sort((a, b) => a.name.localeCompare(b.name));
  const onRoster = new Set(roster.map((r) => r.id));
  const groups = (await soft(myGroups(db, coachId, now.getTime()), null)) ?? [];
  const teams: CoachTeam[] = [];
  for (const g of groups.filter((x) => x.kind === 'team' && (x.role === 'owner' || x.role === 'coach'))) {
    const m = (await soft(members(db, g.id, now.getTime()), null)) ?? [];
    teams.push({ id: g.id, name: g.name, memberIds: m.map((x) => x.userId).filter((id) => onRoster.has(id)) });
  }
  return { roster, teams };
}

/** May this coach assign to this scope? A live roster athlete, or a team they own or coach. */
export function mayAssign(people: { roster: RosterAthlete[]; teams: CoachTeam[] }, scope: unknown, scopeId: unknown): scope is 'athlete' | 'team' {
  if (typeof scopeId !== 'string' || !scopeId || scopeId.length > 64) return false;
  if (scope === 'athlete') return people.roster.some((r) => r.id === scopeId);
  if (scope === 'team') return people.teams.some((t) => t.id === scopeId);
  return false;
}

export type Who =
  | { ok: true; band: 'adult' | 'teen'; adult: boolean; healthShown: boolean; healthConsent: boolean }
  | { ok: false; error: TeenGateRefusal; body: ReturnType<typeof teenGateBody> };

/** The health-write age check (lib/privacy/healthWriteGate.ts canWriteHealthData). A WRITE route passes its own
 *  `() => canWriteHealthData(prisma, userId)` so the check sits in the route file, where HEALTH_WRITE_ROUTES g and h
 *  find it (COACH-DELIVERY, 2026-10-27); a read uses the same call made here. Asked only for an adult band, as before. */
export type HealthGate = () => Promise<boolean>;

/** The athlete under the gates (see the header). `healthEnabled` is the switch. */
export async function whoIs(db: PeopleDb, athleteId: string, healthEnabled: boolean, now: Date = new Date(), healthGate?: HealthGate): Promise<Who> {
  const g = await readTeenGate(db, athleteId, now);
  if (!g.ok) return { ok: false, error: g.error, body: teenGateBody(g.error) };
  const adult = g.band === 'adult' && (await (healthGate ? healthGate() : canWriteHealthData(db as unknown as GateDb, athleteId)));
  let healthConsent = false;
  if (adult && healthEnabled) {
    const rows = await soft(db.healthConsent.findMany({ where: { userId: athleteId, scope: 'health_data' }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }), []);
    healthConsent = !!activeHealthDataConsent(rows as ConsentRow[]);
  }
  return { ok: true, band: g.band, adult, healthShown: adult && healthEnabled, healthConsent };
}

/** The roster athletes who share their health with THIS coach (coachMaySee). */
export async function healthViewers(db: PeopleDb, coachId: string, roster: readonly RosterAthlete[]): Promise<Set<string>> {
  if (!roster.length) return new Set();
  const grants = await soft(db.healthConsent.findMany({ where: { coachId, scope: 'coach_view', userId: { in: roster.map((r) => r.id) }, revokedAt: null }, select: { userId: true } }), []);
  const shared = new Set(grants.map((g) => g.userId));
  return new Set(roster.filter((r) => coachMaySee({ onRoster: true, coachView: shared.has(r.id), adult: r.adult })).map((r) => r.id));
}
