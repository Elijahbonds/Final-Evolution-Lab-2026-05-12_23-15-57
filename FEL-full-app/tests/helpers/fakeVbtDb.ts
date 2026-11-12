// tests/helpers/fakeVbtDb.ts — VBT (2026-10-25): an in-memory stand-in for the VBT tables (prisma/pending/2026-10-26-vbt.sql)
// answering lib/vbt/store.ts's statements BY NAME, on top of tests/helpers/fakeReadinessDb.ts (users, roster links,
// coach_view grants, save opt-ins, the coaches' readiness rules, myGroups) plus the groups store's group / members reads
// and the two Prisma models the VBT server reads (coachingProgram, sessionExercise). `vbtTables: false` is production
// today: the probe finds nothing and every statement throws "relation does not exist".
import { SQL } from '@/lib/vbt/store';
import { SQL as GROUPS_SQL } from '@/lib/groups/store';
import { fakeReadinessDb, type FakeReadinessDb } from './fakeReadinessDb';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FakeVbtDb extends FakeReadinessDb {
  vbtTables: boolean;
  sets: Row[];
  targets: Row[];
  /** programs: { id, coachId, clientId, name, slots: { id, name, sets, reps, load }[] } */
  programs: { id: string; coachId: string; clientId: string; name: string; slots: { id: string; name: string; sets: number; reps: string; load: string }[] }[];
  /** members' share flags per group: groupId → userId → shareMeasured */
  share: Record<string, Record<string, boolean>>;
  coachingProgram: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  sessionExercise: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const missing = () => Object.assign(new Error('relation "VbtSet" does not exist'), { code: '42P01' });

export function fakeVbtDb(o: { vbtTables?: boolean; now?: string } = {}): FakeVbtDb {
  const base = fakeReadinessDb({ now: o.now });
  const q0 = base.$queryRawUnsafe.bind(base), e0 = base.$executeRawUnsafe.bind(base);
  const s = base as FakeVbtDb;
  Object.assign(s, { vbtTables: o.vbtTables ?? true, sets: [], targets: [], programs: [], share: {} });
  s.$queryRawUnsafe = async function <T>(q: string, ...v: unknown[]): Promise<T> {
    if (q.includes('information_schema') && q.includes('VbtZoneTarget')) { s.log.push(q); return (s.vbtTables ? [{ ok: 1 }] : []) as T; }
    if (q === GROUPS_SQL.groupById) {
      const g = s.groups.find((x) => x.id === v[0]);
      return (g ? [{ id: g.id, kind: g.kind, ownerId: g.ownerId, name: g.name, color: 'cyan', homeCourt: null, inviteToken: `t-${g.id}`, inviteOpen: true, dailyDrill: false, createdAt: new Date(0) }] : []) as T;
    }
    if (q === GROUPS_SQL.members || q === GROUPS_SQL.membership) {
      const g = s.groups.find((x) => x.id === v[0]);
      const rows = (g?.members ?? []).map((m) => ({ groupId: g!.id, userId: m.userId, role: m.role, shareMeasured: s.share[g!.id]?.[m.userId] === true, joinedAt: new Date(0) }));
      return (q === GROUPS_SQL.members ? rows : rows.filter((r) => r.userId === v[1])) as T;
    }
    if (q === SQL.setsFor || q === SQL.setsForUsers || q === SQL.targetsFor) {
      s.log.push(q);
      if (!s.vbtTables) throw missing();
      if (q === SQL.setsFor) return s.sets.filter((x) => x.userId === v[0] && x.createdAt >= (v[1] as Date)).sort((a, b) => b.createdAt - a.createdAt).slice(0, v[2] as number).map((x) => ({ ...x })) as T;
      if (q === SQL.setsForUsers) return s.sets.filter((x) => (v[0] as string[]).includes(x.userId) && x.createdAt >= (v[1] as Date)).sort((a, b) => b.createdAt - a.createdAt).map((x) => ({ ...x })) as T;
      return s.targets.filter((t) => (v[0] as string[]).includes(t.sessionExerciseId)).map((t) => ({ ...t })) as T;
    }
    return q0<T>(q, ...v);
  };
  s.$executeRawUnsafe = async (q: string, ...v: unknown[]): Promise<number> => {
    if (q === SQL.insertSet || q === SQL.deleteSets || q === SQL.upsertTarget || q === SQL.deleteTarget) {
      s.log.push(q);
      if (!s.vbtTables) throw missing();
      if (q === SQL.insertSet) {
        const [id, userId, day, lift, loadKg, source, fps, reps, partials, bestMcv, meanMcv, lastMcv, bestPv, lossPct, stopPct, repMcvs, warmup, band] = v;
        s.sets.push({ id, userId, day, lift, loadKg, source, fps, reps, partials, bestMcv, meanMcv, lastMcv, bestPv, lossPct, stopPct, repMcvs, warmup, band, createdAt: new Date(s.clock) });
        return 1;
      }
      if (q === SQL.deleteSets) { const n = s.sets.length; s.sets = s.sets.filter((x) => x.userId !== v[0]); return n - s.sets.length; }
      if (q === SQL.upsertTarget) {
        const [id, coachId, sessionExerciseId, zone, lossStopPct] = v;
        const t = s.targets.find((x) => x.sessionExerciseId === sessionExerciseId);
        if (t) Object.assign(t, { coachId, zone, lossStopPct }); else s.targets.push({ id, coachId, sessionExerciseId, zone, lossStopPct });
        return 1;
      }
      const n = s.targets.length;
      s.targets = s.targets.filter((x) => !(x.sessionExerciseId === v[0] && x.coachId === v[1]));
      return n - s.targets.length;
    }
    return e0(q, ...v);
  };
  s.coachingProgram = {
    async findMany({ where }: { where: Row }) {
      return s.programs.filter((p) => (where.clientId === undefined || p.clientId === where.clientId) && (where.coachId === undefined || p.coachId === where.coachId)).map((p) => ({
        id: p.id, name: p.name, coachId: p.coachId, clientId: p.clientId,
        blocks: [{ sessions: [{ id: `${p.id}-s1`, label: 'Day 1', exercises: p.slots.map((x) => ({ id: x.id, sets: x.sets, reps: x.reps, load: x.load, exercise: { name: x.name } })) }] }],
      }));
    },
  };
  s.sessionExercise = {
    async findUnique({ where }: { where: Row }) {
      const p = s.programs.find((x) => x.slots.some((y) => y.id === where.id));
      return p ? { session: { block: { program: { coachId: p.coachId } } } } : null;
    },
  };
  return s;
}

/** A saved set, `daysAgo` before the fake's clock. */
export function seedSet(db: FakeVbtDb, userId: string, daysAgo: number, o: Partial<Row> = {}): void {
  const at = db.clock - daysAgo * 86_400_000;
  const repMcvs = o.repMcvs ?? [0.62, 0.6, 0.58];
  db.sets.push({
    id: `set-${userId}-${daysAgo}-${db.sets.length}`, userId, day: new Date(at).toISOString().slice(0, 10), lift: 'back_squat', loadKg: 100, source: 'plate', fps: 60,
    reps: repMcvs.length, partials: 0, bestMcv: Math.max(...repMcvs), meanMcv: repMcvs.reduce((a: number, b: number) => a + b, 0) / repMcvs.length, lastMcv: repMcvs[repMcvs.length - 1],
    bestPv: 1.0, lossPct: 6.5, stopPct: 20, repMcvs, warmup: false, band: null, createdAt: new Date(at), ...o,
  });
}
