// tests/helpers/fakeReadinessDb.ts — COACH-READINESS (2026-10-25): an in-memory stand-in for the readiness tables
// (prisma/pending/2026-10-25-coach-readiness.sql), answering lib/coach/readiness/store.ts's statements BY NAME with the
// unique keys enforced the way Postgres would (ON CONFLICT DO NOTHING → 0 rows), plus the Prisma models the readiness
// server reads (coachClient, user, healthConsent, scanSaveOptIn) and the groups store's myGroups. `tables: false` is
// production today: the probe finds nothing and every statement throws "relation does not exist".
import { SQL } from '@/lib/coach/readiness/store';
import { SQL as GROUPS_SQL } from '@/lib/groups/store';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FakeReadinessDb {
  tables: boolean;
  groupsTables: boolean;
  clock: number;
  checks: Row[];
  rules: Row[];
  alerts: Row[];
  users: { id: string; name: string | null; email: string | null; dobYear: number | null }[];
  links: { coachId: string; clientId: string; endedAt: Date | null; createdAt: Date }[];
  grants: { userId: string; coachId: string | null; scope: string; revokedAt: Date | null }[];
  optIns: { userId: string; scope: string; granted: boolean; revokedAt: Date | null }[];
  /** groups: { id, kind, ownerId, name, members: { userId, role }[] } */
  groups: { id: string; kind: 'team' | 'squad'; ownerId: string; name: string; members: { userId: string; role: 'owner' | 'coach' | 'member' }[] }[];
  log: string[];
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  coachClient: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  user: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  healthConsent: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  scanSaveOptIn: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const missing = () => Object.assign(new Error('relation "ReadinessJumpCheck" does not exist'), { code: '42P01' });
const inList = (v: unknown, x: unknown) => (v && typeof v === 'object' && 'in' in (v as object) ? ((v as { in: unknown[] }).in).includes(x) : v === undefined || v === x);

export function fakeReadinessDb(o: { tables?: boolean; groupsTables?: boolean; now?: string } = {}): FakeReadinessDb {
  const s: FakeReadinessDb = {
    tables: o.tables ?? true, groupsTables: o.groupsTables ?? true, clock: Date.parse(o.now ?? '2026-10-25T15:00:00Z'),
    checks: [], rules: [], alerts: [], users: [], links: [], grants: [], optIns: [], groups: [], log: [],
    async $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> {
      s.log.push(q);
      if (q.includes('information_schema')) {
        if (q.includes('ReadinessAlert')) return (s.tables ? [{ ok: 1 }] : []) as T;
        if (q.includes('TrainingGroupAct')) return (s.groupsTables ? [{ ok: 1 }] : []) as T;
        return [] as T;
      }
      if (q === GROUPS_SQL.myGroups) {
        if (!s.groupsTables) throw missing();
        return s.groups.flatMap((g) => {
          const m = g.members.find((x) => x.userId === v[0]);
          return m ? [{ id: g.id, kind: g.kind, ownerId: g.ownerId, name: g.name, color: 'cyan', homeCourt: null, inviteToken: `t-${g.id}`, inviteOpen: true, dailyDrill: false, createdAt: new Date(0), role: m.role, members: g.members.length }] : [];
        }) as T;
      }
      if (!s.tables) throw missing();
      if (q === SQL.checkByDay) return s.checks.filter((c) => c.userId === v[0] && c.day === v[1]).map((c) => ({ ...c })) as T;
      if (q === SQL.checksFor) {
        return s.checks.filter((c) => c.userId === v[0] && c.createdAt >= (v[1] as Date)).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, v[2] as number).map((c) => ({ ...c })) as T;
      }
      if (q === SQL.checksForUsers) return s.checks.filter((c) => (v[0] as string[]).includes(c.userId) && c.createdAt >= (v[1] as Date)).map((c) => ({ ...c })) as T;
      if (q === SQL.rulesForCoaches) return s.rules.filter((r) => (v[0] as string[]).includes(r.coachId)).map((r) => ({ ...r })) as T;
      if (q === SQL.alertsForCoach) return s.alerts.filter((a) => a.coachId === v[0] && a.createdAt >= (v[1] as Date)).sort((a, b) => b.createdAt - a.createdAt).map((a) => ({ ...a })) as T;
      if (q === SQL.alertsForAthleteDay) return s.alerts.filter((a) => a.athleteId === v[0] && a.day === v[1]).map((a) => ({ coachId: a.coachId })) as T;
      throw new Error(`fakeReadinessDb: unknown query ${q.slice(0, 60)}`);
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      s.log.push(q);
      if (!s.tables) throw missing();
      if (q === SQL.insertCheck) {
        const [id, userId, day, bestCm, meanCm, teCm, jumps, poseHz, feel, band, reason, belowReal, baselineCm, baselineMeanCm, baselineN, dropPct] = v;
        if (s.checks.some((c) => c.userId === userId && c.day === day)) return 0;
        s.checks.push({ id, userId, day, bestCm, meanCm, teCm, jumps, poseHz, feel, band, reason, belowReal, baselineCm, baselineMeanCm, baselineN, dropPct, createdAt: new Date(s.clock) });
        return 1;
      }
      if (q === SQL.deleteChecks) {
        const ids = new Set(s.checks.filter((c) => c.userId === v[0]).map((c) => c.id));
        s.checks = s.checks.filter((c) => c.userId !== v[0]);
        s.alerts = s.alerts.filter((a) => !ids.has(a.checkId));
        return ids.size;
      }
      if (q === SQL.upsertRule) {
        const [id, coachId, scope, scopeId, kind, dropPct, action] = v;
        const r = s.rules.find((x) => x.coachId === coachId && x.scope === scope && x.scopeId === scopeId);
        if (r) Object.assign(r, { kind, dropPct, action, updatedAt: new Date(s.clock) });
        else s.rules.push({ id, coachId, scope, scopeId, kind, dropPct, action, updatedAt: new Date(s.clock) });
        return 1;
      }
      if (q === SQL.deleteRule) {
        const n = s.rules.length;
        s.rules = s.rules.filter((x) => !(x.coachId === v[0] && x.scope === v[1] && x.scopeId === v[2]));
        return n - s.rules.length;
      }
      if (q === SQL.insertAlert) {
        const [id, coachId, athleteId, day, checkId, action, reason, dropPct] = v;
        if (s.alerts.some((a) => a.coachId === coachId && a.athleteId === athleteId && a.day === day)) return 0;
        s.alerts.push({ id, coachId, athleteId, day, checkId, action, reason, dropPct, createdAt: new Date(s.clock), seenAt: null });
        return 1;
      }
      if (q === SQL.seeAlert) {
        const a = s.alerts.find((x) => x.id === v[0] && x.coachId === v[1] && x.seenAt == null);
        if (!a) return 0;
        a.seenAt = new Date(s.clock);
        return 1;
      }
      throw new Error(`fakeReadinessDb: unknown statement ${q.slice(0, 60)}`);
    },
    coachClient: {
      async findMany({ where }: { where: Row }) {
        return s.links.filter((l) => inList(where.clientId, l.clientId) && inList(where.coachId, l.coachId) && (where.endedAt === undefined || l.endedAt === where.endedAt))
          .map((l) => ({ ...l, coach: (() => { const u = s.users.find((x) => x.id === l.coachId); return { name: u?.name ?? null, email: u?.email ?? null }; })() }));
      },
      async findFirst({ where }: { where: Row }) {
        return (await s.coachClient.findMany({ where }))[0] ?? null;
      },
    },
    user: {
      async findMany({ where }: { where: Row }) { return s.users.filter((u) => inList(where.id, u.id)).map((u) => ({ ...u })); },
      async findUnique({ where }: { where: Row }) { return s.users.find((u) => u.id === where.id) ?? null; },
    },
    healthConsent: {
      async findMany({ where }: { where: Row }) {
        return s.grants.filter((g) => inList(where.userId, g.userId) && inList(where.coachId, g.coachId) && (where.scope === undefined || g.scope === where.scope) && (where.revokedAt === undefined || g.revokedAt === where.revokedAt));
      },
    },
    scanSaveOptIn: {
      async findMany({ where }: { where: Row }) { return s.optIns.filter((x) => inList(where.userId, x.userId)); },
      async findUnique({ where }: { where: Row }) { return s.optIns.find((x) => x.userId === where.userId) ?? null; },
    },
  };
  return s;
}

