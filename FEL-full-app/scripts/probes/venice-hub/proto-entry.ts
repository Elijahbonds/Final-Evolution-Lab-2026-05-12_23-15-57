// VENICE HUB prototype probe bundle (lane/venice-hub, 2026-11-12): the dev prototype scene (lib/adventure/venice/protoScene.ts)
// on a bare canvas, no React / Next, so the probe can shoot it and count what it draws. Bundled by ./proto-shot.mts.
//   ?tier=mobile|desktop  ?kit=0 (placeholders only)
import { Engine } from '@babylonjs/core';
import { buildVeniceProto } from '@/lib/adventure/venice/protoScene';

const W = window as unknown as Record<string, unknown>;
const q = new URLSearchParams(window.location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const tier = q.get('tier') === 'mobile' ? 'mobile' : 'desktop';
if (tier === 'mobile') engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 2));
const h = buildVeniceProto(engine, { tier, kit: q.get('kit') !== '0' });
W.__VH = h;
h.ready.then(() => { W.__ready = true; }, (e) => { W.__err = String(e); });
engine.runRenderLoop(() => h.scene.render());
window.addEventListener('resize', () => engine.resize());
