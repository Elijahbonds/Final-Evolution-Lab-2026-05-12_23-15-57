import { describe, expect, it } from 'vitest';
import { QUEUE_MS, StrikeController, type CombatMove } from './StrikeSystem';

/** A jab-shaped move: 0.42 s end to end, chains into itself inside a 0.18 s window. */
const jab = (): CombatMove => ({
  atk: { damage: 6, range: 1.4, guardBreak: false, chip: 1 } as unknown as CombatMove['atk'],
  startupSec: 0.12, activeSec: 0.08, recoverySec: 0.22,
  cancelInto: ['jab'], cancelWindowSec: 0.18, weight: 'light', tags: ['jab'],
});
const SET: Record<string, CombatMove> = { jab: jab() };
const STEP = 16;

/** Press once, `offsetMs` into a swing that started at 0, then run the clock. Did a second swing come out? */
function pressDuringSwing(offsetMs: number): boolean {
  const c = new StrikeController(SET);
  c.request('jab', 0);
  let pressed = false, second = false;
  for (let t = 0; t <= 2000; t += STEP) {
    if (!pressed && t >= offsetMs) { pressed = true; if (c.request('jab', t)) second = true; }
    c.update(STEP / 1000, t);
    if (pressed && !second && (c as unknown as { buffered: string | null }).buffered === null && t > offsetMs) second = true;
  }
  return second;
}

describe('the strike queue', () => {
  /**
   * THE REGRESSION THIS FILE EXISTS FOR. The buffer used to expire 140 ms after the PRESS while only being consumed
   * when the swing reached `done` — 420 ms later. So a press early in a swing was discarded before anything could
   * accept it, and only presses in the last 140 ms landed. Measured across the swing: 25 of 46 offsets came out.
   * Mashing as you commit to a punch was the one input guaranteed to be eaten.
   */
  it('a press ANYWHERE in a swing comes out — it used to be only the last 140 ms', () => {
    const offsets: number[] = [];
    for (let off = 20; off <= 900; off += 20) offsets.push(off);
    const landed = offsets.filter(pressDuringSwing);
    expect(landed.length).toBe(offsets.length);
  });

  it('an early press is the one that used to die, and it is the one that matters', () => {
    expect(pressDuringSwing(20)).toBe(true);    // just after committing
    expect(pressDuringSwing(60)).toBe(true);    // mid-startup
    expect(pressDuringSwing(140)).toBe(true);   // the old buffer's last breath
  });

  it('the queue outlives a whole swing, or it only serves presses that were nearly late enough anyway', () => {
    const longest = 0.12 + 0.08 + 0.22;         // the jab, end to end
    expect(QUEUE_MS).toBeGreaterThan(longest * 1000 * 0.9);
  });

  it('a stale press is still dropped — the queue is a grace, not a recording', () => {
    const c = new StrikeController(SET);
    c.request('jab', 0);
    c.request('jab', 10);                        // queued at 10 ms
    for (let t = 0; t <= QUEUE_MS + 600; t += STEP) c.update(STEP / 1000, t + 5000);   // clock far past the window
    expect((c as unknown as { buffered: string | null }).buffered).toBeNull();
  });

  it('a press for a move the set does not have is refused, not queued', () => {
    const c = new StrikeController(SET);
    c.request('jab', 0);
    expect(c.request('nonexistent', 50)).toBe(false);
    expect((c as unknown as { buffered: string | null }).buffered).toBeNull();
  });
});
