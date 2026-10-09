// KART FACING (2026-10-08). Owner, on the live site: "the kart is facing the wrong way in the karting mode" and "the model doesn't drive
// with his hands". Both were the baked (Meshy) kart body: it was mounted at +π/2, which put its NOSE on −Z while every kart drives +Z
// (the player's and the field's drove rear wing first), and the driver's hands held the hidden primitive wheel, ~22 cm behind the
// body's own. This loads every kart GLB the way dressVehicle mounts it, drives the real kart model on every course (normal and
// mirrored), and seats the real hero in the body the way VelocityKartMode's fitCockpit does.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, Matrix, NullEngine, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { spawnKart, stepKart } from '../core/KartModel';
import { KART_COURSES } from '../core/RaceCourse';
import { mountSteerGrip } from '../anim/SteerGrip';
import { boneNode } from '../anim/boneLookup';
import { buildPoseClip, REF_HIPS_Y } from '../anim/poseClip';
import { seatedKeys, STEER_LOCK_RAD } from '../anim/authored/seated';
import { kartCircuitVariant } from './kartCircuits';
import { locate, pointAlong } from './racingLine';
import { VEHICLE_BODIES, kartCockpit, vehicleForwardYaw } from './vehicleBody';

const DEG = Math.PI / 180;
const DT = 1 / 60;
/** VelocityKartMode: the body mounts at the floor, KART_GROUND_Y under the kart root; the driver at DRIVER_SCALE. */
const GROUND_Y = -0.36;
const DRIVER_SCALE = 0.92;

let engine: NullEngine;
let scene: Scene;
/** Each kart body's vertices in the KART ROOT's frame, mounted as dressVehicle mounts it. */
const bodies = new Map<string, Vector3[]>();

async function importGlb(file: string): Promise<{ meshes: TransformNode[]; holder: TransformNode; skeletons: Scene['skeletons'] }> {
  const b64 = readFileSync(path.resolve('public/models', file)).toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  const holder = new TransformNode(`import_${file}`, scene);
  for (const n of r.meshes) if (!n.parent) n.parent = holder;
  for (const g of r.animationGroups) g.stop();
  return { meshes: r.meshes as unknown as TransformNode[], holder, skeletons: r.skeletons };
}

function cloud(root: TransformNode): Vector3[] {
  const pts: Vector3[] = [];
  root.computeWorldMatrix(true);
  for (const m of root.getChildMeshes(false)) {
    const vd = m.getVerticesData('position');
    if (!vd) continue;
    m.computeWorldMatrix(true);
    const wm = m.getWorldMatrix();
    for (let i = 0; i < vd.length; i += 3) pts.push(Vector3.TransformCoordinates(new Vector3(vd[i], vd[i + 1], vd[i + 2]), wm));
  }
  return pts;
}

/** Mount the body under a kart root at the origin, exactly as dressVehicle does (yaw, floor at GROUND_Y). */
function mountBody(holder: TransformNode, id: string, yaw = vehicleForwardYaw('kart', id)): TransformNode {
  const kart = new TransformNode(`kart_${id}`, scene);
  const body = new TransformNode(`kart_${id}_body`, scene);
  body.parent = kart; body.rotation.y = yaw; body.position.y = GROUND_Y;
  holder.parent = body;
  kart.computeWorldMatrix(true);
  return kart;
}

/** Highest point within `reach` of one end of the kart (z), above the floor. The nose is a shin-high fairing; the tail carries the wing. */
function endHeight(pts: Vector3[], sign: 1 | -1, reach = 0.2): number {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { if (p.z < lo) lo = p.z; if (p.z > hi) hi = p.z; }
  let top = -Infinity;
  for (const p of pts) if (sign > 0 ? p.z > hi - reach : p.z < lo + reach) top = Math.max(top, p.y - GROUND_Y);
  return top;
}

