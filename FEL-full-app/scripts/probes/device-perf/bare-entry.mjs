// device-perf control (2026-11-12): is the WebGPU device loss on this box the app's doing, or the box's? A bare Babylon WebGPU scene,
// no app code at all: an engine, a camera, a light, a box (StandardMaterial) and a sphere (PBRMaterial), rendering for ?s= seconds.
//   ?tex=none|png|canvas   no texture / an image file (copyExternalImageToTexture from an ImageBitmap) / a 2D canvas (DynamicTexture)
// Publishes window.__bare = { engine, frames, lost, error, done }.
import { WebGPUEngine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, StandardMaterial, PBRMaterial, Texture, DynamicTexture, Vector3, Color3 } from '@babylonjs/core';

const W = window;
const B = (W.__bare = { engine: '', frames: 0, lost: false, error: null, done: false });
(async () => {
  const q = new URLSearchParams(location.search);
  const tex = q.get('tex') ?? 'none';
  const secs = Number(q.get('s') ?? 8);
  try {
    const canvas = document.getElementById('c');
    const engine = new WebGPUEngine(canvas, { adaptToDeviceRatio: true, antialias: true });
    await engine.initAsync();
    B.engine = engine.description;
    engine.onContextLostObservable.add(() => { B.lost = true; });
    const scene = new Scene(engine);
    const cam = new ArcRotateCamera('c', 0.6, 1.1, 6, Vector3.Zero(), scene);
    void cam;
    new HemisphericLight('h', new Vector3(0, 1, 0), scene);
    const box = MeshBuilder.CreateBox('b', { size: 1.5 }, scene);
    const sm = new StandardMaterial('s', scene);
    sm.diffuseColor = new Color3(0.2, 0.7, 0.9);
    if (tex === 'png') sm.diffuseTexture = new Texture('/brand/badge-source.png', scene);
    if (tex === 'canvas') {
      const dt = new DynamicTexture('d', { width: 256, height: 256 }, scene);
      const ctx = dt.getContext();
      ctx.fillStyle = '#e33'; ctx.fillRect(0, 0, 256, 256); ctx.fillStyle = '#fff'; ctx.fillRect(64, 64, 128, 128);
      dt.update();
      sm.diffuseTexture = dt;
    }
    box.material = sm;
    const sp = MeshBuilder.CreateSphere('p', { diameter: 1.2 }, scene);
    sp.position.x = 2;
    const pm = new PBRMaterial('pbr', scene);
    pm.albedoColor = new Color3(0.9, 0.5, 0.2); pm.metallic = 0.2; pm.roughness = 0.5;
    sp.material = pm;
    engine.runRenderLoop(() => { scene.render(); B.frames++; });
    setTimeout(() => { engine.stopRenderLoop(); B.done = true; }, secs * 1000);
  } catch (e) { B.error = String((e && e.message) || e); B.done = true; }
})();
