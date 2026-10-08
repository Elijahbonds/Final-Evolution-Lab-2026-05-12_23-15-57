// PIPELINES (owner, 2026-10-06): the equipped routine as a dunk celebration chain (the DunkMode wiring is routed).
import { describe, expect, it } from 'vitest';
import { CELEB_MAX_SEC, CELEB_MAX_STEPS, celebrationChain, playChain } from './celebration';
import { DEFAULT_CELEBRATION } from '@/lib/modes/dance/active-routine';

const s = (clipId: string, beat: number, holdBeats = 2, mirrored = false) => ({ clipId, beat, holdBeats, mirrored });

describe('celebrationChain', () => {
  it('nothing equipped, or the default → null (the mode keeps its own celebrations)', () => {
    expect(celebrationChain(null)).toBe(null);
    expect(celebrationChain(DEFAULT_CELEBRATION)).toBe(null);
    expect(celebrationChain({ steps: [], bpm: 100 })).toBe(null);
  });
  it('the equipped steps in beat order, mirrored ones as .M, timed at the routine\'s tempo, capped', () => {
    const c = celebrationChain({ bpm: 120, steps: [s('dance_wave_arm', 2, 2, true), s('dance_toprock_basic', 0, 2)] })!;
    expect(c).toEqual([{ clip: 'dance_toprock_basic', mirrored: false, sec: 1 }, { clip: 'dance_wave_arm.M', mirrored: true, sec: 1 }]);
    const long = celebrationChain({ bpm: 60, steps: Array.from({ length: 10 }, (_, i) => s('dance_trans_spin', i, 1)) })!;
    expect(long.length).toBeLessThanOrEqual(CELEB_MAX_STEPS);
    expect(long.reduce((a, x) => a + x.sec, 0)).toBeLessThanOrEqual(CELEB_MAX_SEC);
    expect(celebrationChain({ bpm: 100, steps: [s('not_a_dance', 0)] })).toBe(null);
  });
});

describe('playChain', () => {
  it('plays each clip after the last one\'s seconds, then hands back', () => {
    const played: string[] = [], waits: number[] = [];
    let done = 0;
    const q: (() => void)[] = [];
    playChain([{ clip: 'a', mirrored: false, sec: 1 }, { clip: 'b', mirrored: false, sec: 0.5 }], (c) => { played.push(c); return true; }, () => { done++; },
      (fn, ms) => { waits.push(ms); q.push(fn); });
    while (q.length) q.shift()!();
    expect(played).toEqual(['a', 'b']);
    expect(waits).toEqual([1000, 500]);
    expect(done).toBe(1);
  });
  it('a clip the body cannot play stops the chain at once (never a frozen body)', () => {
    let done = 0;
    playChain([{ clip: 'a', mirrored: false, sec: 1 }], () => false, () => { done++; }, () => { throw new Error('no wait'); });
    expect(done).toBe(1);
  });
});
