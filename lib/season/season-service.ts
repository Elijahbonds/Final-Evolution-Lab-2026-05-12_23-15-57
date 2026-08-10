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
import { SeasonPassCore, type PassState, type TierUpEvent } from './season-pass-core';
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
    const lanes: Array<{ lane: 'free' | 'pro'; rewards: typeof ev.rewards.free }> = [
      { lane: 'free', rewards: ev.rewards.free },
      { lane: 'pro', rewards: ev.rewards.pro },
    ];
    for (const { lane, rewards } of lanes) {
      for (let i = 0; i < rewards.length; i++) {
        const dedupeKey = `${input.userId}:${season.id}:${ev.tier}:${lane}:${i}`;
        try {
          await prisma.passGrant.create({
            data: {
              userId: input.userId,
              seasonId: season.id,
              tier: ev.tier,
              lane,
              reward: rewards[i] as any,
              dedupeKey,
            },
          });
        } catch {
          // unique dedupeKey collision => already granted; ignore.
        }
      }
    }
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
    need: (800 + core.state.tier * 120),
    hasPro: progress.hasPro,
    grants: grants.map((g) => ({ tier: g.tier, lane: g.lane, reward: g.reward })),
  };
}
