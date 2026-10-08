// PIPELINES (owner, 2026-10-06): a community song's band. Same public shape as SongStemBand, so DanceMode holds it like
// the others; a miss muffles the whole mix and hits open it back up; it starts on the song clock and survives a pause.
import { describe, expect, it } from 'vitest';
import {
  CUTOFF_CLOSED_HZ, CUTOFF_OPEN_HZ, CardSongBand, HEAT_START, LEVEL_FLOOR, cutoffFor, levelFor, nextHeat,
} from './cardSongBand';
import { SongStemBand } from '../audio/SongStemBand';

function param(v = 0) {
  const p = { value: v, sets: [] as [string, number, number][],
    setValueAtTime(x: number, t: number) { p.value = x; p.sets.push(['set', x, t]); },
    linearRampToValueAtTime(x: number, t: number) { p.value = x; p.sets.push(['ramp', x, t]); },
    setTargetAtTime(x: number, t: number) { p.value = x; p.sets.push(['target', x, t]); },
    cancelScheduledValues() { /* */ } };
  return p;
}
function fakeCtx() {
  const started: { when: number; offset: number }[] = [];
  const stopped: number[] = [];
  const node = () => ({ connect: (n: unknown) => n, disconnect() { /* */ } });
  const ctx = {
    currentTime: 0,
    createGain: () => ({ ...node(), gain: param(1) }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(0) }),
    createBufferSource: () => ({ ...node(), buffer: null as unknown, start(when: number, offset: number) { started.push({ when, offset }); }, stop(t: number) { stopped.push(t); } }),
    decodeAudioData: async () => ({ duration: 60 }),
  };
  return { ctx: ctx as unknown as AudioContext, started, stopped };
}
const okFetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch;

describe('the muffle', () => {
  it('closed at heat 0, open at heat 1, never silent', () => {
    expect(cutoffFor(0)).toBeCloseTo(CUTOFF_CLOSED_HZ);
    expect(cutoffFor(1)).toBeCloseTo(CUTOFF_OPEN_HZ);
    expect(levelFor(0)).toBe(LEVEL_FLOOR);
    expect(levelFor(1)).toBe(1);
  });
  it('a miss closes it more than a hit opens it', () => {
    expect(nextHeat(0.5, 'MISS')).toBeLessThan(0.5 - (nextHeat(0.5, 'PERFECT') - 0.5));
    expect(nextHeat(0, 'MISS')).toBe(0);
    expect(nextHeat(1, 'PERFECT')).toBe(1);
  });
});

describe('CardSongBand', () => {
  it('has SongStemBand\'s public shape (every band?.… call in DanceMode)', () => {
    for (const m of ['load', 'judge', 'level', 'mixLevel', 'setClock', 'start', 'update', 'rewind', 'cancelFrom', 'playOutro', 'dispose']) {
      expect(typeof (CardSongBand.prototype as unknown as Record<string, unknown>)[m], m).toBe('function');
      expect(typeof (SongStemBand.prototype as unknown as Record<string, unknown>)[m], m).toBe('function');
    }
  });
  it('a miss muffles, hits open it, and the family levels move as StemBand\'s do', async () => {
    const { ctx } = fakeCtx();
    const b = new CardSongBand(ctx, {} as AudioNode, { url: 'https://x/m.mp3', gainDb: -2, bpm: 100 });
    expect(await b.load(okFetch)).toBe(1);
    expect(b.openness).toBe(HEAT_START);
    b.judge('wave', 'MISS');
    expect(b.openness).toBeLessThan(HEAT_START);
    b.judge('wave', 'PERFECT'); b.judge('wave', 'PERFECT'); b.judge('wave', 'PERFECT');
    expect(b.openness).toBeGreaterThan(HEAT_START);
    expect(b.level('wave')).toBeGreaterThan(0);
    expect(b.mixLevel()).toBeGreaterThan(0);
    expect(b.level('power')).toBe(0);
  });
  it('starts on the song clock, joins late if still decoding, and a pause/rewind restarts at the right offset', async () => {
    const { ctx, started, stopped } = fakeCtx();
    const b = new CardSongBand(ctx, {} as AudioNode, { url: 'https://x/m.mp3', gainDb: 0, bpm: 100 });
    b.setClock((s) => s + 10);
    b.start(2);                       // not loaded yet: nothing plays
    expect(started).toEqual([]);
    await b.load(okFetch);
    b.update(5);                      // late join at song time 5 = 3 s in
    expect(started[0]).toEqual({ when: 15, offset: 3 });
    expect(b.cancelFrom(16)).toBe(1);
    expect(stopped.length).toBe(1);
    b.rewind(4);
    expect(started[1]).toEqual({ when: 14, offset: 2 });
  });
  it('a failed fetch is 0 and never throws', async () => {
    const { ctx } = fakeCtx();
    const b = new CardSongBand(ctx, {} as AudioNode, { url: 'https://x/m.mp3', gainDb: 0, bpm: 100 });
    expect(await b.load((async () => { throw new Error('cors'); }) as unknown as typeof fetch)).toBe(0);
    expect(b.loaded).toBe(false);
  });
});
