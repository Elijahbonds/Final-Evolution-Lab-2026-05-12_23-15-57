// hoops-handle (owner 2026-10-17): the AI handler keeps the ball in the hand away from his man — he crosses it over after the dwell, the
// dribble stays in the new hand, and he crosses back when the man changes sides (never two crossings inside the gap).
import { describe, expect, it } from 'vitest';
import { stepAiHand, AI_HAND_IDLE, AI_HAND_DWELL_SEC, AI_HAND_GAP_SEC, type AiHandRead, type AiHandState } from './AiBallHand';

const DT = 1 / 60;
const R = (o: Partial<AiHandRead> = {}): AiHandRead => ({ hand: 'right', away: 'left', dribbling: true, moveActive: false, ...o });
/** Frames until `cross`, or -1. */
function until(read: AiHandRead, max = 240, st: AiHandState = AI_HAND_IDLE): number {
  for (let f = 1; f <= max; f++) { const s = stepAiHand(st, DT, read); st = s.state; if (s.cross) return f; }
  return -1;
}

describe('the AI handler\'s ball hand', () => {
  it('a man on the ball side for the dwell: he crosses it away from him', () => {
    expect(until(R()) * DT).toBeCloseTo(AI_HAND_DWELL_SEC, 1);
  });
  it('the ball already away from him, nobody close, or no live dribble: the hand stays', () => {
    expect(until(R({ away: 'right' }))).toBe(-1);
    expect(until(R({ away: null }))).toBe(-1);
    expect(until(R({ dribbling: false }))).toBe(-1);
  });
  it('a crossing running holds him, and the gap keeps two crossings apart', () => {
    expect(until(R({ moveActive: true }))).toBe(-1);
    let st: AiHandState = { wrongSec: 0, sinceSec: 0 };   // a crossing just ended
    let f = 0; for (; f < 240; f++) { const s = stepAiHand(st, DT, R()); st = s.state; if (s.cross) break; }
    expect((f + 1) * DT).toBeGreaterThanOrEqual(AI_HAND_GAP_SEC - 1e-9);
  });
  it('back and forth: the man switches sides, the hand follows — R→L, then L→R, then R→L', () => {
    let st: AiHandState = AI_HAND_IDLE; let hand: 'left' | 'right' = 'right'; const seq: string[] = [];
    for (let f = 0; f < 60 * 6; f++) {
      const manOnLeft = Math.floor(f / 90) % 2 === 1;   // he switches sides every 1.5 s
      const s = stepAiHand(st, DT, R({ hand, away: manOnLeft ? 'right' : 'left' }));
      st = s.state; if (s.cross) { hand = hand === 'right' ? 'left' : 'right'; seq.push(hand); }
    }
    expect(seq.slice(0, 3)).toEqual(['left', 'right', 'left']);
  });
  it('a lost dribble starts it over', () => {
    let st: AiHandState = AI_HAND_IDLE;
    for (let f = 0; f < 15; f++) st = stepAiHand(st, DT, R()).state;
    expect(st.wrongSec).toBeGreaterThan(0);
    expect(stepAiHand(st, DT, R({ dribbling: false })).state).toEqual(AI_HAND_IDLE);
  });
});
