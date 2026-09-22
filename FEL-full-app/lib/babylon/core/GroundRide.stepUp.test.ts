// SKATE-MAJOR (2026-09-21): an interior solid is a WALL, not an elevator.
//
// The Rider has no horizontal collision — one downward ray from 1.5 m above the wheels — so riding a grounded board into
// any solid under 1.5 m tall snapped the root onto its top in ONE frame (the plaza's table: 0.78 m, its ledges 0.90, its
// bins 1.05), and the rail magnet then handed the lifted rider a free grind on top. `stepUp` draws the line: a kerb is
// rolled up, a table is a wall the wheels stop at and report, and a rider who is AIRBORNE still lands on top of anything.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { Rider, faceNormalToward } from './GroundRide';

function world() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ground = MeshBuilder.CreateGround('floor', { width: 60, height: 60 }, scene);
  // the picnic table: 2.4 wide (x) × 0.78 tall × 4.6 long (z), long side facing −x, centred at x 10
  const table = MeshBuilder.CreateBox('table', { width: 2.4, height: 0.78, depth: 4.6 }, scene);
  table.position.set(10, 0.39, 0);
  // a kerb-high manual pad a board rolls onto
  const pad = MeshBuilder.CreateBox('pad', { width: 3.2, height: 0.32, depth: 9.5 }, scene);
  pad.position.set(-10, 0.16, 0);
  // a bench turned 90°, so its bounding box is rotated in the world
  const bench = MeshBuilder.CreateBox('bench', { width: 1.0, height: 0.52, depth: 4.2 }, scene);
  bench.position.set(0, 0.26, 12); bench.rotation.y = Math.PI / 2;
  // a real kerb
  const kerb = MeshBuilder.CreateBox('kerb', { width: 3, height: 0.10, depth: 3 }, scene);
  kerb.position.set(17, 0.05, 10);
  // an outer bank EXACTLY as rideWorlds builds one: a 10 × 0.6 × 6 slab at y 1.15 tilted −0.42 (its +z end is the lip), so
  // its foot sits 0.20 m above the floor — the lip a kerb rule has to take in stride. Ridden up along +z.
  const bank = MeshBuilder.CreateBox('bank', { width: 10, height: 0.6, depth: 6 }, scene);
  bank.position.set(-20, 1.15, -20); bank.rotation.x = -0.42;
  // the leaned wallride: 11 wide, 0.5 deep, 3.2 tall, leaned back 0.16 rad, its park-side face at z ≈ 20
  const wallride = MeshBuilder.CreateBox('wallride', { width: 11, height: 3.2, depth: 0.5 }, scene);
  wallride.position.set(0, 1.6, 20.25); wallride.rotation.x = -0.16;
  for (const m of [ground, table, pad, bench, kerb, bank, wallride]) m.computeWorldMatrix(true);
  const root = new TransformNode('root', scene);
  return { scene, ground, table, pad, bench, kerb, bank, wallride, root, dispose: () => { scene.dispose(); engine.dispose(); } };
}

/** Drive the rider at `speed` along its facing for up to `frames`, re-aiming the velocity down the facing each frame as
 *  the mode does; `onFrame` may return true to stop. */
function ride(r: Rider, speed: number, frames: number, onFrame?: (i: number) => boolean | void): void {
  for (let i = 0; i < frames; i++) {
    const yaw = r.root.rotation.y;
    r.vel.x = Math.sin(yaw) * speed; r.vel.z = Math.cos(yaw) * speed;
    r.update(1 / 60, 0, 0);
    if (onFrame?.(i)) return;
  }
}