/** An adult (born 1990) who opted in to saving movement numbers, with a live coach_view grant for each coach given. */
export function seedAthlete(db: FakeReadinessDb, id: string, o: { coaches?: string[]; share?: boolean; optIn?: boolean; dobYear?: number | null; name?: string } = {}): void {
  db.users.push({ id, name: o.name ?? id, email: `${id}@fel.test`, dobYear: o.dobYear === undefined ? 1990 : o.dobYear });
  if (o.optIn ?? true) db.optIns.push({ userId: id, scope: 'jump_numbers', granted: true, revokedAt: null });
  for (const c of o.coaches ?? []) {
    if (!db.users.some((u) => u.id === c)) db.users.push({ id: c, name: `Coach ${c}`, email: `${c}@fel.test`, dobYear: 1985 });
    db.links.push({ coachId: c, clientId: id, endedAt: null, createdAt: new Date(0) });
    if (o.share ?? true) db.grants.push({ userId: id, coachId: c, scope: 'coach_view', revokedAt: null });
  }
}

/** A saved prior check (days ago from the fake's clock). */
export function seedCheck(db: FakeReadinessDb, userId: string, daysAgo: number, bestCm: number, o: { meanCm?: number; teCm?: number; band?: string; belowReal?: boolean; dropPct?: number | null; baselineN?: number | null; baselineCm?: number | null; feel?: number | null } = {}): void {
  const at = db.clock - daysAgo * 86_400_000;
  db.checks.push({
    id: `chk-${userId}-${daysAgo}`, userId, day: new Date(at).toISOString().slice(0, 10), bestCm, meanCm: o.meanCm ?? bestCm - 1, teCm: o.teCm ?? 1.4, jumps: 3, poseHz: 60,
    feel: o.feel ?? null, band: o.band ?? 'normal', reason: 'steady', belowReal: o.belowReal ?? false, baselineCm: o.baselineCm ?? null, baselineMeanCm: null,
    baselineN: o.baselineN ?? null, dropPct: o.dropPct ?? null, createdAt: new Date(at),
  });
}
