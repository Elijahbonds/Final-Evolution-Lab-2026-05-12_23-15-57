// IMPROVE (2026-10-06) — the 3v3's pure rules (threevthreeRules / threevthreeBox): the tier knobs, the swing's reads, what a rival
// release is worth and how often it falls, the hint, the pass preview's words, the box line and the level of detail.
import { describe, it, expect } from 'vitest';
import { contestedPct } from '../core/HoopsDefense';
import { rivalShotPct } from '../core/BasketballCore';
import {
  THREEV_TIER, tierForRun, cutOff, laneClear, openness, kickTarget, catchAndShoot, KICK_OPEN_M, SHOOT_OPEN_M, SHOOT_MIN_RIM_M,
  rivalPoints, goaltendAward, rivalReleasePct, passPreviewLabel, hintFor, lodFor, LOD_FAR_IN_M, LOD_FAR_OUT_M, type HintState,
} from './threevthreeRules';
import { boxLine, emptyBox } from './threevthreeBox';
import { hintSwap, HINT_PAINT } from './onevoneRules';

describe('#3 the OPPONENT pick', () => {
  it('PRO is the game as it shipped (poke 0.55, layup 0.62, jumper 0.5); ROOKIE is softer and ELITE harder on every knob', () => {
    expect(THREEV_TIER.pro).toMatchObject({ defenderAggression: 0.55, layupPct: 0.62, jumperPct: 0.5, pullUpDelta: 0 });
    for (const k of ['defenderAggression', 'layupPct', 'jumperPct', 'pullUpDelta', 'kickChance', 'catchShoot'] as const) {
      expect(THREEV_TIER.rookie[k], k).toBeLessThan(THREEV_TIER.pro[k]);
      expect(THREEV_TIER.elite[k], k).toBeGreaterThan(THREEV_TIER.pro[k]);
    }
    expect(THREEV_TIER.rookie.maxPasses).toBeLessThanOrEqual(THREEV_TIER.elite.maxPasses);
  });
  it('a staked or head-to-head run always plays PRO; a plain run plays the pick', () => {
    expect(tierForRun('', 'elite')).toBe('elite');
    expect(tierForRun('?court=open', 'rookie')).toBe('rookie');
    for (const q of ['?arena=abc', '?mp=room1', '?c=xyz']) expect(tierForRun(q, 'rookie'), q).toBe('pro');
  });
});

describe('#1 the swing', () => {
  const dir = { x: 0, z: -1 };   // driving at the rim (−z)
  it('cut off: a body on his line ahead of him; beside him, behind him or far ahead is not', () => {
    expect(cutOff({ x: 0, z: 6 }, dir, [{ x: 0.4, z: 4.6 }])).toBe(true);
    expect(cutOff({ x: 0, z: 6 }, dir, [{ x: 2, z: 4.6 }])).toBe(false);    // beside the line
    expect(cutOff({ x: 0, z: 6 }, dir, [{ x: 0, z: 7 }])).toBe(false);      // behind him
    expect(cutOff({ x: 0, z: 6 }, dir, [{ x: 0, z: 2 }])).toBe(false);      // 4 m ahead: room to attack
  });
  it('the lane is clear unless a body stands on the line between them (the ends are not the lane)', () => {
    expect(laneClear({ x: 0, z: 0 }, { x: 6, z: 0 }, [{ x: 3, z: 0.3 }])).toBe(false);
    expect(laneClear({ x: 0, z: 0 }, { x: 6, z: 0 }, [{ x: 3, z: 1.5 }])).toBe(true);
    expect(laneClear({ x: 0, z: 0 }, { x: 6, z: 0 }, [{ x: 0.2, z: 0.1 }, { x: 5.8, z: 0.1 }])).toBe(true);
  });
  it('the target is the MOST open mate with a lane, open past KICK_OPEN_M — else nobody', () => {
    const passer = { x: 0, z: 5 };
    const mates = [{ x: -5, z: 4 }, { x: 5, z: 4 }];
    const defs = [{ x: 0, z: 3.8 }, { x: -4.2, z: 3.6 }, { x: 3, z: 1 }];
    expect(openness(mates[0], defs)).toBeLessThan(KICK_OPEN_M);
    expect(kickTarget(passer, mates, defs)).toBe(1);
    expect(kickTarget(passer, mates, [...defs, { x: 2.5, z: 4.5 }])).toBe(-1);   // his lane covered, the other man guarded
    expect(kickTarget(passer, [{ x: 1, z: 5 }], [])).toBe(-1);                   // a hand-off is not a swing
  });
  it('catch-and-shoot only open, out there, on the roll', () => {
    const k = THREEV_TIER.pro;
    expect(catchAndShoot(SHOOT_OPEN_M + 1, SHOOT_MIN_RIM_M + 2, k, 0)).toBe(true);
    expect(catchAndShoot(SHOOT_OPEN_M - 0.1, SHOOT_MIN_RIM_M + 2, k, 0)).toBe(false);
    expect(catchAndShoot(SHOOT_OPEN_M + 1, SHOOT_MIN_RIM_M - 0.1, k, 0)).toBe(false);
    expect(catchAndShoot(SHOOT_OPEN_M + 1, SHOOT_MIN_RIM_M + 2, k, k.catchShoot)).toBe(false);
  });
});

