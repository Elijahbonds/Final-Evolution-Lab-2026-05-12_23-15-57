// SurfSpray — the water answers the rider (SURF OCEAN, owner 2026-09-15: "add splashes and sprinkles").
//
// Three particle voices, one shared droplet texture, all unlit additive-free soft white so they read on a blue face and on a
// gold sunset alike:
//   · CREST MIST — the lip throws spray back over the swell the whole length near the rider; it thickens while the barrel is
//     open (the wave pitching) and thins when the section backs off. The offshore feel of a real break.
//   · RAIL SPRAY — the board's rail cuts a fan of water out of the face, scaled by how hard it is turning and how fast it is
//     going: a cutback throws a wall, a straight glide leaves a whisper.
//   · SPLASH — a one-shot burst: a landing (small, quick), a wipeout (big, slow to fall), a buoy.
// Emission is driven every frame by the mode (no timers of its own), so a slow-motion beat slows the water with the rider.

import { Color4, DynamicTexture, ParticleSystem, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

export interface SprayFrame {
  /** World position of the lip (crest) this frame. */
  lip: Vector3;
  /** The rider / board, world. */
  rider: Vector3;
  /** Rider's forward speed, m/s. */
  speed: number;
  /** 0..1 — how hard the board is turning (a cutback is 1). */
  carve: number;
  /** Which side the rail throws to (+1 = rider's right, world x). */
  carveSide: number;
  /** The barrel / pitching section is open over the rider. */
  hollow: boolean;
  /** The rider is on the face (a board in the air throws nothing). */
  grounded: boolean;
  /** vis-board (wave 2): the board's heading (radians about +y, 0 = +z) — the foam wake lies behind it. */
  yaw?: number;
}

/** Board speeds (m/s) between which the wake fades in: nothing at or under WAKE_FADE_FROM, all of it from WAKE_FADE_TO. A board that is
 *  barely moving churns up no foam: the blobs a standing board laid round itself read as a white disc. */
export const WAKE_FADE_FROM = 2;
export const WAKE_FADE_TO = 6;
/** vis-board, pure: how much of the wake a board at `speed` leaves (0 at rest, a smooth rise to 1). */
export function wakeFade(speed: number): number {
  if (!(speed > WAKE_FADE_FROM)) return 0;
  const t = Math.min(1, (speed - WAKE_FADE_FROM) / (WAKE_FADE_TO - WAKE_FADE_FROM));
  return t * t * (3 - 2 * t);
}

/** vis-board (wave 2), pure: the foam wake's emission, particles a second — none in the air or at rest, fading in with speed (wakeFade),
 *  then rising with speed and with how hard the rail is set (a carve digs a wider, whiter trail). */
export function wakeRate(speed: number, carve: number, grounded: boolean, lite = false): number {
  const fade = wakeFade(speed);
  if (!grounded || fade <= 0) return 0;
  const sp = Math.max(0, Math.min(1, speed / 12)), cv = Math.max(0, Math.min(1, carve));
  const full = (14 + 46 * sp + 60 * cv * sp) * fade;
  return Math.round(lite ? full * 0.22 : full);   // a phone's trail is a fifth as thick (the surf row of mobileBudget.json holds 53 live particles)
}

function dropletTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('surfDroplet', { width: 64, height: 64 }, scene, false);
  const g = tex.getContext() as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  tex.hasAlpha = true; tex.update();
  return tex;
}

export class SurfSpray {
  private tex: DynamicTexture;
  private crest: ParticleSystem;
  private rail: ParticleSystem;
  private splashSys: ParticleSystem;
  private wake: ParticleSystem;
  private wakeAt = new Vector3();
  private crestAt = new Vector3();
  private railAt = new Vector3();
  private splashAt = new Vector3();

