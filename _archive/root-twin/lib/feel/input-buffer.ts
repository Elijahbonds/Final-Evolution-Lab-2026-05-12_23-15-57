/**
 * lib/feel/input-buffer.ts
 * ========================
 * M9 — reusable, mode-agnostic buffered-input window.
 *
 * TypeScript port of the proven engineering-line InputBuffer
 * (FEEL_REFERENCE_SPEC §2). A press is never dropped — if an action can't
 * fire the moment it's pressed (mid-animation, mid-air), it fires the
 * instant it becomes legal, as long as that happens within the window.
 * A single press fires at most once (consume clears it).
 *
 * Zero-alloc in the hot path: timestamps live in a plain object keyed by
 * action name; press/consume touch numbers only.
 */

export interface InputBufferOpts {
  windowMs?: number;
  now?: () => number;
}

export class InputBuffer {
  windowMs: number;
  private _now: () => number;
  private _pressedAt: Record<string, number | undefined>;

  constructor({ windowMs = 120, now }: InputBufferOpts = {}) {
    this.windowMs = windowMs;
    this._now =
      now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this._pressedAt = Object.create(null);
  }

  /** Record a press for `action` at the current time. */
  press(action: string): void {
    this._pressedAt[action] = this._now();
  }

  /**
   * True if `action` was pressed within the window. Consumes the press —
   * a single press fires at most once.
   */
  consume(action: string): boolean {
    const t = this._pressedAt[action];
    if (t === undefined) return false;
    const fresh = this._now() - t <= this.windowMs;
    this._pressedAt[action] = undefined;
    return fresh;
  }

  /** Peek without consuming (for tests/HUD). */
  isBuffered(action: string): boolean {
    const t = this._pressedAt[action];
    return t !== undefined && this._now() - t <= this.windowMs;
  }

  clear(): void {
    this._pressedAt = Object.create(null);
  }
}

export default InputBuffer;
