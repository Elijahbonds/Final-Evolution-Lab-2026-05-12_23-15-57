import { describe, expect, it } from 'vitest';
import { OBSTACLE_KINDS, OBSTACLE_SPECS, boxProfile, clipsObstacle, heightAt, nextObstacle } from './DunkObstacles';

describe('DunkObstacles — cars and other objects', () => {
  it('three readable objects, the car the hardest, each with a mesh source', () => {
    expect(OBSTACLE_KINDS).toEqual(['car', 'barrier', 'crate']);
    expect(OBSTACLE_SPECS.car.source).toEqual({ meshy: 'sedan' });
    expect(OBSTACLE_SPECS.car.bonus).toBeGreaterThan(OBSTACLE_SPECS.crate.bonus);
    expect(OBSTACLE_SPECS.crate.bonus).toBeGreaterThan(OBSTACLE_SPECS.barrier.bonus);
    expect(OBSTACLE_SPECS.car.takeoffFromRim).toBeGreaterThan(OBSTACLE_SPECS.car.zFromRim + 1);   // a long jump: the takeoff sits well before the near door
  });
  it('the d-pad cycles car → barrier → crate → car', () => {
    expect(nextObstacle(null)).toBe('car'); expect(nextObstacle('car')).toBe('barrier'); expect(nextObstacle('barrier')).toBe('crate'); expect(nextObstacle('crate')).toBe('car');
  });
  it('the height profile reads the mesh top under the runway and nothing outside its footprint', () => {
    const p = { z: [-7, -7.5, -8, -8.5, -9], h: [0.5, 1.0, 1.46, 1.4, 0.6], halfWidth: 2.4 };
    expect(heightAt(p, 0, -8)).toBeCloseTo(1.46, 5);
    expect(heightAt(p, 0, -7.25)).toBeCloseTo(0.75, 5);   // between samples
    expect(heightAt(p, 0, -6)).toBe(0); expect(heightAt(p, 0, -10)).toBe(0);
    expect(heightAt(p, 3, -8)).toBe(0);   // beside the car
  });
  it('a tucked foot above the roof clears; a foot inside the car clips', () => {
    const p = boxProfile(-8.14, 1.04, 1.46, 2.4);
    expect(clipsObstacle(p, 1.55, 0, -8.1)).toBe(false);
    expect(clipsObstacle(p, 1.2, 0, -8.1)).toBe(true);
    expect(clipsObstacle(p, 0.2, 0, -6.5)).toBe(false);   // before the car
    expect(clipsObstacle(p, 1.47, 0, -8.1)).toBe(false);   // just over
    expect(clipsObstacle(p, 1.52, 0, -8.1, OBSTACLE_SPECS.car.clearance)).toBe(true);   // the car wants daylight under the shoes
    expect(clipsObstacle(p, 1.58, 0, -8.1, OBSTACLE_SPECS.car.clearance)).toBe(false);
  });
});
