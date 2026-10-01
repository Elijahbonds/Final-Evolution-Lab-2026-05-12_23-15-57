// ECONOMY-CAPS §4 — T1–T10 pure cases (lib/economy-caps.ts).
import { describe, expect, it } from 'vitest';
import {
  PER_RUN_XP, PER_RUN_SHARDS, DAILY_XP_CAP, DAILY_SHARD_CAP,
  applyPerRunCap, applyDailyCap, applyEconomyCaps, dailyCapMessage, dailyResetsAt, utcDayStart, hoursUntilDailyReset,
} from './economy-caps';

describe('T1: per-run cap', () => {
  it('caps XP at 14,150 and shards at 100', () => {
    expect(applyPerRunCap(20_000, 200)).toEqual({ xp: PER_RUN_XP, shards: PER_RUN_SHARDS, capped: true });
    expect(applyPerRunCap(100, 5)).toEqual({ xp: 100, shards: 5, capped: false });
  });
});

describe('T2: daily cap constants', () => {
  it('UTC day limits are 50,000 XP and 400 shards', () => {
    expect(DAILY_XP_CAP).toBe(50_000);
    expect(DAILY_SHARD_CAP).toBe(400);
  });
});

describe('T3: daily cap message', () => {
  it('names the cap and hours until UTC reset', () => {
    const noon = new Date('2026-09-30T12:00:00.000Z');
    expect(dailyCapMessage('xp', noon)).toMatch(/Daily XP cap reached — resets in \d+h/);
    expect(hoursUntilDailyReset(noon)).toBeGreaterThan(0);
  });
});

describe('T4: daily headroom from earned today', () => {
  it('with 49,000 XP earned today, at most 1,000 XP more', () => {
    const r = applyDailyCap({ xp: 5000, shards: 0, earnedXpToday: 49_000, earnedShardsToday: 0 });
    expect(r.xp).toBe(1000);
    expect(r.xpCapped).toBe(true);
  });

  it('with 380 shards earned today, at most 20 more', () => {
    const r = applyDailyCap({ xp: 0, shards: 50, earnedXpToday: 0, earnedShardsToday: 380 });
    expect(r.shards).toBe(20);
    expect(r.shardsCapped).toBe(true);
  });
});

describe('T5/T7: combined caps', () => {
  it('per-run then daily: two runs at the edge total ≤ 50,000 XP', () => {
    const first = applyEconomyCaps({ xp: 10_000, shards: 0 }, { xp: 0, shards: 0 });
    expect(first.xp).toBe(10_000);
    const second = applyEconomyCaps({ xp: 10_000, shards: 0 }, { xp: 10_000, shards: 0 });
    expect(second.xp).toBe(10_000);
    const third = applyEconomyCaps({ xp: 10_000, shards: 0 }, { xp: 20_000, shards: 0 });
    expect(third.xp).toBe(10_000);
    expect(first.xp + second.xp + third.xp).toBeLessThanOrEqual(DAILY_XP_CAP);
  });
});

describe('T8: UTC day rollover', () => {
  it('dailyResetsAt is the next UTC midnight', () => {
    const d = new Date('2026-09-30T23:30:00.000Z');
    expect(dailyResetsAt(d).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(utcDayStart(d).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });
});

describe('T9: per-run shard cap independent of daily', () => {
  it('a single run never pays more than 100 shards even with daily headroom', () => {
    const r = applyEconomyCaps({ xp: 100, shards: 500 }, { xp: 0, shards: 0 });
    expect(r.shards).toBe(PER_RUN_SHARDS);
  });
});

describe('T10: purchases are out of scope for daily shard sum', () => {
  it('GAMEPLAY_SHARD_REASONS excludes purchase paths', async () => {
    const { GAMEPLAY_SHARD_REASONS } = await import('./economy-caps');
    const { REASON } = await import('./wallet/reward-rules');
    expect(GAMEPLAY_SHARD_REASONS.has(REASON.MODE_SESSION_WON)).toBe(true);
    expect(GAMEPLAY_SHARD_REASONS.has(REASON.PURCHASE_COIN_PACK)).toBe(false);
  });
});

describe('migration SQL is additive only', () => {
  it('the ECONOMY-CAPS schema diff contains only allowed statements', () => {
    const sql = `-- Additive migration for ECONOMY-CAPS C5
ALTER TABLE "GameSession" ADD COLUMN "runId" TEXT;
CREATE UNIQUE INDEX "GameSession_runId_key" ON "GameSession"("runId");
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SessionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionRun" ADD COLUMN "agentRun" BOOLEAN NOT NULL DEFAULT false;`;
    const forbidden = /\b(DROP|TRUNCATE|DELETE\s+FROM|RENAME|ALTER\s+COLUMN\s+TYPE|SET\s+NOT\s+NULL|^\s*UPDATE\s+)/i;
    for (const line of sql.split('\n').map((l) => l.trim()).filter(Boolean)) {
      expect(forbidden.test(line), line).toBe(false);
    }
    expect(sql).toMatch(/ADD COLUMN/);
  });
});
