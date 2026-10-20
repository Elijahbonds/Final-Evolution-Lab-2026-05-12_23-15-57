// locoAccent — THE STOP AND THE START, DRAWN ON THE BODY (hoops-dip movement pass, owner 2026-10-20: "stops and starts: a visible decel step
// and a push-off on the first step"). The movement's speeds are the movement's (CourtMovement, DribbleController: tuned) and nothing here
// reads or writes one; this layer only reads the body's own ground speed off its root and draws two accents on top of the loops:
//   · the DECEL STEP: from at least STOP_FROM_MPS, braking harder than STOP_DECEL_MPS2 — the body sinks (ACCENT_DROP_M.stop) and leans BACK
//     against the brake (ACCENT_LEAN_DEG.stop) over ACCENT_SEC.stop, the feet where the loop and the planter put them (the planted lead foot);
//   · the PUSH-OFF: from under START_FROM_MPS, accelerating harder than START_ACCEL_MPS2 — the body loads (sinks) and leans INTO the first
//     step over ACCENT_SEC.start.
// Only on a locomotion / dribble loop (the tree's state; never on a shot, a gather, a move beat, a dunk, a reaction). The sink is legSink's
// (the knees bend, the feet stay); the lean turns the Spine about the athlete's right axis. Mounted after the posture layer (which would pull
// a spine lean back toward its stance) and before the carry (whose reach reads the shoulders where they are drawn).
import { Space, Vector3 } from '@babylonjs/core';
import type { Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { animDt } from './motionLayers';
import { sinkRig, sinkRead, sinkHipsKeepFeet, type SinkRig } from './legSink';
import { DIP_MIN_HIPS_OVER_ANKLE } from './moveDip';

export type AccentKind = 'stop' | 'start';
/** A stop counts from this ground speed (m/s; a jog is ~3.7). (new) */
export const STOP_FROM_MPS = 2.6;
/** …braking harder than this (m/s², the smoothed speed's fall). (new) */
export const STOP_DECEL_MPS2 = 7;
/** A start counts from under this ground speed (m/s). (new) */
export const START_FROM_MPS = 0.6;
/** …accelerating harder than this (m/s²). (new) */
export const START_ACCEL_MPS2 = 5;
/** How long each accent is drawn (s), how far the hips go down at its middle (m), how far the chest leans (deg; + = forward). (new) */
export const ACCENT_SEC: Readonly<Record<AccentKind, number>> = { stop: 0.32, start: 0.26 };
export const ACCENT_DROP_M: Readonly<Record<AccentKind, number>> = { stop: 0.06, start: 0.045 };
export const ACCENT_LEAN_DEG: Readonly<Record<AccentKind, number>> = { stop: -8, start: 10 };
/** No new accent within this long of the last one starting (s). (new) */
export const ACCENT_GAP_SEC = 0.4;
/** The ground speed is smoothed over this time constant (s) before its rate of change is read. */
export const SPEED_TAU_SEC = 0.05;
/** The loop states an accent may be drawn on (basketballTree's names). */
export const ACCENT_STATES: ReadonlySet<string> = new Set(['idle_dribble', 'walk_dribble', 'speed_dribble', 'sprint_dribble', 'drive', 'protect', 'run', 'watch', 'carry_slide', 'carry_slide_right', 'carry_back']);

/** The accent's shape at progress u (0..1): 0 at both ends, 1 at the middle — a sine bump (pure). */
export const accentShape = (u: number): number => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u));
/** A start counts within this long of the body last being under START_FROM_MPS (s). */
export const START_WINDOW_SEC = 0.25;
/** Which accent the speed trace starts now, if any (pure): `accel` the smoothed speed's rate (m/s²), `peak` the speed it had a moment ago
 *  (m/s), `sinceStill` how long since it was last under START_FROM_MPS (s). */
export function accentFor(accel: number, peak: number, sinceStill: number): AccentKind | null {
  if (peak >= STOP_FROM_MPS && accel <= -STOP_DECEL_MPS2) return 'stop';
  if (sinceStill <= START_WINDOW_SEC && accel >= START_ACCEL_MPS2) return 'start';
  return null;
}

export interface AccentState { kind: AccentKind | null; t: number; sinceStart: number; speed: number; peak: number; sinceStill: number; seeded: boolean }
export const accentIdle = (): AccentState => ({ kind: null, t: 0, sinceStart: Infinity, speed: 0, peak: 0, sinceStill: 0, seeded: false });
/** One frame of the detector (pure): the raw ground speed (m/s), dt, whether the body is on a loop. The accent drawn now and its progress
 *  (0..1), or null. An accent ends on its own clock, or at once when the body leaves its loop. */
