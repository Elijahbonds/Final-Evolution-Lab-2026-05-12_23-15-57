// A stand-in for the teacher tables (PLAT-P10): answers lib/teach/store.ts's own SQL constants from memory, so the store
// and the route logic are tested end to end without a database. `ready: false` is the database before the pending SQL.
import { SQL, type RawDb } from '@/lib/teach/store';

export interface TeachMem {
  ready: boolean;
  apps: Record<string, unknown>[];
  roles: Map<string, { revokedAt: string | null }>;
  courses: Record<string, unknown>[];
}

export function teachDb(ready = true): RawDb & { mem: TeachMem } {
  const mem: TeachMem = { ready, apps: [], roles: new Map(), courses: [] };
  const now = () => new Date().toISOString();
  return {
    mem,
    async $queryRawUnsafe<T>(sql: string, ...v: unknown[]): Promise<T> {
      if (/information_schema/.test(sql)) return (mem.ready ? [{ ok: 1 }] : []) as T;
      if (!mem.ready) throw Object.assign(new Error('relation "TeachCourse" does not exist'), { code: '42P01' });
      if (sql === SQL.latestApplication) return mem.apps.filter((a) => a.userId === v[0]).slice(-1) as T;
      if (sql === SQL.pendingApplications) return mem.apps.filter((a) => a.status === 'pending') as T;
      if (sql === SQL.applicationById) return mem.apps.filter((a) => a.id === v[0]) as T;
      if (sql === SQL.roleOf) { const r = mem.roles.get(String(v[0])); return (r && !r.revokedAt ? [{ userId: v[0] }] : []) as T; }
      if (sql === SQL.coursesOf) return mem.courses.filter((c) => c.teacherId === v[0]) as T;
      if (sql === SQL.courseById) return mem.courses.filter((c) => c.id === v[0]) as T;
      throw new Error(`teachDb: unknown query ${sql.slice(0, 60)}`);
    },
    async $executeRawUnsafe(sql: string, ...v: unknown[]): Promise<number> {
      if (!mem.ready) throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      if (sql === SQL.insertApplication) { mem.apps.push({ id: v[0], userId: v[1], discipline: v[2], bio: v[3], sample: v[4], links: v[5], status: 'pending', note: null, createdAt: now(), decidedAt: null }); return 1; }
      if (sql === SQL.decide) { const a = mem.apps.find((x) => x.id === v[0] && x.status === 'pending'); if (!a) return 0; Object.assign(a, { status: v[1], note: v[2], decidedAt: now() }); return 1; }
      if (sql === SQL.grantRole) { mem.roles.set(String(v[0]), { revokedAt: null }); return 1; }
      if (sql === SQL.insertCourse) { mem.courses.push({ id: v[0], teacherId: v[1], title: v[2], summary: v[3], lessons: v[4], status: 'draft' }); return 1; }
      if (sql === SQL.updateCourse) { const c = mem.courses.find((x) => x.id === v[0] && x.teacherId === v[1]); if (!c) return 0; Object.assign(c, { title: v[2], summary: v[3], lessons: v[4], status: v[5] }); return 1; }
      throw new Error(`teachDb: unknown statement ${sql.slice(0, 60)}`);
    },
  };
}
