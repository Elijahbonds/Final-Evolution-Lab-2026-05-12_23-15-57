/**
 * lib/board/board-input.ts
 *
 * Synthetic-key input tracker for the board lane.
 *
 * The app funnels touch controller + physical gamepad through ONE
 * synthetic-key bridge (lib/gamepad-bridge.ts) with lib/input-schemes.ts as
 * the single source of truth (FILE_MAP.md). This tracker therefore listens to
 * plain KeyboardEvents — synthetic or real — and exposes:
 *   - held state (steer / tuck / crouch / spin / boost / grind)
 *   - edge events (flip / grab / special pressed, with the D-pad direction
 *     captured AT PRESS TIME, THPS-style)
 *
 * Harvest notes: copilot InputSystem.js contributed the per-mode
 * button->action map idea and the deadzone helpers (kept for future analog
 * stick support via gamepad-bridge axes).
 *
 * See lib/input-schemes.board.ts for the entries to merge into
 * lib/input-schemes.ts.
 */

import type { TrickButton, TrickDir } from './trick-table';

// ── Deadzone helpers (ported verbatim-in-spirit from copilot InputSystem) ──

const DEADZONE_INNER = 0.06;

export function applyDeadzone(value: number, inner = DEADZONE_INNER): number {
  const v = Math.max(0, Math.min(1, Math.abs(value)));
  if (v <= inner) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * (v - inner)) / (1 - inner);
}

// ── Key bindings ───────────────────────────────────────────────────────────

export interface BoardKeyBindings {
  left: string[];
  right: string[];
  up: string[];     // tuck / trick-direction up
  down: string[];   // brake-ish / trick-direction down
  crouch: string[]; // hold->release = ollie
  flip: string[];
  grab: string[];
  special: string[];
  spinLeft: string[];
  spinRight: string[];
  boost: string[];
  grind: string[];
}

/**
 * ASSUMPTION (flagged): the gamepad-bridge emits standard KeyboardEvent.code
 * values. Arrow keys/WASD for movement and JKL-row for actions match the
 * documented virtual-controller conventions; adjust codes here (only here)
 * once the live lib/gamepad-bridge.ts mapping is visible.
 */
export const DEFAULT_BOARD_BINDINGS: BoardKeyBindings = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  crouch: ['Space'],
  flip: ['KeyJ'],           // PS cross-row analog: square
  grab: ['KeyK'],           // triangle
  special: ['KeyU'],        // square+triangle chord stand-in
  spinLeft: ['KeyQ'],       // L1
  spinRight: ['KeyE'],      // R1
  boost: ['ShiftLeft', 'KeyL'], // R2
  grind: ['KeyI'],          // circle (hold on descent)
};

// ── Tracker ────────────────────────────────────────────────────────────────

export interface TrickPressEvent {
  button: TrickButton;
  dir: TrickDir;
}

export class BoardInput {
  private _held = new Set<string>();
  private _bindings: BoardKeyBindings;
  private _trickQueue: TrickPressEvent[] = [];
  private _attached = false;
  private _target: Window | HTMLElement | null = null;

  constructor(bindings: BoardKeyBindings = DEFAULT_BOARD_BINDINGS) {
    this._bindings = bindings;
  }

  attach(target: Window | HTMLElement = window): void {
    if (this._attached) return;
    this._target = target;
    target.addEventListener('keydown', this._onKeyDown as EventListener);
    target.addEventListener('keyup', this._onKeyUp as EventListener);
    this._attached = true;
  }

  detach(): void {
    if (!this._attached || !this._target) return;
    this._target.removeEventListener('keydown', this._onKeyDown as EventListener);
    this._target.removeEventListener('keyup', this._onKeyUp as EventListener);
    this._attached = false;
    this._held.clear();
    this._trickQueue.length = 0;
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this._held.add(e.code);
    const b = this._bindings;
    if (b.flip.includes(e.code)) this._trickQueue.push({ button: 'flip', dir: this._dirNow() });
    else if (b.grab.includes(e.code)) this._trickQueue.push({ button: 'grab', dir: this._dirNow() });
    else if (b.special.includes(e.code)) this._trickQueue.push({ button: 'special', dir: this._dirNow() });
  };

  private _onKeyUp = (e: KeyboardEvent): void => {
    this._held.delete(e.code);
  };

  private _any(codes: string[]): boolean {
    for (let i = 0; i < codes.length; i++) if (this._held.has(codes[i])) return true;
    return false;
  }

  /** Direction held at the instant a trick button lands (THPS input grammar). */
  private _dirNow(): TrickDir {
    const b = this._bindings;
    if (this._any(b.up)) return 'up';
    if (this._any(b.down)) return 'down';
    if (this._any(b.left)) return 'left';
    if (this._any(b.right)) return 'right';
    return 'neutral';
  }

  // ── Per-frame reads (no allocation) ──────────────────────────────────────

  steer(): number {
    const b = this._bindings;
    return (this._any(b.right) ? 1 : 0) - (this._any(b.left) ? 1 : 0);
  }

  spin(): number {
    const b = this._bindings;
    return (this._any(b.spinRight) ? 1 : 0) - (this._any(b.spinLeft) ? 1 : 0);
  }

  tuck(): boolean { return this._any(this._bindings.up); }
  crouch(): boolean { return this._any(this._bindings.crouch); }
  boost(): boolean { return this._any(this._bindings.boost); }
  grind(): boolean { return this._any(this._bindings.grind); }

  /** Drain queued trick presses. Returns null when empty. */
  nextTrickPress(): TrickPressEvent | null {
    return this._trickQueue.length > 0 ? (this._trickQueue.shift() as TrickPressEvent) : null;
  }

  clearTricks(): void { this._trickQueue.length = 0; }
}
