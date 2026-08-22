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

/** XP required to clear a given tier (0-indexed). TUNE(elijah). */
export const TIER_XP = (tier: number): number => 800 + tier * 120;

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
  questsDone?: number;
}

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
}

export default SeasonPassCore;
