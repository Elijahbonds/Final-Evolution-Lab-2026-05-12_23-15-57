import { describe, expect, it } from 'vitest';
import { detectJumps, summarise, G, type MotionSample } from '@/lib/babylon/core/IRLCore';
import { irlSessionResult } from './irl-game';

// VERT's end-of-session report. IRLCore measures in METRES; GameShell records the score, the headline and the
// stats as they are sent, so a 60 cm jump went out as score 1 and "best 1 cm", and the duration was
// Date.now() minus a performance.now() start (about 1.8e9 s).

/** A trace with one real jump: stand, push off, free fall for `flight` s, land. */
function oneJump(flight: number): MotionSample[] {
  const s: MotionSample[] = [];
  let t = 0;
  const push = (g: number, n: number) => { for (let i = 0; i < n; i++) { s.push({ t, magnitude: g * G }); t += 0.01; } };
  push(1, 50);               // standing
  push(2, 3);                // push-off spike
  push(0.1, Math.round(flight / 0.01));
  push(2.5, 3);              // landing spike
  push(1, 50);
  return s;
}

describe('irlSessionResult', () => {
  const summary = summarise(detectJumps(oneJump(0.7)));   // g·t²/8 at 0.7 s ≈ 60 cm

  it('reports the best jump in centimetres, as the score, the headline and the stats', () => {
    expect(summary.total).toBe(1);
    const r = irlSessionResult(summary, 42_000);
    const cm = Math.round(summary.best * 100);
    expect(cm).toBeGreaterThan(55);
    expect(cm).toBeLessThan(66);
    expect(r.score).toBe(cm);
    expect(r.headline).toBe(`1 jumps · best ${cm} cm`);
    expect(r.stats).toEqual({ jumps: 1, bestCm: cm, averageCm: cm });
    expect(r.won).toBe(true);
  });

  it('reports the session length in seconds, not the epoch', () => {
    expect(irlSessionResult(summary, 42_000).duration).toBe(42);
    expect(irlSessionResult(summarise([]), 0).duration).toBe(0);
  });

  it('an empty session is honest', () => {
    const r = irlSessionResult(summarise([]), 5_000);
    expect(r).toMatchObject({ score: 0, won: false, outcome: 'no jumps detected' });
  });
});
