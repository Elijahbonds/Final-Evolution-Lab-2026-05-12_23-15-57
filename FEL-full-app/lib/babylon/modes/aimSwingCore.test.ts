// THE SHARED AIM RETICLE, STOOD UP (HOTFIX 2026-09-24).
//
// The Reticle is a torus, and a torus is built lying flat (XZ). Under billboard ALL the mesh's local XY is the screen, so
// the ring's PLANE met the camera edge-on: penalty and the carnival Hot Shot aimed with a glowing cyan stick. Derby had
// baked RotationX(π/2) at its own call site (ANIM-SURGICAL) and left the shared class as a follow-up. The bake lives in
// the Reticle now, measured here the way a player sees it: in the camera's view space the ring must be wide and tall
// and thin in depth — and no caller may bake it a second time, which would lay it flat again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NullEngine, PBRMaterial, Scene, UniversalCamera, Vector3, VertexBuffer } from '@babylonjs/core';

vi.mock('../visual/VenueKit', () => ({
  VenueKit: { paint: (scene: Scene, name: string) => new PBRMaterial(name, scene) },
}));
vi.mock('../core/CharacterLibrary', () => ({ CharacterLibrary: {} }));
/** IMPROVE (2026-10-06): what the Meshy goal load hands back — null (no model), or a root the test built, after a gate */
const meshy: { root: unknown; gate: Promise<void> } = { root: null, gate: Promise.resolve() };
vi.mock('../visual/meshyProps', () => ({ spawnMeshyProp: async () => { await meshy.gate; return meshy.root; } }));
vi.mock('../core/characterPipeline', () => ({ CharacterPipeline: {} }));
vi.mock('../anim/importSanitizer', () => ({ neverBindPose: () => undefined }));

import { Reticle, Flight, buildGoal, PowerMeter, POWER_METER_RATE } from './aimSwingCore';
import { MeshBuilder, TransformNode } from '@babylonjs/core';

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });

/** The ring's extent along the camera's right / up / depth axes, from its world vertices — what the screen shows. */
function viewExtent(camAt: Vector3, target: Vector3): { x: number; y: number; z: number } {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const cam = new UniversalCamera('cam', camAt, scene);
  cam.setTarget(target);
  scene.activeCamera = cam;
  cam.computeWorldMatrix();
  const r = new Reticle(scene, target, { x: 3.3, y: 1.05 });
  const world = r.mesh.computeWorldMatrix(true);
  const view = cam.getViewMatrix(true);
  const pos = r.mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    const v = Vector3.TransformCoordinates(Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), world), view);
    lo.minimizeInPlace(v); hi.maximizeInPlace(v);
  }
  return { x: hi.x - lo.x, y: hi.y - lo.y, z: hi.z - lo.z };
}

describe('the shared aim Reticle', () => {
  it('shows the camera a RING, not a stick — penalty: behind the kicker, looking down the pitch at the goal', () => {
    const e = viewExtent(new Vector3(0, 1.8, -3), new Vector3(0, 1.2, 11));
    expect(e.x).toBeCloseTo(0.6, 2);          // diameter 0.55 + thickness 0.05
    expect(e.y).toBeCloseTo(0.6, 2);          // was ~0.05: the edge-on stick
    expect(e.z).toBeLessThan(0.06);           // the ring's own thickness, and no more
  });

  it('keeps facing the camera from off to one side (Hot Shot, derby behind the batter)', () => {
    const e = viewExtent(new Vector3(2.5, 3, -4), new Vector3(1.4, 1.2, 11));
    expect(e.y).toBeGreaterThan(0.55);
    expect(e.z).toBeLessThan(0.06);
  });

  it('no call site bakes the ring a second time — twice is flat, and edge-on again', () => {
    for (const file of ['precisionModes.ts', 'carnivalEvents.ts']) {
      const src = readFileSync(path.join(__dirname, file), 'utf8');
      expect(src, file).not.toMatch(/\.mesh as Mesh\)\.bakeTransformIntoVertices/);
      expect(src, file).not.toMatch(/(pci|reticle)\.mesh\.bakeTransformIntoVertices/);
    }
  });
});

