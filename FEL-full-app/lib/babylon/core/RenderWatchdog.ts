// RenderWatchdog v2 — fixes the v1 false-positive loop that broke every mode.
// v1 read the framebuffer on an interval (mid-pipeline with post-processing =
// cleared/intermediate buffer = false "black"). v2:
//   1. Samples the FINAL composited output via a tiny CreateScreenshot.
//   2. Arms ONLY while the mode is actually playing (never under the splash).
//   3. Requires consecutive confirmed-black samples before rescue/error.

import { Tools } from '@babylonjs/core';
import type { AbstractEngine, Scene, Camera } from '@babylonjs/core';
import { liftBlackMaterials } from '../scene/LightRig';

const SAMPLE_EVERY_MS = 1000;
const BLACK_LUMA = 8;
const STRIKES_BEFORE_RESCUE = 2;
const STRIKES_BEFORE_ERROR = 5;

// PERF-GUARD (2026-10-06): the sample is not free on a phone. It draws the WebGL canvas into a 2-D canvas, which makes
// the GPU finish the frame and copy it back to the CPU, then encodes and decodes a PNG — once a second for the whole
// session, a regular hitch on exactly the devices the owner asked us to keep cool. A frame that was fine for ten
// seconds running is sampled every fifth tick instead; the first dark sample puts it back on every tick, so a real
// black screen still reaches the rescue within ~5 s and the error within ~10 s.
/** TUNED: clean samples in a row before the watchdog backs off, and how far it backs off. */
export const CLEAN_BEFORE_BACKOFF = 10;
export const BACKOFF_EVERY = 5;
/** Pure: sample on this tick? */
export function watchdogShouldSample(tick: number, cleanStreak: number, strikes: number): boolean {
  if (strikes > 0 || cleanStreak < CLEAN_BEFORE_BACKOFF) return true;
  return tick % BACKOFF_EVERY === 0;
}

export class RenderWatchdog {
  private timer: number | null = null;
  private strikes = 0;
  private rescued = false;
  private sampling = false;
  private tick = 0;
  private clean = 0;

  constructor(
    private scene: Scene,
    private engine: AbstractEngine,
    private camera: Camera,
    private isPlaying: () => boolean,     // phase gate — v2 requirement
    private onFail: (message: string) => void,
  ) {}

  arm(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => void this.check(), SAMPLE_EVERY_MS);
  }
  disarm(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.strikes = 0;
    this.clean = 0;
  }

  private async check(): Promise<void> {
    if (!this.isPlaying() || this.sampling) return;   // never judge the splash
    if (!watchdogShouldSample(++this.tick, this.clean, this.strikes)) return;   // PERF-GUARD: backed off after a clean run
    this.sampling = true;
    try {
      const luma = await this.finalFrameLuma();
      if (luma > BLACK_LUMA) { this.strikes = 0; this.clean++; return; }
      this.clean = 0;
      this.strikes++;

      if (this.strikes === STRIKES_BEFORE_RESCUE && !this.rescued) {
        this.rescued = true;
        console.warn('[FEL-WATCHDOG] confirmed black output — running rescue');
        const fixed = liftBlackMaterials(this.scene);
        for (const light of this.scene.lights) light.intensity *= 1.5;
        console.warn(`[FEL-WATCHDOG] rescue done (materials fixed: ${fixed})`);
      }
      if (this.strikes >= STRIKES_BEFORE_ERROR) {
        this.disarm();
        console.error('[FEL-WATCHDOG] still black after rescue — surfacing error');
        this.onFail('Display problem detected — tap RETRY to reload the arena.');
      }
    } finally {
      this.sampling = false;
    }
  }

  /**
   * Luma of the FINAL composited frame (includes DefaultRenderingPipeline
   * output) via a 64×64 screenshot — the same pixels the player sees.
   */
  private finalFrameLuma(): Promise<number> {
    return new Promise((resolve) => {
      try {
        // PERF-GUARD: the camera the player is looking through. A camera that is not the scene's active one (a replay cut
        // had taken over) makes Babylon render the WHOLE scene again into a target just for this sample.
        const cam = this.scene.activeCamera ?? this.camera;
        Tools.CreateScreenshot(this.engine, cam, { width: 64, height: 64 }, (dataUrl) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = 64; c.height = 64;
            const ctx = c.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, 64, 64).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) {
              sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            }
            resolve(sum / (64 * 64));
          };
          img.onerror = () => resolve(255);            // never false-positive on decode issues
          img.src = dataUrl;
        });
      } catch {
        resolve(255);                                   // can't sample → don't judge
      }
    });
  }
}

// WIRING (ModeHarness): create ONCE after load:
//   const wd = new RenderWatchdog(scene, engine, camera, () => phase === 'playing',
//     (m) => setPhase('error', m));
//   wd.arm();   // wd.disarm() in cleanup — replaces the M31 version entirely.
