// An in-memory StudioShareLink table behind the RawDb seam lib/nexus-studio/share.ts uses: it answers exactly the statements that
// file sends (matched by their text, values bound positionally), so the share rules run for real without Postgres. `tableThere`
// false stands in for the pending SQL not yet applied (the probe finds nothing; a statement throws Postgres's 42P01).
import type { RawDb } from '@/lib/coach/pendingSchema';

export interface ShareRow { id: string; tokenHash: string; creatorId: string; creatorName: string | null; mode: string; venueName: string; payload: unknown; status: string; opens: number; createdAt: Date; endedAt: Date | null }

export function fakeShareDb(): RawDb & { rows: ShareRow[]; tableThere: boolean; sql: string[] } {
  const db = {
    rows: [] as ShareRow[],
    tableThere: true,
    sql: [] as string[],
    async $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> {
      db.sql.push(q);
      if (q.includes('information_schema.tables')) return (db.tableThere ? [{ '?column?': 1 }] : []) as T;
      if (!db.tableThere) throw Object.assign(new Error('relation "StudioShareLink" does not exist'), { code: '42P01' });
      if (q.includes(`COUNT(*)::int AS n FROM "StudioShareLink" WHERE "creatorId" = $1 AND "status" = 'live'`)) return [{ n: db.rows.filter((r) => r.creatorId === v[0] && r.status === 'live').length }] as T;
      if (q.includes(`COUNT(*)::int AS n FROM "StudioShareLink" WHERE "creatorId" = $1 AND "createdAt" > $2`)) return [{ n: db.rows.filter((r) => r.creatorId === v[0] && r.createdAt > (v[1] as Date)).length }] as T;
      if (q.includes(`WHERE "tokenHash" = $1 AND "status" = 'live' AND "payload" IS NOT NULL`)) {
        const r = db.rows.find((x) => x.tokenHash === v[0] && x.status === 'live' && x.payload !== null);
        return (r ? [{ id: r.id, mode: r.mode, venueName: r.venueName, creatorName: r.creatorName, payload: r.payload }] : []) as T;
      }
      if (q.includes(`FROM "StudioShareLink" WHERE "creatorId" = $1 ORDER BY`)) return db.rows.filter((r) => r.creatorId === v[0]).map((r) => ({ ...r })) as T;
      throw new Error(`fakeShareDb: unexpected query ${q}`);
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      db.sql.push(q);
      if (!db.tableThere) throw Object.assign(new Error('relation "StudioShareLink" does not exist'), { code: '42P01' });
      if (q.startsWith('INSERT INTO "StudioShareLink"')) {
        db.rows.push({ id: v[0] as string, tokenHash: v[1] as string, creatorId: v[2] as string, creatorName: v[3] as string | null, mode: v[4] as string, venueName: v[5] as string, payload: JSON.parse(v[6] as string), status: 'live', opens: 0, createdAt: v[7] as Date, endedAt: null });
        return 1;
      }
      if (q.includes(`SET "opens" = "opens" + 1`)) { const r = db.rows.find((x) => x.id === v[0]); if (r) r.opens++; return r ? 1 : 0; }
      if (q.includes(`SET "payload" = NULL, "status" = 'revoked'`)) {
        const r = db.rows.find((x) => x.id === v[0] && x.creatorId === v[1] && x.status === 'live');
        if (r) { r.payload = null; r.status = 'revoked'; r.endedAt = v[2] as Date; }
        return r ? 1 : 0;
      }
      if (q.includes(`SET "payload" = NULL, "status" = 'taken_down'`)) {
        const r = db.rows.find((x) => x.id === v[0] && x.status !== 'taken_down');
        if (r) { r.payload = null; r.status = 'taken_down'; r.endedAt = v[1] as Date; }
        return r ? 1 : 0;
      }
      throw new Error(`fakeShareDb: unexpected statement ${q}`);
    },
  };
  return db;
}
