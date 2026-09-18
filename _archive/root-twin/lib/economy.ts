/**
 * lib/economy.ts — Lab Credits (LC) engine.
 *
 * Server-authoritative soft-currency economy:
 *   - Balance is derived as SUM(CreditLedger.amount) for the user.
 *   - Every earn event carries a deterministic dedupe key; a unique constraint
 *     on (userId, dedupeKey) makes replays a no-op (anti-double-pay).
 *   - Anti-farming: dedupe keys are content-scoped (lesson:<id>, checkpoint:<id>),
 *     so a lesson pays exactly once per user, forever.
 *
 * ADAPTED for the live schema: uses `amount` (not `delta`), `createdAt` (not `ts`),
 * and `dedupeKey` (nullable — existing rows without it are ignored by the
 * unique constraint since NULL != NULL in PostgreSQL).
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { postLc } from '@/lib/ledger';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const ECONOMY_CONFIG = {
  earn: {
    lessonComplete: 10,
    moduleCheckpoint: 50,
    heroSessionWin: 15,
    dailyStreakPerDay: 5,
    dailyStreakCapDays: 7,
    storyNodeRewardMax: 500,
  },
  wallet: {
    recentLedgerLimit: 20,
  },
  // Anti-farm / integrity. Server-side only — the client can never influence these.
  antiFarm: {
    // Max positive earn events allowed inside the rolling window before we
    // reject as abusive velocity. Generous enough for honest rapid play.
    maxEarnsPerWindow: 30, // TUNE(elijah)
    windowSeconds: 60, // TUNE(elijah)
  },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const LEDGER_REASONS = {
  LESSON_COMPLETE: 'LESSON_COMPLETE',
  CHECKPOINT_CLEAR: 'CHECKPOINT_CLEAR',
  SESSION_WIN: 'SESSION_WIN',
  DAILY_STREAK: 'DAILY_STREAK',
  STORY_NODE: 'STORY_NODE',
  CARD_PURCHASE: 'CARD_PURCHASE',
} as const;

export type LedgerReason = (typeof LEDGER_REASONS)[keyof typeof LEDGER_REASONS];

export type EarnEvent =
  | { kind: 'lesson_complete'; lessonId: string }
  | { kind: 'checkpoint_clear'; moduleId: string }
  | { kind: 'session_win'; sessionId: string }
  | { kind: 'daily_streak'; now?: Date }
  | { kind: 'story_node'; nodeId: string; amount: number };

export interface AwardResult {
  awarded: boolean;
  duplicate: boolean;
  amount: number;
  reason: LedgerReason;
  dedupeKey: string;
  balance: number;
  meta?: { streakDay?: number };
}

export type DbClient = PrismaClient | Prisma.TransactionClient;

export class EconomyError extends Error {
  constructor(
    public readonly code:
      | 'CARD_NOT_FOUND'
      | 'ALREADY_OWNED'
      | 'INSUFFICIENT_FUNDS'
      | 'INVALID_EVENT',
    message?: string
  ) {
    super(message ?? code);
    this.name = 'EconomyError';
  }
}

// ---------------------------------------------------------------------------
// Dedupe keys
// ---------------------------------------------------------------------------

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildDedupeKey(event: EarnEvent): string {
  switch (event.kind) {
    case 'lesson_complete':
      return `lesson:${event.lessonId}`;
    case 'checkpoint_clear':
      return `checkpoint:${event.moduleId}`;
    case 'session_win':
      return `session:${event.sessionId}`;
    case 'daily_streak':
      return `streak:${utcDateKey(event.now ?? new Date())}`;
    case 'story_node':
      return `story:${event.nodeId}`;
  }
}

export function reasonForEvent(event: EarnEvent): LedgerReason {
  switch (event.kind) {
    case 'lesson_complete':
      return LEDGER_REASONS.LESSON_COMPLETE;
    case 'checkpoint_clear':
      return LEDGER_REASONS.CHECKPOINT_CLEAR;
    case 'session_win':
      return LEDGER_REASONS.SESSION_WIN;
    case 'daily_streak':
      return LEDGER_REASONS.DAILY_STREAK;
    case 'story_node':
      return LEDGER_REASONS.STORY_NODE;
  }
}

// ---------------------------------------------------------------------------
// Balance (always derived)
// ---------------------------------------------------------------------------

export async function getBalance(db: DbClient, userId: string): Promise<number> {
  const agg = await (db as any).creditLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export async function getLifetimeEarned(db: DbClient, userId: string): Promise<number> {
  const agg = await (db as any).creditLedger.aggregate({
    where: { userId, amount: { gt: 0 } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

// ---------------------------------------------------------------------------
// Streak math
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export async function computeStreakDay(
  db: DbClient,
  userId: string,
  now: Date
): Promise<number> {
  const { dailyStreakPerDay, dailyStreakCapDays } = ECONOMY_CONFIG.earn;

  const last = await (db as any).creditLedger.findFirst({
    where: { userId, reason: LEDGER_REASONS.DAILY_STREAK },
    orderBy: { createdAt: 'desc' },
    select: { amount: true, dedupeKey: true, createdAt: true },
  });

  if (!last) return 1;

  const lastDateKey =
    last.dedupeKey && last.dedupeKey.startsWith('streak:')
      ? last.dedupeKey.slice('streak:'.length)
      : utcDateKey(last.createdAt);

  const todayKey = utcDateKey(now);
  if (lastDateKey === todayKey) return 0; // already paid today

  const yesterdayKey = utcDateKey(new Date(now.getTime() - DAY_MS));
  if (lastDateKey !== yesterdayKey) return 1; // gap -> reset

  const prevDay = Math.max(1, Math.round(last.amount / dailyStreakPerDay));
  return Math.min(prevDay + 1, dailyStreakCapDays);
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/**
 * Velocity guard: reject absurd earn rates. Counts positive-amount ledger rows
 * inside the rolling window. Returns true if the user is UNDER the cap (ok).
 */
