// Does a wall take the board, does the plant kick off it, does the lip hold a stall and drop you back in fakie?
import { describe, it, expect } from 'vitest';
import { WALL_RIDE, LIP, KICK_PLANT, canWallplant, wallAhead, kickPlantVel, canWallRide, startWallRide, stepWallRide, wallRideExitVel, wallplantVel, wallSide, canLipStall, startLipStall, stepLipStall, dropInVel, lipStallPts, lipTrickFor, type Wall, type Lip } from './WallRide';

/** A wall along x at z 10, its face toward the park (−z), 3.2 m high, leaned back 0.16 rad. */
const WALL: Wall = { a: { x: -5, z: 10 }, b: { x: 5, z: 10 }, nx: 0, nz: -1, height: 3.2, lean: 0.16, label: 'wallride' };
/** A bank crest along x at z −14.5, 1.9 m up, approached going +z. */
const CREST: Lip = { a: { x: -4, z: -14.5 }, b: { x: 4, z: -14.5 }, y: 1.9, ux: 0, uz: 1, label: 'spine crest' };

describe('the wall ride', () => {
  it('takes an airborne board flying INTO the wall inside reach and the height band, and nothing else', () => {
    expect(canWallRide({ x: 0, y: 1.2, z: 9.4 }, { x: 3, y: 0.5, z: 4 }, [WALL], true)).toBe(WALL);
    expect(canWallRide({ x: 0, y: 1.2, z: 9.4 }, { x: 3, y: 0.5, z: 4 }, [WALL], false)).toBeNull();     // on the ground
    expect(canWallRide({ x: 0, y: 1.2, z: 9.4 }, { x: 3, y: 0.5, z: -4 }, [WALL], true)).toBeNull();     // flying away
    expect(canWallRide({ x: 0, y: 1.2, z: 7 }, { x: 3, y: 0.5, z: 4 }, [WALL], true)).toBeNull();        // too far
    expect(canWallRide({ x: 0, y: 3.15, z: 9.4 }, { x: 3, y: 0.5, z: 4 }, [WALL], true)).toBeNull();     // over the top
    expect(canWallRide({ x: 0, y: 0.1, z: 9.4 }, { x: 3, y: 0.5, z: 4 }, [WALL], true)).toBeNull();      // on the floor
  });
  it('rides along the wall the way the run leaned, bleeds height, and ends inside the cap', () => {
    const st = startWallRide(WALL, { x: 0, y: 1.4, z: 9.4 }, { x: 3.5, y: 1.0, z: 4 });
    expect(st.dir).toBe(1);
    let p = stepWallRide(st, 0), n = 0;
    const x0 = p.x, y0 = p.y;
    while (!p.done && n++ < 200) p = stepWallRide(st, 1 / 60);
    expect(p.done).toBe(true);
    expect(p.x).toBeGreaterThan(x0 + 1.5);           // travelled along
    expect(p.y).toBeLessThan(y0);                    // came down
    expect(st.t).toBeLessThanOrEqual(WALL_RIDE.maxSec + 1 / 60);
    // the board sits just off the face, on the park side, all the way
    expect(p.z).toBeLessThan(WALL.a.z);
    expect(wallSide(st)).toBe(-1);                   // travelling +x with the wall at +z: the wall is on the LEFT
  });
  it('the exit pushes off the wall and the plant kicks away and up, facing the kick', () => {
    const st = startWallRide(WALL, { x: 0, y: 1.4, z: 9.4 }, { x: 3.5, y: 0, z: 4 });
    const ex = wallRideExitVel(st);
    expect(ex.z).toBeLessThan(0); expect(ex.x).toBeGreaterThan(2); expect(ex.y).toBeGreaterThan(0);
    const pl = wallplantVel(st);
    expect(pl.z).toBeLessThan(-3); expect(pl.y).toBe(WALL_RIDE.plantVy);
    expect(Math.abs(pl.yaw - Math.atan2(pl.x, pl.z))).toBeLessThan(1e-9);
  });
});

