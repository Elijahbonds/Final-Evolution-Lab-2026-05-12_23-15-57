import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  CHAIN_AT_PATTERNS, MUSIC_PROGRESS_KEY, MUSIC_TIERS, NO_PROGRESS, STUDIO_AT_CHAIN, TIERS,
  advance, isRealPattern, nextUnlock, readProgress, tierDef, tierFor, unlocked, writeProgress,
  type MusicProgress,
} from './MusicTiers';
// MUSIC-SUITE P3 (2026-09-25): tier honesty
import {
  FLIP_ROW_CAP, flipRowPad, heardTracks, hiddenHits, isFlipRowId, patternCounts, shownRowIds, tierChips, tierOpens, visibleRows,
} from './MusicTiers';
import { KIT_SLOTS } from './SynthKit';
import { PAD_COUNT } from './Flip';

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

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P3 (2026-09-25), "Keep my work" — TIER HONESTY. P1 (outbox musicsuite/BASELINE.md 2b): the engine had 10
// tracks while 6 rows were drawn (flip_0 played 8 times in 2 bars, never drawn); CELL's lead played on the 4-row grid; the
// dance export sat behind the CHAIN though the ladder opens it at the GRID; takes and stems showed from the CHAIN.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const row = (sampleId: string, hits: number[] = []) => ({ sampleId, pattern: Array.from({ length: 16 }, (_, i) => hits.includes(i)), muted: false });
/** The project's grid the way StudioProject keeps it: the eight kit rows in kit order, then Flip rows. */
const projectGrid = (flips: number[] = [], hits: Record<string, number[]> = {}) =>
  [...KIT_SLOTS.map((k) => row(k.id, hits[k.id])), ...flips.map((f) => row(`flip_${f}`, hits[`flip_${f}`]))];

describe('what the grid draws is what the engine plays (one rule by id)', () => {
  it('the grid draws the tier\'s kit rows in kit order, then EVERY Flip row in pad order', () => {
    const g = projectGrid([9, 0, 3]);
    for (const t of MUSIC_TIERS) {
      const v = visibleRows(g, TIERS[t]);
      expect(v.kit.map((r) => r.sampleId), t).toEqual(KIT_SLOTS.slice(0, TIERS[t].tracks).map((k) => k.id));
      expect(v.flip.map((r) => r.sampleId), t).toEqual(['flip_0', 'flip_3', 'flip_9']);   // own cap, every tier
    }
  });

  it('P1 REPRODUCED AND CLOSED: a Flip row sent at the CHAIN tier is drawn (it sat at index 8, past slice(0, 6))', () => {
    const g = projectGrid([0]);
    expect(g.slice(0, TIERS.chain.tracks).some((r) => r.sampleId === 'flip_0')).toBe(false);   // the old rule hid it
    expect(heardTracks(g, TIERS.chain).map((r) => r.sampleId)).toContain('flip_0');
  });

  it('the engine\'s set and the drawn rows are the same rows, for every tier and every Flip pad', () => {
    for (const t of MUSIC_TIERS) {
      const g = projectGrid(Array.from({ length: PAD_COUNT }, (_, i) => i));
      const ids = shownRowIds(TIERS[t]);
      const drawn = heardTracks(g, TIERS[t]).map((r) => r.sampleId);
      expect(new Set(drawn), t).toEqual(new Set(g.filter((r) => ids.has(r.sampleId)).map((r) => r.sampleId)));
      expect(drawn.length, t).toBe(TIERS[t].tracks + PAD_COUNT);
    }
  });

  it('a hidden row\'s hits are counted as hidden, never heard (CELL\'s lead on the 4-row grid)', () => {
    const g = projectGrid([], { kick: [0, 8], lead: [3, 7, 11], fx: [15] });
    expect(hiddenHits(g, TIERS.grid)).toBe(4);
    expect(hiddenHits(g, TIERS.studio)).toBe(0);
    expect(heardTracks(g, TIERS.grid).some((r) => r.sampleId === 'lead')).toBe(false);
  });

  it('the rule is by id, so a section swapped in on a bar line (rows in any order) is filtered the same way', () => {
    const shuffled = [row('fx', [1]), row('flip_2', [0]), row('kick', [0]), row('bass', [4])];
    expect(heardTracks(shuffled, TIERS.grid).map((r) => r.sampleId)).toEqual(['kick', 'flip_2']);
    expect(heardTracks(shuffled, TIERS.chain).map((r) => r.sampleId)).toEqual(['kick', 'bass', 'flip_2']);
  });

  it('only flip_0..flip_15 are Flip rows', () => {
    expect(FLIP_ROW_CAP).toBe(PAD_COUNT);
    expect(isFlipRowId('flip_0') && isFlipRowId('flip_15')).toBe(true);
    for (const bad of ['flip_16', 'flip_', 'flip_x', 'kick', 'xflip_1', 'flip_001']) expect(isFlipRowId(bad), bad).toBe(false);
    expect(flipRowPad('flip_7')).toBe(7);
  });
});

