// IMPROVE (2026-10-06): Free Run item 9 — a personal best per track and tier, split at every checkpoint.
import { describe, it, expect } from 'vitest';
import { loadPb, savePbIfFaster, gateDeltaMs, splitWords, pbKey, FREERUN_PB_PREFIX } from './FreeRunSplits';

const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

describe('FreeRunSplits', () => {
  it('the first finish becomes the PB; a slower one does not replace it; a faster one does', () => {
    const s = memStore();
    expect(loadPb('neon-rooftop', 1, s)).toBeNull();
    expect(savePbIfFaster('neon-rooftop', 1, { totalMs: 60000, atGate: [20000, 41000] }, s)).toEqual({ improved: true, previous: null });
    expect(savePbIfFaster('neon-rooftop', 1, { totalMs: 61000, atGate: [19000, 40000] }, s).improved).toBe(false);
    expect(loadPb('neon-rooftop', 1, s)!.totalMs).toBe(60000);
    const r = savePbIfFaster('neon-rooftop', 1, { totalMs: 58000, atGate: [19500, 40000] }, s);
    expect(r.improved).toBe(true); expect(r.previous!.totalMs).toBe(60000);
    expect(loadPb('neon-rooftop', 1, s)).toEqual({ totalMs: 58000, atGate: [19500, 40000] });
  });
  it('each track and tier keeps its own', () => {
    const s = memStore();
    savePbIfFaster('hydro-dam', 2, { totalMs: 50000, atGate: [] }, s);
    expect(loadPb('hydro-dam', 3, s)).toBeNull();
    expect(loadPb('neon-rooftop', 2, s)).toBeNull();
    expect(pbKey('hydro-dam', 2).startsWith(FREERUN_PB_PREFIX)).toBe(true);
  });
  it('a corrupt, empty or zero record is no PB, and a zero-time run never becomes one', () => {
    const s = memStore();
    s.m.set(pbKey('t', 1), '{not json'); expect(loadPb('t', 1, s)).toBeNull();
    s.m.set(pbKey('t', 1), JSON.stringify({ totalMs: 0, atGate: [] })); expect(loadPb('t', 1, s)).toBeNull();
    s.m.set(pbKey('t', 1), JSON.stringify({ totalMs: 5, atGate: ['x'] })); expect(loadPb('t', 1, s)).toBeNull();
    expect(savePbIfFaster('u', 1, { totalMs: 0, atGate: [] }, s).improved).toBe(false);
    expect(loadPb('t', 1, null)).toBeNull();
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadPb('t', 1, throwing)).toBeNull();
    expect(savePbIfFaster('t', 1, { totalMs: 9, atGate: [] }, throwing).improved).toBe(true);   // reported, just not kept
  });
  it('the split at a checkpoint: negative is ahead; nothing to compare reads empty', () => {
    const pb = { totalMs: 60000, atGate: [20000, 41000] };
    expect(gateDeltaMs(pb, 1, 19580)).toBe(-420);
    expect(gateDeltaMs(pb, 2, 42080)).toBe(1080);
    expect(gateDeltaMs(pb, 3, 50000)).toBeNull();
    expect(gateDeltaMs(null, 1, 1)).toBeNull();
    expect(splitWords(-420)).toBe('PB −0.42');
    expect(splitWords(1080)).toBe('PB +1.08');
    expect(splitWords(null)).toBe('');
  });
});
