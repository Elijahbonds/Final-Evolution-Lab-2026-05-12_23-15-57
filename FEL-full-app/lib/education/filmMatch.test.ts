import { describe, expect, it } from 'vitest';
import { STRONG, WEAK, matchFilms, score, words, type MatchDrill } from './filmMatch';

const DRILLS: MatchDrill[] = [
  { key: 'pogo', title: 'The Oscillatory Pogo Progression', chapter: 4 },
  { key: 'ankle', title: 'Movement Snack: The Ankle Architecture Reset', chapter: 2 },
  { key: 'hip', title: 'Joint 2 — The Hip', chapter: 3 },
];

describe('words', () => {
  it('drops the editing noise a filmed folder is full of', () => {
    expect(words('Drill 2 - Pogo Progression FINAL v3 1080p.mov')).not.toContain('final');
    expect(words('Pogo copy export 4K.mp4')).toEqual(['pogo']);
  });
  it('keeps the words that identify the drill', () => {
    expect(words('Ankle Architecture Reset.mov')).toEqual(['ankle', 'architecture', 'reset']);
  });
});

describe('score', () => {
  it('matches a messy filename to its drill', () => {
    expect(score('Drill 2 - Pogo Progression FINAL.mov', 'The Oscillatory Pogo Progression')).toBeGreaterThan(0.4);
  });
  it('is 0 for a name with nothing in common', () => {
    expect(score('IMG_4417.mov', 'Joint 2 — The Hip')).toBe(0);
  });
  it('is symmetric in the sense that matching a title to itself is 1', () => {
    expect(score('The Oscillatory Pogo Progression.mov', 'The Oscillatory Pogo Progression')).toBe(1);
  });
});

describe('matchFilms', () => {
  it('attaches a confident film and leaves the rest of the book empty-handed', () => {
    const r = matchFilms(['The Oscillatory Pogo Progression.mov'], DRILLS);
    expect(r.matched.map((m) => m.key)).toEqual(['pogo']);
    expect(r.missing.map((d) => d.key).sort()).toEqual(['ankle', 'hip']);
  });

  it('never gives one film to two drills, or one drill two films', () => {
    const r = matchFilms(['Pogo Progression.mov', 'Pogo Progression (1).mov'], DRILLS);
    expect(r.matched).toHaveLength(1);
    expect(new Set(r.matched.map((m) => m.file)).size).toBe(r.matched.length);
  });

  it('offers a middling match as a MAYBE instead of attaching it', () => {
    // 2 words shared of 4 = 0.50: over WEAK, under STRONG. Close enough to show a human, not close enough to trust.
    const r = matchFilms(['Pogo Progression.mov'], [{ key: 'pogo2', title: 'The Pogo Progression Reset Ladder', chapter: 4 }]);
    expect(r.matched).toHaveLength(0);
    expect(r.unsure).toHaveLength(1);
    expect(r.unsure[0].score).toBeGreaterThanOrEqual(WEAK);
    expect(r.unsure[0].score).toBeLessThan(STRONG);
  });

  it('drops a match too weak to be worth a human glance', () => {
    // 1 word of 5 = 0.20. Offering this as a maybe is noise, and a wrong film teaches the wrong movement.
    const r = matchFilms(['hip.mov'], [{ key: 'hip', title: 'Joint 2 — The Hip and its rotation drill', chapter: 3 }]);
    expect(r.matched).toHaveLength(0);
    expect(r.unsure).toHaveLength(0);
    expect(r.unmatched).toEqual(['hip.mov']);
  });

  it('says nothing about a film it cannot place', () => {
    const r = matchFilms(['IMG_4417.mov'], DRILLS);
    expect(r.matched).toHaveLength(0);
    expect(r.unsure).toHaveLength(0);
    expect(r.unmatched).toEqual(['IMG_4417.mov']);
  });

  it('matches on the name, not the path it happens to sit at', () => {
    const deep = matchFilms(['/Volumes/Films/2026/The Oscillatory Pogo Progression.mov'], DRILLS);
    const bare = matchFilms(['The Oscillatory Pogo Progression.mov'], DRILLS);
    expect(deep.matched[0]?.key).toBe(bare.matched[0]?.key);
  });

  it('gives the same answer twice — ties broken, not shuffled', () => {
    const files = ['b Pogo Progression.mov', 'a Pogo Progression.mov'];
    expect(matchFilms(files, DRILLS)).toEqual(matchFilms(files, DRILLS));
    expect(matchFilms([...files].reverse(), DRILLS).matched[0].file).toBe(matchFilms(files, DRILLS).matched[0].file);
  });

  it('every film and every drill is accounted for exactly once', () => {
    const files = ['The Oscillatory Pogo Progression.mov', 'IMG_4417.mov', 'hip something else.mov'];
    const r = matchFilms(files, DRILLS);
    const seen = [...r.matched.map((m) => m.file), ...r.unsure.map((u) => u.file), ...r.unmatched];
    expect(seen.sort()).toEqual([...files].sort());
    expect(r.matched.length + r.missing.length).toBe(DRILLS.length);
  });

  it('handles an empty folder without pretending anything matched', () => {
    const r = matchFilms([], DRILLS);
    expect(r.matched).toEqual([]);
    expect(r.missing).toHaveLength(DRILLS.length);
  });
});
