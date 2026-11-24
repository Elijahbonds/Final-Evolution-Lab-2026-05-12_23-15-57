// lane/physics-arena: the headless Havok rig (Node, NullEngine, the real WASM from node_modules). The arena's own modules, not a
// copy: ArenaPhysics (the world), shotRelease / releaseShot (the release every shooter uses), HoopSensor (the scoreboard's read).
// Used by scripts/physics-arena-tests.ts (the gate) and ./tune.ts (the sweep that chose the shot knobs).

import fs from 'node:fs';
import path from 'node:path';
import { ArenaPhysics, SOCCER_SPEC } from '../../../lib/babylon/arena/arenaPhysics';
import { buildSoccerColliders } from '../../../lib/babylon/arena/soccerPitch';
import { ARENA_RIM, ARENA_RIM_RADIUS, type P3 } from '../../../lib/babylon/arena/hoopGeometry';
import { __setHavokWasmBinary } from '../../../lib/babylon/core/Physics';
import { jumpVy } from '../../../lib/babylon/arena/arenaConfig';
import { releaseShot } from '../../../lib/babylon/arena/arenaShot';
import { HoopSensor, throughHoopLabel } from '../../../lib/babylon/arena/hoopSensor';
import { setPoint } from '../../../lib/babylon/arena/dribble';

export type B = typeof import('@babylonjs/core');
let wasmSet = false;

export async function makeWorld(): Promise<{ B: B; world: ArenaPhysics; dispose: () => void }> {
  const B = await import('@babylonjs/core');
  if (!wasmSet) {
    __setHavokWasmBinary(fs.readFileSync(path.resolve(__dirname, '../../../node_modules/@babylonjs/havok/lib/umd/HavokPhysics.wasm')));
    wasmSet = true;
  }
  const engine = new B.NullEngine();
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine);
  new B.ArcRotateCamera('cam', 0, 0, 10, B.Vector3.Zero(), scene);
  const world = await ArenaPhysics.create(scene);
  return { B, world, dispose: () => { world.dispose(); scene.dispose(); engine.dispose(); } };
}

/** A soccer world (plan §9): no hoop, the soccer ball, the pitch's boards, goal frames and nets. */
export async function makeSoccerWorld(): Promise<{ B: B; world: ArenaPhysics; dispose: () => void }> {
  const B = await import('@babylonjs/core');
  if (!wasmSet) {
    __setHavokWasmBinary(fs.readFileSync(path.resolve(__dirname, '../../../node_modules/@babylonjs/havok/lib/umd/HavokPhysics.wasm')));
    wasmSet = true;
  }
  const engine = new B.NullEngine();
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine);
  new B.ArcRotateCamera('cam', 0, 0, 10, B.Vector3.Zero(), scene);
  const world = await ArenaPhysics.create(scene, { hoop: false, ball: SOCCER_SPEC });
  buildSoccerColliders(world);
  return { B, world, dispose: () => { world.dispose(); scene.dispose(); engine.dispose(); } };
}

export interface ShotSpec {
  /** The shooter's feet on the floor. */
  feet: P3;
  /** Release time against the top of the jump (s): negative = early (rising), positive = late (falling). */
  offsetSec: number;
  /** The shooter's planar drift at the release (m/s). */
  drift?: { x: number; z: number };
}

export interface ShotRun { made: boolean; label: boolean; frameSensorMade: boolean; path: P3[]; contacts: string[]; maxSec: number }

/**
 * One jump shot on the arena's physics: the shooter leaves the floor at JUMP_VY (pure ballistics for the body, as the capsule's own
 * flight), the ball is CARRIED to the set point over his head by the hold, released at apex + offset with the body's velocity at
 * that instant, then simulated for `maxSec`. The sensor runs twice: once per physics step and once per 60 Hz frame (prev frame →
 * this frame), which is how the mode reads it.
 */
export function runShot(world: ArenaPhysics, spec: ShotSpec, normal: () => number, maxSec = 3): ShotRun {
  const g = 9.81, v0 = jumpVy();
  const apex = v0 / g;
  const tRel = Math.max(0.02, apex + spec.offsetSec);
  const yaw = Math.atan2(ARENA_RIM.x - spec.feet.x, ARENA_RIM.z - spec.feet.z);
  const ball = world.ball;
  const bodyY = (t: number) => Math.max(0, v0 * t - 0.5 * g * t * t);
  // the hold: carried with the body from the gather to the release (0.25 s on the floor at the set point, then the jump)
  const startSet = setPoint(spec.feet, yaw);
  ball.teleport({ x: startSet.x, y: startSet.y, z: startSet.z });
  let t = -0.25;
  const h = 1 / 120;
  while (t < tRel) {
    const sp = setPoint({ x: spec.feet.x, y: bodyY(Math.max(0, t)), z: spec.feet.z }, yaw);
    ball.hold(sp);
    world.step(h);
    t += h;
  }
  const tr = Math.max(0, t);
  const bodyVel = { x: spec.drift?.x ?? 0, y: tr < 2 * apex ? v0 - g * tr : 0, z: spec.drift?.z ?? 0 };
  releaseShot(ball, 0, bodyVel, normal);
  const stepSensor = new HoopSensor(ARENA_RIM, ARENA_RIM_RADIUS);
  const frameSensor = new HoopSensor(ARENA_RIM, ARENA_RIM_RADIUS);
  const path: P3[] = [];
  let prev = { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z };
  let prevFrame = { ...prev };
  let made = false, frameMade = false, k = 0;
  world.drainContacts();
  const contacts: string[] = [];
  for (let s = 0; s < maxSec * 120; s++) {
    world.step(h);
    const now = { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z };
    path.push(now);
    if (stepSensor.step(prev, now, h) === 'make') made = true;
    prev = now;
    if (++k % 2 === 0) {   // a 60 Hz frame: two steps
      if (frameSensor.step(prevFrame, now, 2 * h) === 'make') frameMade = true;
      prevFrame = now;
    }
    for (const c of world.drainContacts()) if (contacts[contacts.length - 1] !== c.surface) contacts.push(c.surface);
  }
  return { made, label: throughHoopLabel(path, ARENA_RIM, ARENA_RIM_RADIUS), frameSensorMade: frameMade, path, contacts, maxSec };
}

/** The shooting spots: four distances from the ring on five angles (corner to corner), feet on the floor. */
export function spots(): P3[] {
  const out: P3[] = [];
  const rim = { x: 0, z: -0.6 };
  for (const d of [2.5, 4, 5.5, 7]) for (const deg of [-75, -35, 0, 35, 75]) {
    const a = (deg * Math.PI) / 180;
    out.push({ x: rim.x + Math.sin(a) * d, y: 0, z: rim.z + Math.cos(a) * d });
  }
  return out;
}
