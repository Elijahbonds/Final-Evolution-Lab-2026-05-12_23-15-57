/**
 * lib/scene/input-manager.ts
 * ==========================
 * M7-QA1 §4 — Desktop keyboard + touch input.
 *
 * Shared input manager that tracks the currently-pressed keys, detects
 * device type, and can render a control mapping overlay.
 *
 * The manager attaches to `window` for key events (Canvas absorbs
 * focus via tabIndex). It also exposes a `bindings` record per mode
 * for the CONTROLS overlay.
 */

export interface InputState {
  /** Currently held directional keys. */
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Action keys (one-frame impulse — set true on keydown, consumer clears). */
  action1: boolean; // SPACE (strike/shoot/confirm)
  action2: boolean; // E / S (special/secondary)
  block: boolean;   // B / ArrowDown (hold)
  /** Raw key map for additional per-mode custom keys. */
  keys: Record<string, boolean>;
}

export type DeviceType = 'desktop' | 'touch';

export interface ControlBinding {
  key: string;
  label: string;
}

export interface ModeControls {
  desktop: ControlBinding[];
  touch: ControlBinding[];
}

/** Per-mode control bindings. */
export const MODE_BINDINGS: Record<string, ModeControls> = {
  basketball_dunk: {
    desktop: [
      { key: 'W/A/S/D', label: 'Move' },
      { key: 'SPACE', label: 'Charge / Jump' },
      { key: 'E', label: 'Signature Dunk' },
    ],
    touch: [
      { key: 'Joystick', label: 'Move' },
      { key: 'TAP', label: 'Charge / Jump' },
    ],
  },
  basketball_h2h: {
    desktop: [
      { key: 'W/A/S/D', label: 'Move' },
      { key: 'SPACE', label: 'Shoot / Release' },
    ],
    touch: [
      { key: 'Joystick', label: 'Move' },
      { key: 'TAP', label: 'Shoot' },
    ],
  },
  basketball_3v3: {
    desktop: [
      { key: 'W/A/S/D', label: 'Move' },
      { key: '← / ↑ / →', label: 'Pass to Lane' },
      { key: 'SPACE', label: 'Shoot' },
    ],
    touch: [
      { key: 'Joystick', label: 'Move' },
      { key: 'L / C / R', label: 'Pass to Lane' },
    ],
  },
  karate_versus: {
    desktop: [
      { key: 'A / D', label: 'Step Left / Right' },
      { key: 'J', label: 'Slash (horizontal — tracks)' },
      { key: 'K', label: 'Heavy (vertical — big / Dragon at full chi)' },
      { key: 'U', label: 'Kick (fast poke)' },
      { key: 'L', label: 'Guard (hold)' },
    ],
    touch: [
      { key: '◀ / ▶', label: 'Step' },
      { key: 'SLASH', label: 'Horizontal' },
      { key: 'HEAVY', label: 'Vertical / Dragon' },
      { key: 'KICK', label: 'Fast poke' },
      { key: 'GUARD', label: 'Block (hold)' },
    ],
  },
};

/** Detect whether the primary input device is touch. */
export function detectDevice(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0 ? 'touch' : 'desktop';
}

/** Create a fresh zero input state. */
export function createInputState(): InputState {
  return {
    left: false, right: false, up: false, down: false,
    action1: false, action2: false, block: false,
    keys: {},
  };
}

/**
 * Ensure the Canvas element can receive keyboard focus.
 * Call once after the Canvas mounts. Returns a cleanup fn.
 */
export function ensureCanvasFocus(canvasContainer: HTMLElement | null): () => void {
  if (!canvasContainer) return () => {};
  // Make the canvas container focusable.
  if (!canvasContainer.getAttribute('tabindex')) {
    canvasContainer.setAttribute('tabindex', '0');
  }
  canvasContainer.style.outline = 'none';
  // Auto-focus on mount and on click.
  canvasContainer.focus();
  const onClick = () => canvasContainer.focus();
  canvasContainer.addEventListener('click', onClick);
  return () => canvasContainer.removeEventListener('click', onClick);
}
