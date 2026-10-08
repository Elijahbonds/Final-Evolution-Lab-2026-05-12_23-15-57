// IMPROVE (2026-10-06, skate item 3) — the shared ground predicate answers exactly what `includes` answered.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { rideFilter } from './rideFilter';

describe('rideFilter', () => {
  const scene = new Scene(new NullEngine());
  const meshes = Array.from({ length: 60 }, (_, i) => MeshBuilder.CreateBox(`m${i}`, { size: 1 }, scene));

  it('agrees with includes for every mesh in the scene', () => {
    const ground = meshes.filter((_, i) => i % 3 === 0);
    const pred = rideFilter(ground);
    for (const m of meshes) expect(pred(m), m.name).toBe(ground.includes(m));
  });

  it('hands back the SAME predicate for the same list (one closure, not one per ray)', () => {
    const ground = meshes.slice(0, 5);
    expect(rideFilter(ground)).toBe(rideFilter(ground));
    expect(rideFilter(meshes.slice(0, 5))).not.toBe(rideFilter(ground));   // a different list is its own
  });

  it('follows a list that grows after the first ask', () => {
    const ground = meshes.slice(0, 2);
    expect(rideFilter(ground)(meshes[10])).toBe(false);
    ground.push(meshes[10]);
    expect(rideFilter(ground)(meshes[10])).toBe(true);
  });
});