describe('Rider.stepUp — the interior solids', () => {
  it('a grounded board rolling into the table STOPS at its face and reports it, instead of rising onto it', () => {
    const w = world();
    const r = new Rider(w.scene, w.root, [w.ground, w.table, w.pad, w.bench], { carveAccel: 0, stepUp: 0.45 });
    w.root.position.set(6, 0, 0); w.root.rotation.y = Math.PI / 2;   // facing +x, at the table
    let hits = 0, maxY = 0, lastHit: typeof r.solidHit = null;
    ride(r, 8, 60, () => { maxY = Math.max(maxY, w.root.position.y); if (r.solidHit) { hits++; lastHit = r.solidHit; } });
    expect(maxY).toBeLessThan(0.05);                       // never lifted
    expect(hits).toBeGreaterThan(0);                       // the wall was reported
    expect(lastHit!.mesh.name).toBe('table');
    expect(lastHit!.nx).toBeCloseTo(-1, 3);                // the face he met looks back at him (−x)
    expect(Math.abs(lastHit!.nz)).toBeLessThan(1e-3);
    expect(lastHit!.top).toBeCloseTo(0.78, 2);
    expect(w.root.position.x).toBeLessThan(8.9);           // stopped short of the box (its face is at x 8.8)
    expect(r.grounded).toBe(true);
    w.dispose();
  });

  it('a kerb is rolled over; the manual pad (0.32, a box face) is a wall you ollie onto', () => {
    const w = world();
    const r = new Rider(w.scene, w.root, [w.ground, w.table, w.pad, w.bench, w.kerb], { carveAccel: 0, stepUp: 0.45 });
    w.root.position.set(-14, 0, 0); w.root.rotation.y = Math.PI / 2;
    let hits = 0;
    ride(r, 8, 60, () => { if (r.solidHit) hits++; return w.root.position.x > -10.5; });   // at the pad
    expect(hits).toBeGreaterThan(0);
    expect(w.root.position.y).toBeLessThan(0.05);
    // the kerb (0.10) is taken in stride
    w.root.position.set(14, 0, 10); w.root.rotation.y = Math.PI / 2; hits = 0;
    ride(r, 8, 60, () => { if (r.solidHit) hits++; return w.root.position.x > 18; });
    expect(hits).toBe(0);
    expect(w.root.position.y).toBeCloseTo(0.10, 2);
    w.dispose();
  });

  it('a bank is ridden up — the slope test never refuses a ramp', () => {
    const w = world();
    const r = new Rider(w.scene, w.root, [w.ground, w.bank], { carveAccel: 0, stepUp: 0.45 });
    w.root.position.set(-20, 0, -25); w.root.rotation.y = 0;   // riding +z up the bank (its foot is at z −23, lip at z −17)
    let hits = 0, top = 0;
    ride(r, 9, 80, () => { if (r.solidHit) hits++; top = Math.max(top, w.root.position.y); return w.root.position.z > -17.6; });
    expect(hits).toBe(0);
    expect(top).toBeGreaterThan(1.8);
    w.dispose();
  });

  it('a SLOW board cannot climb the leaned wallride face, and a body already inside its footprint is walked back out', () => {
    const w = world();
    const r = new Rider(w.scene, w.root, [w.ground, w.wallride], { carveAccel: 0, stepUp: 0.45 });
    // 3 m/s at the face: the leaned face used to rise 0.31 m a frame here — under the step, so it was climbed
    w.root.position.set(0, 0, 15); w.root.rotation.y = 0;
    let hits = 0, maxY = 0;
    ride(r, 3, 120, () => { if (r.solidHit) hits++; maxY = Math.max(maxY, w.root.position.y); });
    expect(hits).toBeGreaterThan(0);
    expect(maxY).toBeLessThan(0.05);
    // a body already IN the face (the leaned face is 0.62 m up at z 20.1) riding along it: the old revert pinned it there
    w.root.position.set(0, 0, 20.1); w.root.rotation.y = Math.PI / 2;
    let moved = 0, climbed = 0;
    ride(r, 4, 60, () => { moved = Math.abs(w.root.position.x); climbed = Math.max(climbed, w.root.position.y); });
    expect(moved).toBeGreaterThan(2);                       // it kept sliding along the face…
    expect(w.root.position.z).toBeLessThan(20.05);          // …was pushed back out of it to the toe of the lean…
    expect(climbed).toBeLessThan(0.15);                     // …and never went up it (the toe is a kerb's height)
    w.dispose();
  });

  it('a slipped grind drops the rider OFF THE SIDE of the rail, no hop; the rail end still hops', () => {
    const w = world();
    const r = new Rider(w.scene, w.root, [w.ground], { carveAccel: 0, stepUp: 0.45 });
    const rail = { a: new Vector3(0, 0.5, -3), b: new Vector3(0, 0.5, 3), bonus: 100 };
    w.root.position.set(0.2, 0.9, -2); r.grounded = false; r.vel.set(0, -1, 6);
    expect(r.tryGrind([rail], 2)).toBe(rail);
    r.update(1 / 60, 0, 0);
    r.dismount('slip', 1);
    expect(r.grinding).toBeNull();
    expect(r.vel.y).toBeLessThan(1);                                   // a fall, not the 2.5 m/s hop
    expect(Math.abs(r.vel.x)).toBeGreaterThan(0.8);                    // off the side (the rail runs down z)
    expect(Math.hypot(r.vel.x, r.vel.z)).toBeLessThan(6);              // and the run is broken, not carried
    // the rail's end is the clean exit it always was
    w.root.position.set(0.2, 0.9, -2); r.grounded = false; r.vel.set(0, -1, 6);
    r.tryGrind([rail], 2); r.dismount();
    expect(r.vel.y).toBeCloseTo(2.5, 3);
    w.dispose();
  });

  it('an AIRBORNE rider still lands on top of the table — an ollie onto a ledge is the whole point of a ledge', () => {
    const w = world();
    const r = new Rider(w.scene, w.root, [w.ground, w.table, w.pad, w.bench], { carveAccel: 0, stepUp: 0.45 });
    w.root.position.set(8.2, 0, 0); w.root.rotation.y = Math.PI / 2;
    ride(r, 2, 1);
    r.jump(0.6);
    let hits = 0, flew = 0;
    ride(r, 2, 120, (i) => { if (r.solidHit) hits++; if (!r.grounded) flew = i; return i > 2 && r.grounded; });   // until touchdown
    expect(hits).toBe(0);
    expect(flew).toBeGreaterThan(20);                      // it was a real air
    expect(r.grounded).toBe(true);
    expect(w.root.position.x).toBeGreaterThan(8.8);        // over the table's face…
    expect(w.root.position.y).toBeCloseTo(0.78, 2);        // …and standing on its top
    w.dispose();
  });

  it('a rotated bench answers with the face actually met', () => {
    const w = world();
    const r = new Rider(w.scene, w.root, [w.ground, w.table, w.pad, w.bench], { carveAccel: 0, stepUp: 0.45 });
    w.root.position.set(0, 0, 8); w.root.rotation.y = 0;   // riding +z at the bench's long side (it spans x ±2.1 at z 12 ± 0.5)
    let last: typeof r.solidHit = null;
    ride(r, 8, 60, () => { if (r.solidHit) last = r.solidHit; });
    expect(last).not.toBeNull();
    expect(last!.mesh.name).toBe('bench');
    expect(last!.nz).toBeCloseTo(-1, 3);
    expect(Math.abs(last!.nx)).toBeLessThan(1e-3);
    expect(w.root.position.y).toBeLessThan(0.05);
    w.dispose();
  });

  it('with no stepUp (snow, surf) nothing changes: the historic one-frame snap onto a solid stays', () => {
    const w = world();
    const r = new Rider(w.scene, w.root, [w.ground, w.table, w.pad, w.bench], { carveAccel: 0 });
    w.root.position.set(6, 0, 0); w.root.rotation.y = Math.PI / 2;
    let hits = 0;
    ride(r, 8, 60, () => { if (r.solidHit) hits++; return w.root.position.x > 9.5; });   // onto the table
    expect(hits).toBe(0);
    expect(w.root.position.y).toBeCloseTo(0.78, 2);
    w.dispose();
  });

  it('faceNormalToward picks the nearest outside face, in the mesh\'s own frame', () => {
    const w = world();
    const west = faceNormalToward(w.table, 8, 0, 0.5);
    expect(west.x).toBeCloseTo(-1, 3);
    const south = faceNormalToward(w.table, 10.5, 0, -3);
    expect(south.z).toBeCloseTo(-1, 3);
    // a corner: further outside on x than on z → the x face
    const corner = faceNormalToward(w.table, 7, 0, -2.5);
    expect(corner.x).toBeCloseTo(-1, 3);
    // the rotated bench: its local +x face points at world +z
    const benchN = faceNormalToward(w.bench, 0, 0, 14);
    expect(benchN.z).toBeCloseTo(1, 3);
    w.dispose();
  });
});

