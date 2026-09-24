// DunkReplayCam (Babylon) — records last ~4s of character-root + ball transforms;
// replays the FLIGHT at 0.5× from two angles (low baseline → rim-side) after a made dunk.
// Recorded transforms, not video. Tap/space skips.

import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, TargetCamera, TransformNode, Observer } from '@babylonjs/core';
import { replayWindow } from './replayWindow';
import { cutCamera, cutSec, type CutSpec } from '../core/DunkCuts';

const WINDOW_S = 4, RATE_HZ = 30, SPEED = 0.5;

/** cq is recorded only when the root actually carries a rotationQuaternion; otherwise cy (Euler yaw) is what plays back.
 *  Before (play tip 2026-09-07): `rotationQuaternion ?? Identity` — the dunk root yaws by Euler, so every replay wrote
 *  Identity and the hero faced +z (the camera) for the whole 8 s replay; measured yaw 180° → 0° on the make. */
interface Sample { t: number; cp: Vector3; cq: Quaternion | null; cy: number; bp: Vector3; anchor: TransformNode | null; bl: Vector3 | null; pose?: Float32Array }

/** DUNK-BALL-ARMS-RIM (2026-09-14): the ball rides what it rode live. The recorder kept only the ball's WORLD position, and the
 *  replay re-flies the root with its own clips at its own rate — so the replayed hands were never where the live hands had
 *  been: measured 197–243 replay frames with the ball 5–60 cm off the palm (median 0.25–0.33 m), a ball floating in front of
 *  the chest while the hand went up empty. A sample now keeps the node the ball rode (the hand it was in, the root while it
 *  dribbled) and the ball's position in that node's frame; the replay puts it back in the replayed node. A change of rider
 *  (the release at the iron, a catch) eases out of the old place over ~0.1 s instead of popping. */
export type BallAnchorFn = () => TransformNode | null;
const _inv = new Matrix();
/** A node's world matrix computed down its whole parent chain (the bones' cached matrices are last frame's until render). */
function freshWorld(node: TransformNode): Matrix {
  const chain: TransformNode[] = [];
  for (let n: TransformNode | null = node; n; n = n.parent as TransformNode | null) chain.push(n);
  for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true);
  return node.getWorldMatrix();
}

export class DunkReplayRecorder {
  private buf: Sample[] = [];
  private acc = 0;
  private obs: Observer<Scene> | null = null;
  private finishActive: (() => void) | null = null;
  /** The node the replayed ball rides this frame ('' when it flies free) and its position in that node's frame — probes read it. */
  riderName = ''; readonly riderLocal = new Vector3();
  /** DUNK MOTION phase 12: the body's own bones, recorded as they were DRAWN (after every writer — the clips, the reach, the hinges,
   *  the posture), so the triple cut replays the flush exactly as it happened instead of re-flying clips over the root. */
  private poseNodes: TransformNode[] = [];
  private playing = false;
  /** Which cut is on screen (-1: none; `cuts.length`: the poster freeze) — probes read it. */
  cutNow = -1;
  setPoseNodes(nodes: TransformNode[]): void { this.poseNodes = nodes.filter((n) => !!n); this.buf = []; }

  constructor(
    private scene: Scene,
    private character: TransformNode,
    private ball: AbstractMesh,
    private camera: TargetCamera,
    private anchorOf: BallAnchorFn | null = null,
  ) {
    this.obs = scene.onBeforeRenderObservable.add(() => this.tick());
  }

  private tick(): void {
    if (this.playing) return;   // a replay in progress is not recorded over itself
    this.acc += this.scene.getEngine().getDeltaTime() / 1000;
    if (this.acc < 1 / RATE_HZ) return;
    this.acc = 0;
    const now = performance.now() / 1000;
    this.buf.push({
      t: now,
      cp: this.character.getAbsolutePosition().clone(),
      cq: this.character.rotationQuaternion?.clone() ?? null, cy: this.character.rotation.y,
      bp: this.ball.getAbsolutePosition().clone(),
      ...this.anchorSample(),
      ...(this.poseNodes.length ? { pose: this.poseSample() } : {}),
    });
    while (this.buf.length && this.buf[0].t < now - WINDOW_S) this.buf.shift();
  }

