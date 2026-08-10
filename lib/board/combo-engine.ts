/**
 * lib/board/combo-engine.ts
 *
 * THPS combo model: (sum of trick bases) x (multiplier that grows per trick),
 * accrued while the line is alive (air / grind / chained within a short
 * ground window), BANKED on a clean settle, LOST on a bail.
 *
 * Harvest notes: copilot ComboSystem.js contributed the chain-window pattern
 * (windowMs countdown -> break). Its flat 1-4x tiered multiplier and
 * hit-quality tracking fit combat, not board lines, so the accrual model was
 * replaced with base-sum x per-trick multiplier and explicit bank/bail —
 * that is where the SSX/THPS risk-reward tension lives.
 */

export interface ComboSnapshot {
  /** sum of trick base points currently on the line */
  baseSum: number;
  /** current multiplier (1 + tricks landed in this line) */
  multiplier: number;
  /** baseSum * multiplier — what you'd bank right now */
  pending: number;
  /** line is alive (accruing) */
  open: boolean;
  /** 0..1 fraction of the ground chain window remaining (1 = just landed) */
  chainWindow: number;
}

const CHAIN_WINDOW_MS = 900; // touch ground, keep the line alive this long
const MAX_MULTIPLIER = 12;

export class ComboEngine {
  private _baseSum = 0;
  private _multiplier = 1;
  private _open = false;
  private _groundMsLeft = 0; // >0: grounded grace period ticking down
  private _grounded = true;

  bestCombo = 0;
  totalBanked = 0;
  tricksThisLine = 0;

  /** Trick landed (or grind started) — extends the line. */
  addTrick(points: number): ComboSnapshot {
    if (!this._open) {
      this._open = true;
      this._baseSum = 0;
      this._multiplier = 0;
      this.tricksThisLine = 0;
    }
    this._baseSum += Math.max(0, Math.round(points));
    this._multiplier = Math.min(MAX_MULTIPLIER, this._multiplier + 1);
    this.tricksThisLine += 1;
    this._groundMsLeft = 0;
    return this.snapshot();
  }

  /** Continuous accrual while grinding (points already per-frame scaled). */
  addGrindPoints(points: number): void {
    if (!this._open) {
      this._open = true;
      this._baseSum = 0;
      this._multiplier = 1;
      this.tricksThisLine = 0;
    }
    this._baseSum += points;
    this._groundMsLeft = 0;
  }

  /**
   * Call every frame with grounded state. Returns the banked amount when the
   * ground grace window expires (0 otherwise).
   */
  update(dtMs: number, grounded: boolean): number {
    if (!this._open) { this._grounded = grounded; return 0; }

    if (grounded && !this._grounded) this._groundMsLeft = CHAIN_WINDOW_MS;
    if (!grounded) this._groundMsLeft = 0;
    this._grounded = grounded;

    if (grounded && this._groundMsLeft > 0) {
      this._groundMsLeft -= dtMs;
      if (this._groundMsLeft <= 0) return this.bank();
    }
    return 0;
  }

  /** Settle the line into the score. Returns the banked amount. */
  bank(): number {
    if (!this._open) return 0;
    const amount = Math.round(this._baseSum * Math.max(1, this._multiplier));
    this.bestCombo = Math.max(this.bestCombo, amount);
    this.totalBanked += amount;
    this._reset();
    return amount;
  }

  /** Bail — the whole pending line evaporates. Returns what was lost. */
  bail(): number {
    const lost = this._open ? Math.round(this._baseSum * Math.max(1, this._multiplier)) : 0;
    this._reset();
    return lost;
  }

  snapshot(): ComboSnapshot {
    return {
      baseSum: Math.round(this._baseSum),
      multiplier: Math.max(1, this._multiplier),
      pending: Math.round(this._baseSum * Math.max(1, this._multiplier)),
      open: this._open,
      chainWindow: this._groundMsLeft > 0 ? this._groundMsLeft / CHAIN_WINDOW_MS : this._open ? 1 : 0,
    };
  }

  reset(): void {
    this._reset();
    this.bestCombo = 0;
    this.totalBanked = 0;
  }

  private _reset(): void {
    this._baseSum = 0;
    this._multiplier = 1;
    this._open = false;
    this._groundMsLeft = 0;
    this.tricksThisLine = 0;
  }
}
