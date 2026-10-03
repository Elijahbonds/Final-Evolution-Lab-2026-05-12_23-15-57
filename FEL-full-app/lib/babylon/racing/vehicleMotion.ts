// VEHICLE MOTION (10-phase pass, phase 9, 2026-10-03): the machines move like machines. The karts' wheels
// spin at road speed and the fronts yaw with the APPLIED steer (KartState.steerAt — what the tyres are
// doing, not what the thumbs asked for); the body bobs on its suspension while the wheels stay planted;
// the exhaust puffs under throttle. The planes' prop rates live in AERO_TUNE and the blades smear into a
// blur disc at high rpm. The LOOK NUMBERS are here so a feel change is a one-line, greppable, tested edit.

import { Color4, Mesh, MeshBuilder, ParticleSystem, Vector3 } from '@babylonjs/core';
import type { Scene, TransformNode } from '@babylonjs/core';
import { moteTexture } from './speedFx';   // phase 8's soft dot — the puff and the dust share a sprite

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** How far the front wheels yaw at full applied lock, radians. Under the steering wheel's own lock: the
 *  wheel in the driver's hands is theatre, these are tyres — past ~24° a kart's front is scrubbing. */
export const WHEEL_STEER_LOCK = 0.42;

/** The front wheels' yaw for an applied steer (−1..1 — KartState.steerAt, already slew-eased by the model). */
export function frontWheelAngle(steerAt: number): number {
  return clamp(steerAt, -1, 1) * WHEEL_STEER_LOCK;
}

/** A wheel's roll angle after travelling at `speed` for `dt`, wrapped — feed the ODOMETER forward, divide by
 *  THIS wheel's radius (the kart's rears are fatter than its fronts, so they turn slower). */
export function wheelAngle(distance: number, radius: number): number {
  return (distance / Math.max(0.05, radius)) % TAU;
}

/** Wrap an angle delta into (−π, π] — headings live on a circle, so a raw subtraction reads a wrap past
 *  ±π as a full-lock flick the wrong way. */
export function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The turn rate (rad/s) that maps to full visual lock for a rival whose steer state we cannot read. */
export const RIVAL_STEER_RATE = 2.2;

/** A fallback rival's steer 0..1 from its measured turn rate (legacy path rivals have no KartState). */
export function rivalSteer(turnRate: number): number {
  return clamp(turnRate / RIVAL_STEER_RATE, -1, 1);
}

/** The suspension bob. Small and fast on tarmac, big and slow on the rough — the body breathes, the wheels
 *  stay on the road (the mode counters their y by the same amount). */
export const BOB = {
  freqIdle: 5.5,   // Hz at a standstill: the engine's idle shake
  freqTop: 11,     // Hz flat out
  roadAmp: 0.012,  // m at top speed on tarmac — a hum, not a bounce
  offRoadAmp: 0.045,
} as const;

export function bobFreq(speed01: number): number {
  return BOB.freqIdle + (BOB.freqTop - BOB.freqIdle) * clamp(speed01, 0, 1);
}

export function bobAmp(speed01: number, offRoad: boolean): number {
  return offRoad ? BOB.offRoadAmp : BOB.roadAmp * clamp(speed01, 0, 1);
}

/** The exhaust's puff rate: a putter at idle, a stream under throttle. */
export const EXHAUST_RATE = { idle: 4, full: 26 } as const;

export function exhaustRate(throttle01: number): number {
  return EXHAUST_RATE.idle + (EXHAUST_RATE.full - EXHAUST_RATE.idle) * clamp(throttle01, 0, 1);
}

/** How blurred the prop is at an rpm: 0 below `from`, 1 at `to` — the blades fade as the disc fades in. */
export function propBlurK(rpm: number, from: number, to: number): number {
  return clamp((rpm - from) / Math.max(1, to - from), 0, 1);
}

/** The blur disc's peak opacity and how far the blades fade — a smeared ghost of a prop, not a solid plate. */
export const PROP_BLUR = { discAlpha: 0.5, bladeFade: 0.8 } as const;

/**
 * The kart's exhaust puffs: one small continuous emitter at the pipe tip, rate following the throttle.
 * The DustEmitter pattern (an invisible seed mesh, rate changes are free) at a fraction of its budget.
 */
export class ExhaustPuffs {
  private ps: ParticleSystem | null = null;
  private node: Mesh | null = null;

  constructor(scene: Scene, parent: TransformNode, name: string, tip: Vector3) {
    try {
      this.node = MeshBuilder.CreateBox(`exhaustNode_${name}`, { size: 0.01 }, scene);
      this.node.isVisible = false; this.node.isPickable = false;
      this.node.parent = parent;
      this.node.position.copyFrom(tip);
      const ps = new ParticleSystem(`exhaust_${name}`, 48, scene);
      ps.particleTexture = moteTexture(scene);
      ps.emitter = this.node;
      ps.minEmitBox = new Vector3(-0.02, -0.02, -0.02); ps.maxEmitBox = new Vector3(0.02, 0.02, 0.02);
      ps.direction1 = new Vector3(-0.25, 0.5, -1); ps.direction2 = new Vector3(0.25, 1.1, -1.8);   // up and back off the pipe
      ps.minEmitPower = 0.4; ps.maxEmitPower = 0.9;
      ps.minLifeTime = 0.25; ps.maxLifeTime = 0.5;
      ps.minSize = 0.05; ps.maxSize = 0.14;
      ps.color1 = new Color4(0.62, 0.64, 0.67, 0.4); ps.color2 = new Color4(0.5, 0.52, 0.56, 0.28);
      ps.colorDead = new Color4(0.5, 0.52, 0.56, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.emitRate = 0;
      ps.start();
      this.ps = ps;
    } catch { this.ps = null; }
  }

  /** Call every frame with the throttle 0..1. */
  update(throttle01: number): void {
    if (this.ps) this.ps.emitRate = exhaustRate(throttle01);
  }

  dispose(): void { this.ps?.dispose(); this.ps = null; this.node?.dispose(); this.node = null; }
}
