// SHOT TRACER (vis-court, wave 2, 2026-10-13) — the line a broadcast draws behind a ball in the air.
//
// The audit's golf item: "Shot tracer (the signature AAA golf read): an emissive ribbon with apex and carry readout"; the derby's
// home-run item shares it ("a tracer with distance and exit velocity"). A bright ribbon that follows the ball's real path, always
// turned to face the camera (a ribbon laid flat in the world goes edge-on from the side), widening with distance so it reads from a
// tee 180 m back, held a moment where the ball came down, then faded.
//
// Visual only. It is fed the ball's position every frame and reads nothing else: no flight, no score, no judge. The mesh is named
// `fel_decal_tracer` so the rig never makes it a shadow caster (LightRig's NEVER_CAST) and the glossy floor never reflects it.

import { Color3, Engine, Mesh, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { apexOf, type V3 } from './flightRead';

/** Points the ribbon is built from. When the path outgrows this, every second point is dropped and the spacing doubles. */
export const TRACER_POINTS = 96;
/** The first spacing between samples, metres. */
export const TRACER_STEP_M = 0.35;
/** Seconds the finished line is held at full strength, then the seconds it takes to fade. */
export const TRACER_HOLD_SEC = 2.4;
export const TRACER_FADE_SEC = 0.8;

/** The sampled path of one flight. Pure: thinning and measuring are tested without a scene. */
export class TracerPath {
  pts: V3[] = [];
  step = TRACER_STEP_M;

  reset(): void { this.pts.length = 0; this.step = TRACER_STEP_M; }

  /** Add a sample when it is a full step from the last one (always the first). Returns true when it was kept. */
  push(p: V3): boolean {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) < this.step) return false;
    this.pts.push({ x: p.x, y: p.y, z: p.z });
    if (this.pts.length > TRACER_POINTS) {
      this.pts = this.pts.filter((_, i) => i % 2 === 0 || i === this.pts.length - 1);
      this.step *= 2;
    }
    return true;
  }

  /** The last sample is always the ball's latest place, even inside a step (so the line reaches where it landed). */
  closeAt(p: V3): void {
    const last = this.pts[this.pts.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z) this.pts.push({ x: p.x, y: p.y, z: p.z });
  }

  apex(): { at: V3; height: number } | null { return apexOf(this.pts); }
}

/**
 * Pure: the two edges of a camera-facing ribbon along `pts`, padded to exactly `n` points per edge (the extra points sit on the
 * last one, so an updatable ribbon keeps its vertex count). Half-width grows with distance from the camera so the line stays
 * readable far away: `base × (1 + dist × grow)`.
 */
export function ribbonEdges(pts: readonly V3[], cam: V3, base: number, grow: number, n: number): { left: V3[]; right: V3[] } {
  const left: V3[] = [], right: V3[] = [];
  const m = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[Math.min(i, m - 1)];
    const a = pts[Math.max(0, Math.min(i, m - 1) - 1)], b = pts[Math.min(m - 1, Math.min(i, m - 1) + 1)];
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const cx = cam.x - p.x, cy = cam.y - p.y, cz = cam.z - p.z;
    const dist = Math.hypot(cx, cy, cz) || 1;
    // side = tangent × toCamera
    let sx = ty * cz - tz * cy, sy = tz * cx - tx * cz, sz = tx * cy - ty * cx;
    const sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-6) { sx = 1; sy = 0; sz = 0; } else { sx /= sl; sy /= sl; sz /= sl; }
    const w = base * (1 + dist * grow);
    left.push({ x: p.x - sx * w, y: p.y - sy * w, z: p.z - sz * w });
    right.push({ x: p.x + sx * w, y: p.y + sy * w, z: p.z + sz * w });
  }
  return { left, right };
}

/** Pure: the tracer's strength 0..1, `age` seconds after the flight ended (held, then faded). */
export function tracerStrength(age: number): number {
  if (age < TRACER_HOLD_SEC) return 1;
  return Math.max(0, 1 - (age - TRACER_HOLD_SEC) / TRACER_FADE_SEC);
}

export interface TracerOpts { color?: string; width?: number; grow?: number; name?: string }

export class ShotTracer {
  readonly path = new TracerPath();
  private mesh: Mesh | null = null;
  private readonly mat: StandardMaterial;
  private readonly width: number;
  private readonly grow: number;
  private live = false;
  private age = 0;
  private readonly obs;

  constructor(private readonly scene: Scene, private readonly opts: TracerOpts = {}) {
    this.width = opts.width ?? 0.07;
    this.grow = opts.grow ?? 0.012;
    const c = Color3.FromHexString(opts.color ?? '#fff1b0');
    this.mat = new StandardMaterial(`${opts.name ?? 'fel_decal_tracer'}_m`, scene);
    this.mat.disableLighting = true; this.mat.emissiveColor = c; this.mat.diffuseColor = Color3.Black(); this.mat.specularColor = Color3.Black();
    this.mat.alpha = 0.95; this.mat.alphaMode = Engine.ALPHA_ADD; this.mat.backFaceCulling = false;
    this.obs = scene.onBeforeRenderObservable.add(() => this.frame(Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)));
  }

  /** A flight begins at `from`. */
  start(from: V3): void { this.path.reset(); this.path.push(from); this.live = true; this.age = 0; }

  /** The ball's place this frame (call every frame of the flight). */
  push(p: V3): void { if (this.live) this.path.push(p); }

  /** The flight is over where the ball came down: the line reaches it and is held. */
  finish(at: V3): void { if (!this.live) return; this.path.closeAt(at); this.live = false; this.age = 0; }

  /** Take the line away now. */
  clear(): void { this.live = false; this.path.reset(); this.age = TRACER_HOLD_SEC + TRACER_FADE_SEC; if (this.mesh) this.mesh.isVisible = false; }

  get active(): boolean { return this.live; }

  private camPos(): V3 {
    const cam = this.scene.activeCamera;
    if (!cam) return { x: 0, y: 5, z: -10 };
    return cam.globalPosition ?? cam.position;
  }

  private frame(dt: number): void {
    const pts = this.path.pts;
    if (pts.length < 2) { if (this.mesh) this.mesh.isVisible = false; return; }
    if (!this.live) this.age += dt;
    const k = this.live ? 1 : tracerStrength(this.age);
    if (k <= 0) { if (this.mesh) this.mesh.isVisible = false; return; }
    const { left, right } = ribbonEdges(pts, this.camPos(), this.width, this.grow, TRACER_POINTS);
    const toV = (a: V3[]): Vector3[] => a.map((p) => new Vector3(p.x, p.y, p.z));
    const paths = [toV(left), toV(right)];
    if (!this.mesh) {
      this.mesh = MeshBuilder.CreateRibbon(this.opts.name ?? 'fel_decal_tracer', { pathArray: paths, updatable: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      this.mesh.material = this.mat; this.mesh.isPickable = false; this.mesh.receiveShadows = false; this.mesh.alwaysSelectAsActiveMesh = true;
    } else {
      MeshBuilder.CreateRibbon('', { pathArray: paths, instance: this.mesh }, this.scene);
    }
    this.mesh.isVisible = true;
    this.mat.alpha = 0.95 * k;
  }

  dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.obs);
    this.mesh?.dispose(); this.mat.dispose(); this.mesh = null;
  }
}
