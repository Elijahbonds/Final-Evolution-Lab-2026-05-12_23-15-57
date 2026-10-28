// hoops-p01: the shot press that waits for the move (hoops/response/pressBuffer) — the rule C2 asks for, and the case the rig measured.
import { describe, expect, it } from 'vitest';
import { PressBuffer, BUFFER_AFTER_CLEAR_MS, BUSY_BUFFER_MAX_MS } from './pressBuffer';

/** Run frames at 60 fps: `locked(ms)` says whether the gate is shut; a press at `pressAt`; returns the ms the buffered press fires, or null. */
function play(lockedUntil: number, pressAt: number, gateOpensAfterClearMs = 0, endMs = 2000): number | null {
  const b = new PressBuffer();
  for (let t = 0; t <= endMs; t += 1000 / 60) {
    const locked = t < lockedUntil + gateOpensAfterClearMs;
    b.tick(t < lockedUntil, t);
    if (t >= pressAt && t < pressAt + 50 && t < lockedUntil) b.press(t);   // a 50 ms tap, inside the lock
    if (!locked && b.consume()) return t;
  }
  return null;
}

describe('PressBuffer — a squeeze during a move fires when the move clears', () => {
  it('the rig\'s case: a tap 0.1 s into a 0.65 s spin fires on the frame the spin clears (InputBuffer(400) dropped it)', () => {
    const at = play(650, 100);
    expect(at).not.toBeNull();
    expect(at! - 650).toBeLessThanOrEqual(1000 / 60);
  });
  it('waits out a gate that opens up to BUFFER_AFTER_CLEAR_MS after the lock; no longer', () => {
    expect(play(500, 100, BUFFER_AFTER_CLEAR_MS - 20)).not.toBeNull();
    expect(play(500, 100, BUFFER_AFTER_CLEAR_MS + 40)).toBeNull();
  });
  it('never outlives BUSY_BUFFER_MAX_MS from the press (a resting thumb in a long dunk is not a shot later)', () => {
    expect(play(100 + BUSY_BUFFER_MAX_MS + 100, 100)).toBeNull();
  });
  it('fires once, and clear() drops it', () => {
    const b = new PressBuffer(); b.press(0); b.tick(false, 10);
    expect(b.consume()).toBe(true); expect(b.consume()).toBe(false);
    b.press(20); b.clear(); b.tick(false, 30); expect(b.consume()).toBe(false);
  });
});
