import { describe, it, expect } from 'vitest';
import {
  firstNight, nextNight, cardWon, isLastAttempt, cardVerdict, dunkOffVerdict, dunkOffDecide, dunkOffCriteria, dunkOffRuleLine, dunkOffByLine,
  DUNK_OFF_CAP, DUNK_OFF_TIEBREAK_FROM, type NightState, type DunkOffCard,
} from './ContinuousNight';
import { emptyCard, addAttempt, nightReport, type DunkCard } from '@/lib/mp/dunkCard';

// A night that has actually been played: scores on the board, a rival ahead, a
// chain banked, sitting on the last attempt of the last round.
const PLAYED: NightState = {
  night: 3, round: 2, dunkInRound: 1,
  playerTotal: 171, rivalTotal: 188, makes: 3, misses: 1, bestChain: 2,
};

describe('ContinuousNight — the GO AGAIN ledger (TRY-ONBOARD G1 / BUG-001)', () => {
  it('opens on night 1 with nothing on the board', () => {
    expect(firstNight()).toEqual({
      night: 1, round: 1, dunkInRound: 0, playerTotal: 0, rivalTotal: 0, makes: 0, misses: 0, bestChain: 0,
    });
  });

  it('GO AGAIN carries the night number and NOTHING else', () => {
    const n = nextNight(PLAYED);
    expect(n.night).toBe(4);
    // every field a contest scores is back to the opening ledger
    const { night: _drop, ...scored } = n;
    const { night: _drop2, ...fresh } = firstNight();
    expect(scored).toEqual(fresh);
  });

  it('a rival total never survives into the next night', () => {
    // the failure this shape exists to prevent: night 2 opening 188 down on a
    // deficit the guest never played for
    expect(nextNight(PLAYED).rivalTotal).toBe(0);
    expect(nextNight(PLAYED).playerTotal).toBe(0);
  });

  it('is pure — the caller is destructuring the result, not being mutated', () => {
    const before = { ...PLAYED };
    nextNight(PLAYED);
    expect(PLAYED).toEqual(before);
  });

  it('nights climb without bound — the run ends when the player quits, not on a counter', () => {
    let s = firstNight();
    for (let i = 0; i < 25; i++) s = nextNight({ ...s, playerTotal: 40, rivalTotal: 41, misses: 2 });
    expect(s.night).toBe(26);
    expect(s.misses).toBe(0);
  });

  it('the card goes to the player on a tie', () => {
    expect(cardWon({ playerTotal: 170, rivalTotal: 169 })).toBe(true);
    expect(cardWon({ playerTotal: 170, rivalTotal: 170 })).toBe(true);
    expect(cardWon({ playerTotal: 169, rivalTotal: 170 })).toBe(false);
  });

  it('knows the attempt the card is waiting on (2 rounds x 2 dunks)', () => {
    const at = (round: number, dunkInRound: number) => isLastAttempt({ ...firstNight(), round, dunkInRound }, 2, 2);
    expect(at(1, 0)).toBe(false);
    expect(at(1, 1)).toBe(false);
    expect(at(2, 0)).toBe(false);
    expect(at(2, 1)).toBe(true);
  });
});

