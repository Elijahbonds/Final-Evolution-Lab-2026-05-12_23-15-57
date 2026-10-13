// REPLAY DIRECTOR (vis-foundation-2 A9.12, 2026-10-13) — the dunk's replay, for every mode that has a moment worth one.
//
// DunkReplayCam.ts is the only replay in the game: it records the dunker's root, the ball and the body's drawn pose, and
// plays the flush back from fixed angles. This is that recorder generalised — any number of bodies (each root and its
// skeleton's bones, recorded AS DRAWN, after every animation writer), loose meshes (a ball) by world position — played
// back as a broadcast cut: two or three angles from scene/broadcastShots.ts's library (low, side, tight, high, follow),
// at half speed, behind the letterbox, on a long lens with a shallow depth of field focused on the subject.
// DunkReplayCam itself is untouched (hoops are held this wave, and its triple cut is tuned to the dunk); this is the
// shared kit the other modes use.
//
// DEPTH OF FIELD WITHOUT A COMPILE HITCH. DOF is a post effect, and switching a post effect on mid-game compiles its
// shaders on that frame (ImpactFrame.ts). So `mountReplayDof` turns it on when the mode MOUNTS its director (in load(),
// behind the splash) at a lens with no blur (fStop 32, a 1 mm focal length: a circle of confusion far under a pixel), and
// a replay only eases the lens (uniforms) to the shallow one and back. The depth pass DOF reads is the scene drawn again,
// so between replays its target is told not to refresh (the no-blur lens does not read it); a replay turns it back on.
// Desktop and high only — phones get the replay and the bars, not the blur.
//
// TRACKED TRANSFORMS (vis-board, wave 2): a body's root and bones are not everything a mode draws — a skateboard's deck flips about
// its own node (a child of the rider's root, written by the mode as Euler angles every frame). `track(node)` records such a
// node's LOCAL position and rotation with every frame and plays it back like a bone; when the replay ends the node is put back —
// position, and rotation as the mode wrote it (Euler, with the quaternion nulled again if it had none: a node that keeps a
// leftover rotationQuaternion ignores `rotation`, which froze the deck). Opt-in: nothing is tracked unless a mode asks.
//
// The mode stays in charge of WHEN: `play()` returns a promise, the harness holds the mode's update() while it runs
// (ModeContext.highlight), any press skips it, a pause freezes it, and when it ends every recorded root, the loose meshes
// and the camera (position, target, lens) are put back exactly as they were — the game resumes from the live moment.

import { Quaternion, RenderTargetTexture, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, DefaultRenderingPipeline, Observer, Scene, TargetCamera, TransformNode } from '@babylonjs/core';
import { replayWindow } from './replayWindow';
import { DOF_REST, replayCut, replayLens, replayShot, resolveAngle, type ReplayAngle, type ShotBounds } from './broadcastShots';
import type { QualityTier } from './QualityTier';

export const REPLAY_WINDOW_S = 5;
export const REPLAY_RATE_HZ = 30;
export const REPLAY_SPEED = 0.5;
/** Seconds of lens ease in and out of a replay. */
export const DOF_EASE_S = 0.35;

interface BodyFrame { p: Vector3; q: Quaternion | null; y: number; pose: Float32Array | null }
interface Frame { t: number; bodies: BodyFrame[]; loose: Vector3[]; /** the tracked transforms' local pose, 7 floats each (position, quaternion) */ tr: Float32Array | null }

export interface ReplayDofHandle {
  /** Ease toward the replay lens (k 0..1) focused `focusMetres` away; k = 0 is the no-blur rest lens. */
  set(k: number, focusMetres: number): void;
  /** The depth pass: refresh every frame during a replay, never between. */
  live(on: boolean): void;
  dispose(): void;
}

/**
 * Turn the pipeline's depth of field on NOW, at the rest lens (no visible blur), so its shaders compile at mount. Null on
 * phones (tier 'mobile') or when the pipeline cannot do it.
 */
