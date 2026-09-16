// A CARD READ BACK OFF THE WIRE MUST NEVER BREAK A RESULTS SCREEN (2026-09-13).
//
// This is the only object in the app that will be written by one build and read by another — it lives in a
// JSON column that outlives every deploy. So the tests are mostly about the read path: garbage, truncation,
// a card from a future version, a card from a build that spelled a field differently. Every one of those
// degrades to "show the score", which is exactly what players had before cards existed.

import { describe, it, expect } from 'vitest';
import { DUNK_CARD_VERSION, MAX_ATTEMPTS, emptyCard, addAttempt, parseCard, attemptLine, cardHeadline, duelSummary, forWire, type DunkAttempt, nightReport } from './dunkCard';

const att = (over: Partial<DunkAttempt> = {}): DunkAttempt => ({
  round: 1, style: 'POWER', prop: 'standing', finish: 'dunk_finish_windmill', label: 'WINDMILL',
  judges: [9, 9, 10], total: 28, made: true, ...over,
});

const cardOf = (...as: DunkAttempt[]) => as.reduce(addAttempt, emptyCard());

describe('a card describes a contest', () => {
  it('totals, best and make count all follow the attempts', () => {
    const c = cardOf(att({ total: 28 }), att({ round: 2, total: 34 }), att({ round: 3, total: 0, made: false, label: 'BLOWN' }));
    expect(c.total).toBe(62);
    expect(c.best).toBe(34);
    expect(c.makes).toBe(2);
    expect(c.misses).toBe(1);
    expect(c.attempts).toHaveLength(3);
  });

  it('NEVER MUTATES — a mode can hold one card across a whole contest', () => {
    const a = cardOf(att());
    const b = addAttempt(a, att({ round: 2, total: 30 }));
    expect(a.attempts).toHaveLength(1);
    expect(a.total).toBe(28);
    expect(b.attempts).toHaveLength(2);
  });

  it('an empty card is a valid card', () => {
    const c = emptyCard();
    expect(c.total).toBe(0);
    expect(c.best).toBe(0);
    expect(c.attempts).toEqual([]);
    expect(c.v).toBe(DUNK_CARD_VERSION);
  });

  it('caps its length, because this rides in a JSON column', () => {
    let c = emptyCard();
    for (let i = 0; i < 40; i++) c = addAttempt(c, att({ round: i + 1, total: 10 }));
    expect(c.attempts).toHaveLength(MAX_ATTEMPTS);
    // and the total follows the attempts it actually kept, so the card is never internally inconsistent
    expect(c.total).toBe(c.attempts.reduce((s, a) => s + a.total, 0));
  });

  it('it records the FINISH CLIP, not only a label — that is what makes a replay possible later', () => {
    const c = cardOf(att({ finish: 'dunk_finish_tomahawk', label: 'TOMAHAWK' }));
    expect(c.attempts[0].finish).toBe('dunk_finish_tomahawk');
  });
});

