// IMPROVE (2026-10-06, #4): a device-local personal best per track and level (danceBests.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { bestKey, bestLine, mergeBest, parseBests, readBest, recordBest, DANCE_BESTS_KEY } from './danceBests';

describe('danceBests (pure)', () => {
  it('keys NORMAL by the bare track id and another level on its own', () => {
    expect(bestKey('cypher', 'normal')).toBe('cypher');
    expect(bestKey('cypher', 'hard')).toBe('cypher@hard');
  });
  it('each field keeps its own best', () => {
    const a = mergeBest(null, { score: 5000, grade: 'B', maxCombo: 20, fullCombo: false });
    expect(a.improved).toBe(true);
    const b = mergeBest(a.best, { score: 4000, grade: 'A', maxCombo: 12, fullCombo: true });
    expect(b.best).toEqual({ score: 5000, grade: 'A', maxCombo: 20, fullCombo: true });
    expect(b.improved).toBe(true);
    expect(mergeBest(b.best, { score: 100, grade: 'D', maxCombo: 1, fullCombo: false }).improved).toBe(false);
  });
  it('the pick-screen line', () => {
    expect(bestLine(null)).toBe('');
    expect(bestLine({ score: 12340, grade: 'A', maxCombo: 48, fullCombo: true })).toBe('BEST 12,340 · A · ×48 · FC');
  });
  it('a malformed blob reads as no bests, and bad rows are dropped', () => {
    expect(parseBests('{nope')).toEqual({});
    expect(parseBests(JSON.stringify({ a: { score: 'x', grade: 'A' }, b: { score: 10, grade: 'Z' }, c: { score: 10, grade: 'S', maxCombo: 3 } })))
      .toEqual({ c: { score: 10, grade: 'S', maxCombo: 3, fullCombo: false } });
  });
});

describe('danceBests (storage)', () => {
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } as unknown as Storage;
  afterEach(() => { store.clear(); delete (globalThis as { localStorage?: Storage }).localStorage; });
  it('records, reads back per level, and reports only a real improvement', () => {
    (globalThis as { localStorage?: Storage }).localStorage = fake;
    expect(readBest('warmup', 'normal')).toBeNull();
    expect(recordBest('warmup', 'normal', { score: 900, grade: 'C', maxCombo: 9, fullCombo: false })).toBe(true);
    expect(recordBest('warmup', 'normal', { score: 800, grade: 'C', maxCombo: 9, fullCombo: false })).toBe(false);
    expect(readBest('warmup', 'normal')?.score).toBe(900);
    expect(readBest('warmup', 'easy')).toBeNull();
    expect(JSON.parse(store.get(DANCE_BESTS_KEY)!)).toHaveProperty('warmup');
  });
  it('no storage: no best, nothing thrown', () => {
    expect(readBest('warmup', 'normal')).toBeNull();
    expect(recordBest('warmup', 'normal', { score: 1, grade: 'D', maxCombo: 1, fullCombo: false })).toBe(false);
  });
});
