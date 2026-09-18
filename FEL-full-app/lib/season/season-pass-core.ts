/**
 * lib/season/season-pass-core.ts
 * ==============================
 * M13 Step 2 — Season engine v1 (Blueprint 2.3).
 *
 * Faithful headless TS port of the verified reference core
 * (reference/SeasonPassCore.js, batch-16). Ports the SEMANTICS only:
 * rendering and storage stay ours (Prisma Season/PassProgress/PassGrant,
 * HUB pass-track UI). The SERVER owns all grants; this core computes tier
 * state + reward shape deterministically so both the server pipeline and
 * the standing suite can exercise identical math.
 *
 * 8-week season, 50 tiers, FREE + PRO lanes. Season XP flows from ANY mode
 * via the existing /api/sessions pipeline (see `sessionXp`). Reward CONTENT
 * per season is DATA (JSON), not code — future seasons ship without deploys.
 *
 * All tunables are // TUNE(elijah) and carry defaults; see the tuning sheet
 * in the M13 export.
 */

/**
 * XP required to clear a given tier (0-indexed). TUNE(elijah).
 *
 * Paced so the 50-tier track is actually finishable inside the 8-week season.
 * The original 800 + 120t put the whole track at 187,000 XP — about seven
 * capped wins a day for 56 straight days — so nobody reached tier 50 and the
 * legendary the PRO lane is sold on was unreachable by design. At 450 + 68t the
 * track costs 105,800 XP and lands like this (see the pacing checks in
 * scripts/season-pass-core-tests.ts, which hold this shape):
 *
 *   casual    2 sessions/day, 2 modes, 50% wins -> ~tier 34 by season end
 *   committed 4 sessions/day, 3 modes, 60% wins -> finishes around day 55
 *   dedicated 6 sessions/day, 4 modes, 70% wins -> finishes around day 37
 *
 * Casual still does not finish: the track is meant to be an achievement. If
 * the quest track ever ships, questsDone (200 XP each) adds a lever on top of
 * this and the curve should be re-checked against these same profiles.
 */
export const TIER_XP = (tier: number): number => 450 + tier * 68;

export type RewardKind = 'lc' | 'cosmetic';
export type RewardRarity = 'common' | 'rare' | 'legendary';

export interface SeasonReward {
  kind: RewardKind;
  amt?: number;
  rarity?: RewardRarity;
  /** Optional catalog id + display name when the season ships an authored table. */
  id?: string;
  name?: string;
}

export interface TierRewards {
  free: SeasonReward[];
  pro: SeasonReward[];
}

export interface TierUpEvent {
  type: 'tier-up';
  tier: number;
  rewards: TierRewards;
}

export interface AddXpResult {
  tier: number;
  into: number;
  need: number;
  events: TierUpEvent[];
}

export interface SessionXpInput {
  score?: number;
  won?: boolean;
  firstOfDayMode?: boolean;
  /**
   * Quests cleared alongside this session. Part of the verified reference port
   * and kept so the math stays faithful, but FEL ships no quest system yet —
   * nothing feeds this today and the server never passes it. When a daily-quest
   * track lands, pass the count here and season XP picks it up with no other
   * change. Do NOT repurpose it for streaks: the streak bonus is LC, not pass XP.
   */
  questsDone?: number;
}

/** The two reward lanes. PRO is the paid, cosmetic-only upgrade. */
export type Lane = 'free' | 'pro';

export interface PassState {
  xp: number;
  tier: number;
  claimed: { free: number[]; pro: number[] };
}

export interface SeasonPassOptions {
  tiers?: number;
  hasPro?: boolean;
  /** Resume from a persisted snapshot (server rehydration). */
  state?: Partial<PassState>;
  /**
   * Optional authored per-tier reward table (1-indexed by tier -> index 0).
   * When present it OVERRIDES the procedural cadence so a season can ship
   * named cosmetics as pure DATA with no code change. When omitted the core
   * falls back to the deterministic procedural shape (verified by tests).
   */
  rewardTable?: TierRewards[];
}

export class SeasonPassCore {
  readonly tiers: number;
  hasPro: boolean;
  state: PassState;
  private readonly rewardTable?: TierRewards[];

