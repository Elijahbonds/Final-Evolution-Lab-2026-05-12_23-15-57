// MIRROR-COACH P9 (2026-09-30) — the skeleton-only view, in a real browser.
//
// The one engineering risk of the skeleton view: the camera <video> stays mounted as the pose model's frame source and
// is hidden at opacity 0 (lib/mirror/skeletonView.ts). If a hidden video stopped decoding, the pose read would stop with
// it. This probe renders the REAL components/mirror/skeleton-view.tsx (CameraImage + SkeletonToggle, bundled from the
// worktree with esbuild; the handful of Tailwind utility classes they use are inlined with Tailwind's own definitions)
// over Chromium's fake camera, and measures, for the camera view and the skeleton view:
//   · the video delivers frames: readyState ≥ 2, currentTime advancing, and a canvas drawImage of it changes frame to
//     frame (the fake camera's pattern moves) — what MediaPipe's detectForVideo needs;
//   · what the STAGE paints: the screenshot pixels of the stage, where the skeleton view must show the dark stage only.
// Headless Chromium only — iOS Safari's display:none behaviour (the reason for opacity, not display:none) is not
// measured here. Writes p9/feedback-cues/probe/{result.json, camera.png, skeleton.png}.
//
// Run (heavy lock held): node node_modules/tsx/dist/cli.mjs scripts/probes/_p9-skeleton-view-probe.mts
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromiumExe } from './_chromium.mts';

const OUT = path.join(os.homedir(), 'Claude/outbox/finish-release/painfree/p9/feedback-cues/probe');
fs.mkdirSync(OUT, { recursive: true });
const root = process.cwd();

const entry = `
import { createElement, useRef, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraImage, SkeletonToggle } from '@/components/mirror/skeleton-view';
function Stage() {
  const ref = useRef(null);
  const [skeletonOnly, setSkeletonOnly] = useState(new URLSearchParams(location.search).get('skeleton') === '1');
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }).then((s) => {
      ref.current.srcObject = s; return ref.current.play();
    }).then(() => { window.__playing = true; }).catch((e) => { window.__err = String(e); });
  }, []);
  window.__toggle = () => setSkeletonOnly((v) => !v);
  return createElement('div', { id: 'stage', style: { position: 'relative', width: 480, height: 360, background: '#000', overflow: 'hidden' } },
    createElement(CameraImage, { ref, skeletonOnly }),
    // a stand-in for the skeleton canvas: a white stick figure, drawn on top in both views
    createElement('svg', { width: 480, height: 360, style: { position: 'absolute', inset: 0 } },
      createElement('line', { x1: 240, y1: 80, x2: 240, y2: 220, stroke: '#fff', strokeWidth: 3 }),
      createElement('line', { x1: 240, y1: 220, x2: 200, y2: 320, stroke: '#fff', strokeWidth: 3 }),
      createElement('line', { x1: 240, y1: 220, x2: 280, y2: 320, stroke: '#fff', strokeWidth: 3 })),
    createElement('div', { style: { position: 'absolute', right: 8, bottom: 8 } },
      createElement(SkeletonToggle, { skeletonOnly, onToggle: () => setSkeletonOnly((v) => !v) })));
}
createRoot(document.getElementById('root')).render(createElement(Stage));
`;

const bundled = await build({
  stdin: { contents: entry, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser',
  alias: { '@': root }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'error',
});
// Tailwind's definitions of the utility classes CameraImage and SkeletonToggle use (v3)
const CSS = `
.absolute{position:absolute}.inset-0{inset:0}.h-full{height:100%}.w-full{width:100%}.object-cover{object-fit:cover}
.opacity-0{opacity:0}.opacity-100{opacity:1}.transition-opacity{transition-property:opacity;transition-timing-function:cubic-bezier(.4,0,.2,1)}
.duration-200{transition-duration:.2s}.grid{display:grid}.h-12{height:3rem}.w-12{width:3rem}.h-5{height:1.25rem}.w-5{width:1.25rem}
.place-items-center{place-items:center}.rounded-2xl{border-radius:1rem}.border{border-width:1px;border-style:solid}
`;
const html = `<!doctype html><html><head><style>body{margin:0;background:#050505}${CSS}</style></head><body><div id="root"></div>
<script>${bundled.outputFiles[0].text}</script></body></html>`;
const pagePath = path.join(OUT, 'stage.html');
fs.writeFileSync(pagePath, html);

const browser = await chromium.launch({
  headless: true, executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const result: Record<string, unknown> = { browser: browser.version(), measuredAt: new Date().toISOString() };
try {
  for (const view of ['camera', 'skeleton'] as const) {
    const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`file://${pagePath}${view === 'skeleton' ? '?skeleton=1' : ''}`);
    await page.waitForFunction('window.__playing || window.__err', null, { timeout: 15_000 });
    await page.waitForTimeout(800);
    const frames = await page.evaluate(`(async () => {
      const v = document.querySelector('video');
      const c = document.createElement('canvas'); c.width = 64; c.height = 48;
      const g = c.getContext('2d', { willReadFrequently: true });
      const grab = () => { g.drawImage(v, 0, 0, 64, 48); return Array.from(g.getImageData(0, 0, 64, 48).data); };
      const t0 = v.currentTime; const a = grab();
      await new Promise((r) => setTimeout(r, 600));
      const t1 = v.currentTime; const b = grab();
      let diff = 0; for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      const cs = getComputedStyle(v);
      return {
        readyState: v.readyState, videoWidth: v.videoWidth, videoHeight: v.videoHeight, currentTimeAdvancedSec: +(t1 - t0).toFixed(3),
        frameDiffSum: diff, opacity: cs.opacity, display: cs.display, ariaHidden: v.getAttribute('aria-hidden'),
        dataCameraImage: v.getAttribute('data-camera-image'), videosInDom: document.querySelectorAll('video').length,
        togglePressed: document.querySelector('[data-skeleton-toggle]')?.getAttribute('aria-pressed'),
      };
    })()`) as Record<string, unknown>;
    const shot = await page.locator('#stage').screenshot({ path: path.join(OUT, `${view}.png`) });
    // what the stage paints, away from the stick figure and the switch: the top-left quarter
    const painted = await page.evaluate(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${shot.toString('base64')}'; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, Math.floor(img.width / 2) - 20, Math.floor(img.height / 2) - 20).data;
      let lit = 0, sum = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2]; sum += l; if (l > 60) lit++; }
      return { meanLuma: +(sum / (d.length / 4) / 3).toFixed(1), litShare: +(lit / (d.length / 4)).toFixed(3) };
    })()`);
    result[view] = { ...frames, stagePixels: painted, errors, pageError: await page.evaluate('window.__err ?? null') };
    await page.close();
  }
} finally {
  await browser.close();
}
const cam = result.camera as any, sk = result.skeleton as any;
result.pass = {
  skeletonVideoStillDecodes: sk.readyState >= 2 && sk.currentTimeAdvancedSec > 0.3 && sk.frameDiffSum > 0,
  skeletonPaintsNoCameraImage: sk.opacity === '0' && sk.stagePixels.litShare < 0.01,
  cameraViewPaintsTheCamera: cam.opacity === '1' && cam.stagePixels.litShare > 0.2,
  oneVideoElementEachView: cam.videosInDom === 1 && sk.videosInDom === 1,
  noErrors: !cam.errors.length && !sk.errors.length,
};
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (Object.values(result.pass as Record<string, boolean>).some((v) => !v)) process.exitCode = 1;
