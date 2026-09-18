// Personal space in a crowd (2026-09-15).
//
// Every mob steers at the player and nothing looked at another mob, so a wave arrived as one clump of bodies drawn
// through each other — what the scorecard's frame review has charged The Hundred for since rc10. These tests hold the
// correction to what it is: a pair that overlaps is pushed apart, a pair that does not is left alone, and a body on the
// floor is stepped over rather than shoved.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { BODY_SPACING, MobPool, type Mob } from './MobSteering';

/** A stand-in with only what `separate` touches — the real Mob needs a GLB and an animator. */
function fake(x: number, z: number, state: Mob['state'] = 'idle'): Mob {
  const position = new Vector3(x, 0, z);
  return {
    state,
    char: { root: { position, isEnabled: () => true } },
    update: () => false,
  } as unknown as Mob;
}
const gap = (a: Mob, b: Mob) => Math.hypot(
  a.char.root.position.x - b.char.root.position.x,
  a.char.root.position.z - b.char.root.position.z,
);

describe('MobPool personal space', () => {
  const run = (mobs: Mob[]) => { const p = new MobPool(); for (const m of mobs) p.add(m); p.update(1 / 60, Vector3.Zero(), Vector3.Zero()); return p; };

  it('pushes an overlapping pair apart, symmetrically', () => {
    const a = fake(0, 0), b = fake(0.3, 0);
    run([a, b]);
    expect(gap(a, b)).toBeCloseTo(BODY_SPACING, 2);
    expect(a.char.root.position.x).toBeCloseTo(-0.26, 2);   // each moved half the overlap
    expect(b.char.root.position.x).toBeCloseTo(0.56, 2);
  });

  it('leaves a pair that already has room exactly where it is', () => {
    const a = fake(0, 0), b = fake(2, 0);
    run([a, b]);
    expect(a.char.root.position.x).toBe(0);
    expect(b.char.root.position.x).toBe(2);
  });

  it('separates two bodies standing in exactly the same spot', () => {
    const a = fake(1, 1), b = fake(1, 1);
    run([a, b]);
    expect(gap(a, b)).toBeGreaterThan(BODY_SPACING * 0.9);
  });

  it('steps over a body on the floor instead of shoving it', () => {
    const a = fake(0, 0), down = fake(0.2, 0, 'downed');
    run([a, down]);
    expect(down.char.root.position.x).toBe(0.2);
    expect(a.char.root.position.x).toBe(0);
  });

  it('a whole wave arriving on one point ends up spread out', () => {
    const wave = Array.from({ length: 6 }, (_, i) => fake(0.05 * i, 0.05 * i));
    const p = new MobPool();
    for (const m of wave) p.add(m);
    for (let i = 0; i < 60; i++) p.update(1 / 60, Vector3.Zero(), Vector3.Zero());
    for (let i = 0; i < wave.length; i++) {
      for (let j = i + 1; j < wave.length; j++) expect(gap(wave[i], wave[j]), `${i}/${j}`).toBeGreaterThan(BODY_SPACING * 0.8);
    }
  });
});
