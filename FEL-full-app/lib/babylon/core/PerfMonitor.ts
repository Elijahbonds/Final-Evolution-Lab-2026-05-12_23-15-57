// PerfMonitor — the frame budget monitor. Wave 1 puts this FIRST, before any
// optimization work, and that ordering is the point: optimization without
// measurement is guessing, and most guesses are wrong.
//
// What it watches, and why each one matters for THIS game:
//   FRAME TIME, not just FPS — a dunk that averages 60fps but spikes to 40ms
//     at the flush feels broken. Worst-in-window is the number that matters.
//   SHADER COMPILES DURING PLAY — Babylon compiles lazily on first
//     visibility, so a new cosmetic or VFX entering frame mid-dunk causes a
//     hitch at exactly the wrong moment. Any compile while playing is a bug;
//     this counts them and says so.
//   DRAW CALLS / MESHES / TEXTURE VRAM against the ceilings in the brief.
//   LONG FRAMES — a rolling count of frames over budget, which is what
//     adaptive quality (when it lands) should actually react to.
//
// Dev-only: `mount()` is a no-op unless explicitly enabled, so the overlay
// and its per-frame bookkeeping cost nothing in production.

import type { AbstractEngine, InternalTexture, Scene } from '@babylonjs/core';
import { SceneInstrumentation } from '@babylonjs/core';

// InternalTextureSource: RenderTarget 5, MultiRenderTarget 6, DepthStencil 12, Depth 14 — the pipeline's textures
// (shadow maps, post-process targets), sized by the quality tier, not by the mode. Literal so this file stays
// type-only on @babylonjs/core (the overlay is dev-only and must not pull the engine into its own chunk).
const RENDER_TARGET_SOURCES = new Set<number>([5, 6, 12, 14]);

export interface PerfBudget {
  frameMs: number;        // 16.7 = 60fps, 33.3 = 30fps
  drawCalls: number;
  activeMeshes: number;
  textureMb: number;
}

// drawCalls: the panel now reports the engine's REAL per-frame draw calls (main pass + every shadow cascade per caster).
// Measured 2026-09-06 on the play cameras after the caster trim: dunk 416, slalom 576, karate 250-ish; the old 150 was an
// active-mesh count in disguise. 600 is that measured ceiling, not a target — owner to confirm or re-baseline.
export const DEFAULT_BUDGET: PerfBudget = {
  frameMs: 16.7, drawCalls: 600, activeMeshes: 400, textureMb: 256,
};

// ── THE BUDGET IS PER TIER (2026-09-13) ──────────────────────────────────────────────────────────────────
//
// One budget was being applied to two very different machines, and it fired on the wrong one. Measured on
// the same scene, same content, same build:
//
//   threepoint @ desktop tier (1100×700):  833 draws, 60 fps   → "⚠ draws 833 > 600"
//   threepoint @ mobile tier  (390×760):   277 draws, 60 fps, worst frame 17.7 ms → no warning
//
// The tier system is already doing its job: the mobile tier renders the same crowd in a third of the draws.
// So the 600 ceiling — measured on mobile-ish content — was only ever displayed on DESKTOP, where 833 draws
// costs nothing and the warning is noise, and stayed silent on mobile, where it would have meant something.
// A budget line that cannot fire where it matters is worse than no budget line: it trains you to ignore it.
//
// Desktop gets a ceiling sized to what a desktop actually chokes on; mobile keeps the measured one.
export const MOBILE_BUDGET: PerfBudget = DEFAULT_BUDGET;
export const DESKTOP_BUDGET: PerfBudget = {
  frameMs: 16.7, drawCalls: 1600, activeMeshes: 900, textureMb: 512,
};

export function budgetForTier(tier: 'mobile' | 'desktop' | undefined): PerfBudget {
  return tier === 'desktop' ? DESKTOP_BUDGET : MOBILE_BUDGET;
}

export interface PerfSample {
  fps: number;
  frameMs: number;
  avgMs: number;
  worstMs: number;         // worst in the last WINDOW frames
  longFrames: number;      // frames over budget in the window
  drawCalls: number;
  activeMeshes: number;
  totalVertices: number;
  textureMb: number;
  shaderCompilesWhilePlaying: number;
  violations: string[];
}

const WINDOW = 120;        // ~2s at 60fps

