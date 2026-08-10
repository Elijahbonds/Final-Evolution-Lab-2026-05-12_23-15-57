// DunkReplayCam (Babylon) — records last ~4s of character-root + ball transforms;
// replays at 0.5× from two angles (low baseline → rim-side) after a made dunk.
// Recorded transforms, not video. Tap/space skips.

import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, TargetCamera, TransformNode, Observer } from '@babylonjs/core';

const WINDOW_S = 4, RATE_HZ = 30, SPEED = 0.5;

interface Sample { t: number; cp: Vector3; cq: Quaternion; bp: Vector3 }

export class DunkReplayRecorder {
  private buf: Sample[] = [];
  private acc = 0;
  private obs: Observer<Scene> | null = null;

  constructor(
    private scene: Scene,
    private character: TransformNode,
    private ball: AbstractMesh,
    private camera: TargetCamera,
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
      cq: (this.character.rotationQuaternion ?? Quaternion.Identity()).clone(),
      bp: this.ball.getAbsolutePosition().clone(),
    });
    while (this.buf.length && this.buf[0].t < now - WINDOW_S) this.buf.shift();
  }

  /** Play the replay; resolves when done or skipped. Caller pauses gameplay. */
  play(rimCenter: Vector3): Promise<void> {
    if (this.buf.length < RATE_HZ) return Promise.resolve();
    const frames = [...this.buf];
    const t0 = frames[0].t, dur = frames[frames.length - 1].t - t0;

    return new Promise<void>((resolve) => {
      let rt = 0;
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
        const bp = Vector3.Lerp(a.bp, b.bp, k);
        this.character.setAbsolutePosition(cp);
        this.character.rotationQuaternion = Quaternion.Slerp(a.cq, b.cq, k);
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
        this.scene.onBeforeRenderObservable.remove(obs);
        window.removeEventListener('pointerdown', skip);
        window.removeEventListener('keydown', onKey);
        resolve();
      };
    });
  }

  dispose(): void {
    if (this.obs) this.scene.onBeforeRenderObservable.remove(this.obs);
    this.buf = [];
  }
}

// Wiring: const rec = new DunkReplayRecorder(scene, charRoot, ballMesh, camera);
// on made dunk:  gameplayPaused = true; await rec.play(rimCenterVec3);
//                gameplayPaused = false; → result flow.
// DOM overlay while replaying: "▶ REPLAY — tap to skip".
