// QA phase 3 (#250): "every line is the program's own text" was not pinned — rest 60 s → 45 s on a card still passed.
// The source doc is committed now (programs/DUNK-PROGRAM.md), and this test reads it: every piece of card text is tied to
// the exact passage(s) it comes from, each passage must be in the doc word for word, every number on a card must be a
// number in its passages, and the blocks the doc gives whole (the stability block, the Movement Snack, the check-in,
// the Neural Flush) must match it word for word.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEEK1_DUNK_DAYS, WEEK1_END_SET, WEEK1_EXIT, WEEK1_TITLE } from './week1-dunk';

const DOC = readFileSync(join(__dirname, '../../programs/DUNK-PROGRAM.md'), 'utf8');
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/[“”"*]/g, '').trim().toLowerCase();
const D = norm(DOC);
const nums = (s: string) => s.match(/\d+(?:[–-]\d+)?/g) ?? [];

/** Card text → the doc passages it is made from (each must be in the doc verbatim). */
const SOURCE: Record<string, string[]> = {
  'Week 1: Base': ['Weeks 1–2 · Base'],
  'Session A': ['Mon session A'], 'Session B': ['Wed session B'], 'Session C': ['Fri session C (re-test first)'],
  'Movement Snack': ['Tue Movement Snack (5 min)'], 'Off, or a walk': ['Thu off or a walk'], 'Off': ['Sun off'],
  'Check-in': ['| 0 | Check-in |'], 'Anything hurt today? Hours slept.': ['"Anything hurt today?" Hours slept.'],
  'Reset (Neural Flush)': ['| 7 | Reset (Neural Flush) |'],
  'Three slow breaths, 4 s in through the nose, 8 s out.': ['Three slow breaths, 4 s in through the nose, 8 s out'],
  'Down, Up, Check': ['| Down, Up, Check |'],
  "Your top flag's row. Landing flags use the knees cave in row.": ["Your top flag's row (§7.1 or §8.1); landing flags use the Knees cave in row"],
  'Re-test first: squat, rib turn, jump. Then your row.': ['Re-test first: squat, rib turn, jump'],
  'Breath and stack': ['| Breath and stack |'],
  'The breathing ladder, then the band split-stance row and press, 8–10 min.': ['The breathing ladder, then the RNT split-stance row and press', '| Breath and stack | 8–10 min |'],
  'T-spine flow.': ['T-spine flow'],
  'The breathing ladder, 8–10 min.': ['The breathing ladder', 'T-spine flow | 8–10 min |'],
  'Spring': ['| Spring |'],
  'Rung 0 (Land): snap-down to stick, 4 × 5, rest 60 s.': ['| 0 | Land | Snap-down to stick', 'Rung 0: 4 × 5, rest 60 s'],
  'Rung 0–1: 3 × 5 snap-downs to stick, plus 2 × 15 two-foot pogos, rest 60 s.': ['Rung 0–1: 3 × 5 + 2 × 15', '| 3–4 × 5 | 60 s |', '| 3–4 × 10–20 | 60 s |'],
  'Rung 1 (Bounce): two-foot pogos in place, 4 × 15, rest 60 s.': ['| 1 | Bounce | Two-foot pogos in place', 'Rung 1: 4 × 15', '| 3–4 × 10–20 | 60 s |'],
  'Strong': ['| Strong |'],
  'Tempo goblet squat 3 × 8; split squat 2 × 8 each; side plank 2 × 20 s; dead bug 2 × 8; suitcase carry 3 × 20 m. Overcoming isometric, moderate effort, 3 × 3 s. Sprint build-ups 3–4 × 20 m easy to medium.':
    ['Stability block: tempo goblet squat 3 × 8; split squat 2 × 8 each; side plank 2 × 20 s; dead bug 2 × 8; suitcase carry 3 × 20 m. Overcoming isometric, moderate effort, 3 × 3 s. Sprint build-ups 3–4 × 20 m easy to medium.'],
  'Carries and side plank.': ['Carries and side plank'],
  'Same as session A.': ['Same as A'],
  'Movement Snack (5 min)': ['Movement Snack (5 min)'],
  '3 rounds of 3 slow breaths, 20 s of tiny ankle bounces while breathing, then a 3-breath Neural Flush.': ['**Movement Snack:** 3 rounds of 3 slow breaths, 20 s of tiny ankle bounces while breathing, then a 3-breath Neural Flush.'],
  [WEEK1_END_SET]: ['**End the set the moment:** the pop turns into a thud', 'the heels sink', 'the rhythm stutters, or anything hurts', '**Pop, not thud.'],
  [WEEK1_EXIT]: ['Weeks 1–2 · Base', 'two sessions in a row each', 'Rung 1: 4 × 15'],
};

/** Every piece of text the cards show. */
const shown: string[] = [WEEK1_TITLE, WEEK1_END_SET, WEEK1_EXIT];
for (const d of WEEK1_DUNK_DAYS) { shown.push(d.title); for (const b of d.blocks) shown.push(b.name, b.what); }

describe('week-1 dunk cards: the program\'s own text (programs/DUNK-PROGRAM.md)', () => {
  it('every passage a card cites is in the doc, word for word', () => {
    for (const qs of Object.values(SOURCE)) for (const q of qs) expect(D.includes(norm(q)), q).toBe(true);
  });

  it('no card text without its source passage', () => {
    expect(shown.filter((s) => !(s in SOURCE))).toEqual([]);
  });

  it('every number on a card is a number in its source passages (no new number)', () => {
    for (const s of new Set(shown)) {
      const allowed = new Set(SOURCE[s].flatMap(nums).flatMap((n) => [n, ...n.split(/[–-]/)]));   // a range's ends count ("Weeks 1–2" → week 1)
      expect(nums(s).filter((n) => !allowed.has(n)), s).toEqual([]);
    }
  });

  it('the blocks the doc gives whole match it word for word', () => {
    const whole = (s: string) => expect(D.includes(norm(s.replace(/\.$/, ''))), s).toBe(true);
    const day = (d: string) => WEEK1_DUNK_DAYS.find((x) => x.day === d)!;
    whole(day('Mon').blocks.find((b) => b.name === 'Strong')!.what);
    whole(day('Tue').blocks[0].what);
    whole(day('Mon').blocks[0].what);
    whole(day('Mon').blocks.at(-1)!.what);
  });
});
