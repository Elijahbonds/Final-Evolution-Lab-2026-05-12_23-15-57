// tests/helpers/fakeSignatureDb.ts — SIGNATURE-PROGRAMS (2026-10-25): an in-memory stand-in for the two pending tables
// (prisma/pending/2026-10-25-signature-programs.sql), answering lib/signature/store.ts's statements by name, with the
// same once-only conditions the SQL has (markDone only when the key is new, addEvent once per week, start only fresh).
import { SQL, resetSignatureProbe } from '@/lib/signature/store';
import type { RawDb } from '@/lib/coach/pendingSchema';

type Row = Record<string, unknown>;

export interface FakeSignatureDb extends RawDb {
  ready: boolean;
  reviews: Map<string, Row>;
  enrollments: Row[];
  writes: string[];
}

export function fakeSignatureDb(ready = true): FakeSignatureDb {
  resetSignatureProbe();
  const db: FakeSignatureDb = {
    ready,
    reviews: new Map(),
    enrollments: [],
    writes: [],
    async $queryRawUnsafe<T>(sql: string, ...v: unknown[]): Promise<T> {
      if (sql.includes('information_schema')) return (db.ready ? [{ ok: 1 }] : []) as T;
      if (!db.ready) throw Object.assign(new Error('relation "SignatureEnrollment" does not exist'), { code: '42P01' });
      if (sql === SQL.reviews) return [...db.reviews.values()] as T;
      if (sql === SQL.enrollments) return db.enrollments.filter((e) => e.userId === v[0] && e.endedAt == null) as T;
      if (sql === SQL.enrollment) return db.enrollments.filter((e) => e.userId === v[0] && e.programId === v[1] && e.endedAt == null) as T;
      // the readiness store's reads (checksFor): no checks
      if (sql.includes('ReadinessJumpCheck')) return [] as T;
      throw new Error(`unexpected query ${sql.slice(0, 70)}`);
    },
    async $executeRawUnsafe(sql: string, ...v: unknown[]): Promise<number> {
      if (!db.ready) throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      db.writes.push(sql);
      const find = (u: unknown, p: unknown) => db.enrollments.find((e) => e.userId === u && e.programId === p && e.endedAt == null);
      if (sql === SQL.upsertReview) {
        db.reviews.set(String(v[0]), { programId: v[0], status: v[1], reviewerId: v[2], note: v[3], edits: JSON.parse(String(v[4])), updatedAt: new Date() });
        return 1;
      }
      if (sql === SQL.start) {
        const have = db.enrollments.find((e) => e.userId === v[1] && e.programId === v[2]);
        if (have && have.endedAt == null) return 0;
        const row = { id: v[0], userId: v[1], programId: v[2], startedAt: new Date(), done: {}, events: [], endedAt: null, updatedAt: new Date() };
        if (have) Object.assign(have, { ...row, id: have.id }); else db.enrollments.push(row);
        return 1;
      }
      if (sql === SQL.markDone) {
        const e = find(v[0], v[1]);
        const done = (e?.done ?? {}) as Record<string, string>;
        if (!e || done[String(v[2])]) return 0;
        e.done = { ...done, [String(v[2])]: String(v[3]) };
        return 1;
      }
      if (sql === SQL.addEvent) {
        const e = find(v[0], v[1]);
        const events = (e?.events ?? []) as { afterWeek: number }[];
        if (!e || events.some((x) => String(x.afterWeek) === v[2])) return 0;
        e.events = [...events, ...JSON.parse(String(v[3]))];
        return 1;
      }
      if (sql === SQL.stop) { const e = find(v[0], v[1]); if (!e) return 0; e.endedAt = new Date(); return 1; }
      throw new Error(`unexpected exec ${sql.slice(0, 70)}`);
    },
  };
  return db;
}
