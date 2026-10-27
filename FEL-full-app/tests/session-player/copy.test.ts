// PLAT-P01 (2026-10-27): the player's own words and the program pages' new lines — draft copy for the Owner Inbox — are
// short, plain and carry no medical word (lib/coach/weeklyDraft/copy.ts MEDICAL_WORDS, the screen every program line passes).
import { describe, expect, it } from 'vitest';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { PLAYER_COPY, stepOfLine } from '@/components/session-player/copy';
import { DONE_LINE, GO_WORD, REST_WORD } from '@/lib/session-player/voice';
import { RETEST_FIRST, START_LABEL, TODAY_LIST } from '@/components/signature/program-page';
import { COMING_SOON } from '@/components/signature/program-list';

const LINES = [...Object.values(PLAYER_COPY), stepOfLine(2, 6), GO_WORD, REST_WORD, DONE_LINE, START_LABEL, RETEST_FIRST, TODAY_LIST, COMING_SOON];
const words = (s: string) => s.split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;

describe('the session player\'s words', () => {
  it('carry no medical word', () => {
    for (const l of LINES) expect(MEDICAL_WORDS.test(l), l).toBe(false);
  });

  it('are short: a button or a label is at most four words, a line at most eight', () => {
    for (const l of LINES) expect(words(l), l).toBeLessThanOrEqual(/[.?]$/.test(l) ? 8 : 4);
  });

  it('the closed programs list tells an athlete one plain line, not how the tables and the review work', () => {
    expect(COMING_SOON).toBe('Coming soon.');
    expect(COMING_SOON).not.toMatch(/table|owner|approv/i);
  });
});
