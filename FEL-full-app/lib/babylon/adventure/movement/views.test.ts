// The A1 view binders on a NullEngine scene (lane A1): they build, sync through every traversal state, and dispose
// without leaving meshes behind. The rails are ONE draw. The movement view plays only on a clip change.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import type { RailNetwork } from '../contracts';
import { createMovementSystem } from './index';
import { fakeWorld, makeActor, Runner } from './testkit';
import { bindMovementView } from './view';
import { buildRailMeshes, GrindSparksView } from '../rails/view';
import { SpeedFlightView } from '../flight/view';

// DynamicTexture reaches for OffscreenCanvas (the streak and spark sprites): the same 2-D shim EffectsKit.test uses.
class ShimCtx {
  fillStyle = ''; clearRect(): void {} fillRect(): void {}
  createRadialGradient(): { addColorStop(): void } { return { addColorStop() {} }; }
  createLinearGradient(): { addColorStop(): void } { return { addColorStop() {} }; }
  getImageData(): { data: Uint8ClampedArray } { return { data: new Uint8ClampedArray(4) }; }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(): ShimCtx { return new ShimCtx(); }
};

let scene: Scene; let camera: FreeCamera;
beforeAll(() => {
  scene = new Scene(new NullEngine());
  camera = new FreeCamera('c', new Vector3(0, 2, -6), scene);
});

const net: RailNetwork = { id: 'v', segments: [
  { id: 'a', points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 20 }], speedBias: 0, switches: [] },
  { id: 'b', points: [{ x: 3, y: 1, z: 0 }, { x: 3, y: 1, z: 10 }, { x: 8, y: 2, z: 20 }], smooth: true, speedBias: 0, switches: [] },
] };

describe('A1 views', () => {
  it('the rails are one merged, frozen mesh', () => {
    const before = scene.meshes.length;
    const m = buildRailMeshes(scene, net)!;
    expect(scene.meshes.length).toBe(before + 1);
    expect(m.isWorldMatrixFrozen).toBe(true);
    expect(m.getTotalVertices()).toBeGreaterThan(0);
    m.dispose();
    expect(scene.meshes.length).toBe(before);
    expect(buildRailMeshes(scene, { id: 'e', segments: [] })).toBeNull();
  });

  it('a body runs, jumps, grinds, flies and cruises with all three views synced, then disposes clean', () => {
    const world = fakeWorld({ rails: net });
    const sys = createMovementSystem();
    const r = new Runner(world, [sys]);
    const p = world.add(makeActor('p1', 'player', { pos: { x: 0, y: 1.2, z: 1 }, vel: { x: 0, y: -1, z: 10 }, grounded: false, state: 'air' }));
    const meshesBefore = scene.meshes.length;
    const root = new TransformNode('root', scene), pose = new TransformNode('pose', scene); pose.parent = root;
    const plays: string[] = [];
    const animator = { play: (n: string) => { plays.push(n); return null; }, setSpeed: () => {} };
    const mv = bindMovementView({ animator, poseNode: pose, actor: () => p, telemetry: () => sys.inspect('p1'), clock: () => r.tSec });
    const sparks = new GrindSparksView(scene, root, 'p1');
    const fly = new SpeedFlightView(scene, camera, 'p1');
    const frame = () => { r.tick(); mv.sync(1 / 60); sparks.sync(p, sys.inspect('p1')); fly.sync(p, sys.inspect('p1'), r.tSec); };
    for (let i = 0; i < 30; i++) frame();
    expect(p.state).toBe('grind');
    expect(mv.clip).toBe('board_grind');
    p.fusion = { active: true, tier: 2, meter: 1, remainingSec: 30, partnerId: null, element: 'wind', grantsFlight: true };
    p.stats.energy.cur = p.stats.energy.max = 1000;
    r.press('p1', 'jump'); frame();
    for (let i = 0; i < 10; i++) frame();
    r.press('p1', 'jump'); frame();
    expect(p.state).toBe('flight');
    const inp = r.input('p1');
    inp.move.y = 1; inp.dashHeld = true; r.press('p1', 'dash');
    for (let i = 0; i < 240; i++) frame();
    expect(sys.inspect('p1')!.flight.mode).toBe('cruise');
    expect(Math.abs(pose.rotation.x)).toBeGreaterThan(0.5);            // lying along the flight
    // the movement view plays only when the clip changes (never once per frame)
    expect(plays.length).toBeLessThan(10);
    expect(plays).toContain('board_grind');
    mv.dispose(); sparks.dispose(); fly.dispose(); root.dispose();
    expect(scene.meshes.length).toBe(meshesBefore);
  });
});
