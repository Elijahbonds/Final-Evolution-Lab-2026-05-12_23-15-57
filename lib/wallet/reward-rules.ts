/**
 * lib/wallet/reward-rules.ts — PURE reward configuration + grant math.
 *
 * The server is the ONLY authority on how much a performance event is worth.
 * Rules live in the RewardRule DB table (editable at runtime, no deploy).
 * These defaults seed that table and act as an in-memory fallback so the
 * system is safe even before seeding.
 *
 * No THREE / DOM / React / network imports here — unit-testable in isolation.
 */

export type WalletCurrency = 'coins' | 'shards';
export type RewardFormula = 'flat' | 'scoreLinear';

export interface RewardRuleConfig {
  reasonCode: string;
  currency: WalletCurrency;
  formula: RewardFormula;
  baseAmount: number;
  scaleNum: number;
  minGrant: number;
  maxGrant: number;
  /** max earn EVENTS for this reason inside a rolling 60s window; 0 = uncapped */
  perMinuteCap: number;
  /** max currency of this type granted inside a rolling 24h window; 0 = uncapped */
  perDayCurrencyCap: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Reason codes (v1) — §4 of the spec.
// ---------------------------------------------------------------------------
export const REASON = {
  // coins
  DUNK_ATTEMPT_SCORED: 'DUNK_ATTEMPT_SCORED',
  DUNK_ROUTINE_COMPLETED: 'DUNK_ROUTINE_COMPLETED',
  DAILY_FIRST_SESSION: 'DAILY_FIRST_SESSION',
  PURCHASE_COIN_PACK: 'PURCHASE_COIN_PACK',
  PURCHASE_SHARD_PACK: 'PURCHASE_SHARD_PACK', // M25 — real-money shard packs
  // shards
  DUNK_CONTEST_PLACED: 'DUNK_CONTEST_PLACED',
  DUNK_STREAK_MILESTONE: 'DUNK_STREAK_MILESTONE',
  DUNK_FIRST_CLEAR: 'DUNK_FIRST_CLEAR',
  // Phase 2 — cross-mode earn (board sports, football, soccer, snowboard, etc.)
  // A single completion/win pair covers EVERY mode via the shared game shell.
  MODE_SESSION_COMPLETED: 'MODE_SESSION_COMPLETED', // coins
  MODE_SESSION_WON: 'MODE_SESSION_WON',             // shards
  // Phase 2 — Scene It free-use (public-domain / expired-copyright characters).
  SCENEIT_FREEUSE_IDENTIFIED: 'SCENEIT_FREEUSE_IDENTIFIED', // shards
  // Phase 5 — referral loop (viral). Referrer earns shards when a lead they
  // referred converts to a registered athlete. Server-granted, never client.
  REFERRAL_BONUS: 'REFERRAL_BONUS', // shards
  // Phase 6 — async multiplayer settlement. Both players earn coins for
  // playing a resolved match; the winner earns shards. Server-granted only.
  MP_MATCH_PLAYED: 'MP_MATCH_PLAYED', // coins
  MP_MATCH_WON: 'MP_MATCH_WON',       // shards
  // Phase 11-14 (M28) — creative-card publish faucet + remix royalty (coins).
  CREATIVE_CARD_PUBLISH: 'CREATIVE_CARD_PUBLISH',             // coins
  CREATIVE_CARD_REMIX_ROYALTY: 'CREATIVE_CARD_REMIX_ROYALTY', // coins
  // spend / admin
  SPEND_CATALOG_ITEM: 'SPEND_CATALOG_ITEM',
  ADMIN_ADJUST: 'ADMIN_ADJUST',
  PURCHASE_REFUND: 'PURCHASE_REFUND',
} as const;

export type ReasonCode = (typeof REASON)[keyof typeof REASON];

// event_type (client-reported) -> reason_code (server-owned). The client names
// WHAT HAPPENED; it can never name a reward amount or a reason not listed here.
export const EVENT_REASON: Record<string, ReasonCode> = {
  dunk_attempt_scored: REASON.DUNK_ATTEMPT_SCORED,
  dunk_routine_completed: REASON.DUNK_ROUTINE_COMPLETED,
  daily_first_session: REASON.DAILY_FIRST_SESSION,
  dunk_contest_placed: REASON.DUNK_CONTEST_PLACED,
  dunk_streak_milestone: REASON.DUNK_STREAK_MILESTONE,
  dunk_first_clear: REASON.DUNK_FIRST_CLEAR,
  // Phase 2 cross-mode (fired once per session from the shared game shell).
  mode_session_completed: REASON.MODE_SESSION_COMPLETED,
  mode_session_won: REASON.MODE_SESSION_WON,
  // Phase 2 Scene It free-use identification.
  sceneit_freeuse_identified: REASON.SCENEIT_FREEUSE_IDENTIFIED,
};

// Reasons whose currency is shards — asserted at multiple layers so a purchase
// path can NEVER mint shards (permanent design constraint, §1).
export const SHARD_REASONS: ReadonlySet<string> = new Set([
  REASON.DUNK_CONTEST_PLACED,
  REASON.DUNK_STREAK_MILESTONE,
  REASON.DUNK_FIRST_CLEAR,
  REASON.MODE_SESSION_WON,
  REASON.SCENEIT_FREEUSE_IDENTIFIED,
  REASON.REFERRAL_BONUS,
  REASON.MP_MATCH_WON,
]);

// ---------------------------------------------------------------------------
// Default rules (seed + fallback). All feel numbers // TUNE(elijah).
// ---------------------------------------------------------------------------
export const DEFAULT_REWARD_RULES: Record<string, RewardRuleConfig> = {
  [REASON.DUNK_ATTEMPT_SCORED]: {
    reasonCode: REASON.DUNK_ATTEMPT_SCORED, currency: 'coins', formula: 'scoreLinear',
    baseAmount: 5, scaleNum: 1.4, minGrant: 5, maxGrant: 150, // TUNE(elijah)
    perMinuteCap: 40, perDayCurrencyCap: 20000, active: true,
  },
  [REASON.DUNK_ROUTINE_COMPLETED]: {
    reasonCode: REASON.DUNK_ROUTINE_COMPLETED, currency: 'coins', formula: 'flat',
    baseAmount: 60, scaleNum: 0, minGrant: 60, maxGrant: 60, // TUNE(elijah)
    perMinuteCap: 6, perDayCurrencyCap: 0, active: true,
  },
  [REASON.DAILY_FIRST_SESSION]: {
    reasonCode: REASON.DAILY_FIRST_SESSION, currency: 'coins', formula: 'flat',
    baseAmount: 100, scaleNum: 0, minGrant: 100, maxGrant: 100, // TUNE(elijah)
    perMinuteCap: 0, perDayCurrencyCap: 0, active: true,
  },
  [REASON.DUNK_CONTEST_PLACED]: {
    reasonCode: REASON.DUNK_CONTEST_PLACED, currency: 'shards', formula: 'flat',
    baseAmount: 5, scaleNum: 0, minGrant: 1, maxGrant: 10, // TUNE(elijah)
    perMinuteCap: 0, perDayCurrencyCap: 0, active: true,
  },
  [REASON.DUNK_STREAK_MILESTONE]: {
    reasonCode: REASON.DUNK_STREAK_MILESTONE, currency: 'shards', formula: 'flat',
    baseAmount: 3, scaleNum: 0, minGrant: 1, maxGrant: 10, // TUNE(elijah)
    perMinuteCap: 0, perDayCurrencyCap: 0, active: true,
  },
  [REASON.DUNK_FIRST_CLEAR]: {
    reasonCode: REASON.DUNK_FIRST_CLEAR, currency: 'shards', formula: 'flat',
    baseAmount: 5, scaleNum: 0, minGrant: 1, maxGrant: 10, // TUNE(elijah)
    perMinuteCap: 0, perDayCurrencyCap: 0, active: true,
  },
  // Phase 2 — every mode grants a modest completion coin reward via the shell.
  // perMinuteCap:2 blocks scripted session farming (a real session takes time).
  [REASON.MODE_SESSION_COMPLETED]: {
    reasonCode: REASON.MODE_SESSION_COMPLETED, currency: 'coins', formula: 'scoreLinear',
    baseAmount: 40, scaleNum: 0.5, minGrant: 40, maxGrant: 400, // TUNE(elijah)
    perMinuteCap: 2, perDayCurrencyCap: 30000, active: true,
  },
  [REASON.MODE_SESSION_WON]: {
    reasonCode: REASON.MODE_SESSION_WON, currency: 'shards', formula: 'flat',
    baseAmount: 2, scaleNum: 0, minGrant: 1, maxGrant: 5, // TUNE(elijah)
    perMinuteCap: 2, perDayCurrencyCap: 0, active: true,
  },
  // Phase 2 — Scene It free-use: identifying a public-domain / expired-copyright
  // character rewards shards (never purchasable). Flat, lightly rate-limited.
  [REASON.SCENEIT_FREEUSE_IDENTIFIED]: {
    reasonCode: REASON.SCENEIT_FREEUSE_IDENTIFIED, currency: 'shards', formula: 'flat',
    baseAmount: 1, scaleNum: 0, minGrant: 1, maxGrant: 3, // TUNE(elijah)
    perMinuteCap: 10, perDayCurrencyCap: 0, active: true,
  },
  // Phase 5 — referral conversion reward (shards). Server-granted, idempotent
  // per referred user, so it can never be farmed by replay.
  [REASON.REFERRAL_BONUS]: {
    reasonCode: REASON.REFERRAL_BONUS, currency: 'shards', formula: 'flat',
    baseAmount: 10, scaleNum: 0, minGrant: 1, maxGrant: 50, // TUNE(elijah)
    perMinuteCap: 0, perDayCurrencyCap: 0, active: true,
  },
  // Phase 6 — async multiplayer settlement. Coins for playing a resolved
  // match, shards for winning. Idempotent per match (keyed by match id).
  [REASON.MP_MATCH_PLAYED]: {
    reasonCode: REASON.MP_MATCH_PLAYED, currency: 'coins', formula: 'flat',
    baseAmount: 50, scaleNum: 0, minGrant: 25, maxGrant: 200, // TUNE(elijah)
    perMinuteCap: 0, perDayCurrencyCap: 0, active: true,
  },
  [REASON.MP_MATCH_WON]: {
    reasonCode: REASON.MP_MATCH_WON, currency: 'shards', formula: 'flat',
    baseAmount: 5, scaleNum: 0, minGrant: 1, maxGrant: 25, // TUNE(elijah)
    perMinuteCap: 0, perDayCurrencyCap: 0, active: true,
  },
  // M28 creative-card faucets (coins). Flat amounts; server is sole authority.
  [REASON.CREATIVE_CARD_PUBLISH]: {
    reasonCode: REASON.CREATIVE_CARD_PUBLISH, currency: 'coins', formula: 'flat',
    baseAmount: 50, scaleNum: 0, minGrant: 50, maxGrant: 50, // TUNE(elijah)
    perMinuteCap: 12, perDayCurrencyCap: 0, active: true,
  },
  [REASON.CREATIVE_CARD_REMIX_ROYALTY]: {
    reasonCode: REASON.CREATIVE_CARD_REMIX_ROYALTY, currency: 'coins', formula: 'flat',
    baseAmount: 25, scaleNum: 0, minGrant: 25, maxGrant: 25, // TUNE(elijah)
    perMinuteCap: 0, perDayCurrencyCap: 0, active: true,
  },
};

/** Pure grant computation. Never returns a negative value. */
export function computeGrant(rule: RewardRuleConfig, payload: Record<string, unknown>): number {
  let raw: number;
  if (rule.formula === 'scoreLinear') {
    const score = Number((payload?.score as number) ?? 0);
    raw = rule.baseAmount + rule.scaleNum * (Number.isFinite(score) ? score : 0);
  } else {
    raw = rule.baseAmount;
  }
  raw = Math.round(raw);
  if (rule.maxGrant > 0) raw = Math.min(raw, rule.maxGrant);
  raw = Math.max(raw, rule.minGrant);
  return Math.max(0, raw);
}
