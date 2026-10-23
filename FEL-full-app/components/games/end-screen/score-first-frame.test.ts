// QA-H5 (hoops grade 0d16f5dd): the end card's "N SCORE" opened on a tally that didn't match the board (board 4–12, card
// "2 SCORE"; 3v3 14–22, card "3" / "8") and settled up to 4 s later. The score is now the board's number from frame one.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(__dirname, 'end-screen.tsx'), 'utf8');

describe('QA-H5: the card score is the board score from its first frame', () => {
  it('the score is the figure itself, never a count-up', () => {
    expect(SRC).toMatch(/const score = fig\.mine;/);
    expect(SRC).not.toMatch(/useCountUp\(fig\.mine/);
  });
  it('what is drawn and what is tagged are the same number', () => {
    expect(SRC).toMatch(/data-end-score=\{fig\.mine\}/);
    expect(SRC).toMatch(/\{fmt\(score\)\}/);
  });
  it('the reward tiles still count up', () => {
    expect(SRC).toMatch(/useCountUp\(value, \{ active: show, instant/);
  });
});
