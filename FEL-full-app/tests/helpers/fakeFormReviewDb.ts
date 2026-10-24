// tests/helpers/fakeFormReviewDb.ts — COACH-VIDEO-REVIEW (2026-10-24): an in-memory stand-in for the database the form
// review reads and writes. The raw statements are answered by NAME (lib/coach/formReview/store.ts SQL), so a statement
// that drifts from its name fails here rather than passing by accident. Test-only.
import { SQL } from '@/lib/coach/formReview/store';

export interface FakeRow {
  id: string; clientId: string; coachId: string; programId: string; sessionExerciseId: string | null; exerciseName: string;
  movement: string; band: string; reps: number; setScore: number | null; flagCount: number; summary: unknown; tracks: unknown;
  tracksDeleteAt: Date; status: string; reviewedAt: Date | null; replyMessageId: string | null; createdAt: Date;
}

export interface FakeWorld {
  tableReady: boolean;
  programs: { id: string; coachId: string; clientId: string }[];
  links: { coachId: string; clientId: string; endedAt: Date | null }[];
  users: { id: string; name: string | null; dobYear: number | null }[];
  consents: { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null; menteeBirthYear: number | null }[];
  slots: { id: string; programId: string; name: string; pattern: string | null }[];
  rows: FakeRow[];
  messages: { id: string; programId: string; authorId: string; body: string; createdAt: Date }[];
  failMessage: boolean;
  now: Date;
}

export function fakeWorld(over: Partial<FakeWorld> = {}): FakeWorld {
  return {
    tableReady: true,
    programs: [{ id: 'p1', coachId: 'coach', clientId: 'adult' }, { id: 'p2', coachId: 'coach', clientId: 'teen' }, { id: 'p3', coachId: 'other', clientId: 'adult' }],
    links: [{ coachId: 'coach', clientId: 'adult', endedAt: null }, { coachId: 'coach', clientId: 'teen', endedAt: null }],
    users: [{ id: 'adult', name: 'Ana', dobYear: 1990 }, { id: 'teen', name: 'Tia', dobYear: new Date().getFullYear() - 15 }, { id: 'coach', name: 'Coach', dobYear: 1985 }],
    consents: [],
    slots: [
      { id: 's1', programId: 'p1', name: 'Goblet squat', pattern: 'squat' },
      { id: 's2', programId: 'p1', name: 'Bench press', pattern: 'push' },
      { id: 's3', programId: 'p3', name: 'Air squat', pattern: 'squat' },
      { id: 's4', programId: 'p2', name: 'Goblet squat', pattern: 'squat' },
    ],
    rows: [], messages: [], failMessage: false, now: new Date(),
    ...over,
  };
}

const missing = () => Object.assign(new Error('relation "CoachFormReview" does not exist'), { code: '42P01' });
const pick = (r: FakeRow, tracks = false) => {
  const { tracks: t, tracksDeleteAt, ...rest } = r;
  return tracks ? { ...rest, tracks: t, tracksDeleteAt } : rest;
};

