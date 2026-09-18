/**
 * lib/board/boost-meter.ts
 *
 * SSX adrenaline meter. Banked combo points fill it; holding boost drains it
 * for a speed multiplier + golden trail + FOV kick. A FULL meter enters
 * TRICKY state: the discipline's signature trick unlocks and boost burns
 * hotter. Landing the signature trick spends a fixed chunk.
 */

export interface BoostSnapshot {
  value: number;      // 0..1
  active: boolean;    // currently burning
  tricky: boolean;    // full-meter state (signature trick armed)
  rhythm: number;     // SSX3 flow chain length (banks landed in rhythm)
  rhythmMult: number; // fill multiplier earned by staying in rhythm
}

const FILL_PER_POINT = 1 / 2600;  // ~1 full bar per 2600 banked points
const DRAIN_PER_SEC = 0.24;
const TRICKY_EXIT_BELOW = 0.35;   // tricky is sticky until meter drops here
const SPECIAL_COST = 0.5;
// SSX3 "rhythm boost": chaining banks in a steady flow fills the meter faster.
const RHYTHM_WINDOW_S = 3.0;      // TUNE(elijah) — max gap to keep the groove
const RHYTHM_STEP = 0.2;          // TUNE(elijah) — fill bonus per in-rhythm bank
const RHYTHM_MAX = 4;             // TUNE(elijah) — cap on the rhythm chain

export class BoostMeter {
  value = 0;
  active = false;
  tricky = false;
  rhythm = 0;
  private _lastBankAt = -Infinity;

  /** Fill multiplier from the current rhythm chain (1x at chain 0). */
  rhythmMult(): number {
    return 1 + Math.min(RHYTHM_MAX, this.rhythm) * RHYTHM_STEP;
  }

  /**
   * Feed banked combo points in. Perfect landings can pass a bonus.
   * When `nowSec` is supplied, banks landed within RHYTHM_WINDOW_S of each other
   * grow a rhythm chain that scales the fill (SSX3 flow). Time is optional so
   * existing callers keep working unchanged.
   */
  addFromPoints(points: number, bonus = 0, nowSec?: number): void {
    if (typeof nowSec === 'number') {
      this.rhythm = nowSec - this._lastBankAt <= RHYTHM_WINDOW_S
        ? Math.min(RHYTHM_MAX, this.rhythm + 1)
        : 0;
      this._lastBankAt = nowSec;
    }
    const gain = points * FILL_PER_POINT * this.rhythmMult() + bonus;
    this.value = Math.min(1, this.value + gain);
    if (this.value >= 1) this.tricky = true;
  }

  /** Spend the TRICKY chunk when the signature trick lands. */
  spendSpecial(): boolean {
    if (!this.tricky) return false;
    this.value = Math.max(0, this.value - SPECIAL_COST);
    if (this.value < TRICKY_EXIT_BELOW) this.tricky = false;
    return true;
  }

  update(dt: number, boostHeld: boolean): void {
    this.active = boostHeld && this.value > 0.02;
    if (this.active) {
      this.value = Math.max(0, this.value - DRAIN_PER_SEC * (this.tricky ? 0.8 : 1) * dt);
    }
    if (this.tricky && this.value < TRICKY_EXIT_BELOW) this.tricky = false;
  }

  speedMultiplier(): number {
    if (!this.active) return 1;
    return this.tricky ? 1.6 : 1.42;
  }

  snapshot(out: BoostSnapshot): BoostSnapshot {
    out.value = this.value;
    out.active = this.active;
    out.tricky = this.tricky;
    out.rhythm = this.rhythm;
    out.rhythmMult = this.rhythmMult();
    return out;
  }

  reset(): void {
    this.value = 0;
    this.active = false;
    this.tricky = false;
    this.rhythm = 0;
    this._lastBankAt = -Infinity;
  }
}
