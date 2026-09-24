// 3PT final playoff, finish-release pass (2026-09-24; MAP.md "map:threept-carnival-hooks").
//
// Two rivals tied at the top of the final went to a playoff between the two of them, and the mode still handed the player
// a fresh 60 s run after the playoff posted ("FINAL ROUND — YOUR RUN"). The playoff's field held only the two rivals, so
// that run posted nowhere, and the contest ended on a missing row: 0 points, place 0. settleFinal is the final's rule
// after the hold, pure like resolveRound: only a playoff the player is IN hands them a run, and a rivals-only playoff
// ends on the card the player posted in the final.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { settleFinal, type Shooter } from './ThreePointMode';

const mk = (name: string, score: number, isPlayer = false): Shooter => ({ name, score, isPlayer, shot: true });

describe('the final after its hold (settleFinal)', () => {
  it('two rivals tied above the player settle it between themselves: no run for the player, and the result is their own card', () => {
    const final = settleFinal([mk('V. MARCH', 20), mk('D. OKAFOR', 20), mk('YOU', 15, true)], 0, null);
    expect(final).toMatchObject({ kind: 'playoff', playerIn: false, card: { score: 15, place: 3 } });
    if (final.kind !== 'playoff') throw new Error('unreachable');
    expect(final.tied.map((f) => f.name)).toEqual(['V. MARCH', 'D. OKAFOR']);
    // the pair post again; the board holds just the two of them
    const done = settleFinal([mk('V. MARCH', 17), mk('D. OKAFOR', 14)], 1, final.card);
    expect(done).toEqual({ kind: 'end', won: false, score: 15, place: 3 });
  });

  it('a rivals-only playoff that ties again goes again, still without the player, and still ends on their card', () => {
    const first = settleFinal([mk('V. MARCH', 20), mk('D. OKAFOR', 20), mk('YOU', 11, true)], 0, null);
    if (first.kind !== 'playoff') throw new Error('expected a playoff');
    const again = settleFinal([mk('V. MARCH', 16), mk('D. OKAFOR', 16)], 1, first.card);
    expect(again).toMatchObject({ kind: 'playoff', playerIn: false, card: { score: 11, place: 3 } });
    if (again.kind !== 'playoff') throw new Error('expected a playoff');
    expect(settleFinal([mk('D. OKAFOR', 19), mk('V. MARCH', 12)], 2, again.card)).toEqual({ kind: 'end', won: false, score: 11, place: 3 });
  });

  it('a tie the player is in is shot again with the player, who runs it', () => {
    const tie = settleFinal([mk('YOU', 20, true), mk('V. MARCH', 20), mk('D. OKAFOR', 12)], 0, null);
    expect(tie).toMatchObject({ kind: 'playoff', playerIn: true });
    expect(settleFinal([mk('YOU', 19, true), mk('V. MARCH', 17)], 1, { score: 20, place: 1 })).toEqual({ kind: 'end', won: true, score: 19, place: 1 });
    expect(settleFinal([mk('V. MARCH', 21), mk('YOU', 18, true)], 1, { score: 20, place: 1 })).toEqual({ kind: 'end', won: false, score: 18, place: 2 });
  });

  it('an untied final ends on the board as before', () => {
    expect(settleFinal([mk('YOU', 22, true), mk('V. MARCH', 19), mk('D. OKAFOR', 15)], 0, null)).toEqual({ kind: 'end', won: true, score: 22, place: 1 });
    expect(settleFinal([mk('V. MARCH', 27), mk('YOU', 22, true), mk('D. OKAFOR', 20)], 0, null)).toEqual({ kind: 'end', won: false, score: 22, place: 2 });
    // a tie BELOW the top is no playoff
    expect(settleFinal([mk('V. MARCH', 27), mk('YOU', 20, true), mk('D. OKAFOR', 20)], 0, null)).toMatchObject({ kind: 'end', won: false, place: 2 });
  });

  it('three playoffs is the cap: a fourth tie is settled on the board', () => {
    expect(settleFinal([mk('V. MARCH', 18), mk('D. OKAFOR', 18)], 3, { score: 15, place: 3 })).toEqual({ kind: 'end', won: false, score: 15, place: 3 });
  });
});

// The mode's side of it, and the review's follow-ups (source reads: the mode needs a scene to run).
const SRC = readFileSync(path.join(__dirname, 'ThreePointMode.ts'), 'utf8');
const body = (fn: string): string => { const i = SRC.indexOf(`function ${fn}(`); return SRC.slice(i, SRC.indexOf('\n}\n', i)); };

describe('the 3PT mode wires it', () => {
  it('only a playoff the player is in starts the player\'s run', () => {
    expect(body('afterStandings')).toMatch(/S\.finalistsPosting = step\.playerIn;/);
  });

  it('a new contest starts with no playoffs spent (S is module state and outlives a remount)', () => {
    expect(body('resetState')).toMatch(/S\.playoff = 0;/);
  });

  it('the bar desync stays inside the 0..1 sweep (×π read up to 3.14 for a frame, and a press there was graded on it)', () => {
    expect(SRC).not.toMatch(/S\.barT = Math\.random\(\) \* Math\.PI/);
    expect([...SRC.matchAll(/S\.barT = Math\.random\(\);/g)].length).toBe(2);
  });

  it('the mic probe\'s timings: the money ball is called now or never, the clock and the last rack wait for the booth', () => {
    expect(SRC).toMatch(/mic\?\.say\(\{ moment: 'three\.money', priority: 0,/);
    expect(SRC).toMatch(/mic\?\.then\(\{ moment: 'three\.clock', priority: 2,/);
    expect(SRC).toMatch(/mic\?\.then\(\{ moment: 'three\.lastrack', priority: 2,/);
    expect(SRC).not.toMatch(/mic\?\.say\(\{ moment: 'three\.(clock|lastrack)'/);
  });
});
