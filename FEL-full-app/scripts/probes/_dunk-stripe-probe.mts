// THE STRIPE IS A PLACE, NOT A RUMOUR (2026-09-14).
//
// The free-throw range bonus is worthless if the line cannot be seen, and "I added a mesh" is not evidence
// that anything renders — this codebase has had an invisible floor for two passes (the sky dome was
// smaller than the ground) and an invisible green (a StandardMaterial that was also non-pickable). So this
// probe asks the running scene three things it cannot fake:
//
//   1. does the stripe mesh exist, is it enabled, and is it where the geometry says it should be;
//   2. is it actually IN FRONT of the camera and inside the view — not merely "in the frustum", which is a
//      bounding-sphere test and says nothing about a narrow FOV;
//   3. is its material a PBR one — a StandardMaterial here clips to white under these venues.
//
// Then it screenshots the runway so the line can be looked at.

import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = process.env.OUT ?? 'dunk-stripe.png';

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

await page.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await page.waitForTimeout(6000);

const out = await page.evaluate(`(async () => {
  const s = window.__FEL_DEV__.scene;
  const f0 = s.getFrameId(); await new Promise(r => setTimeout(r, 1000));
  const frames = s.getFrameId() - f0;

  const line = s.getMeshByName('dunk_ft_stripe');
  if (!line) return { frames, found: false };
  const cam = s.activeCamera;
  const p = line.getAbsolutePosition();

  // IN FRONT and ON AXIS. isInFrustum uses the bounding sphere, which a 48 m sphere passes while the mesh
  // itself sits 40 degrees off screen — that exact mistake cost a pass on the surf headland.
  const dir = cam.getTarget().subtract(cam.position); dir.normalize();
  const to = p.subtract(cam.position);
  const dist = to.length(); to.normalize();
  const dot = dir.x * to.x + dir.y * to.y + dir.z * to.z;
  const offAxisDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;

  const mat = line.material;
  const ticks = s.meshes.filter(m => m.name.indexOf('dunk_ft_tick') === 0).length;

  return {
    frames, found: true,
    enabled: line.isEnabled(), visible: line.isVisible,
    pos: { x: +p.x.toFixed(2), y: +p.y.toFixed(3), z: +p.z.toFixed(2) },
    distFromCam: +dist.toFixed(2),
    offAxisDeg: +offAxisDeg.toFixed(1),
    inFrustum: cam.isInFrustum ? cam.isInFrustum(line) : null,
    matClass: mat ? mat.getClassName() : null,
    ticks,
    camPos: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) },
  };
})()`) as Record<string, unknown>;

console.log('[STRIPE]', JSON.stringify(out, null, 2));
await page.screenshot({ path: OUT });
console.log(`[STRIPE] shot -> ${OUT}`);
console.log(`[STRIPE] errors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0, 2).join(' | ') : ''}`);

await browser.close();
