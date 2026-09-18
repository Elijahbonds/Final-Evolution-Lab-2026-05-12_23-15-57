// DEFENSE-LOOK (2026-09-17): the standing dunk. R2 + Square under the rim with no run-up used to be a layup, because the
// drive-dunk gate demanded DUNK_MIN_SPEED; a body inside STANDING_DUNK_RANGE with turbo and no speed is a two-foot dunk.
import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { checkDriveDunk, STANDING_DUNK_RANGE, DUNK_MIN_TURBO, DUNK_MIN_SPEED, DUNK_PCT } from './BasketballCore';

const HOOP = new Vector3(0, 0, -0.6);
describe('checkDriveDunk — the standing dunk', () => {
  it('under the rim, turbo held, not running: standing', () => {
    expect(checkDriveDunk(new Vector3(0.3, 0, 0.6), new Vector3(0, 0, -0.2), HOOP, 1, null)).toBe('standing');
  });
  it('…with a defender on him it is a poster like any other', () => {
    expect(checkDriveDunk(new Vector3(0.3, 0, 0.6), new Vector3(0, 0, -0.2), HOOP, 1, new Vector3(0, 0, 0))).toBe('poster');
  });
  it('no turbo, or too far out, is not a standing dunk', () => {
    expect(checkDriveDunk(new Vector3(0.3, 0, 0.6), new Vector3(0, 0, -0.2), HOOP, DUNK_MIN_TURBO - 0.1, null)).toBe('none');
    expect(checkDriveDunk(new Vector3(0, 0, -0.6 + STANDING_DUNK_RANGE + 0.3), new Vector3(0, 0, -0.2), HOOP, 1, null)).toBe('none');
  });
  it('a running drive is still the drive dunk', () => {
    expect(checkDriveDunk(new Vector3(0, 0, 1.4), new Vector3(0, 0, -(DUNK_MIN_SPEED + 1)), HOOP, 1, null)).toBe('dunk');
    expect(DUNK_PCT.standing).toBeGreaterThan(DUNK_PCT.dunk);
  });
});
