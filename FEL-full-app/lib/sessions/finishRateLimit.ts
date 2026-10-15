// lib/sessions/finishRateLimit.ts — RATE-LIMIT-WIRE (QA top-5 #4, PM ruling 2026-10-15), PARTIAL: the finish is limited per user on a count the database
// already keeps, so every server instance sees the same number (no shared store, no new dependency, no schema change):
// the user's GameSession rows (one per recorded finish) over the last window, read on GameSession's existing
// @@index([userId, createdAt]). Start, season claim and arena submit have no (user, time) index to count on: they wait
// for a migration (Elijah's call). Wallet earn already counts CreditLedger the same way (lib/economy withinEarnVelocity).
import { RUN_RATE_LIMITS } from './runRateLimit';

export interface CountGate { ok: boolean; count: number; limit: number; retryAfterSec: number }

export async function finishCountGate(db: unknown, userId: string, now: Date = new Date()): Promise<CountGate> {
  const l = RUN_RATE_LIMITS.finish;
  const since = new Date(now.getTime() - l.windowMs);
  const count: number = await (db as any).gameSession.count({ where: { userId, createdAt: { gte: since } } });
  return { ok: count < l.perUser, count, limit: l.perUser, retryAfterSec: Math.ceil(l.windowMs / 1000) };
}