// HOTFIX (2026-09-24): the card is part of the night. DunkMode keeps the card beside the ledger: a player attempt
// moves the score and the card together, and GO AGAIN has to open a fresh card when nextNight() zeroes the score.
// It didn't, so night 2 reported both nights. This plays nights the way the mode books them, with the real card.
describe('ContinuousNight — the card closes with the night', () => {
  type Night = { s: NightState; card: DunkCard };
  // one player attempt, booked the way DunkMode's make and miss paths book it
  const book = ({ s, card }: Night, total: number): Night => {
    const made = total >= 40;
    return {
      s: { ...s, playerTotal: s.playerTotal + total, makes: s.makes + (made ? 1 : 0), misses: s.misses + (made ? 0 : 1) },
      card: addAttempt(card, {
        round: s.round, style: 'POWER', prop: 'NO PROP', finish: made ? 'dunk_windmill' : '', label: made ? 'WINDMILL' : 'BLOWN',
        judges: [], total, made,
      }),
    };
  };
  const play = (n: Night, totals: number[]): Night => totals.reduce(book, n);
  const NIGHT_1 = [44, 51, 31, 58];   // 184, best 58, one off the iron
  const NIGHT_2 = [47, 49, 42, 55];   // 193, best 55

  it('every night the card adds up to the score that night reports', () => {
    let n = play({ s: firstNight(), card: emptyCard() }, NIGHT_1);
    expect(n.card.total).toBe(n.s.playerTotal);
    n = { s: nextNight(n.s), card: emptyCard() };   // GO AGAIN, as DunkMode.goAgain does it
    n = play(n, NIGHT_2);
    expect(n.s.night).toBe(2);
    expect(n.card.total).toBe(n.s.playerTotal);
    expect(n.card.attempts.map((a) => a.total)).toEqual(NIGHT_2);
    expect(nightReport(n.card).headline).toBe('YOUR NIGHT: 193 · BEST 55');
    expect(nightReport(n.card).lines).toContain('4 down, 0 off the iron');
  });

  it('the card never closes a night by itself: kept across GO AGAIN it reports both nights (the bug)', () => {
    let n = play({ s: firstNight(), card: emptyCard() }, NIGHT_1);
    n = { ...n, s: nextNight(n.s) };   // the score reset, the card did not
    n = play(n, NIGHT_2);
    expect(n.s.playerTotal).toBe(193);
    expect(n.card.total).toBe(377);
    // night 1's best dunk and night 1's miss, on night 2's card
    expect(nightReport(n.card).headline).toBe('YOUR NIGHT: 377 · BEST 58');
    expect(nightReport(n.card).lines).toContain('7 down, 1 off the iron');
  });
});

// dunk-next phase 3 — the dunk-off: a tied card is settled by dunks, not by a rule nobody saw.