export function stepAccent(s: AccentState, rawSpeed: number, dt: number, onLoop: boolean): { kind: AccentKind; u: number } | null {
  if (!(dt > 0)) return s.kind ? { kind: s.kind, u: s.t / ACCENT_SEC[s.kind] } : null;
  if (!s.seeded) { s.seeded = true; s.speed = rawSpeed; s.peak = rawSpeed; s.sinceStill = rawSpeed < START_FROM_MPS ? 0 : Infinity; }   // the first read: no rate yet
  const prev = s.speed;
  s.speed += (rawSpeed - s.speed) * (1 - Math.exp(-dt / SPEED_TAU_SEC));
  const accel = (s.speed - prev) / dt;
  s.peak = Math.max(s.speed, s.peak - 2 * dt);   // the speed it had a moment ago, decaying 2 m/s a second: a stop is FROM a run
  s.sinceStill = s.speed < START_FROM_MPS ? 0 : s.sinceStill + dt;
  s.sinceStart += dt;
  if (s.kind) { s.t += dt; if (s.t >= ACCENT_SEC[s.kind] || !onLoop) { s.kind = null; s.t = 0; } }
  if (!s.kind && onLoop && s.sinceStart >= ACCENT_GAP_SEC) {
    const k = accentFor(accel, s.peak, s.sinceStill);
    if (k) { s.kind = k; s.t = 0; s.sinceStart = 0; }
  }
  return s.kind ? { kind: s.kind, u: s.t / ACCENT_SEC[s.kind] } : null;
}

const PER_SKELETON = new WeakMap<Skeleton, LocoAccent>();
/** One body's accents. `stateOf` is the body's tree state now (null: none). */
export class LocoAccent {
  static for(scene: Scene, skeleton: Skeleton, root: TransformNode, stateOf: () => string | null): LocoAccent {
    const had = PER_SKELETON.get(skeleton); if (had) return had;
    const a = new LocoAccent(scene, skeleton, root, stateOf); PER_SKELETON.set(skeleton, a); return a;
  }
  private obs: Observer<Scene> | null;
  private readonly rig: SinkRig | null;
  private readonly spine: TransformNode | null;
  private s = accentIdle();
  private last = new Vector3(); private seen = false;
  private ankleFloorY = NaN;
  /** The accent drawn on the last frame (the probe's and the tests' read). */
  now: { kind: AccentKind; drop: number; leanDeg: number } | null = null;
  constructor(private scene: Scene, skeleton: Skeleton, private root: TransformNode, private stateOf: () => string | null) {
    this.rig = sinkRig(skeleton, root);
    this.spine = findBone(skeleton, 'Spine')?.getTransformNode() ?? null;
    this.obs = this.rig ? scene.onAfterAnimationsObservable.add(() => this.apply()) : null;
  }
  dispose(): void { if (this.obs) { this.scene.onAfterAnimationsObservable.remove(this.obs); this.obs = null; } }

  private apply(): void {
    const rig = this.rig!;
    const dt = animDt(this.scene.getEngine().getDeltaTime() / 1000, this.scene.animationTimeScale);
    this.root.computeWorldMatrix(true);
    const p = this.root.getAbsolutePosition();
    const raw = this.seen && dt > 0 ? Math.hypot(p.x - this.last.x, p.z - this.last.z) / dt : 0;
    const placed = this.seen && dt > 0 && Math.hypot(p.x - this.last.x, p.z - this.last.z) > 0.8;   // a reset, not a run
    this.last.copyFrom(p); this.seen = true;
    const st = this.stateOf(); const onLoop = !!st && ACCENT_STATES.has(st);
    const a = placed ? null : stepAccent(this.s, raw, dt, onLoop);
    if (placed) this.s = accentIdle();
    const { hipsY, lowAnkleY } = sinkRead(rig);
    if (!a) { this.ankleFloorY = Number.isFinite(this.ankleFloorY) ? Math.min(lowAnkleY, this.ankleFloorY + 0.02 * dt) : lowAnkleY; this.now = null; return; }
    const k = accentShape(a.u);
    const drop = ACCENT_DROP_M[a.kind] * k, leanDeg = ACCENT_LEAN_DEG[a.kind] * k;
    const target = Math.max(this.ankleFloorY + DIP_MIN_HIPS_OVER_ANKLE, hipsY - drop);
    if (target < hipsY) sinkHipsKeepFeet(rig, target, 0, this.ankleFloorY);
    if (this.spine && Math.abs(leanDeg) > 1e-3) {
      const yaw = this.root.absoluteRotationQuaternion ? this.root.absoluteRotationQuaternion.toEulerAngles().y : this.root.rotation.y;
      // + pitches the chest toward the body's front: about the athlete's right axis (athleteSide: (cos yaw, 0, −sin yaw))
      this.spine.rotate(new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), (leanDeg * Math.PI) / 180, Space.WORLD);
      this.spine.computeWorldMatrix(true);
    }
    this.now = { kind: a.kind, drop: Math.max(0, hipsY - target), leanDeg };
  }
}
