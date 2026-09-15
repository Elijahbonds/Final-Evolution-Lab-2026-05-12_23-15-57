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

export interface ComboLink { label: string; pts: number; kind: 'air' | 'grind' | 'manual' | 'revert'; /** how many times this move already appeared in the combo */ repeat?: number }

// REPEAT DECAY (MECHANICS PASS, 2026-09-15). THPS's own answer to the button masher: the same trick again in the same combo
// pays less — 100 %, 75 %, 50 %, 25 %, then 10 % — and from its fourth appearance it stops raising the multiplier. The
// probe measured Free Run's masher at ~10× a deliberate run (1,610 vs 165): spamming the one move in reach (a slide, a
// vault) paid full points at a growing multiplier every time. Variety is the skill now, which is what a line IS. Past the
// end of the table a repeat pays nothing and does not extend the chain (see add()).
export const REPEAT_DECAY = [1, 0.75, 0.5, 0.25, 0.1, 0] as const;
/** From this many earlier appearances, a repeat no longer raises the multiplier. */
export const REPEAT_NO_MULT = 3;
/** Which links decay: every link, only airs (a mode whose grinds / manuals tick over time), or none. */
export type RepeatDecayScope = 'all' | 'air' | 'none';
/** A move's identity for repeats: the trick, not where it was thrown from or how it landed. */
export const moveKey = (label: string): string => label.replace(/^SKETCHY\s+/, '').split(' OFF ')[0].split(' · ')[0].trim();

export class ComboChain {
  links: ComboLink[] = [];
  pot = 0;
  banked = 0;                   // session total
  bestCombo = 0;
  /** 0 = no combo running (grounded & stopped). */
  active = false;

  constructor(private momentum?: MomentumBus, private decay: RepeatDecayScope = 'none') {}

  /** Links that still count toward the multiplier (a move repeated to death stops counting). */
  get multiplier(): number { return this.links.filter((l) => (l.repeat ?? 0) < REPEAT_NO_MULT).length; }

  /** A trick landed clean — add it and keep the chain alive. Returns what it actually paid (after any repeat decay). */
  add(label: string, pts: number, kind: ComboLink['kind']): number {
    const decays = this.decay === 'all' || (this.decay === 'air' && kind === 'air');
    const key = moveKey(label);
    const repeat = decays ? this.links.filter((l) => moveKey(l.label) === key).length : 0;
    const paid = Math.round(pts * REPEAT_DECAY[Math.min(repeat, REPEAT_DECAY.length - 1)]);
    // ANTI-MASH (2026-09-15): the table bottomed out at 10 %, so the SAME move over and over still paid and still kept the
    // chain alive — free run's masher held a slide loop for a 4 717-point run against an intent line's 806. A move
    // repeated past the table pays NOTHING and is not a link at all: the chain has to be fed something new.
    if (decays && paid <= 0 && pts > 0) return 0;
    this.links.push({ label, pts: paid, kind, repeat });
    this.active = true;
    const before = this.pot;
    this.pot += paid * Math.max(1, this.multiplier);      // Nth trick pays Nx
    this.bestCombo = Math.max(this.bestCombo, this.multiplier);
    if (this.multiplier === 5) this.momentum?.report({ kind: 'big_make' });
    if (this.multiplier >= 8) this.momentum?.report({ kind: 'highlight_dunk', weight: Math.min(30, this.multiplier * 2) });
    return this.pot - before;
  }

  /**
   * Points that accrue INSIDE the link already open (a grind or a manual pays for every frame it is held): the pot grows
   * at the multiplier the chain has, and the chain does NOT get longer.
   *
   * ANTI-MASH (2026-09-15): skate called add() every frame a manual or grind was held, so each FRAME was a link and the
   * multiplier was a frame counter — a masher that fell into a revert-manual rode it to 81x and 7 000 points in a second
   * and a half (measured). A held move is one link.
   */
  accrue(label: string, pts: number, kind: ComboLink['kind']): number {
    const last = this.links[this.links.length - 1];
    if (!last || moveKey(last.label) !== moveKey(label)) return this.add(label, pts, kind);
    const paid = Math.round(pts);
    if (paid <= 0) return 0;
    last.pts += paid;
    this.pot += paid * Math.max(1, this.multiplier);
    return paid * Math.max(1, this.multiplier);
  }

  /** The move's repeat count in this combo so far (0 = fresh) — for a HUD that says REPEAT. */
  repeatsOf(label: string): number { const k = moveKey(label); return this.links.filter((l) => moveKey(l.label) === k).length; }

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
