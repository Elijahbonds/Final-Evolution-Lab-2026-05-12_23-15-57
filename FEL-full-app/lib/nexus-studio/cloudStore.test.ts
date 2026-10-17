// The Prisma store behind /api/studio/projects (cloudStore.ts), on the repo's Prisma stand-in (tests/helpers/writeSpyDb.ts),
// plus a stand-in that honours the advisory lock, so the quota race the design noted is shown closed (and open without it).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lockKey, prismaProjectStore, studioProjectsForExport } from './cloudStore';
import type { QuotaAdmit, StudioProjectWrite } from './cloudRoute';
import { quotaCheck } from './cloudSave';
import { argsOf, newSpyDb, spyPrisma, writesOf, type SpyDb } from '@/tests/helpers/writeSpyDb';

const row = (projectId: string, bytes = 100, name = projectId): StudioProjectWrite => ({ projectId, name, version: 1, bytes, doc: { id: projectId } });
const always: QuotaAdmit = () => ({ ok: true });
const limits = { projects: 20, accountBytes: 8 * 1_048_576 };
const quota = (w: StudioProjectWrite): QuotaAdmit => (existing) => {
  const q = quotaCheck(existing, { projectId: w.projectId, bytes: w.bytes }, limits);
  return q.ok ? { ok: true } : { ok: false, error: q.error };
};

/** spyPrisma, but `pg_advisory_xact_lock(key)` really waits for the key's holder, until that transaction ends. */
function lockingPrisma(db: SpyDb) {
  const base = spyPrisma(db);
  const tails = new Map<string, Promise<void>>();
  return new Proxy(base, {
    get(t, p) {
      if (p !== '$transaction') return t[p];
      return async (fn: (tx: unknown) => Promise<unknown>) => {
        const releases: (() => void)[] = [];
        const tx = new Proxy(base, {
          get(tt, pp) {
            if (pp !== '$queryRawUnsafe') return tt[pp];
            return async (sql: string, key: string) => {
              db.calls.push({ op: '$queryRawUnsafe', args: [sql, key] });
              const prev = tails.get(key) ?? Promise.resolve();
              let release!: () => void;
              tails.set(key, prev.then(() => new Promise<void>((r) => { release = r; })));
              await prev;
              releases.push(() => release());
              return [];
            };
          },
        });
        try { return await fn(tx); } finally { releases.forEach((r) => r()); }
      };
    },
  });
}

