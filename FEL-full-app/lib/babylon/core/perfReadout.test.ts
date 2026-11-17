// perfReadout (device-perf, owner 2026-11-12): the owner's perf readout — its numbers, its report, and its cost guarantee (a
// published game adds no per-frame work until the overlay attaches a sampler, and detaching removes every observer it added).
import { describe, expect, it } from 'vitest';
import { Constants, NullEngine, Scene, MeshBuilder, FreeCamera, Vector3 } from '@babylonjs/core';
import {
  attachSampler, engineLabel, engineSwitchHref, pct, publishReadoutSource, readoutLines, readoutReport, readoutSource,
  texelBytes, textureBytes, READY_BUDGET_MS, type ReadoutSample,
} from './perfReadout';

describe('pct', () => {
  it('is nearest rank on an ascending list, 0 when empty', () => {
    expect(pct([], 0.5)).toBe(0);
    expect(pct([10], 0.95)).toBe(10);
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(pct(xs, 0.5)).toBe(50);
    expect(pct(xs, 0.95)).toBe(95);
  });
});

describe('texture estimate', () => {
  it('counts RGBA8 at 4 bytes, half float RGBA at 8, float at 16, R8 at 1, RG at 2', () => {
    expect(texelBytes({ width: 1, height: 1 })).toBe(4);
    expect(texelBytes({ width: 1, height: 1, type: Constants.TEXTURETYPE_HALF_FLOAT })).toBe(8);
    expect(texelBytes({ width: 1, height: 1, type: Constants.TEXTURETYPE_FLOAT })).toBe(16);
    expect(texelBytes({ width: 1, height: 1, format: Constants.TEXTUREFORMAT_R })).toBe(1);
    expect(texelBytes({ width: 1, height: 1, format: Constants.TEXTUREFORMAT_RG })).toBe(2);
  });
  it('counts compressed and depth formats', () => {
    expect(texelBytes({ width: 1, height: 1, _compression: 'etc2' })).toBe(1);
    expect(texelBytes({ width: 1, height: 1, format: 0x9278 })).toBe(1);   // a GL compressed enum
    expect(texelBytes({ width: 1, height: 1, format: Constants.TEXTUREFORMAT_DEPTH16 })).toBe(2);
    expect(texelBytes({ width: 1, height: 1, format: Constants.TEXTUREFORMAT_DEPTH24_STENCIL8 })).toBe(4);
  });
  it('multiplies mips by 4/3, cubes by 6, MSAA by its samples, and skips empty textures', () => {
    expect(textureBytes([{ width: 1024, height: 1024 }])).toBe(4 * 1024 * 1024);
    expect(textureBytes([{ width: 1024, height: 1024, generateMipMaps: true }])).toBeCloseTo(4 * 1024 * 1024 * 4 / 3, 0);
    expect(textureBytes([{ width: 256, height: 256, isCube: true }])).toBe(6 * 4 * 256 * 256);
    expect(textureBytes([{ width: 100, height: 100, samples: 4 }])).toBe(4 * 4 * 100 * 100);
    expect(textureBytes([{ width: 0, height: 512 }, { width: 2, height: 2 }])).toBe(16);
  });
});

const SAMPLE: ReadoutSample = {
  at: '2026-11-12 20:00:00 UTC', modeId: 'onevone', phase: 'playing', tier: 'mobile',
  engine: { backend: 'webgpu', asked: 'webgpu', note: 'WebGPU running (trial)' }, renderer: 'Apple GPU', gpuClass: 'integrated',
  os: 'ios', dpr: 3, backing: '780x1688', frames: 300, fps: 59.6, frameP50: 16.7, frameP95: 18.4, worstMs: 41.2, stalls: 0,
  cpuP50: 4.1, cpuP95: 7.9, draws: 212, drawsMax: 240, activeMeshes: 180, meshes: 640, textures: 74, textureMB: 96.4,
  heapMB: null, readyModeMs: 3400, readyPageMs: 9100, playPageMs: 12000, guard: { cap: 60, level: 0, hardwareScalingLevel: 1.5 },
  path: '/play/onevone?playtest=1',
};

