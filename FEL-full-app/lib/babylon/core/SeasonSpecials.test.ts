import { describe, it, expect } from 'vitest';
import { specialOpen, specialLockLine, devPassOverride, laneFromSeason, SPECIAL_PROPS } from './SeasonSpecials';
describe('the season specials', () => {
  it('open only on the PRO lane, and a lock names the special', () => {
    expect(specialOpen('pro')).toBe(true); expect(specialOpen('free')).toBe(false); expect(specialOpen('guest')).toBe(false);
    expect(specialLockLine('kangaroo')).toBe('SEASON PASS SPECIAL — THE HOPPING KANGAROO');
    expect(SPECIAL_PROPS.has('kangaroo')).toBe(true); expect(SPECIAL_PROPS.has('car')).toBe(false);
  });
  it('the lane comes from the season api; a guest is a guest; the dev url can override', () => {
    expect(laneFromSeason({ active: true, hasPro: true }, 200)).toBe('pro');
    expect(laneFromSeason({ active: true, hasPro: false }, 200)).toBe('free');
    expect(laneFromSeason(null, 401)).toBe('guest');
    expect(devPassOverride('?pass=1')).toBe('pro'); expect(devPassOverride('?pass=0')).toBe('free'); expect(devPassOverride('?agent=1')).toBeNull();
  });
});
