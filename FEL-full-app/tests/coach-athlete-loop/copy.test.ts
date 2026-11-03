// PLAT-P06 (2026-10-28): the coached session's own words — draft copy for the Owner Inbox — are short, plain and carry no
// medical word (lib/coach/weeklyDraft/copy.ts MEDICAL_WORDS, the screen the player's own words pass), and no paragraph runs
// over 24 words (the premium rule).
import { describe, expect, it } from 'vitest';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { COACH_PLAYER_COPY as C } from '@/components/session-player/coach-copy';

const LINES = [
  C.start, C.backToToday, C.saved, C.setOf(2, 'Goblet Squat'), ...Object.values(C.rows), C.rowsLabel, C.replyFrom('Dee'), C.close,
  C.noCoachTitle, C.noCoachLine, C.noCoachCta, C.noProgramTitle, C.noProgramLine,
];
const words = (s: string) => s.split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;

describe("the coached session's words", () => {
  it('carry no medical word', () => {
    for (const l of LINES) expect(MEDICAL_WORDS.test(l), l).toBe(false);
  });
  it('a button or a label is at most four words, a line at most twelve', () => {
    for (const l of LINES) expect(words(l), l).toBeLessThanOrEqual(/[.?]$/.test(l) ? 12 : 4);
  });
});