describe('what the owner reads and copies', () => {
  it('the overlay names the mode, the engine, the frame numbers, the draws, the memory and READY', () => {
    const t = readoutLines(SAMPLE).join('\n');
    for (const s of ['onevone · playing', 'engine WebGPU (WebGPU running (trial))', 'fps 59.6', 'p50 16.7', 'p95 18.4', 'worst 41 ms',
      'cpu p50 4.1 p95 7.9', 'draws 212 (max 240)', 'meshes 180/640', 'textures 74', '≈96 MB', 'heap n/a', 'READY 3.4 s (mode)', '9.1 s (page)',
      'cap 60 L0']) expect(t).toContain(s);
  });
  it('the report is plain text with every number, flags READY over the 8 s budget, and says when the heap is not reported', () => {
    const r = readoutReport(SAMPLE);
    expect(r.split('\n').length).toBeLessThanOrEqual(12);
    expect(r).toContain('FEL perf report');
    expect(r).toContain('mode onevone');
    expect(r).toContain('asked webgpu');
    expect(r).toContain('device ios · gpu integrated (Apple GPU)');
    expect(r).toContain('draw calls 212 (max 240)');
    expect(r).toContain('js heap not reported by this browser');
    expect(r).toContain('(over the 8 s budget)');
    expect(READY_BUDGET_MS).toBe(8000);
    expect(readoutReport({ ...SAMPLE, readyPageMs: 5000 })).not.toContain('over the 8 s budget');
    expect(r).toContain('stalls over 1 s: 0');
    expect(readoutLines(SAMPLE).join('\n')).not.toContain('stalls>1s');
    expect(readoutLines({ ...SAMPLE, stalls: 3 }).join('\n')).toContain('worst 41 ms · stalls>1s 3');
  });
  it('the report carries no account, email or id — only the device class and the renderer the owner pastes themselves', () => {
    const r = readoutReport(SAMPLE);
    expect(r).not.toMatch(/@|user|email|session/i);
  });
  it('the engine label says which backend runs and why', () => {
    expect(engineLabel(null)).toBe('unknown');
    expect(engineLabel({ backend: 'webgl2', asked: null, note: 'default' })).toBe('WebGL2');
    expect(engineLabel({ backend: 'webgl2', asked: 'webgpu', note: 'WebGPU asked, but this browser has no WebGPU' }))
      .toBe('WebGL2 (WebGPU asked, but this browser has no WebGPU)');
  });
  it('the engine switch keeps the page and its other keys, and WebGL drops the ask', () => {
    expect(engineSwitchHref('https://x.test/play/onevone?playtest=1', 'webgpu')).toBe('https://x.test/play/onevone?playtest=1&engine=webgpu');
    expect(engineSwitchHref('https://x.test/play/onevone?playtest=1&engine=webgpu', 'webgl')).toBe('https://x.test/play/onevone?playtest=1');
  });
});

function rig() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera('c', new Vector3(0, 1, -5), scene);
  MeshBuilder.CreateBox('b', {}, scene);
  return { engine, scene };
}
// Babylon removes an observer on the next tick (it marks it _willBeUnregistered first): count the live ones
const live = (o: { observers: Array<{ _willBeUnregistered?: boolean }> }) => o.observers.filter((x) => !x._willBeUnregistered).length;
const counts = (engine: NullEngine) => ({ b: live(engine.onBeginFrameObservable as never), e: live(engine.onEndFrameObservable as never) });

describe('the live game and the sampler', () => {
  it('publishing a game adds no observer; the sampler adds two and removes them on dispose', () => {
    const { engine, scene } = rig();
    const before = counts(engine);
    const pub = publishReadoutSource({ engine, scene, modeId: 'onevone', tier: 'mobile' });
    expect(readoutSource()?.modeId).toBe('onevone');
    expect(counts(engine)).toEqual(before);
    const s = attachSampler(readoutSource()!);
    expect(counts(engine)).toEqual({ b: before.b + 1, e: before.e + 1 });
    s.dispose();
    expect(counts(engine)).toEqual(before);
    pub.dispose();
    expect(readoutSource()).toBeNull();
    scene.dispose(); engine.dispose();
  });

  it('measures frame intervals and JS work on the frame clock, restarts per phase, and times READY from the mode start', () => {
    const { engine, scene } = rig();
    let t = 1000;
    const now = () => t;
    const pub = publishReadoutSource({ engine, scene, modeId: 'threevthree', tier: 'mobile', now, guard: () => ({ cap: 30, level: 2, hardwareScalingLevel: 2 }) });
    const src = readoutSource()!;
    const s = attachSampler(src, { now });
    const frame = (gap: number, work: number) => { t += gap - work; engine.beginFrame(); t += work; scene.render(); engine.endFrame(); };
    t += 2500; pub.setPhase('ready');
    t += 500; pub.setPhase('playing');
    for (let i = 0; i < 120; i++) frame(i % 10 === 9 ? 50 : 20, 5);
    const a = s.sample();
    expect(a.modeId).toBe('threevthree');
    expect(a.phase).toBe('playing');
    expect(a.frames).toBe(119);                 // the first frame has no interval before it
    expect(a.frameP50).toBeCloseTo(20, 5);
    expect(a.frameP95).toBeCloseTo(50, 5);
    expect(a.worstMs).toBeCloseTo(50, 5);
    expect(a.cpuP50).toBeCloseTo(5, 5);
    expect(a.fps).toBeGreaterThan(35);
    expect(a.fps).toBeLessThan(50);
    expect(a.readyModeMs).toBe(2500);
    expect(a.readyPageMs).toBe(3500);
    expect(a.guard).toEqual({ cap: 30, level: 2, hardwareScalingLevel: 2 });
    expect(a.meshes).toBe(1);
    expect(a.textures).toBeGreaterThanOrEqual(0);
    expect(a.stalls).toBe(0);
    frame(1500, 5);                             // a 1.5 s freeze while showing: a stall, not a frame
    expect(s.sample().stalls).toBe(1);
    expect(s.sample().worstMs).toBeCloseTo(50, 5);
    pub.setPhase('paused');
    expect(s.sample().frames).toBe(0);          // a new phase starts a new window
    s.dispose(); pub.dispose();
    scene.dispose(); engine.dispose();
  });

  it('a later mount replaces the earlier one, and the earlier one going away does not clear the later', () => {
    const a = rig(), b = rig();
    const pa = publishReadoutSource({ ...a, modeId: 'a', tier: 'mobile' });
    const pb = publishReadoutSource({ ...b, modeId: 'b', tier: 'mobile' });
    pa.dispose();
    expect(readoutSource()?.modeId).toBe('b');
    pb.dispose();
    expect(readoutSource()).toBeNull();
    for (const r of [a, b]) { r.scene.dispose(); r.engine.dispose(); }
  });
});
