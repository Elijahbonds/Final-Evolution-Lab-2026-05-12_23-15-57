// VB75-1 (ALL-MODES-TO-75-2026-10-22 §7, Elijah 2:48 PM PT "Volleyball one set to 25"): one set to 25, win by 2, ends the
// match — 25–23 ends it, 25–24 doesn't, 30–29 ends it at the cap. Rules test on VolleyScore, through the set the mode
// actually builds (nexus/setLength 'full'), plus a read of NetSportMode's own end line.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VolleyScore } from './RallyCore';
import { setLengthOf } from '../nexus/setLength';

const fullSet = () => { const s = setLengthOf('full', 'volleyball'); return new VolleyScore(s.target, s.cap); };

/** Level the set at n–n (alternating, so no award can end it early), then return the result of `then` awards. */
function play(levelAt: number, then: (0 | 1)[]): { s: VolleyScore; results: string[] } {
  const s = fullSet();
  for (let i = 0; i < levelAt; i++) {
    expect(s.award(0)).toBe('point');
    expect(s.award(1)).toBe('point');
  }
  return { s, results: then.map((side) => s.award(side)) };
}

describe('VB75-1: volleyball is one set to 25, win by 2, cap 30', () => {
  it('the mode\'s full set is to 25 with a cap of 30', () => {
    expect(setLengthOf('full', 'volleyball')).toMatchObject({ target: 25, cap: 30 });
  });
  it('25–23 ends it', () => {
    const { s, results } = play(23, [0, 0]);
    expect(s.points).toEqual([25, 23]);
    expect(results).toEqual(['point', 'set']);
  });
  it('25–24 does not', () => {
    const { s, results } = play(24, [0]);
    expect(s.points).toEqual([25, 24]);
    expect(results).toEqual(['point']);
  });
  it('…and 26–24 then does (win by 2)', () => {
    const { s, results } = play(24, [0, 0]);
    expect(s.points).toEqual([26, 24]);
    expect(results.at(-1)).toBe('set');
  });
  it('30–29 ends it at the cap', () => {
    const { s, results } = play(29, [0]);
    expect(s.points).toEqual([30, 29]);
    expect(results).toEqual(['set']);
  });
  it('the foe wins it the same way (23–25)', () => {
    const { s, results } = play(23, [1, 1]);
    expect(s.points).toEqual([23, 25]);
    expect(results.at(-1)).toBe('set');
  });
  it('no point before 25 ends it (24–0 plays on)', () => {
    const s = fullSet();
    for (let i = 0; i < 24; i++) expect(s.award(0)).toBe('point');
    expect(s.award(0)).toBe('set');
  });
  it('a set result ends the match: NetSportMode ends on \'set\' and builds the volley set from the picked length', () => {
    const src = readFileSync('lib/babylon/modes/NetSportMode.ts', 'utf8');
    expect(src).toMatch(/if \(result === 'match' \|\| result === 'set'\) \{\s*\n\s*ended = true;/);
    expect(src).toContain("volleyScore = o.scoring === 'volley' ? new VolleyScore(setLen.target, setLen.cap) : null;");
    expect(readFileSync('lib/babylon/modes/VolleyballMode.ts', 'utf8')).toContain("scoring: 'volley'");
  });
});
