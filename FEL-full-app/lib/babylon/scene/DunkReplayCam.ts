// DunkReplayCam (Babylon) — records last ~4s of character-root + ball transforms;
// replays the FLIGHT at 0.5× from two angles (low baseline → rim-side) after a made dunk.
// Recorded transforms, not video. Tap/space skips.

import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, TargetCamera, TransformNode, Observer } from '@babylonjs/core';

const WINDOW_S = 4, RATE_HZ = 30, SPEED = 0.5;

/** cq is recorded only when the root actually carries a rotationQuaternion; otherwise cy (Euler yaw) is what plays back.
 *  Before (play tip 2026-09-07): `rotationQuaternion ?? Identity` — the dunk root yaws by Euler, so every replay wrote
 *  Identity and the hero faced +z (the camera) for the whole 8 s replay; measured yaw 180° → 0° on the make. */
interface Sample { t: number; cp: Vector3; cq: Quaternion | null; cy: number; bp: Vector3; anchor: TransformNode | null; bl: Vector3 | null }

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
    });
    while (this.buf.length && this.buf[0].t < now - WINDOW_S) this.buf.shift();
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
  play(rimCenter: Vector3, lastSeconds = WINDOW_S): Promise<void> {
    if (this.buf.length < RATE_HZ) return Promise.resolve();
    const all = [...this.buf];
    const endT = all[all.length - 1].t;
    // keep at least half a second whatever is asked for: a trim that leaves two frames is not a replay
    const cut = endT - Math.max(0.5, lastSeconds);
    const trimmed = all.filter((f) => f.t >= cut);
    const frames = trimmed.length >= 2 ? trimmed : all;
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
