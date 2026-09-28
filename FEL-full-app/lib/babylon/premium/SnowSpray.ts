// SnowSpray — the snow answers the board (GATE-CRASHER-MAJOR, 2026-09-28: "carve + speed readable on Mountain Slope").
//
// The slalom rider carved a white slope and the snow did nothing: no spray off the edge, no line left behind, no powder
// when he went down. At the gate-line speed (8–10 m/s) and with the bank normalised against a 27 m/s ceiling the body
// barely leaned, so a carve and a straight glide were the same picture. Three voices, driven every frame by the mode
// (no timers of their own, so a hit-stop freezes the snow with the rider), in SurfSpray's shape:
//   · EDGE SPRAY — a fan of snow thrown off the board's uphill edge, scaled by how hard it is carving and how fast;
//   · CARVE TRACKS — the line the edge cuts, left on the groom behind the board and fading: an S down the gates is an S
//     you can SEE, and a skid reads as a smear;
//   · POWDER — one-shot bursts: a landing (a puff), a wipeout (a cloud that hangs).

import { Color3, Color4, DynamicTexture, Matrix, MeshBuilder, PBRMaterial, ParticleSystem, Quaternion, Vector3 } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';

export interface SnowFrame {
  /** The board, world (the rider's root sits on it). */
  at: Vector3;
  /** Travel heading, radians (0 = down the fall line, +x = +yaw). */
  yaw: number;
  /** Forward speed, m/s. */
  speed: number;
  /** 0..1 — how hard the edge is set (the lean through a turn). */
  carve: number;
  /** Which way the turn goes (+1 toward +x); the spray leaves the OUTSIDE of it. */
  side: number;
  /** On the snow (a board in the air throws nothing and cuts nothing). */
  grounded: boolean;
  /** The piste's pitch, so a track lies flat on it. */
  pitch: number;
}

function flakeTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('snowFlake', { width: 64, height: 64 }, scene, false);
  const g = tex.getContext() as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(245,250,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  tex.hasAlpha = true; tex.update();
  return tex;
}

/** Track segments kept on the snow (a ring buffer): 3.5 s of carving at 12 m/s, laid every 0.28 m. */
export const TRACK_SEGMENTS = 150;
const TRACK_STEP_M = 0.28;
const TRACK_LIFE_SEC = 5;

export class SnowSpray {
  private tex: DynamicTexture;
  private edge: ParticleSystem;
  private wake: ParticleSystem;
  private powder: ParticleSystem;
  private edgeAt = new Vector3();
  private wakeAt = new Vector3();
  private powderAt = new Vector3();
  private tracks: Mesh;
  private trackBuf = new Float32Array(TRACK_SEGMENTS * 16);
  private trackAge = new Float32Array(TRACK_SEGMENTS).fill(TRACK_LIFE_SEC);
  private trackCol = new Float32Array(TRACK_SEGMENTS * 4);
  private trackHead = 0;
  private lastTrack: Vector3 | null = null;
  private tmp = new Matrix();

  private fresh: Color3;
  private filled: Color3;

