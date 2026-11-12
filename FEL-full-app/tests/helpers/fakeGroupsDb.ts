// Test support for lib/groups: an in-memory stand-in for the three pending tables (answering each statement of
// lib/groups/store.ts SQL by name) plus the Prisma reads lib/groups/server.ts makes. `ready: false` is the database
// before prisma/pending/2026-10-25-teams-squads.sql is applied: the probe finds no table and every group statement
// throws Postgres' "relation does not exist" (42P01), as production would.
import { SQL } from '@/lib/groups/store';
import type { GroupsDb } from '@/lib/groups/server';

export interface FakeUser { id: string; name: string; dobYear: number | null; optIn?: boolean; certified?: boolean }
export interface FakeConsent { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null; menteeBirthYear?: number | null }

export interface FakeState {
  ready: boolean;
  users: FakeUser[];
  consents: FakeConsent[];
  groups: Record<string, unknown>[];
  members: Record<string, unknown>[];
  acts: Record<string, unknown>[];
  coachClients: { id: string; coachId: string; clientId: string; endedAt: Date | null; via: string }[];
  ledgerKeys: string[];
  games: { userId: string; mode: string; score: number; won: boolean; createdAt: Date }[];
  mirror: { id: string; userId: string; patternId: string; reps: number; createdAt: Date }[];
  scans: { id: string; userId: string; kind: string; metrics: unknown; createdAt: Date }[];
  links: { code: string; ownerUserId: string | null; modeKey: string; score: number; createdAt: Date }[];
  /** Every Prisma `where` the reads were given, for gate assertions. */
  wheres: { model: string; where: unknown }[];
  executed: string[];
}

const missing = () => Object.assign(new Error('relation "TrainingGroup" does not exist'), { code: '42P01' });

