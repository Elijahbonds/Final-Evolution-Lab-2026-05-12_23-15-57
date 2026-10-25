// tests/helpers/fakeCombineDb.ts — COMBINE-DAY (2026-10-25): an in-memory stand-in for the combine tables
// (prisma/pending/2026-10-25-combine-day.sql), answering lib/combine/store.ts's statements BY NAME with the keys enforced
// the way Postgres would (ON CONFLICT), plus the Prisma models the combine server reads (coachClient, user with its
// scanSaveOptIn, guardianConsent) and the groups store's myGroups / members. `tables: false` is production today: the
// probe finds nothing and every statement throws "relation does not exist".
import { SQL } from '@/lib/combine/store';
import { SQL as GROUPS_SQL } from '@/lib/groups/store';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FakeCombineDb {
  tables: boolean;
  groupsTables: boolean;
  events: Row[];
  entrants: { eventId: string; athleteId: string; position: number }[];
  results: Row[];
  users: { id: string; name: string | null; dobYear: number | null }[];
  optIns: { userId: string; scope: string; granted: boolean; revokedAt: Date | null }[];
  consents: { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null; menteeBirthYear: number }[];
  links: { coachId: string; clientId: string; endedAt: Date | null }[];
  groups: { id: string; kind: 'team' | 'squad'; ownerId: string; name: string; members: { userId: string; role: 'owner' | 'coach' | 'member' }[] }[];
  /** Every statement run, in order (the tests read what was written, and that no frame ever was). */
  log: { q: string; v: unknown[] }[];
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  coachClient: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  user: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  guardianConsent: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  scanSaveOptIn: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const missing = () => Object.assign(new Error('relation "CombineResult" does not exist'), { code: '42P01' });
const inList = (v: unknown, x: unknown) => (v && typeof v === 'object' && 'in' in (v as object) ? ((v as { in: unknown[] }).in).includes(x) : v === undefined || v === x);

export function fakeCombineDb(o: { tables?: boolean; groupsTables?: boolean } = {}): FakeCombineDb {
  const s: FakeCombineDb = {
    tables: o.tables ?? true, groupsTables: o.groupsTables ?? true,
    events: [], entrants: [], results: [], users: [], optIns: [], consents: [], links: [], groups: [], log: [],
    async $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> {
      s.log.push({ q, v });
      if (q.includes('information_schema')) {
        if (q.includes("'CombineResult'")) return (s.tables ? [{ ok: 1 }] : []) as T;
        if (q.includes("'TrainingGroupAct'")) return (s.groupsTables ? [{ ok: 1 }] : []) as T;
        return [] as T;
      }
      if (q === GROUPS_SQL.myGroups || q === GROUPS_SQL.members) {
        if (!s.groupsTables) throw missing();
        if (q === GROUPS_SQL.members) {
          const g = s.groups.find((x) => x.id === v[0]);
          return (g?.members ?? []).map((m) => ({ groupId: g!.id, userId: m.userId, role: m.role, shareMeasured: false, joinedAt: new Date(0) })) as T;
        }
        return s.groups.flatMap((g) => {
          const m = g.members.find((x) => x.userId === v[0]);
          return m ? [{ id: g.id, kind: g.kind, ownerId: g.ownerId, name: g.name, color: 'cyan', homeCourt: null, inviteToken: `t-${g.id}`, inviteOpen: true, dailyDrill: false, createdAt: new Date(0), role: m.role, members: g.members.length }] : [];
        }) as T;
      }
      if (!s.tables) throw missing();
      if (q === SQL.eventById) return s.events.filter((e) => e.id === v[0] && e.coachId === v[1]).map((e) => ({ ...e })) as T;
      if (q === SQL.eventsForCoach) {
        return s.events.filter((e) => e.coachId === v[0]).map((e) => ({ id: e.id, name: e.name, teamId: e.teamId, createdAt: e.createdAt, updatedAt: e.updatedAt, athletes: s.entrants.filter((x) => x.eventId === e.id).length })) as T;
      }
      if (q === SQL.entrants) return s.entrants.filter((x) => x.eventId === v[0]).sort((a, b) => a.position - b.position).map((x) => ({ ...x })) as T;
      if (q === SQL.resultsForEvent) return s.results.filter((r) => r.eventId === v[0]).map((r) => ({ ...r })) as T;
      if (q === SQL.eventsForAthlete) {
        return s.entrants.filter((x) => x.athleteId === v[0]).flatMap((x) => s.events.filter((e) => e.id === x.eventId))
          .map((e) => ({ id: e.id, name: e.name, stations: e.stations, createdAt: e.createdAt })) as T;
      }
      if (q === SQL.resultsForEvents) return s.results.filter((r) => (v[0] as string[]).includes(r.eventId)).map((r) => ({ ...r })) as T;
      throw new Error(`fakeCombineDb: unknown query ${q.slice(0, 60)}`);
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      s.log.push({ q, v });
      if (!s.tables) throw missing();
      const now = new Date();
      if (q === SQL.insertEvent) {
        const [id, coachId, name, teamId, stations, weights] = v;
        s.events.push({ id, coachId, name, teamId, stations: JSON.parse(String(stations)), weights: JSON.parse(String(weights)), createdAt: now, updatedAt: now });
        return 1;
      }
      if (q === SQL.updateEvent) {
        const e = s.events.find((x) => x.id === v[0] && x.coachId === v[1]);
        if (!e) return 0;
        Object.assign(e, { name: v[2], weights: JSON.parse(String(v[3])), updatedAt: now });
        return 1;
      }
      if (q === SQL.deleteEvent) {
        const n = s.events.length;
        const gone = s.events.filter((x) => x.id === v[0] && x.coachId === v[1]).map((x) => x.id);
        s.events = s.events.filter((x) => !gone.includes(x.id));
        s.entrants = s.entrants.filter((x) => !gone.includes(x.eventId));
        s.results = s.results.filter((x) => !gone.includes(x.eventId));
        return n - s.events.length;
      }
      if (q === SQL.insertEntrant) {
        const [eventId, athleteId, position] = v as [string, string, number];
        if (!s.events.some((e) => e.id === eventId)) throw Object.assign(new Error('fk'), { code: '23503' });
        if (s.entrants.some((x) => x.eventId === eventId && x.athleteId === athleteId)) return 0;
        s.entrants.push({ eventId, athleteId, position });
        return 1;
      }
      if (q === SQL.upsertResult) {
        const [id, eventId, athleteId, stationId, attempt, value, touchCm, method] = v;
        const r = s.results.find((x) => x.eventId === eventId && x.athleteId === athleteId && x.stationId === stationId && x.attempt === attempt);
        if (r) Object.assign(r, { value, touchCm, method, recordedAt: now });
        else s.results.push({ id, eventId, athleteId, stationId, attempt, value, touchCm, method, recordedAt: now });
        return 1;
      }
      if (q === SQL.deleteResult) {
        const n = s.results.length;
        s.results = s.results.filter((x) => !(x.eventId === v[0] && x.athleteId === v[1] && x.stationId === v[2] && x.attempt === v[3]));
        return n - s.results.length;
      }
      throw new Error(`fakeCombineDb: unknown statement ${q.slice(0, 60)}`);
    },
    coachClient: {
      async findMany({ where }: { where: Row }) {
        return s.links.filter((l) => inList(where.coachId, l.coachId) && inList(where.clientId, l.clientId) && (where.endedAt === undefined || l.endedAt === where.endedAt)).map((l) => ({ ...l }));
      },
    },
    user: {
      async findMany({ where }: { where: Row }) {
        return s.users.filter((u) => inList(where.id, u.id)).map((u) => ({ ...u, scanSaveOptIn: s.optIns.find((x) => x.userId === u.id) ?? null }));
      },
      // lib/privacy/scanSaveGate.ts canSaveScanNumbers reads these two
      async findUnique({ where }: { where: Row }) { const u = s.users.find((x) => x.id === where.id); return u ? { dobYear: u.dobYear } : null; },
    },
    scanSaveOptIn: {
      async findUnique({ where }: { where: Row }) { return s.optIns.find((x) => x.userId === where.userId) ?? null; },
    },
    guardianConsent: {
      async findMany({ where }: { where: Row }) { return s.consents.filter((c) => inList(where.menteeId, c.menteeId)).map((c) => ({ ...c })); },
    },
  };
  return s;
}

/** An athlete on `coach`'s live roster: an opted-in adult (born 1990) unless told otherwise. */
export function seedRoster(db: FakeCombineDb, coach: string, id: string, o: { dobYear?: number | null; optIn?: boolean; name?: string; ended?: boolean } = {}): void {
  db.users.push({ id, name: o.name ?? id, dobYear: o.dobYear === undefined ? 1990 : o.dobYear });
  if (o.optIn ?? true) db.optIns.push({ userId: id, scope: 'jump_numbers', granted: true, revokedAt: null });
  db.links.push({ coachId: coach, clientId: id, endedAt: o.ended ? new Date(0) : null });
}