// A LONG FRAME IS A HITCH, NOT A FRAME THAT MISSED BY A MICROSECOND (2026-09-14).
//
// `longFrames` counted every frame over `budget.frameMs`, and that budget is 16.7 ms — the vsync target
// itself. A mode holding a locked 60 fps averages 16.7 ms by definition, so jitter puts roughly HALF its
// frames a hair over the line and the readout says "53/120 long". It did, on the dunk contest, and I wrote
// it up in a review as "44% of frames are late" before checking what the number meant. It is not judder;
// it is a threshold sitting exactly on the target.
//
// This file's own header says it best: "A budget line that cannot fire where it matters is worse than no
// budget line: it trains you to ignore it." A frame is LONG when a player would feel it — a missed vsync
// interval, not a rounding error — so the count gets headroom the budget does not.
export const LONG_FRAME_HEADROOM = 1.35;   // 16.7 ms budget → ~22.5 ms, i.e. an actually-dropped frame

export class PerfMonitor {
  private times: number[] = [];
  private last = performance.now();
  private compiles = 0;
  private playing = false;
  private obs: ReturnType<Scene['onAfterRenderObservable']['add']> | null = null;
  private el: HTMLDivElement | null = null;
  private sample: PerfSample | null = null;
  private uiTick = 0;
  private instr: SceneInstrumentation | null = null;

  constructor(
    private scene: Scene,
    private engine: AbstractEngine,
    private budget: PerfBudget = DEFAULT_BUDGET,
  ) {}