export function fakeGroupsDb(init: Partial<FakeState> = {}): { db: GroupsDb; state: FakeState } {
  const s: FakeState = {
    ready: true, users: [], consents: [], groups: [], members: [], acts: [], coachClients: [], ledgerKeys: [], games: [], mirror: [], scans: [], links: [],
    wheres: [], executed: [], ...init,
  };
  const now = () => new Date();
  const userById = (id: string) => s.users.find((u) => u.id === id);
  const adultYear = (u: FakeUser | undefined, at = new Date()) => !!u && typeof u.dobYear === 'number' && u.dobYear <= at.getFullYear() - 19;
  /** Apply the `user: { is: ... }` relation filter the reader puts inside a query (verified adult; + opt-in). */
  const userIs = (where: any, userId: string) => {
    const is = where?.user?.is;
    if (!is) return true;
    const u = userById(userId);
    if (!adultYear(u)) return false;
    return is.scanSaveOptIn ? u?.optIn === true : true;
  };
  const inIds = (where: any, id: string) => !where?.userId?.in || where.userId.in.includes(id);
  const gte = (d: Date, w: any) => (!w?.gte || d >= w.gte) && (!w?.lt || d < w.lt);

  const db: GroupsDb = {
    async $queryRawUnsafe(q: string, ...v: unknown[]): Promise<any> {
      if (q.includes('information_schema.tables')) return s.ready ? [{ ok: 1 }] : [];
      if (!s.ready) throw missing();
      switch (q) {
        case SQL.groupById: return s.groups.filter((g) => g.id === v[0]);
        case SQL.groupByToken: return s.groups.filter((g) => g.inviteToken === v[0]);
        case SQL.groupByCode: case SQL.tokenTaken: {
          const prefix = String(v[0]).replace(/%$/, '');
          const rows = s.groups.filter((g) => String(g.inviteToken).startsWith(prefix));
          return q === SQL.tokenTaken ? rows.slice(0, 1).map(() => ({ ok: 1 })) : rows.slice(0, 2);
        }
        case SQL.myGroups:
          return s.members.filter((m) => m.userId === v[0]).map((m) => {
            const g = s.groups.find((x) => x.id === m.groupId)!;
            return { ...g, role: m.role, members: s.members.filter((x) => x.groupId === g.id).length };
          });
        case SQL.countMine: return [{ n: s.members.filter((m) => m.userId === v[0]).length }];
        case SQL.members: return s.members.filter((m) => m.groupId === v[0]);
        case SQL.membership: return s.members.filter((m) => m.groupId === v[0] && m.userId === v[1]);
        case SQL.acts: return s.acts.filter((x) => x.groupId === v[0] && ((x.createdAt as Date) >= (v[1] as Date) || x.kind === 'trophy'));
        case SQL.squadmates: {
          const mine = s.members.filter((m) => m.userId === v[0]).map((m) => m.groupId);
          return s.members.some((m) => m.userId === v[1] && mine.includes(m.groupId) && s.groups.find((g) => g.id === m.groupId)?.kind === 'squad') ? [{ ok: 1 }] : [];
        }
        default: throw new Error(`fakeGroupsDb: unexpected query ${q.slice(0, 80)}`);
      }
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      if (!s.ready) throw missing();
      s.executed.push(q);
      switch (q) {
        case SQL.insertGroup: {
          if (s.groups.some((g) => g.inviteToken === v[6] || (g.ownerId === v[2] && g.kind === v[1] && g.name === v[3]))) throw Object.assign(new Error('unique'), { code: 'P2010', meta: { code: '23505' } });
          s.groups.push({ id: v[0], kind: v[1], ownerId: v[2], name: v[3], color: v[4], homeCourt: v[5], inviteToken: v[6], inviteOpen: true, dailyDrill: false, createdAt: now() });
          return 1;
        }
        case SQL.deleteGroup: {
          const before = s.groups.length;
          s.groups = s.groups.filter((g) => g.id !== v[0]);
          s.members = s.members.filter((m) => m.groupId !== v[0]);
          s.acts = s.acts.filter((x) => x.groupId !== v[0]);
          return before - s.groups.length;
        }
        case SQL.addMember: {
          if (s.members.some((m) => m.groupId === v[0] && m.userId === v[1])) return 0;
          s.members.push({ groupId: v[0], userId: v[1], role: v[2], shareMeasured: false, joinedAt: now() });
          return 1;
        }
        case SQL.removeMember: {
          const before = s.members.length;
          s.members = s.members.filter((m) => !(m.groupId === v[0] && m.userId === v[1] && m.role !== 'owner'));
          return before - s.members.length;
        }
        case SQL.setRole: case SQL.setShare: {
          const m = s.members.find((x) => x.groupId === v[0] && x.userId === v[1] && (q === SQL.setShare || x.role !== 'owner'));
          if (!m) return 0;
          if (q === SQL.setRole) m.role = v[2]; else m.shareMeasured = v[2];
          return 1;
        }
        case SQL.update: {
          const g = s.groups.find((x) => x.id === v[0]);
          if (!g) return 0;
          Object.assign(g, { name: v[1], color: v[2], homeCourt: v[3], dailyDrill: v[4], inviteOpen: v[5], inviteToken: v[6] });
          return 1;
        }
        case SQL.insertAct: {
          if (s.acts.some((x) => x.groupId === v[1] && x.dedupeKey === v[3])) return 0;
          s.acts.push({ id: v[0], groupId: v[1], kind: v[2], dedupeKey: v[3], fromUserId: v[4], toUserId: v[5], ref: v[6], preset: v[7], points: v[8], createdAt: now() });
          return 1;
        }
        case SQL.deleteAct: {
          const before = s.acts.length;
          s.acts = s.acts.filter((x) => !(x.groupId === v[0] && x.dedupeKey === v[1] && x.fromUserId === v[2]));
          return before - s.acts.length;
        }
        default: throw new Error(`fakeGroupsDb: unexpected statement ${q.slice(0, 80)}`);
      }
    },
    user: {
      async findMany(a: any) {
        return s.users.filter((u) => a.where.id.in.includes(u.id)).map((u) => ({
          id: u.id, name: u.name, dobYear: u.dobYear, scanSaveOptIn: u.optIn ? { scope: 'jump_numbers', granted: true, revokedAt: null } : null,
        }));
      },
      async findUnique(a: any) { const u = userById(a.where.id); return u ? { dobYear: u.dobYear } : null; },
    },
    guardianConsent: { async findMany(a: any) { return s.consents.filter((c) => c.menteeId === a.where.menteeId); } },
    facilitatorProfile: { async findUnique(a: any) { return userById(a.where.userId)?.certified ? { certificationStatus: 'certified' } : null; } },
    coachClient: {
      async findMany(a: any) { return s.coachClients.filter((c) => c.coachId === a.where.coachId && c.endedAt === null && a.where.clientId.in.includes(c.clientId)); },
      async findUnique(a: any) { const k = a.where.coachId_clientId; return s.coachClients.find((c) => c.coachId === k.coachId && c.clientId === k.clientId) ?? null; },
      async create(a: any) { const row = { id: `cc${s.coachClients.length + 1}`, endedAt: null, ...a.data }; s.coachClients.push(row); return row; },
      async update(a: any) { const c = s.coachClients.find((x) => x.id === a.where.id)!; Object.assign(c, a.data); return c; },
    },
    walletLedgerEntry: { async findMany(a: any) { return s.ledgerKeys.filter((k) => a.where.idempotencyKey.in.includes(k)).map((idempotencyKey) => ({ idempotencyKey })); } },
    gameSession: {
      async findMany(a: any) {
        s.wheres.push({ model: 'gameSession', where: a.where });
        return s.games.filter((g) => inIds(a.where, g.userId) && gte(g.createdAt, a.where.createdAt) && userIs(a.where, g.userId) && !(a.where.mode?.notIn ?? []).includes(g.mode));
      },
      async groupBy(a: any) {
        s.wheres.push({ model: 'gameSession.groupBy', where: a.where });
        const rows = s.games.filter((g) => inIds(a.where, g.userId) && gte(g.createdAt, a.where.createdAt) && userIs(a.where, g.userId));
        const by = new Map<string, { userId: string; mode: string; _max: { score: number } }>();
        for (const g of rows) { const k = `${g.userId}|${g.mode}`; const c = by.get(k); if (!c || g.score > c._max.score) by.set(k, { userId: g.userId, mode: g.mode, _max: { score: g.score } }); }
        return [...by.values()];
      },
    },
    mirrorSession: { async findMany(a: any) { s.wheres.push({ model: 'mirrorSession', where: a.where }); return s.mirror.filter((m) => inIds(a.where, m.userId) && gte(m.createdAt, a.where.createdAt) && userIs(a.where, m.userId)); } },
    workoutScan: { async findMany(a: any) { s.wheres.push({ model: 'workoutScan', where: a.where }); return s.scans.filter((m) => inIds(a.where, m.userId) && m.kind === a.where.kind && gte(m.createdAt, a.where.createdAt) && userIs(a.where, m.userId)); } },
    challengeLink: {
      async findMany(a: any) {
        if (a.where.code) return s.links.filter((l) => a.where.code.in.includes(l.code));
        return s.links.filter((l) => l.ownerUserId === a.where.ownerUserId && l.createdAt >= a.where.createdAt.gte);
      },
      async findUnique(a: any) { return s.links.find((l) => l.code === a.where.code) ?? null; },
    },
  };
  return { db, state: s };
}

/** Birth years that are unambiguous on every day of the current year. */
export const YEARS = { adult: new Date().getFullYear() - 30, teen: new Date().getFullYear() - 15, child: new Date().getFullYear() - 10 } as const;
