// FrameGuard + SpawnGuard — turn the two worst regressions (E9 hero out of
// frame, E10/E11 empty worlds) into LOUD console errors the moment they
// happen, and auto-recover when possible. These run in production; the
// [FEL-FRAME]/[FEL-SPAWN] lines are what live audits grep for.

import { Matrix, Vector3 } from '@babylonjs/core';
import type { Scene, TargetCamera, TransformNode } from '@babylonjs/core';
import type { CameraDirector } from './CameraDirector';

/** How long after a mode starts playing before the first framing check. */
const SPAWN_GRACE_MS = 3200;
/** Steady-state sampling rate once the world has settled. */
const CHECK_INTERVAL_MS = 2000;

/** Watches the hero's screen projection; recenters after persistent loss. */
export class FrameGuard {
  private missStreak = 0;
  /** Render size at the previous tick; a change means a resize is in flight. */
  private lastW = 0;
  private lastH = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Has the hero ever been somewhere other than the world origin? */
  private everPlaced = false;

  constructor(
    private scene: Scene,
    private camera: TargetCamera,
    private hero: () => TransformNode | null,
    private director?: CameraDirector,
    private objective?: () => Vector3 | null,
  ) {}

  start(): void {
    this.stop();
    // SPAWN GRACE. This guard exists to catch framing that is PERSISTENTLY
    // wrong, and it acts only on a second consecutive miss for exactly that
    // reason — but it still LOGGED on the first. Starting the interval
    // immediately meant its first sample could land in the window between a
    // character being spawned (at the world origin) and the mode positioning it,
    // reporting a hero that had not been placed yet as a hero that was lost.
    //
    // Seen intermittently on /play/onevone — about one load in four, always with
    // the hero at (0, ~0, ~0), which is a tell that it was never placed rather
    // than that the camera failed. A short grace before the first check removes
    // the race without weakening the guard: persistent loss still trips it, and
    // trips it just as fast, because the interval is unchanged after the first.
    this.timer = setTimeout(() => {
      this.check();
      this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    }, SPAWN_GRACE_MS);
  }

  private check(): void {
    const hero = this.hero();
    const engine = this.scene.getEngine();
    if (!hero) return;

    // A HERO THAT HAS NEVER BEEN PLACED IS NOT A HERO THAT IS LOST.
    // Characters spawn at the world origin and the mode positions them a moment
    // later. If a check lands in that window the hero really is off-screen — the
    // camera is sitting on top of it, both still at (0,0,0) — but nothing is
    // wrong, and reporting it sends whoever reads the log after a camera bug
    // that does not exist. Seen intermittently on /play/onevone, about one load
    // in four, always with the hero within a millimetre of the origin.
    //
    // This cannot mask a real failure: one sighting away from the origin arms
    // the guard permanently, so anything that goes wrong after the world is
    // built is reported exactly as before.
    if (!this.everPlaced) {
      if (hero.position.lengthSquared() > 1e-4) this.everPlaced = true;
      else return;
    }

    // A SUSPENDED director means the mode has deliberately taken the camera —
    // a replay, a rim cut, a cinematic. The hero being out of frame is then the
    // authored shot, not a fault, and "recentering" it would be the guard
    // fighting the direction. Only judge framing the director is responsible for.
    if (this.director?.suspended) { this.missStreak = 0; return; }
    const p = Vector3.Project(
      hero.position.add(new Vector3(0, 1.2, 0)),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
    );
    // The view/projection matrix can be momentarily degenerate right as a mode
    // spins up (camera/scene activation ordering) — Project() then returns NaN
    // components. NaN fails every numeric comparison below, so this used to
    // silently read as "off-screen" and fire the disruptive auto-recenter on
    // a frame that was never actually wrong. Treat "can't tell yet" as
    // on-screen instead of panicking.
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();

    // A RESIZING canvas is not a framing failure. Mid-resize the engine reports
    // a render target that the projection matrix does not match yet -- Karate
    // Endless's one warning per run was the hero projected to y 891 in a view
    // reported as 1833x114, a 114-pixel-tall frame that no layout ever intends.
    // Judging a frame the projection does not describe produces exactly the
    // false positive this guard exists to be trusted about, so skip the tick
    // where the dimensions moved and judge the next one.
    if (w !== this.lastW || h !== this.lastH) {
      this.lastW = w; this.lastH = h;
      this.missStreak = 0;
      return;
    }
    const onScreen = p.z > 0 && p.z < 1 && p.x > -w * 0.05 && p.x < w * 1.05 && p.y > -h * 0.05 && p.y < h * 1.1;
    if (onScreen) { this.missStreak = 0; return; }
    this.missStreak++;
    // Say WHICH WAY it left the frame. "off-screen" plus two world positions
    // has repeatedly cost hours: behind the camera, below the bottom edge and
    // past the left edge are three different bugs with three different fixes,
    // and the world coordinates alone do not distinguish them. p is the
    // projected pixel; z outside [0,1] means it is outside the depth range,
    // and z < 0 specifically means the hero is BEHIND the camera.
    const edge = p.z <= 0 ? 'BEHIND camera'
      : p.z >= 1 ? 'beyond far plane'
      : p.x < 0 ? 'off LEFT' : p.x > w ? 'off RIGHT'
      : p.y < 0 ? 'off TOP' : p.y > h ? 'off BOTTOM' : 'edge margin';
    console.error(
      `[FEL-FRAME] hero off-screen ${this.missStreak}x (${edge}) at ${hero.position.toString()} `
      + `cam ${this.camera.position.toString()} proj ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(3)} `
      + `view ${w}x${h}`,
    );
    if (this.missStreak >= 2 && this.director) {
      console.error('[FEL-FRAME] auto-recentering camera on hero');
      this.director.snapTo(hero.position, this.objective?.() ?? null);
      this.missStreak = 0;
    }
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); clearTimeout(this.timer); }
    this.timer = null;
    this.missStreak = 0;
    this.everPlaced = false;
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
