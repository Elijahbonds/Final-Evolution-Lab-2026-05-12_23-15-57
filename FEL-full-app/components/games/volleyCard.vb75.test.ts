// VB75-2 (ALL-MODES-TO-75-2026-10-22 §7): the volleyball card equals the saved result.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { timingGameResult } from '@/lib/sessions/gameResultFromSession';
import type { SessionResult } from '@/lib/babylon/core/sessionResult';
import { volleyballHeadline } from './volleyCard';

/** What NetSportMode posts at a set's end (NetSportMode.ts ctx.end: outcome, mine, { theirs, style, streak }). */
const ended = (outcome: 'WIN' | 'LOSS', mine: number, theirs: number, style = 40): SessionResult => ({
  modeId: 'volleyball', outcome, score: mine, stats: { theirs, style, streak: 0 }, durationSec: 300, timestamp: '2026-10-23T00:00:00Z',
});
/** The card's numbers, read back off its line. */
const cardOf = (h: string) => { const m = /^(SET WON|SET LOST) · (\d+)–(\d+) · (\d+) STYLE$/.exec(h); return m && { won: m[1] === 'SET WON', mine: +m[2], theirs: +m[3], style: +m[4] }; };

describe('VB75-2: the volleyball card equals the saved result', () => {
  for (const [outcome, mine, theirs] of [['WIN', 25, 23], ['LOSS', 23, 25], ['WIN', 30, 29], ['LOSS', 4, 25], ['WIN', 26, 24]] as const) {
    it(`${outcome} ${mine}–${theirs}: verdict and both scores on the card are the ones saved`, () => {
      const saved = timingGameResult(ended(outcome, mine, theirs), { headline: '', modeKey: 'volleyball' });
      const card = cardOf(volleyballHeadline(saved));
      expect(card).not.toBeNull();
      expect(card).toEqual({ won: saved.won, mine: saved.score, theirs: saved.opponentScore, style: 40 });
      expect(saved.won).toBe(outcome === 'WIN');
      expect([saved.score, saved.opponentScore]).toEqual([mine, theirs]);
    });
  }
  it('the timing host builds the volleyball line from the result it hands the shell (no second read of the stats)', () => {
    const src = readFileSync('components/games/timing-babylon.tsx', 'utf8');
    expect(src).toContain("modeKey === 'volleyball' ? volleyballHeadline(base)");
    expect(src).toContain('onEndRef.current({ ...base, headline,');
  });
});
