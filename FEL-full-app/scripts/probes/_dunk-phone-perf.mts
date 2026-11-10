// dunk-flagship Phase 10: the phone-profile frame time — the plan's "≤ baseline (the esbuild rig's phone profile: 390×844, DPR 3, 4× CPU,
// tier=mobile)". The dunk rig's pages (PAGES, e.g. base,cur10,base,cur10 — interleaved, so the shared machine's load falls on both) are
// each booted unthrottled and started (A on a fake pad); then the CPU is throttled (CDP, ×THROTTLE) and, while the dunker runs the
// runway (the stick forward, RUN held), every frame's WORK is timed — scene.onBeforeRender to onAfterRender on the page's own clock:
// what the frame costs the main thread, not the display's pace (SwiftShader's pixels are drawn by the GPU process, which the CDP
// throttle does not slow). One JSON row per page run: median and p95 work (ms), frames; then the medians per page.
//   BASE=http://127.0.0.1:3611 PAGES=base,cur10,base,cur10 FRAMES=40 THROTTLE=4 OUT=<file.jsonl> npx tsx scripts/probes/_dunk-phone-perf.mts
//   HWSCALE=<n> (optional) draws the canvas coarser: the same draw calls and the same main-thread work, fewer SwiftShader pixels.
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3611';
const PAGES = (process.env.PAGES ?? process.env.PAGE ?? 'base,cur10,base,cur10').split(',').map((s) => s.trim()).filter(Boolean);
const FRAMES = Number(process.env.FRAMES ?? 40), THROTTLE = Number(process.env.THROTTLE ?? 4), HWSCALE = Number(process.env.HWSCALE ?? 0);
const FRAME_BUDGET_MS = Number(process.env.FRAME_BUDGET_MS ?? 120000);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
type Row = { page: string; frames: number; workP50: number; workP95: number; workMean: number; throttle: number; dpr: number; hwscale: number; at: string };
const rows: Row[] = [];
for (const PAGE of PAGES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(`(() => { const btn = () => ({ pressed: false, touched: false, value: 0 });
    const pad = { index: 0, id: 'fake-pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, btn) };
    window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null]; })();`);
  const p = await ctx.newPage();
  try {
    await p.goto(`${BASE}/${PAGE}.html?mode=dunk&tier=mobile&perf=off&agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 240000, polling: 500 });
    if (HWSCALE > 0) await p.evaluate((s: number) => { (window as unknown as { __FEL_DEV__: { scene: { getEngine(): { setHardwareScalingLevel(n: number): void } } } }).__FEL_DEV__.scene.getEngine().setHardwareScalingLevel(s); }, HWSCALE);
    // START: A on the pad (the dev runner's READY gate), then the 3-2-1
    const press = (i: number, on: boolean) => p.evaluate(([i, on]) => { const w = window as unknown as { __PAD: { buttons: { pressed: boolean; value: number }[]; timestamp: number } }; w.__PAD.buttons[i as number].pressed = on as boolean; w.__PAD.buttons[i as number].value = on ? 1 : 0; w.__PAD.timestamp = performance.now(); }, [i, on] as const);
    await press(0, true); await p.waitForTimeout(120); await press(0, false);
    await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 120000, polling: 500 });
    await p.waitForTimeout(2000);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    // the runway: the stick forward and RUN held (the run-up's streaming, the crowd and the camera are what a phone pays for)
    await p.evaluate(() => { const w = window as unknown as { __PAD: { axes: number[]; buttons: { pressed: boolean; value: number }[]; timestamp: number } }; w.__PAD.axes[1] = -1; w.__PAD.buttons[7].pressed = true; w.__PAD.buttons[7].value = 1; w.__PAD.timestamp = performance.now(); });
    const work = await p.evaluate(([n, budget]) => new Promise<number[]>((done) => {
      const sc = (window as unknown as { __FEL_DEV__: { scene: { onBeforeRenderObservable: { add(f: () => void): unknown; remove(o: unknown): void }; onAfterRenderObservable: { add(f: () => void): unknown; remove(o: unknown): void } } } }).__FEL_DEV__.scene;
      const out: number[] = []; let t = 0, ended = false; const t0 = performance.now();
      const end = () => { if (ended) return; ended = true; sc.onBeforeRenderObservable.remove(a); sc.onAfterRenderObservable.remove(z); done(out); };
      const a = sc.onBeforeRenderObservable.add(() => { t = performance.now(); });
      const z = sc.onAfterRenderObservable.add(() => { out.push(performance.now() - t); if (out.length >= n || performance.now() - t0 > budget) end(); });
      setTimeout(end, budget + 5000);
    }), [FRAMES, FRAME_BUDGET_MS] as const);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const s = [...work].sort((x, y) => x - y), q = (k: number) => s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * k))] * 10) / 10 : NaN;
    const row: Row = { page: PAGE, frames: work.length, workP50: q(0.5), workP95: q(0.95), workMean: Math.round(work.reduce((x, y) => x + y, 0) / Math.max(1, work.length) * 10) / 10, throttle: THROTTLE, dpr: 3, hwscale: HWSCALE, at: new Date().toISOString() };
    rows.push(row); console.log(JSON.stringify(row));
    if (process.env.OUT) fs.appendFileSync(process.env.OUT, JSON.stringify(row) + '\n');
  } catch (e) { console.log(JSON.stringify({ page: PAGE, err: String(e).slice(0, 200) })); }
  await ctx.close();
}
await b.close();
const by: Record<string, number[]> = {};
for (const r of rows) (by[r.page] ??= []).push(r.workP50);
console.log('[perf] median frame work (ms) per page run: ' + Object.entries(by).map(([k, v]) => `${k} ${v.join(' / ')}`).join(' · '));
