// aimSwingCore — the shared engine for tennis / golf / baseball / soccer.
// Live audit (E11): these modes moved a ball but never spawned an athlete,
// furniture, or a readable loop. This core provides the two archetypes:
//   REACT:  a ball comes at you — swing on time, steer with the stick
//           (tennis return, baseball derby)
//   PLACE:  a static ball — aim a reticle, time an oscillating power meter
//           (golf drive, penalty kick)
// plus the missing furniture (net, flag+hole, plate+mound, goal+keeper) and a
// ballistic flight solver. Athletes are real characters with swing clips.

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import type { ModeContext } from '../core/ModeHarness';

const mat = (scene: Scene, hex: string, alpha = 1): StandardMaterial => {
  const m = new StandardMaterial(`m_${hex}_${alpha}`, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = Color3.Black();
  m.alpha = alpha;
  return m;
};

// ── Athlete ────────────────────────────────────────────────────────────────
export async function spawnAthlete(
  ctx: ModeContext, heroUrl: string, pos: Vector3, yaw: number, idleClip: string,
): Promise<SpawnedCharacter> {
  const char = await CharacterLibrary.spawn(ctx.scene, heroUrl, {
    position: pos, yawRad: yaw, startClip: idleClip,
  });
  neverBindPose(char.animator, idleClip);
  ctx.groundLock?.track(char.root, char.skeleton);
  ctx.heroRef.current = char.root;
  return char;
}

// ── Reticle (PLACE aiming) ─────────────────────────────────────────────────
export class Reticle {
  mesh: AbstractMesh;
  pos: Vector3;
  constructor(scene: Scene, private center: Vector3, private half: { x: number; y: number }) {
    this.pos = center.clone();
    this.mesh = MeshBuilder.CreateTorus('reticle', { diameter: 0.55, thickness: 0.05 }, scene);
    this.mesh.material = mat(scene, '#22d3ee', 0.9);
    this.mesh.billboardMode = 7;                          // face the camera
    this.mesh.position = this.pos;
  }
  /** stick drives the reticle inside the target window */
  update(dt: number, stickX: number, stickY: number): void {
    this.pos.x = clamp(this.pos.x + stickX * 3.2 * dt, this.center.x - this.half.x, this.center.x + this.half.x);
    this.pos.y = clamp(this.pos.y - stickY * 2.6 * dt, this.center.y - this.half.y, this.center.y + this.half.y);
    this.mesh.position.copyFrom(this.pos);
  }
  pulse(on: boolean): void { this.mesh.scaling.setAll(on ? 1.35 : 1); }
  dispose(): void { this.mesh.dispose(); }
}

// ── Power meter (PLACE) ────────────────────────────────────────────────────
export class PowerMeter {
  active = false;
  private t = 0;
  value = 0;                                              // 0..1, oscillates
  start(): void { this.active = true; this.t = 0; }
  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    this.value = (Math.sin(this.t * 3.4 - Math.PI / 2) + 1) / 2;   // 0→1→0 wave
  }
  stop(): number { this.active = false; return this.value; }
}

// ── Swing timing (REACT) ───────────────────────────────────────────────────
/** quality 1 = perfect; 0 = whiff. windowSec is full width. */
export function swingQuality(ballZ: number, contactZ: number, speed: number, windowSec: number): number {
  const dt = Math.abs(ballZ - contactZ) / Math.max(speed, 0.1);
  return Math.max(0, 1 - dt / (windowSec / 2));
}

// ── Ball flight ────────────────────────────────────────────────────────────
export class Flight {
  vel = new Vector3();
  active = false;
  constructor(public ball: AbstractMesh, private g = -9.8) {}
  launch(from: Vector3, vel: Vector3): void {
    this.ball.position.copyFrom(from);
    this.vel.copyFrom(vel);
    this.active = true;
  }
  /** returns true while flying; stops at ground */
  step(dt: number): boolean {
    if (!this.active) return false;
    this.vel.y += this.g * dt;
    this.ball.position.addInPlace(this.vel.scale(dt));
    if (this.ball.position.y <= 0.05 && this.vel.y < 0) {
      this.ball.position.y = 0.05;
      this.active = false;
    }
    return this.active;
  }
}

