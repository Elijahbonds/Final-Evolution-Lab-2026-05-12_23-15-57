// PhoneFlashes — the stands light up (DUNK MOTION phase 12, 2026-09-24).
//
// The owner picked a contest SHOW for the made dunk: broadcast cameras, the crowd, the announcer — and the thing every dunk contest
// crowd does the moment somebody takes off: a hundred phones. These are camera flashes popping in the stands around the court: small
// additive glints, each ~80 ms, scattered through a burst (more of them on a bigger dunk). A pool of billboards, nothing allocated
// per flash.
import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh, Observer, Scene } from '@babylonjs/core';

const POOL = 24, LIFE_S = 0.09;

export class PhoneFlashes {
  private readonly quads: Mesh[] = [];
  private readonly life: number[] = [];
  private queue: number[] = [];   // seconds until each queued flash
  private obs: Observer<Scene> | null = null;
  constructor(private readonly scene: Scene, private readonly centre: Vector3, private readonly radius = [10, 15]) {
    const mat = new StandardMaterial('phone_flash_m', scene);
    mat.emissiveColor = Color3.White(); mat.disableLighting = true; mat.alpha = 0.95; mat.alphaMode = 1;   // ADD
    for (let i = 0; i < POOL; i++) {
      const q = MeshBuilder.CreateDisc(`phone_flash_${i}`, { radius: 0.09, tessellation: 8 }, scene);
      q.material = mat; q.billboardMode = 7; q.isPickable = false; q.isVisible = false;
      this.quads.push(q); this.life.push(0);
    }
  }
  /** `n` flashes spread over `overSec`. */
  burst(n: number, overSec = 1.6): void {
    for (let i = 0; i < n; i++) this.queue.push(Math.random() * overSec);
    if (!this.obs) this.obs = this.scene.onBeforeRenderObservable.add(() => this.tick(this.scene.getEngine().getDeltaTime() / 1000));
  }
  private tick(dt: number): void {
    this.queue = this.queue.map((t) => t - dt);
    for (const due of this.queue.filter((t) => t <= 0)) { void due; this.pop(); }
    this.queue = this.queue.filter((t) => t > 0);
    let live = 0;
    this.quads.forEach((q, i) => {
      if (this.life[i] <= 0) return;
      this.life[i] -= dt; live++;
      const k = Math.max(0, this.life[i] / LIFE_S); q.scaling.setAll(0.6 + k * 0.8); q.visibility = k;
      if (this.life[i] <= 0) q.isVisible = false;
    });
    if (!live && !this.queue.length && this.obs) { this.scene.onBeforeRenderObservable.remove(this.obs); this.obs = null; }
  }
  private pop(): void {
    const i = this.life.findIndex((l) => l <= 0); if (i < 0) return;
    // a seat in the stands: around the court, behind the baseline and down both sides (not in front of the play camera's lens)
    const a = (Math.random() * 1.5 - 0.75) * Math.PI + Math.PI, r = this.radius[0] + Math.random() * (this.radius[1] - this.radius[0]);
    const q = this.quads[i];
    q.position.set(this.centre.x + Math.sin(a) * r, 1.3 + Math.random() * 3.2, this.centre.z + Math.cos(a) * r);
    q.isVisible = true; this.life[i] = LIFE_S;
  }
  dispose(): void {
    if (this.obs) this.scene.onBeforeRenderObservable.remove(this.obs);
    const m = this.quads[0]?.material; for (const q of this.quads) q.dispose(); m?.dispose();
  }
}
