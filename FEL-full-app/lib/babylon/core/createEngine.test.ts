// createEngine's WebGPU trial (device-perf, owner 2026-11-12: "a WebGPU trial behind a flag, default off"). Default WebGL for
// everyone; ?engine=webgpu only for the owner (the feel panel's gate), only where navigator.gpu gives an adapter; any failure falls
// back to WebGL silently; and under WebGPU Babylon is never allowed to fetch its GLSL translator from a third-party CDN.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  owner: false,
  ownerAsked: 0,
  supported: true,
  initThrows: false,
  gpuOpts: null as Record<string, unknown> | null,
}));

vi.mock('./ownerTools', () => ({ ownerToolsAllowed: async () => { h.ownerAsked++; return h.owner; } }));
vi.mock('./canvasA11y', () => ({ quietCanvas: () => {} }));
vi.mock('@babylonjs/core', () => {
  class Engine { webGLVersion = 2; constructor(public canvas: unknown, public aa: boolean, public opts: unknown) {} }
  class WebGPUEngine {
    static get IsSupportedAsync() { return Promise.resolve(h.supported); }
    isWebGPU = true;
    constructor(public canvas: unknown, opts: Record<string, unknown>) { h.gpuOpts = opts; }
    async initAsync() { if (h.initThrows) throw new Error('no device'); }
  }
  return { Engine, WebGPUEngine };
});

import { createEngine, engineAskFrom, engineChoice, wantsWebGpu } from './createEngine';

const canvas = {} as HTMLCanvasElement;
function page(search: string, gpu: boolean) {
  vi.stubGlobal('window', { location: { search } });
  vi.stubGlobal('navigator', gpu ? { gpu: {} } : {});
}

beforeEach(() => {
  Object.assign(h, { owner: false, ownerAsked: 0, supported: true, initThrows: false, gpuOpts: null });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('the ask', () => {
  it('reads ?engine=webgpu / webgl only', () => {
    expect(engineAskFrom('')).toBeNull();
    expect(engineAskFrom('?engine=webgpu')).toBe('webgpu');
    expect(engineAskFrom('?playtest=1&engine=WebGL')).toBe('webgl');
    expect(engineAskFrom('?engine=vulkan')).toBeNull();
  });
  it('tries WebGPU only for the build switch or the owner, and ?engine=webgl always wins', () => {
    expect(wantsWebGpu(false, null, true)).toBe(false);
    expect(wantsWebGpu(false, 'webgpu', false)).toBe(false);
    expect(wantsWebGpu(false, 'webgpu', true)).toBe(true);
    expect(wantsWebGpu(true, null, false)).toBe(true);
    expect(wantsWebGpu(true, 'webgl', true)).toBe(false);
  });
});

describe('createEngine', () => {
  it('a normal page is WebGL, exactly as before, and never asks who the user is', async () => {
    page('?playtest=1', true);
    const e = await createEngine(canvas) as unknown as { opts: unknown };
    expect(engineChoice(e as never)).toEqual({ backend: 'webgl2', asked: null, note: 'default' });
    expect(e.opts).toEqual({ adaptToDeviceRatio: true, antialias: true, loseContextOnDispose: true });
    expect(h.ownerAsked).toBe(0);
    expect(h.gpuOpts).toBeNull();
  });
  it('?engine=webgpu from someone who is not the owner is WebGL', async () => {
    page('?engine=webgpu', true);
    const e = await createEngine(canvas);
    expect(h.ownerAsked).toBe(1);
    expect(h.gpuOpts).toBeNull();
    expect(engineChoice(e)?.backend).toBe('webgl2');
    expect(engineChoice(e)?.note).toMatch(/owner tools are closed/);
  });
  it('the owner with an adapter gets WebGPU, and Babylon is handed a translator that never fetches', async () => {
    h.owner = true;
    page('?engine=webgpu', true);
    const e = await createEngine(canvas);
    expect(engineChoice(e)).toEqual({ backend: 'webgpu', asked: 'webgpu', note: 'WebGPU running (trial)' });
    const g = (h.gpuOpts!.glslangOptions as { glslang: { then: unknown } }).glslang;
    expect(typeof g.then).toBe('function');
    expect(h.gpuOpts).toMatchObject({ adaptToDeviceRatio: true, antialias: true });
  });
  it('no navigator.gpu, no adapter, or a failed start: WebGL, with the reason', async () => {
    h.owner = true;
    page('?engine=webgpu', false);
    expect(engineChoice(await createEngine(canvas))?.note).toMatch(/no WebGPU/);
    page('?engine=webgpu', true);
    h.supported = false;
    expect(engineChoice(await createEngine(canvas))?.note).toMatch(/no adapter/);
    h.supported = true;
    h.initThrows = true;
    const e = await createEngine(canvas);
    expect(engineChoice(e)?.backend).toBe('webgl2');
    expect(engineChoice(e)?.note).toMatch(/failed to start \(no device\)/);
  });
  it('?engine=webgl beats the build switch', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEBGPU', 'true');
    page('?engine=webgl', true);
    const e = await createEngine(canvas);
    expect(engineChoice(e)?.backend).toBe('webgl2');
    expect(h.gpuOpts).toBeNull();
  });
});
