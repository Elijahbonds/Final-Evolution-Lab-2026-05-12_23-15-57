// MomentumBus — FEL's shared "Game-Breaker" layer (Mode 1 Phase 6).
//
// Before this module, momentum/hype was a per-mode local number that moved
// a HUD bar and nothing else. The Bus makes highlight plays a SYSTEM:
// every mode reports game-breaking events (posterize, ankle-breaker,
// contest 50-bomb, block, chain dunk) through ONE channel, which:
//   - tracks a decaying momentum score with tier thresholds
//     (COLD → WARMING → HOT → ON FIRE),
//   - applies a momentum multiplier to swingy outcomes (shot pct nudges,
//     judge generosity — modes read multiplier(), never roll their own),
//   - notifies subscribers (HUD flames, crowd escalation, commentary
//     stingers) on tier CHANGES — the visible momentum shift the directive
//     demands from highlight plays.
//
// Headless + transport-agnostic: a networked Game-Breaker later subscribes
// to the same events; no mode code changes.

export type MomentumTier = 'cold' | 'warming' | 'hot' | 'on_fire';

export interface MomentumEvent {
  kind: 'posterize' | 'ankle_break' | 'block' | 'steal' | 'highlight_dunk'
      | 'big_make' | 'contest_50' | 'contest_low' | 'miss' | 'turnover';
  /** Optional explicit weight override. */
  weight?: number;
}

const WEIGHT: Record<MomentumEvent['kind'], number> = {
  posterize: 22, ankle_break: 12, block: 15, steal: 10, highlight_dunk: 16,
  big_make: 8, contest_50: 25, contest_low: -10, miss: -6, turnover: -14,
};

const TIERS: [MomentumTier, number][] = [
  ['on_fire', 75], ['hot', 45], ['warming', 18], ['cold', -Infinity],
];

/** Momentum multiplier bounds — big enough to feel, small enough to stay fair. */
const MULT_MIN = 0.94, MULT_MAX = 1.10;
const DECAY_PER_SEC = 2.2;

export class MomentumBus {
  private score = 0;
  private subs = new Set<(tier: MomentumTier, prev: MomentumTier, score: number) => void>();

  get tier(): MomentumTier {
    return TIERS.find(([, min]) => this.score >= min)![0];
  }

  get score01(): number { return Math.max(0, Math.min(1, this.score / 100)); }

  /** Shot/judge swing multiplier. ON FIRE rewards aggression; cold tightens. */
  multiplier(): number {
    return MULT_MIN + (MULT_MAX - MULT_MIN) * this.score01;
  }

  /** Report a game-breaking event. Returns the tier if it changed. */
  report(e: MomentumEvent): MomentumTier | null {
    const prev = this.tier;
    this.score = Math.max(0, Math.min(100, this.score + (e.weight ?? WEIGHT[e.kind])));
    const next = this.tier;
    if (next !== prev) this.subs.forEach((fn) => fn(next, prev, this.score));
    return next !== prev ? next : null;
  }

  /** Momentum cools without action — call per frame. */
  update(dt: number): void {
    const prev = this.tier;
    this.score = Math.max(0, this.score - DECAY_PER_SEC * dt);
    const next = this.tier;
    if (next !== prev) this.subs.forEach((fn) => fn(next, prev, this.score));
  }

  onTierChange(fn: (tier: MomentumTier, prev: MomentumTier, score: number) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  reset(): void { this.score = 0; }
}
