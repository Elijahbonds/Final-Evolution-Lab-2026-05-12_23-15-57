import { describe, expect, it } from 'vitest';
import { OBSTACLE_KINDS, OBSTACLE_SPECS, PROP_CAM, ROW_SPACING_M, ROW_ALONG_SPACING_M, boxProfile, clipsObstacle, heightAt, nextObstacle, propCamSpot, propCutDue } from './DunkObstacles';

describe('DunkObstacles — cars and other objects', () => {
  it('every kind is readable, sourced, and ordered by what it costs to clear', () => {
    expect(OBSTACLE_KINDS).toEqual(['car', 'barrier', 'crate', 'tetris', 'ladder', 'bike', 'bikeroll', 'skate', 'skateroll', 'row3', 'row5', 'wall', 'kangaroo']);   // the kangaroo is the one animal left (the giraffe came out 2026-09-18)
    expect(OBSTACLE_SPECS.car.source).toEqual({ meshy: 'sedan' });
    expect(OBSTACLE_SPECS.tetris.source).toEqual({ bodies: 'stack' });   // two of the game's own bodies, not a prop file
    expect(OBSTACLE_SPECS.car.bonus).toBeGreaterThan(OBSTACLE_SPECS.crate.bonus);
    expect(OBSTACLE_SPECS.crate.bonus).toBeGreaterThan(OBSTACLE_SPECS.barrier.bonus);
    expect(OBSTACLE_SPECS.car.takeoffFromRim).toBeGreaterThan(OBSTACLE_SPECS.car.zFromRim + 1);   // a long jump: the takeoff sits well before the near door
    for (const k of OBSTACLE_KINDS) {
      const s = OBSTACLE_SPECS[k];
      expect(s.kind, k).toBe(k);
      expect(s.label.length, k).toBeGreaterThan(0);
      expect(s.bonus, k).toBeGreaterThan(0);
      expect(s.takeoffFromRim, k).toBeGreaterThan(s.zFromRim);           // you take off before the thing, always
      expect(s.nominalHeight, k).toBeLessThan(1.84);                      // the dunker's apex: nothing on the card is unclearable
    }
  });

  // PEOPLE IN A ROW (owner, 2026-09-16: "over a # of people in a row").
  it('a row is people shoulder to shoulder, and more people is worth more', () => {
    expect(OBSTACLE_SPECS.row3.source).toEqual({ bodies: 'row' });
    expect(OBSTACLE_SPECS.row3.bodyCount).toBe(3);
    expect(OBSTACLE_SPECS.row5.bodyCount).toBe(5);
    expect(OBSTACLE_SPECS.row5.bonus).toBeGreaterThan(OBSTACLE_SPECS.row3.bonus);
    expect(OBSTACLE_SPECS.row5.bonus).toBeGreaterThan(OBSTACLE_SPECS.tetris.bonus);   // the biggest thing on the card
    expect(ROW_SPACING_M).toBeGreaterThan(0.45);   // shoulder to shoulder, not standing inside each other
    expect(ROW_SPACING_M).toBeLessThan(0.9);
    // and the labels say the number, because the number is the whole prop
    expect(OBSTACLE_SPECS.row3.label).toMatch(/THREE/);
    expect(OBSTACLE_SPECS.row5.label).toMatch(/FIVE/);
  });

  it('the built props are built, and they are the right size to be what they are', () => {
    expect(OBSTACLE_SPECS.ladder.source).toEqual({ built: 'ladder' });
    expect(OBSTACLE_SPECS.bike.source).toEqual({ built: 'bike' });
    expect(OBSTACLE_SPECS.ladder.nominalHeight).toBeGreaterThan(OBSTACLE_SPECS.barrier.nominalHeight);
    expect(OBSTACLE_SPECS.bike.nominalHeight).toBeGreaterThan(OBSTACLE_SPECS.crate.nominalHeight);   // there is a person sitting on it
  });
  // The clear banner is `OVER THE ${label}!`, so the label must not bring its own article — measured on rc26, where
  // THE TETRIS read "OVER THE THE TETRIS!".
  it('no label carries its own article: the banner supplies it', () => {
    for (const s of Object.values(OBSTACLE_SPECS)) expect(s.label.startsWith('THE ')).toBe(false);
  });
  it('THE TETRIS is clearable: the hitbox is their lap, not the rider\'s head', () => {
    // the rider's head is ~2.3 m up and the dunker's apex off a full charge is 1.84 — a hitbox at the top of the stack
    // is a dunk nobody in the game can do, so the profile tops out at what the feet actually have to clear
    expect(OBSTACLE_SPECS.tetris.nominalHeight).toBeLessThan(1.84);
    expect(OBSTACLE_SPECS.tetris.nominalHeight).toBeGreaterThan(OBSTACLE_SPECS.car.nominalHeight);   // still the tallest thing on the card
    expect(OBSTACLE_SPECS.tetris.takeoffFromRim).toBeGreaterThan(OBSTACLE_SPECS.crate.takeoffFromRim);
  });
  it('the d-pad cycles every kind and comes back round', () => {
    expect(nextObstacle(null)).toBe('car');
    let k = OBSTACLE_KINDS[0];
    for (let i = 1; i < OBSTACLE_KINDS.length; i++) { k = nextObstacle(k); expect(k).toBe(OBSTACLE_KINDS[i]); }
    expect(nextObstacle(k)).toBe('car');   // all the way round
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

// RIDDEN AND MOVING PROPS (owner, 2026-09-16: "have someone on the bike, have the option to have it moving, do the
// same thing for a skateboard").
describe('somebody is on it, and it can be moving', () => {
  it('the bike and the board both carry a rider, and both have a moving twin', () => {
    expect(OBSTACLE_SPECS.bike.rider).toBe('bike');
    expect(OBSTACLE_SPECS.skate.rider).toBe('skate');
    expect(OBSTACLE_SPECS.bikeroll.rider).toBe('bike');
    expect(OBSTACLE_SPECS.skateroll.rider).toBe('skate');
    expect(OBSTACLE_SPECS.bike.speed ?? 0).toBe(0);         // the parked ones stand still
    expect(OBSTACLE_SPECS.skate.speed ?? 0).toBe(0);
    expect(OBSTACLE_SPECS.bikeroll.speed!).toBeGreaterThan(0);
    expect(OBSTACLE_SPECS.skateroll.speed!).toBeGreaterThan(0);
  });

  it('a moving one is worth more than the same thing parked — it is a timing problem as well as a jump', () => {
    expect(OBSTACLE_SPECS.bikeroll.bonus).toBeGreaterThan(OBSTACLE_SPECS.bike.bonus);
    expect(OBSTACLE_SPECS.skateroll.bonus).toBeGreaterThan(OBSTACLE_SPECS.skate.bonus);
  });

  it('a rider stays under the apex: the cyclist leans over the bars and the skater crouches', () => {
    for (const k of ['bike', 'bikeroll', 'skate', 'skateroll'] as const) {
      expect(OBSTACLE_SPECS[k].nominalHeight, k).toBeLessThan(1.84);
      expect(OBSTACLE_SPECS[k].nominalHeight, k).toBeGreaterThan(1.0);   // and there is visibly a person on it
    }
  });

  // THE HITBOX HAS TO TRAVEL WITH IT. Otherwise the bike is drawn eight metres away and still clips the feet on the
  // centreline, which is the exact bug a moving obstacle invites.
  it('the hitbox moves with a moving prop', () => {
    const p = boxProfile(3, 0.4, 1.5, 0.6);
    expect(clipsObstacle(p, 1.0, 0, 3)).toBe(true);        // parked on the centreline: in the way
    p.centerX = 3;
    expect(clipsObstacle(p, 1.0, 0, 3)).toBe(false);       // rolled three metres off it: not in the way
    expect(clipsObstacle(p, 1.0, 3, 3)).toBe(true);        // …and in the way of anyone standing where it now is
  });
});

// THE ROW IS LONGITUDINAL, THE WALL IS ACROSS (owner: "it's supposed to be 5 in a row longitudinal, straight" /
// "keep that too for a set up, that's good for jclark's, Jonathan's wall").
describe('the row and the wall are different dunks', () => {
  it('the row runs away down the runway and the wall stands across it', () => {
    expect(OBSTACLE_SPECS.row5.source).toEqual({ bodies: 'row' });
    expect(OBSTACLE_SPECS.wall.source).toEqual({ bodies: 'wall' });
    expect(OBSTACLE_SPECS.wall.bodyCount).toBe(5);
  });
  it('the row is a LONG jump: more people is a longer take-off', () => {
    expect(OBSTACLE_SPECS.row5.takeoffFromRim).toBeGreaterThan(OBSTACLE_SPECS.row3.takeoffFromRim);
    expect(OBSTACLE_SPECS.row5.takeoffFromRim).toBeGreaterThan(OBSTACLE_SPECS.wall.takeoffFromRim);   // the wall is one person deep
  });
  // owner, 2026-09-16: "the people can stand up" — in the row as well as the wall, so the row is a long jump at full
  // height rather than a low hurdle
  // The row's hitbox is what they DUCK to, and it has to be: the flight is a parabola to a 1.84 m apex, so the feet are
  // above 1.75 m for only ~0.9 m of floor. Measured in the lab before this was right — five standing people blew the
  // dunk two attempts out of two.
  it('the deeper the prop, the lower the hitbox has to be, or nobody can clear it', () => {
    const clearableLength = (h: number, apex = 1.84) => {
      const disc = 1 - h / apex;                                     // 4k(1-k)*apex > h
      const k = (1 - Math.sqrt(disc)) / 2; return (1 - 2 * k) * 4;  // as a fraction of a ~4 m take-off-to-rim span
    };
    // Only the ROWS are checked here, because they are the only props whose depth this table sets — everything else is
    // one object deep and was cleared live in the lab. (The TETRIS sits within a hair of this line at 1.75 m over a
    // 0.9 m footprint, which is exactly why its rider ducks.)
    // The rows are the only props whose depth this table sets. The people stand at full height, so what makes them
    // clearable is the JUMP: apexLift is the run-up over a deep prop buying a bigger arc, and this is the sum that
    // says how much is enough.
    for (const k of ['row3', 'row5'] as const) {
      const s = OBSTACLE_SPECS[k];
      const n = s.bodyCount!;
      const depth = (n - 1) * ROW_ALONG_SPACING_M + 0.3;
      expect(s.apexLift ?? 0, `${k} needs a bigger jump than the flat runway gives`).toBeGreaterThan(0);
      expect(clearableLength(s.nominalHeight, 1.84 + s.apexLift!), `${k} is too tall for how deep it is`).toBeGreaterThan(depth);
    }
  });
  it('the wall stands at the height the tetris proved clearable', () => {
    expect(OBSTACLE_SPECS.wall.nominalHeight).toBe(OBSTACLE_SPECS.tetris.nominalHeight);
  });
  it('the bike comes AT you and the skater crosses you — two different problems', () => {
    expect(OBSTACLE_SPECS.bikeroll.axis).toBe('z');
    expect(OBSTACLE_SPECS.skateroll.axis ?? 'x').toBe('x');
  });
  it('a prop coming down the runway carries its hitbox with it', () => {
    const p = boxProfile(3, 0.4, 1.5, 0.6);
    expect(clipsObstacle(p, 1.0, 0, 3)).toBe(true);
    p.zShift = 2.5;                                    // it has rolled two and a half metres up the runway
    expect(clipsObstacle(p, 1.0, 0, 3)).toBe(false);   // no longer where it was
    expect(clipsObstacle(p, 1.0, 0, 5.5)).toBe(true);  // it is here now
  });
});