  /** `trackHex` is a fresh cut; `snowHex` the groom it fills back into (the venue's ground). */
  constructor(scene: Scene, trackHex = '#7f9cc2', snowHex = '#eef4fb') {
    this.fresh = Color3.FromHexString(trackHex); this.filled = Color3.FromHexString(snowHex);
    this.tex = flakeTexture(scene);
    const make = (name: string, cap: number): ParticleSystem => {
      const ps = new ParticleSystem(name, cap, scene);
      ps.particleTexture = this.tex;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      // near-white: tinted any greyer, the tone-mapped frame turned the spray to smoke (the carve frames). It reads against
      // the rider, the trees and the sky; on the snow the TRACKS are the carve's read.
      ps.color1 = new Color4(0.96, 0.98, 1, 0.95); ps.color2 = new Color4(0.9, 0.95, 1, 0.8);
      ps.colorDead = new Color4(1, 1, 1, 0);
      ps.gravity = new Vector3(0, -9.8, 0);
      ps.emitRate = 0;
      ps.start();
      return ps;
    };
    // edge spray: a fan off the board's edge, up and out of the turn
    this.edge = make('snowEdgeSpray', 900);
    this.edge.emitter = this.edgeAt;
    this.edge.minEmitBox = new Vector3(-0.25, 0, -0.6); this.edge.maxEmitBox = new Vector3(0.25, 0.1, 0.6);
    this.edge.minEmitPower = 2; this.edge.maxEmitPower = 5;
    this.edge.minLifeTime = 0.35; this.edge.maxLifeTime = 0.85;
    this.edge.minSize = 0.1; this.edge.maxSize = 0.34;
    // wake: the fine powder a fast board drags behind it
    this.wake = make('snowWake', 500);
    this.wake.emitter = this.wakeAt;
    this.wake.minEmitBox = new Vector3(-0.3, 0, -0.2); this.wake.maxEmitBox = new Vector3(0.3, 0.15, 0.2);
    this.wake.minEmitPower = 0.3; this.wake.maxEmitPower = 1.1;
    this.wake.minLifeTime = 0.4; this.wake.maxLifeTime = 1.0;
    this.wake.minSize = 0.12; this.wake.maxSize = 0.4;
    this.wake.gravity = new Vector3(0, -1.2, 0);
    // powder: manual bursts
    this.powder = make('snowPowder', 700);
    this.powder.emitter = this.powderAt;
    this.powder.minEmitBox = new Vector3(-0.7, 0, -0.7); this.powder.maxEmitBox = new Vector3(0.7, 0.3, 0.7);
    this.powder.direction1 = new Vector3(-1.6, 1.2, -1.6); this.powder.direction2 = new Vector3(1.6, 3.2, 1.6);
    this.powder.minLifeTime = 0.6; this.powder.maxLifeTime = 1.5;
    this.powder.minSize = 0.12; this.powder.maxSize = 0.36;
    this.powder.gravity = new Vector3(0, -2.5, 0);
    this.powder.manualEmitCount = 0;

    // the carve tracks: one flat strip, thin-instanced into a ring on the snow
    this.tracks = MeshBuilder.CreateBox('snow_track', { width: 0.2, height: 0.01, depth: TRACK_STEP_M * 2.1 }, scene);   // overlapping: a line, not dashes
    const m = new PBRMaterial('snowTrackM', scene);
    m.albedoColor = Color3.White(); m.metallic = 0; m.roughness = 1;   // the instance colour IS the track's colour
    this.tracks.material = m;
    this.tracks.isPickable = false;
    Matrix.ScalingToRef(0, 0, 0, this.tmp);
    for (let i = 0; i < TRACK_SEGMENTS; i++) this.tmp.copyToArray(this.trackBuf, i * 16);
    this.tracks.thinInstanceSetBuffer('matrix', this.trackBuf, 16, false);
    this.tracks.thinInstanceSetBuffer('color', this.trackCol, 4, false);
  }