export function mountReplayDof(scene: Scene, pipeline: DefaultRenderingPipeline | null | undefined, tier: QualityTier): ReplayDofHandle | null {
  if (!pipeline || tier === 'mobile') return null;
  try {
    pipeline.depthOfFieldEnabled = true;
    pipeline.depthOfFieldBlurLevel = tier === 'high' ? 1 : 0;   // DepthOfFieldEffectBlurLevel.Medium / Low
    const dof = pipeline.depthOfField;
    dof.fStop = DOF_REST.fStop; dof.focalLength = DOF_REST.focalLength; dof.focusDistance = 10000;
  } catch (e) {
    console.warn('[FEL-REPLAY] depth of field unavailable, replays play without it:', e);
    return null;
  }
  const depthMap = (): RenderTargetTexture | null => {
    const cam = scene.activeCamera;
    if (!cam) return null;
    try { return scene.enableDepthRenderer(cam).getDepthMap(); } catch { return null; }
  };
  const live = (on: boolean): void => { const m = depthMap(); if (m) m.refreshRate = on ? 1 : RenderTargetTexture.REFRESHRATE_RENDER_ONCE; };
  live(false);   // draws once (the compile and a valid target), then holds
  return {
    set(k, focusMetres) {
      const l = replayLens(k, focusMetres);
      const dof = pipeline.depthOfField;
      dof.fStop = l.fStop; dof.focalLength = l.focalLength; dof.focusDistance = l.focusDistance;
    },
    live,
    dispose() { try { live(true); pipeline.depthOfFieldEnabled = false; } catch { /* the pipeline went first */ } },
  };
}

/**
 * The bodies worth recording: the hero's root first, then the other skinned characters' roots nearest the hero, `max` in
 * all. A root is the top ancestor of a skinned mesh.
 */
export function characterRoots(scene: Scene, hero: TransformNode | null, max = 6): TransformNode[] {
  const top = (n: TransformNode): TransformNode => { let r = n; while (r.parent) r = r.parent as TransformNode; return r; };
  const roots = new Set<TransformNode>();
  for (const m of scene.meshes) if (m.skeleton && m.isEnabled()) roots.add(top(m));
  const heroRoot = hero ? top(hero) : null;
  const others = [...roots].filter((r) => r !== heroRoot);
  if (heroRoot) {
    const h = heroRoot.getAbsolutePosition();
    others.sort((a, b) => Vector3.DistanceSquared(a.getAbsolutePosition(), h) - Vector3.DistanceSquared(b.getAbsolutePosition(), h));
  }
  return [...(heroRoot ? [heroRoot] : []), ...others].slice(0, max);
}

/** The transform nodes behind a body's skeleton bones (what the animations write), in a stable order. */
export function poseNodesOf(root: TransformNode): TransformNode[] {
  const out: TransformNode[] = [];
  const seen = new Set<TransformNode>();
  for (const m of root.getChildMeshes(false)) {
    for (const b of m.skeleton?.bones ?? []) {
      const n = b.getTransformNode();
      if (n && !seen.has(n)) { seen.add(n); out.push(n); }
    }
  }
  return out;
}

export interface ReplayPlayOpts {
  /** Seconds of the recording to show, ending at `endAt` (or now). */
  lastSeconds?: number;
  /** The last moment worth showing, on the recorder's clock (performance.now() / 1000). */
  endAt?: number;
  /** The angles, in order (default: replayCut's two or three of low / side / tight). */
  angles?: ReplayAngle[];
  /** What the action is heading for (a goal, an end zone): folded into the look where the angle wants it. */
  objective?: Vector3 | null;
  /** +1 / −1: which side of the action the profile angles take. */
  side?: number;
  /** The floor a camera may stand over (vis-board): the filmer's spot is validated against it per segment, and falls back to the next angle. */
  bounds?: ShotBounds | null;
  /** A paused game freezes the replay (the harness passes its phase). */
  paused?: () => boolean;
}

