// LETTERBOX (vis-foundation-2 A9.12, 2026-10-13) — the bars a broadcast puts on a cinematic: the intro's crane, a replay.
//
// Two DOM bars over the canvas, not a post pass: a post effect switched on for a cinematic would compile a shader on the
// frame it changes (ImpactFrame.ts — never toggle a pass at runtime), and a DOM bar costs the GPU nothing. They sit just
// above the canvas and under every HUD layer, take no pointer events, and ease in and out (the level they show is eased
// toward the asked level, so a cut never snaps the frame). Who asks: the CameraDirector's intro (cinematic01) and the
// ReplayDirector (scene.metadata.felCinematic) — the harness hands this the larger of the two.
//
// Note for capture probes: a canvas readback (toDataURL) does not include the bars; a page screenshot does.

import type { Observer, Scene } from '@babylonjs/core';

/** The aspect the bars cut a frame to (anamorphic scope). */
export const LETTERBOX_ASPECT = 2.39;
/** On a tall screen (a phone held upright) a scope cut would eat the picture: the bars never take more than this of it, each. */
export const LETTERBOX_MAX_SHARE = 0.12;
/** Per-second ease toward the asked level. */
export const LETTERBOX_EASE = 7;

/** Pure: one bar's height in CSS px for a `w`×`h` canvas at level `k` (0 none .. 1 full). */
export function letterboxBarPx(w: number, h: number, k: number): number {
  if (!(w > 0 && h > 0)) return 0;
  const t = Math.max(0, Math.min(1, k));
  const scope = Math.max(0, (h - w / LETTERBOX_ASPECT) / 2);
  return Math.round(Math.min(scope, h * LETTERBOX_MAX_SHARE) * t);
}

export interface LetterboxHandle {
  /** The level on screen now (eased). */
  readonly shown: number;
  dispose(): void;
}

/** Mount the bars over `canvas`; each frame they ease toward max(level(), scene.metadata.felCinematic). */
export function mountLetterbox(scene: Scene, canvas: HTMLCanvasElement | null | undefined, level: () => number): LetterboxHandle {
  let shown = 0;
  let wrap: HTMLDivElement | null = null, top: HTMLDivElement | null = null, bottom: HTMLDivElement | null = null;
  const parent = canvas?.parentElement ?? null;
  if (canvas && parent && typeof document !== 'undefined') {
    wrap = document.createElement('div');
    wrap.setAttribute('data-fel-letterbox', '');
    wrap.style.cssText = 'position:absolute;pointer-events:none;z-index:1;overflow:hidden;display:none;';
    const bar = (edge: 'top' | 'bottom'): HTMLDivElement => {
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:0;right:0;${edge}:0;height:0;background:#000;`;
      wrap!.appendChild(d);
      return d;
    };
    top = bar('top'); bottom = bar('bottom');
    parent.insertBefore(wrap, canvas.nextSibling);
  }
  const obs: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    const meta = (scene.metadata as { felCinematic?: number } | null)?.felCinematic ?? 0;
    const want = Math.max(0, Math.min(1, Math.max(level(), meta)));
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    shown += (want - shown) * Math.min(1, LETTERBOX_EASE * dt);
    if (Math.abs(want - shown) < 0.002) shown = want;
    if (!wrap || !canvas || !top || !bottom) return;
    if (shown <= 0.001) { if (wrap.style.display !== 'none') wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    wrap.style.left = `${canvas.offsetLeft}px`; wrap.style.top = `${canvas.offsetTop}px`;
    wrap.style.width = `${canvas.clientWidth}px`; wrap.style.height = `${canvas.clientHeight}px`;
    const px = `${letterboxBarPx(canvas.clientWidth, canvas.clientHeight, shown)}px`;
    top.style.height = px; bottom.style.height = px;
  });
  return {
    get shown() { return shown; },
    dispose() { scene.onBeforeRenderObservable.remove(obs); wrap?.remove(); },
  };
}