// ── Furniture ──────────────────────────────────────────────────────────────
export function buildTennisNet(scene: Scene): AbstractMesh[] {
  const net = MeshBuilder.CreateBox('net', { width: 11, height: 0.95, depth: 0.06 }, scene);
  net.position.set(0, 0.48, 0);
  net.material = mat(scene, '#dfe5ea', 0.6);
  const tape = MeshBuilder.CreateBox('tape', { width: 11, height: 0.07, depth: 0.08 }, scene);
  tape.position.set(0, 0.95, 0);
  tape.material = mat(scene, '#ffffff');
  const posts = [-5.6, 5.6].map((x) => {
    const p = MeshBuilder.CreateCylinder('post', { diameter: 0.1, height: 1.1 }, scene);
    p.position.set(x, 0.55, 0);
    p.material = mat(scene, '#2b3540');
    return p;
  });
  return [net, tape, ...posts];
}

export function buildGolfGreen(scene: Scene, holePos: Vector3): AbstractMesh[] {
  const green = MeshBuilder.CreateDisc('green', { radius: 6 }, scene);
  green.rotation.x = Math.PI / 2;
  green.position.set(holePos.x, 0.015, holePos.z);
  green.material = mat(scene, '#35a352');
  const hole = MeshBuilder.CreateDisc('hole', { radius: 0.16 }, scene);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(holePos.x, 0.03, holePos.z);
  hole.material = mat(scene, '#0a0f0a');
  const pole = MeshBuilder.CreateCylinder('flagpole', { diameter: 0.05, height: 2.2 }, scene);
  pole.position.set(holePos.x, 1.1, holePos.z);
  pole.material = mat(scene, '#e8e8e8');
  const flag = MeshBuilder.CreatePlane('flag', { width: 0.7, height: 0.45 }, scene);
  flag.position.set(holePos.x + 0.36, 1.9, holePos.z);
  flag.material = mat(scene, '#e23c50');
  return [green, hole, pole, flag];
}

export function buildPlateAndMound(scene: Scene): AbstractMesh[] {
  const plate = MeshBuilder.CreateDisc('plate', { radius: 0.35, tessellation: 5 }, scene);
  plate.rotation.x = Math.PI / 2;
  plate.position.set(0, 0.02, 0);
  plate.material = mat(scene, '#f2f2f2');
  const mound = MeshBuilder.CreateCylinder('mound', { diameterTop: 2.4, diameterBottom: 3.4, height: 0.35 }, scene);
  mound.position.set(0, 0.17, 18);
  mound.material = mat(scene, '#b08968');
  return [plate, mound];
}

export function buildGoal(scene: Scene): AbstractMesh[] {
  const parts: AbstractMesh[] = [];
  const white = mat(scene, '#f4f6f8');
  for (const [x, y, w, h] of [[-3.66, 1.22, 0.1, 2.44], [3.66, 1.22, 0.1, 2.44], [0, 2.44, 7.42, 0.1]] as const) {
    const bar = MeshBuilder.CreateBox('goalbar', { width: w === 0.1 ? 0.1 : w, height: h === 0.1 ? 0.1 : h, depth: 0.1 }, scene);
    bar.position.set(x, y, 11);
    bar.material = white;
    parts.push(bar);
  }
  const netB = MeshBuilder.CreateBox('goalnet', { width: 7.3, height: 2.4, depth: 0.04 }, scene);
  netB.position.set(0, 1.2, 11.8);
  netB.material = mat(scene, '#dfe5ea', 0.25);
  parts.push(netB);
  return parts;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
