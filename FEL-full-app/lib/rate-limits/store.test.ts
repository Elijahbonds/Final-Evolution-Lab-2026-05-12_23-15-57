// RATE-LIMIT-WIRE (PR #289 QA rework; rebuilt on release as lane/rate-limits, 2026-10-23): the counts live in ONE table every server instance shares (rate_limits), not in
// each instance's memory. These drive lib/rate-limits/store.ts against tests/helpers/fakeRateLimitTable.ts, which answers
// the store's two statements with Postgres's semantics; store.integration.test.ts runs them on a real Postgres.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRateLimitTable, hitsSent } from '@/tests/helpers/fakeRateLimitTable';
import { bucketKey, HIT_SQL, hitBucket, resetRateLimitStore, SWEEP_EVERY_MS, SWEEP_SQL } from './store';
import { PROBE_TTL_MS } from '@/lib/coach/pendingSchema';

const RULE = { limit: 3, windowMs: 60_000 };
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetRateLimitStore();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('the shared table', () => {
  it('counts one bucket up to the limit, refuses past it, and says when the window closes', async () => {
    const db = fakeRateLimitTable();
    const t0 = Date.now();
    const seen = [];
    for (let i = 0; i < 5; i++) seen.push(await hitBucket(db, 'b', RULE, t0));
    expect(seen.map((h) => [h.ok, h.hits, h.store])).toEqual([
      [true, 1, 'table'], [true, 2, 'table'], [true, 3, 'table'], [false, 4, 'table'], [false, 5, 'table'],
    ]);
    expect(seen[3].retryAfterSec).toBe(60);
    db.clock += 45_000;
    expect((await hitBucket(db, 'b', RULE, t0)).retryAfterSec).toBe(15);
  });

  it('the window is the database\'s clock: once it closes, the same row opens the next window at 1', async () => {
    const db = fakeRateLimitTable();
    for (let i = 0; i < 4; i++) await hitBucket(db, 'b', RULE);
    db.clock += 60_000;
    const next = await hitBucket(db, 'b', RULE);
    expect([next.ok, next.hits]).toEqual([true, 1]);
    expect(db.rows.size).toBe(1);
  });

  it('TWO SERVER INSTANCES share one count — the reason for the table (QA: counts lived in each server\'s memory)', async () => {
    const db = fakeRateLimitTable();
    vi.resetModules();
    const a = await import('./store');
    vi.resetModules();
    const b = await import('./store');
    expect(a.hitBucket).not.toBe(b.hitBucket);   // two module instances, two memories, as on two servers
    const got = [];
    for (let i = 0; i < 4; i++) got.push((await (i % 2 ? b : a).hitBucket(db, 'b', RULE)).ok);
    expect(got).toEqual([true, true, true, false]);   // 3 allowed in all, not 3 per instance
  });

  it('…and without the table each instance counts nothing: every hit is allowed (fail open), as before this lane', async () => {
    const db = fakeRateLimitTable();
    db.missing = true;
    vi.resetModules();
    const a = await import('./store');
    vi.resetModules();
    const b = await import('./store');
    const got = [];
    for (let i = 0; i < 6; i++) got.push((await (i % 2 ? b : a).hitBucket(db, 'b', RULE)).ok);
    expect(got).toEqual([true, true, true, true, true, true]);
  });

  it('the bucket and the window are VALUES ($1, $2); the SQL text is the constant statement, never request text', async () => {
    const db = fakeRateLimitTable();
    const key = bucketKey('signup', 'email', "o'brien@fel.test'; DROP TABLE \"User\"; --");
    await hitBucket(db, key, RULE);
    expect(hitsSent(db)).toEqual([{ sql: HIT_SQL, values: [key, 60_000] }]);
    expect(HIT_SQL).not.toMatch(/brien|DROP/);
    expect(HIT_SQL).toMatch(/\$1/);
    expect(HIT_SQL).toMatch(/\$2::int/);
    expect(HIT_SQL).toMatch(/ON CONFLICT \("bucket"\) DO UPDATE/);
  });

  it('a bucket holds no email, address or account id in the clear', () => {
    const k = bucketKey('login', 'email', 'person@fel.test');
    expect(k).toMatch(/^login:email:[A-Za-z0-9_-]{32}$/);
    expect(k).not.toContain('person');
    expect(bucketKey('login', 'email', 'person@fel.test')).toBe(k);                 // stable, so the window holds
    expect(bucketKey('login', 'email', 'other@fel.test')).not.toBe(k);
    expect(bucketKey('signup', 'email', 'person@fel.test')).not.toBe(k);           // per route
    expect(bucketKey('login', 'ip', '203.0.113.9')).not.toContain('203.0.113');
  });

  it('dead rows are swept at most once every 10 minutes per server, on the reset_at index', async () => {
    const db = fakeRateLimitTable();
    const t0 = 1_000_000_000_000;
    await hitBucket(db, 'a', RULE, t0);
    await hitBucket(db, 'b', RULE, t0 + 1000);
    await new Promise((r) => setTimeout(r, 0));
    expect(db.calls.filter((c) => c.sql === SWEEP_SQL)).toHaveLength(1);
    await hitBucket(db, 'c', RULE, t0 + SWEEP_EVERY_MS);
    await new Promise((r) => setTimeout(r, 0));
    expect(db.calls.filter((c) => c.sql === SWEEP_SQL)).toHaveLength(2);
    expect(SWEEP_SQL).toMatch(/WHERE "reset_at" < /);
  });
});

