// NB-2 (HONEST-START, hoops grade 0d16f5dd): the 3v3 card read "GAME OVER 0 SCORE · VS 10" against an 8–10 board in 4/4
// games — the card's count-up runs on animation frames, and the game's render loop on a busy device starved them. A count
// now always lands on its target by ms + SETTLE_SLACK_MS, whatever the frames do.
import { describe, expect, it } from 'vitest';
import { runCount, SETTLE_SLACK_MS, type CountClock } from './use-count-up';

/** A clock whose animation frames only run when told, and whose timers run on `advance`. */
function fakeClock() {
  let t = 0;
  let id = 0;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { at: number; cb: () => void }>();
  const clock: CountClock = {
    raf: (cb) => { frames.set(++id, cb); return id; },
    caf: (i) => { frames.delete(i); },
    setTimeout: (cb, ms) => { timers.set(++id, { at: t + ms, cb }); return id; },
    clearTimeout: (i) => { timers.delete(i); },
    now: () => t,
  };
  return {
    clock,
    frame() { const f = [...frames.entries()]; frames.clear(); for (const [, cb] of f) cb(); },
    advance(ms: number) { t += ms; for (const [i, x] of [...timers]) if (x.at <= t) { timers.delete(i); x.cb(); } },
    pendingFrames: () => frames.size,
  };
}

describe('NB-2: the end card count always lands on the real score', () => {
  it('frames that never come (a starved render loop): the score is still exact by ms + slack', () => {
    const c = fakeClock();
    let shown = 0;
    runCount(0, 8, 500, (v) => { shown = v; }, c.clock);
    c.advance(500 + SETTLE_SLACK_MS - 1);
    expect(shown).toBe(0);                       // no frame ran yet
    c.advance(1);
    expect(shown).toBe(8);
    expect(c.pendingFrames()).toBe(0);           // and the count stops asking for frames
  });

  it('normal frames: counts up and ends on the target', () => {
    const c = fakeClock();
    const seen: number[] = [];
    runCount(0, 10, 300, (v) => seen.push(v), c.clock);
    for (let i = 0; i < 30; i++) { c.advance(16); c.frame(); }
    expect(seen[seen.length - 1]).toBe(10);
    expect(seen.some((v) => v > 0 && v < 10)).toBe(true);
  });

  it('cancel stops both the frames and the settle', () => {
    const c = fakeClock();
    let shown = -1;
    const stop = runCount(0, 8, 500, (v) => { shown = v; }, c.clock);
    stop();
    c.advance(5000); c.frame();
    expect(shown).toBe(-1);
  });
});