  /** Every frame, from the mode. `dt` ages the tracks. */
  update(f: SnowFrame, dt: number): void {
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    const speed01 = Math.max(0, Math.min(1, f.speed / 14));
    const carve = f.grounded ? Math.max(0, Math.min(1, f.carve)) : 0;
    // EDGE SPRAY off the uphill edge, thrown to the outside of the turn and back
    const side = f.side >= 0 ? 1 : -1;
    this.edgeAt.set(f.at.x - side * fz * 0.15, f.at.y + 0.05, f.at.z + side * fx * 0.15);
    this.edge.emitRate = Math.round(Math.min(1, carve * 1.4) ** 2 * 900 * (0.3 + 0.7 * speed01));
    const ox = -side * fz, oz = side * fx;   // the outside of the turn, across the board
    this.edge.direction1 = new Vector3(ox * 1.2 - fx * 1.2, 1.4, oz * 1.2 - fz * 1.2);
    this.edge.direction2 = new Vector3(ox * 3.2 - fx * 0.2, 3.4, oz * 3.2 - fz * 0.2);
    // WAKE behind a fast board
    this.wakeAt.set(f.at.x - fx * 0.7, f.at.y + 0.05, f.at.z - fz * 0.7);
    this.wake.emitRate = f.grounded ? Math.round(Math.max(0, speed01 - 0.35) * 160) : 0;
    this.wake.direction1 = new Vector3(-fx * 1.5 - 0.4, 0.5, -fz * 1.5 - 0.4); this.wake.direction2 = new Vector3(-fx * 0.5 + 0.4, 1.4, -fz * 0.5 + 0.4);
    // CARVE TRACKS: a segment every TRACK_STEP_M of travel on the snow
    let dirty = false;
    if (f.grounded && f.speed > 1.5) {
      if (!this.lastTrack || Vector3.DistanceSquared(this.lastTrack, f.at) > TRACK_STEP_M * TRACK_STEP_M) {
        const i = this.trackHead; this.trackHead = (this.trackHead + 1) % TRACK_SEGMENTS;
        const q = Quaternion.RotationYawPitchRoll(f.yaw, f.pitch, 0);
        Matrix.ComposeToRef(new Vector3(1 + carve * 0.8, 1, 1), q, new Vector3(f.at.x, f.at.y + 0.015, f.at.z), this.tmp);
        this.tmp.copyToArray(this.trackBuf, i * 16);
        this.trackAge[i] = 0;
        this.lastTrack = f.at.clone();
        dirty = true;
      }
    } else this.lastTrack = null;
    // age + fade: a fresh cut is the track colour and fills back in to the snow's own over its life, then goes
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
      if (this.trackAge[i] >= TRACK_LIFE_SEC) continue;
      this.trackAge[i] += dt;
      const k = Math.max(0, 1 - this.trackAge[i] / TRACK_LIFE_SEC);
      const e = k * k;                                          // holds its colour, then fills in fast at the end
      this.trackCol[i * 4] = this.filled.r + (this.fresh.r - this.filled.r) * e;
      this.trackCol[i * 4 + 1] = this.filled.g + (this.fresh.g - this.filled.g) * e;
      this.trackCol[i * 4 + 2] = this.filled.b + (this.fresh.b - this.filled.b) * e;
      this.trackCol[i * 4 + 3] = 1;
      if (this.trackAge[i] >= TRACK_LIFE_SEC) { Matrix.ScalingToRef(0, 0, 0, this.tmp); this.tmp.copyToArray(this.trackBuf, i * 16); dirty = true; }
    }
    if (dirty) this.tracks.thinInstanceBufferUpdated('matrix');
    this.tracks.thinInstanceBufferUpdated('color');
  }

  /** A one-shot powder burst. size 0.4 = a landing, 1 = a wipeout. */
  burst(at: Vector3, size = 1): void {
    this.powderAt.copyFrom(at);
    this.powder.minEmitPower = 0.5 + size * 0.5; this.powder.maxEmitPower = 1 + size * 1.4;   // it hangs round the body, not in the lens
    this.powder.manualEmitCount = Math.round(30 + 170 * Math.max(0, Math.min(1.5, size)));
  }

  /** The tracks alive right now (the probe reads it). */
  get liveTracks(): number { let n = 0; for (let i = 0; i < TRACK_SEGMENTS; i++) if (this.trackAge[i] < TRACK_LIFE_SEC) n++; return n; }

  dispose(): void {
    this.edge.dispose(); this.wake.dispose(); this.powder.dispose(); this.tex.dispose();
    this.tracks.material?.dispose(); this.tracks.dispose();
  }
}
