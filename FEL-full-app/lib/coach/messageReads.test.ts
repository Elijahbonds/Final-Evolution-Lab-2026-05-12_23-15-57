// COACH-AI Phase 8 (2026-10-07): the read markers WITH and WITHOUT ProgramMessage.readAt (the pending SQL applied or
// not), the messages routes on top of them, and the view helpers. The database is an in-memory stand-in that answers
// the four statements lib/coach/messageReads.ts sends; scripts/probes/ has no Postgres here, so the SQL text itself
// was also run against a throwaway Postgres 16 by hand (see the lane report).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROBE_TTL_MS, decorateThread, markThreadRead, readMarkersReady, resetReadMarkerProbe, threadReadStates, unreadCounts,
  type RawDb,
} from './messageReads';
import { clearProgram, markReadIfNeeded, seenMessageId, unreadBadge, unreadInThread } from './messageReadsView';

interface Row { id: string; programId: string; authorId: string; body: string; createdAt: Date; readAt?: Date | null }
const PROGRAMS = [
  { id: 'p1', coachId: 'coach', clientId: 'teen' },
  { id: 'p2', coachId: 'coach', clientId: 'adult' },
  { id: 'p3', coachId: 'other-coach', clientId: 'someone' },
];

/** Postgres-shaped stand-in. `column` false = the pending SQL is not applied: any statement naming readAt throws 42703. */
function fakeDb(rows: Row[], state: { column: boolean }): RawDb & { calls: string[] } {
  const calls: string[] = [];
  const undefinedColumn = () => Object.assign(new Error('column "readAt" does not exist'), { name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { code: '42703' } }); // the shape measured on Postgres 16
  return {
    calls,
    async $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> {
      calls.push(q);
      if (q.includes('information_schema')) return (state.column ? [{ ok: 1 }] : []) as T;
      if (!state.column) throw undefinedColumn();
      if (q.includes('COUNT(*)')) {
        const me = v[0] as string;
        const mine = new Set(PROGRAMS.filter((p) => p.coachId === me || p.clientId === me).map((p) => p.id));
        const by = new Map<string, number>();
        for (const r of rows) if (mine.has(r.programId) && r.authorId !== me && !r.readAt) by.set(r.programId, (by.get(r.programId) ?? 0) + 1);
        return [...by].map(([programId, n]) => ({ programId, n })) as T;
      }
      if (q.startsWith('SELECT "id", "readAt"')) return rows.filter((r) => r.programId === v[0]).map((r) => ({ id: r.id, readAt: r.readAt ?? null })) as T;
      throw new Error(`unexpected query ${q}`);
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      calls.push(q);
      if (!state.column) throw undefinedColumn();
      let n = 0;
      for (const r of rows) if (r.programId === v[0] && r.authorId !== v[1] && !r.readAt) { r.readAt = new Date('2026-10-07T12:00:00Z'); n++; }
      return n;
    },
  };
}

const seed = (): Row[] => [
  { id: 'm1', programId: 'p1', authorId: 'coach', body: 'Rest day today', createdAt: new Date('2026-10-06') },
  { id: 'm2', programId: 'p1', authorId: 'coach', body: 'How did it feel?', createdAt: new Date('2026-10-06T01:00:00Z') },
  { id: 'm3', programId: 'p1', authorId: 'teen', body: 'Good', createdAt: new Date('2026-10-06T02:00:00Z') },
  { id: 'm4', programId: 'p2', authorId: 'adult', body: 'Done', createdAt: new Date('2026-10-06T03:00:00Z') },
  { id: 'm5', programId: 'p3', authorId: 'someone', body: 'not yours', createdAt: new Date('2026-10-06T04:00:00Z') },
];

beforeEach(() => resetReadMarkerProbe());

describe('WITHOUT the column (pending SQL not applied: production today, and CI)', () => {
  it('every call answers "not available"; nothing throws, nothing is written', async () => {
    const rows = seed();
    const db = fakeDb(rows, { column: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await readMarkersReady(db)).toBe(false);
    expect(await unreadCounts(db, 'teen')).toEqual({ available: false });
    expect(await markThreadRead(db, 'p1', 'teen')).toEqual({ available: false, marked: 0 });
    expect(await threadReadStates(db, 'p1')).toBeNull();
    // only the probe ran: no statement naming the missing column was sent
    expect(db.calls.every((q) => q.includes('information_schema'))).toBe(true);
    expect(rows.every((r) => r.readAt === undefined)).toBe(true);
    warn.mockRestore();
  });

  it('the thread decorates to exactly the old shape (no readAt, no unread) — the views show what they always did', () => {
    const out = decorateThread(seed().filter((r) => r.programId === 'p1'), 'teen', 'coach', null);
    expect(out[0]).toEqual({ ...seed()[0], mine: false, fromCoach: true });
    expect(out.some((m) => 'unread' in m || 'readAt' in m)).toBe(false);
    expect(unreadInThread(out)).toBeNull();
    expect(seenMessageId(out)).toBeNull();
    expect(unreadBadge({ available: false }, 'p1')).toBeNull();
  });

  it('the probe is asked again after PROBE_TTL_MS, so applying the SQL switches the markers on without a deploy', async () => {
    const state = { column: false };
    const db = fakeDb(seed(), state);
    expect(await readMarkersReady(db, 1_000)).toBe(false);
    state.column = true;
    expect(await readMarkersReady(db, 1_000 + PROBE_TTL_MS - 1)).toBe(false); // cached "no"
    expect(await readMarkersReady(db, 1_000 + PROBE_TTL_MS)).toBe(true);
  });

  it('a probe that throws (database down) is "not available", not a 500', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = { $queryRawUnsafe: async () => { throw new Error('connection refused'); }, $executeRawUnsafe: async () => 0 } as RawDb;
    expect(await unreadCounts(db, 'teen')).toEqual({ available: false });
    expect(warn.mock.calls[0][0]).toMatch(/^\[coach\] message_reads_probe_failed/);
    warn.mockRestore();
  });

  it('the column vanishing after a "yes" (a rollback) degrades too, and the next call re-probes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = { column: true };
    const db = fakeDb(seed(), state);
    expect(await readMarkersReady(db, 0)).toBe(true);
    state.column = false;
    expect(await unreadCounts(db, 'teen', 10)).toEqual({ available: false });
    expect(await readMarkersReady(db, 10 + PROBE_TTL_MS)).toBe(false);
    // the log line names the event and the error class/code only: no user id, no program id, no message text
    for (const [line] of warn.mock.calls) expect(String(line)).not.toMatch(/teen|p1|Rest day/);
    warn.mockRestore();
  });
});

