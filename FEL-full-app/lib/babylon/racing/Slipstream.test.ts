import { describe, expect, it } from 'vitest';
import { DRAFT, noDraft, stepDraft } from './Slipstream';

const LAP = 1000;
function tow(sec: number, gap: number, laneDiff = 0, speed = 20) {
  let s = noDraft(); const events: (string | null)[] = [];
  for (let t = 0; t < sec; t += 1 / 60) {
    const r = stepDraft(s, { dist: 100, lane: 0, speed }, [{ name: 'VOSS', dist: 100 + gap, lane: laneDiff }], LAP, 1 / 60);
    s = r.state; if (r.event) events.push(r.from);
  }
  return { s, events };
}

describe('Slipstream', () => {
  it('tucked in 6 m behind, in the lane, slingshots after the charge time — once', () => {
    expect(tow(DRAFT.chargeSec - 0.1, 6).events).toEqual([]);
    expect(tow(DRAFT.chargeSec + 0.05, 6).events).toEqual(['VOSS']);
    expect(tow(DRAFT.chargeSec * 1.5, 6).events).toEqual(['VOSS']);
  });
  it('no wake out of the lane, too close, too far, or too slow', () => {
    expect(tow(3, 6, 2.5).events).toEqual([]);
    expect(tow(3, 1).events).toEqual([]);
    expect(tow(3, 20).events).toEqual([]);
    expect(tow(3, 6, 0, 5).events).toEqual([]);
  });
  it('pulling out drains the charge twice as fast as it fills', () => {
    let s = tow(0.8, 6).s; expect(s.charge).toBeGreaterThan(0.6);
    for (let t = 0; t < 0.3; t += 1 / 60) s = stepDraft(s, { dist: 100, lane: 0, speed: 20 }, [], LAP, 1 / 60).state;
    expect(s.charge).toBeLessThan(0.25);
  });
  it('reads the gap across the lap line', () => {
    let s = noDraft(); let fired = false;
    for (let t = 0; t < 1.3; t += 1 / 60) { const r = stepDraft(s, { dist: 997, lane: 0, speed: 20 }, [{ name: 'KEELE', dist: 4, lane: 0.5 }], LAP, 1 / 60); s = r.state; fired ||= r.event === 'slingshot'; }
    expect(fired).toBe(true);
  });
});
