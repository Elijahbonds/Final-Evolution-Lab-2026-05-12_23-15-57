/**
 * lib/season/season-service.ts
 * ============================
 * M13 Step 2 — Season engine v1 (server-authoritative).
 *
 * The pure math lives in season-pass-core.ts (verified). This service is the
 * persistence + idempotency layer: it rehydrates the core from PassProgress,
 * applies session XP, writes the new snapshot, and books any tier-up rewards
 * ONCE via ledger-keyed PassGrant rows. Season XP can be earned from ANY mode
 * because it is driven off the shared /api/sessions pipeline.
 *
 * Rewards CONTENT is data (Season.rewards / the core reward table). The PRO
 * lane is unlocked by PassProgress.hasPro, which is only ever set through the
 * Stripe rails behind the SEASON_PASS_PURCHASE flag (see lib/flags.ts). This
 * service NEVER flips pricing or grants PRO for free.
 */

import { prisma } from '@/lib/db';
import { recordServerEvent } from '@/lib/analytics-server';
import { postLc } from '@/lib/ledger';
import {
  SeasonPassCore,
  TIER_XP,
  type Lane,
  type PassState,
  type SeasonReward,
  type TierRewards,
  type TierUpEvent,
} from './season-pass-core';
import { getSeasonRewardTable } from './golden-hour';

export interface SeasonPublic {
  id: string;
  key: string;
  name: string;
  theme: string | null;
  tiers: number;
  startsAt: string;
  endsAt: string;
}

export interface AddSeasonXpResult {
  season: SeasonPublic;
  gained: number;
  tier: number;
  into: number;
  need: number;
  hasPro: boolean;
  events: TierUpEvent[];
}

/** The active season, if any (server-owned; one active at a time). */
export async function getActiveSeason() {
  return prisma.season.findFirst({ where: { active: true }, orderBy: { startsAt: 'desc' } });
}

function toPublic(s: NonNullable<Awaited<ReturnType<typeof getActiveSeason>>>): SeasonPublic {
  return {
    id: s.id,
    key: s.key,
    name: s.name,
    theme: s.theme ?? null,
    tiers: s.tiers,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
  };
}

async function getOrCreateProgress(userId: string, seasonId: string) {
  const existing = await prisma.passProgress.findUnique({
    where: { userId_seasonId: { userId, seasonId } },
  });
  if (existing) return existing;
  return prisma.passProgress.create({ data: { userId, seasonId, xp: 0, tier: 0, hasPro: false } });
}

function stateFrom(progress: { xp: number; tier: number; claimedFree: any; claimedPro: any }): Partial<PassState> {
  const free = Array.isArray(progress.claimedFree) ? (progress.claimedFree as number[]) : [];
  const pro = Array.isArray(progress.claimedPro) ? (progress.claimedPro as number[]) : [];
  return { xp: progress.xp, tier: progress.tier, claimed: { free, pro } };
}

/**
 * Was this the athlete's first session in this mode today? Season XP grants a
 * first-of-day bonus to reward variety without grinding one mode. Called AFTER
 * the GameSession row is written, so a count of exactly 1 means it was first.
 */
async function isFirstOfDayMode(userId: string, mode: string): Promise<boolean> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const count = await prisma.gameSession.count({
    where: { userId, mode, createdAt: { gte: start } },
  });
  return count <= 1;
}

/**
 * Book ONE lane reward for one tier, atomically.
 *
 * The PassGrant row is the idempotency gate (unique dedupeKey). An `lc` reward
 * is not just logged — it is actually CREDITED here, moving PlayerProfile
 * .labCredits and the CreditLedger/double-entry in the same transaction as the
 * grant row, exactly like every other LC earn path. Because the grant row is
 * created FIRST inside the transaction, a redelivery throws P2002 and the whole
 * movement rolls back: the pass can never pay the same tier twice.
 *
 * Returns true when this call booked the grant, false when it was already
 * booked (the normal, harmless re-entry case).
 */
