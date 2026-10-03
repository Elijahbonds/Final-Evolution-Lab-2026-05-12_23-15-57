// 10-phase pass, phase 8: the speed-fx gates and rates are one table, and the table is argued here.
import { describe, it, expect } from 'vitest';
import {
  SPEED_LINE_ON, SPEED_LINE_RATE, speedLineK,
  DUST_RATE, dustRateFor,
  WINGTIP, wingtipK,
} from './speedFx';

describe('phase 8: the speed-line gate opens past ~80% of top speed and only there', () => {
  it('nothing below the gate, a smooth ramp through the top fifth, pinned at 1 past top speed', () => {
    expect(speedLineK(0)).toBe(0);
    expect(speedLineK(0.5)).toBe(0);
    expect(speedLineK(SPEED_LINE_ON - 1e-9)).toBe(0);
    expect(speedLineK(SPEED_LINE_ON)).toBe(0);
    const mid = speedLineK((SPEED_LINE_ON + 1) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(speedLineK(1)).toBe(1);
    expect(speedLineK(1.3)).toBe(1);   // a boost over top still reads full, never more
  });
  it('the gate is the plan number: 0.8, and the rate is a phone budget (below the BoostFx burn)', () => {
    expect(SPEED_LINE_ON).toBe(0.8);
    expect(SPEED_LINE_RATE).toBeGreaterThan(0);
    expect(SPEED_LINE_RATE).toBeLessThanOrEqual(420);   // BoostFx's burn rate is the ceiling of the language
  });
});

describe('phase 8: the dust is one emitter with a rate per drive state', () => {
  it('off is silent, a slide streams, off-road kicks up hardest', () => {
    expect(dustRateFor('off')).toBe(0);
    expect(dustRateFor('drift')).toBeGreaterThan(0);
    expect(dustRateFor('offRoad')).toBeGreaterThan(dustRateFor('drift'));
  });
  it('every state in the union has a rate, and the rates stay inside the 120-particle budget', () => {
    const states: Array<keyof typeof DUST_RATE> = ['off', 'drift', 'offRoad'];
    for (const s of states) {
      expect(DUST_RATE[s]).toBeGreaterThanOrEqual(0);
      // worst case: rate × longest life (0.7 s) must fit the system capacity with headroom
      expect(DUST_RATE[s] * 0.7).toBeLessThan(120);
    }
  });
});

describe('phase 8: the wingtip ribbons wake in a hard bank or near top speed', () => {
  it('straight and slow is clean air', () => {
    expect(wingtipK(0, 0)).toBe(0);
    expect(wingtipK(0.2, 0.5)).toBe(0);
  });
  it('a hard bank wakes them — the gate sits past normal bank but inside maxBank 0.85', () => {
    expect(WINGTIP.rollOn).toBeGreaterThan(0.4);
    expect(WINGTIP.rollOn).toBeLessThan(0.85);   // ArcadeFlight's maxBank: a full-turn must stream
    expect(wingtipK(0.85, 0)).toBeGreaterThan(0);
    expect(wingtipK(-0.85, 0)).toBeGreaterThan(0);   // either side
    expect(wingtipK(Math.PI, 0)).toBe(1);   // a barrel roll streams hard
  });
  it('near top speed wakes them even wings-level', () => {
    expect(wingtipK(0, WINGTIP.speedOn)).toBe(0);
    expect(wingtipK(0, 1)).toBe(1);
  });
  it('the gate never exceeds 1', () => {
    expect(wingtipK(Math.PI * 2, 1.4)).toBe(1);
  });
});
