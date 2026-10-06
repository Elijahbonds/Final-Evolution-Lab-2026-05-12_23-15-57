// IMPROVE (2026-10-06): the 3-Point Contest's owner-picked items — the pure rules (threePointRules) and the draws that read them.
import { describe, expect, it } from 'vitest';
import {
  NEXT_UP_SEC, FLIGHT_POOL, NO_MONEY_RACK, moneyBall, perfectRun, MONEY_RACK_RIVAL_BONUS, rivalCentre, projectedCut, EMPTY_PIPS,
  pipFor, pushPip, formTag, FORM_HOT, FORM_COLD, canSkipStandings, SKIP_ARM_SEC, optionsOffered, runOptions, TP_RACKS,
} from './threePointRules';
import { simulateRival, resolveRound, type Shooter } from './ThreePointMode';

describe('#1 next ball up at release', () => {
  it('the next ball comes off the rack well before the old wait (net exit 0.55 s / rim out 0.85 s after a ~0.8 s flight)', () => {
    expect(NEXT_UP_SEC).toBeGreaterThan(0.2);    // the follow-through stays on screen
    expect(NEXT_UP_SEC).toBeLessThan(0.55);
    expect(FLIGHT_POOL).toBeGreaterThanOrEqual(2);   // a ball lands while the next one is in the air
  });
});

describe('#5 the money-ball rack', () => {
  it('without a pick, only the last ball of a rack is the money ball (the 2009 format)', () => {
    for (let r = 0; r < 5; r++) for (let b = 0; b < 5; b++) expect(moneyBall(r, b)).toBe(b === 4);
    expect(perfectRun()).toBe(30);
  });
  it('the picked rack is all money; the others are unchanged; a perfect run is 34', () => {
    for (let pick = 0; pick < TP_RACKS; pick++) {
      for (let r = 0; r < 5; r++) for (let b = 0; b < 5; b++) expect(moneyBall(r, b, pick)).toBe(b === 4 || r === pick);
      expect(perfectRun(pick)).toBe(34);
    }
    expect(perfectRun(NO_MONEY_RACK)).toBe(30);
  });
  it('the rival centre is the shipped one without a money rack, and moves up by the bonus with one', () => {
    for (const s of [0, 0.25, 0.5, 0.95, 1]) {
      expect(rivalCentre(s, 'qualifying')).toBeCloseTo(12.5 + s * 5, 9);
      expect(rivalCentre(s, 'final')).toBeCloseTo(14 + s * 5, 9);
      expect(rivalCentre(s, 'final', true) - rivalCentre(s, 'final')).toBe(MONEY_RACK_RIVAL_BONUS);
    }
  });
  it('simulateRival: 3..30 without a money rack, 3..34 with one, the mean shifted by about the bonus', () => {
    const n = 4000;
    let plain = 0, money = 0;
    for (let i = 0; i < n; i++) {
      const a = simulateRival(0.6, 'qualifying'), b = simulateRival(0.6, 'qualifying', true);
      expect(a).toBeGreaterThanOrEqual(3); expect(a).toBeLessThanOrEqual(30);
      expect(b).toBeGreaterThanOrEqual(3); expect(b).toBeLessThanOrEqual(34);
      plain += a; money += b;
    }
    expect(money / n - plain / n).toBeGreaterThan(MONEY_RACK_RIVAL_BONUS - 0.5);
    expect(money / n - plain / n).toBeLessThan(MONEY_RACK_RIVAL_BONUS + 0.5);
  });
});

describe('#3 the projected qualifying cut', () => {
  it('is the third-best rival expectation, rounded', () => {
    const skills = [0.9, 0.2, 0.5, 0.7, 0.3];   // centres 17, 13.5, 15, 16, 14
    expect(projectedCut(skills)).toBe(Math.round(12.5 + 0.5 * 5));   // the 3rd best: 15
    expect(projectedCut(skills, true)).toBe(Math.round(12.5 + 0.5 * 5 + MONEY_RACK_RIVAL_BONUS));
    expect(projectedCut([])).toBe(0);
    expect(projectedCut([0.5])).toBe(15);   // fewer rivals than places: the last of them
  });
  it('a tie with the cut advances (the board keeps the player ahead of a rival on the same score)', () => {
    const skills = [0.9, 0.2, 0.5, 0.7, 0.3];
    const cut = projectedCut(skills);
    const names = ['A', 'B', 'C', 'D', 'E'];
    const exp = skills.map((s) => Math.round(rivalCentre(s, 'qualifying')));
    const field: Shooter[] = [{ name: 'YOU', score: cut, isPlayer: true, shot: true }, ...names.map((name, i) => ({ name, score: exp[i], isPlayer: false, shot: true }))];
    expect(resolveRound(field, 'qualifying').advances).toBe(true);
    field[0].score = cut - 1;
    expect(resolveRound(field, 'qualifying').advances).toBe(false);
  });
});

describe('#4 release-history pips', () => {
  it('one character a ball, by the release grade', () => {
    expect(EMPTY_PIPS).toHaveLength(25);
    expect([pipFor('early'), pipFor('good'), pipFor('perfect'), pipFor('late'), pipFor('brick'), pipFor('held')]).toEqual(['E', 'G', 'P', 'L', 'L', 'G']);
    let p = pushPip(EMPTY_PIPS, 0, 0, 'early');
    p = pushPip(p, 0, 4, 'perfect');
    p = pushPip(p, 4, 4, 'late');
    expect(p[0]).toBe('E'); expect(p[4]).toBe('P'); expect(p[24]).toBe('L');
    expect(p.replace(/\./g, '')).toBe('EPL');
    expect(pushPip(p, 5, 0, 'good')).toBe(p);   // past the last rack: unchanged
  });
});

describe('#7 rival form', () => {
  it('HOT at the top of the skill band, COLD at the bottom, nothing between (or for the player)', () => {
    expect(formTag(0.95)).toBe('HOT'); expect(formTag(FORM_HOT)).toBe('HOT');
    expect(formTag(0.25)).toBe('COLD'); expect(formTag(FORM_COLD - 0.001)).toBe('COLD');
    expect(formTag(0.6)).toBe('');
    expect(formTag(undefined)).toBe('');
  });
});

describe('#2 skip the standings', () => {
  it('a press skips only once the board has been up a moment (the run\'s own last press never does)', () => {
    expect(canSkipStandings(0)).toBe(false);
    expect(canSkipStandings(SKIP_ARM_SEC - 0.01)).toBe(false);
    expect(canSkipStandings(SKIP_ARM_SEC)).toBe(true);
  });
});

describe('#5 #6 the READY options are never offered on a staked or head-to-head run', () => {
  it('optionsOffered / runOptions', () => {
    expect(optionsOffered('')).toBe(true);
    expect(optionsOffered('?court=venice')).toBe(true);
    for (const q of ['?arena=abc', '?mp=1', '?c=xyz', '?court=a&arena=1']) {
      expect(optionsOffered(q)).toBe(false);
      expect(runOptions(q, { practice: true, moneyRack: 2 })).toEqual({ practice: false, moneyRack: NO_MONEY_RACK });
    }
    expect(runOptions('', { practice: true, moneyRack: 2 })).toEqual({ practice: true, moneyRack: 2 });
    expect(runOptions('', { practice: false, moneyRack: 9 })).toEqual({ practice: false, moneyRack: NO_MONEY_RACK });
  });
});
