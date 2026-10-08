import { describe, expect, it } from 'vitest';
import { answer, BOX_INTERVAL_DAYS, firstAnswer, isDue, isMastered, review } from './leitner';

describe('Leitner boxes', () => {
  it('a first right answer goes to box 2, due tomorrow; a first miss to box 1, due today', () => {
    expect(firstAnswer(true, 10)).toMatchObject({ box: 2, due: 11, right: 1, wrong: 0 });
    expect(firstAnswer(false, 10)).toMatchObject({ box: 1, due: 10, right: 0, wrong: 1 });
  });

  it('promotes one box per right answer on a new day, with growing intervals', () => {
    let r = firstAnswer(true, 0);                       // box 2
    r = review(r, true, r.due);                         // box 3
    expect(r.box).toBe(3);
    expect(r.due - r.lastAnswered).toBe(BOX_INTERVAL_DAYS[3]);
    r = review(r, true, r.due);                         // box 4
    r = review(r, true, r.due);                         // box 5
    r = review(r, true, r.due);                         // capped
    expect(r.box).toBe(5);
    expect(r.due - r.lastAnswered).toBe(BOX_INTERVAL_DAYS[5]);
    expect(BOX_INTERVAL_DAYS[2] < BOX_INTERVAL_DAYS[3] && BOX_INTERVAL_DAYS[3] < BOX_INTERVAL_DAYS[4] && BOX_INTERVAL_DAYS[4] < BOX_INTERVAL_DAYS[5]).toBe(true);
  });

  it('demotes any box to box 1 on a miss, due again today', () => {
    let r = firstAnswer(true, 0);
    r = review(r, true, 1);
    r = review(r, true, 4);
    expect(r.box).toBe(4);
    r = review(r, false, 11);
    expect(r).toMatchObject({ box: 1, due: 11, wrong: 1, right: 3 });
  });

  it('answering again on the same day cannot fake spacing', () => {
    let r = firstAnswer(true, 5);                       // box 2
    r = review(r, true, 5);
    r = review(r, true, 5);
    expect(r.box).toBe(2);
    // a same-day recovery from a miss still gets back to box 2 (it was learned), not further
    let m = firstAnswer(false, 5);
    m = review(m, true, 5);
    expect(m.box).toBe(2);
  });

  it('is mastered at box 4: three right answers on three separate days', () => {
    let r = answer(undefined, true, 0);
    expect(isMastered(r)).toBe(false);
    r = answer(r, true, 1);
    expect(isMastered(r)).toBe(false);
    r = answer(r, true, 4);
    expect(isMastered(r)).toBe(true);
    expect(isMastered(answer(r, false, 11))).toBe(false);
  });

  it('is due on or after its due day', () => {
    const r = firstAnswer(true, 10);
    expect(isDue(r, 10)).toBe(false);
    expect(isDue(r, 11)).toBe(true);
    expect(isDue(r, 30)).toBe(true);
  });
});
