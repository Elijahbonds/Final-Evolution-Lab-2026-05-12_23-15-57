// BoostFx — what a boost LOOKS, SOUNDS and FEELS like (FINISH-RELEASE, 2026-09-14). Owner: "big and loud".
//
// Driven entirely by BoostKit's `k` (0..1, already ramped in wall-clock time) and its events, so every speed mode gets
// the same language: learn it on the kart and the snowboard reads the same.
//
//   lens   — `fovMult()` widens the mode's resting fov by up to +14%. Modes already run their lens through
//            `stepSpeedFov(cur, baseFov, …)`; they pass `baseFov * fx.fovMult()`, so the boost punch rides the same
//            frame-rate-independent smoothing instead of fighting it.
//   trail  — a TrailMesh ribbon behind the rider / vehicle, unlit (a StandardMaterial clips white under the PBR rig —
//            see visual/standardMaterialRatchet.test.ts), alpha following k.
//   lines  — speed streaks: a stretched-billboard particle system riding the camera, spawning ahead of the lens and
//            flying past it. Emission follows k, so it thins out as the burn bleeds off.
//   sound  — a whoosh on ignition, `powerUp` when the meter fills.
//   rumble — a hard kick on ignition, light pulses while burning.

import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, PBRMaterial, TrailMesh, Vector3 } from '@babylonjs/core';
import type { Camera, Scene, TransformNode } from '@babylonjs/core';
import type { BoostEvents, BoostKit } from '../core/BoostKit';
import { SoundKit } from '../audio/SoundKit';
import { padRumble } from './Haptics';

export const BOOST_FOV_GAIN = 0.14;

export interface BoostFxOpts {
  /** The node the trail streams from (the board, the kart, the plane). */
  trailFrom: TransformNode;
  /** Ribbon width, metres. A plane wants a wider one than a skateboard. */
  trailWidth?: number;
  color?: string;
}

export class BoostFx {
  private trail: TrailMesh | null = null;
  private trailMat: PBRMaterial | null = null;
  private lines: ParticleSystem | null = null;
  private emitter: Mesh | null = null;
  private pulseT = 0;
  private disposed = false;

  constructor(private scene: Scene, private camera: Camera, private opts: BoostFxOpts) {
    const color = Color3.FromHexString(opts.color ?? '#22d3ee');
    try {
      this.trail = new TrailMesh('boostTrail', opts.trailFrom, scene, { diameter: opts.trailWidth ?? 0.35, length: 36, autoStart: true });
      const m = new PBRMaterial('boostTrailMat', scene);
      m.unlit = true; m.albedoColor = color; m.emissiveColor = color; m.alpha = 0; m.backFaceCulling = false;
      m.disableDepthWrite = true;
      this.trail.material = m; this.trailMat = m;
      this.trail.isPickable = false; this.trail.isVisible = false;
    } catch { this.trail = null; }

    try {
      // the emitter rides the camera, a little ahead of it
      this.emitter = MeshBuilder.CreateBox('boostLinesEmitter', { size: 0.01 }, scene);
      this.emitter.isVisible = false; this.emitter.isPickable = false;
      this.emitter.parent = camera;
      this.emitter.position.set(0, 0, 9);
      const tex = new DynamicTexture('boostLineTex', { width: 8, height: 64 }, scene, false);
      const g = tex.getContext();
      const grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 8, 64); tex.update(); tex.hasAlpha = true;
      const ps = new ParticleSystem('boostLines', 600, scene);
      ps.particleTexture = tex;
      ps.emitter = this.emitter;
      ps.isLocal = true;
      ps.minEmitBox = new Vector3(-7, -4, 0); ps.maxEmitBox = new Vector3(7, 4, 6);
      ps.direction1 = new Vector3(0, 0, -1); ps.direction2 = new Vector3(0, 0, -1);
      ps.minEmitPower = 26; ps.maxEmitPower = 40;
      ps.minLifeTime = 0.18; ps.maxLifeTime = 0.32;
      ps.minSize = 0.04; ps.maxSize = 0.09;
      ps.minScaleY = 14; ps.maxScaleY = 26;
      ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
      ps.color1 = new Color4(1, 1, 1, 0.55); ps.color2 = new Color4(color.r, color.g, color.b, 0.4); ps.colorDead = new Color4(1, 1, 1, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.emitRate = 0;
      ps.start();
      this.lines = ps;
    } catch { this.lines = null; }
  }

  /** Call every frame after BoostKit.update(), with the events it returned. */
  update(dt: number, boost: BoostKit, ev: BoostEvents): void {
    if (this.disposed) return;
    const k = boost.k;
    if (this.trail && this.trailMat) {
      this.trail.isVisible = k > 0.02;
      this.trailMat.alpha = 0.75 * k;
    }
    if (this.lines) this.lines.emitRate = Math.round(420 * k * k);
    if (ev.started) {
      SoundKit.play('whoosh', { pitch: 0.75, volume: 0.9 });
      padRumble(0.85, 200);
      navigator.vibrate?.(35);
    }
    if (ev.full) { SoundKit.play('powerUp', { volume: 0.7 }); padRumble(0.4, 90); }
    if (ev.denied) SoundKit.play('uiTick', { pitch: 0.55, volume: 0.6 });   // a dry click: the press was heard, the tank is empty
    if (boost.burning) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) { padRumble(0.25, 60); this.pulseT = 0.25; }
    } else this.pulseT = 0;
  }

  /** Multiply the mode's resting fov by this before stepSpeedFov. */
  fovMult(boost: BoostKit): number { return 1 + BOOST_FOV_GAIN * boost.k; }

  dispose(): void {
    this.disposed = true;
    this.lines?.dispose(); this.lines = null;
    this.emitter?.dispose(); this.emitter = null;
    this.trail?.dispose(); this.trail = null;
    this.trailMat?.dispose(); this.trailMat = null;
  }
}
