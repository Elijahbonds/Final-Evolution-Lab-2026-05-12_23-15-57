/**
 * lib/arena-teen.ts — ARENA-AGE-1 teen practice Arena (Cyber addendum T1-T3, EASE-OF-USE R2-1 ease2.arenaNoBet).
 *
 * A teen (or unknown-age) account plays a TEEN_PRACTICE duel against a House Rival only (PM decision 2, 2026-11-04: no
 * teen-vs-teen lobby, so a teen is never paired with an adult and there is no chat surface to switch off — T4):
 *   - T1: no entry of any kind — entryFeeCents 0, rakePercent 0, no arenaLockEntry; a teen duel never debits LC.
 *   - T2: a win pays a FIXED, game-funded prize set here on the server. No pot, no house cut, nothing tied to what
 *         anyone else put in. A loss or a tie pays nothing and takes nothing.
 *   - T3: a server-enforced daily prize cap (UTC day), counted from the wallet ledger under the player's row lock
 *         (lib/economy-caps-db.ts lockPlayerForDailyCap), so concurrent submits can't each read the same headroom.
 *         The score is server-verified before any prize (submit-score: readDuelRun / checkStakeScore).
 * No schema change: matchType is a free string on CompetitionMatch.
 */
import { applyLc } from '@/lib/wallet/wallet-service';
import { lockPlayerForDailyCap } from '@/lib/economy-caps-db';
import { utcDayStart } from '@/lib/economy-caps';

export const TEEN_PRACTICE = 'TEEN_PRACTICE';
export const TEEN_PRIZE_REASON = 'ARENA_TEEN_PRIZE';
export const TEEN_PRACTICE_EXPIRED_REASON = 'teen_practice_expired';
/** Open (unplayed) practice duels one account may hold at once. */
export const TEEN_MAX_OPEN = 5;

// TUNE(elijah): PENDING ELIJAH APPROVAL. PM set 25 per win and 100 per UTC day on 2026-11-04. Both are server-side
// settings: TEEN_ARENA_PRIZE_LC / TEEN_ARENA_DAILY_LC_CAP override them; an unusable value falls back to the default.
export const TEEN_PRIZE_DEFAULT = 25;
export const TEEN_DAILY_CAP_DEFAULT = 100;
const PRIZE_MAX = 100;
const CAP_MAX = 1000;

function intSetting(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
}

export function teenPrizeLc(env: Record<string, string | undefined> = process.env): number {
  return intSetting(env.TEEN_ARENA_PRIZE_LC, TEEN_PRIZE_DEFAULT, PRIZE_MAX);
}

export function teenDailyCapLc(env: Record<string, string | undefined> = process.env): number {
  return intSetting(env.TEEN_ARENA_DAILY_LC_CAP, TEEN_DAILY_CAP_DEFAULT, CAP_MAX);
}

export function isTeenPractice(m: { matchType?: string | null } | null | undefined): boolean {
  return m?.matchType === TEEN_PRACTICE;
}

/** Pure: what a win pays given what was already won today. Never negative, never above the prize. */
export function teenPrizeFor(earnedToday: number, prize = teenPrizeLc(), cap = teenDailyCapLc()): number {
  const room = Math.max(0, cap - Math.max(0, earnedToday));
  return Math.min(prize, room);
}

/**
 * Pay a teen practice win, inside the submit transaction. Locks the player's row first (daily-cap TOCTOU), sums today's
 * prizes, and pays what fits under the cap. Idempotent per match (one prize per duel, ever).
 */
export async function awardTeenPrize(
  tx: any,
  a: { userId: string; matchId: string; now?: Date },
): Promise<{ awarded: number; capped: boolean }> {
  const now = a.now ?? new Date();
  await lockPlayerForDailyCap(tx, a.userId);
  const agg = await tx.walletLedgerEntry.aggregate({
    where: {
      wallet: { playerId: a.userId },
      currency: 'lc',
      reasonCode: TEEN_PRIZE_REASON,
      delta: { gt: 0 },
      createdAt: { gte: utcDayStart(now) },
    },
    _sum: { delta: true },
  });
  const earnedToday = Number(agg?._sum?.delta ?? 0);
  const prize = teenPrizeLc();
  const awarded = teenPrizeFor(earnedToday, prize, teenDailyCapLc());
  if (awarded <= 0) return { awarded: 0, capped: true };
  await applyLc(tx, {
    playerId: a.userId,
    delta: awarded,
    reasonCode: TEEN_PRIZE_REASON,
    source: 'gameplay',
    idempotencyKey: `arena-teen-prize:${a.matchId}`,
    metadata: { matchId: a.matchId, kind: 'arena_teen_prize' },
  });
  return { awarded, capped: awarded < prize };
}