describe('lip tricks', () => {
  it('catch the crest only going UP the bank, near it, at its height', () => {
    expect(canLipStall({ x: 0, y: 1.5, z: -15.0 }, { x: 0, z: 4 }, [CREST])?.lip).toBe(CREST);
    expect(canLipStall({ x: 0, y: 1.5, z: -15.0 }, { x: 0, z: -4 }, [CREST])).toBeNull();   // going down it
    expect(canLipStall({ x: 0, y: 0.3, z: -15.0 }, { x: 0, z: 4 }, [CREST])).toBeNull();    // at the bottom
    expect(canLipStall({ x: 0, y: 1.5, z: -17 }, { x: 0, z: 4 }, [CREST])).toBeNull();      // too far
  });
  it('the held direction names the trick; the stall holds at least minSec and never past maxSec; the drop goes back down fakie', () => {
    expect(lipTrickFor(null).id).toBe('rock_fakie');
    expect(lipTrickFor('up').id).toBe('nose_stall');
    expect(lipTrickFor('right').pts).toBeGreaterThan(lipTrickFor(null).pts);
    const hit = canLipStall({ x: 0.5, y: 1.6, z: -15 }, { x: 0, z: 4 }, [CREST])!;
    const st = startLipStall(hit, 'left');
    expect(st.trick.label).toBe('DISASTER');
    expect(stepLipStall(st, 0.2, false).done).toBe(false);   // released early: holds to minSec
    expect(stepLipStall(st, 0.3, false).done).toBe(true);
    const held = startLipStall(hit, null);
    let d = false, t = 0; while (!d && t < 3) { d = stepLipStall(held, 0.1, true).done; t += 0.1; }
    expect(held.t).toBeCloseTo(LIP.maxSec, 1);
    const v = dropInVel(held);
    expect(v.z).toBeLessThan(0);                     // back down the way he came (the bank rises toward +z)
    expect(v.y).toBeLessThan(0);
    expect(lipStallPts(held)).toBeGreaterThan(held.trick.pts);
  });
});

