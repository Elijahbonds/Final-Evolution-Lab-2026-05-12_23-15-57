// HOOPS SCUFFS (vis-hoops-court, 2026-10-14) — a hard stop, a planted cut and a landing leave a mark on the court.
//
// Part B (onevone, threevthree): "procedural scuff decals where cuts are planted". The shared pool (visual/GroundDecals) takes
// `felDecals.stamp('scuff', x, z, yaw)`; what was missing is something that knows WHEN a body planted. The modes already know
// (a cut, a stop, a landing) but each says it in its own way, in a 3 600-line closure that another lane is editing — so this
// reads what the bodies DID instead: their roots' ground positions frame by frame. A body that was running and is not, a body
// that turned its heading hard at speed, a body that was in the air and is not: that is a plant, whoever asked for it.
//
// The tracker is pure (positions in, stamps out) and tested; the mount only feeds it from the scene's render loop and hands
// the stamps to the pool. It reads positions and writes decals, nothing else: it can't change a move, a speed or a score.

import type { Scene, TransformNode } from '@babylonjs/core';
import { stampDecal } from './decals';

export type ScuffWhy = 'stop' | 'cut' | 'land';
export interface ScuffStamp { x: number; z: number; /** the way the body was travelling, radians (the mark lies along it) */ yaw: number; scale: number; why: ScuffWhy }

/** A body counts as running above this ground speed, m/s (a jog is ~3, a sprint ~6). */
export const RUN_MPS = 3.2;
/** …and as stopped under this. */
export const STOP_MPS = 1.3;
/** A heading change of at least this, radians (66 degrees), inside CUT_WINDOW_S at speed is a cut. */
export const CUT_RAD = 1.15;
/** …between the heading now and the heading this long ago, seconds. */
export const CUT_WINDOW_S = 0.22;
/** Airborne for this long (above AIR_Y) before a landing counts, seconds. */
export const AIR_Y = 0.14, AIR_MIN_S = 0.22;
/** One mark per body per this long, seconds. */
export const SCUFF_COOLDOWN_S = 0.45;
/** A step this long, metres, is a teleport (a possession reset), not a stride: the tracker starts over. */
export const TELEPORT_M = 2.4;
/** The velocity is smoothed over about this long, seconds. */
const SMOOTH_S = 0.1;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** One body's tracker. */
export class ScuffTracker {
  private has = false;
  private px = 0; private pz = 0; private py = 0;
  private vx = 0; private vz = 0;      // smoothed ground velocity
  private hist: { age: number; yaw: number }[] = [];   // headings while running, newest last (a cut is judged against the heading ~0.2 s ago)
  private airSec = 0;
  private cool = 0;
  private pendingStop = 0;             // seconds since the body last ran fast (a stop is judged against that run)
  private runSpeed = 0; private runYaw = 0;

  reset(): void { this.has = false; this.airSec = 0; this.cool = 0; this.vx = this.vz = 0; this.pendingStop = 0; this.runSpeed = 0; this.hist.length = 0; }

  /** Advance by `dt` seconds with the body now at (x, y, z). Returns the marks this step lays (usually none). */
  step(dt: number, x: number, y: number, z: number): ScuffStamp[] {
    if (!(dt > 1e-4)) return [];
    if (!this.has || Math.hypot(x - this.px, z - this.pz) > TELEPORT_M) {
      this.has = true; this.px = x; this.pz = z; this.py = y; this.vx = this.vz = 0; this.airSec = 0; this.runSpeed = 0; this.pendingStop = 0; this.hist.length = 0;
      return [];
    }
    this.cool = Math.max(0, this.cool - dt);
    const ix = (x - this.px) / dt, iz = (z - this.pz) / dt;
    const k = Math.min(1, dt / SMOOTH_S);
    this.vx += (ix - this.vx) * k; this.vz += (iz - this.vz) * k;
    this.px = x; this.pz = z;
    const out: ScuffStamp[] = [];
    const speed = Math.hypot(this.vx, this.vz);
    // airborne time: above AIR_Y; the landing is the step it comes back down
    const wasAir = this.airSec;
    if (y > AIR_Y) this.airSec += dt; else this.airSec = 0;
    const landed = wasAir >= AIR_MIN_S && y <= AIR_Y;
    this.py = y;
    if (speed >= RUN_MPS) { this.runSpeed = speed; this.runYaw = Math.atan2(this.vx, this.vz); this.pendingStop = 0; } else if (this.runSpeed > 0) { this.pendingStop += dt; if (this.pendingStop > 0.3) this.runSpeed = 0; }
    const lay = (why: ScuffWhy, yaw: number, scale: number): void => {
      if (this.cool > 0) return;
      this.cool = SCUFF_COOLDOWN_S;
      out.push({ x, z, yaw, scale: Math.max(0.55, Math.min(1.3, scale)), why });
    };
    if (landed) lay('land', speed > 0.8 ? Math.atan2(this.vx, this.vz) : this.runYaw, 0.7 + Math.min(0.5, wasAir * 0.9));
    else if (y <= AIR_Y) {
      if (this.runSpeed >= RUN_MPS && speed <= STOP_MPS) { lay('stop', this.runYaw, 0.6 + this.runSpeed * 0.1); this.runSpeed = 0; }
      else if (speed >= RUN_MPS * 0.8) {
        const yaw = Math.atan2(this.vx, this.vz);
        for (const h of this.hist) h.age += dt;
        while (this.hist.length && this.hist[0].age > CUT_WINDOW_S) this.hist.shift();
        const then = this.hist[0];
        if (then && Math.abs(wrap(yaw - then.yaw)) >= CUT_RAD) { lay('cut', yaw, 0.6 + speed * 0.1); this.hist.length = 0; }
        this.hist.push({ age: 0, yaw });
      } else this.hist.length = 0;
    }
    return out;
  }
}

export interface HoopsScuffsHandle { readonly stamped: number; dispose(): void }

/** Feed the tracker from the scene's render loop for these bodies (re-read each frame: they are spawned in load()). Pauses itself
 *  while a replay is on screen (the bodies are the recording's then, not the game's). */
export function mountHoopsScuffs(scene: Scene, bodies: () => readonly (TransformNode | null | undefined)[], opts: { y?: number; maxPerSecond?: number } = {}): HoopsScuffsHandle {
  const trackers = new Map<TransformNode, ScuffTracker>();
  const y = opts.y ?? 0.02;
  let stamped = 0;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const meta = scene.metadata as { felCinematic?: number } | null;
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const cinematic = !!meta?.felCinematic;
    for (const b of bodies()) {
      if (!b || b.isDisposed()) continue;
      let t = trackers.get(b);
      if (!t) { t = new ScuffTracker(); trackers.set(b, t); }
      if (cinematic) { t.reset(); continue; }
      const p = b.position;
      for (const s of t.step(dt, p.x, p.y, p.z)) { if (stampDecal(scene, 'scuff', s.x, s.z, s.yaw, s.scale, y)) stamped++; }
    }
  });
  return { get stamped() { return stamped; }, dispose() { scene.onBeforeRenderObservable.remove(obs); trackers.clear(); } };
}