async function bookGrant(input: {
  userId: string;
  seasonId: string;
  seasonKey: string;
  tier: number;
  lane: Lane;
  reward: SeasonReward;
  dedupeKey: string;
}): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.passGrant.create({
        data: {
          userId: input.userId,
          seasonId: input.seasonId,
          tier: input.tier,
          lane: input.lane,
          reward: input.reward as any,
          dedupeKey: input.dedupeKey,
        },
      });

      const amt = Number(input.reward.amt ?? 0);
      if (input.reward.kind === 'lc' && amt > 0) {
        // Authoritative balance + ledger stay in lockstep (see lib/arena.ts).
        const profile = await tx.playerProfile.update({
          where: { userId: input.userId },
          data: { labCredits: { increment: amt } },
          select: { labCredits: true },
        });
        await postLc(tx, {
          userId: input.userId,
          amount: amt,
          reason: `Season pass T${input.tier} (${input.lane})`,
          dedupeKey: `passgrant:${input.dedupeKey}`,
          balanceAfter: profile.labCredits,
          metadata: { seasonKey: input.seasonKey, tier: input.tier, lane: input.lane },
        });
      }
    });
    return true;
  } catch (err: any) {
    // P2002 on either unique key => already granted. Anything else is real.
    if (err?.code !== 'P2002') {
      console.warn(`[season] grant ${input.dedupeKey} failed:`, err?.message);
    }
    return false;
  }
}

/** Book every reward a tier-up produced, across both lanes. */
async function bookTierRewards(opts: {
  userId: string;
  seasonId: string;
  seasonKey: string;
  tier: number;
  rewards: TierRewards;
}): Promise<void> {
  const lanes: Array<[Lane, SeasonReward[]]> = [
    ['free', opts.rewards.free],
    ['pro', opts.rewards.pro],
  ];
  for (const [lane, rewards] of lanes) {
    for (let i = 0; i < rewards.length; i++) {
      await bookGrant({
        userId: opts.userId,
        seasonId: opts.seasonId,
        seasonKey: opts.seasonKey,
        tier: opts.tier,
        lane,
        reward: rewards[i],
        dedupeKey: `${opts.userId}:${opts.seasonId}:${opts.tier}:${lane}:${i}`,
      });
    }
  }
}

export interface AddSeasonXpInput {
  userId: string;
  mode: string;
  score: number;
  won: boolean;
}

/**
 * Apply season XP for a completed session. Idempotent tier rewards: each tier's
 * lane reward is booked once via a unique dedupeKey. Best-effort at the call
 * site — never let this break the core session write.
 */
export async function addSeasonXp(input: AddSeasonXpInput): Promise<AddSeasonXpResult | null> {
  const season = await getActiveSeason();
  if (!season) return null;

  const progress = await getOrCreateProgress(input.userId, season.id);
  const firstOfDayMode = await isFirstOfDayMode(input.userId, input.mode);

  const core = new SeasonPassCore({
    tiers: season.tiers,
    hasPro: progress.hasPro,
    state: stateFrom(progress),
    rewardTable: getSeasonRewardTable(season.key),
  });

  const gained = SeasonPassCore.sessionXp({
    score: input.score,
    won: input.won,
    firstOfDayMode,
  });
  const res = core.addXp(gained);

  await prisma.passProgress.update({
    where: { userId_seasonId: { userId: input.userId, seasonId: season.id } },
    data: { xp: core.state.xp, tier: core.state.tier, updatedAt: new Date() },
  });

  // Book tier-up rewards idempotently (server owns all grants).
  for (const ev of res.events) {
    await bookTierRewards({
      userId: input.userId,
      seasonId: season.id,
      seasonKey: season.key,
      tier: ev.tier,
      rewards: ev.rewards,
    });
    await recordServerEvent({
      name: 'season_tier_up',
      userId: input.userId,
      props: { seasonKey: season.key, tier: ev.tier, mode: input.mode },
    });
  }

  return {
    season: toPublic(season),
    gained,
    tier: res.tier,
    into: res.into,
    need: res.need,
    hasPro: progress.hasPro,
    events: res.events,
  };
}

