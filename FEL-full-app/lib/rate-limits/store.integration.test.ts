// RATE-LIMIT-WIRE (PR #289 QA rework): lib/rate-limits/store.ts against a REAL Postgres, through the real Prisma client.
//
// Opt-in and local-only, like the other *.integration.test.ts files: it runs when RATE_LIMITS_IT=1 and DATABASE_URL points
// at a database on 127.0.0.1 / localhost that is not fel_dev or fel — a throwaway one with
// prisma/pending/2026-10-16-rate-limits.sql applied — and is skipped everywhere else, CI included. What the in-memory
// stand-in cannot show, this does: the one-statement upsert really serialises concurrent hits (no two get the same
// count), the window is stored in UTC whatever the session's time zone (run it with the database's timezone set to
// America/Los_Angeles), and Prisma's real error for a missing table really makes the store fail open.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB_URL = process.env.DATABASE_URL ?? '';
const LOCAL_DB = /^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?!fel_dev(?:[?]|$)|fel(?:[?]|$))[\w-]+(?:\?.*)?$/.test(DB_URL);
const RUN = process.env.RATE_LIMITS_IT === '1' && LOCAL_DB;

let prisma: any;
let store: typeof import('./store');
const TAG = `it${Date.now().toString(36)}`;

describe.skipIf(!RUN)('rate_limits on a real Postgres', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/db'));
    store = await import('./store');
    store.resetRateLimitStore();
  });
  afterAll(async () => {
    await prisma?.$executeRawUnsafe(`DELETE FROM "rate_limits" WHERE "bucket" LIKE $1`, `${TAG}%`);
    await prisma?.$disconnect();
  });

  it('counts one bucket in order and refuses past the limit', async () => {
    const rule = { limit: 3, windowMs: 60_000 };
    const seen = [];
    for (let i = 0; i < 5; i++) seen.push(await store.hitBucket(prisma, `${TAG}:seq`, rule));
    expect(seen.map((h) => [h.ok, h.hits, h.store])).toEqual([
      [true, 1, 'table'], [true, 2, 'table'], [true, 3, 'table'], [false, 4, 'table'], [false, 5, 'table'],
    ]);
    expect(seen[4].retryAfterSec).toBeGreaterThanOrEqual(59);
    expect(seen[4].retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('50 hits at once on one bucket: counts 1..50, each exactly once, and exactly `limit` allowed', async () => {
    const rule = { limit: 20, windowMs: 60_000 };
    const all = await Promise.all(Array.from({ length: 50 }, () => store.hitBucket(prisma, `${TAG}:burst`, rule)));
    expect(all.every((h) => h.store === 'table')).toBe(true);
    expect(all.map((h) => h.hits).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(all.filter((h) => h.ok)).toHaveLength(20);
  });

  it('reset_at is stored in UTC, whatever the session time zone', async () => {
    const [{ tz }] = await prisma.$queryRawUnsafe(`SELECT current_setting('TimeZone') AS tz`);
    const before = Date.now();
    await store.hitBucket(prisma, `${TAG}:utc`, { limit: 5, windowMs: 120_000 });
    const [{ resetAt }] = await prisma.$queryRawUnsafe(`SELECT "reset_at" AS "resetAt" FROM "rate_limits" WHERE "bucket" = $1`, `${TAG}:utc`);
    // Prisma reads a TIMESTAMP(3) as UTC; a zone slip would put this hours away
    expect(Math.abs(new Date(resetAt).getTime() - (before + 120_000)), `session TimeZone ${tz}`).toBeLessThan(5_000);
  });

  it('the window closes on the database clock and the same row opens the next one at 1', async () => {
    const rule = { limit: 1, windowMs: 1_000 };
    expect((await store.hitBucket(prisma, `${TAG}:roll`, rule)).hits).toBe(1);
    expect((await store.hitBucket(prisma, `${TAG}:roll`, rule)).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 1_200));
    const next = await store.hitBucket(prisma, `${TAG}:roll`, rule);
    expect([next.ok, next.hits]).toEqual([true, 1]);
    const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "rate_limits" WHERE "bucket" = $1`, `${TAG}:roll`);
    expect(n).toBe(1);
  });

  it('the sweep deletes rows whose window closed over an hour ago, and keeps live ones', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "rate_limits" ("bucket", "hits", "reset_at") VALUES ($1, 9, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '2 hours')`,
      `${TAG}:old`,
    );
    await store.hitBucket(prisma, `${TAG}:live`, { limit: 5, windowMs: 60_000 });
    await prisma.$executeRawUnsafe(store.SWEEP_SQL);
    const rows = await prisma.$queryRawUnsafe(`SELECT "bucket" FROM "rate_limits" WHERE "bucket" IN ($1, $2) ORDER BY 1`, `${TAG}:live`, `${TAG}:old`);
    expect(rows).toEqual([{ bucket: `${TAG}:live` }]);
  });

  it('without the table, Prisma\'s real error makes the store fail open (allowed, logged, never a throw)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "rate_limits" RENAME TO "rate_limits_${TAG}"`);
    try {
      store.resetRateLimitStore();
      const hit = await store.hitBucket(prisma, `${TAG}:gone`, { limit: 5, windowMs: 60_000 });
      expect([hit.ok, hit.store]).toEqual([true, 'open']);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[rate-limits\] table_missing_failing_open /);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "rate_limits_${TAG}" RENAME TO "rate_limits"`);
      store.resetRateLimitStore();
      warn.mockRestore();
    }
  });
});