describe('the pattern gate does what its words say ("Play a pattern with at least one hit in it")', () => {
  it('a lit cell with the transport stopped is not a pattern played', () => {
    expect(patternCounts({ playing: false, tracks: projectGrid([], { kick: [0] }), def: TIERS.grid })).toBe(false);
    expect(patternCounts({ playing: true, tracks: projectGrid([], { kick: [0] }), def: TIERS.grid })).toBe(true);
  });

  it('a hit only on a HIDDEN row does not count (it is not heard); a Flip row\'s hit does', () => {
    expect(patternCounts({ playing: true, tracks: projectGrid([], { lead: [0] }), def: TIERS.grid })).toBe(false);
    expect(patternCounts({ playing: true, tracks: projectGrid([4], { flip_4: [2] }), def: TIERS.grid })).toBe(true);
  });

  it('the words the ladder shows are the rule the gate runs', () => {
    expect(nextUnlock(NO_PROGRESS)?.needs).toMatch(/^Play a pattern/);
  });
});

describe('the tier chips say what each tier opens and what unlocks the next', () => {
  it('what each tier opens is derived from its flags (the dance floor at the GRID; takes + stems at the STUDIO)', () => {
    // MUSIC-SUITE P3 FIX PASS: kit rows are counted as kit rows — the grid also draws every Flip row, at every tier
    expect(tierOpens('grid')).toBe('4 kit rows + your Flip rows · send it to the dance floor');
    expect(tierOpens('chain')).toBe('6 kit rows (+2) · sections, the chain and song mode');
    expect(tierOpens('studio')).toBe('8 kit rows (+2) · record takes over it · render the song + stems');
    expect(TIERS.grid.blurb).toMatch(/four kit sounds — plus every pad you send from the FLIP/);
    for (const t of MUSIC_TIERS) {
      // every flag a tier turns on is named on its chip or a lower one — a chip never omits a gate, never invents one
      const upTo = MUSIC_TIERS.slice(0, MUSIC_TIERS.indexOf(t) + 1).map(tierOpens).join(' ');
      expect(upTo.includes('dance floor'), t).toBe(TIERS[t].danceExport);
      expect(upTo.includes('song mode'), t).toBe(TIERS[t].arrangement);
      expect(upTo.includes('takes'), t).toBe(TIERS[t].takes);
      expect(upTo.includes('stems'), t).toBe(TIERS[t].mixdown);
    }
  });

  it('a new player: GRID current, CHAIN next (with the gate\'s words), STUDIO later (and what it takes)', () => {
    const c = tierChips(NO_PROGRESS);
    expect(c.map((x) => x.state)).toEqual(['current', 'next', 'later']);
    expect(c[0].needs).toBeNull();
    expect(c[1].needs).toBe('Play a pattern with at least one hit in it');
    expect(c[2].needs).toBe(`After THE CHAIN: save ${STUDIO_AT_CHAIN} sections and chain them`);
  });

  it('mid-ladder the next chip counts what is missing; at the top nothing is dangled', () => {
    const mid = tierChips(at({ patternsMade: 1, sectionsSaved: 1, chainEntries: 1 }));
    expect(mid.map((x) => x.state)).toEqual(['reached', 'current', 'next']);
    expect(mid[2].needs).toBe('Save 1 more section');
    const top = tierChips(at({ patternsMade: 1, sectionsSaved: 2, chainEntries: 2 }));
    expect(top.map((x) => x.state)).toEqual(['reached', 'reached', 'current']);
    expect(top.every((x) => x.needs === null)).toBe(true);
  });
});