/** The steering wheel: the highest point on the centre line between the axles. */
function wheelTop(pts: Vector3[]): Vector3 {
  let best = new Vector3(0, -Infinity, 0);
  for (const p of pts) if (Math.abs(p.x) < 0.08 && Math.abs(p.z) < 0.55 && p.y > best.y) best = p;
  return best;
}

beforeAll(async () => {
  engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => DT * 1000;
  scene = new Scene(engine); scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('c', new Vector3(0, 2, -8), scene);
  for (const [id, file] of Object.entries(VEHICLE_BODIES.kart)) {
    const g = await importGlb(`vehicles/${file}.kart.glb`);
    const kart = mountBody(g.holder, id);
    bodies.set(id, cloud(kart));
    kart.dispose(false, true);
  }
}, 120_000);

afterAll(() => { scene?.dispose(); engine?.dispose(); });

describe('every kart body faces the way the kart drives', () => {
  it('loads all five garage bodies', () => {
    expect([...bodies.keys()].sort()).toEqual(Object.keys(VEHICLE_BODIES.kart).sort());
  });

  it('the nose (+Z, where heading points) is the low end and the wing the tall end; the steering wheel is ahead of centre', () => {
    for (const [id, pts] of bodies) {
      const front = endHeight(pts, 1), back = endHeight(pts, -1);
      // measured at the fix: front ≈ 0.3–0.4 m (bumper and fairing), back ≈ 0.75 m (the wing). At +π/2 these swap.
      expect(back - front, `${id}: front ${front.toFixed(2)} back ${back.toFixed(2)}`).toBeGreaterThan(0.2);
      expect(wheelTop(pts).z, `${id}: steering wheel z`).toBeGreaterThan(0.05);
    }
  });

  // The kart model, the start the mode spawns on, and the Euler the mode writes onto the root (kart.rotation.y = heading)
  const courses = KART_COURSES.flatMap((c) => [false, true].map((mirror) => ({ id: c.id, mirror })));
  it.each(courses)('$id (mirror $mirror): spawns along the road, and after throttle the nose points along the travel', ({ id, mirror }) => {
    const circuit = kartCircuitVariant(id, { laps: 2, mirror });
    expect(circuit, id).not.toBeNull();
    const start = circuit!.course.start;
    const at = locate(circuit!.line, start.at.x, start.at.z);
    const tangentYaw = Math.atan2(at.tangent.x, at.tangent.z);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    // the heading IS the start line's direction; the grid sits 14 m back on that line's extension, where three courses' closing bend
    // (rooftop 13.7°, orbit 9.8°, summit 5.4°) already turns: along the road either way, never against it
    const line0 = pointAlong(circuit!.line, 0).tangent;
    expect(Math.abs(wrap(start.heading - Math.atan2(line0.x, line0.z))), 'spawn heading vs the start line').toBeLessThan(1 * DEG);
    expect(Math.abs(wrap(start.heading - tangentYaw)), 'spawn heading vs the road at the grid').toBeLessThan(20 * DEG);

    const s = spawnKart(start.at, start.heading);
    const from = s.pos.clone();
    for (let i = 0; i < 90; i++) stepKart(s, { steer: 0, throttle: 1, brake: 0 }, DT, true);
    const vel = s.pos.subtract(from); vel.y = 0;
    expect(vel.length(), 'the kart moved').toBeGreaterThan(2);
    // the race direction: travel runs WITH the start line, not against it
    expect(Vector3.Dot(vel.normalize(), line0.clone().normalize())).toBeGreaterThan(Math.cos(10 * DEG));

    for (const [bid, pts] of bodies) {
      // the body's nose direction in the kart's frame (low end → tall end reversed), carried by the root's yaw
      const noseLocal = new Vector3(0, 0, endHeight(pts, 1) < endHeight(pts, -1) ? 1 : -1);
      const nose = Vector3.TransformNormal(noseLocal, Matrix.RotationY(s.heading));
      expect(Math.acos(Math.min(1, Vector3.Dot(nose, vel))), `${id}${mirror ? ' mirrored' : ''} ${bid}: nose vs travel`).toBeLessThan(10 * DEG);
    }
  });
});