export class ReplayDirector {
  private buf: Frame[] = [];
  private acc = 0;
  private obs: Observer<Scene> | null = null;
  private poseNodes: TransformNode[][];
  private finishActive: (() => void) | null = null;
  private _playing = false;
  private tracked: TransformNode[] = [];
  /** Which angle is on screen (−1: none) — probes read it. */
  angleNow: ReplayAngle | null = null;

  constructor(
    private scene: Scene,
    private camera: TargetCamera,
    private bodies: TransformNode[],
    private loose: AbstractMesh[] = [],
    private dof: ReplayDofHandle | null = null,
    private focusIndex = 0,
  ) {
    this.poseNodes = bodies.map((b) => poseNodesOf(b));
    this.obs = scene.onAfterAnimationsObservable.add(() => this.tick());   // the pose as drawn: after every animation writer
  }

  get playing(): boolean { return this._playing; }

  /** Record this node's local pose too (a deck, a prop on a body) and play it back. Idempotent. Not while a replay plays. */
  track(node: TransformNode): void { if (!this._playing && !this.tracked.includes(node)) this.tracked.push(node); }
  get trackedCount(): number { return this.tracked.length; }

  private trackSample(): Float32Array | null {
    if (!this.tracked.length) return null;
    const out = new Float32Array(this.tracked.length * 7);
    this.tracked.forEach((n, k) => {
      const q = n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation);
      out.set([n.position.x, n.position.y, n.position.z, q.x, q.y, q.z, q.w], k * 7);
    });
    return out;
  }
  /** Seconds currently held. */
  get recordedSec(): number { return this.buf.length > 1 ? this.buf[this.buf.length - 1].t - this.buf[0].t : 0; }

  private tick(): void {
    if (this._playing) return;   // a replay is not recorded over itself
    this.acc += Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
    if (this.acc < 1 / REPLAY_RATE_HZ) return;
    this.acc = 0;
    const now = performance.now() / 1000;
    this.buf.push({
      t: now,
      bodies: this.bodies.map((b, i) => ({ p: b.position.clone(), q: b.rotationQuaternion?.clone() ?? null, y: b.rotation.y, pose: this.poseSample(i) })),
      loose: this.loose.map((m) => m.getAbsolutePosition().clone()),
      tr: this.trackSample(),
    });
    while (this.buf.length && this.buf[0].t < now - REPLAY_WINDOW_S) this.buf.shift();
  }

  private poseSample(i: number): Float32Array | null {
    const nodes = this.poseNodes[i];
    if (!nodes.length) return null;
    const out = new Float32Array(nodes.length * 7);
    nodes.forEach((n, k) => {
      const q = n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation);
      out.set([n.position.x, n.position.y, n.position.z, q.x, q.y, q.z, q.w], k * 7);
    });
    return out;
  }

  private readonly _qa = new Quaternion(); private readonly _qb = new Quaternion();
  private applyPose(i: number, a: Float32Array, b: Float32Array, k: number): void {
    this.poseNodes[i].forEach((n, j) => {
      const o = j * 7;
      n.position.set(a[o] + (b[o] - a[o]) * k, a[o + 1] + (b[o + 1] - a[o + 1]) * k, a[o + 2] + (b[o + 2] - a[o + 2]) * k);
      this._qa.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]); this._qb.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
      (n.rotationQuaternion ??= new Quaternion()); Quaternion.SlerpToRef(this._qa, this._qb, k, n.rotationQuaternion);
    });
  }

  private readonly _qc = new Quaternion(); private readonly _qd = new Quaternion();
  private applyTracked(a: Float32Array | null, b: Float32Array | null, k: number): void {
    if (!a || !b || a.length !== this.tracked.length * 7 || b.length !== a.length) return;
    this.tracked.forEach((n, j) => {
      const o = j * 7;
      n.position.set(a[o] + (b[o] - a[o]) * k, a[o + 1] + (b[o + 1] - a[o + 1]) * k, a[o + 2] + (b[o + 2] - a[o + 2]) * k);
      this._qc.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]); this._qd.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
      (n.rotationQuaternion ??= new Quaternion()); Quaternion.SlerpToRef(this._qc, this._qd, k, n.rotationQuaternion);
    });
  }

  /** Play the highlight. Resolves when it ends or is skipped (a press, `stop()`); nothing recorded → resolves at once. */
  play(opts: ReplayPlayOpts = {}): Promise<void> {
    if (this._playing || this.buf.length < REPLAY_RATE_HZ / 2) return Promise.resolve();
    const all = [...this.buf];
    const w = replayWindow(all.map((f) => f.t), { lastSeconds: opts.lastSeconds ?? 3, endAt: opts.endAt });
    const frames = all.slice(w.from, w.to + 1);
    const t0 = frames[0].t, dur = Math.max(0.2, frames[frames.length - 1].t - t0);
    const angles = opts.angles?.length ? opts.angles : replayCut(dur);
    const seg = dur / angles.length;
    // each segment's angle, validated against the floor once (against the subject's whole path through it): the filmer falls back
    const fi0 = Math.min(this.focusIndex, this.bodies.length - 1);
    const shots = angles.map((a, s) => {
      const from = t0 + s * seg, to = from + seg;
      const foci = frames.filter((f) => f.t >= from - 1e-6 && f.t <= to + 1e-6).map((f) => ({ x: f.bodies[fi0].p.x, y: f.bodies[fi0].p.y, z: f.bodies[fi0].p.z }));
      const h = frames[frames.length - 1].bodies[fi0].p.subtract(frames[0].bodies[fi0].p);
      return resolveAngle(a, foci, { x: h.x, y: h.y, z: h.z }, opts.objective ? { x: opts.objective.x, y: opts.objective.y, z: opts.objective.z } : null, opts.side ?? 1, opts.bounds ?? null);
    });
    const fi = Math.min(this.focusIndex, this.bodies.length - 1);
    // the live moment, put back at the end
    const live = {
      cam: this.camera.position.clone(), target: this.camera.getTarget().clone(), fov: this.camera.fov,
      bodies: this.bodies.map((b) => ({ p: b.position.clone(), q: b.rotationQuaternion?.clone() ?? null, y: b.rotation.y })),
      loose: this.loose.map((m) => ({ parent: m.parent, local: m.position.clone(), world: m.getAbsolutePosition().clone() })),
    };
    const liveTracked = this.tracked.map((n) => ({ p: n.position.clone(), q: n.rotationQuaternion?.clone() ?? null, r: n.rotation.clone() }));
    const livePoses = this.bodies.map((_, i) => this.poseSample(i));   // a bone no clip drives keeps what the replay left otherwise
    const heading = frames[frames.length - 1].bodies[fi].p.subtract(frames[0].bodies[fi].p);
    this._playing = true;
    this.dof?.live(true);
    (this.scene.metadata ??= {}).felCinematic = 1;
    return new Promise<void>((resolve) => {
      let rt = 0, lens = 0, cur: { a: Frame; b: Frame; k: number } = { a: frames[0], b: frames[0], k: 0 };
      const isPaused = (): boolean => opts.paused?.() ?? false;
      const at = (t: number): { a: Frame; b: Frame; k: number } => {
        let i = frames.findIndex((f) => f.t >= t); if (i < 1) i = i < 0 ? frames.length - 1 : 1;
        const a = frames[i - 1], b = frames[i] ?? a;
        return { a, b, k: b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) };
      };
      // the recorded pose is the frame's last word (after the clips and every layer on the animations' observable)
      const poseObs = this.scene.onAfterAnimationsObservable.add(() => {
        cur.a.bodies.forEach((ba, i) => { const bb = cur.b.bodies[i]; if (ba.pose && bb.pose) this.applyPose(i, ba.pose, bb.pose, cur.k); });
        this.applyTracked(cur.a.tr, cur.b.tr, cur.k);
      });
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        const dt = Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
        if (isPaused()) return;
        rt += dt * REPLAY_SPEED;
        const t = t0 + Math.min(rt, dur);
        cur = at(t);
        const { a, b, k } = cur;
        a.bodies.forEach((ba, i) => {
          const bb = b.bodies[i], body = this.bodies[i];
          body.position.copyFrom(Vector3.Lerp(ba.p, bb.p, k));
          if (ba.q && bb.q) body.rotationQuaternion = Quaternion.Slerp(ba.q, bb.q, k);
          else { const d = Math.atan2(Math.sin(bb.y - ba.y), Math.cos(bb.y - ba.y)); body.rotation.y = ba.y + d * k; }
        });
        a.loose.forEach((pa, i) => this.loose[i].setAbsolutePosition(Vector3.Lerp(pa, b.loose[i], k)));
        // the cut: one angle per segment, a slow push-in within it
        const s = Math.min(angles.length - 1, Math.floor(Math.min(rt, dur - 1e-6) / seg));
        this.angleNow = shots[s].angle;
        const focus = Vector3.Lerp(a.bodies[fi].p, b.bodies[fi].p, k);
        const shot = replayShot(shots[s].angle, focus, heading, opts.objective ?? null, shots[s].side);
        const into = (rt - s * seg) / seg;
        const push = 1 - 0.07 * into;
        const tg = new Vector3(shot.target.x, shot.target.y, shot.target.z);
        this.camera.position.set(tg.x + (shot.pos.x - tg.x) * push, tg.y + (shot.pos.y - tg.y) * push, tg.z + (shot.pos.z - tg.z) * push);
        this.camera.setTarget(tg);
        if (shot.fov) this.camera.fov = shot.fov;
        // the lens: in over DOF_EASE_S, out over the last DOF_EASE_S of the replay
        const want = rt < dur - DOF_EASE_S * REPLAY_SPEED ? 1 : 0;
        lens += (want - lens) * Math.min(1, dt / DOF_EASE_S * 3);
        this.dof?.set(lens, Vector3.Distance(this.camera.position, focus.add(new Vector3(0, 1.1, 0))));
        if (rt >= dur) finish();
      });
      const skip = (): void => { if (!isPaused()) finish(); };
      const finish = (): void => {
        this.scene.onBeforeRenderObservable.remove(obs); this.scene.onAfterAnimationsObservable.remove(poseObs);
        this.bodies.forEach((b, i) => {
          const l = live.bodies[i]; b.position.copyFrom(l.p);
          if (l.q) b.rotationQuaternion = l.q; else { b.rotationQuaternion = null; b.rotation.y = l.y; }
        });
        livePoses.forEach((lp, i) => { if (lp) this.applyPose(i, lp, lp, 0); });
        this.tracked.forEach((n, i) => {   // as the mode wrote it: Euler unless it had a quaternion (a leftover one would freeze `rotation`)
          const l = liveTracked[i]; if (!l) return;
          n.position.copyFrom(l.p);
          if (l.q) n.rotationQuaternion = l.q; else { n.rotationQuaternion = null; n.rotation.copyFrom(l.r); }
        });
        this.loose.forEach((m, i) => { const l = live.loose[i]; if (l.parent) m.position.copyFrom(l.local); else m.setAbsolutePosition(l.world); });
        this.camera.position.copyFrom(live.cam); this.camera.setTarget(live.target); this.camera.fov = live.fov;
        this.dof?.set(0, 10); this.dof?.live(false);
        if (this.scene.metadata) this.scene.metadata.felCinematic = 0;
        this._playing = false; this.angleNow = null; this.finishActive = null;
        resolve();
      };
      this.skipFn = skip;
      this.finishActive = finish;
    });
  }

  private skipFn: (() => void) | null = null;
  /** A press during a replay: skip to the live moment (ignored while paused — the press that resumes is not a skip). */
  skip(): void { this.skipFn?.(); }
  /** End a replay in flight; a no-op when none is playing. */
  stop(): void { this.finishActive?.(); }

  dispose(): void {
    this.stop();
    if (this.obs) this.scene.onAfterAnimationsObservable.remove(this.obs);
    this.dof?.dispose();
    this.buf = [];
  }
}
