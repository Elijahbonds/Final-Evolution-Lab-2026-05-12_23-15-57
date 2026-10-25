// Test support (SAFETY lane, SAF-04/05): an in-memory stand-in for the four pending safety tables, answering each
// statement of lib/safety/store.ts SQL by name, plus the Prisma reads the report routes make (user, creatorCard,
// challengeLink, programMessage). `ready: false` is production before prisma/pending/2026-10-25-user-reports.sql: the
// probe finds no tables and every statement throws Postgres' "relation does not exist" (42P01).
import { SQL } from '@/lib/safety/store';

type Row = Record<string, any>;

export interface FakeSafetyState {
  ready: boolean;
  users: { id: string; dobYear: number | null; email?: string; name?: string }[];
  cards: { slug: string; ownerId: string }[];
  links: { code: string; ownerUserId: string | null }[];
  messages: { id: string; authorId: string }[];
  reports: Row[];
  moderations: Row[];
  audit: Row[];
  problems: Row[];
  /** Every statement run, with its values, for "nothing identifying was written" scans. */
  statements: { sql: string; values: unknown[] }[];
}

const missing = () => Object.assign(new Error('relation "UserReport" does not exist'), { code: '42P01' });

export function fakeSafetyDb(init: Partial<FakeSafetyState> = {}) {
  const s: FakeSafetyState = {
    ready: true, users: [], cards: [], links: [], messages: [], reports: [], moderations: [], audit: [], problems: [], statements: [], ...init,
  };
  let clock = Date.parse('2026-10-25T12:00:00Z');
  const now = () => new Date((clock += 1000));

  const db = {
    async $queryRawUnsafe(q: string, ...v: unknown[]): Promise<any> {
      s.statements.push({ sql: q, values: v });
      if (q.includes('information_schema.tables')) return s.ready ? [{ n: 4 }] : [];
      if (q.includes('information_schema.columns')) return [];
      if (q.includes('rate_limits')) throw missing();
      if (q.includes('"TrainingGroupAct"') || q.includes('"TrainingGroup"')) throw missing();
      if (!s.ready) throw missing();
      switch (q) {
        case SQL.listProblems: return [...s.problems].reverse().slice(0, Number(v[0]));
        case SQL.countRecentReports: return [{ n: s.reports.filter((r) => r.reporterId === v[0]).length }];
        case SQL.duplicateReport: return s.reports.filter((r) => r.reporterId === v[0] && r.targetKind === v[1] && r.targetRef === v[2] && r.status === 'open').map((r) => ({ id: r.id }));
        case SQL.listReports: return [...s.reports].reverse().filter((r) => (v[0] as string[]).includes(r.status)).map(({ reporterId: _r, reviewerId: _v, ...rest }) => rest);
        case SQL.reportById: return s.reports.filter((r) => r.id === v[0]).map((r) => ({ id: r.id, reportedId: r.reportedId, status: r.status }));
        case SQL.moderationsFor: return [...s.moderations].reverse().filter((m) => m.userId === v[0]).map(({ userId: _u, moderatorId: _m, reportId: _r, appealNote: _n, ...rest }) => rest);
        case SQL.moderationById: return s.moderations.filter((m) => m.id === v[0]);
        case SQL.openAppeals: return s.moderations.filter((m) => m.appealStatus === 'open');
        case SQL.auditFor: return s.audit.filter((a) => a.subjectKind === v[0] && a.subjectId === v[1]);
        default: throw new Error(`fakeSafetyDb: unexpected query ${q.slice(0, 80)}`);
      }
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      s.statements.push({ sql: q, values: v });
      if (q.includes('rate_limits')) throw missing();
      if (!s.ready) throw missing();
      switch (q) {
        case SQL.insertProblem: s.problems.push({ id: v[0], route: v[1], buildId: v[2], deviceClass: v[3], diagKind: v[4], clientAt: v[5], text: v[6], status: 'new', createdAt: now() }); return 1;
        case SQL.setProblemStatus: { const r = s.problems.find((p) => p.id === v[0]); if (r) r.status = v[1]; return r ? 1 : 0; }
        case SQL.insertReport: s.reports.push({ id: v[0], reporterId: v[1], reportedId: v[2], targetKind: v[3], targetRef: v[4], reason: v[5], note: v[6], status: 'open', action: null, reviewerId: null, createdAt: now() }); return 1;
        case SQL.closeReport: { const r = s.reports.find((x) => x.id === v[0] && x.status === 'open'); if (!r) return 0; Object.assign(r, { status: v[1], action: v[2], reviewerId: v[3], reviewedAt: now() }); return 1; }
        case SQL.insertModeration: s.moderations.push({ id: v[0], userId: v[1], kind: v[2], reason: v[3], reportId: v[4], moderatorId: v[5], endsAt: v[6], createdAt: now(), liftedAt: null, appealStatus: 'none', appealReason: null, appealNote: null, appealedAt: null, appealDecidedAt: null }); return 1;
        case SQL.fileAppeal: { const m = s.moderations.find((x) => x.id === v[0] && x.userId === v[1] && x.appealStatus === 'none'); if (!m) return 0; Object.assign(m, { appealStatus: 'open', appealReason: v[2], appealNote: v[3], appealedAt: now() }); return 1; }
        case SQL.decideAppeal: { const m = s.moderations.find((x) => x.id === v[0] && x.appealStatus === 'open'); if (!m) return 0; Object.assign(m, { appealStatus: v[1], appealDecidedAt: now(), liftedAt: v[1] === 'lifted' ? now() : m.liftedAt }); return 1; }
        case SQL.insertAudit: s.audit.push({ id: v[0], actorId: v[1], action: v[2], subjectKind: v[3], subjectId: v[4], detail: v[5], createdAt: now() }); return 1;
        default: throw new Error(`fakeSafetyDb: unexpected statement ${q.slice(0, 80)}`);
      }
    },
    user: { async findUnique(a: any) { const u = s.users.find((x) => x.id === a.where.id); return u ? { dobYear: u.dobYear } : null; } },
    creatorCard: { async findUnique(a: any) { const c = s.cards.find((x) => x.slug === a.where.slug); return c ? { ownerId: c.ownerId } : null; } },
    challengeLink: { async findUnique(a: any) { const c = s.links.find((x) => x.code === a.where.code); return c ? { ownerUserId: c.ownerUserId } : null; } },
    programMessage: { async findUnique(a: any) { const m = s.messages.find((x) => x.id === a.where.id); return m ? { authorId: m.authorId } : null; } },
  };
  return { db, state: s };
}
