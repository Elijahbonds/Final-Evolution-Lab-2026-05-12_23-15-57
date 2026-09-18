// _drawcount-diag — what the engine's draw-call PerfCounter actually holds over two seconds (MODE=…)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000);
console.log(await p.evaluate(`(async () => { const s = window.__FEL_DEV__?.scene; const e = s.getEngine(); const dc = e._drawCalls; const snap = () => ({ current: dc?.current, total: dc?.total, lastSecAverage: dc?.lastSecAverage, average: dc?.average, min: dc?.min, max: dc?.max, count: dc?.count });
  const a = snap(); await new Promise(r => setTimeout(r, 2000)); const b2 = snap();
  // two consecutive frames
  let f1 = null, f2 = null; await new Promise(r => { let n = 0; const o = s.onAfterRenderObservable.add(() => { n++; if (n === 1) f1 = snap(); if (n === 2) { f2 = snap(); s.onAfterRenderObservable.remove(o); r(); } }); });
  return JSON.stringify({ hasCounter: !!dc, keys: dc ? Object.keys(dc) : null, a, b2, f1, f2, active: s.getActiveMeshes().length, fps: e.getFps().toFixed(0) }); })()`));
await b.close();
