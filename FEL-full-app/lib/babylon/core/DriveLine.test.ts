import { describe, it, expect } from 'vitest';
import { driveIntent, driveLateral, bodiesMet, CORRIDOR, AVOID_METRES, AVOID_EASE_FROM } from './DriveLine';

/** Driving along +z, so "across" is the x axis: right of the drive is -x, left is +x. */
const DIR = { x: 0, z: 1 };
const AT = { x: 0, z: 0 };

describe('driveIntent', () => {
  const always = (v: number) => () => v;

  it('a SET defender is mostly gone around — running through him is a charge and a turnover', () => {
    expect(driveIntent({ defenderSet: true, aggression: 1, roll: always(0.5) })).toBe('around');
    expect(driveIntent({ defenderSet: true, aggression: 1, roll: always(0.9) })).toBe('around');
  });

  it('…but not always: a driver who takes the contact anyway is what makes planting a RISK', () => {
    expect(driveIntent({ defenderSet: true, aggression: 1, roll: always(0.05) })).toBe('through');
  });

  it('a MOVING defender is mostly driven through — that foul is his, not yours', () => {
    expect(driveIntent({ defenderSet: false, aggression: 1, roll: always(0.5) })).toBe('through');
  });

  it('a rival who is PRESSING drives at you more (Nerve aggression)', () => {
    const r = always(0.25);
    expect(driveIntent({ defenderSet: true, aggression: 1, roll: r })).toBe('around');    // 0.18 base: 0.25 > 0.18
    expect(driveIntent({ defenderSet: true, aggression: 1.6, roll: r })).toBe('through'); // pressing: 0.18 * 1.6 = 0.288
  });

  it('and the aggression multiplier is clamped, so no scoreboard makes him suicidal or catatonic', () => {
    expect(driveIntent({ defenderSet: true, aggression: 99, roll: always(0.99) })).toBe('around');
    expect(driveIntent({ defenderSet: false, aggression: 0, roll: always(0.3) })).toBe('through');
  });
});

describe('driveLateral', () => {
  const base = { at: AT, dir: DIR, k: 0.3, intent: 'around' as const };

  it('nobody in the way is no bend at all — the drive is a straight line again', () => {
    expect(driveLateral({ ...base, defender: null })).toBe(0);
  });

  it('a defender BEHIND you is not in the way', () => {
    expect(driveLateral({ ...base, defender: { x: 0, z: -2 } })).toBe(0);
  });

  it('a defender WIDE of the corridor is not in the way', () => {
    expect(driveLateral({ ...base, defender: { x: CORRIDOR + 0.5, z: 2 } })).toBe(0);
  });

  it('a defender in the corridor bends the path AWAY from the side he is on', () => {
    const heIsLeft = driveLateral({ ...base, defender: { x: 1, z: 2 } });
    const heIsRight = driveLateral({ ...base, defender: { x: -1, z: 2 } });
    expect(Math.sign(heIsLeft)).toBe(-Math.sign(heIsRight));
    expect(Math.abs(heIsLeft)).toBeGreaterThan(0);
  });

  it('the closer he is to the line, the harder the bend', () => {
    const centre = Math.abs(driveLateral({ ...base, defender: { x: 0.1, z: 2 } }));
    const edge = Math.abs(driveLateral({ ...base, defender: { x: CORRIDOR - 0.1, z: 2 } }));
    expect(centre).toBeGreaterThan(edge);
    expect(centre).toBeLessThanOrEqual(AVOID_METRES);
  });

  it('dead centre still picks a side rather than driving straight through him', () => {
    expect(driveLateral({ ...base, defender: { x: 0, z: 2 } })).not.toBe(0);
  });

  it('GOING THROUGH HIM does not bend at all — that is the whole point of the decision', () => {
    expect(driveLateral({ ...base, intent: 'through', defender: { x: 0.2, z: 2 } })).toBe(0);
  });

  it('the bend eases out late so the drive still finishes AT the rim rather than beside it', () => {
    const d = { x: 0.2, z: 2 };
    const mid = Math.abs(driveLateral({ ...base, k: 0.5, defender: d }));
    const late = Math.abs(driveLateral({ ...base, k: 0.9, defender: d }));
    expect(late).toBeLessThan(mid);
    expect(driveLateral({ ...base, k: 1, defender: d })).toBe(0);
    expect(Math.abs(driveLateral({ ...base, k: AVOID_EASE_FROM, defender: d }))).toBeCloseTo(mid, 6);
  });
});

describe('bodiesMet', () => {
  it('contact is the STANDOFF, not an overlap — two bodies cannot be closer than that', () => {
    expect(bodiesMet({ x: 0, z: 0 }, { x: 1.1, z: 0 }, 1.1)).toBe(true);
    expect(bodiesMet({ x: 0, z: 0 }, { x: 3, z: 0 }, 1.1)).toBe(false);
  });
});
