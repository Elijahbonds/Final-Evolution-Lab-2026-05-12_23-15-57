// createEngine — one place every Babylon surface gets its engine from.
//
// WebGPU is OPT-IN (NEXT_PUBLIC_WEBGPU="true"), not the default, and that is a
// deliberate call rather than caution for its own sake:
//
//   lib/babylon/avatar/TintMaterialPlugin.ts injects raw GLSL through
//   getCustomCode() with no shaderLanguage guard. WebGPU compiles WGSL, so that
//   plugin's shader fails to build under it and every tinted avatar breaks.
//
// Until that plugin emits WGSL alongside its GLSL, defaulting to WebGPU would
// trade a real, visible regression for a perf win most devices here don't need.
// The flag exists so the WebGPU path can be exercised and profiled on demand,
// and so flipping the default later is a one-line change once the plugin is fixed.

import { Engine, WebGPUEngine } from '@babylonjs/core';
import type { AbstractEngine } from '@babylonjs/core';

/** Options every engine in this app shares regardless of backend. */
const SHARED = { adaptToDeviceRatio: true, antialias: true } as const;

function webgpuRequested(): boolean {
  return process.env.NEXT_PUBLIC_WEBGPU === 'true';
}

/**
 * Create the best available engine for this canvas.
 * Falls back to WebGL2 whenever WebGPU is not requested, not supported, or
 * fails to initialise — a rendering backend is never worth a hard crash.
 */
export async function createEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  if (webgpuRequested()) {
    try {
      if (await WebGPUEngine.IsSupportedAsync) {
        const engine = new WebGPUEngine(canvas, { ...SHARED });
        await engine.initAsync();
        return engine;
      }
      console.info('[FEL] WebGPU requested but unsupported here — using WebGL2.');
    } catch (err) {
      // A half-initialised WebGPU engine is worse than none: fall all the way back.
      console.warn('[FEL] WebGPU init failed, falling back to WebGL2:', err);
    }
  }
  return new Engine(canvas, true, { ...SHARED });
}