describe('FAIL OPEN: before the table exists, or when the database fails, the request is allowed and one line is logged', () => {
  it('no table yet (42P01): every hit is allowed, one line is logged, the table is not asked again until PROBE_TTL_MS', async () => {
    const db = fakeRateLimitTable();
    db.missing = true;
    const t0 = 2_000_000_000_000;
    const seen = [];
    for (let i = 0; i < 2 * RULE.limit; i++) seen.push(await hitBucket(db, 'm', RULE, t0 + i));
    expect(seen.every((h) => h.ok && h.store === 'open' && h.hits === null)).toBe(true);   // well past the limit, all allowed
    expect(hitsSent(db)).toHaveLength(1);                     // asked once, then not again inside PROBE_TTL_MS
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe('[rate-limits] table_missing_failing_open PrismaClientKnownRequestError P2010');
    db.missing = false;                                       // the owner applies the SQL
    const after = await hitBucket(db, 'm2', RULE, t0 + PROBE_TTL_MS);
    expect([after.ok, after.store, after.hits]).toEqual([true, 'table', 1]);
  });

  it('the database cannot be reached: this request is allowed and logged (no address in the line), the next one tries the table', async () => {
    const db = fakeRateLimitTable();
    const real = db.$queryRawUnsafe;
    db.$queryRawUnsafe = (async () => { throw Object.assign(new Error('Can\'t reach database server at 10.0.0.1:5432'), { name: 'PrismaClientInitializationError' }); }) as typeof real;
    const failed = await hitBucket(db, 'x', RULE);
    expect([failed.ok, failed.store]).toEqual([true, 'open']);
    expect(String(warn.mock.calls[0][0])).toBe('[rate-limits] hit_failed_failing_open PrismaClientInitializationError');
    expect(String(warn.mock.calls[0][0])).not.toContain('10.0.0.1');
    db.$queryRawUnsafe = real;
    expect((await hitBucket(db, 'x', RULE)).store).toBe('table');
  });

  it('an answer with no count (a broken statement) is not a refusal: allowed and logged', async () => {
    const db = fakeRateLimitTable();
    db.$queryRawUnsafe = (async () => []) as typeof db.$queryRawUnsafe;
    const hit = await hitBucket(db, 'y', RULE);
    expect([hit.ok, hit.store]).toEqual([true, 'open']);
    expect(String(warn.mock.calls[0][0])).toBe('[rate-limits] hit_failed_failing_open NoCount');
  });

  it('a stand-in that is not a database client (no raw SQL) is allowed, silently — the real client always has raw SQL', async () => {
    const seen = [];
    for (let i = 0; i < 2 * RULE.limit; i++) seen.push((await hitBucket({ user: {} }, 'stub', RULE)).ok);
    expect(seen.every(Boolean)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect((await hitBucket(undefined, 'stub', RULE)).store).toBe('open');
  });
});
