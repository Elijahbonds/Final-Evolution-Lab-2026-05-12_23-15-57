// FrameGuard + SpawnGuard — turn the two worst regressions (E9 hero out of
// frame, E10/E11 empty worlds) into LOUD console errors the moment they
// happen, and auto-recover when possible. These run in production; the
// [FEL-FRAME]/[FEL-SPAWN] lines are what live audits grep for.

import { Matrix, Vector3 } from '@babylonjs/core';
import type { Scene, TargetCamera, TransformNode } from '@babylonjs/core';
import type { CameraDirector } from './CameraDirector';

/** Watches the hero's screen projection; recenters after persistent loss. */
export class FrameGuard {
  private missStreak = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private scene: Scene,
    private camera: TargetCamera,
    private hero: () => TransformNode | null,
    private director?: CameraDirector,
    private objective?: () => Vector3 | null,
  ) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.check(), 2000);
  }

  private check(): void {
    const hero = this.hero();
    const engine = this.scene.getEngine();
    if (!hero) return;
    const p = Vector3.Project(
      hero.position.add(new Vector3(0, 1.2, 0)),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
    );
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();
    const onScreen = p.z > 0 && p.z < 1 && p.x > -w * 0.05 && p.x < w * 1.05 && p.y > -h * 0.05 && p.y < h * 1.1;
    if (onScreen) { this.missStreak = 0; return; }
    this.missStreak++;
    console.error(`[FEL-FRAME] hero off-screen ${this.missStreak}x at ${hero.position.toString()} cam ${this.camera.position.toString()}`);
    if (this.missStreak >= 2 && this.director) {
      console.error('[FEL-FRAME] auto-recentering camera on hero');
      this.director.snapTo(hero.position, this.objective?.() ?? null);
      this.missStreak = 0;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.missStreak = 0;
  }
}

/** One-shot assertions after a mode's load() — a mode may not reach the
 *  playing phase with an empty world or a missing hero. */
export function assertSpawned(
  scene: Scene,
  opts: { hero: TransformNode | null; minWorldMeshes: number; modeId: string },
): boolean {
  let ok = true;
  const meshCount = scene.meshes.filter((m) => m.isEnabled() && m.isVisible).length;
  if (meshCount < opts.minWorldMeshes) {
    console.error(`[FEL-SPAWN] ${opts.modeId}: only ${meshCount} visible meshes (< ${opts.minWorldMeshes}) — the world did not build`);
    ok = false;
  }
  if (!opts.hero) {
    console.error(`[FEL-SPAWN] ${opts.modeId}: hero never spawned`);
    ok = false;
  }
  if (ok) console.info(`[FEL-SPAWN] ${opts.modeId}: OK (${meshCount} meshes, hero at ${opts.hero!.position.toString()})`);
  return ok;
}

// WIRING (ModeHarness, once):
//   after mode.load():   assertSpawned(scene, { hero: modeHero(), minWorldMeshes: 8, modeId });
//   const guard = new FrameGuard(scene, camera, modeHero, camDirector, modeObjective);
//   guard.start() when phase becomes 'playing'; guard.stop() + dispose on exit.
// Modes expose their hero root via the harness (heroRef) — one line per mode.