// ASSET-POLISH (2026-10-05; owner: "put a kick plant with the same button as the jump button when you press it off a wall.
// Add wall rides."). The plant used to exist only as a way off a wall ride, and the ride only took a steep run at the wall.
describe('the kick plant and the shallow line onto a wall', () => {
  it('a shallow line along the wall rides it now; a board leaving the wall still does not', () => {
    // 0.6 m/s into the wall at 5 m/s along it: refused at the old 1.2 m/s threshold
    expect(canWallRide({ x: 0, y: 1.2, z: 9.5 }, { x: 5, y: 0.5, z: 0.6 }, [WALL], true)).toBe(WALL);
    // dead parallel, close and fast: the parallel line (the leaned face is 0.19 m further back at 1.2 m, so z 9.65 is 0.54 m off)
    expect(canWallRide({ x: 0, y: 1.2, z: 9.65 }, { x: 5, y: 0.5, z: 0 }, [WALL], true)).toBe(WALL);
    // parallel but slow, too far off for the parallel line, or drifting off the wall: no
    expect(canWallRide({ x: 0, y: 1.2, z: 9.65 }, { x: 2, y: 0.5, z: 0 }, [WALL], true)).toBeNull();
    expect(canWallRide({ x: 0, y: 1.2, z: 9.45 }, { x: 5, y: 0.5, z: 0 }, [WALL], true)).toBeNull();
    expect(canWallRide({ x: 0, y: 1.2, z: 9.65 }, { x: 5, y: 0.5, z: -1 }, [WALL], true)).toBeNull();
    // FROM BEHIND, never: the far face of a 0.4 m free-standing wall, with the rider just off its near face (measured live:
    // the two faces of the street wall traded the rider every frame, +0.5 m/s a catch)
    const BACK: Wall = { a: { x: -5, z: 10.4 }, b: { x: 5, z: 10.4 }, nx: 0, nz: 1, height: 2.2, lean: 0, label: 'far face' };
    const NEAR: Wall = { a: { x: -5, z: 10 }, b: { x: 5, z: 10 }, nx: 0, nz: -1, height: 2.2, lean: 0, label: 'near face' };
    // pushed off the near face (−z, away from it) the rider is 0.62 m behind the far face and moving INTO it from behind
    expect(canWallRide({ x: 0, y: 1.2, z: 9.78 }, { x: 5, y: 0, z: -1.6 }, [BACK, NEAR], true)).toBeNull();
    expect(canWallplant({ x: 0, y: 1.2, z: 9.78 }, { x: 0, z: -3 }, [BACK, NEAR], true)).toBeNull();
    // the same far face from its own front still takes him
    expect(canWallRide({ x: 0, y: 1.2, z: 10.62 }, { x: 5, y: 0, z: -1.6 }, [BACK, NEAR], true)).toBe(BACK);
    // a face marked plant-only never rides
    expect(canWallRide({ x: 0, y: 1.2, z: 9.4 }, { x: 3, y: 0.5, z: 4 }, [{ ...WALL, rideable: false }], true)).toBeNull();
  });
  it('JUMP in the air at any face kicks off it: near, coming at it, feet on its height', () => {
    const SHORT: Wall = { ...WALL, height: 0.7, rideable: false, label: 'planter' };
    expect(canWallplant({ x: 0, y: 0.4, z: 9.2 }, { x: 0, z: 3 }, [SHORT], true)).toBe(SHORT);
    expect(canWallplant({ x: 0, y: 0.4, z: 9.2 }, { x: 0, z: 3 }, [SHORT], false)).toBeNull();         // on the ground: that is the pop
    expect(canWallplant({ x: 0, y: 0.4, z: 9.2 }, { x: 0, z: -3 }, [SHORT], true)).toBeNull();         // going away
    expect(canWallplant({ x: 0, y: 0.4, z: 8.6 }, { x: 0, z: 3 }, [SHORT], true)).toBeNull();          // out of reach
    expect(canWallplant({ x: 0, y: 0.68, z: 9.2 }, { x: 0, z: 3 }, [SHORT], true)).toBeNull();         // over the top
  });
  it('the kick goes away from the face and up, keeps a little of the run along it, and faces the way it goes', () => {
    const v = kickPlantVel(WALL, { x: 4, z: 3 });
    expect(v.z).toBeCloseTo(-WALL_RIDE.plantPush, 6);
    expect(v.x).toBeCloseTo(4 * WALL_RIDE.plantAlong, 6);
    expect(v.y).toBe(WALL_RIDE.plantVy);
    expect(v.yaw).toBeCloseTo(Math.atan2(v.x, v.z), 9);
  });
  it('a face AHEAD is a plant coming: on the run, in range, on the face; not beside it, behind it or past its end', () => {
    expect(wallAhead({ x: 0, y: 0.3, z: 8 }, { x: 0, z: 4 }, [WALL], KICK_PLANT.aheadM, KICK_PLANT.intoMps)).toBe(WALL);
    expect(wallAhead({ x: 0, y: 0.3, z: 6 }, { x: 0, z: 4 }, [WALL], KICK_PLANT.aheadM, KICK_PLANT.intoMps)).toBeNull();   // 4 m off
    expect(wallAhead({ x: 0, y: 0.3, z: 8 }, { x: 0, z: -4 }, [WALL], KICK_PLANT.aheadM, KICK_PLANT.intoMps)).toBeNull();  // going away
    expect(wallAhead({ x: 6, y: 0.3, z: 8 }, { x: 0, z: 4 }, [WALL], KICK_PLANT.aheadM, KICK_PLANT.intoMps)).toBeNull();   // past its end
    expect(wallAhead({ x: 0, y: 0.3, z: 8 }, { x: 0.2, z: 0 }, [WALL], KICK_PLANT.aheadM, KICK_PLANT.intoMps)).toBeNull(); // not heading at it
  });
});
