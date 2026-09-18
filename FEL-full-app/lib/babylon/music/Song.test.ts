import { describe, expect, it } from 'vitest';
import { MAX_CHAIN_ENTRIES, barStartSec, expandChain, normalizeChain, renderLengthSec, scheduleTakes, sectionAtBar, snapshotTracks, songBars, type Section } from './Song';

const track = (id: string, on: number[]) => ({ sampleId: id, pattern: Array.from({ length: 16 }, (_, i) => on.includes(i)), volume: 1, muted: false, pan: 0 });
const intro: Section = { id: 'intro', name: 'intro', tracks: [track('kick', [0])] };
const hook: Section = { id: 'hook', name: 'hook', tracks: [track('kick', [0, 4, 8, 12]), track('snare', [4, 12])] };
const sections = [intro, hook];

describe('sections and chains', () => {
  it('snapshots deep-copy patterns', () => {
    const s = snapshotTracks(hook.tracks); s[0].pattern[1] = true;
    expect(hook.tracks[0].pattern[1]).toBe(false);
  });
  it('counts bars, clamps entries, drops unknown sections', () => {
    expect(songBars([{ sectionId: 'intro', bars: 2 }, { sectionId: 'hook', bars: 4 }])).toBe(6);
    const n = normalizeChain([{ sectionId: 'intro', bars: 99 }, { sectionId: 'ghost', bars: 2 }, { sectionId: 'hook', bars: 0 }, 'junk'], sections);
    expect(n).toEqual([{ sectionId: 'intro', bars: 8 }, { sectionId: 'hook', bars: 1 }]);
    expect(normalizeChain(Array.from({ length: 30 }, () => ({ sectionId: 'hook', bars: 1 })), sections).length).toBe(MAX_CHAIN_ENTRIES);
    expect(normalizeChain('nope', sections)).toEqual([]);
  });
  it('finds the section at any bar and wraps when looping', () => {
    const chain = [{ sectionId: 'intro', bars: 2 }, { sectionId: 'hook', bars: 4 }];
    expect(sectionAtBar(chain, 0)).toEqual({ sectionId: 'intro', index: 0, barInSection: 0 });
    expect(sectionAtBar(chain, 2)).toEqual({ sectionId: 'hook', index: 1, barInSection: 0 });
    expect(sectionAtBar(chain, 5)?.barInSection).toBe(3);
    expect(sectionAtBar(chain, 6)?.sectionId).toBe('intro');   // wraps
    expect(sectionAtBar([], 3)).toBeNull();
  });
  it('expands to per-bar patterns, capped at 64 bars', () => {
    const bars = expandChain([{ sectionId: 'intro', bars: 1 }, { sectionId: 'hook', bars: 2 }], sections);
    expect(bars.length).toBe(3); expect(bars[0][0].pattern[4]).toBe(false); expect(bars[1][0].pattern[4]).toBe(true);
    expect(expandChain([{ sectionId: 'hook', bars: 8 }, { sectionId: 'hook', bars: 8 }, { sectionId: 'hook', bars: 8 }, { sectionId: 'hook', bars: 8 }, { sectionId: 'hook', bars: 8 }, { sectionId: 'hook', bars: 8 }, { sectionId: 'hook', bars: 8 }, { sectionId: 'hook', bars: 8 }, { sectionId: 'hook', bars: 8 }], sections).length).toBe(64);
  });
});

describe('takes and render length', () => {
  it('a bar at 120 bpm / 16 steps is two seconds; takes schedule at their bar', () => {
    expect(barStartSec(1, 120, 16)).toBeCloseTo(2); expect(barStartSec(4, 90, 16)).toBeCloseTo(10.667, 2);
    const s = scheduleTakes([{ id: 'v', atBar: 2, gain: 1, durationSec: 5 }, { id: 'late', atBar: 9, gain: 1, durationSec: 1 }], 8, 120, 16);
    expect(s.length).toBe(1); expect(s[0].atSec).toBeCloseTo(4);
  });
  it('render length covers the song or the take tail, plus a second', () => {
    expect(renderLengthSec(4, 120, 16, [])).toBeCloseTo(9);
    expect(renderLengthSec(4, 120, 16, [{ id: 'v', atBar: 3, gain: 1, durationSec: 6 }])).toBeCloseTo(13);
  });
});
