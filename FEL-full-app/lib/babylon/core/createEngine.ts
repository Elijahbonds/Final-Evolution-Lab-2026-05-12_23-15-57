// createEngine — one place every Babylon surface gets its engine from.
//
// WebGPU is OPT-IN, never the default. The original reason (TintMaterialPlugin injecting GLSL only) has since been half
// fixed — the plugin emits WGSL too — but the app's own shaders and material plugins are still GLSL-first, and the WebGPU
// path has never been measured on a phone. docs/PHONE-PERF-CHECK.md (the WebGPU trial section) lists what does and does not
// draw under it.
//
// DEVICE-PERF (owner 2026-11-12, "a WebGPU trial behind a flag, default off"): two ways to ask for WebGPU, both off by default.
//   NEXT_PUBLIC_WEBGPU="true"   the build-time switch (the owner's; unchanged).
//   ?engine=webgpu              a per-page trial for the OWNER: honoured only when the server opens the owner tools for this user
//                               (the feel panel's gate: FEEL_PANEL_ENABLED + FEEL_PANEL_USERS, or an admin; ownerTools.ts). Any
//                               other visitor who types it gets WebGL exactly as before. `?engine=webgl` forces WebGL.
// WebGPU needs navigator.gpu and an adapter; otherwise, or if it fails to start, WebGL runs silently (a console line says why).
// No third-party script: Babylon would fetch its GLSL→WGSL translators (glslang, twgsl) from cdn.babylonjs.com the first time a
// GLSL-only shader compiles under WebGPU. We never let it (NO_GLSL_TRANSLATOR): such a shader is not drawn under WebGPU, and a
// console line says so once.
// Which backend is running, and why, is engineChoice(engine): the owner's perf readout shows it (perfReadout.ts).

import { Engine, WebGPUEngine } from '@babylonjs/core';
import type { AbstractEngine } from '@babylonjs/core';
import { quietCanvas } from './canvasA11y';
import { ownerToolsAllowed } from './ownerTools';

/** Options every engine in this app shares regardless of backend. */
const SHARED = { adaptToDeviceRatio: true, antialias: true } as const;

/** What the page asked for: the `?engine=` value. */
export type EngineAsk = 'webgpu' | 'webgl' | null;

/** Which backend an engine runs on, what was asked, and why it is what it is (the perf readout shows this). */
export interface EngineChoice {
  backend: 'webgpu' | 'webgl2' | 'webgl1';
  asked: EngineAsk | 'build';
  note: string;
}

/** Pure: the `?engine=` value from a query string. Anything but webgpu / webgl is no ask. */
export function engineAskFrom(search: string): EngineAsk {
  let v: string | null = null;
  try { v = new URLSearchParams(search).get('engine'); } catch { /* no ask */ }
  v = v?.trim().toLowerCase() ?? null;
  return v === 'webgpu' || v === 'webgl' ? v : null;
}

function readAsk(): EngineAsk {
  try { return typeof window === 'undefined' ? null : engineAskFrom(window.location.search); } catch { return null; }
}

/** Pure: should this page TRY WebGPU? The build switch, or the owner's per-page ask; `?engine=webgl` always wins. */
export function wantsWebGpu(buildFlag: boolean, ask: EngineAsk, owner: boolean): boolean {
  if (ask === 'webgl') return false;
  if (buildFlag) return true;
  return ask === 'webgpu' && owner;
}

const choices = new WeakMap<AbstractEngine, EngineChoice>();
/** The backend this engine runs on and why (null for an engine createEngine did not make). */
export function engineChoice(engine: AbstractEngine): EngineChoice | null {
  return choices.get(engine) ?? null;
}

let glslWarned = false;
/** A glslang "module" that never arrives: Babylon awaits it for a GLSL-only shader, which therefore never draws. Never a fetch. */
const NO_GLSL_TRANSLATOR = {
  then() {
    if (glslWarned) return;
    glslWarned = true;
    console.warn('[FEL-WEBGPU] a GLSL-only shader needs translating; the translator is not loaded (no third-party script), so it is not drawn under WebGPU');
  },
};

/**
 * Create the best available engine for this canvas.
 * Falls back to WebGL2 whenever WebGPU is not requested, not supported, or
 * fails to initialise — a rendering backend is never worth a hard crash.
 */
export async function createEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  const ask = readAsk();
  const buildFlag = process.env.NEXT_PUBLIC_WEBGPU === 'true';
  // the owner check costs nothing for anyone who did not type ?engine=webgpu: it is not even asked
  const owner = ask === 'webgpu' && !buildFlag ? await ownerToolsAllowed() : false;
  const asked: EngineChoice['asked'] = ask ?? (buildFlag ? 'build' : null);
  let note = ask === 'webgpu' && !buildFlag && !owner ? 'WebGPU asked, but owner tools are closed for this user' : '';
  if (wantsWebGpu(buildFlag, ask, owner)) {
    try {
      const gpu = typeof navigator !== 'undefined' ? (navigator as unknown as { gpu?: unknown }).gpu : undefined;
      if (gpu && await WebGPUEngine.IsSupportedAsync) {
        const engine = new WebGPUEngine(canvas, {
          ...SHARED,
          glslangOptions: { glslang: NO_GLSL_TRANSLATOR as unknown as Promise<unknown> },
        } as ConstructorParameters<typeof WebGPUEngine>[1]);
        await engine.initAsync();
        quietCanvas(engine, canvas);
        choices.set(engine, { backend: 'webgpu', asked, note: 'WebGPU running (trial)' });
        console.info('[FEL] WebGPU engine (trial).');
        return engine;
      }
      note = gpu ? 'WebGPU asked, but this device gave no adapter' : 'WebGPU asked, but this browser has no WebGPU';
      console.info(`[FEL] ${note}: using WebGL.`);
    } catch (err) {
      // A half-initialised WebGPU engine is worse than none: fall all the way back.
      note = `WebGPU asked, but it failed to start (${String((err as Error)?.message ?? err).slice(0, 80)})`;
      console.warn('[FEL] WebGPU init failed, falling back to WebGL2:', err);
    }
  }
  // OOM-HYGIENE (2026-09-07): a disposed engine must also LOSE its WebGL context. Babylon's dispose deletes the
  // textures and buffers it knows about, but the context itself (its default framebuffer, MSAA resolve buffers and
  // anything still referenced from JS) lives until the canvas is garbage-collected — and a React key remount (DUNK
  // AGAIN, REPLAY, the dev double-mount) hands each contest a fresh canvas. Measured on /try (fake-pad loop probe): the
  // first contest's context was still alive and unlost on its detached canvas after the second contest. Chrome caps
  // live contexts at 16 per page and evicts the OLDEST when the cap is hit; on a memory-starved box the GPU process
  // dies first. loseContext() on dispose returns the context's memory the moment the mode exits.
  const engine = new Engine(canvas, true, { ...SHARED, loseContextOnDispose: true });
  // SCREEN-FIXES (2026-11-10): every game's canvas is named and out of the Tab order (lib/babylon/core/canvasA11y.ts);
  // a host that named its canvas keeps its name
  quietCanvas(engine, canvas);
  choices.set(engine, { backend: engine.webGLVersion >= 2 ? 'webgl2' : 'webgl1', asked, note: note || 'default' });
  return engine;
}
