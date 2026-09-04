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

import type { Engine, Scene } from '@babylonjs/core';

export interface PerfBudget {
  frameMs: number;        // 16.7 = 60fps, 33.3 = 30fps
  drawCalls: number;
  activeMeshes: number;
  textureMb: number;
}

export const DEFAULT_BUDGET: PerfBudget = {
  frameMs: 16.7, drawCalls: 150, activeMeshes: 400, textureMb: 256,
};

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

export class PerfMonitor {
  private times: number[] = [];
  private last = performance.now();
  private compiles = 0;
  private playing = false;
  private obs: ReturnType<Scene['onAfterRenderObservable']['add']> | null = null;
  private el: HTMLDivElement | null = null;
  private sample: PerfSample | null = null;
  private uiTick = 0;

  constructor(
    private scene: Scene,
    private engine: Engine,
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

  private textureMb(): number {
    let bytes = 0;
    for (const t of this.scene.textures) {
      const size = t.getSize?.();
      if (!size?.width) continue;
      // 4 bytes/px + ~33% for the mip chain
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
    const longFrames = this.times.filter((t) => t > this.budget.frameMs).length;
    const drawCalls = (this.engine as unknown as { drawCalls?: { current?: number } }).drawCalls?.current
      ?? this.scene.getActiveMeshes().length;
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
    if (this.obs) this.scene.onAfterRenderObservable.remove(this.obs);
    this.obs = null;
    this.el?.remove();
    this.el = null;
  }
}
