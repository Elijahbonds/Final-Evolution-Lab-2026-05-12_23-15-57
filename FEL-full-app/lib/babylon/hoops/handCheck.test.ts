// lane/hoops-round2 HOP-04: hand-checks — a touch per arrival, too many inside the window is the Ref's HAND-CHECK.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HandCheckCounter, handCheckTune, HAND_CHECK_FOUL_COUNT, HAND_CHECK_GAP_SEC, HAND_CHECK_REACH_OVER_M, HAND_CHECK_WINDOW_SEC, RELEASE_OVER_M } from './handCheck';
import { BODY_STANDOFF } from '../core/BasketballCore';
import { judge, rule } from '../core/Ref';
import { openFeel, closeFeel } from '@/tests/helpers/feelOverrides';

afterEach(() => closeFeel());
const REACH = BODY_STANDOFF + HAND_CHECK_REACH_OVER_M;
const dt = 1 / 60;
/** Run `sec` at a gap, return the steps. */
const run = (c: HandCheckCounter, sec: number, gap: number, onBall = true) => { const out = []; for (let i = 0; i < Math.round(sec / dt); i++) out.push(c.step(dt, gap, onBall)); return out; };

describe('HandCheckCounter', () => {
  it('the reach is anchored to the rules\' hard gap', () => {
    expect(handCheckTune().reachM).toBeCloseTo(BODY_STANDOFF + HAND_CHECK_REACH_OVER_M, 9);
  });
  it('staying on the hip is ONE touch, however long', () => {
    const c = new HandCheckCounter();
    const s = run(c, 8, REACH - 0.05);
    expect(s.filter((x) => x.touch).length).toBe(1);
    expect(s.some((x) => x.foul)).toBe(false);
    expect(s[s.length - 1].contactK).toBe(1);
  });
  it('re-hitting him: the 4th touch inside 5 s is the foul, and the window starts over', () => {
    const c = new HandCheckCounter(); let fouls = 0, touches = 0;
    for (let i = 0; i < HAND_CHECK_FOUL_COUNT; i++) {
      const on = run(c, 0.3, REACH - 0.05); const off = run(c, HAND_CHECK_GAP_SEC + 0.1, REACH + RELEASE_OVER_M + 0.2);
      touches += on.filter((x) => x.touch).length; fouls += [...on, ...off].filter((x) => x.foul).length;
    }
    expect(touches).toBe(HAND_CHECK_FOUL_COUNT); expect(fouls).toBe(1);
    expect(c.step(dt, REACH + 1, true).count).toBe(0);
  });
  it('touches spread wider than the window never foul', () => {
    const c = new HandCheckCounter(); let fouls = 0;
    const apart = HAND_CHECK_WINDOW_SEC / (HAND_CHECK_FOUL_COUNT - 1) + 0.1;
    for (let i = 0; i < 12; i++) { fouls += run(c, 0.2, REACH - 0.05).filter((x) => x.foul).length; fouls += run(c, apart - 0.2, REACH + 0.5).filter((x) => x.foul).length; }
    expect(fouls).toBe(0);
  });
  it('a gap hovering at the reach is one touch (hysteresis), and a hand off for less than the gap does not re-count', () => {
    const c = new HandCheckCounter(); let touches = 0;
    for (let i = 0; i < 60; i++) touches += c.step(dt, REACH + (i % 2 ? 0.05 : -0.05), true).touch ? 1 : 0;
    expect(touches).toBe(1);
    const c2 = new HandCheckCounter(); touches = 0;
    for (let i = 0; i < 6; i++) { touches += run(c2, 0.2, REACH - 0.05).filter((x) => x.touch).length; touches += run(c2, HAND_CHECK_GAP_SEC - 0.1, REACH + 0.5).filter((x) => x.touch).length; }
    expect(touches).toBe(1);
  });
  it('only on the ball, only when on — and the A/B off counts nothing and draws nothing', () => {
    const c = new HandCheckCounter();
    expect(run(c, 1, REACH - 0.1, false).some((x) => x.touching || x.contactK > 0)).toBe(false);
    openFeel({ 'hoops.handCheckOn': 0 });
    const c2 = new HandCheckCounter();
    expect(run(c2, 1, REACH - 0.1).some((x) => x.touching || x.contactK > 0)).toBe(false);
  });
  it('the pose eases in and out', () => {
    const c = new HandCheckCounter();
    const a = c.step(dt, REACH - 0.1, true).contactK;
    expect(a).toBeGreaterThan(0); expect(a).toBeLessThan(1);
    run(c, 0.5, REACH - 0.1); expect(c.contactK).toBe(1);
    const b = c.step(dt, REACH + 1, true).contactK; expect(b).toBeLessThan(1); expect(b).toBeGreaterThan(0);
  });
});

describe('the Ref\'s HAND-CHECK', () => {
  it('is in the handbook: the handler\'s team keeps it, dead ball, no shots', () => {
    expect(rule('hand_check').call).toBe('HAND-CHECK');
    expect(judge('hand_check', { offense: 'me', fouled: 'me' }).ball).toBe('me');
    expect(judge('hand_check', { offense: 'foe', fouled: 'foe' }).ball).toBe('foe');
    expect(rule('hand_check').shots).toBe(0);
  });
});

describe('the modes count it and draw it', () => {
  const one = readFileSync(join(__dirname, '../modes/OneVOneMode.ts'), 'utf8');
  const three = readFileSync(join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');
  for (const [name, src] of [['1v1', one], ['3v3', three]] as const) {
    it(`${name}: a HandCheckPlay (a counter per side), the Ref's hand_check on a foul, the contact poses mounted`, () => {
      expect(src).toMatch(/new HandCheckPlay<SpawnedCharacter>\(\)/);
      expect(src).toMatch(/judge\('hand_check'/);
      expect(src).toMatch(/mountContactPoses\(/);
    });
  }
});
