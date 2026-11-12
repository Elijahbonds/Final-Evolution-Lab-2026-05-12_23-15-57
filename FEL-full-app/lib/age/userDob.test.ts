// FN-BOX-1b (2026-10-19): User.dob through raw SQL behind a column probe. Without the column: no write, every read null.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readUserDob, resetUserDobProbe, writeUserDob } from './userDob';
import type { RawDb } from '@/lib/coach/pendingSchema';

function fakeDb(opts: { column: boolean; dob?: string | null; changed?: number }) {
  const calls: { kind: 'query' | 'exec'; sql: string; values: unknown[] }[] = [];
  const db: RawDb = {
    async $queryRawUnsafe<T>(sql: string, ...values: unknown[]) {
      calls.push({ kind: 'query', sql, values });
      if (sql.includes('information_schema')) return (opts.column ? [{ ok: 1 }] : []) as T;
      if (!opts.column) throw Object.assign(new Error('column "dob" does not exist'), { code: '42703' });
      return [{ dob: opts.dob ?? null }] as T;
    },
    async $executeRawUnsafe(sql: string, ...values: unknown[]) {
      calls.push({ kind: 'exec', sql, values });
      return opts.changed ?? 1;
    },
  };
  return { db, calls };
}

beforeEach(() => { resetUserDobProbe(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('userDob', () => {
  it('without the column: nothing is written and the read is null', async () => {
    const { db, calls } = fakeDb({ column: false });
    expect(await writeUserDob(db, 'u1', '2008-03-14')).toBe(false);
    expect(await readUserDob(db, 'u1')).toBeNull();
    expect(calls.filter((c) => c.kind === 'exec')).toEqual([]);
  });

  it('with the column: a set-once, parameterised write of the normalised date', async () => {
    const { db, calls } = fakeDb({ column: true });
    expect(await writeUserDob(db, 'u1', '2008-03-14')).toBe(true);
    const exec = calls.filter((c) => c.kind === 'exec');
    expect(exec).toHaveLength(1);
    expect(exec[0].sql).toMatch(/"dob" IS NULL/);
    expect(exec[0].sql).not.toContain('2008');
    expect(exec[0].values).toEqual(['2008-03-14', 'u1']);
  });

  it('an invalid date is never written', async () => {
    const { db, calls } = fakeDb({ column: true });
    for (const bad of ['2008-02-30', 'x', '']) expect(await writeUserDob(db, 'u1', bad)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reads the stored date, and a junk or empty value as null', async () => {
    expect(await readUserDob(fakeDb({ column: true, dob: '2008-03-14' }).db, 'u1')).toBe('2008-03-14');
    resetUserDobProbe();
    expect(await readUserDob(fakeDb({ column: true, dob: null }).db, 'u1')).toBeNull();
    resetUserDobProbe();
    expect(await readUserDob(fakeDb({ column: true, dob: '2008-02-30' }).db, 'u1')).toBeNull();
  });

  it('a throwing database never throws out', async () => {
    const db: RawDb = {
      $queryRawUnsafe: async () => { throw new Error('down'); },
      $executeRawUnsafe: async () => { throw new Error('down'); },
    };
    expect(await writeUserDob(db, 'u1', '2008-03-14')).toBe(false);
    expect(await readUserDob(db, 'u1')).toBeNull();
  });
});
