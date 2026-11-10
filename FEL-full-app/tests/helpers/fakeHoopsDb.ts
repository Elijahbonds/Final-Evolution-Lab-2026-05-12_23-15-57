// tests/helpers/fakeHoopsDb.ts — BBS-04 (2026-11-03): an in-memory stand-in for the kept shot sessions
// (prisma/pending/2026-11-03-hoops-cam.sql), answering lib/hoops-cam/store.ts's statements BY NAME, on top of
// tests/helpers/fakeVbtDb.ts (users, roster links, coach_view grants, save opt-ins, groups and their members' share flags).
// `hoopsTable: false` is production today: the probe finds nothing and every statement throws "relation does not exist".
import { SQL } from '@/lib/hoops-cam/store';
import { fakeVbtDb, type FakeVbtDb } from './fakeVbtDb';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FakeHoopsDb extends FakeVbtDb {
  hoopsTable: boolean;
  sessions: Row[];
}

const missing = () => Object.assign(new Error('relation "HoopsCamSession" does not exist'), { code: '42P01' });

export function fakeHoopsDb(o: { hoopsTable?: boolean; now?: string } = {}): FakeHoopsDb {
  const base = fakeVbtDb({ now: o.now });
  const q0 = base.$queryRawUnsafe.bind(base), e0 = base.$executeRawUnsafe.bind(base);
  const s = base as FakeHoopsDb;
  Object.assign(s, { hoopsTable: o.hoopsTable ?? true, sessions: [] });
  s.$queryRawUnsafe = async function <T>(q: string, ...v: unknown[]): Promise<T> {
    if (q.includes('information_schema') && q.includes('HoopsCamSession')) { s.log.push(q); return (s.hoopsTable ? [{ ok: 1 }] : []) as T; }
    if (q === SQL.sessionsForUsers) {
      s.log.push(q);
      if (!s.hoopsTable) throw missing();
      return s.sessions.filter((x) => (v[0] as string[]).includes(x.userId) && x.createdAt >= (v[1] as Date)).sort((a, b) => b.createdAt - a.createdAt)
        .map((x) => ({ userId: x.userId, data: x.data, createdAt: x.createdAt })) as T;
    }
    return q0<T>(q, ...v);
  };
  s.$executeRawUnsafe = async (q: string, ...v: unknown[]): Promise<number> => {
    if (q === SQL.insertSession || q === SQL.deleteSessions) {
      s.log.push(q);
      if (!s.hoopsTable) throw missing();
      if (q === SQL.insertSession) {
        const [id, userId, kind, day, startedAt, data] = v;
        // the column is jsonb: what comes back is the parsed object, as Postgres hands it to Prisma
        s.sessions.push({ id, userId, kind, day, startedAt, data: JSON.parse(String(data)), createdAt: new Date(s.clock) });
        return 1;
      }
      const n = s.sessions.length;
      s.sessions = s.sessions.filter((x) => x.userId !== v[0]);
      return n - s.sessions.length;
    }
    return e0(q, ...v);
  };
  return s;
}

/** A kept shot session `daysAgo` before the fake's clock: `made` and `missed` shots, spotted ones at (x, z). */
export function seedShots(db: FakeHoopsDb, userId: string, daysAgo: number, o: { made?: number; missed?: number; x?: number | null; z?: number | null } = {}): void {
  const at = db.clock - daysAgo * 86_400_000;
  const made = o.made ?? 3, missed = o.missed ?? 2;
  const x = o.x === undefined ? 1 : o.x, z = o.z === undefined ? 4 : o.z;
  const shots = Array.from({ length: made + missed }, (_, i) => ({ t: i * 5000, made: i < made, fixed: false, x, z }));
  const day = new Date(at).toISOString().slice(0, 10);
  db.sessions.push({ id: `hs-${userId}-${daysAgo}-${db.sessions.length}`, userId, kind: 'shots', day, startedAt: new Date(at), data: { kind: 'shots', day, at, placement: 'left_wing', shots }, createdAt: new Date(at) });
}
