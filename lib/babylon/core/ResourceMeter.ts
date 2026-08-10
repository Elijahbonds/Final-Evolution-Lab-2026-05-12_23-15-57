// ResourceMeter — Mode 2 Phase 5: the shared combat resource framework.
// ONE meter class serves chakra (Showdown), chi (duels), and focus (board/
// precision modes later): fills from real combat actions, spends on
// dash-cancels, substitutions, and ultimates, and enforces "full-bar only"
// spends (ultimates) vs partial spends (dash). No mode rolls its own.

export interface MeterTuning {
  max: number;
  regenPerSec: number;         // passive trickle (0 for pure action-fueled)
  /** gains per action kind */
  gains: Partial<Record<'hitLanded' | 'hitTaken' | 'parry' | 'guardImpact' | 'whiff' | 'blocked', number>>;
}

export const CHI: MeterTuning = {
  max: 100, regenPerSec: 1.5,
  gains: { hitLanded: 10, hitTaken: 5, parry: 14, guardImpact: 18, blocked: 3 },
};

export const CHAKRA: MeterTuning = {
  max: 100, regenPerSec: 3,                       // Storm-style: charges faster
  gains: { hitLanded: 8, hitTaken: 4, parry: 10, guardImpact: 14 },
};

export class ResourceMeter {
  value = 0;
  constructor(private tuning: MeterTuning) {}

  get full(): boolean { return this.value >= this.tuning.max; }
  get ratio01(): number { return this.value / this.tuning.max; }

  update(dt: number): void {
    this.value = Math.min(this.tuning.max, this.value + this.tuning.regenPerSec * dt);
  }

  /** Action happened → meter gain (per tuning table). */
  gain(kind: keyof MeterTuning['gains']): number {
    const g = this.tuning.gains[kind] ?? 0;
    this.value = Math.min(this.tuning.max, this.value + g);
    return g;
  }

  /** Partial spend (dash, substitution). False when short. */
  spend(cost: number): boolean {
    if (this.value < cost) return false;
    this.value -= cost;
    return true;
  }

  /** Full-bar spend (ultimate). False unless maxed; drains to zero. */
  spendUltimate(): boolean {
    if (!this.full) return false;
    this.value = 0;
    return true;
  }
}