  constructor({ tiers = 50, hasPro = false, state, rewardTable }: SeasonPassOptions = {}) {
    this.tiers = tiers;
    this.hasPro = hasPro;
    this.rewardTable = rewardTable;
    this.state = {
      xp: state?.xp ?? 0,
      tier: state?.tier ?? 0,
      claimed: {
        free: state?.claimed?.free ? [...state.claimed.free] : [],
        pro: state?.claimed?.pro ? [...state.claimed.pro] : [],
      },
    };
  }

  /**
   * Season XP sources — one call per completed session (server-side).
   * Deterministic: identical input -> identical XP.
   */
  static sessionXp({ score = 0, won = false, firstOfDayMode = false, questsDone = 0 }: SessionXpInput): number {
    return Math.round(
      80 +
        Math.min(220, score * 0.5) +
        (won ? 120 : 0) +
        (firstOfDayMode ? 150 : 0) +
        questsDone * 200,
    ); // TUNE(elijah)
  }

  /** Apply XP, rolling any number of tier-ups, returning the events for feedback parity. */
  addXp(xp: number): AddXpResult {
    this.state.xp += Math.max(0, Math.round(xp));
    const events: TierUpEvent[] = [];
    while (this.state.tier < this.tiers && this.state.xp >= TIER_XP(this.state.tier)) {
      this.state.xp -= TIER_XP(this.state.tier);
      this.state.tier++;
      events.push({ type: 'tier-up', tier: this.state.tier, rewards: this.rewardsAt(this.state.tier) });
    }
    return { tier: this.state.tier, into: this.state.xp, need: TIER_XP(this.state.tier), events };
  }

  /**
   * Reward table SHAPE (content per season is data, not code). The FREE lane
   * grants LC on every 5th tier and a common cosmetic on every 3rd; the PRO
   * lane (when owned) grants a rare cosmetic each tier and a legendary every
   * 10th. Purely cosmetic + LC — no stat items (Blueprint Pillar 7 is law).
   */
  rewardsAt(tier: number): TierRewards {
    // Authored data table wins when the season ships one (content w/o deploys).
    if (this.rewardTable && this.rewardTable[tier - 1]) {
      const entry = this.rewardTable[tier - 1];
      return {
        free: entry.free ?? [],
        pro: this.hasPro ? entry.pro ?? [] : [],
      };
    }
    const free: SeasonReward[] =
      tier % 5 === 0
        ? [{ kind: 'lc', amt: 50 }]
        : tier % 3 === 0
          ? [{ kind: 'cosmetic', rarity: 'common' }]
          : [];
    const pro: SeasonReward[] = this.hasPro
      ? tier % 10 === 0
        ? [{ kind: 'cosmetic', rarity: 'legendary' }]
        : [{ kind: 'cosmetic', rarity: 'rare' }]
      : [];
    return { free, pro };
  }

  // --- Collection (claim) state ------------------------------------------
  // Grants are BOOKED by the server the moment a tier is cleared (see
  // season-service) — claiming never mints anything and can never double-pay.
  // These helpers track which earned tiers the athlete has actually collected
  // so the HUB can show a "rewards ready" badge and a satisfying COLLECT beat.

  /** Has this lane's reward for `tier` already been collected? */
  isClaimed(tier: number, lane: Lane): boolean {
    return this.state.claimed[lane].includes(tier);
  }

  /** Mark a tier's lane reward collected. Returns false when it was already. */
  markClaimed(tier: number, lane: Lane): boolean {
    if (this.isClaimed(tier, lane)) return false;
    this.state.claimed[lane].push(tier);
    this.state.claimed[lane].sort((a, b) => a - b);
    return true;
  }

  /**
   * Earned-but-uncollected tiers for a lane, ascending. A tier only counts
   * when it is cleared AND actually carries a reward in that lane — the FREE
   * lane is sparse (LC every 5th, common cosmetic every 3rd), and the PRO lane
   * resolves empty entirely while `hasPro` is false, so an athlete without the
   * PRO lane never sees phantom claimables.
   */
  claimable(lane: Lane): number[] {
    const out: number[] = [];
    for (let tier = 1; tier <= this.state.tier; tier++) {
      if (this.isClaimed(tier, lane)) continue;
      if (this.rewardsAt(tier)[lane].length > 0) out.push(tier);
    }
    return out;
  }
}

export default SeasonPassCore;
