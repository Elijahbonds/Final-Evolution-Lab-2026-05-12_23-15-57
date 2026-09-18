// DIFFICULTY — three tiers that differ in what the opponent DOES (2026-09-13).
//
// Part 1 Phase 6, verbatim: "An AI opponent with at least three difficulty tiers that differ in behavior,
// not just stat multipliers." Phase 0 measured that four modes have no tiering at all — Football Rush, Court
// Carnival, Who Scene It and Velocity Kart — and that the four that DO have it each invented their own.
//
// WHY A MULTIPLIER IS NOT A DIFFICULTY. Scaling a rival's speed by 1.2 makes it faster at the same thing. It
// does not make it play differently, and a player can feel the difference immediately: an easy opponent that
// is simply a slow version of the hard one is the same opponent with a handicap, which reads as the game
// being condescending rather than the opponent being a beginner. What actually separates a novice from an
// expert is WHAT THEY DO:
//
//   · a novice REACTS LATE, and often to the wrong thing
//   · a novice makes unforced errors on their own, with nobody pressuring them
//   · a novice does not punish your mistakes — an expert punishes every one
//   · a novice does the same thing whatever you do; an expert reads what you have been doing and adjusts
//
// Those are the four knobs below, and every one of them changes behaviour rather than scale. `mistakeRate`
// is the clearest case: an easy opponent is not slower, it BLOWS things on its own, which is what makes
// beating it feel like the opponent lost rather than the game let you win.
//
// THE HONEST SCALAR IS STILL HERE. `edge` exists for the places where a number is genuinely the right model
// (a race pace, a shot percentage), but a mode that uses ONLY `edge` has not implemented tiers, and
// `behavioural()` says so. The test asserts every tier differs on at least three behavioural fields.
//
// Pure: no Babylon, no DOM beyond the remembered pick.

export const TIERS = ['rookie', 'pro', 'elite'] as const;
export type Tier = (typeof TIERS)[number];

export interface TierProfile {
  id: Tier;
  name: string;
  /** One line on the picker — what this opponent is LIKE, not how hard it is. */
  sub: string;
  tint: string;

  // ── behaviour ──────────────────────────────────────────────────────────────────────────────────────────
  /** How long before the opponent responds to what you did, ms. A novice is late. */
  reactionMs: number;
  /** Chance per decision of an unforced error — the opponent losing it on its own, 0..1. */
  mistakeRate: number;
  /** Chance of punishing a mistake YOU made, 0..1. An expert punishes everything. */
  punishRate: number;
  /** Does it initiate (1) or wait and counter (0)? Neither is harder; they are different opponents. */
  aggression: number;
  /**
   * How strongly it adapts to your recent tendencies, 0..1.
   *
   * The single most "expert-feeling" behaviour in any game: an opponent that notices you always go left.
   * Zero for a rookie, which is why a rookie can be beaten the same way twice.
   */
  adaptRate: number;

  /** The honest scalar, for places where a number really is the model (a race pace, a shot percentage). */
  edge: number;
}

export const TIER_PROFILES: Readonly<Record<Tier, TierProfile>> = {
  rookie: {
    id: 'rookie', name: 'ROOKIE', sub: 'Late to react, and beats itself often enough that you will notice.',
    tint: '#8fe0a0',
    reactionMs: 420, mistakeRate: 0.28, punishRate: 0.15, aggression: 0.3, adaptRate: 0, edge: 0.35,
  },
  pro: {
    id: 'pro', name: 'PRO', sub: 'Reads the obvious, punishes the sloppy, forgives the rest.',
    tint: '#ffd75e',
    reactionMs: 220, mistakeRate: 0.10, punishRate: 0.55, aggression: 0.55, adaptRate: 0.35, edge: 0.6,
  },
  elite: {
    id: 'elite', name: 'ELITE', sub: 'Punishes everything, and starts guessing what you will do next.',
    tint: '#ff7b54',
    reactionMs: 120, mistakeRate: 0.03, punishRate: 0.9, aggression: 0.8, adaptRate: 0.75, edge: 0.85,
  },
};

export const DEFAULT_TIER: Tier = 'pro';

export function profileFor(tier: Tier): TierProfile {
  return TIER_PROFILES[tier] ?? TIER_PROFILES[DEFAULT_TIER];
}

export function tierList(): TierProfile[] {
  return TIERS.map((t) => TIER_PROFILES[t]);
}

/**
 * The behavioural fields only — what `edge` deliberately excludes.
 *
 * Exists so the test can assert that tiers differ in BEHAVIOUR, and so a future tune cannot satisfy the
 * contract by moving one scalar and leaving the opponent playing identically.
 */
export function behavioural(p: TierProfile): Record<string, number> {
  return {
    reactionMs: p.reactionMs,
    mistakeRate: p.mistakeRate,
    punishRate: p.punishRate,
    aggression: p.aggression,
    adaptRate: p.adaptRate,
  };
}

// ── USING A TIER ─────────────────────────────────────────────────────────────────────────────────────────

/** Did the opponent make an unforced error this decision? */
export function blunders(p: TierProfile, roll = Math.random()): boolean {
  return roll < p.mistakeRate;
}

/** Did the opponent punish a mistake you just made? */
export function punishes(p: TierProfile, roll = Math.random()): boolean {
  return roll < p.punishRate;
}

/** Has the opponent reacted yet to something that happened `sinceMs` ago? */
export function hasReacted(p: TierProfile, sinceMs: number): boolean {
  return sinceMs >= p.reactionMs;
}

/**
 * Read a player's recent tendency and return how strongly the opponent should lean against it.
 *
 * `history` is whatever choices the mode tracks (a direction, a shot type, a lane). Returns 0..1: zero for a
 * rookie whatever you do, high for an elite once you repeat yourself. This is the function that makes an
 * elite opponent feel like it is watching you, and it is the same maths in every mode rather than five
 * different guesses at "the AI is learning".
 */
export function tendencyLean<T>(p: TierProfile, history: readonly T[], candidate: T, window = 6): number {
  if (p.adaptRate <= 0 || history.length < 3) return 0;
  const recent = history.slice(-window);
  const hits = recent.filter((h) => h === candidate).length;
  const share = hits / recent.length;
  // only a REAL tendency counts: at chance level there is nothing to read
  const overChance = Math.max(0, share - 0.5) * 2;
  return Math.min(1, overChance * p.adaptRate);
}

// ── THE PICK ─────────────────────────────────────────────────────────────────────────────────────────────

export const TIER_KEY = 'fel-difficulty';

/** `?tier=` wins, then the remembered pick, then PRO. */
export function readTier(): Tier {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('tier');
      if (TIERS.includes(q as Tier)) return q as Tier;
      const s = window.localStorage.getItem(TIER_KEY);
      if (TIERS.includes(s as Tier)) return s as Tier;
    }
  } catch { /* private mode: the default */ }
  return DEFAULT_TIER;
}

export function writeTier(tier: Tier): void {
  try { window.localStorage.setItem(TIER_KEY, tier); } catch { /* convenience only */ }
}

export function readProfile(): TierProfile {
  return profileFor(readTier());
}
