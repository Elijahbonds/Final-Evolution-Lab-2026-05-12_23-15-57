import { describe, expect, it } from 'vitest';
import { isVelocityKartWin } from './raceOutcome';

describe('race outcome mapping', () => {
  it('counts every Velocity Kart medal completion as a won session', () => {
    expect(isVelocityKartWin('COMPLETE_GOLD')).toBe(true);
    expect(isVelocityKartWin('COMPLETE_SILVER')).toBe(true);
    expect(isVelocityKartWin('COMPLETE_BRONZE')).toBe(true);
  });

  it('does not award win credit for DNFs or unrelated outcomes', () => {
    expect(isVelocityKartWin('OUT')).toBe(false);
    expect(isVelocityKartWin('win')).toBe(false);
    expect(isVelocityKartWin(undefined)).toBe(false);
  });
});
