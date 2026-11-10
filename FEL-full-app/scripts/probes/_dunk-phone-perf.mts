// dunk-flagship Phase 10: the phone-profile frame time — the plan's "≤ baseline (the esbuild rig's phone profile: 390×844, DPR 3, 4× CPU,
// tier=mobile)". One page of the dunk rig (PAGE, e.g. cur10 or base), booted unthrottled; then the CPU is throttled (CDP, ×THROTTLE) and,
// while the dunker runs the runway on a fake pad, every frame's WORK is timed — scene.onBeforeRender to onAfterRender on the page's own
// clock (what the frame costs, not the display's pace). Prints and appends one JSON row: median and p95 work (ms), frames.
//   BASE=http://127.0.0.1:3611 PAGE=cur10 FRAMES=120 THROTTLE=4 OUT=<file.jsonl> npx tsx scripts/probes/_dunk-phone-perf.mts
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3611', PAGE = process.env.PAGE ?? 'cur10';
const FRAMES = Number(process.env.FRAMES ?? 120), THROTTLE = Number(process.env.THROTTLE ?? 4);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(`(() => { const btn = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { index: 0, id: 'fake-pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, btn) };
  window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null]; })();`);
const p = await ctx.newPage();
await p.goto(`${BASE}/${PAGE}.html?mode=dunk&tier=mobile&perf=off&agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 300000, polling: 500 });
await p.waitForTimeout(3000);
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
// the runway: the stick forward and RUN held (the run-up's streaming, the crowd and the camera are what a phone pays for)
await p.evaluate(() => { const w = window as unknown as { __PAD: { axes: number[]; buttons: { pressed: boolean; value: number }[]; timestamp: number } }; w.__PAD.axes[1] = -1; w.__PAD.buttons[7].pressed = true; w.__PAD.buttons[7].value = 1; w.__PAD.timestamp = performance.now(); });
const work = await p.evaluate((n: number) => new Promise<number[]>((done) => {
  const sc = (window as unknown as { __FEL_DEV__: { scene: { onBeforeRenderObservable: { add(f: () => void): unknown; remove(o: unknown): void }; onAfterRenderObservable: { add(f: () => void): unknown; remove(o: unknown): void } } } }).__FEL_DEV__.scene;
  const out: number[] = []; let t = 0;
  const a = sc.onBeforeRenderObservable.add(() => { t = performance.now(); });
  const z = sc.onAfterRenderObservable.add(() => { out.push(performance.now() - t); if (out.length >= n) { sc.onBeforeRenderObservable.remove(a); sc.onAfterRenderObservable.remove(z); done(out); } });
}), FRAMES);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const s = [...work].sort((x, y) => x - y), q = (k: number) => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * k))] * 10) / 10;
const row = { page: PAGE, frames: work.length, workP50: q(0.5), workP95: q(0.95), throttle: THROTTLE, dpr: 3, at: new Date().toISOString() };
console.log(JSON.stringify(row));
if (process.env.OUT) fs.appendFileSync(process.env.OUT, JSON.stringify(row) + '\n');
await b.close();
