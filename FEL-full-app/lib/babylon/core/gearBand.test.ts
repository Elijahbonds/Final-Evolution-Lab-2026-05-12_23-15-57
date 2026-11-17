// lane/move-feel (2026-11-12): THE WALK / JOG LINE, eased — `hoops.gearBlendBand` (core/HoopsStick HOOPS_GEAR_BLEND_BAND). ON (0.2) since
// the owner's 2026-11-17 "turn all six on now": the jog's target eases up from the walk's edge over the band; full tilt and every stick past
// line + band are unchanged. Off (0) is the game before: under the walk line a walk, past it the jog from 85 % of its top (the step).
import { describe, it, expect, afterEach } from 'vitest';
import { DribbleController } from './BasketballCore';
import { GEARS_HANDLER, GEARS_HOOPS } from './CourtMovement';
import { HOOPS_GEAR_BLEND_BAND, gearBandTop } from './HoopsStick';
import { setFeelUser, setFeelSession, setFeelOverride, resetFeelForTests } from '@/lib/feel-panel/feel';

const DT = 1 / 60;
/** The speed the handler settles at with the stick held straight up at `mag` for 1.5 s. */
const off = () => { setFeelUser(true); setFeelSession(null); expect(setFeelOverride('hoops.gearBlendBand', 0)).toBe(0); };
const settle = (mag: number): number => { const d = new DribbleController(); for (let t = 0; t < 1.5; t += DT) d.update(DT, 0, -mag, false); return d.vel.length(); };

describe('the walk / jog line (hoops.gearBlendBand)', () => {
  afterEach(() => { resetFeelForTests(); });

  it('ships on (0.2, owner 2026-11-17), on the handler only (the dunk run-up never reads it)', () => {
    expect(HOOPS_GEAR_BLEND_BAND).toBe(0.2);
    expect(GEARS_HANDLER.gearBand).toBe(0.2);
    expect(GEARS_HOOPS.gearBand).toBeUndefined();
  });

  it('off (0): the step as it was — 0.44 walks at 2.35 m/s, 0.46 jogs at 3.71', () => {
    off();
    expect(settle(0.44)).toBeCloseTo(6.4 * 0.38 * (0.44 / 0.45), 2);
    expect(settle(0.46)).toBeCloseTo(6.4 * 0.68 * (0.85 + 0.15 * (0.01 / 0.55)), 2);
    expect(settle(0.46) / settle(0.44)).toBeGreaterThan(1.5);
  });

  it('on (0.2, the default): no step at the line, the same jog past the band and at full tilt as the step had', () => {
    off(); const before = [0.7, 0.85, 1].map(settle);
    resetFeelForTests();
    expect(settle(0.46) / settle(0.44)).toBeLessThan(1.05);   // a thumb on the line no longer surges
    [0.7, 0.85, 1].forEach((m, i) => expect(settle(m)).toBeCloseTo(before[i], 6));
    // monotone across the band
    let last = 0; for (let m = 0.4; m <= 0.7; m += 0.01) { const v = settle(m); expect(v).toBeGreaterThanOrEqual(last - 1e-9); last = v; }
  });

  it('gearBandTop: 0 is the jog curve; the band starts at the walk edge and ends on the curve', () => {
    expect(gearBandTop(0.5, 0.45, 2.43, 3.8, 0)).toBe(3.8);
    expect(gearBandTop(0.45, 0.45, 2.43, 3.7, 0.2)).toBeCloseTo(2.43, 9);
    expect(gearBandTop(0.65, 0.45, 2.43, 3.94, 0.2)).toBe(3.94);
    expect(gearBandTop(0.55, 0.45, 2.43, 3.8, 0.2)).toBeCloseTo(2.43 + (3.8 - 2.43) * 0.5, 9);
  });
});