// BOARDS PASS (2026-09-22): the fall through the world
describe('Rider on a pitched piste — a stalled frame is not a fall', () => {
  function piste() {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('piste', { width: 40, height: 800 }, scene);
    ground.rotation.x = 0.22; const c = 380; ground.position.set(0, -Math.sin(0.22) * c, Math.cos(0.22) * c); ground.isPickable = true;
    ground.computeWorldMatrix(true); ground.refreshBoundingInfo();
    const root = new TransformNode('rider', scene); root.position.set(0, 0.2, 4);
    const rider = new Rider(scene, root, [ground], { hardFloorY: -150, rayLength: 80, stickDown: 0.6 });
    return { scene, root, rider };
  }
  it('a 1.2 s first frame leaves the rider ON the snow, not 148 m under it', () => {
    const { root, rider } = piste();
    rider.update(1.2, 0, 0);                       // the load stall
    for (let i = 0; i < 10; i++) rider.update(1 / 60, 0, 0);
    const surface = -Math.tan(0.22) * root.position.z;
    expect(root.position.y).toBeGreaterThan(surface - 0.6);
    expect(root.position.y).toBeLessThan(surface + 1.0);
    expect(root.position.y).toBeGreaterThan(-20);
  });
  it('a body already under the surface finds the snow again instead of the world floor', () => {
    const { root, rider } = piste();
    for (let i = 0; i < 30; i++) rider.update(1 / 60, 0, 0);   // stood on the snow once: the last ground is known
    root.position.y -= 6;                                     // punched under it
    for (let i = 0; i < 12; i++) rider.update(1 / 60, 0, 0);
    const surface = -Math.tan(0.22) * root.position.z;
    expect(Math.abs(root.position.y - surface)).toBeLessThan(1.0);
  });
});
