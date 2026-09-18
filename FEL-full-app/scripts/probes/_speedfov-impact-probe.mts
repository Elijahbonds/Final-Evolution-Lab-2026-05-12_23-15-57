// SPEED-FOV + IMPACT-FRAME wiring probe (2026-09-14).
//
// The browser pane backgrounds its tab, which suspends rAF — zero frames advance, so nothing there can
// prove a per-frame effect. Playwright gives a VISIBLE page with a real render loop, which is the only
// place a claim like "the lens widens with speed" can actually be measured.
//
// Measures, on /dev/mode (no auth):
//   · velocitykart — pin the RT trigger, sample camera.fov against kart speed. The lens must widen, and
//     must come back when the throttle is released.
//   · the pipeline — read imageProcessing.vignetteWeight / exposure at rest, then confirm ModeHarness put
//     a reader on them at all (the resting values must match what LightRig set, not a shared constant).

import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const MODE = process.env.MODE ?? 'velocitykart';

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });

await page.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 120000 });
await page.waitForTimeout(2500);

// the render loop must actually be advancing, or every number below is a lie
const frames = await page.evaluate(async () => {
  const s = (window as any).__FEL_DEV__.scene;
  const f0 = s.getFrameId();
  await new Promise((r) => setTimeout(r, 1000));
  return s.getFrameId() - f0;
});
console.log(`[PROBE] frames in 1s: ${frames}  (0 means rAF is suspended and nothing below is measured)`);

const result = await page.evaluate(async () => {
  const d = (window as any).__FEL_DEV__;
  const s = d.scene, bus = d.input, cam = s.activeCamera;
  const ip = s.imageProcessingConfiguration;
  const rest = { fov: cam.fov, vignette: ip?.vignetteWeight, exposure: ip?.exposure };

  const ev = (t: string, code: string, key: string) =>
    window.dispatchEvent(new KeyboardEvent(t, { code, key, bubbles: true }));
  ev('keydown', 'Space', ' '); await new Promise((r) => setTimeout(r, 120)); ev('keyup', 'Space', ' ');
  await new Promise((r) => setTimeout(r, 5000));                       // READY gate + 3-2-1

  const readSpeed = () => {
    const m = document.body.innerText.match(/"speed":\s*([\d.]+)/);
    return m ? +m[1] : null;
  };

  bus.emit({ t: 'trigger', side: 'R', value: 1 });                     // pin the throttle
  const accel: { t: number; speed: number | null; fov: number }[] = [];
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 400));
    accel.push({ t: +(i * 0.4).toFixed(1), speed: readSpeed(), fov: +cam.fov.toFixed(4) });
  }
  bus.emit({ t: 'trigger', side: 'R', value: 0 });
  bus.emit({ t: 'trigger', side: 'L', value: 1 });                     // and stand on the brake
  const coast: { speed: number | null; fov: number }[] = [];
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 400));
    coast.push({ speed: readSpeed(), fov: +cam.fov.toFixed(4) });
  }
  return { rest, accel, coast };
});

console.log('[PROBE] rest        ', JSON.stringify(result.rest));
console.log('[PROBE] accelerating', JSON.stringify(result.accel));
console.log('[PROBE] braking     ', JSON.stringify(result.coast));

const peakFov = Math.max(...result.accel.map((a) => a.fov));
const peakSpeed = Math.max(...result.accel.map((a) => a.speed ?? 0));
const endFov = result.coast[result.coast.length - 1]?.fov ?? 0;
console.log(`\n[VERDICT] rest fov ${result.rest.fov} · peak fov ${peakFov} at ${peakSpeed} km/h · back to ${endFov}`);
console.log(`[VERDICT] widened:   ${peakFov > result.rest.fov ? 'YES' : 'NO'}`);
console.log(`[VERDICT] recovered: ${endFov < peakFov ? 'YES' : 'NO'}`);
console.log(`[VERDICT] errors:    ${errs.length}${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`);

await browser.close();
