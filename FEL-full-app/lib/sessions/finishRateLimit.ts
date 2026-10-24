// lib/sessions/finishRateLimit.ts — RATE-LIMIT-WIRE (QA top-5 #4, PM ruling 2026-10-15; rebuilt on release 2026-10-23):
// the finish is limited per user on a count the database already keeps, so every server instance sees the same number
// (no new table for it): the user's GameSession rows (one per recorded finish) over the last window, read on
// GameSession's existing @@index([userId, createdAt]). Start, season claim, Arena submit, login and signup count in the
// shared rate_limits table (lib/rate-limits). Wallet earn already counts CreditLedger the same way (lib/economy
// withinEarnVelocity).
//
// FAIL OPEN: if the count cannot be read (no database, a stand-in without `gameSession.count`), the finish is allowed
// and one warn line says so; the limit never turns a finish into a 500 of its own.
import { RUN_RATE_LIMITS } from './runRateLimit';

export interface CountGate { ok: boolean; count: number | null; limit: number; retryAfterSec: number }

export async function finishCountGate(db: unknown, userId: string, now: Date = new Date()): Promise<CountGate> {
  const l = RUN_RATE_LIMITS.finish;
  const since = new Date(now.getTime() - l.windowMs);
  const retryAfterSec = Math.ceil(l.windowMs / 1000);
  try {
    const count = Number(await (db as any).gameSession.count({ where: { userId, createdAt: { gte: since } } }));
    if (!Number.isFinite(count)) throw Object.assign(new Error('no count'), { name: 'NoCount' });
    return { ok: count < l.perUser, count, limit: l.perUser, retryAfterSec };
  } catch (e) {
    const name = e && typeof e === 'object' && typeof (e as { name?: unknown }).name === 'string' ? (e as { name: string }).name : typeof e;
    console.warn(`[rate-limits] finish_count_failed_failing_open ${/^[A-Za-z0-9_.-]{1,64}$/.test(name) ? name : 'Error'}`);
    return { ok: true, count: null, limit: l.perUser, retryAfterSec };
  }
}