describe('#2 what a rival release is worth, and how often it falls', () => {
  it('a jumper past the arc is three; a dunk and a layup are always two', () => {
    expect(rivalPoints('jumper', true)).toBe(3);
    expect(rivalPoints('jumper', false)).toBe(2);
    expect(rivalPoints('layup', true)).toBe(2);
    expect(rivalPoints('dunk', true)).toBe(2);
  });
  it('a goaltend on their shot counts the shot once, at what it was worth', () => {
    expect(goaltendAward(false, 3)).toBe(3);
    expect(goaltendAward(false, 2)).toBe(2);
    expect(goaltendAward(true, 3)).toBe(0);
  });
  it('at PRO the end of a drive is exactly the shipped formula', () => {
    for (const [style, base] of [['layup', 0.62], ['jumper', 0.5]] as const) {
      for (const df of [0, 0.3, 0.9]) for (const g of [0, 0.4]) for (const m of [0.3, 1, 1.4]) {
        const shipped = contestedPct(base - Math.min(0.5, df * 0.3), g) / Math.max(0.5, m);
        expect(rivalReleasePct({ style, pullUp: false, distToRim: 1, defenseFactor: df, ground: g, mistake: m }, THREEV_TIER.pro)).toBeCloseTo(shipped, 12);
      }
    }
  });
  it('a catch-and-shoot reads the distance (the mates\' curve), plus the tier', () => {
    const at = (d: number, tier: keyof typeof THREEV_TIER) => rivalReleasePct({ style: 'jumper', pullUp: true, distToRim: d, defenseFactor: 0.2, ground: 0, mistake: 1 }, THREEV_TIER[tier]);
    expect(at(7.2, 'pro')).toBeCloseTo(rivalShotPct(7.2, 0.2, 'jumper'), 12);
    expect(at(7.2, 'pro')).toBeLessThan(at(5, 'pro'));
    expect(at(7.2, 'rookie')).toBeLessThan(at(7.2, 'pro'));
    expect(at(7.2, 'elite')).toBeGreaterThan(at(7.2, 'pro'));
  });
});

describe('#5 #7 the words', () => {
  it('the pass preview names the pass, or the covered lane', () => {
    expect(passPreviewLabel(null)).toBe('NO LANE');
    expect(passPreviewLabel('chest')).toBe('CHEST PASS');
    expect(passPreviewLabel('bounce')).toBe('BOUNCE PASS');
    expect(passPreviewLabel('lob')).toMatch(/ALLEY-OOP/);
  });
  const base: HintState = { defence: false, board: false, shotUp: false, theirPass: false, gathering: false, paintWarn: false, dunking: false, showtime: false, shooting: false, carrying: true, mateHasBall: false, posting: false, nearRim: false, set: false };
  it('one short line for the state; the urgent ones swap in at once (the 1v1\'s dwell)', () => {
    const lines = [
      hintFor(base), hintFor({ ...base, set: true }), hintFor({ ...base, nearRim: true }), hintFor({ ...base, posting: true }),
      hintFor({ ...base, carrying: false, mateHasBall: true }), hintFor({ ...base, defence: true, carrying: false }),
      hintFor({ ...base, defence: true, carrying: false, theirPass: true }), hintFor({ ...base, defence: true, carrying: false, gathering: true }),
    ];
    for (const l of lines) { expect(l.length).toBeGreaterThan(10); expect(l.length).toBeLessThan(90); }
    expect(new Set(lines).size).toBe(lines.length);
    expect(hintFor({ ...base, paintWarn: true })).toBe(HINT_PAINT);
    expect(hintFor({ ...base, dunking: true })).toBe('');
    // urgent: swap even inside the dwell
    for (const s of [{ ...base, paintWarn: true }, { ...base, shooting: true }, { ...base, dunking: true, showtime: true }, { ...base, defence: true, gathering: true }, { ...base, defence: true, shotUp: true }]) {
      expect(hintSwap(hintFor(base), hintFor(s), 0.01, false), hintFor(s)).toBe(true);
    }
    expect(hintSwap(hintFor(base), hintFor({ ...base, set: true }), 0.01, false)).toBe(false);   // a calm line waits out the dwell
  });
});

describe('#9 the box line', () => {
  it('FG always, the rest only when they happened', () => {
    expect(boxLine(emptyBox())).toBe('FG 0/0');
    expect(boxLine({ fgm: 7, fga: 12, threes: 2, assists: 3, steals: 2, blocks: 1, overdrives: 1 })).toBe('FG 7/12 · 3PT 2 · AST 3 · STL 2 · BLK 1 · OVERDRIVE 1');
    expect(boxLine({ fgm: 1, fga: 4, blocks: 2 })).toBe('FG 1/4 · BLK 2');
  });
});

describe('#14 the level of detail', () => {
  it('on the ball is always full; off-screen is 2; far is 1 with a gap that holds it', () => {
    expect(lodFor(2, { offBall: false, onScreen: false, distM: 30 })).toBe(0);
    expect(lodFor(0, { offBall: true, onScreen: false, distM: 3 })).toBe(2);
    expect(lodFor(0, { offBall: true, onScreen: true, distM: LOD_FAR_IN_M + 0.1 })).toBe(1);
    expect(lodFor(0, { offBall: true, onScreen: true, distM: LOD_FAR_IN_M - 0.1 })).toBe(0);
    const mid = (LOD_FAR_IN_M + LOD_FAR_OUT_M) / 2;
    expect(lodFor(1, { offBall: true, onScreen: true, distM: mid })).toBe(1);   // stays far inside the gap
    expect(lodFor(0, { offBall: true, onScreen: true, distM: mid })).toBe(0);   // stays near inside the gap
    expect(lodFor(1, { offBall: true, onScreen: true, distM: LOD_FAR_OUT_M - 0.1 })).toBe(0);
  });
});