export async function withinEarnVelocity(db: DbClient, userId: string): Promise<boolean> {
  const { maxEarnsPerWindow, windowSeconds } = ECONOMY_CONFIG.antiFarm;
  const since = new Date(Date.now() - windowSeconds * 1000);
  const count = await (db as any).creditLedger.count({
    where: { userId, amount: { gt: 0 }, createdAt: { gte: since } },
  });
  return count < maxEarnsPerWindow;
}

export async function awardCredits(
  db: DbClient,
  userId: string,
  event: EarnEvent
): Promise<AwardResult> {
  const reason = reasonForEvent(event);
  const dedupeKey = buildDedupeKey(event);
  const cfg = ECONOMY_CONFIG.earn;

  let amount: number;
  let meta: AwardResult['meta'];

  switch (event.kind) {
    case 'lesson_complete':
      amount = cfg.lessonComplete;
      break;
    case 'checkpoint_clear':
      amount = cfg.moduleCheckpoint;
      break;
    case 'session_win':
      amount = cfg.heroSessionWin;
      break;
    case 'story_node': {
      const max = cfg.storyNodeRewardMax;
      if (!Number.isInteger(event.amount) || event.amount <= 0 || event.amount > max) {
        throw new EconomyError('INVALID_EVENT', `story_node amount out of bounds (1..${max})`);
      }
      amount = event.amount;
      break;
    }
    case 'daily_streak': {
      const day = await computeStreakDay(db, userId, event.now ?? new Date());
      if (day === 0) {
        return {
          awarded: false,
          duplicate: true,
          amount: 0,
          reason,
          dedupeKey,
          balance: await getBalance(db, userId),
        };
      }
      amount = cfg.dailyStreakPerDay * day;
      meta = { streakDay: day };
      break;
    }
  }

  if (!Number.isInteger(amount!) || amount! <= 0) {
    throw new EconomyError('INVALID_EVENT', `Non-positive earn amount for ${event.kind}`);
  }

  try {
    await postLc(db, { userId, amount: amount!, reason, dedupeKey });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        awarded: false,
        duplicate: true,
        amount: 0,
        reason,
        dedupeKey,
        balance: await getBalance(db, userId),
        meta,
      };
    }
    throw err;
  }

  return {
    awarded: true,
    duplicate: false,
    amount: amount!,
    reason,
    dedupeKey,
    balance: await getBalance(db, userId),
    meta,
  };
}

// ---------------------------------------------------------------------------
// Spending (card purchase — uses existing cardKey field)
// ---------------------------------------------------------------------------

export interface PurchaseResult {
  balance: number;
  cardKey: string;
  costLC: number;
  acquiredAt: Date;
}

export async function purchaseCard(
  rootPrisma: PrismaClient,
  userId: string,
  card: { key: string; costLC: number }
): Promise<PurchaseResult> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; ; attempt++) {
    try {
      return await rootPrisma.$transaction(
        async (tx) => {
          const existing = await tx.cardOwnership.findUnique({
            where: { userId_cardKey: { userId, cardKey: card.key } },
            select: { id: true },
          });
          if (existing) throw new EconomyError('ALREADY_OWNED');

          const balance = await getBalance(tx, userId);
          if (balance < card.costLC) {
            throw new EconomyError(
              'INSUFFICIENT_FUNDS',
              `Balance ${balance} LC < cost ${card.costLC} LC`
            );
          }

          await postLc(tx, {
            userId,
            amount: -card.costLC,
            reason: LEDGER_REASONS.CARD_PURCHASE,
            dedupeKey: `purchase:${card.key}`,
          });

          const ownership = await tx.cardOwnership.create({
            data: { userId, cardKey: card.key },
          });

          return {
            balance: balance - card.costLC,
            cardKey: card.key,
            costLC: card.costLC,
            acquiredAt: ownership.createdAt,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new EconomyError('ALREADY_OWNED');
      const isSerializationConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (isSerializationConflict && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Education-contract adapter
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/db';

export interface EarnParams {
  userId: string;
  reason: 'lesson_complete' | 'module_checkpoint' | 'session_win' | 'daily_streak';
  sourceId: string;
  tx?: Prisma.TransactionClient;
}

export interface EarnResult {
  awarded: number;
  newBalance: number;
  ledgerId: string | null;
}

export async function earnLabCredits(params: EarnParams): Promise<EarnResult> {
  const db: DbClient = params.tx ?? prisma;
  const event: EarnEvent =
    params.reason === 'lesson_complete'
      ? { kind: 'lesson_complete', lessonId: params.sourceId }
      : params.reason === 'module_checkpoint'
        ? { kind: 'checkpoint_clear', moduleId: params.sourceId }
        : params.reason === 'session_win'
          ? { kind: 'session_win', sessionId: params.sourceId }
          : { kind: 'daily_streak' };
  const r = await awardCredits(db, params.userId, event);
  return {
    awarded: r.awarded ? r.amount : 0,
    newBalance: r.balance,
    ledgerId: null,
  };
}
