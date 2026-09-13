// Is standing still with the ball a THREAT, or is it just standing still?
//
// Triple threat was the one piece of the hoops vocabulary that did not exist at all. These tests are
// written against what the stance is supposed to buy the player: a defender who has to respect three
// things, and a jab that finds out which one he is guessing — and that he stops buying if you overuse it.

import { describe, it, expect } from 'vitest';
import {
  THREAT_EXITS, THREAT_IDLE, THREAT_SPEED_MAX, JAB_RANGE, JAB_MAX_HOLD_SEC, JAB_WINDOW_SEC,
  inTripleThreat, jabBiteOdds, tickThreat, canJab, throwJab, isJabInput, jabBurst,
} from './TripleThreat';

const read = (over: Partial<Parameters<typeof inTripleThreat>[0]> = {}) => ({
  carrying: true, speed01: 0, busy: false, posting: false, ...over,
});

describe('the stance', () => {
  it('standing still with the ball IS the stance', () => {
    expect(inTripleThreat(read())).toBe(true);
  });

  it('moving is not threatening, it is driving', () => {
    expect(inTripleThreat(read({ speed01: THREAT_SPEED_MAX + 0.1 }))).toBe(false);
  });

  it('without the ball there is nothing to threaten with', () => {
    expect(inTripleThreat(read({ carrying: false }))).toBe(false);
  });

  it('mid-shot or mid-finish the stance is over', () => {
    expect(inTripleThreat(read({ busy: true }))).toBe(false);
  });

  it('a back-to-the-basket seal is the POST, not triple threat — a different stance', () => {
    expect(inTripleThreat(read({ posting: true }))).toBe(false);
  });

  it('all three threats are live at once — that is the name', () => {
    expect(THREAT_EXITS).toContain('shoot');
    expect(THREAT_EXITS).toContain('drive');
    expect(THREAT_EXITS).toContain('jab');
  });
});

describe('a jab is a tap, a drive is a lean — the same direction', () => {
  it('a quick flick is a jab', () => {
    expect(isJabInput(0.1, 0.8)).toBe(true);
  });

  it('leaning on it is a drive, not a jab', () => {
    expect(isJabInput(JAB_MAX_HOLD_SEC + 0.2, 0.8)).toBe(false);
  });

  it('a feather touch is neither', () => {
    expect(isJabInput(0.1, 0.2)).toBe(false);
  });

  it('the ambiguity is deliberate: one input, and the HOLD decides which lie you told', () => {
    expect(isJabInput(0.05, 0.9)).not.toBe(isJabInput(0.5, 0.9));
  });
});

describe('does he bite?', () => {
  const jab = (over: Partial<Parameters<typeof jabBiteOdds>[0]> = {}) => jabBiteOdds({
    defenderDist: 1.6, defenderClosing: false, defenderSet: false, handle: 50, shownThisPossession: 0, ...over,
  });

  it('a defender too far away cannot be moved by a lie', () => {
    expect(jab({ defenderDist: JAB_RANGE + 1 })).toBe(0);
  });

  it('a SET defender barely bites — sitting down has to work', () => {
    expect(jab({ defenderSet: true })).toBeLessThan(0.1);
  });

  it('a CLOSING defender bites hardest — a moving body is the one a lie moves further', () => {
    expect(jab({ defenderClosing: true })).toBeGreaterThan(jab({ defenderClosing: false }));
  });

  it('a better handle sells it better', () => {
    expect(jab({ handle: 100 })).toBeGreaterThan(jab({ handle: 20 }));
  });

  it('HE LEARNS: every jab you have already shown him is worth less than the last', () => {
    const first = jab({ shownThisPossession: 0, defenderClosing: true });
    const fourth = jab({ shownThisPossession: 3, defenderClosing: true });
    expect(fourth).toBeLessThan(first * 0.3);
  });

  it('which is what stops the jab being a free button', () => {
    let prev = Infinity;
    for (let n = 0; n < 5; n++) {
      const o = jab({ shownThisPossession: n, defenderClosing: true });
      expect(o).toBeLessThan(prev);
      prev = o;
    }
  });

  it('he never bites every time, however good you are', () => {
    expect(jab({ handle: 100, defenderClosing: true })).toBeLessThan(1);
  });
});

describe('what a bitten jab buys', () => {
  it('a bought jab opens a window; a refused one buys nothing', () => {
    expect(throwJab(THREAT_IDLE, true).advantage).toBeCloseTo(JAB_WINDOW_SEC, 5);
    expect(throwJab(THREAT_IDLE, false).advantage).toBe(0);
  });

  it('the advantage is a faster first step — something you feel, not a HUD number', () => {
    expect(jabBurst(throwJab(THREAT_IDLE, true))).toBeGreaterThan(1);
    expect(jabBurst(throwJab(THREAT_IDLE, false))).toBe(1);
  });

  it('the window closes on its own', () => {
    let s = throwJab(THREAT_IDLE, true);
    for (let i = 0; i < 60; i++) s = tickThreat(s, 1 / 60);
    expect(s.advantage).toBe(0);
    expect(jabBurst(s)).toBe(1);
  });

  it('a jab cannot re-fire immediately — a spammable jab is a twitch, not a lie', () => {
    const s = throwJab(THREAT_IDLE, true);
    expect(canJab(s)).toBe(false);
  });

  it('but the cooldown does expire', () => {
    let s = throwJab(THREAT_IDLE, false);
    for (let i = 0; i < 60; i++) s = tickThreat(s, 1 / 60);
    expect(canJab(s)).toBe(true);
  });

  it('every jab counts toward him learning, bought or not — you showed it either way', () => {
    const a = throwJab(THREAT_IDLE, false);
    const b = throwJab(a, true);
    expect(b.shown).toBe(2);
  });
});
