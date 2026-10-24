// baseballPitch — the pitch reads the three-inning game needs, in a module of its own (BASEBALL-PITCH-MOD, 2026-10-22).
// BaseballInningsMode used to import pitchSpec and PITCH_RELEASE_SEC from precisionModes.ts, which put Derby, golf and
// the shootout (and every golf_ / keeper_ / soccer_ clip they name) inside baseball's import closure, so clipScope read
// them as baseball's clips. These are copies of precisionModes' numbers and formula, not new ones: baseballPitch.test.ts
// pins both release constants at 0.52 and deep-equals the two pitchSpecs over rounds and seeds, so they cannot drift.
// The mix and the location walk are still DerbyLoop.pitchShape's (pure, already in baseball's closure through derbySeed).
// Do not import precisionModes.ts from here, directly or through another module.
import { Vector3 } from '@babylonjs/core';
import { pitchShape } from '../core/DerbyLoop';

/** Seconds into baseball_pitch_over / _side where the ball leaves the hand (Derby's value, precisionModes.ts). */
export const PITCH_RELEASE_SEC = 0.52;   // TUNE: same value as Derby's PITCH_RELEASE_SEC; baseballPitch.test.ts holds them equal

/** Half-extents of the strike zone, in metres (precisionModes.ts ZONE_HALF). */
export const ZONE_HALF = { x: 0.62, y: 0.42 } as const;

export type PitchType = 'fastball' | 'slider' | 'changeup';
export interface PitchSpec {
  type: PitchType;
  label: string;
  /** Plate crossing BEFORE any break (what the pitch first reads as). */
  aim: Vector3;
  /** Plate crossing AFTER the break (where the PCI must actually be). */
  arrive: Vector3;
  speed: number;           // m/s toward the plate
  breakShift: number;      // slider: lateral arrival shift (m), 0 otherwise
}

/** precisionModes.ts pitchSpec, line for line: `seed` omitted is the fixed sequence, a seed is that session's sequence. */
export function pitchSpec(round: number, seed?: number): PitchSpec {
  const { type, ux, uy, breakSign } = pitchShape(round, seed);
  const ax = (ux * 0.8) * ZONE_HALF.x;
  const ay = 1.05 + uy * ZONE_HALF.y;
  const speed = (14 + round * 0.5) * (type === 'changeup' ? 0.78 : 1);
  const breakShift = type === 'slider' ? breakSign * 0.45 : 0;
  const aim = new Vector3(ax, ay, 0);
  return {
    type,
    label: type === 'fastball' ? 'FB' : type === 'slider' ? 'SLD' : 'CHG',
    aim,
    arrive: new Vector3(ax + breakShift, ay, 0),
    speed,
    breakShift,
  };
}
