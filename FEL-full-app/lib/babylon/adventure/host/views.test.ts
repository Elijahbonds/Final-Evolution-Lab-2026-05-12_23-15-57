// A4's view checks on a NullEngine scene: the yard builds into a handful of draws; placeholder bodies follow their
// actors; and THE BANK SIGN A1 asked to verify (movement/view.ts: "assumption: Babylon's +z roll lifts the right side,
// so a right-wing-down bank is a negative z rotation") — measured here on the real sim and the real view binder: a
// cruise turned right banks right wing DOWN on screen.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { createMovementSystem } from '../movement';
import { fakeWorld, makeActor, Runner } from '../movement/testkit';
import { bindMovementView } from '../movement/view';
import { buildSandbox } from '../world/sandbox';
import { buildCreatureBody, buildMonsterBody, buildYardView, placeBody } from '../world/view';
import { createMonsterActor, MONSTERS } from '../combat/monsters/defs';

let scene: Scene;
beforeAll(() => {
  scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 2, -6), scene);
});

describe('the yard view', () => {
  it('builds the yard into a handful of meshes and disposes clean; the gate follows its piece', () => {
    const before = scene.meshes.length;
    const spec = buildSandbox();
    const v = buildYardView(scene, spec);
    const built = scene.meshes.length - before;
    expect(built).toBeGreaterThan(3);
    expect(built).toBeLessThanOrEqual(8);    // ground, rim, slope, walls, gate, rails (+ lane lines merged in)
    const gate = scene.getMeshByName(`yard_${spec.gate.id}`)!;
    v.sync(); expect(gate.isEnabled()).toBe(true);
    spec.gate.off = true; v.sync(); expect(gate.isEnabled()).toBe(false);
    v.dispose();
    expect(scene.meshes.length).toBe(before);
  });

  it('placeholder bodies sit on their actors and yaw with them', () => {
    const m = createMonsterActor(MONSTERS.brute, 'b1', { x: 3, y: 0, z: 9 });
    m.facingYaw = 1.1;
    const body = buildMonsterBody(scene, m, 'brute');
    placeBody(body.root, m);
    expect(body.root.position.asArray()).toEqual([3, 0, 9]);
    expect(body.root.rotation.y).toBeCloseTo(1.1);
    body.dispose();
    const q = makeActor('q', 'partner');
    const c = buildCreatureBody(scene, q, 'wind', 2);
    expect(c.meshes.length).toBe(3);   // a flying stage carries its wings
    c.dispose();
  });
});

describe('the bank sign (A1\'s open assumption, measured)', () => {
  it('a cruise turned right banks the body right wing DOWN', () => {
    const world = fakeWorld();
    const r = new Runner(world, [createMovementSystem({ bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 } })]);
    const sys = r.systems[0] as ReturnType<typeof createMovementSystem>;
    const p = world.add(makeActor('p1', 'player', { fusion: { active: true, tier: 1, meter: 1, remainingSec: 99, partnerId: 'x', element: 'wind', grantsFlight: true } }));
    p.stats.energy.cur = p.stats.energy.max = 1000;
    const root = new TransformNode('bank_root', scene);
    const pose = new TransformNode('bank_pose', scene);
    pose.parent = root;
    const view = bindMovementView({ animator: { play: () => null, setSpeed: () => {} }, poseNode: pose, actor: () => p, telemetry: () => sys.inspect('p1'), clock: () => r.tSec });
    const inp = r.input('p1');
    r.press('p1', 'jump'); inp.jumpHeld = true; r.tick(8);
    r.press('p1', 'jump'); r.tick(); inp.jumpHeld = false;
    inp.ascendHeld = true; r.run(1); inp.ascendHeld = false;
    inp.move.y = 1; inp.dashHeld = true; r.press('p1', 'dash');
    r.run(1.5, () => view.sync(1 / 60));
    expect(sys.inspect('p1')!.flight.mode).toBe('cruise');
    const yaw0 = p.facingYaw;
    inp.move.x = 1;   // turn right
    r.run(1.2, () => view.sync(1 / 60));
    expect(sys.inspect('p1')!.flight.bank).toBeGreaterThan(0.3);   // the sim's bank: right wing down is +
    expect(p.facingYaw).toBeGreaterThan(yaw0);                      // yaw grows toward +x: a right turn
    // the view: the body's right (+x local) is BELOW its left in the world
    placeBody(root, p);
    root.computeWorldMatrix(true); pose.computeWorldMatrix(true);
    const right = Vector3.TransformCoordinates(new Vector3(1, 0, 0), pose.getWorldMatrix());
    const left = Vector3.TransformCoordinates(new Vector3(-1, 0, 0), pose.getWorldMatrix());
    expect(pose.rotation.z).toBeLessThan(0);
    expect(right.y).toBeLessThan(left.y - 0.2);
    view.dispose(); pose.dispose(); root.dispose();
  });
});
