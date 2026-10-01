/**
 * lib/economy-caps.ts — ECONOMY-CAPS (2026-09-30): per-run and per-UTC-day XP/shard ceilings (C1–C4).
 * PURE: no DB, no network. The route applies these after sessionPayout and before grants.
 *
 * C1: every paying run caps at PER_RUN_XP / PER_RUN_SHARDS (beside ENDLESS_SESSION_CEILING in session-payout.ts).
 * C2: every player per UTC calendar day (00:00–24:00 UTC) caps at DAILY_XP_CAP / DAILY_SHARD_CAP.
 * C3: the end card names the cap and when it resets (dailyCapMessage).
 * C6: fail closed — if the daily sum query fails, pay 0 and log CAP_CHECK_FAILED.
 * C7: logs only; no secrets in messages.
 */

import { SHARD_REASONS } from '@/lib/wallet/reward-rules';

/** C1 — per run, every mode. */
export const PER_RUN_XP = 14_150;
export const PER_RUN_SHARDS = 100;

/** C2 — per player per UTC calendar day. */
export const DAILY_XP_CAP = 50_000;
export const DAILY_SHARD_CAP = 400;

/** Gameplay wallet shard earns that count toward the C2 daily shard cap (purchases/refunds/admin excluded). */
export const GAMEPLAY_SHARD_REASONS: ReadonlySet<string> = SHARD_REASONS;

/** UTC midnight at or before `d`. */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** When the current UTC day ends (next midnight UTC). */
export function dailyResetsAt(now: Date): Date {
  const start = utcDayStart(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Whole hours until the UTC day rolls over (at least 1 when still today). */
export function hoursUntilDailyReset(now: Date): number {
  const ms = dailyResetsAt(now).getTime() - now.getTime();
  return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
}

/** C3 — end-card copy when a daily cap blocks further XP or shards. */
export function dailyCapMessage(kind: 'xp' | 'shards', now: Date): string {
  const h = hoursUntilDailyReset(now);
  const label = kind === 'xp' ? 'XP' : 'shards';
  return `Daily ${label} cap reached — resets in ${h}h`;
}

export interface PerRunCapResult {
  xp: number;
  shards: number;
  capped: boolean;
}

/** C1 — trim a planned payout to the per-run ceiling. */
export function applyPerRunCap(xp: number, shards: number): PerRunCapResult {
  const cx = Math.min(Math.max(0, xp), PER_RUN_XP);
  const cs = Math.min(Math.max(0, shards), PER_RUN_SHARDS);
  return { xp: cx, shards: cs, capped: cx < xp || cs < shards };
}

export interface DailyCapInput {
  xp: number;
  shards: number;
  earnedXpToday: number;
  earnedShardsToday: number;
}

export interface DailyCapResult {
  xp: number;
  shards: number;
  xpCapped: boolean;
  shardsCapped: boolean;
  dailyXpCapHit: boolean;
  dailyShardCapHit: boolean;
}

/** C2 — trim a planned payout so today's totals stay within the daily caps. */
export function applyDailyCap(o: DailyCapInput): DailyCapResult {
  const xpHeadroom = Math.max(0, DAILY_XP_CAP - Math.max(0, o.earnedXpToday));
  const shardHeadroom = Math.max(0, DAILY_SHARD_CAP - Math.max(0, o.earnedShardsToday));
  const xp = Math.min(Math.max(0, o.xp), xpHeadroom);
  const shards = Math.min(Math.max(0, o.shards), shardHeadroom);
  return {
    xp,
    shards,
    xpCapped: xp < o.xp,
    shardsCapped: shards < o.shards,
    dailyXpCapHit: xpHeadroom === 0 && o.xp > 0,
    dailyShardCapHit: shardHeadroom === 0 && o.shards > 0,
  };
}

/** Apply C1 then C2 in order. */
export function applyEconomyCaps(
  planned: { xp: number; shards: number },
  earnedToday: { xp: number; shards: number },
): DailyCapResult & { perRunCapped: boolean } {
  const perRun = applyPerRunCap(planned.xp, planned.shards);
  const daily = applyDailyCap({
    xp: perRun.xp,
    shards: perRun.shards,
    earnedXpToday: earnedToday.xp,
    earnedShardsToday: earnedToday.shards,
  });
  return { ...daily, perRunCapped: perRun.capped };
}
