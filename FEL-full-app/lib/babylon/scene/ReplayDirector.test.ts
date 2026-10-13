// vis-foundation-2 A9.12 — the shared replay: records bodies as drawn, plays them back from broadcast angles, and hands the
// live moment back exactly as it was.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { REPLAY_SPEED, ReplayDirector, characterRoots, mountReplayDof, type ReplayDofHandle } from './ReplayDirector';
import { DOF_REPLAY, DOF_REST } from './broadcastShots';

afterEach(() => vi.restoreAllMocks());

function rig() {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  const cam = new FreeCamera('cam', new Vector3(0, 3, -8), scene);
  cam.setTarget(Vector3.Zero());
  const runner = new TransformNode('runner', scene);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.3 }, scene);
  const frame = (n = 1) => { for (let i = 0; i < n; i++) { now += 1000 / 60; scene.render(); } };
  return { engine, scene, cam, runner, ball, frame };
}

describe('the replay director', () => {
  it('records the run, plays it back from broadcast angles behind the bars, then puts the live moment back', async () => {
    const { scene, cam, runner, ball, frame } = rig();
    const lens: number[] = [];
    const dof: ReplayDofHandle = { set: (k) => { lens.push(k); }, live: vi.fn(), dispose: vi.fn() };
    const rd = new ReplayDirector(scene, cam, [runner], [ball], dof);
    // a 3 s run up the field
    for (let i = 0; i < 180; i++) { runner.position.z = i * 0.1; ball.position.z = i * 0.1 + 0.5; frame(); }
    expect(rd.recordedSec).toBeGreaterThan(2.5);
    const liveCam = cam.position.clone(), liveRunner = runner.position.clone();
    const done = rd.play({ lastSeconds: 2 });
    expect(rd.playing).toBe(true);
    expect(scene.metadata.felCinematic).toBe(1);
    const seen = new Set<string>(); const zs: number[] = [];
    for (let i = 0; i < 2 / REPLAY_SPEED * 60 + 20 && rd.playing; i++) { frame(); if (rd.angleNow) seen.add(rd.angleNow); zs.push(runner.position.z); }
    await done;
    // it replayed the last 2 s of the run, forward, at half speed
    expect(Math.min(...zs)).toBeGreaterThan(17.9 - 2 * 6 - 0.5);
    expect(zs[zs.length - 2]).toBeGreaterThan(zs[5]);
    expect(seen.size).toBeGreaterThanOrEqual(2);
    expect(Math.max(...lens)).toBeGreaterThan(0.9);   // the replay lens came in
    // and everything is back
    expect(rd.playing).toBe(false);
    expect(scene.metadata.felCinematic).toBe(0);
    expect(runner.position.equalsWithEpsilon(liveRunner, 1e-9)).toBe(true);
    expect(cam.position.equalsWithEpsilon(liveCam, 1e-9)).toBe(true);
    expect(lens[lens.length - 1]).toBe(0);
    expect(dof.live).toHaveBeenLastCalledWith(false);
    rd.dispose();
  });
  it('a skip ends it on the spot; a pause freezes it (and a skip while paused is ignored)', async () => {
    const { scene, cam, runner, frame } = rig();
    const rd = new ReplayDirector(scene, cam, [runner]);
    for (let i = 0; i < 120; i++) { runner.position.x = i * 0.05; frame(); }
    let paused = false;
    const done = rd.play({ paused: () => paused });
    frame(10);
    paused = true;
    const z0 = runner.position.x; frame(30);
    expect(runner.position.x).toBe(z0);
    rd.skip();
    expect(rd.playing).toBe(true);
    paused = false; rd.skip();
    await done;
    expect(rd.playing).toBe(false);
    expect(runner.position.x).toBeCloseTo(119 * 0.05, 9);
  });
  it('with nothing recorded it resolves at once and touches nothing', async () => {
    const { scene, cam, runner } = rig();
    const rd = new ReplayDirector(scene, cam, [runner]);
    await rd.play();
    expect(rd.playing).toBe(false);
    expect(scene.metadata?.felCinematic ?? 0).toBe(0);
  });
  it('does not record over itself while playing', () => {
    const { scene, cam, runner, frame } = rig();
    const rd = new ReplayDirector(scene, cam, [runner]);
    for (let i = 0; i < 90; i++) { runner.position.z = i; frame(); }
    const held = rd.recordedSec;
    void rd.play();
    frame(60);
    expect(rd.recordedSec).toBeCloseTo(held, 6);
    rd.stop();
  });
});

describe('characterRoots', () => {
  it('the hero first, then the nearest other skinned bodies, capped', () => {
    const { scene } = rig();
    // skinned "bodies": a mesh with a skeleton under a root
    const body = (name: string, x: number) => {
      const root = new TransformNode(name, scene); root.position.x = x;
      const m = MeshBuilder.CreateBox(`${name}_m`, {}, scene); m.parent = root;
      (m as unknown as { skeleton: unknown }).skeleton = { bones: [] };
      return root;
    };
    const far = body('far', 30), hero = body('hero', 0), near = body('near', 2);
    const roots = characterRoots(scene, hero.getChildMeshes()[0] as unknown as TransformNode, 2);
    expect(roots).toEqual([hero, near]);
    expect(characterRoots(scene, null, 6)).toContain(far);
  });
});

describe('mountReplayDof', () => {
  it('nothing on phones or without a pipeline', () => {
    const { scene } = rig();
    expect(mountReplayDof(scene, null, 'desktop')).toBeNull();
    const fake = { depthOfField: {}, depthOfFieldEnabled: false } as never;
    expect(mountReplayDof(scene, fake, 'mobile')).toBeNull();
  });
  it('on desktop: DOF switched on AT MOUNT at the no-blur lens; a replay eases the lens, never the switch', () => {
    const { scene } = rig();
    const dofState = { fStop: 1.4, focalLength: 50, focusDistance: 2000 };
    let enabled = false, toggles = 0;
    const pipeline = {
      get depthOfFieldEnabled() { return enabled; }, set depthOfFieldEnabled(v: boolean) { enabled = v; toggles++; },
      depthOfFieldBlurLevel: 0, depthOfField: dofState,
    };
    const h = mountReplayDof(scene, pipeline as never, 'high')!;
    expect(enabled).toBe(true);
    expect(dofState.fStop).toBe(DOF_REST.fStop); expect(dofState.focalLength).toBe(DOF_REST.focalLength);
    h.set(1, 5);
    expect(dofState.fStop).toBe(DOF_REPLAY.fStop); expect(dofState.focusDistance).toBe(5000);
    h.set(0, 5);
    expect(toggles).toBe(1);   // switched once, at mount
  });
});
