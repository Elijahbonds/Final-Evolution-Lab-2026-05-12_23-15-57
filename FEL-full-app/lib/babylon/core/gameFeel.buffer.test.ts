import { describe, expect, it, vi } from 'vitest';
import { InputBuffer } from './gameFeel';

/**
 * THE SHOT BUFFER'S CONTRACT, pinned because 1v1 and 3v3 now depend on it for the thing that makes a tap feel
 * answered. Both modes gate their shot on `actionHeld`, a value that exists only while the button is down — so a
 * press during a spin, a dunk or a finish used to be refused on that frame and gone by the next. Holding worked;
 * tapping did not, and tapping is what people do.
 */
describe('InputBuffer, as the hoops shot queue uses it', () => {
  it('remembers a press and answers once', () => {
    const b = new InputBuffer(400);
    b.press('shot');
    expect(b.consume('shot')).toBe(true);
    expect(b.consume('shot')).toBe(false);     // a queued press is worth exactly one shot
  });

  // The buffer reads performance.now(), which vi.useFakeTimers() does NOT move — written that way first, both of
  // these passed while proving nothing, because the clock never advanced either time. Drive the clock it reads.
  const atClock = (fn: (tick: (ms: number) => void) => void) => {
    let t = 1000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => t);
    try { fn((ms) => { t += ms; }); } finally { spy.mockRestore(); }
  };

  it('holds long enough to outlive the animation it is waiting for', () => {
    atClock((tick) => {
      const b = new InputBuffer(400);
      b.press('shot');
      tick(350);                                 // a spin is still running
      expect(b.consume('shot')).toBe(true);
    });
  });

  it('forgets a stale press rather than firing a shot you asked for a second ago', () => {
    atClock((tick) => {
      const b = new InputBuffer(400);
      b.press('shot');
      tick(600);
      expect(b.consume('shot')).toBe(false);
    });
  });

  it('140 ms — the class default — would have expired inside a spin, which is why the modes pass 400', () => {
    atClock((tick) => {
      const short = new InputBuffer(140);
      short.press('shot');
      tick(300);                                 // still mid-animation
      expect(short.consume('shot')).toBe(false);
      const long = new InputBuffer(400);
      long.press('shot');
      tick(0);
      expect(long.consume('shot')).toBe(true);
    });
  });

  it('keeps different intents apart', () => {
    const b = new InputBuffer(400);
    b.press('shot');
    expect(b.consume('pass')).toBe(false);
    expect(b.consume('shot')).toBe(true);
  });

  it('clear() drops everything — what a change of possession does', () => {
    const b = new InputBuffer(400);
    b.press('shot');
    b.clear();
    expect(b.consume('shot')).toBe(false);
  });

  it('an unpressed key is never consumable', () => {
    expect(new InputBuffer(400).consume('shot')).toBe(false);
  });
});
