// DEMO-SPEED-2: a parked exercise-demo stage is released when a game mode mounts (owner call 3: phones need the memory back).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dropParkedStage, holdParkedStage, releaseParkedStage } from './parkedStage';

describe('the parked demo stage gives its memory back to a mode', () => {
  it('releases what is parked, once; a stage a demo took back is not released', () => {
    let n = 0;
    const a = () => { n++; };
    holdParkedStage(a);
    expect(releaseParkedStage()).toBe(true);
    expect(releaseParkedStage()).toBe(false);
    expect(n).toBe(1);
    holdParkedStage(a); dropParkedStage(a);
    expect(releaseParkedStage()).toBe(false);
    expect(n).toBe(1);
  });
  it('a release that throws does not fail the mode', () => {
    holdParkedStage(() => { throw new Error('lost context'); });
    expect(() => releaseParkedStage()).not.toThrow();
  });
  it('every mode mounts through the release (the look stack, before it builds an engine) and the stage registers with it', () => {
    const look = readFileSync('lib/babylon/core/lookStack.ts', 'utf8');
    const body = look.slice(look.indexOf('export async function mountLookStack'));
    expect(body.indexOf('releaseParkedStage();')).toBeGreaterThan(0);
    expect(body.indexOf('releaseParkedStage();')).toBeLessThan(body.indexOf('createEngine('));
    expect(readFileSync('lib/babylon/core/ModeHarness.ts', 'utf8')).toMatch(/mountLookStack\(/);
    const stage = readFileSync('components/library/exercise-stage.tsx', 'utf8');
    expect(stage).toMatch(/holdParkedStage\(releaseParked\)/);
    expect(stage).toMatch(/dropParkedStage\(releaseParked\)/);
  });
});
