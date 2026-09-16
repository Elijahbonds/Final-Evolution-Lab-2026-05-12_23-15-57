import { describe, expect, it } from 'vitest';
import { OBSTACLE_KINDS, OBSTACLE_SPECS, PROP_CAM, boxProfile, clipsObstacle, heightAt, nextObstacle, propCamSpot, propCutDue } from './DunkObstacles';

describe('DunkObstacles — cars and other objects', () => {
  it('four readable objects, each with a source, the ladder ordered by what it costs to clear', () => {
    expect(OBSTACLE_KINDS).toEqual(['car', 'barrier', 'crate', 'tetris']);
    expect(OBSTACLE_SPECS.car.source).toEqual({ meshy: 'sedan' });
    expect(OBSTACLE_SPECS.tetris.source).toEqual({ bodies: 'stack' });   // two of the game's own bodies, not a prop file
    expect(OBSTACLE_SPECS.tetris.bonus).toBeGreaterThan(OBSTACLE_SPECS.car.bonus);
    expect(OBSTACLE_SPECS.car.bonus).toBeGreaterThan(OBSTACLE_SPECS.crate.bonus);
    expect(OBSTACLE_SPECS.crate.bonus).toBeGreaterThan(OBSTACLE_SPECS.barrier.bonus);
    expect(OBSTACLE_SPECS.car.takeoffFromRim).toBeGreaterThan(OBSTACLE_SPECS.car.zFromRim + 1);   // a long jump: the takeoff sits well before the near door
  });
  it('THE TETRIS is clearable: the hitbox is their lap, not the rider\'s head', () => {
    // the rider's head is ~2.3 m up and the dunker's apex off a full charge is 1.84 — a hitbox at the top of the stack
    // is a dunk nobody in the game can do, so the profile tops out at what the feet actually have to clear
    expect(OBSTACLE_SPECS.tetris.nominalHeight).toBeLessThan(1.84);
    expect(OBSTACLE_SPECS.tetris.nominalHeight).toBeGreaterThan(OBSTACLE_SPECS.car.nominalHeight);   // still the tallest thing on the card
    expect(OBSTACLE_SPECS.tetris.takeoffFromRim).toBeGreaterThan(OBSTACLE_SPECS.crate.takeoffFromRim);
  });
  it('the d-pad cycles car → barrier → crate → tetris → car', () => {
    expect(nextObstacle(null)).toBe('car'); expect(nextObstacle('car')).toBe('barrier'); expect(nextObstacle('barrier')).toBe('crate');
    expect(nextObstacle('crate')).toBe('tetris'); expect(nextObstacle('tetris')).toBe('car');
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
  // DUNK-CAR-CLIP (2026-09-14): the clear call played over a rim shot with the car out of frame; the prop cam films the jump from the side
  it('the prop cam stands off the runway beside the car — clear of its footprint and of the rival waiting at x +3.2', () => {
    const rim = { x: 0, z: -10.28 }, c = OBSTACLE_SPECS.car;
    const car = { nearZ: rim.z + c.zFromRim + 1.04, farZ: rim.z + c.zFromRim - 1.04 };   // the sedan is 2.08 m deep across the runway
    const at = propCamSpot(car, rim);
    expect(Math.abs(at.x - rim.x)).toBeGreaterThan(2.4 + 3);   // well outside the 4.8 m car's end
    expect(Math.sign(at.x - rim.x)).toBe(-Math.sign(3.2));      // the other side from the rival
    expect(at.z).toBeLessThan((car.nearZ + car.farZ) / 2); expect(at.z).toBeGreaterThan(rim.z);   // between the car's middle and the rim
    expect(at.y).toBeLessThan(c.nominalHeight);                 // the lens under the roof line
    expect(PROP_CAM.aimH).toBeLessThan(1);
  });
  it('the prop cam cuts in before any of the body is over the car, and never on the runway far behind it', () => {
    const rim = { z: -10.28 }, c = OBSTACLE_SPECS.car, nearZ = rim.z + c.zFromRim + 1.04;
    const line = rim.z + c.takeoffFromRim;
    expect(propCutDue(line, nearZ)).toBe(false);                 // standing on the takeoff line: still the runway camera
    expect(propCutDue(nearZ + PROP_CAM.lead + 0.01, nearZ)).toBe(false);
    expect(propCutDue(nearZ + PROP_CAM.lead - 0.01, nearZ)).toBe(true);
    expect(PROP_CAM.lead).toBeGreaterThan(0.4);                  // a toe leads the root by ~0.55 m at the takeoff
    expect(line - nearZ).toBeGreaterThan(PROP_CAM.lead);         // …and the cut is still in the air, not on the floor
  });
  it('the car leaves the takeoff toe room: the near door is ≥ 0.85 m in front of the line', () => {
    const c = OBSTACLE_SPECS.car;
    expect(c.takeoffFromRim - (c.zFromRim + 1.04)).toBeGreaterThanOrEqual(0.85);   // 0.76 m let the swing leg's toe graze the door
  });
});
