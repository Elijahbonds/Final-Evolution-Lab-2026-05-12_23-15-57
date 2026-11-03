// PROGRAM-ASK-2 (2026-11-03): account save behind the pending-schema seam. Fails closed (the phone keeps the plan) until
// prisma/pending/2026-11-03-program-ask.sql is applied; writes only what the page sends, shaped; the phone and account
// copies merge for the same program only.
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRY } from '@/lib/data-rights/registry';
import { readAccountProgram, resetProgramAskProbe, saveAccountProgram, shapeSave, SQL } from './accountStore';
import { mergeAccount, PROGRAM_DEVICE_KEY, readSaved } from './device';

function fakeDb(ready: boolean, rows: Record<string, unknown>[] = []) {
  const calls: { sql: string; args: unknown[] }[] = [];
  return {
    calls,
    async $queryRawUnsafe<T>(sql: string, ...args: unknown[]): Promise<T> {
      calls.push({ sql, args });
      if (sql.includes('information_schema')) return (ready ? [{ ok: 1 }] : []) as T;
      if (!ready) throw Object.assign(new Error('relation "AskedProgram" does not exist'), { code: '42P01' });
      return rows as T;
    },
    async $executeRawUnsafe(sql: string, ...args: unknown[]): Promise<number> { calls.push({ sql, args }); return 1; },
  };
}

const PLAN = { question: 'a band, full body, 3 days', edits: { days: 4 }, programId: 'abc123', done: { 'w1:d1': '2026-11-03T10:00:00.000Z' }, decisions: [{ afterWeek: 5, kind: 'advance' as const }] };

describe('account save', () => {
  beforeEach(() => resetProgramAskProbe());

  it('fails closed before the table exists: not ready, nothing written', async () => {
    const db = fakeDb(false);
    expect(await readAccountProgram(db, 'u1')).toBe('not_ready');
    expect(await saveAccountProgram(db, 'u1', PLAN)).toBe('not_ready');
    expect(db.calls.some((c) => c.sql === SQL.save)).toBe(false);
  });

  it('once applied: reads the row, and writes with parameters only', async () => {
    const db = fakeDb(true, [{ question: 'q', edits: '{"days":4}', programId: 'abc123', done: { 'w1:d1': 'x' }, decisions: [], startedAt: new Date(0), updatedAt: new Date(0) }]);
    const r = await readAccountProgram(db, 'u1');
    expect(r).toMatchObject({ question: 'q', edits: { days: 4 }, programId: 'abc123' });
    expect(await saveAccountProgram(db, 'u1', PLAN)).toBe(true);
    const w = db.calls.find((c) => c.sql === SQL.save)!;
    expect(w.args[1]).toBe('u1');
    expect(w.sql).not.toContain('abc123');
  });

  it('shapes what is written: bad session keys, unknown edit keys, bad decisions and long questions are cut', () => {
    const v = shapeSave({
      question: 'x'.repeat(900), programId: 'abc123', edits: { days: 4, evil: 'drop table' },
      done: { 'w1:d1': '2026-11-03T10:00:00Z', 'DROP': '2026-11-03T10:00:00Z', 'w2:d1': 'not a date' },
      decisions: [{ afterWeek: 5, kind: 'advance' }, { afterWeek: 5, kind: 'skip' }, { afterWeek: -1, kind: 'repeat' }],
    })!;
    expect(v.question).toHaveLength(400);
    expect(v.edits).toEqual({ days: 4 });
    expect(Object.keys(v.done)).toEqual(['w1:d1']);
    expect(v.decisions).toEqual([{ afterWeek: 5, kind: 'advance' }]);
    expect(shapeSave({ question: 'q', programId: '../../x' })).toBeNull();
    expect(shapeSave(null)).toBeNull();
  });

  it('the phone and account copies merge for the same program only', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
    s.setItem(PROGRAM_DEVICE_KEY, JSON.stringify({ question: 'q', edits: {}, program: null, programId: 'abc123', savedAt: 'x', startedAt: null, done: { 'w1:d2': 'b' }, decisions: [] }));
    expect(mergeAccount(s, { ...PLAN, programId: 'other' })!.done).toEqual({ 'w1:d2': 'b' });
    const v = mergeAccount(s, PLAN)!;
    expect(Object.keys(v.done).sort()).toEqual(['w1:d1', 'w1:d2']);
    expect(readSaved(s)!.decisions).toEqual(PLAN.decisions);
  });

  it('the table is classified for export and erase, and the pending SQL touches nothing else', () => {
    expect(REGISTRY.AskedProgram.subjects).toEqual([expect.objectContaining({ col: 'userId', export: true, erase: 'delete' })]);
    const sql = readFileSync(join(__dirname, '../../prisma/pending/2026-11-03-program-ask.sql'), 'utf8').split('\n').filter((l) => !l.startsWith('--')).join('\n');
    expect(sql).not.toMatch(/\bDROP\b|ALTER TABLE "(?!AskedProgram)/);
    expect(sql).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\b/m);
  });
});
