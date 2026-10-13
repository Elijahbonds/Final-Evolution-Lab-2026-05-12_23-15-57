import { describe, expect, it } from 'vitest';
import { HighlightPacer, REPLAY_EVERY, winnerReason } from './highlights';

describe('highlight pacing', () => {
  it('the first worthy moment replays at once', () => {
    const p = new HighlightPacer();
    expect(p.offer(true)).toBe(true);
  });
  it('then a few plays must pass before the next', () => {
    const p = new HighlightPacer();
    expect(p.offer(true)).toBe(true);
    for (let i = 0; i < REPLAY_EVERY - 1; i++) { p.tick(); expect(p.offer(true)).toBe(false); }
    p.tick();
    expect(p.offer(true)).toBe(true);
  });
  it('a moment that is not worth it never replays and does not spend the wait', () => {
    const p = new HighlightPacer();
    expect(p.offer(false)).toBe(false);
    expect(p.offer(true)).toBe(true);
  });
  it('never the moment that ends the match, and never in reduced motion — and neither spends the wait', () => {
    const p = new HighlightPacer();
    expect(p.offer(true, { final: true })).toBe(false);
    expect(p.offer(true, { reduced: true })).toBe(false);
    expect(p.offer(true)).toBe(true);
  });
  it('winners are the hero’s kills and stuffs, not errors', () => {
    expect(winnerReason('KILL — THEY COULD NOT DIG IT', true)).toBe(true);
    expect(winnerReason('KINETIC KILL', true)).toBe(true);
    expect(winnerReason('STUFF BLOCK', true)).toBe(true);
    expect(winnerReason('THEY COULD NOT REACH IT', true)).toBe(true);
    expect(winnerReason('THEY MISSED', true)).toBe(false);
    expect(winnerReason('INTO THE NET', true)).toBe(false);
    expect(winnerReason('KILL — YOUR DIG SHANKED', false)).toBe(false);
  });
});
