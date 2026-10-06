// LandingAbsorb — a landing sinks as deep as the fall was hard (MOVEMENT POLISH, 2026-10-06; owner: "jumps + dunks … landings").
//
// Every landing in the game is a CLIP, and a clip does not know the fall. Measured (scripts/probes/_movement-probe.ts): Free Run's
// `jump_land` drops the hips 22.9 cm whether the runner touched down at 3.1 m/s off a hop or 5.6 m/s off a 1.6 m drop; the dunk's
// `dunk_land_absorb` 9.7 cm off a 2.4 m/s hop and off a 4.4 m/s rim drop alike; the board's land 12.3 cm. A big drop that lands
// exactly like a small one reads weightless.
//
// This adds the difference: past a free speed (the clip already covers a hop), the hips sink a further `mPerMps` per m/s of impact,
// capped, on a quick compress and a slower recovery, AFTER the clips and the foot planter — the legs are re-solved (two-bone, knees
// toward where the clip bends them) so the feet stay exactly where they were and the knees take the load. Opt-in per body:
// `mountLandingAbsorb(scene, skeleton, root)`; it detects a touchdown itself from the root's vertical motion (a code-driven root
// falling faster than `detectMps` that stops), or the mode calls `.impact(v)` on the landing it already knows about.
import { Matrix, Vector3 } from '@babylonjs/core';
import type { Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from './boneLookup';
import { AdditiveQuat, AdditiveScalar } from './AdditiveTrack';
import { solveChainInFrame } from './TwoBoneIK';
import { bendPole } from './SteerGrip';

/** TUNED (new, MOVEMENT POLISH 2026-10-06): the absorb's curve. `freeMps`: the impact a landing clip already covers (a standing hop
 *  lands at ~2.4 m/s); `mPerMps`: the extra sink per m/s past it; `maxM`: the cap (a deep squat on top of the clip's own crouch);
 *  `compressSec` / `recoverSec`: the sink is fast, the rise slower — and a deeper sink rises slower still (up to +60%). */
export const ABSORB = { freeMps: 2.6, mPerMps: 0.035, maxM: 0.11, compressSec: 0.07, recoverSec: 0.26, detectMps: 2.0 } as const;

/** Extra hip sink (m) for a touchdown at `vImpact` m/s (downward speed, sign ignored). Pure. */
export function absorbDepth(vImpact: number, a = ABSORB): number {
  const v = Math.abs(Number.isFinite(vImpact) ? vImpact : 0);
  return Math.max(0, Math.min(a.maxM, (v - a.freeMps) * a.mPerMps));
}

const smooth = (x: number): number => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/** The sink (m) `t` seconds after a touchdown that asked for `depth`: eased down over compressSec, eased back over the recovery.
 *  Continuous, zero at t = 0 and after the recovery, never past `depth`. Pure. */
export function absorbAt(t: number, depth: number, a = ABSORB): number {
  if (!(depth > 0) || !(t > 0)) return 0;
  if (t <= a.compressSec) return depth * smooth(t / a.compressSec);
  const rec = a.recoverSec * (1 + 0.6 * Math.min(1, depth / a.maxM));
  return depth * (1 - smooth((t - a.compressSec) / rec));
}
/** How long an absorb of `depth` lasts (s). */
export function absorbSec(depth: number, a = ABSORB): number { return a.compressSec + a.recoverSec * (1 + 0.6 * Math.min(1, depth / a.maxM)); }

/** A code-driven root's touchdowns from its height alone: falling faster than `detectMps`, then (nearly) stopped. Pure. */
export class TouchdownDetector {
  private prevY: number | null = null;
  /** The fastest fall (most negative vy) of the descent in progress — the impact speed. The frame that reaches the floor covers only part
   *  of a frame's fall, so the last step reads slow; the descent's own speed is the honest one. */
  private fall = 0;
  constructor(private readonly detectMps = ABSORB.detectMps) {}
  /** Feed this frame's root height; returns the impact speed (m/s, > 0) on the frame the fall stops, else 0. */
  step(y: number, dt: number): number {
    if (!(dt > 0) || !Number.isFinite(y)) return 0;
    if (this.prevY === null) { this.prevY = y; return 0; }
    const dy = y - this.prevY; this.prevY = y;
    if (Math.abs(dy) > 2) { this.fall = 0; return 0; }   // a teleport (a reset, a respawn)
    const vy = dy / dt;
    if (vy < this.fall) { this.fall = vy; return 0; }   // still speeding up on the way down
    if (this.fall < -this.detectMps && vy > this.fall * 0.3) { const hit = -this.fall; this.fall = 0; return hit; }
    if (vy >= 0) this.fall = 0;   // rising again (a bounce, a new jump): a new descent starts from nothing
    return 0;
  }
  reset(): void { this.prevY = null; this.fall = 0; }
}

export interface LandingAbsorbOpts {
  /** Watch the root's height for touchdowns (default true). Off: only `.impact()` starts an absorb. */
  auto?: boolean;
  /** 0..1 scale on the sink (mobile can pass less). Default 1. */
  intensity?: number;
}

export interface LandingAbsorbHandle {
  /** A touchdown at `vImpact` m/s (the mode knows its own landing). A harder landing during an absorb restarts it deeper. */
  impact(vImpact: number): void;
  /** The sink being applied now (m), for probes. */
  readonly drop: number;
  dispose(): void;
}

export function mountLandingAbsorb(scene: Scene, skeleton: Skeleton, root: TransformNode, opts: LandingAbsorbOpts = {}): LandingAbsorbHandle {
  const hips = boneNode(skeleton, 'Hips');
  const legs = (['Left', 'Right'] as const).map((s) => ({ hip: boneNode(skeleton, `${s}UpLeg`), knee: boneNode(skeleton, `${s}Leg`), ankle: boneNode(skeleton, `${s}Foot`) }))
    .filter((l): l is { hip: TransformNode; knee: TransformNode; ankle: TransformNode } => !!(l.hip && l.knee && l.ankle));
  const intensity = opts.intensity ?? 1;
  const detector = opts.auto === false ? null : new TouchdownDetector();
  const track = { x: new AdditiveScalar(), y: new AdditiveScalar(), z: new AdditiveScalar() };
  // held-pose memory on the legs too: a clip that does not key the thigh / shin (idle_stand) leaves last frame's solve in place, and the
  // next solve would start from it (measured: the feet climbed 0.45 m in seven frames). Each frame the legs start from the clip's value.
  const legTracks = legs.map((l) => ({ hip: new AdditiveQuat(), knee: new AdditiveQuat(), l }));
  const fromClip = (n: TransformNode, t: AdditiveQuat) => { const q = n.rotationQuaternion; if (!q) return; const [x, y, z, w] = t.baseFor(q.x, q.y, q.z, q.w); q.set(x, y, z, w); };
  const wroteLeg = (n: TransformNode, t: AdditiveQuat) => { const q = n.rotationQuaternion; if (q) t.wrote(q.x, q.y, q.z, q.w); };
  let depth = 0, t = 0, drop = 0, applied = false;
  const inv = new Matrix(), worldDown = new Vector3(), local = new Vector3();
  const start = (v: number) => { const d = absorbDepth(v) * intensity; if (d > (depth > 0 ? absorbAt(t, depth) : 0)) { depth = d; t = 0; } };
  const obs: Observer<Scene> | null = !hips || legs.length < 2 ? null : scene.onAfterAnimationsObservable.add(() => {
    if (root.isDisposed() || hips!.isDisposed()) { scene.onAfterAnimationsObservable.remove(obs); return; }   // the body or its prop is gone: the layer goes with it
    const dt = Math.min(0.1, Math.max(0, scene.getEngine().getDeltaTime() / 1000));
    root.computeWorldMatrix(true);
    if (detector) { const v = detector.step(root.getAbsolutePosition().y, dt); if (v > 0) start(v); }
    if (depth > 0) { t += dt; drop = absorbAt(t, depth); if (t >= absorbSec(depth)) { depth = 0; drop = 0; } } else drop = 0;
    const p = hips.position;
    const base = { x: track.x.baseFor(p.x), y: track.y.baseFor(p.y), z: track.z.baseFor(p.z) };
    for (const t of legTracks) { fromClip(t.l.hip, t.hip); fromClip(t.l.knee, t.knee); }
    if (drop <= 1e-4) {
      // nothing to add: a hips position no clip keys goes back to its own value once (held-pose memory), then is left alone
      if (applied) { p.set(base.x, base.y, base.z); track.x.wrote(p.x); track.y.wrote(p.y); track.z.wrote(p.z); applied = false; }
      for (const t of legTracks) { wroteLeg(t.l.hip, t.hip); wroteLeg(t.l.knee, t.knee); }
      return;
    }
    // the feet as the clips and the planter left them — the sink must not move them
    const feet = legs.map((l) => { l.ankle.computeWorldMatrix(true); return l.ankle.getAbsolutePosition().clone(); });
    const knees = legs.map((l) => { l.knee.computeWorldMatrix(true); return l.knee.getAbsolutePosition().clone(); });
    const hipW = legs.map((l) => { l.hip.computeWorldMatrix(true); return l.hip.getAbsolutePosition().clone(); });
    // a world-down sink in the hips' parent space (the armature may be rotated and scaled)
    const parent = hips.parent as TransformNode | null;
    worldDown.set(0, -drop, 0);
    if (parent) { parent.computeWorldMatrix(true); parent.getWorldMatrix().invertToRef(inv); Vector3.TransformNormalToRef(worldDown, inv, local); } else local.copyFrom(worldDown);
    p.set(base.x + local.x, base.y + local.y, base.z + local.z);
    track.x.wrote(p.x); track.y.wrote(p.y); track.z.wrote(p.z); applied = true;
    hips.computeWorldMatrix(true);
    legs.forEach((l, i) => solveChainInFrame(l.hip, l.knee, l.ankle, feet[i], bendPole(hipW[i], knees[i], feet[i], root.forward), 1));
    for (const t of legTracks) { wroteLeg(t.l.hip, t.hip); wroteLeg(t.l.knee, t.knee); }
  });
  return {
    impact: (v: number) => start(v),
    get drop() { return drop; },
    dispose() { if (obs) scene.onAfterAnimationsObservable.remove(obs); },
  };
}