/** Read the athlete's current pass state for the active season (HUB + API). */
export async function getPassState(userId: string) {
  const season = await getActiveSeason();
  if (!season) return null;
  const progress = await getOrCreateProgress(userId, season.id);
  const core = new SeasonPassCore({
    tiers: season.tiers,
    hasPro: progress.hasPro,
    state: stateFrom(progress),
    rewardTable: getSeasonRewardTable(season.key),
  });
  const grants = await prisma.passGrant.findMany({
    where: { userId, seasonId: season.id },
    orderBy: { tier: 'asc' },
  });
  return {
    season: toPublic(season),
    tier: core.state.tier,
    into: core.state.xp,
    // TIER_XP is the single source of truth for the curve — never re-derive it
    // here, or a tuning change silently desyncs the HUB bar from the engine.
    need: TIER_XP(core.state.tier),
    hasPro: progress.hasPro,
    grants: grants.map((g) => ({ tier: g.tier, lane: g.lane, reward: g.reward })),
    claimed: { free: core.state.claimed.free, pro: core.state.claimed.pro },
    claimable: { free: core.claimable('free'), pro: core.claimable('pro') },
  };
}

// ---------------------------------------------------------------------------
// Collection (claim)
// ---------------------------------------------------------------------------

export interface ClaimedReward {
  tier: number;
  lane: Lane;
  rewards: SeasonReward[];
}

/**
 * Collect earned rewards. Grants are normally already booked at tier-up (and LC
 * already credited), so this is primarily the COLLECT beat the HUB badge points
 * at — but it also RE-BOOKS through the same dedupeKey path first, which
 * self-heals the one case that used to lose a reward for good: a tier-up whose
 * grant write failed on a transient DB error and was never retried. Because
 * claimable tiers are derived from tier state rather than from the grant log,
 * the athlete still sees what they earned, and collecting it books what is
 * missing. Re-booking an existing grant hits the unique dedupeKey and no-ops,
 * so no amount of calling this can pay the same tier twice.
 *
 * Pass a tier+lane to collect one, or nothing to collect everything earned.
 */
export async function claimSeasonRewards(
  userId: string,
  opts: { tier?: number; lane?: Lane } = {},
): Promise<{ claimed: ClaimedReward[]; claimable: { free: number[]; pro: number[] } } | null> {
  const season = await getActiveSeason();
  if (!season) return null;
  const progress = await getOrCreateProgress(userId, season.id);
  const core = new SeasonPassCore({
    tiers: season.tiers,
    hasPro: progress.hasPro,
    state: stateFrom(progress),
    rewardTable: getSeasonRewardTable(season.key),
  });

  const lanes: Lane[] = opts.lane ? [opts.lane] : ['free', 'pro'];
  const claimed: ClaimedReward[] = [];
  for (const lane of lanes) {
    // claimable() already filters to EARNED tiers that carry a reward in this
    // lane, so an explicit tier that is unearned, empty, or PRO-without-pro
    // simply is not in the list and collects nothing.
    const tiers = core.claimable(lane).filter((t) => opts.tier === undefined || t === opts.tier);
    for (const tier of tiers) {
      if (!core.markClaimed(tier, lane)) continue;
      const rewards = core.rewardsAt(tier)[lane];
      // Self-heal: no-ops when the tier-up already booked these (dedupeKey).
      for (let i = 0; i < rewards.length; i++) {
        await bookGrant({
          userId,
          seasonId: season.id,
          seasonKey: season.key,
          tier,
          lane,
          reward: rewards[i],
          dedupeKey: `${userId}:${season.id}:${tier}:${lane}:${i}`,
        });
      }
      claimed.push({ tier, lane, rewards });
    }
  }

  if (claimed.length > 0) {
    await prisma.passProgress.update({
      where: { userId_seasonId: { userId, seasonId: season.id } },
      data: {
        claimedFree: core.state.claimed.free,
        claimedPro: core.state.claimed.pro,
        updatedAt: new Date(),
      },
    });
    await recordServerEvent({
      name: 'season_rewards_claimed',
      userId,
      props: { seasonKey: season.key, count: claimed.length, tiers: claimed.map((c) => c.tier) },
    });
  }

  return {
    claimed,
    claimable: { free: core.claimable('free'), pro: core.claimable('pro') },
  };
}