/** The db object the server functions take. */
export function fakeDb(w: FakeWorld) {
  let msgN = 0;
  return {
    async $queryRawUnsafe(q: string, ...v: unknown[]): Promise<unknown> {
      if (q.includes('information_schema')) return w.tableReady ? [{ ok: 1 }] : [];
      if (!w.tableReady) throw missing();
      switch (q) {
        case SQL.queue: return w.rows.filter((r) => r.coachId === v[0] && (r.status === 'unreviewed' || r.createdAt >= (v[1] as Date)))
          .sort((a, b) => Number(b.status === 'unreviewed') - Number(a.status === 'unreviewed') || Number(b.flagCount > 0) - Number(a.flagCount > 0) || +b.createdAt - +a.createdAt)
          .map((r) => pick(r));
        case SQL.countUnreviewed: {
          const m = new Map<string, number>();
          for (const r of w.rows) if (r.coachId === v[0] && r.status === 'unreviewed') m.set(r.clientId, (m.get(r.clientId) ?? 0) + 1);
          return [...m].map(([clientId, n]) => ({ clientId, n }));
        }
        case SQL.byId: return w.rows.filter((r) => r.id === v[0]).map((r) => pick(r, true));
        case SQL.trend: return w.rows.filter((r) => r.coachId === v[0] && (v[1] as string[]).includes(r.clientId) && r.createdAt >= (v[2] as Date))
          .sort((a, b) => +a.createdAt - +b.createdAt).map((r) => ({ clientId: r.clientId, movement: r.movement, setScore: r.setScore, createdAt: r.createdAt }));
        case SQL.mine: return w.rows.filter((r) => r.clientId === v[0]).map((r) => pick(r));
        case SQL.claim: {
          const r = w.rows.find((x) => x.id === v[0] && x.coachId === v[1] && x.status === 'unreviewed');
          if (!r) return [];
          r.status = 'reviewed'; r.reviewedAt = w.now;
          return [{ id: r.id }];
        }
        default: throw new Error(`[fakeFormReviewDb] unexpected query: ${q.slice(0, 60)}`);
      }
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      if (!w.tableReady) throw missing();
      switch (q) {
        case SQL.insert: {
          const [id, clientId, coachId, programId, sessionExerciseId, exerciseName, movement, band, reps, setScore, flagCount, summary, tracks, tracksDeleteAt] = v as [string, string, string, string, string | null, string, string, string, number, number | null, number, string, string, Date];
          w.rows.push({ id, clientId, coachId, programId, sessionExerciseId, exerciseName, movement, band, reps, setScore, flagCount, summary: JSON.parse(summary), tracks: JSON.parse(tracks), tracksDeleteAt, status: 'unreviewed', reviewedAt: null, replyMessageId: null, createdAt: new Date(w.now) });
          return 1;
        }
        case SQL.purgeTracks: { let n = 0; for (const r of w.rows) if (r.tracks !== null && r.tracksDeleteAt <= (v[0] as Date)) { r.tracks = null; n++; } return n; }
        case SQL.setReply: { const r = w.rows.find((x) => x.id === v[0]); if (r) r.replyMessageId = v[1] as string; return r ? 1 : 0; }
        case SQL.unclaim: { const r = w.rows.find((x) => x.id === v[0] && x.coachId === v[1]); if (r) { r.status = 'unreviewed'; r.reviewedAt = null; } return r ? 1 : 0; }
        case SQL.remove: { const before = w.rows.length; w.rows = w.rows.filter((x) => !(x.id === v[0] && x.clientId === v[1])); return before - w.rows.length; }
        default: throw new Error(`[fakeFormReviewDb] unexpected statement: ${q.slice(0, 60)}`);
      }
    },
    coachingProgram: {
      findUnique: async ({ where }: { where: { id: string } }) => w.programs.find((p) => p.id === where.id) ?? null,
    },
    coachClient: {
      findFirst: async ({ where }: { where: { coachId: string; clientId: string } }) => {
        const l = w.links.find((x) => x.coachId === where.coachId && x.clientId === where.clientId && x.endedAt === null);
        return l ? { id: `${l.coachId}:${l.clientId}` } : null;
      },
      findMany: async ({ where }: { where: { coachId: string } }) => w.links.filter((x) => x.coachId === where.coachId && x.endedAt === null).map((x) => ({ clientId: x.clientId })),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => { const u = w.users.find((x) => x.id === where.id); return u ? { dobYear: u.dobYear } : null; },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => w.users.filter((u) => where.id.in.includes(u.id)).map((u) => ({ id: u.id, name: u.name })),
    },
    guardianConsent: {
      findMany: async ({ where }: { where: { menteeId: string } }) => w.consents.filter((c) => c.menteeId === where.menteeId),
    },
    sessionExercise: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const s = w.slots.find((x) => x.id === where.id);
        return s ? { exercise: { name: s.name, pattern: s.pattern }, session: { block: { programId: s.programId } } } : null;
      },
    },
    programMessage: {
      create: async ({ data }: { data: { programId: string; authorId: string; body: string } }) => {
        if (w.failMessage) throw new Error('connection reset');
        const m = { id: `m${++msgN}`, ...data, createdAt: w.now };
        w.messages.push(m);
        return m;
      },
    },
    scanSaveOptIn: {},
  };
}
