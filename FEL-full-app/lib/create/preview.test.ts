// CREATE HUB step 3's numbers: the bed level, the Dance banner's difficulty, the routine playhead.
import { describe, expect, it } from 'vitest';
import { BED_DB, activeStep, chartDifficulty, dbToGain, routineBeat } from './preview';

const step = (beat: number, holdBeats = 4) => ({ clipId: 'c', beat, holdBeats, mirrored: false });

describe('step 3 numbers', () => {
  it('the bed is -14 dB, about a fifth of full level', () => {
    expect(BED_DB).toBe(-14);
    expect(dbToGain(BED_DB)).toBeCloseTo(0.1995, 3);
    expect(dbToGain(0)).toBe(1);
  });
  it('chart difficulty by steps per minute', () => {
    expect(chartDifficulty([], 120)).toBe(1);
    expect(chartDifficulty(Array.from({ length: 8 }, (_, i) => step(i * 8)), 120)).toBe(1);   // 8 steps in 32 s = 15/min
    expect(chartDifficulty(Array.from({ length: 32 }, (_, i) => step(i * 2, 2)), 120)).toBe(2); // 32 in 32 s = 60/min
    expect(chartDifficulty(Array.from({ length: 64 }, (_, i) => step(i, 1)), 120)).toBe(3);     // 120/min
  });
  it('the routine playhead loops on the song clock and finds the step under it', () => {
    const r = [step(0, 4), step(4, 2), step(8, 4)];   // 12 beats, a gap at 6–8
    expect(routineBeat(null, 120, r)).toBe(-1);
    expect(routineBeat(1, 120, r)).toBe(2);           // 1 s at 120 BPM = beat 2
    expect(routineBeat(6.5, 120, r)).toBe(1);         // beat 13 wraps to 1
    expect(activeStep(2, r)).toBe(0);
    expect(activeStep(5, r)).toBe(1);
    expect(activeStep(7, r)).toBe(-1);
    expect(activeStep(-1, r)).toBe(-1);
  });
});
