// CREATOR-PLAN phase 4d: the first-run walkthrough — place a part, paint a layer, save; skippable; remembered per device.
import { describe, expect, it } from 'vitest';
import { WALK_COPY, WALK_KEY, WALK_START, WALK_STEPS, rememberWalk, walkCurrent, walkReduce, walkSeen } from './walkthrough';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

describe('the steps', () => {
  it('advances only when the player does the step (or presses Next)', () => {
    let s = WALK_START;
    expect(walkCurrent(s)).toBe('part');
    s = walkReduce(s, 'layerAdded');            // painting first does not tick off the part step
    expect(walkCurrent(s)).toBe('part');
    s = walkReduce(s, 'partAdded');
    expect(walkCurrent(s)).toBe('paint');
    s = walkReduce(s, 'next');
    expect(walkCurrent(s)).toBe('save');
    s = walkReduce(s, 'saved');
    expect(s.over).toBe(true); expect(s.skipped).toBe(false);
    expect(walkCurrent(s)).toBeNull();
    expect(walkReduce(s, 'partAdded')).toBe(s);
  });
  it('skip ends it from any step', () => {
    for (let i = 0; i < WALK_STEPS.length; i++) {
      let s = WALK_START;
      for (let k = 0; k < i; k++) s = walkReduce(s, 'next');
      const out = walkReduce(s, 'skip');
      expect(out.over).toBe(true); expect(out.skipped).toBe(true);
    }
  });
  it('every step has copy, and the part and paint steps open their tabs', () => {
    expect(WALK_COPY.part.tab).toBe('parts');
    expect(WALK_COPY.paint.tab).toBe('paint');
    for (const s of WALK_STEPS) expect(WALK_COPY[s].body.length).toBeGreaterThan(20);
  });
});

describe('remembered per device', () => {
  it('a new device has not seen it; finishing or skipping remembers', () => {
    const st = mem();
    expect(walkSeen(st)).toBe(false);
    rememberWalk(WALK_START, st);                 // not over: nothing kept
    expect(walkSeen(st)).toBe(false);
    rememberWalk(walkReduce(WALK_START, 'skip'), st);
    expect(walkSeen(st)).toBe(true);
    expect(st.m.get(WALK_KEY)).toBe('skipped');
  });
  it('a storage that throws counts as seen (private mode never nags)', () => {
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(walkSeen(bad)).toBe(true);
    expect(() => rememberWalk(walkReduce(WALK_START, 'skip'), bad)).not.toThrow();
    expect(walkSeen(null)).toBe(true);
  });
});
