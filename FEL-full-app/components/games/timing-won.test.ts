// THE TIMING HOST'S WIN VERDICT, OUTCOME BY OUTCOME.
//
// HOTFIX (2026-09-24): the review cut this mapping to `o === 'win' || o === 'GREAT'` and all 39 story tests stayed
// green — while no volleyball, tennis or shootout session could ever be won, so three Story bosses could never
// complete. Each outcome the five timing modes actually send is called here, won and lost.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { timingWon } from './timing-won';
import { stripComments } from '@/lib/testing/sourceScan';

describe('timingWon', () => {
  it('volleyball and tennis: NetSportMode ends WIN or LOSS', () => {
    expect(timingWon('WIN', { streak: 3, style: 40, theirs: 21 })).toBe(true);
    expect(timingWon('WIN', { rackets: 2 })).toBe(true);   // a match won by breaking the rival's racket
    expect(timingWon('LOSS', { streak: 0, style: 0, theirs: 25 })).toBe(false);
  });

  it('the shootout: SHOOTOUT_WIN or SHOOTOUT_LOSS', () => {
    expect(timingWon('SHOOTOUT_WIN', { goals: 3, themGoals: 1, stylePts: 12 })).toBe(true);
    expect(timingWon('SHOOTOUT_LOSS', { goals: 3, themGoals: 4, stylePts: 0 })).toBe(false);
  });

  it('golf: a card at par or better', () => {
    expect(timingWon('CARD_IN', { holes: 3, overPar: 0, pickUps: 0 })).toBe(true);
    expect(timingWon('CARD_IN', { holes: 3, overPar: -1, pickUps: 0 })).toBe(true);
    expect(timingWon('CARD_IN', { holes: 3, overPar: 1, pickUps: 0 })).toBe(false);
    expect(timingWon('CARD_IN', {})).toBe(false);   // no over-par figure is not a par card
  });

  it('the derby: three homers or more', () => {
    expect(timingWon('DERBY_END', { homers: 3, outs: 2 })).toBe(true);
    expect(timingWon('DERBY_END', { homers: 2, outs: 3 })).toBe(false);
  });

  it('nothing else is a win', () => {
    expect(timingWon('MATCH_END', { hits: 3, rounds: 5 })).toBe(true);
    expect(timingWon('MATCH_END', { hits: 2, rounds: 5 })).toBe(false);
    expect(timingWon('TIME_UP', {})).toBe(false);
    expect(timingWon('', null)).toBe(false);
  });

  it('the host reads its verdict here, and the modes still send these outcomes', () => {
    const src = (rel: string) => stripComments(readFileSync(join(__dirname, '..', '..', rel), 'utf8'));
    expect(src('components/games/timing-babylon.tsx')).toContain('const won = timingWon(r.outcome, st);');
    expect(src('lib/babylon/modes/NetSportMode.ts')).toMatch(/ctx\.end\(\s*side === 0 \? 'WIN' : 'LOSS',/);
    expect(src('lib/babylon/modes/precisionModes.ts')).toContain("ctx.end(won ? 'SHOOTOUT_WIN' : 'SHOOTOUT_LOSS', goals * 20 + stylePts,");
    expect(src('lib/babylon/modes/precisionModes.ts')).toContain("ctx.end('CARD_IN', pts, { holes: TOTAL, overPar, pickUps });");
    expect(src('lib/babylon/modes/precisionModes.ts')).toMatch(/ctx\.end\('DERBY_END', pts, \{ pitch(es)?: [\w]+, homers: tally\.homers/);
  });
});
