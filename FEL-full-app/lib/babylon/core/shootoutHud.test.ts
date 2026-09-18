import { describe, it, expect } from 'vitest';
import { meterGrade, rackPips, heatLevel, pointsLeft, SHOT_TARGET, PERFECT_BAND, GOOD_BAND, FIRE_STREAK } from './shootoutHud';

describe('3PT shootout readability layer', () => {
  it('meter grade follows the mode bands around the sweet centre', () => {
    expect(meterGrade(SHOT_TARGET)).toBe('perfect');
    expect(meterGrade(SHOT_TARGET + PERFECT_BAND - 0.001)).toBe('perfect');
    expect(meterGrade(SHOT_TARGET + PERFECT_BAND + 0.001)).toBe('good');
    expect(meterGrade(SHOT_TARGET - GOOD_BAND + 0.001)).toBe('good');
    expect(meterGrade(SHOT_TARGET - GOOD_BAND - 0.001)).toBe('miss');
    expect(meterGrade(0)).toBe('miss');
  });

  it('rack pips: taken behind, next loaded, ahead in front; money ball last on every rack', () => {
    const p = rackPips(1, 2);
    expect(p).toHaveLength(5);
    expect(p[0].every((x) => x.state === 'taken')).toBe(true);
    expect(p[1].map((x) => x.state)).toEqual(['taken', 'taken', 'next', 'ahead', 'ahead']);
    expect(p[2].every((x) => x.state === 'ahead')).toBe(true);
    for (const row of p) { expect(row[4].money).toBe(true); expect(row.slice(0, 4).every((x) => !x.money)).toBe(true); }
    expect(rackPips(0, 0)[0][0].state).toBe('next');
    expect(rackPips(5, 0).flat().every((x) => x.state === 'taken')).toBe(true);
  });

  it('heat: cold, warm at two, on fire at four (the camera-pulse threshold)', () => {
    expect(heatLevel(0)).toBe('cold');
    expect(heatLevel(1)).toBe('cold');
    expect(heatLevel(2)).toBe('warm');
    expect(heatLevel(FIRE_STREAK - 1)).toBe('warm');
    expect(heatLevel(FIRE_STREAK)).toBe('fire');
    expect(heatLevel(12)).toBe('fire');
  });

  it('points left: 30 at the start, 2 with only a money ball loaded, 0 when done', () => {
    expect(pointsLeft(0, 0)).toBe(30);
    expect(pointsLeft(4, 4)).toBe(2);
    expect(pointsLeft(4, 3)).toBe(3);
    expect(pointsLeft(5, 0)).toBe(0);
    expect(pointsLeft(1, 0)).toBe(24);
  });
});
