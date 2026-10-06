// CONSOLE NAVIGATION — the d-pad, the stick, A and B, and the keyboard's arrows, Enter and Escape.
//
// Pure. The card asks the DOM for its focusable buttons' rectangles (every element marked `data-end-focus`, the slots'
// included) and moves to the nearest one in the pressed direction, so a button another lane mounts joins the grid with
// no list to keep in step.
//
// The pad is read directly (navigator.getGamepads) because a Babylon mode owns its own input and GameShell's bridge is
// off for it; for the legacy DOM modes the bridge turns pad presses into SYNTHETIC key events, which the card's key
// handler ignores (isTrusted false), so a pad press is never handled twice.

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Intent = Dir | 'select' | 'back';

export interface Rect { left: number; top: number; width: number; height: number }

/** How far apart two spans are on one axis (0 when they overlap). */
const gap = (a0: number, a1: number, b0: number, b1: number): number => (b0 > a1 ? b0 - a1 : a0 > b1 ? a0 - b1 : 0);

/**
 * PURE: the index to move to from `from` in `dir`, or `from` when nothing lies that way. A candidate must lie wholly past
 * our edge in the pressed direction; one that shares our row / column wins over one that does not, then the nearest — so
 * "down" from Play again goes to the button under it, not the one diagonally across.
 */
export function spatialNext(rects: readonly Rect[], from: number, dir: Dir): number {
  const a = rects[from];
  if (!a) return rects.length ? 0 : -1;
  const aR = a.left + a.width, aB = a.top + a.height;
  let best = from;
  let bestScore = Infinity;
  rects.forEach((r, i) => {
    if (i === from) return;
    const rR = r.left + r.width, rB = r.top + r.height;
    let along: number;
    let across: number;
    if (dir === 'right') { if (r.left < aR - 1) return; along = r.left - aR; across = gap(a.top, aB, r.top, rB); }
    else if (dir === 'left') { if (rR > a.left + 1) return; along = a.left - rR; across = gap(a.top, aB, r.top, rB); }
    else if (dir === 'down') { if (r.top < aB - 1) return; along = r.top - aB; across = gap(a.left, aR, r.left, rR); }
    else { if (rB > a.top + 1) return; along = a.top - rB; across = gap(a.left, aR, r.left, rR); }
    // a control sharing our row (or column) always beats one that does not: Left from the Next teaser is Play again,
    // never the button tucked under the teaser's left edge on the row below
    const score = (across > 0 ? 1e6 : 0) + Math.max(0, along) + across * 2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** PURE: a keyboard key → what it means on the card. WASD stay the game's: only the arrows, Enter/Space and Escape/Backspace. */
export function keyIntent(key: string): Intent | null {
  switch (key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'Enter': case ' ': case 'Spacebar': return 'select';
    case 'Escape': case 'Backspace': case 'GoBack': case 'BrowserBack': return 'back';
    default: return null;
  }
}

/** One pad, one frame: the standard mapping's A (0), B (1), d-pad (12–15) and the left stick. */
export interface PadFrame { a: boolean; b: boolean; up: boolean; down: boolean; left: boolean; right: boolean }

export const STICK_ON = 0.55;

export function padFrame(pad: { buttons: readonly { pressed: boolean }[]; axes: readonly number[] } | null | undefined): PadFrame {
  const btn = (i: number) => Boolean(pad?.buttons?.[i]?.pressed);
  const ax = pad?.axes?.[0] ?? 0, ay = pad?.axes?.[1] ?? 0;
  return {
    a: btn(0), b: btn(1),
    up: btn(12) || ay < -STICK_ON, down: btn(13) || ay > STICK_ON,
    left: btn(14) || ax < -STICK_ON, right: btn(15) || ax > STICK_ON,
  };
}

/**
 * PURE: what this frame pressed, edges only — a button or a stick push counts once when it goes down. `prev` null is the
 * first frame the card sees: anything already held then (the A the player was mashing at the whistle) is NOT a press.
 */
export function padIntents(prev: PadFrame | null, now: PadFrame): Intent[] {
  if (!prev) return [];
  const out: Intent[] = [];
  if (now.a && !prev.a) out.push('select');
  if (now.b && !prev.b) out.push('back');
  if (now.up && !prev.up) out.push('up');
  if (now.down && !prev.down) out.push('down');
  if (now.left && !prev.left) out.push('left');
  if (now.right && !prev.right) out.push('right');
  return out;
}
