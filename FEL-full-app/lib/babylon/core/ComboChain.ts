// ComboChain — Mode 3 Phase 7: THPS-style combo flow with banking, wired
// to the shared Judge/Scoring + MomentumBus (Game-Breaker) layers.
//
//   A combo = tricks landed without bailing or stopping: airs (Phase 5),
//   grinds (per-second tick), manuals (ground links, Phase 9). Each link
//   raises the MULTIPLIER; points accrue into the combo pot. The pot is
//   BANKED (safe) only when the rider stops clean — a bail burns it.
//   That's the THPS risk loop: every extra trick is greed vs. safety.
//
//   MomentumBus gets the escalations (a 10x chain is a highlight);
//   Judge/Scoring consumers read banked totals + best combo.

import { MomentumBus } from './MomentumBus';

export interface ComboLink { label: string; pts: number; kind: 'air' | 'grind' | 'manual' | 'revert' }

export class ComboChain {
  links: ComboLink[] = [];
  pot = 0;
  banked = 0;                   // session total
  bestCombo = 0;
  /** 0 = no combo running (grounded & stopped). */
  active = false;

  constructor(private momentum?: MomentumBus) {}

  get multiplier(): number { return this.links.length; }

  /** A trick landed clean — add it and keep the chain alive. */
  add(label: string, pts: number, kind: ComboLink['kind']): void {
    this.links.push({ label, pts, kind });
    this.active = true;
    this.pot += pts * this.multiplier;      // Nth trick pays Nx
    this.bestCombo = Math.max(this.bestCombo, this.multiplier);
    if (this.multiplier === 5) this.momentum?.report({ kind: 'big_make' });
    if (this.multiplier >= 8) this.momentum?.report({ kind: 'highlight_dunk', weight: Math.min(30, this.multiplier * 2) });
  }

  /** Rider stopped clean on the ground — bank the pot. */
  bank(): number {
    if (!this.active) return 0;
    const out = this.pot;
    this.banked += out;
    this.links = [];
    this.pot = 0;
    this.active = false;
    return out;
  }

  /** Bail — the pot burns. */
  bail(): number {
    const lost = this.pot;
    this.links = [];
    this.pot = 0;
    this.active = false;
    if (lost > 0) this.momentum?.report({ kind: 'miss', weight: -Math.min(14, Math.round(lost / 400)) });
    return lost;
  }

  get hud(): { combo: string; pot: number; banked: number } {
    return {
      combo: this.active ? `${this.multiplier}x` : '',
      pot: this.pot,
      banked: this.banked,
    };
  }
}