  /** The pose as drawn: the first node's position (the hips carry the clips' height) and every node's local rotation. */
  private poseSample(): Float32Array {
    const out = new Float32Array(3 + this.poseNodes.length * 4);
    const h = this.poseNodes[0].position; out[0] = h.x; out[1] = h.y; out[2] = h.z;
    this.poseNodes.forEach((n, i) => { const q = n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation); out.set([q.x, q.y, q.z, q.w], 3 + i * 4); });
    return out;
  }
  private _qa = new Quaternion(); private _qb = new Quaternion();
  private applyPose(a: Float32Array, b: Float32Array, k: number): void {
    const n0 = this.poseNodes[0];
    n0.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
    this.poseNodes.forEach((n, i) => {
      const o = 3 + i * 4;
      this._qa.set(a[o], a[o + 1], a[o + 2], a[o + 3]); this._qb.set(b[o], b[o + 1], b[o + 2], b[o + 3]);
      (n.rotationQuaternion ??= new Quaternion()); Quaternion.SlerpToRef(this._qa, this._qb, k, n.rotationQuaternion);
    });
  }

  private anchorSample(): { anchor: TransformNode | null; bl: Vector3 | null } {
    const anchor = this.anchorOf?.() ?? null;
    if (!anchor) return { anchor: null, bl: null };
    freshWorld(anchor).invertToRef(_inv);
    this.ball.computeWorldMatrix(true);
    return { anchor, bl: Vector3.TransformCoordinates(this.ball.getAbsolutePosition(), _inv) };
  }

  /** Play the replay; resolves when done or skipped. Caller pauses gameplay. */
  /**
   * Play the replay.
   *
   * `lastSeconds` trims the front of the buffer — the replay shows only the last N seconds of what was
   * recorded.
   *
   * WHY THIS EXISTS (2026-09-14, from filming the replay for a review). The recorder keeps a 4 s ring and
   * `play` showed ALL of it at 0.5x: eight seconds of replay, and most of it was the dunker jogging up the
   * floor with the ball nowhere near his hands. A broadcast replay of a dunk is the takeoff to the flush —
   * nobody re-watches the walk to the baseline. The buffer stays 4 s because the mode cannot know at record
   * time how long the run-up will be; the TRIM happens at playback, when it does.
   */
  play(rimCenter: Vector3, lastSeconds = WINDOW_S, endAt?: number): Promise<void> {
    if (this.buf.length < RATE_HZ) return Promise.resolve();
    const all = [...this.buf];
    // `endAt` is the last moment worth showing — the mode passes the ball through the net. Everything after it is the
    // mode holding the body parked at rim height for the verdict beat: dead air that played back as a statue. See replayWindow.
    const w = replayWindow(all.map((f) => f.t), { lastSeconds, endAt });
    const frames = all.slice(w.from, w.to + 1);
    const t0 = frames[0].t, dur = frames[frames.length - 1].t - t0;

    return new Promise<void>((resolve) => {
      let rt = 0;
      let rider: TransformNode | null | undefined, lastBall: Vector3 | null = null; const blend = new Vector3();
      const skip = () => finish();
      window.addEventListener('pointerdown', skip);
      const onKey = (e: KeyboardEvent) => { if (e.key === ' ') skip(); };
      window.addEventListener('keydown', onKey);

      const obs = this.scene.onBeforeRenderObservable.add(() => {
        rt += (this.scene.getEngine().getDeltaTime() / 1000) * SPEED;
        const t = t0 + Math.min(rt, dur);
        let i = frames.findIndex((s) => s.t >= t);
        if (i < 1) i = 1;
        const a = frames[i - 1], b = frames[i] ?? a;
        const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);

        const cp = Vector3.Lerp(a.cp, b.cp, k);
        let bp = Vector3.Lerp(a.bp, b.bp, k);
        this.character.setAbsolutePosition(cp);
        if (a.cq && b.cq) this.character.rotationQuaternion = Quaternion.Slerp(a.cq, b.cq, k);
        else { const d = Math.atan2(Math.sin(b.cy - a.cy), Math.cos(b.cy - a.cy)); this.character.rotation.y = a.cy + d * k; }   // shortest arc
        // the ball in the node it rode (this runs after the frame's clips and reach, before the render) — see Sample
        const ride = k < 0.5 ? a : b;
        if (ride.anchor && ride.bl) {
          const both = a.anchor === b.anchor && a.bl && b.bl;
          bp = Vector3.TransformCoordinates(both ? Vector3.Lerp(a.bl!, b.bl!, k) : ride.bl, freshWorld(ride.anchor));
        }
        this.riderName = ride.anchor?.name ?? ''; if (ride.bl) this.riderLocal.copyFrom(ride.bl);
        if (ride.anchor !== rider) { if (lastBall) blend.copyFrom(lastBall.subtract(bp)); rider = ride.anchor; }
        blend.scaleInPlace(Math.exp(-this.scene.getEngine().getDeltaTime() / 1000 / 0.05));
        bp.addInPlace(blend);
        (lastBall ??= new Vector3()).copyFrom(bp);
        this.ball.setAbsolutePosition(bp);

        if (rt < dur / 2) {
          // ANGLE A: low baseline looking up the flight
          this.camera.position = Vector3.Lerp(
            this.camera.position, new Vector3(cp.x + 4.5, 0.9, cp.z + 6.5), 0.12,
          );
          this.camera.setTarget(bp);
        } else {
          // ANGLE B: rim-side profile at rim height
          this.camera.position = Vector3.Lerp(
            this.camera.position, new Vector3(rimCenter.x + 3.2, rimCenter.y + 0.2, rimCenter.z), 0.12,
          );
          this.camera.setTarget(Vector3.Lerp(bp, rimCenter, 0.35));
        }
        if (rt >= dur) finish();
      });

      const finish = () => {
        this.riderName = '';
        this.scene.onBeforeRenderObservable.remove(obs);
        window.removeEventListener('pointerdown', skip);
        window.removeEventListener('keydown', onKey);
        this.finishActive = null;
        resolve();
      };
      this.finishActive = finish;
    });
  }

  /**
   * DUNK MOTION phase 12 — THE TRIPLE CUT. The flush up to the iron contact at `contactAt` (the recorder's clock: performance.now()
   * in seconds), played once per cut from that cut's camera (a hard cut between them, a slight push-in within one, a hand-held
   * wobble on the phone), and — `freezeSec` — held on the contact frame from the poster's camera, `onFreeze` called once that frame
   * has drawn. The RECORDED POSE is written as the frame's last word (after the clips, the reach, the posture), so what plays is what
   * happened. Skippable (a tap, space, or `stop()`); the live root and ball are put back where they were when it ends.
   */
  playCuts(rimCenter: Vector3, contactAt: number, cuts: readonly CutSpec[], opts: { freezeSec?: number; onCut?: (i: number, c: CutSpec) => void; onFreeze?: () => void } = {}): Promise<void> {
    const all = this.buf.filter((f) => !!f.pose);
    if (all.length < 4 || !this.poseNodes.length) return Promise.resolve();
    const nearest = (t: number): number => { let bi = 0, bd = Infinity; all.forEach((f, i) => { const d = Math.abs(f.t - t); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const ci = nearest(contactAt), contact = all[ci];
    const early = all[nearest(contactAt - 0.5)];
    const approach = { x: contact.cp.x - early.cp.x, z: contact.cp.z - early.cp.z };
    if (Math.hypot(approach.x, approach.z) < 0.05) { approach.x = rimCenter.x - early.cp.x; approach.z = rimCenter.z - early.cp.z; }
    const rim = { x: rimCenter.x, y: rimCenter.y, z: rimCenter.z };
    const live = { p: this.character.position.clone(), q: this.character.rotationQuaternion?.clone() ?? null, y: this.character.rotation.y, ball: this.ball.getAbsolutePosition().clone(), ballParent: this.ball.parent, ballLocal: this.ball.position.clone(), fov: this.camera.fov };
    const segs = cuts.map((c) => ({ c, dur: cutSec(c), t0: contactAt - c.lead, t1: contactAt + c.tail }));
    const freeze = Math.max(0, opts.freezeSec ?? 0);
    const total = segs.reduce((s, g) => s + g.dur, 0) + freeze;
    this.playing = true;
    return new Promise<void>((resolve) => {
      let rt = 0, seg = -1, frozenFrames = 0;
      const at = (t: number): { a: Sample; b: Sample; k: number } => {
        let i = all.findIndex((f) => f.t >= t); if (i < 1) i = Math.max(1, i < 0 ? all.length - 1 : 1);
        const a = all[i - 1], b = all[i] ?? a; return { a, b, k: b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) };
      };
      let cur: { a: Sample; b: Sample; k: number } = { a: contact, b: contact, k: 0 };
      const skip = () => finish();
      window.addEventListener('pointerdown', skip);
      const onKey = (e: KeyboardEvent) => { if (e.key === ' ') skip(); };
      window.addEventListener('keydown', onKey);
      // the pose is the LAST writer of the frame (after the clips and every layer that runs on the animations' observable)
      const poseObs = this.scene.onAfterAnimationsObservable.add(() => { if (cur.a.pose && cur.b.pose) this.applyPose(cur.a.pose, cur.b.pose, cur.k); });
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        rt += this.scene.getEngine().getDeltaTime() / 1000;
        // which segment, and where in the recording
        let left = rt, s = 0;
        while (s < segs.length && left > segs[s].dur) { left -= segs[s].dur; s++; }
        const frozen = s >= segs.length;
        if (s !== seg) {
          seg = s; this.cutNow = s;
          const cam = cutCamera(frozen ? 'poster' : segs[s].c.id, rim, { x: contact.cp.x, y: contact.cp.y, z: contact.cp.z }, approach);
          this.camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z); this.camera.setTarget(new Vector3(cam.target.x, cam.target.y, cam.target.z)); this.camera.fov = cam.fov;
          if (!frozen) opts.onCut?.(s, segs[s].c);
        }
        const t = frozen ? contact.t : segs[s].t0 + left * segs[s].c.speed;
        cur = frozen ? { a: contact, b: contact, k: 0 } : at(t);
        const { a, b, k } = cur;
        this.character.setAbsolutePosition(Vector3.Lerp(a.cp, b.cp, k));
        if (a.cq && b.cq) this.character.rotationQuaternion = Quaternion.Slerp(a.cq, b.cq, k);
        else { const d = Math.atan2(Math.sin(b.cy - a.cy), Math.cos(b.cy - a.cy)); this.character.rotation.y = a.cy + d * k; }
        this.ball.setAbsolutePosition(Vector3.Lerp(a.bp, b.bp, k));
        if (!frozen) {
          const c = segs[s].c, cam = cutCamera(c.id, rim, { x: contact.cp.x, y: contact.cp.y, z: contact.cp.z }, approach);
          const push = 1 - 0.06 * (left / segs[s].dur);   // a slow push-in through the cut
          const w = cam.shake ? cam.shake * Math.sin(rt * 37) : 0, w2 = cam.shake ? cam.shake * Math.cos(rt * 29) : 0;
          this.camera.position.set(cam.target.x + (cam.pos.x - cam.target.x) * push + w, cam.target.y + (cam.pos.y - cam.target.y) * push + w2, cam.target.z + (cam.pos.z - cam.target.z) * push);
          this.camera.setTarget(Vector3.Lerp(new Vector3(cam.target.x, cam.target.y, cam.target.z), Vector3.Lerp(a.bp, b.bp, k), 0.25));
        } else if (++frozenFrames === 2) opts.onFreeze?.();   // the frozen frame has drawn once: the poster reads it
        if (rt >= total) finish();
      });
      const finish = () => {
        this.scene.onBeforeRenderObservable.remove(obs); this.scene.onAfterAnimationsObservable.remove(poseObs);
        window.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', onKey);
        // back to the live moment: the root and the ball where they were, the lens as it was
        this.character.position.copyFrom(live.p);
        if (live.q) this.character.rotationQuaternion = live.q; else { this.character.rotationQuaternion = null; this.character.rotation.y = live.y; }
        if (live.ballParent) this.ball.position.copyFrom(live.ballLocal); else this.ball.setAbsolutePosition(live.ball);
        this.camera.fov = live.fov;
        this.playing = false; this.cutNow = -1; this.finishActive = null;
        resolve();
      };
      this.finishActive = finish;
    });
  }

  /** End a replay in flight (resolves its promise); a no-op when none is playing. */
  stop(): void { this.finishActive?.(); }

  dispose(): void {
    this.stop();   // a playback observer must not outlive the mode that owns the root
    if (this.obs) this.scene.onBeforeRenderObservable.remove(this.obs);
    this.buf = [];
  }
}

// Wiring: const rec = new DunkReplayRecorder(scene, charRoot, ballMesh, camera);
// on made dunk:  gameplayPaused = true; await rec.play(rimCenterVec3);
//                gameplayPaused = false; → result flow.
// DOM overlay while replaying: "▶ REPLAY — tap to skip".