describe('the driver holds the wheel you can see', () => {
  /** Points of the body's own steering wheel (rim + hub), in the kart root's frame. */
  const rimOf = (pts: Vector3[]): Vector3[] => pts.filter((p) => Math.abs(p.x) < 0.24 && p.y - GROUND_Y > 0.5 && p.z > 0.0 && p.z < 0.42);

  async function seat(id: string, fitted: boolean): Promise<{ hands: () => Vector3[]; steer: (rad: number) => void; dispose: () => void }> {
    const hero = await importGlb('fel-hero.glb');
    const root = hero.meshes[0];
    root.rotation = new Vector3(0, 0, 0); root.scaling.setAll(1);
    const kart = new TransformNode('kart', scene);
    root.parent = kart; root.scaling.setAll(DRIVER_SCALE);
    // VelocityKartMode: KART_HIPS (y −0.08, z −0.30) and the primitive wheel's hub (KART_WHEEL y 0.28, z −0.02, tilt 22°)
    root.position.set(0, -0.08 - REF_HIPS_Y * DRIVER_SCALE, -0.30);
    const sk = hero.skeletons[0];
    const clip = buildPoseClip(scene, sk, 'kart_seated', 0.5, seatedKeys())!; clip.start(true, 1, 0, 0.5, false);
    const hub = new TransformNode('hub', scene); hub.parent = kart; hub.position.set(0, 0.28, -0.02); hub.rotation.x = (90 - 22) * DEG;
    const wheel = new TransformNode('wheel', scene); wheel.parent = hub;
    const grip = mountSteerGrip(scene, sk, wheel);
    scene.render();
    if (fitted) {
      // fitCockpit: the hub onto the body's wheel, the driver into the bucket, the grip re-recorded on that rim
      const c = kartCockpit(id);
      hub.position.set(0, GROUND_Y + c.wheel.y, c.wheel.z); hub.rotation.x = (90 - c.wheel.tiltDeg) * DEG;
      root.position.z = c.hipsZ;
      grip.regrip({ radius: c.wheel.radius, clockDeg: c.gripClockDeg });
    }
    for (let i = 0; i < 6; i++) scene.render();
    expect(grip.gripped).toBe(true);
    const pos = (b: string) => { const n = boneNode(sk, b)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
    return {
      hands: () => ['LeftHand', 'RightHand'].map(pos),
      steer: (rad: number) => { for (let f = 0; f < 40; f++) { wheel.rotation.y += (rad - wheel.rotation.y) * Math.min(1, 8 * DT); scene.render(); } },
      dispose: () => { grip.dispose(); clip.dispose(); kart.dispose(false, true); hero.holder.dispose(false, true); },
    };
  }
  const gap = (rim: Vector3[], h: Vector3) => Math.min(...rim.map((p) => Vector3.Distance(p, h)));

  it.each(Object.keys(VEHICLE_BODIES.kart))('%s: both hands on the body\'s rim, centred and at full lock both ways', async (id) => {
    const rim = rimOf(bodies.get(id)!);
    const d = await seat(id, true);
    let worst = 0;
    for (const lock of [0, STEER_LOCK_RAD, -STEER_LOCK_RAD]) {
      d.steer(lock);
      for (const h of d.hands()) worst = Math.max(worst, gap(rim, h));
    }
    d.dispose();
    // the wrist joint on a 4.5 cm-thick rim (vertex spacing ~1–2 cm): measured 1.7–3.6 cm at the fix; the unfitted seat is 13+ cm off
    expect(worst, `${id}: worst hand-to-rim`).toBeLessThan(0.045);
  }, 60_000);

  it('control: the seat the pose was authored for (primitive wheel) leaves the hands well off the body\'s rim', async () => {
    const rim = rimOf(bodies.get('runabout')!);
    const d = await seat('runabout', false);
    const best = Math.min(...d.hands().map((h) => gap(rim, h)));
    d.dispose();
    expect(best).toBeGreaterThan(0.08);
  }, 60_000);
});

describe('the grip waits for the pose, not for three frames of a scene that is still loading', () => {
  // Babylon's animation clock does not start while the scene has pending loads (Scene._animate returns early) but the
  // after-animations observable still fires. Live, the kart body, the field and the props are loading as the driver sits down, so
  // the grip recorded the BIND pose and held the arms out in a T for the whole race (measured live: hands 0.61 m out, 78 cm off the wheel).
  async function seatedHands(loadingFrames: number): Promise<Vector3[]> {
    const eng = new NullEngine();
    (eng as unknown as { getDeltaTime: () => number }).getDeltaTime = () => DT * 1000;
    const sc = new Scene(eng); sc.useConstantAnimationDeltaTime = true;
    new FreeCamera('c', new Vector3(0, 1, -3), sc);
    const b64 = readFileSync(path.resolve('public/models/fel-hero.glb')).toString('base64');
    const loading = {};
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, sc, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    if (loadingFrames) sc.addPendingData(loading);   // the body / field / props still streaming in
    const root = r.meshes[0] as unknown as TransformNode; root.rotation = new Vector3(0, 0, 0);
    const kart = new TransformNode('kart', sc);
    root.parent = kart; root.scaling.setAll(DRIVER_SCALE); root.position.set(0, -0.08 - REF_HIPS_Y * DRIVER_SCALE, -0.30);
    const sk = r.skeletons[0];
    buildPoseClip(sc, sk, 'kart_seated', 0.5, seatedKeys())!.start(true, 1, 0, 0.5, false);
    const hub = new TransformNode('hub', sc); hub.parent = kart; hub.position.set(0, 0.28, -0.02); hub.rotation.x = (90 - 22) * DEG;
    const wheel = new TransformNode('wheel', sc); wheel.parent = hub;
    mountSteerGrip(sc, sk, wheel);
    for (let i = 0; i < loadingFrames; i++) sc.render();
    if (loadingFrames) sc.removePendingData(loading);
    for (let i = 0; i < 8; i++) sc.render();
    const out = ['LeftHand', 'RightHand'].map((b) => { const n = boneNode(sk, b)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); });
    sc.dispose(); eng.dispose();
    return out;
  }
  it('hands land where the seated pose puts them even when the scene was loading for the first frames', async () => {
    const clean = await seatedHands(0);
    const loaded = await seatedHands(10);
    // the seated pose's hands are 30 cm apart on the rim; the bind pose's are a metre and a half apart
    expect(Vector3.Distance(clean[0], clean[1])).toBeLessThan(0.4);
    for (let i = 0; i < 2; i++) expect(Vector3.Distance(loaded[i], clean[i]), ['LeftHand', 'RightHand'][i]).toBeLessThan(0.02);
  }, 60_000);
});

describe('VelocityKartMode seats the driver in the dressed body (source pins for what the test above reproduces)', () => {
  const SRC = readFileSync(path.resolve('lib/babylon/modes/VelocityKartMode.ts'), 'utf8');
  it('fitCockpit moves the hub and the driver from kartCockpit and re-grips on that rim; it runs on the body\'s arrival and after the seat', () => {
    expect(SRC).toMatch(/hub\.position\.set\(0, KART_GROUND_Y \+ c\.wheel\.y, c\.wheel\.z\)/);
    expect(SRC).toMatch(/hub\.rotation\.x = \(90 - c\.wheel\.tiltDeg\) \* Math\.PI \/ 180/);
    expect(SRC).toMatch(/driver\.root\.position\.z = c\.hipsZ/);
    expect(SRC).toMatch(/steerGrip\.regrip\(\{ radius: c\.wheel\.radius, clockDeg: c\.gripClockDeg \}\)/);
    expect(SRC).toMatch(/bodyCockpit = kartCockpit\(kartId\); fitCockpit\(\)/);
    expect(SRC).toMatch(/steerGrip = mountSteerGrip\(ctx\.scene, driver\.skeleton, steerWheel\);\s*\n\s*fitCockpit\(\)/);
  });
});