describe('the Prisma store', () => {
  it('a write takes the account\'s lock first, inside one transaction, then reads, then writes rev 1', async () => {
    const db = newSpyDb();
    const store = prismaProjectStore(spyPrisma(db));
    const r = await store.put('u1', row('proj_a', 321), 0, always);
    expect(r).toMatchObject({ ok: true, meta: { projectId: 'proj_a', rev: 1, bytes: 321 } });
    const ops = db.calls.map((c) => c.op);
    expect(ops.slice(0, 4)).toEqual(['$transaction', '$queryRawUnsafe', 'studioProjectSave.findMany', 'studioProjectSave.create']);
    expect(argsOf(db, '$queryRawUnsafe')[0]).toEqual(['SELECT pg_advisory_xact_lock(hashtext($1))::text', lockKey('u1')]);
    expect(argsOf(db, 'studioProjectSave.findMany')[0]).toMatchObject({ where: { userId: 'u1' } });
    expect(db.tables.studioProjectSave[0]).toMatchObject({ userId: 'u1', projectId: 'proj_a', rev: 1, name: 'proj_a', version: 1, bytes: 321, doc: { id: 'proj_a' } });
    expect(db.tables.studioProjectSave[0].updatedAt).toBeInstanceOf(Date);
  });

  it('updates only at the stored rev (then rev + 1); a stale rev or a second create is a conflict that writes nothing', async () => {
    const db = newSpyDb();
    const store = prismaProjectStore(spyPrisma(db));
    await store.put('u1', row('proj_a'), 0, always);
    expect(await store.put('u1', row('proj_a', 200, 'Renamed'), 1, always)).toMatchObject({ ok: true, meta: { rev: 2, name: 'Renamed' } });
    expect(argsOf(db, 'studioProjectSave.update')[0]).toMatchObject({ where: { userId_projectId: { userId: 'u1', projectId: 'proj_a' } } });
    const before = writesOf(db).length;
    expect(await store.put('u1', row('proj_a'), 1, always)).toMatchObject({ ok: false, current: { rev: 2, name: 'Renamed' } });
    expect(await store.put('u1', row('proj_a'), 0, always)).toMatchObject({ ok: false, current: { rev: 2 } });
    expect(await store.put('u1', row('proj_gone'), 3, always)).toEqual({ ok: false, current: null });
    // only the three transactions themselves; no create, update or delete
    expect(writesOf(db).slice(before)).toEqual(['$transaction', '$transaction', '$transaction']);
  });

  it('the quota is decided inside the lock, after the revision, from this account\'s rows only', async () => {
    const db = newSpyDb({ studioProjectSave: Array.from({ length: 20 }, (_, i) => ({ userId: 'u1', projectId: `p${i}`, name: 'x', rev: 1, bytes: 10, updatedAt: new Date() })) });
    db.tables.studioProjectSave.push({ userId: 'u2', projectId: 'q', name: 'y', rev: 1, bytes: 10, updatedAt: new Date() });
    const store = prismaProjectStore(spyPrisma(db));
    const extra = row('p20');
    expect(await store.put('u1', extra, 0, quota(extra))).toEqual({ ok: false, quota: 'quota_projects' });
    expect(await store.put('u2', row('q2'), 0, quota(row('q2')))).toMatchObject({ ok: true });
    expect(db.tables.studioProjectSave.filter((r) => r.userId === 'u1')).toHaveLength(20);
  });

  it('two new projects at the same moment cannot both pass a full quota (the race the design noted, closed)', async () => {
    const seed = () => newSpyDb({ studioProjectSave: Array.from({ length: 19 }, (_, i) => ({ userId: 'u1', projectId: `p${i}`, name: 'x', rev: 1, bytes: 10, updatedAt: new Date() })) });
    const race = async (db: SpyDb, client: unknown) => {
      const store = prismaProjectStore(client as never);
      const [a, b] = [row('new_a'), row('new_b')];
      const out = await Promise.all([store.put('u1', a, 0, quota(a)), store.put('u1', b, 0, quota(b))]);
      return { out, rows: db.tables.studioProjectSave.length };
    };
    const locked = seed();
    const r = await race(locked, lockingPrisma(locked));
    expect(r.rows).toBe(20);
    expect(r.out.filter((x) => x.ok)).toHaveLength(1);
    expect(r.out.find((x) => !x.ok)).toEqual({ ok: false, quota: 'quota_projects' });
    // the control: the same race on a stand-in whose lock does not wait lets both through — what the lock is for
    const open = seed();
    expect((await race(open, spyPrisma(open))).rows).toBe(21);
  });

  it('list, get and delete are scoped by the account', async () => {
    const db = newSpyDb();
    const store = prismaProjectStore(spyPrisma(db));
    await store.put('u1', row('proj_a'), 0, always);
    await store.put('u2', row('proj_a'), 0, always);
    expect((await store.list('u1')).map((m) => m.projectId)).toEqual(['proj_a']);
    expect(argsOf(db, 'studioProjectSave.findUnique')).toEqual([]);
    expect(await store.get('u1', 'proj_a')).toMatchObject({ projectId: 'proj_a', rev: 1, version: 1, doc: { id: 'proj_a' } });
    expect(argsOf(db, 'studioProjectSave.findUnique')[0]).toMatchObject({ where: { userId_projectId: { userId: 'u1', projectId: 'proj_a' } } });
    expect(await store.remove('u1', 'proj_a')).toBe(true);
    expect(await store.remove('u1', 'proj_a')).toBe(false);
    expect(argsOf(db, 'studioProjectSave.deleteMany')[0]).toEqual({ where: { userId: 'u1', projectId: 'proj_a' } });
    expect(db.tables.studioProjectSave).toMatchObject([{ userId: 'u2', projectId: 'proj_a' }]);
  });

  it('the export reads this account\'s projects newest first; a missing table (P2021) is none, other errors are thrown', async () => {
    const db = newSpyDb();
    const store = prismaProjectStore(spyPrisma(db));
    await store.put('u1', row('proj_a'), 0, always);
    const out = await studioProjectsForExport(spyPrisma(db), 'u1');
    expect(out).toMatchObject([{ projectId: 'proj_a', rev: 1, doc: { id: 'proj_a' } }]);
    expect(argsOf(db, 'studioProjectSave.findMany').at(-1)).toMatchObject({ where: { userId: 'u1' }, orderBy: { updatedAt: 'desc' } });
    const thrower = (e: unknown) => ({ studioProjectSave: { findMany: async () => { throw e; } } }) as never;
    expect(await studioProjectsForExport(thrower(Object.assign(new Error('missing'), { code: 'P2021' })), 'u1')).toEqual([]);
    await expect(studioProjectsForExport(thrower(new Error('boom')), 'u1')).rejects.toThrow('boom');
  });
});

describe('the table, as the schema and the pending SQL say it', () => {
  const root = join(__dirname, '..', '..');
  const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
  const model = schema.match(/^model StudioProjectSave \{[\s\S]*?^\}/m)?.[0] ?? '';
  const sql = readFileSync(join(root, 'prisma/pending/2026-10-17-studio-project-save.sql'), 'utf8');

  it('deleting the account deletes the saved projects (cascade), so no erase code path is needed', () => {
    expect(model).toMatch(/user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade, onUpdate: NoAction\)/);
    expect(sql).toMatch(/FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE ON UPDATE NO ACTION/);
    expect(schema).toMatch(/studioProjectSaves StudioProjectSave\[\]/);
  });

  it('the SQL creates exactly the model\'s columns and key, and carries a rollback line', () => {
    const fields = [...model.matchAll(/^\s{2}(\w+)\s+(String|Int|Json|DateTime)\b/gm)].map((m) => m[1]).sort();
    const cols = [...sql.matchAll(/^\s+"(\w+)" (?:TEXT|INTEGER|JSONB|TIMESTAMP\(3\))/gm)].map((m) => m[1]).sort();
    expect(cols).toEqual(fields);
    expect(model).toMatch(/@@id\(\[userId, projectId\]\)/);
    expect(sql).toMatch(/PRIMARY KEY \("userId","projectId"\)/);
    expect(sql).toMatch(/^-- rollback.*DROP TABLE "StudioProjectSave";$/m);
    expect(sql).not.toMatch(/\b(ALTER|DROP)\s+TABLE\s+"(?!StudioProjectSave)/);
  });
});
