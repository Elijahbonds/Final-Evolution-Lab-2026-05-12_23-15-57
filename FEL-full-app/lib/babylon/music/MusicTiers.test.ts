import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  CHAIN_AT_PATTERNS, MUSIC_PROGRESS_KEY, MUSIC_TIERS, NO_PROGRESS, STUDIO_AT_CHAIN, TIERS,
  advance, isRealPattern, nextUnlock, readProgress, tierDef, tierFor, unlocked, writeProgress,
  type MusicProgress,
} from './MusicTiers';

function store() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  } as unknown as Storage;
}
beforeEach(() => { vi.stubGlobal('window', { localStorage: store() }); vi.stubGlobal('localStorage', (globalThis as { window: { localStorage: Storage } }).window.localStorage); });

const at = (p: Partial<MusicProgress>): MusicProgress => ({ ...NO_PROGRESS, ...p });

describe('the ladder', () => {
  it('starts everyone on the grid', () => {
    expect(tierFor(NO_PROGRESS)).toBe('grid');
    expect(tierDef(NO_PROGRESS).id).toBe('grid');
  });

  it('opens the chain once a real pattern exists', () => {
    expect(tierFor(at({ patternsMade: CHAIN_AT_PATTERNS }))).toBe('chain');
  });

  it('opens the studio once sections are saved AND chained', () => {
    expect(tierFor(at({ patternsMade: 1, sectionsSaved: STUDIO_AT_CHAIN, chainEntries: STUDIO_AT_CHAIN }))).toBe('studio');
  });

  it('does not open the studio on sections alone, or on chaining alone', () => {
    expect(tierFor(at({ patternsMade: 1, sectionsSaved: 9, chainEntries: 0 }))).toBe('chain');
    expect(tierFor(at({ patternsMade: 1, sectionsSaved: 0, chainEntries: 9 }))).toBe('chain');
  });

  it('NEVER TAKES A TIER BACK, whatever else happens', () => {
    // The module's own promise: progress that can go down would take a screen away from someone mid-sentence.
    let p = NO_PROGRESS;
    const seen: string[] = [];
    for (const e of ['pattern', 'section', 'section', 'chain', 'chain', 'pattern'] as const) {
      p = advance(p, e);
      seen.push(tierFor(p));
    }
    const rank = (t: string) => MUSIC_TIERS.indexOf(t as (typeof MUSIC_TIERS)[number]);
    for (let i = 1; i < seen.length; i++) expect(rank(seen[i])).toBeGreaterThanOrEqual(rank(seen[i - 1]));
    expect(seen.at(-1)).toBe('studio');
  });

  it('gives every tier more than the one below it', () => {
    const order = MUSIC_TIERS.map((t) => TIERS[t]);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].tracks, order[i].id).toBeGreaterThanOrEqual(order[i - 1].tracks);
      expect(order[i].steps, order[i].id).toBeGreaterThanOrEqual(order[i - 1].steps);
    }
    // The grid is the pitch: sixteen pads and nothing else.
    expect(TIERS.grid.arrangement).toBe(false);
    expect(TIERS.grid.takes).toBe(false);
    expect(TIERS.grid.mixdown).toBe(false);
    expect(TIERS.studio.arrangement && TIERS.studio.takes && TIERS.studio.mixdown).toBe(true);
  });

  it('answers one feature question so no screen has to know the ladder', () => {
    expect(unlocked(NO_PROGRESS, 'arrangement')).toBe(false);
    expect(unlocked(at({ patternsMade: 1, sectionsSaved: 2, chainEntries: 2 }), 'mixdown')).toBe(true);
  });
});

describe('what it says opens next', () => {
  it('asks for a pattern at the grid', () => {
    expect(nextUnlock(NO_PROGRESS)).toEqual({ tier: 'chain', needs: expect.stringMatching(/pattern/i) });
  });

  it('asks for whichever half is actually missing', () => {
    expect(nextUnlock(at({ patternsMade: 1, sectionsSaved: 0, chainEntries: 5 }))?.needs).toMatch(/save/i);
    expect(nextUnlock(at({ patternsMade: 1, sectionsSaved: 5, chainEntries: 0 }))?.needs).toMatch(/chain/i);
  });

  it('NEVER ASKS FOR SOMETHING ALREADY DONE', () => {
    // A prompt for work that is finished reads as broken, and there is no way to satisfy it.
    for (const p of [
      at({ patternsMade: 1, sectionsSaved: 1, chainEntries: 0 }),
      at({ patternsMade: 1, sectionsSaved: 0, chainEntries: 1 }),
      at({ patternsMade: 1, sectionsSaved: 3, chainEntries: 1 }),
    ]) {
      const n = nextUnlock(p);
      expect(n?.needs).not.toMatch(/\b0 more\b/);
    }
  });

  it('says nothing at the top rather than dangling a fourth tier', () => {
    expect(nextUnlock(at({ patternsMade: 9, sectionsSaved: 9, chainEntries: 9 }))).toBeNull();
  });
});

describe('what counts as a pattern', () => {
  it('needs at least one audible hit', () => {
    expect(isRealPattern([{ pattern: [false, false] }])).toBe(false);
    expect(isRealPattern([{ pattern: [false, true] }])).toBe(true);
  });

  it('DOES NOT COUNT A MUTED TRACK — silence is silence however it got there', () => {
    expect(isRealPattern([{ pattern: [true, true], muted: true }])).toBe(false);
    expect(isRealPattern([{ pattern: [true], muted: true }, { pattern: [true] }])).toBe(true);
  });

  it('handles an empty kit', () => {
    expect(isRealPattern([])).toBe(false);
  });
});

describe('remembering where somebody got to', () => {
  it('round-trips', () => {
    writeProgress(at({ patternsMade: 2, sectionsSaved: 3, chainEntries: 4 }));
    expect(readProgress()).toEqual({ patternsMade: 2, sectionsSaved: 3, chainEntries: 4 });
  });

  it('starts at the grid when there is nothing stored', () => {
    expect(readProgress()).toEqual(NO_PROGRESS);
  });

  it('REFUSES A HAND-EDITED STORE rather than trusting it into the studio', () => {
    for (const junk of ['{"patternsMade":-5}', '{"patternsMade":"lots"}', '{"sectionsSaved":null}', 'not json', '[]']) {
      (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(MUSIC_PROGRESS_KEY, junk);
      const p = readProgress();
      expect(p.patternsMade, junk).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.patternsMade), junk).toBe(true);
      expect(Number.isFinite(p.sectionsSaved), junk).toBe(true);
    }
  });

  it('floors a fractional count rather than carrying it', () => {
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(MUSIC_PROGRESS_KEY, '{"patternsMade":2.9}');
    expect(readProgress().patternsMade).toBe(2);
  });

  it('survives having no window at all, which is how it renders on the server', () => {
    vi.stubGlobal('window', undefined);
    expect(readProgress()).toEqual(NO_PROGRESS);
    expect(() => writeProgress(NO_PROGRESS)).not.toThrow();
  });
});