// IMPROVE (2026-10-06): Flight.step allocated a Vector3 every frame (`vel.scale(dt)`) for every ball in flight — Carnival
// Hot Shot, Derby and Golf share it. It is scaleAndAddToRef now: the same arithmetic, in place.
describe('Flight.step (shared by Hot Shot, Derby, Golf)', () => {
  /** The old step, verbatim: the reference the in-place step must match bit for bit. */
  function oldStep(pos: Vector3, vel: Vector3, g: number, dt: number): boolean {
    vel.y += g * dt;
    pos.addInPlace(vel.scale(dt));
    if (pos.y <= 0.05 && vel.y < 0) { pos.y = 0.05; return false; }
    return true;
  }

  it('flies the exact trajectory the allocating step flew, to the same landing frame', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    for (const [launch, dt] of [[new Vector3(0.7, 9.1, 17.3), 1 / 60], [new Vector3(-3.2, 4.4, 12.9), 1 / 144], [new Vector3(0.01, 22, 31), 1 / 30]] as const) {
      const ball = MeshBuilder.CreateSphere('b', { diameter: 0.2 }, scene);
      const f = new Flight(ball, -9.8);
      f.launch(new Vector3(0, 0.11, 0), launch);
      const refPos = new Vector3(0, 0.11, 0), refVel = launch.clone();
      let refLive = true, frames = 0;
      while (refLive && frames < 2000) {
        refLive = oldStep(refPos, refVel, -9.8, dt);
        const live = f.step(dt);
        expect(live).toBe(refLive);
        expect([ball.position.x, ball.position.y, ball.position.z]).toEqual([refPos.x, refPos.y, refPos.z]);   // exact, not close
        expect([f.vel.x, f.vel.y, f.vel.z]).toEqual([refVel.x, refVel.y, refVel.z]);
        frames++;
      }
      expect(refLive).toBe(false);   // it landed
      expect(f.step(dt)).toBe(false);
    }
  });

  it('allocates no Vector3 per step: no scale(), and the ball keeps its own position vector', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ball = MeshBuilder.CreateSphere('b', { diameter: 0.2 }, scene);
    const f = new Flight(ball);
    f.launch(new Vector3(0, 1, 0), new Vector3(0, 5, 10));
    const pos = ball.position, vel = f.vel;
    const scale = vi.spyOn(Vector3.prototype, 'scale');
    const add = vi.spyOn(Vector3.prototype, 'add');
    for (let i = 0; i < 30; i++) f.step(1 / 60);
    expect(scale).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(ball.position).toBe(pos);
    expect(f.vel).toBe(vel);
    scale.mockRestore(); add.mockRestore();
  });
});

// IMPROVE (2026-10-06): the Meshy goal lands after build() returns. Hot Shot's 15 s can be over by then, and the model
// appeared in the NEXT event, its bars hidden on a stage that no longer existed. `alive` drops a late landing.
describe('buildGoal: a Meshy goal that lands after its owner is gone is dropped', () => {
  async function land(alive?: () => boolean): Promise<{ root: TransformNode; parts: ReturnType<typeof buildGoal> }> {
    engine = new NullEngine();
    const scene = new Scene(engine);
    let open!: () => void;
    meshy.gate = new Promise<void>((r) => { open = r; });
    const root = new TransformNode('goal_meshy', scene);
    MeshBuilder.CreateBox('goal_meshy_net', { size: 1 }, scene).parent = root;
    meshy.root = root;
    const parts = alive ? buildGoal(scene, alive) : buildGoal(scene);
    open();
    await new Promise((r) => setTimeout(r, 0));
    meshy.root = null; meshy.gate = Promise.resolve();
    return { root, parts };
  }

  it('torn down first: the late model is disposed and the frame is left as it was', async () => {
    let gone = false;
    const pending = land(() => !gone);
    gone = true;                                      // the event ends before the load lands
    const { root, parts } = await pending;
    expect(root.isDisposed()).toBe(true);
    expect(parts.filter((m) => m.name === 'goalbar').every((m) => m.isEnabled())).toBe(true);
    expect(parts.some((m) => m.name.startsWith('goal_meshy'))).toBe(false);
  });

  it('still alive (and the old one-argument call): the model is fitted in and the boxes hide', async () => {
    for (const alive of [() => true, undefined]) {
      const { root, parts } = await land(alive);
      expect(root.isDisposed()).toBe(false);
      expect(parts.filter((m) => m.name === 'goalbar').every((m) => !m.isEnabled())).toBe(true);
      expect(parts.some((m) => m.name === 'goal_meshy_net')).toBe(true);
      engine?.dispose(); engine = null;
    }
  });
});

// IMPROVE (2026-10-06, Golf #7): the meter's wave speed is an opt-in field; every caller that does not set it runs the
// wave it always ran (golf slows it on the green).
describe('PowerMeter.rate (shared by golf, penalty, carnival)', () => {
  const sample = (m: PowerMeter, secs: number) => { m.start(); const out: number[] = []; for (let i = 0; i < secs * 60; i++) { m.update(1 / 60); out.push(m.value); } return out; };
  it('by default it is the old 3.4 rad/s wave, value for value', () => {
    const vals = sample(new PowerMeter(), 2);
    vals.forEach((v, i) => expect(v).toBeCloseTo((Math.sin(((i + 1) / 60) * 3.4 - Math.PI / 2) + 1) / 2, 12));
    expect(POWER_METER_RATE).toBe(3.4);
  });
  it('a slower rate reaches the top later', () => {
    const slow = new PowerMeter(); slow.rate = 2.6;
    const peak = (v: number[]) => v.indexOf(Math.max(...v));
    expect(peak(sample(slow, 2))).toBeGreaterThan(peak(sample(new PowerMeter(), 2)));
  });
});

