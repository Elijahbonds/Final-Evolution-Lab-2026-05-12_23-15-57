// hoops-items / meter-entry — the 3D shot meter alone, on WebGL or WebGPU (?engine=webgl|webgpu&s=<seconds>&wgsl=1|0), bundled by
// ./meter-webgpu.mjs. A camera, a dark clear colour, the meter begun (green 0.55 ± 0.12) and filled to 0.5 beside a head at the origin.
// Publishes window.__meter = { engine, isWebGPU, frames, ready, lost, error, errors[], wgsl: { vertex, fragment } (the processed code the
// effect compiled), compile: [{ stage, messages }] (a fresh GPUDevice's own compile of that code), done }.
import { Engine, WebGPUEngine, Scene, FreeCamera, Vector3, Color4 } from '@babylonjs/core';
import { mountShotMeter3D } from '@/lib/babylon/visual/ShotMeter3D';
import { setFeelUser, setFeelSession, setFeelOverride } from '@/lib/feel-panel/feel';

const W = window;
const M = (W.__meter = { engine: '', isWebGPU: false, frames: 0, ready: false, lost: false, error: null, errors: [], wgsl: null, compile: [], done: false });
(async () => {
  const q = new URLSearchParams(location.search);
  const want = q.get('engine') ?? 'webgl';
  const secs = Number(q.get('s') ?? 3);
  if (q.get('wgsl') === '0') { setFeelUser(true); setFeelSession(null); setFeelOverride('perf.meterWgslOn', 0); }
  try {
    const canvas = document.getElementById('c');
    let engine;
    if (want === 'webgpu') { engine = new WebGPUEngine(canvas, { adaptToDeviceRatio: false, antialias: false }); await engine.initAsync(); engine.onContextLostObservable.add(() => { M.lost = true; }); }
    else engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: true });
    M.engine = engine.description ?? engine.name; M.isWebGPU = !!engine.isWebGPU;
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.1, 0.14, 1);
    const cam = new FreeCamera('cam', new Vector3(0.5, 1.9, -2.2), scene); cam.setTarget(new Vector3(0.5, 1.9, 0));
    const meter = mountShotMeter3D(scene);
    meter.begin({ center: 0.55, half: 0.12 });
    meter.set(0.5, new Vector3(0, 1.7, 0));
    const quad = scene.getMeshByName('shot_meter'); const mat = quad.material;
    mat.onError = (_e, errs) => { M.errors.push(String(errs).slice(0, 400)); };
    engine.runRenderLoop(() => { scene.render(); M.frames++; if (!M.ready && mat.isReady(quad)) M.ready = true; });
    setTimeout(async () => {
      engine.stopRenderLoop();
      try {
        const eff = mat.getEffect();
        if (eff && M.isWebGPU) {
          M.wgsl = { vertex: eff.vertexSourceCode, fragment: eff.fragmentSourceCode };
          const ad = await navigator.gpu.requestAdapter(); const dev = await ad.requestDevice();
          for (const [stage, code] of [['vertex', eff.vertexSourceCode], ['fragment', eff.fragmentSourceCode]]) {
            const mod = dev.createShaderModule({ code }); const info = await mod.getCompilationInfo();
            M.compile.push({ stage, messages: info.messages.map((m) => `${m.type} ${m.lineNum}:${m.linePos} ${m.message}`) });
          }
        }
      } catch (e) { M.errors.push('post: ' + String((e && e.message) || e).slice(0, 300)); }
      M.done = true;
    }, secs * 1000);
  } catch (e) { M.error = String((e && e.message) || e).slice(0, 400); M.done = true; }
})();
