// STREAK-CLAIM-RACE, at its new address (lib/streak/claim.ts, moved unchanged from app/api/sessions/route.ts for the
// daily drill). The route's own tests (lib/sessions-route.test.ts) still drive it through POST /api/sessions; this pins
// the four branches directly, as the writes they make.
import { describe, expect, it } from 'vitest';
import { claimPlayStreak } from './claim';
import { streakStep } from '@/lib/session-payout';

const T = new Date('2026-10-24T18:00:00Z');
const H = 3_600_000;
function tx(count: number) {
  const calls: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  return { calls, playerProfile: { updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => { calls.push(a); return { count }; } } };
}

describe('claimPlayStreak', () => {
  it('due: conditional on the lastStreakAt it read; writes the day and both stamps', async () => {
    const seen = { streakDays: 2, lastStreakAt: new Date(T.getTime() - 30 * H), lastActiveAt: new Date(T.getTime() - 30 * H) };
    const t = tx(1);
    expect(await claimPlayStreak(t, 'u', seen, streakStep(seen, T.getTime()), T)).toBe(true);
    expect(t.calls).toEqual([{ where: { userId: 'u', lastStreakAt: seen.lastStreakAt }, data: { streakDays: 3, lastStreakAt: T, lastActiveAt: T } }]);
  });

  it('due but lost (another writer moved lastStreakAt): false', async () => {
    const seen = { streakDays: 2, lastStreakAt: new Date(T.getTime() - 30 * H), lastActiveAt: new Date(T.getTime() - 30 * H) };
    expect(await claimPlayStreak(tx(0), 'u', seen, streakStep(seen, T.getTime()), T)).toBe(false);
  });

  it('owed (a creation opened the day): conditional on both stamps, writes only lastActiveAt', async () => {
    const seen = { streakDays: 2, lastStreakAt: new Date(T.getTime() - 2 * H), lastActiveAt: new Date(T.getTime() - 26 * H) };
    const t = tx(1);
    const step = streakStep(seen, T.getTime());
    expect(step.owed).toBe(true);
    expect(await claimPlayStreak(t, 'u', seen, step, T)).toBe(true);
    expect(t.calls[0]).toEqual({ where: { userId: 'u', lastStreakAt: seen.lastStreakAt, lastActiveAt: seen.lastActiveAt }, data: { lastActiveAt: T } });
  });

  it('neither: no streak write, lastActiveAt only forward, and never a claim', async () => {
    const seen = { streakDays: 2, lastStreakAt: new Date(T.getTime() - 2 * H), lastActiveAt: new Date(T.getTime() - 2 * H) };
    const t = tx(1);
    expect(await claimPlayStreak(t, 'u', seen, streakStep(seen, T.getTime()), T)).toBe(false);
    expect(t.calls).toEqual([{ where: { userId: 'u', lastActiveAt: { lt: T } }, data: { lastActiveAt: T } }]);
  });
});
