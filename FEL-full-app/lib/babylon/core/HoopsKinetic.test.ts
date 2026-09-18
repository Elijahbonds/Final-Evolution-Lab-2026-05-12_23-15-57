// Is a press a parry, a cut a drift, a jump a footstool, a poke a drive-by?
import { describe, it, expect } from 'vitest';
import { PARRY, parryVaultRead, vaultAt, driftRead, turnDeg, ankleBreak, footstoolRead, driveByRead } from './HoopsKinetic';

describe('the parry-vault', () => {
  it('reads a driver arriving inside the window, not a check-up, not a runaway, not a crawl', () => {
    expect(parryVaultRead(1.4, 4, 'drive')).toBe(true);
    expect(parryVaultRead(1.4, 4, 'blowby')).toBe(true);
    expect(parryVaultRead(1.4, 4, 'check')).toBe(false);
    expect(parryVaultRead(3, 4, 'drive')).toBe(false);
    expect(parryVaultRead(1.4, 1, 'drive')).toBe(false);
    expect(parryVaultRead(1.4, -3, 'drive')).toBe(false);
  });
  it('the vault goes up and over, landing past the driver', () => {
    const mid = vaultAt({ x: 0, y: 0, z: 0 }, { x: 0, z: 1 }, 0.5), end = vaultAt({ x: 0, y: 0, z: 0 }, { x: 0, z: 1 }, 1);
    expect(mid.y).toBeCloseTo(PARRY.up, 6); expect(end.y).toBeCloseTo(0, 6); expect(end.z).toBeCloseTo(PARRY.forward, 6);
  });
});

describe('the momentum drift', () => {
  it('needs LT, the turbo, speed and a real cut', () => {
    const vel = { x: 0, z: 5 };
    expect(driftRead(true, true, vel, { x: 1, z: 0.3 })).toBe(true);
    expect(driftRead(false, true, vel, { x: 1, z: 0.3 })).toBe(false);
    expect(driftRead(true, false, vel, { x: 1, z: 0.3 })).toBe(false);
    expect(driftRead(true, true, { x: 0, z: 2 }, { x: 1, z: 0.3 })).toBe(false);
    expect(driftRead(true, true, vel, { x: 0.2, z: 1 })).toBe(false);
    expect(turnDeg({ x: 0, z: 1 }, { x: 1, z: 0 })).toBeCloseTo(90, 6);
  });
  it('breaks the ankles of a defender in front of the old line inside reach, and nobody else', () => {
    expect(ankleBreak({ x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0.3, z: 1.1 })).toBe(true);
    expect(ankleBreak({ x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0.3, z: -1.1 })).toBe(false);
    expect(ankleBreak({ x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0.3, z: 3 })).toBe(false);
  });
});

describe('the footstool and the drive-by', () => {
  it('a footstool needs the rival between me and the ball, close', () => {
    expect(footstoolRead({ x: 0, z: 0 }, { x: 0, z: 0.9 }, { x: 0.2, z: 2.5 })).toBe(true);
    expect(footstoolRead({ x: 0, z: 0 }, { x: 0, z: -0.9 }, { x: 0.2, z: 2.5 })).toBe(false);
    expect(footstoolRead({ x: 0, z: 0 }, { x: 0, z: 2 }, { x: 0.2, z: 2.5 })).toBe(false);
  });
  it('a drive-by is alongside at speed, not behind, not on top, not walking', () => {
    expect(driveByRead({ x: 0, z: 5 }, { x: 0, z: 0 }, { x: 1, z: 0.3 })).toBe(true);
    expect(driveByRead({ x: 0, z: 5 }, { x: 0, z: 0 }, { x: 1, z: 3 })).toBe(false);
    expect(driveByRead({ x: 0, z: 5 }, { x: 0, z: 0 }, { x: 0.1, z: 0.3 })).toBe(false);
    expect(driveByRead({ x: 0, z: 2 }, { x: 0, z: 0 }, { x: 1, z: 0.3 })).toBe(false);
  });
});