// ---------------------------------------------------------------------------
// PRO lane (paid, cosmetic-only)
// ---------------------------------------------------------------------------

/**
 * Unlock the PRO lane for a season. The ONLY caller is the Stripe webhook after
 * a verified `checkout.session.completed` — nothing in gameplay may call this,
 * and it never decides or reads a price.
 *
 * Back-fills retroactively: an athlete who buys at tier 20 immediately receives
 * the PRO rewards for tiers 1-20, booked through the same idempotent dedupeKey
 * path as a live tier-up, so a redelivered webhook grants nothing twice.
 */
export async function unlockProLane(input: {
  userId: string;
  seasonId?: string;
  stripeEventId?: string;
}): Promise<{ seasonKey: string; tier: number; backfilled: number } | null> {
  const season = input.seasonId
    ? await prisma.season.findUnique({ where: { id: input.seasonId } })
    : await getActiveSeason();
  if (!season) return null;

  const progress = await getOrCreateProgress(input.userId, season.id);
  if (!progress.hasPro) {
    await prisma.passProgress.update({
      where: { userId_seasonId: { userId: input.userId, seasonId: season.id } },
      data: { hasPro: true, updatedAt: new Date() },
    });
  }

  // hasPro: true so the core resolves the PRO lane for the back-fill.
  const core = new SeasonPassCore({
    tiers: season.tiers,
    hasPro: true,
    state: stateFrom(progress),
    rewardTable: getSeasonRewardTable(season.key),
  });

  let backfilled = 0;
  for (let tier = 1; tier <= core.state.tier; tier++) {
    const rewards = core.rewardsAt(tier).pro;
    for (let i = 0; i < rewards.length; i++) {
      const booked = await bookGrant({
        userId: input.userId,
        seasonId: season.id,
        seasonKey: season.key,
        tier,
        lane: 'pro',
        reward: rewards[i],
        dedupeKey: `${input.userId}:${season.id}:${tier}:pro:${i}`,
      });
      if (booked) backfilled++;
    }
  }

  await recordServerEvent({
    name: 'season_pro_unlocked',
    userId: input.userId,
    props: { seasonKey: season.key, tier: core.state.tier, backfilled, stripeEventId: input.stripeEventId ?? null },
  });

  return { seasonKey: season.key, tier: core.state.tier, backfilled };
}

/**
 * Reverse a PRO purchase (refund/chargeback). Closes the lane so no FURTHER PRO
 * rewards are booked. Cosmetics already booked stay in the grant log: it is an
 * append-only ledger, and they are cosmetic-only, so nothing about gameplay
 * balance can be bought back. Re-purchasing simply re-opens the lane.
 */
export async function revokeProLane(input: {
  userId: string;
  seasonId?: string;
  stripeEventId?: string;
}): Promise<boolean> {
  const season = input.seasonId
    ? await prisma.season.findUnique({ where: { id: input.seasonId } })
    : await getActiveSeason();
  if (!season) return false;

  const existing = await prisma.passProgress.findUnique({
    where: { userId_seasonId: { userId: input.userId, seasonId: season.id } },
  });
  if (!existing?.hasPro) return false;

  await prisma.passProgress.update({
    where: { userId_seasonId: { userId: input.userId, seasonId: season.id } },
    data: { hasPro: false, updatedAt: new Date() },
  });
  await recordServerEvent({
    name: 'season_pro_revoked',
    userId: input.userId,
    props: { seasonKey: season.key, stripeEventId: input.stripeEventId ?? null },
  });
  return true;
}