describe('THE READ PATH SURVIVES ANYTHING', () => {
  it('round-trips a real card through JSON', () => {
    const c = cardOf(att(), att({ round: 2, total: 31, label: 'TOMAHAWK' }));
    const back = parseCard(JSON.parse(JSON.stringify(forWire(c))));
    expect(back).not.toBeNull();
    expect(back!.total).toBe(c.total);
    expect(back!.attempts.map((a) => a.label)).toEqual(['WINDMILL', 'TOMAHAWK']);
  });

  it('returns null rather than throwing on garbage', () => {
    for (const bad of [null, undefined, 0, '', 'nope', [], {}, { v: 1 }, { v: 1, attempts: 'x' }, { attempts: [] }]) {
      expect(() => parseCard(bad)).not.toThrow();
      expect(parseCard(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('refuses a card from a FUTURE version instead of half-reading it', () => {
    expect(parseCard({ v: DUNK_CARD_VERSION + 1, attempts: [att()] })).toBeNull();
  });

  it('fills in fields an older build did not write, and drops ones it cannot use', () => {
    const back = parseCard({ v: 1, attempts: [{ total: 22, made: true }] });
    expect(back).not.toBeNull();
    expect(back!.attempts[0].round).toBe(1);
    expect(back!.attempts[0].label).toBe('');
    expect(back!.attempts[0].judges).toEqual([]);
    expect(back!.total).toBe(22);
  });

  it('coerces nonsense numbers instead of producing NaN on a screen', () => {
    const back = parseCard({ v: 1, attempts: [{ total: 'twelve', round: null, judges: ['a', 9, 10], made: true }] })!;
    expect(back.total).toBe(0);
    expect(Number.isNaN(back.total)).toBe(false);
    expect(back.attempts[0].judges).toEqual([0, 9, 10]);
  });

  it('truncates a hostile payload rather than accepting it', () => {
    const huge = { v: 1, attempts: Array.from({ length: 500 }, () => ({ ...att(), style: 'x'.repeat(5000) })) };
    const back = parseCard(huge)!;
    expect(back.attempts.length).toBeLessThanOrEqual(MAX_ATTEMPTS);
    expect(back.attempts[0].style.length).toBeLessThanOrEqual(32);
  });

  it('forWire carries the performance and nothing identifying', () => {
    const wire = forWire(cardOf(att()));
    const keys = Object.keys(wire).sort();
    expect(keys).toEqual(['attempts', 'best', 'makes', 'misses', 'total', 'v']);
    for (const a of wire.attempts) {
      expect(Object.keys(a).sort()).toEqual(['finish', 'judges', 'label', 'made', 'prop', 'round', 'style', 'total']);
    }
  });
});

describe('what a player reads', () => {
  it('an attempt line names the dunk and shows the panel', () => {
    expect(attemptLine(att({ round: 2 }))).toBe('R2 · WINDMILL · 9 9 10 = 28');
    expect(attemptLine(att({ label: '', style: 'FLASHY', judges: [] }))).toBe('R1 · FLASHY · 28');
  });

  it('the headline says the three things worth knowing', () => {
    const c = cardOf(att({ total: 28 }), att({ round: 2, total: 40 }), att({ round: 3, total: 0, made: false }));
    expect(cardHeadline(c, 'JORDAN')).toBe('JORDAN — 68 · best 40 · 2/3 made');
  });

  it('A DUEL SAYS WHY IT WAS DECIDED, which is the only part anyone wants', () => {
    const steady = cardOf(att({ total: 30 }), att({ round: 2, total: 30 }));
    const blewOne = cardOf(att({ total: 34 }), att({ round: 2, total: 0, made: false }));
    expect(duelSummary(steady, blewOne)).toContain('Won by 26');
    expect(duelSummary(steady, blewOne)).toContain('they blew 1');
    expect(duelSummary(blewOne, steady)).toContain('Lost by 26');
    expect(duelSummary(blewOne, steady)).toContain('you blew 1');
  });

  it('names a big single dunk when that is what did it', () => {
    const spike = cardOf(att({ total: 48 }), att({ round: 2, total: 20 }));
    const flat = cardOf(att({ total: 32 }), att({ round: 2, total: 32 }));
    expect(duelSummary(spike, flat)).toContain('your best went 48');
  });

  it('and handles a dead heat without claiming anybody won', () => {
    const a = cardOf(att({ total: 30 }));
    const b = cardOf(att({ total: 30 }));
    expect(duelSummary(a, b)).toBe('Dead level on 30.');
  });
});

// ── THE NIGHT SAYS WHAT IT WAS (P9, 2026-09-16) ────────────────────────────────────────────────────────
describe('nightReport', () => {
  const att = (o: Partial<DunkAttempt>): DunkAttempt => ({
    round: 1, style: 'FLASHY', prop: 'NO PROP', finish: 'dunk_score_hang', label: 'WINDMILL',
    judges: [8, 8, 8, 8, 8], total: 40, made: true, diff: 7, exec: 8, look: 5, ...o,
  });
  const cardOf = (as: DunkAttempt[]) => as.reduce((c, a) => addAttempt(c, a), emptyCard());

  it('names the best dunk of the night', () => {
    const r = nightReport(cardOf([att({ total: 38 }), att({ total: 46, label: 'EASTBAY' }), att({ total: 41 })]));
    expect(r.headline).toContain('BEST 46');
    expect(r.lines[0]).toContain('EASTBAY');
  });

  it('a night lost on the beat is told so, with the number', () => {
    const r = nightReport(cardOf([att({ exec: 3.5, total: 36 }), att({ exec: 4, total: 37 })]));
    expect(r.advice).toContain('beat');
    expect(r.advice).toContain('3.8');
  });

  it('a clean night of easy dunks is told to call a harder one', () => {
    const r = nightReport(cardOf([att({ diff: 2, exec: 9.5, look: 6 }), att({ diff: 2.4, exec: 9, look: 6 })]));
    expect(r.advice).toContain('harder');
  });

  it('a night thrown at the iron is named as that first', () => {
    const r = nightReport(cardOf([att({ made: false, exec: 0, total: 31 }), att({ made: false, exec: 0, total: 30 }), att({ total: 40 })]));
    expect(r.advice).toContain('before you get there');
  });

  it('a big clean night is left alone', () => {
    const r = nightReport(cardOf([att({ diff: 9, exec: 9.4, look: 8, total: 47 }), att({ diff: 8.6, exec: 9, look: 7.5, total: 46 })]));
    expect(r.advice).toContain('Nothing to fix');
  });

  it('an old card with no numbers on it does not invent any', () => {
    const r = nightReport(cardOf([att({ diff: undefined, exec: undefined, look: undefined })]));
    expect(r.lines.some((l) => l.includes('EXECUTION'))).toBe(false);
    expect(r.advice).toBeTruthy();
  });
});