describe('the dunk-off (dunk-next phase 3)', () => {
  it('the card after the final is a win, a loss, or a TIE — and only an exact tie is a tie', () => {
    expect(cardVerdict({ playerTotal: 170, rivalTotal: 169 })).toBe('won');
    expect(cardVerdict({ playerTotal: 169, rivalTotal: 170 })).toBe('lost');
    expect(cardVerdict({ playerTotal: 170, rivalTotal: 170 })).toBe('tied');
  });
  it('a dunk-off is decided by its two cards', () => {
    expect(dunkOffVerdict(44, 41, 1)).toBe('won');
    expect(dunkOffVerdict(38, 41, 1)).toBe('lost');
  });
  // test changed (owner decision 2026-10-06, "Endless dunk-offs"): these pinned "up to DUNK_OFF_MAX = 3, then the player wins".
  // The owner replaced that rule: a tied final keeps going until somebody wins, the judges' declared tiebreak makes each further
  // dunk-off less likely to tie, and a hard cap (settled on the night's best dunk, then the house rule) guards the loop.
  it('tied, they go again — a level total is never a result before the tiebreak starts', () => {
    for (let n = 1; n < DUNK_OFF_TIEBREAK_FROM; n++) expect(dunkOffVerdict(40, 40, n)).toBe('again');
    const a: DunkOffCard = { total: 40, execution: 9, difficulty: 5, style: 5 }, b: DunkOffCard = { total: 40, execution: 6, difficulty: 9, style: 9 };
    expect(dunkOffVerdict(a, b, DUNK_OFF_TIEBREAK_FROM - 1)).toBe('again');   // the criteria are not read before their dunk-off
  });
  it('a tie is no longer the player\'s: a level dunk-off past the old limit of 3 still goes again', () => {
    for (let n = 1; n < DUNK_OFF_CAP; n++) expect(dunkOffVerdict(40, 40, n)).toBe('again');
    const lvl: DunkOffCard = { total: 31, execution: 0, difficulty: 3.6, style: 0.7 };
    expect(dunkOffVerdict(lvl, { ...lvl }, 4)).toBe('again');
  });
  it('from DUNK_OFF_TIEBREAK_FROM, level totals go to EXECUTION, then DIFFICULTY, then STYLE — one more criterion each dunk-off', () => {
    expect(DUNK_OFF_TIEBREAK_FROM).toBe(3);
    expect(dunkOffCriteria(2)).toEqual([]);
    expect(dunkOffCriteria(3)).toEqual(['execution']);
    expect(dunkOffCriteria(4)).toEqual(['execution', 'difficulty']);
    expect(dunkOffCriteria(5)).toEqual(['execution', 'difficulty', 'style']);
    expect(dunkOffCriteria(11)).toEqual(['execution', 'difficulty', 'style']);
    const p: DunkOffCard = { total: 42, execution: 8.4, difficulty: 6, style: 7 };
    const r: DunkOffCard = { total: 42, execution: 7.9, difficulty: 9, style: 9 };
    expect(dunkOffDecide(p, r, 3)).toEqual({ verdict: 'won', by: 'execution' });
    expect(dunkOffDecide(r, p, 3)).toEqual({ verdict: 'lost', by: 'execution' });
    const q: DunkOffCard = { ...p, difficulty: 6.5 };
    expect(dunkOffDecide({ ...p }, q, 3).verdict).toBe('again');            // execution level, difficulty not yet a criterion
    expect(dunkOffDecide({ ...p }, q, 4)).toEqual({ verdict: 'lost', by: 'difficulty' });
    expect(dunkOffDecide({ ...p }, { ...p, style: 6.9 }, 4).verdict).toBe('again');
    expect(dunkOffDecide({ ...p }, { ...p, style: 6.9 }, 5)).toEqual({ verdict: 'won', by: 'style' });
  });
  it('the judges read their numbers to a tenth — noise below that is level', () => {
    const p: DunkOffCard = { total: 40, execution: 8.42, difficulty: 6, style: 7 };
    expect(dunkOffDecide(p, { ...p, execution: 8.38 }, 3).verdict).toBe('again');
    expect(dunkOffDecide(p, { ...p, execution: 8.3 }, 3).verdict).toBe('won');
  });
  it('the total always comes first, whatever the criteria say', () => {
    expect(dunkOffDecide({ total: 41, execution: 0, difficulty: 0, style: 0 }, { total: 40, execution: 10, difficulty: 10, style: 10 }, 5)).toEqual({ verdict: 'won', by: 'total' });
  });
  it('the HARD CAP ends the night: dead level at DUNK_OFF_CAP goes to the best dunk of the night, then the house rule', () => {
    expect(DUNK_OFF_CAP).toBeGreaterThan(DUNK_OFF_TIEBREAK_FROM + 2);
    expect(DUNK_OFF_CAP).toBeLessThanOrEqual(20);
    const lvl: DunkOffCard = { total: 31, execution: 0, difficulty: 3, style: 1 };
    expect(dunkOffDecide(lvl, lvl, DUNK_OFF_CAP, { player: 44, rival: 47 })).toEqual({ verdict: 'lost', by: 'nightBest' });
    expect(dunkOffDecide(lvl, lvl, DUNK_OFF_CAP, { player: 48, rival: 47 })).toEqual({ verdict: 'won', by: 'nightBest' });
    expect(dunkOffDecide(lvl, lvl, DUNK_OFF_CAP, { player: 47, rival: 47 })).toEqual({ verdict: cardWon({ playerTotal: 1, rivalTotal: 1 }) ? 'won' : 'lost', by: 'house' });
    expect(dunkOffDecide(lvl, lvl, DUNK_OFF_CAP)).toEqual({ verdict: 'won', by: 'house' });
    expect(dunkOffDecide(lvl, lvl, DUNK_OFF_CAP - 1, { player: 48, rival: 40 }).verdict).toBe('again');   // the night's best is read ONLY at the cap
  });
  it('no counter can loop it: past the cap, or a broken (NaN / Infinity) count, always ends', () => {
    for (const n of [DUNK_OFF_CAP, DUNK_OFF_CAP + 1, 1e9, NaN, Infinity]) expect(dunkOffVerdict(40, 40, n)).not.toBe('again');
    // a walk of always-level dunk-offs terminates at the cap, exactly
    let n = 1;
    while (dunkOffVerdict(40, 40, n) === 'again' && n < 10_000) n++;   // (bounded, so a broken cap fails here instead of hanging)
    expect(n).toBe(DUNK_OFF_CAP);
  });
  it('the HUD names the declared criterion before the dunk, and the banner says how it was taken', () => {
    expect(dunkOffRuleLine(1)).toBe('');
    expect(dunkOffRuleLine(3)).toBe('LEVEL CARDS GO TO EXECUTION');
    expect(dunkOffRuleLine(5)).toBe('LEVEL CARDS GO TO EXECUTION, THEN DIFFICULTY, THEN STYLE');
    expect(dunkOffByLine('total')).toBe('');
    expect(dunkOffByLine('execution')).toBe('LEVEL — TAKEN ON EXECUTION');
    expect(dunkOffByLine('nightBest')).toMatch(/BEST DUNK OF THE NIGHT/);
  });
});
