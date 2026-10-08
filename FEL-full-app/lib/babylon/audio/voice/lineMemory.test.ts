// VOICEOVER (2026-10-06): the shuffle bag: every line once before any line twice, remembered across runs on this device.
import { afterEach, describe, expect, it } from 'vitest';
import { LINE_MEMORY_KEY, LineMemory, MEMORY_PER_KEY, deviceLineMemory, resetDeviceLineMemory, saveLineMemory } from './lineMemory';
import { MIN_VARIANTS, resetVoiceGaps, voiceGaps } from './voiceGaps';

const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}` }));
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
const say = (m: LineMemory, key: string, p: { id: string }[], r: () => number) => { const l = m.pick(key, p, r); m.mark(key, l.id); return l.id; };

afterEach(() => { resetDeviceLineMemory(); resetVoiceGaps(); delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('LineMemory: a shuffle bag per voice and moment', () => {
  it('every line is said once before any line is said twice (many seeds, pools of 3..8)', () => {
    for (let seed = 1; seed < 60; seed++) {
      for (let n = 3; n <= 8; n++) {
        const m = new LineMemory(); const r = rng(seed); const p = pool(n);
        const round = Array.from({ length: n }, () => say(m, 'k', p, r));
        expect(new Set(round).size).toBe(n);
      }
    }
  });

  it('a new round never opens with the line that closed the last one', () => {
    for (let seed = 1; seed < 200; seed++) {
      const m = new LineMemory(); const r = rng(seed); const p = pool(4);
      const ids = Array.from({ length: 40 }, () => say(m, 'k', p, r));
      for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });

  it('a big pool: no line again inside the last MEMORY_PER_KEY lines', () => {
    const m = new LineMemory(); const r = rng(9); const p = pool(20);
    const ids = Array.from({ length: 200 }, () => say(m, 'k', p, r));
    for (let i = 0; i < ids.length; i++) expect(ids.slice(Math.max(0, i - MEMORY_PER_KEY), i)).not.toContain(ids[i]);
  });

  it('a pick that is not marked (a prefetch) does not use the line up', () => {
    const m = new LineMemory(); const p = pool(3);
    m.pick('k', p, rng(1)); m.pick('k', p, rng(1));
    expect(m.said('k')).toEqual([]);
  });

  it('weights steer the choice inside the round (a line about tonight\'s rival is preferred)', () => {
    const m = new LineMemory(); const p = pool(3);
    let hits = 0;
    const r = rng(11);
    for (let s = 1; s < 300; s++) if (m.pick('k', p, r, (l) => (l.id === 'l2' ? 4 : 1)).id === 'l2') hits++;
    expect(hits).toBeGreaterThan(150);   // 4/6 of the draws, at even odds it would be ~100
  });

  it('survives a reload: the second run picks up the round where the first left off', () => {
    const a = new LineMemory(); const r = rng(5); const p = pool(4);
    const first = [say(a, 'k', p, r), say(a, 'k', p, r)];
    const b = new LineMemory(JSON.parse(JSON.stringify(a.toJSON())));
    const second = [say(b, 'k', p, r), say(b, 'k', p, r)];
    expect(new Set([...first, ...second]).size).toBe(4);
  });

  it('stays small: at most the key cap, least recently used goes first', () => {
    const m = new LineMemory(null, 3, 2);
    for (const k of ['a', 'b', 'c', 'd']) m.mark(k, 'x');
    expect(Object.keys(m.toJSON().keys)).toEqual(['b', 'c', 'd']);
  });

  it('a corrupt saved value is an empty memory, never a crash', () => {
    expect(() => new LineMemory({ v: 1, keys: { k: { used: 'nope' as unknown as string[], t: 0 } } })).not.toThrow();
    expect(new LineMemory({ v: 2 } as unknown as never).toJSON().keys).toEqual({});
  });

  it('a moment with fewer than MIN_VARIANTS lines is logged as a content gap, once', () => {
    const m = new LineMemory();
    m.pick('velvet|dunk.judges', pool(MIN_VARIANTS - 1), rng(1));
    m.pick('velvet|dunk.judges', pool(MIN_VARIANTS - 1), rng(2));
    m.pick('velvet|intro.court', pool(MIN_VARIANTS), rng(1));
    expect(voiceGaps().map((g) => [g.kind, g.key, g.n])).toEqual([['thin', 'velvet|dunk.judges', 2]]);
  });

  it('the device copy reads and writes localStorage, guarded', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    store.set(LINE_MEMORY_KEY, JSON.stringify({ v: 1, keys: { k: { used: ['l1'], t: 1 } } }));
    const m = deviceLineMemory();
    expect(m.said('k')).toEqual(['l1']);
    m.mark('k', 'l2'); saveLineMemory();
    expect(JSON.parse(store.get(LINE_MEMORY_KEY)!).keys.k.used).toEqual(['l1', 'l2']);
  });
});