  /** Tell the monitor when real gameplay is running — a shader compile here
   *  is a defect, a compile during loading is expected. */
  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (playing) this.compiles = 0;
  }

  /** Hook a material so a late compile is attributed and counted. */
  watchMaterial(material: { onCompiled?: ((effect: unknown) => void) | null; name?: string }): void {
    const prior = material.onCompiled ?? null;
    material.onCompiled = (effect: unknown) => {
      if (this.playing) {
        this.compiles++;
        console.warn(`[FEL-PERF] shader compiled DURING GAMEPLAY: "${material.name ?? '?'}" — `
          + 'pre-warm this material on the loading screen (forceCompilationAsync).');
      }
      prior?.(effect);
    };
  }

  /** Warm every material currently in the scene. Call on the loading screen. */
  async warmAll(): Promise<number> {
    const mats = this.scene.materials;
    let warmed = 0;
    await Promise.all(mats.map(async (m) => {
      const anyMat = m as unknown as { forceCompilationAsync?: (mesh: unknown) => Promise<void> };
      const mesh = this.scene.meshes.find((x) => x.material === m);
      if (!anyMat.forceCompilationAsync || !mesh) return;
      try { await anyMat.forceCompilationAsync(mesh); warmed++; } catch { /* non-fatal */ }
    }));
    console.info(`[FEL-PERF] pre-warmed ${warmed}/${mats.length} material(s)`);
    return warmed;
  }

  start(): void {
    if (this.obs) return;
    this.last = performance.now();
    this.obs = this.scene.onAfterRenderObservable.add(() => this.tick());
  }

  /** GPU texture memory, counted the way scripts/probes/_vram-diag.mts counts it (pass 4 phase 9, 2026-09-04):
   *  every texture in the ENGINE's cache once. scene.textures was the wrong list — an AssetContainer's maps are
   *  uploaded at load but never appear in it (the hero GLB's 96 MB read as 0 here in every mode), and a
   *  Material.clone() pushes a Texture that SHARES one GPU texture into it (a logged-in dunk read the hero twice).
   *  Render targets and shadow/depth maps are left out: they belong to the quality tier, not the mode. */
  private textureMb(): number {
    const cache = (this.engine as unknown as { _internalTexturesCache?: InternalTexture[] })._internalTexturesCache;
    let bytes = 0;
    if (cache) {
      for (const t of cache) {
        if (RENDER_TARGET_SOURCES.has(t.source)) continue;
        // 4 bytes/px, ~33% for the mip chain, six faces for a cube, every slice of a 3D texture
        bytes += t.width * t.height * 4 * (t.generateMipMaps ? 1.33 : 1) * (t.isCube ? 6 : 1) * (t.is3D ? Math.max(1, t.depth) : 1);
      }
      return bytes / (1024 * 1024);
    }
    for (const t of this.scene.textures) {                 // an engine without the cache (NullEngine in tests)
      const size = t.getSize?.();
      if (!size?.width) continue;
      bytes += size.width * size.height * 4 * 1.33;
    }
    return bytes / (1024 * 1024);
  }

  private tick(): void {
    const now = performance.now();
    const dt = now - this.last;
    this.last = now;
    this.times.push(dt);
    if (this.times.length > WINDOW) this.times.shift();

    // recompute the summary a few times a second, not every frame
    if (++this.uiTick % 15 !== 0) return;

    const sum = this.times.reduce((a, b) => a + b, 0);
    const avgMs = sum / this.times.length;
    const worstMs = Math.max(...this.times);
    const longFrames = this.times.filter((t) => t > this.budget.frameMs * LONG_FRAME_HEADROOM).length;
    // Babylon keeps the real per-frame draw-call counter on the engine as `_drawCalls` (what SceneInstrumentation reads);
    // `engine.drawCalls` does not exist, so this always fell back to the ACTIVE MESH count — the slalom's 60 instanced pines
    // read as 60 "draws" when they are one (measured 2026-09-06). Active meshes stay their own field.
    if (!this.instr) this.instr = new SceneInstrumentation(this.scene);   // resets the engine's counter every frame
    const dc = (this.engine as unknown as { _drawCalls?: { current?: number } })._drawCalls?.current;
    const drawCalls = dc && dc > 0 ? dc : this.scene.getActiveMeshes().length;   // sampled after render: this frame's real draw calls (shadow passes included)
    const activeMeshes = this.scene.getActiveMeshes().length;
    const textureMb = this.textureMb();

    const violations: string[] = [];
    if (avgMs > this.budget.frameMs) violations.push(`frame ${avgMs.toFixed(1)}ms > ${this.budget.frameMs}ms`);
    if (drawCalls > this.budget.drawCalls) violations.push(`draws ${drawCalls} > ${this.budget.drawCalls}`);
    if (activeMeshes > this.budget.activeMeshes) violations.push(`meshes ${activeMeshes} > ${this.budget.activeMeshes}`);
    if (textureMb > this.budget.textureMb) violations.push(`vram ${textureMb.toFixed(0)}MB > ${this.budget.textureMb}MB`);
    if (this.compiles > 0) violations.push(`${this.compiles} shader compile(s) during gameplay`);

    this.sample = {
      fps: 1000 / avgMs, frameMs: dt, avgMs, worstMs, longFrames,
      drawCalls, activeMeshes,
      totalVertices: (this.scene as unknown as { getActiveVertices?: () => number }).getActiveVertices?.() ?? 0,
      textureMb, shaderCompilesWhilePlaying: this.compiles, violations,
    };
    if (this.el) this.render(this.el, this.sample);
  }

  current(): PerfSample | null { return this.sample; }

  /** On-screen overlay. Dev builds only — pass enabled=false in production
   *  and the whole thing (including the per-frame work) stays off. */
  mount(enabled: boolean): void {
    if (!enabled || typeof document === 'undefined' || this.el) return;
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'top:8px', 'left:8px', 'z-index:99999',
      'font:11px/1.45 ui-monospace,Menlo,monospace', 'color:#cfe8ff',
      'background:rgba(6,12,20,0.82)', 'padding:8px 10px', 'border-radius:8px',
      'pointer-events:none', 'white-space:pre', 'min-width:190px',
    ].join(';');
    document.body.appendChild(el);
    this.el = el;
    this.start();
  }

  private render(el: HTMLDivElement, s: PerfSample): void {
    const bad = s.violations.length > 0;
    el.style.borderLeft = `3px solid ${bad ? '#ff6b6b' : '#7ee2a0'}`;
    el.textContent = [
      `${s.fps.toFixed(0)} fps   avg ${s.avgMs.toFixed(1)}ms`,
      `worst ${s.worstMs.toFixed(1)}ms  long ${s.longFrames}/${WINDOW}`,
      `draws ${s.drawCalls}  meshes ${s.activeMeshes}`,
      `vram ~${s.textureMb.toFixed(0)}MB`,
      s.shaderCompilesWhilePlaying > 0 ? `⚠ ${s.shaderCompilesWhilePlaying} compile(s) mid-play` : 'compiles: clean',
      ...(bad ? ['', '⚠ ' + s.violations.join('\n⚠ ')] : []),
    ].join('\n');
  }

  /** JSON trace for comparing runs across commits. */
  snapshot(): PerfSample | null { return this.sample ? { ...this.sample } : null; }

  dispose(): void {
    this.instr?.dispose(); this.instr = null;
    if (this.obs) this.scene.onAfterRenderObservable.remove(this.obs);
    this.obs = null;
    this.el?.remove();
    this.el = null;
  }
}