describe('WITH the column (pending SQL applied)', () => {
  it('unread counts are the OTHER side\'s unread messages in MY threads, by program', async () => {
    const db = fakeDb(seed(), { column: true });
    expect(await unreadCounts(db, 'teen')).toEqual({ available: true, total: 2, byProgram: { p1: 2 } });
    expect(await unreadCounts(db, 'coach')).toEqual({ available: true, total: 2, byProgram: { p1: 1, p2: 1 } });
    expect(await unreadCounts(db, 'stranger')).toEqual({ available: true, total: 0, byProgram: {} });
  });

  it('opening a thread marks only the other side\'s messages, once', async () => {
    const rows = seed();
    const db = fakeDb(rows, { column: true });
    expect(await markThreadRead(db, 'p1', 'teen')).toEqual({ available: true, marked: 2 });
    expect(rows.find((r) => r.id === 'm3')!.readAt).toBeUndefined(); // the teen's own message is not "read" by the teen
    expect(await markThreadRead(db, 'p1', 'teen')).toEqual({ available: true, marked: 0 });
    expect(await unreadCounts(db, 'teen')).toEqual({ available: true, total: 0, byProgram: {} });
    expect(await unreadCounts(db, 'coach')).toEqual({ available: true, total: 2, byProgram: { p1: 1, p2: 1 } });
  });

  it('the thread carries unread for the reader and "Seen" for the writer', async () => {
    const rows = seed();
    const db = fakeDb(rows, { column: true });
    const p1 = rows.filter((r) => r.programId === 'p1');
    const teenView = decorateThread(p1, 'teen', 'coach', await threadReadStates(db, 'p1'));
    expect(teenView.map((m) => (m as { unread?: boolean }).unread)).toEqual([true, true, false]);
    expect(unreadInThread(teenView)).toBe(2);
    await markThreadRead(db, 'p1', 'teen');
    const coachView = decorateThread(p1, 'coach', 'coach', await threadReadStates(db, 'p1'));
    expect(seenMessageId(coachView)).toBe('m2');
    expect(coachView[1]).toMatchObject({ readAt: '2026-10-07T12:00:00.000Z', unread: false });
    expect(coachView[2]).toMatchObject({ unread: true }); // the teen's reply, not yet opened by the coach
  });

  it('parameters, never string-built: the user and program ids go as values, not into the SQL text', async () => {
    const db = fakeDb(seed(), { column: true });
    const evil = `x' OR '1'='1`;
    await unreadCounts(db, evil);
    await markThreadRead(db, evil, evil);
    await threadReadStates(db, evil);
    expect(db.calls.some((q) => q.includes(evil))).toBe(false);
  });
});

describe('the view helpers', () => {
  it('unreadBadge: a number only for a positive count with markers on', () => {
    expect(unreadBadge(null, 'p1')).toBeNull();
    expect(unreadBadge({ available: true, total: 0, byProgram: {} }, 'p1')).toBeNull();
    expect(unreadBadge({ available: true, total: 3, byProgram: { p1: 3 } }, 'p1')).toBe(3);
  });

  it('clearProgram drops one program and its share of the total', () => {
    expect(clearProgram({ available: true, total: 5, byProgram: { p1: 3, p2: 2 } }, 'p1')).toEqual({ available: true, total: 2, byProgram: { p2: 2 } });
    expect(clearProgram({ available: false }, 'p1')).toEqual({ available: false });
  });

  it('seenMessageId: only my NEWEST message, only once read', () => {
    expect(seenMessageId([{ id: 'a', body: '', mine: true, fromCoach: true, readAt: '2026' }, { id: 'b', body: '', mine: true, fromCoach: true, readAt: null }])).toBeNull();
    expect(seenMessageId([{ id: 'a', body: '', mine: true, fromCoach: true, readAt: '2026' }, { id: 'b', body: '', mine: false, fromCoach: false }])).toBe('a');
  });

  describe('markReadIfNeeded', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;
    beforeEach(() => { fetchSpy = vi.fn(async () => new Response(JSON.stringify({ available: true, marked: 1 }))); vi.stubGlobal('fetch', fetchSpy); });
    afterEach(() => vi.unstubAllGlobals());

    it('posts only when the thread has unread messages', async () => {
      expect(await markReadIfNeeded('/api/coach/messages/read', 'p1', [{ id: 'a', body: '', mine: false, fromCoach: true }])).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await markReadIfNeeded('/api/coach/messages/read', 'p1', [{ id: 'a', body: '', mine: false, fromCoach: true, unread: true }])).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith('/api/coach/messages/read', expect.objectContaining({ method: 'POST', body: JSON.stringify({ programId: 'p1' }) }));
    });

    it('a failed post resolves false, never throws', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('offline'));
      expect(await markReadIfNeeded('/x', 'p1', [{ id: 'a', body: '', mine: false, fromCoach: true, unread: true }])).toBe(false);
    });
  });
});
