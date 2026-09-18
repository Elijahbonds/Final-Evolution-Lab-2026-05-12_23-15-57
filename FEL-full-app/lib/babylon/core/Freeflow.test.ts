import { describe, it, expect } from 'vitest';
import { Freeflow, FREEFLOW } from './Freeflow';

describe('Freeflow — the flow is kept by landing and reading, and lost by missing and getting hit', () => {
  it('landed hits extend it; the multiplier climbs every 5; points are multiplied', () => {
    const f = new Freeflow();
    for (let i = 0; i < 4; i++) f.hit(1, 'light', i * 0.5);
    expect(f.count).toBe(4); expect(f.mult()).toBe(1);
    const e = f.hit(1, 'light', 2.0);
    expect(e.milestone).toBe(5); expect(f.mult()).toBe(1.5);
    const crowd = f.hit(3, 'finisher', 2.4);                     // one ender reaching three bodies
    expect(crowd.count).toBe(8); expect(crowd.points).toBe(3 * FREEFLOW.hitPts * 1.5);
  });

  it('a whiff near a body breaks it; a swing at nobody does not; getting hit breaks it', () => {
    const f = new Freeflow();
    f.hit(1, 'light', 0); f.hit(1, 'light', 0.4);
    expect(f.whiff(false)).toBeNull(); expect(f.count).toBe(2);
    expect(f.whiff(true)).toEqual({ reason: 'whiff', lost: 2, best: 2 }); expect(f.count).toBe(0);
    f.hit(1, 'light', 1); expect(f.hurt()?.reason).toBe('hurt');
  });

  it('the drop clock: a slow tempo drops it, and a long flow gets a longer clock', () => {
    const f = new Freeflow();
    f.hit(1, 'light', 0);
    expect(f.update(FREEFLOW.dropSec - 0.01)).toBeNull();
    expect(f.update(FREEFLOW.dropSec + 0.01)?.reason).toBe('dropped');
    for (let i = 0; i < FREEFLOW.longAt; i++) f.hit(1, 'light', 10 + i * 0.3);
    const last = 10 + (FREEFLOW.longAt - 1) * 0.3;
    expect(f.update(last + FREEFLOW.dropSec + 0.1)).toBeNull();   // past the short clock, inside the long one
    expect(f.drop01(last + FREEFLOW.dropSecLong / 2)).toBeCloseTo(0.5, 2);
  });

  it('mashing air cannot build a meter; counters fill it faster than hits; a takedown needs 8 and half a meter', () => {
    const f = new Freeflow();
    for (let i = 0; i < 20; i++) f.whiff(false);
    expect(f.meter).toBe(0);
    for (let i = 0; i < 7; i++) f.hit(1, 'medium', i * 0.3);
    expect(f.takedownReady).toBe(false);                          // 7 in the flow
    let unlocked = false, t = 2.2;
    for (let i = 0; i < 6 && !unlocked; i++, t += 0.3) unlocked = f.counter(t).takedownUnlocked;
    expect(unlocked).toBe(true); expect(f.takedownReady).toBe(true);
    const meter = f.meter, count = f.count;
    expect(f.takedown(t + 5)).toBeNull();                        // the clock ran out first: nothing to cash in
    for (let i = 0; i < 8; i++) f.counter(20 + i * 0.3);
    const meter2 = f.meter, count2 = f.count;
    expect(f.takedown(22.5)).not.toBeNull();
    expect(f.meter).toBeCloseTo(meter2 - FREEFLOW.takedownCost, 5); expect(f.count).toBe(count2 + 1);
    void meter; void count;
    expect(f.counter(0).points).toBeGreaterThan(0);
  });

  it('a milestone fires once per flow, and again in the next flow', () => {
    const f = new Freeflow();
    const ms = (): number[] => { const out: number[] = []; for (let i = 0; i < 11; i++) { const m = f.hit(1, 'light', i * 0.2).milestone; if (m) out.push(m); } return out; };
    expect(ms()).toEqual([5, 10]);
    f.hurt();
    const again: number[] = []; for (let i = 0; i < 6; i++) { const m = f.hit(1, 'light', 10 + i * 0.2).milestone; if (m) again.push(m); }
    expect(again).toEqual([5]);
  });
});
