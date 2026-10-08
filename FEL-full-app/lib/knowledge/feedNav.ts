// Feed navigation, as pure functions: which key or pad press means what, and where it moves you. The feed is a CSS
// scroll-snap column, so touch and the mouse wheel work natively; keyboard and gamepad go through here so each card is
// exactly one press.
//
// Pads are read through the input layer (lib/input/profiles readPad → CanonicalPad), never by raw button index
// (lib/input/noRawIndices.test.ts). This module only sees the canonical shape.

export type NavAction = 'next' | 'prev' | 'left' | 'right' | 'select' | 'like' | 'save' | 'first' | 'last' | 'back'
  | { pick: number };

/** Keyboard: arrows / j k / space / page keys move; 1–4 answer; Enter picks the focused option; L like, S save. */
export function keyAction(key: string, shift = false): NavAction | null {
  switch (key) {
    case 'ArrowDown': case 'PageDown': case 'j': case 'J': return 'next';
    case ' ': case 'Spacebar': return shift ? 'prev' : 'next';
    case 'ArrowUp': case 'PageUp': case 'k': case 'K': return 'prev';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'Enter': return 'select';
    case 'Home': return 'first';
    case 'End': return 'last';
    case 'Escape': return 'back';
    case 'l': case 'L': return 'like';
    case 's': case 'S': return 'save';
    case '1': case '2': case '3': case '4': return { pick: Number(key) - 1 };
    default: return null;
  }
}

/** Where a move lands, clamped to the feed. */
export function stepIndex(index: number, action: NavAction, length: number): number {
  if (length <= 0) return 0;
  if (action === 'next') return Math.min(length - 1, index + 1);
  if (action === 'prev') return Math.max(0, index - 1);
  if (action === 'first') return 0;
  if (action === 'last') return length - 1;
  return Math.max(0, Math.min(length - 1, index));
}

/** Left/right move the focused quiz option, wrapping; nothing focused yet starts at the first (right) or last (left). */
export function moveFocus(focus: number | null, action: 'left' | 'right', options: number): number | null {
  if (options <= 0) return null;
  if (focus === null) return action === 'right' ? 0 : options - 1;
  return action === 'right' ? (focus + 1) % options : (focus - 1 + options) % options;
}

/** The parts of a canonical pad the feed reads. */
export interface PadState {
  up: boolean; down: boolean; left: boolean; right: boolean;
  a: boolean; b: boolean; x: boolean; y: boolean;
}

export const PAD_IDLE: PadState = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false };

/** From readPad's canonical shape: d-pad or left stick for direction (stick past half-way), faces by position. */
export function padStateFrom(p: { dpad: Record<'up' | 'down' | 'left' | 'right', boolean>; lx: number; ly: number; buttons: Record<'A' | 'B' | 'X' | 'Y', boolean> }): PadState {
  return {
    up: p.dpad.up || p.ly < -0.5,
    down: p.dpad.down || p.ly > 0.5,
    left: p.dpad.left || p.lx < -0.5,
    right: p.dpad.right || p.lx > 0.5,
    a: p.buttons.A, b: p.buttons.B, x: p.buttons.X, y: p.buttons.Y,
  };
}

/** Hold-to-repeat for up/down: the first repeat after REPEAT_DELAY_MS, then every REPEAT_EVERY_MS. */
export const REPEAT_DELAY_MS = 450;
export const REPEAT_EVERY_MS = 220;

export interface PadTracker { prev: PadState; heldSince: Partial<Record<'up' | 'down', number>>; lastRepeat: Partial<Record<'up' | 'down', number>> }

export function freshTracker(): PadTracker {
  return { prev: PAD_IDLE, heldSince: {}, lastRepeat: {} };
}

/**
 * Edge-detect one pad frame. A press fires once on the way down; holding up/down repeats. A = select, B = back,
 * X = like, Y = save, d-pad/stick up/down = prev/next, left/right = move the option focus.
 */
export function padActions(t: PadTracker, cur: PadState, nowMs: number): { actions: NavAction[]; tracker: PadTracker } {
  const actions: NavAction[] = [];
  const edge = (k: keyof PadState) => cur[k] && !t.prev[k];
  const heldSince = { ...t.heldSince };
  const lastRepeat = { ...t.lastRepeat };
  for (const dir of ['up', 'down'] as const) {
    const act: NavAction = dir === 'down' ? 'next' : 'prev';
    if (edge(dir)) { actions.push(act); heldSince[dir] = nowMs; lastRepeat[dir] = nowMs; continue; }
    if (cur[dir] && heldSince[dir] !== undefined) {
      const since = nowMs - heldSince[dir]!;
      const fromLast = nowMs - (lastRepeat[dir] ?? heldSince[dir]!);
      if (since >= REPEAT_DELAY_MS && fromLast >= (lastRepeat[dir] === heldSince[dir] ? REPEAT_DELAY_MS : REPEAT_EVERY_MS)) {
        actions.push(act); lastRepeat[dir] = nowMs;
      }
    }
    if (!cur[dir]) { delete heldSince[dir]; delete lastRepeat[dir]; }
  }
  if (edge('left')) actions.push('left');
  if (edge('right')) actions.push('right');
  if (edge('a')) actions.push('select');
  if (edge('b')) actions.push('back');
  if (edge('x')) actions.push('like');
  if (edge('y')) actions.push('save');
  return { actions, tracker: { prev: cur, heldSince, lastRepeat } };
}