  /** `lite`: a phone — the foam wake is a fifth as thick and lives half as long (the particle budget's row for this mode). */
  constructor(scene: Scene, private tint = new Color4(0.95, 0.98, 1, 0.6), private lite = false) {
    this.tex = dropletTexture(scene);
    const make = (name: string, cap: number): ParticleSystem => {
      const ps = new ParticleSystem(name, cap, scene);
      ps.particleTexture = this.tex;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.color1 = this.tint; ps.color2 = new Color4(this.tint.r, this.tint.g, this.tint.b, this.tint.a * 0.7);
      ps.colorDead = new Color4(1, 1, 1, 0);
      ps.gravity = new Vector3(0, -9.8, 0);
      ps.emitRate = 0;
      ps.start();
      return ps;
    };
    // crest mist: a long thin box riding the lip, thrown up and back over the swell
    this.crest = make('surfCrestMist', 900);
    this.crest.emitter = this.crestAt;
    this.crest.minEmitBox = new Vector3(-10, 0, -0.3); this.crest.maxEmitBox = new Vector3(10, 0.4, 0.3);
    this.crest.direction1 = new Vector3(-0.6, 2.4, -3.2); this.crest.direction2 = new Vector3(0.6, 4.6, -1.2);
    this.crest.minEmitPower = 0.8; this.crest.maxEmitPower = 1.6;
    this.crest.minLifeTime = 0.6; this.crest.maxLifeTime = 1.3;
    this.crest.minSize = 0.06; this.crest.maxSize = 0.22;
    this.crest.gravity = new Vector3(0, -3.5, 0);   // mist hangs
    // rail spray: a fan out of the board's rail
    this.rail = make('surfRailSpray', 700);
    this.rail.emitter = this.railAt;
    this.rail.minEmitBox = new Vector3(-0.3, 0, -0.5); this.rail.maxEmitBox = new Vector3(0.3, 0.1, 0.5);
    this.rail.minEmitPower = 2.5; this.rail.maxEmitPower = 5.5;
    this.rail.minLifeTime = 0.35; this.rail.maxLifeTime = 0.8;
    this.rail.minSize = 0.06; this.rail.maxSize = 0.22;
    // splash: manual bursts
    this.splashSys = make('surfSplash', 600);
    this.splashSys.emitter = this.splashAt;
    this.splashSys.minEmitBox = new Vector3(-0.6, 0, -0.6); this.splashSys.maxEmitBox = new Vector3(0.6, 0.2, 0.6);
    this.splashSys.direction1 = new Vector3(-2, 4, -2); this.splashSys.direction2 = new Vector3(2, 7, 2);
    this.splashSys.minEmitPower = 1; this.splashSys.maxEmitPower = 2.2;
    this.splashSys.minLifeTime = 0.5; this.splashSys.maxLifeTime = 1.1;
    this.splashSys.minSize = 0.1; this.splashSys.maxSize = 0.36;
    this.splashSys.manualEmitCount = 0;
    // foam wake (vis-board, wave 2): the white the board churns up and leaves behind it — soft blobs that spread and thin over ~2 s,
    // laid at the water under the board, left where they were made (the trail is the path the board took)
    this.wake = make('surfFoamWake', 520);
    this.wake.emitter = this.wakeAt;
    this.wake.minEmitBox = new Vector3(-0.2, 0, -0.22); this.wake.maxEmitBox = new Vector3(0.2, 0.05, 0.22);   // a stream off the tail, not a ring round the board
    this.wake.color1 = new Color4(0.97, 1, 1, 0.3); this.wake.color2 = new Color4(0.88, 0.97, 0.98, 0.2);   // thin: 130 of them overlapping read as a white disc at 0.5
    this.wake.colorDead = new Color4(0.9, 0.98, 1, 0);
    this.wake.minLifeTime = lite ? 0.8 : 1.5; this.wake.maxLifeTime = lite ? 1.3 : 2.6;
    this.wake.minSize = 0.16; this.wake.maxSize = 0.34;
    this.wake.addSizeGradient(0, 0.5, 0.7); this.wake.addSizeGradient(1, 1.2, 1.6);   // it spreads as it thins
    this.wake.gravity = new Vector3(0, 0, 0);
    this.wake.minEmitPower = 0.5; this.wake.maxEmitPower = 1.3;   // thrown back: the blobs travel away along the heading and a trail forms
    this.wake.direction1 = new Vector3(-0.5, 0.03, -0.5); this.wake.direction2 = new Vector3(0.5, 0.12, 0.5);
  }

  /** Every frame, from the mode. */
  update(f: SprayFrame): void {
    this.crestAt.set(f.rider.x, f.lip.y + 0.25, f.lip.z);
    this.crest.emitRate = f.hollow ? 110 : 28;
    this.railAt.copyFrom(f.rider);
    const carve = f.grounded ? Math.max(0, Math.min(1, f.carve)) : 0;
    const speed01 = Math.max(0, Math.min(1, f.speed / 12));
    this.rail.emitRate = Math.round(carve * carve * 520 * (0.35 + 0.65 * speed01) + (f.grounded ? speed01 * 25 : 0));
    // the wake is laid at the board's feet at the water, thrown a little back along the heading
    const yaw = f.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.wakeAt.set(f.rider.x - fx * 0.9, f.rider.y + 0.02, f.rider.z - fz * 0.9);
    this.wake.emitRate = wakeRate(f.speed, carve, f.grounded, this.lite);
    this.wake.direction1.set(-fx * 1.0 - 0.18, 0.03, -fz * 1.0 - 0.18); this.wake.direction2.set(-fx * 0.45 + 0.18, 0.1, -fz * 0.45 + 0.18);
    const side = f.carveSide >= 0 ? 1 : -1;
    this.rail.direction1 = new Vector3(side * 1.2, 1.4, -0.8);
    this.rail.direction2 = new Vector3(side * 2.6, 3.2, 0.6);
  }

  /** A one-shot burst at a world point. size 0.5 = a landing, 1 = a wipeout. */
  splash(at: Vector3, size = 1): void {
    this.splashAt.copyFrom(at);
    this.splashSys.minEmitPower = 1 + size; this.splashSys.maxEmitPower = 2 + size * 2.5;
    this.splashSys.manualEmitCount = Math.round(60 + 240 * Math.max(0, Math.min(1.5, size)));
  }

  dispose(): void { this.crest.dispose(); this.rail.dispose(); this.splashSys.dispose(); this.wake.dispose(); this.tex.dispose(); }
}
