import { describe, it, expect } from 'vitest';
import { takeoffRead, encodeTakeoff, decodeTakeoff, ZONE_HEX, MARK_W, MARK_D, MARK_Y, MARK_ALPHA, type TakeoffInputs } from './DunkTakeoffRead';
import { approachAngle, approachBonus, takeoffFor, rangeLabel, FREE_THROW_M, ONE_FOOT_MIN_SPEED, STANDING_M } from './DunkApproach';

const RIM = { rimX: 0, rimZ: -10.28 };
const at = (x: number, distM: number, o: Partial<TakeoffInputs> = {}): TakeoffInputs =>
  ({ x, z: RIM.rimZ + distM, ...RIM, jOffsetX: 0, runUpPeak: 6.5, gatherHeld: false, ...o });

describe('the take-off read is the judges\' read', () => {
  it('equals DunkApproach.approachBonus for the same feet, foot and J, everywhere on the runway', () => {
    for (const x of [-3, -1.2, 0, 0.4, 2.5]) for (const d of [1.2, 2.0, 2.8, 3.3, 4.19, 5.5]) for (const peak of [2, 4.4, 4.5, 7])
      for (const gather of [false, true]) for (const j of [0, 0.8, -1.6]) for (const two of [false, true]) {
        const i = at(x, d, { runUpPeak: peak, gatherHeld: gather, jOffsetX: j, forceTwo: two });
        const range = Math.hypot(i.x - i.rimX, i.z - i.rimZ);
        const want = approachBonus(approachAngle(i.x - j, i.z, i.rimX, i.rimZ), two ? 'two' : takeoffFor(peak, gather), range);
        const r = takeoffRead(i);
        expect(r.read).toEqual(want);
        expect(r.foot).toBe(want.takeoff);
        expect(r.rangeM).toBeCloseTo(range, 9);
      }
  });
  it('every word on the chip is the judges\' own: the foot and the side from the card\'s label, the range from rangeLabel', () => {
    for (const x of [-2.5, 0, 2.5]) for (const d of [2.0, 3.4, 4.6]) for (const peak of [3, 6]) {
      const r = takeoffRead(at(x, d, { runUpPeak: peak }));
      const [foot, where, side] = r.chip.split(' · ');
      expect(r.read.label).toContain(foot);
      expect(where).toBe(rangeLabel(r.rangeM));
      if (side) expect(r.read.label.startsWith(side)).toBe(true);
      else expect(r.read.label.startsWith('HEAD-ON')).toBe(true);
    }
  });
});

describe('the chip changes as you cross the stripe, the elbow and the paint', () => {
  it('a straight run in from deep reads FROM THE STRIPE, then FROM THE ELBOW, then IN THE PAINT — in that order, once each', () => {
    const seen: string[] = [];
    for (let d = 7; d >= 2.0; d -= 0.05) {
      const z = takeoffRead(at(0, d)).zone;
      if (seen[seen.length - 1] !== z) seen.push(z);
    }
    expect(seen).toEqual(['stripe', 'elbow', 'paint']);
  });
  it('the stripe begins exactly where the judges\' stripe begins', () => {
    expect(takeoffRead(at(0, FREE_THROW_M)).zone).toBe('stripe');
    expect(takeoffRead(at(0, FREE_THROW_M - 0.01)).zone).toBe('elbow');
    expect(takeoffRead(at(0, FREE_THROW_M)).chip).toBe('ONE-FOOT · FROM THE STRIPE');
    expect(takeoffRead(at(0, STANDING_M - 0.1)).zone).toBe('rim');
  });
  it('the foot: ONE-FOOT off a real run; TWO-FOOT off a walk, with GATHER held, or on a two-foot prop', () => {
    expect(takeoffRead(at(0, 3, { runUpPeak: ONE_FOOT_MIN_SPEED })).chip.startsWith('ONE-FOOT')).toBe(true);
    expect(takeoffRead(at(0, 3, { runUpPeak: ONE_FOOT_MIN_SPEED - 0.01 })).chip.startsWith('TWO-FOOT')).toBe(true);
    expect(takeoffRead(at(0, 3, { gatherHeld: true })).chip.startsWith('TWO-FOOT')).toBe(true);
    expect(takeoffRead(at(0, 3, { forceTwo: true })).chip.startsWith('TWO-FOOT')).toBe(true);
  });
  it('the side is named off head-on: WING, then BASELINE — and the mode\'s own J is not the player\'s angle', () => {
    expect(takeoffRead(at(0, 3)).chip).toBe('ONE-FOOT · IN THE PAINT');
    expect(takeoffRead(at(1.0, 3)).chip).toBe('ONE-FOOT · IN THE PAINT · WING');
    expect(takeoffRead(at(2.2, 2.6)).chip).toMatch(/· BASELINE$/);
    // on the J's own line the bend is the mode's: it reads as the head-on it is
    expect(takeoffRead(at(1.0, 3, { jOffsetX: 1.0 })).chip).toBe('ONE-FOOT · IN THE PAINT');
  });
  it('a broken J offset is no offset, never NaN on the HUD', () => {
    const r = takeoffRead(at(0, 3, { jOffsetX: NaN }));
    expect(r.chip).toBe('ONE-FOOT · IN THE PAINT');
    expect(Number.isFinite(r.read.difficulty)).toBe(true);
  });
});

describe('the wire and the mark', () => {
  it('round-trips zone and chip; garbage is null, never a throw', () => {
    const r = takeoffRead(at(0, 4.5));
    expect(decodeTakeoff(encodeTakeoff(r))).toEqual({ zone: 'stripe', chip: r.chip });
    expect(encodeTakeoff(null)).toBe('');
    for (const v of [null, undefined, 3, '', 'stripe', '|', {}]) expect(decodeTakeoff(v)).toBeNull();
    expect(decodeTakeoff('weird|X')).toEqual({ zone: 'rim', chip: 'X' });
  });
  it('every zone has a colour; the mark is a bar across the run, just off the floor, see-through', () => {
    for (const z of ['stripe', 'elbow', 'paint', 'rim'] as const) expect(ZONE_HEX[z]).toMatch(/^#[0-9a-f]{6}$/);
    expect(MARK_W).toBeGreaterThan(MARK_D);
    expect(MARK_Y).toBeGreaterThan(0); expect(MARK_Y).toBeLessThan(0.05);
    expect(MARK_ALPHA).toBeGreaterThan(0); expect(MARK_ALPHA).toBeLessThanOrEqual(1);
  });
});
