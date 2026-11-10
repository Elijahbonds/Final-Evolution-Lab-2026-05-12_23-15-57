// dunk-flagship Phase 10: the dunk host's layout shift at 390×844 — the plan's "renders through the design system's tokens with no layout
// shift". Builds the host page (scripts/probes/_dunk-host-entry.tsx through scripts/a11y/rig.mts: the app's Tailwind, theme and fonts the
// way production loads them), served from the dunk rig's static server (the GLBs at the site root); boots it on a phone viewport, plays
// one dunk on a fake pad, and sums the layout shifts.
//   BUILD_ONLY=1 SITE=<rig/site> npx tsx scripts/probes/_dunk-host-cls.mts         (build into <site>/host10; HOST_NAME=<dir> for another build)
//   BASE=http://127.0.0.1:3611 OUT=<dir> npx tsx scripts/probes/_dunk-host-cls.mts   (measure)
// Reports the shifts in three parts: the READY card while the arena loads (components/games/boot-splash.tsx, every mode's), the
// start (the card goes, the HUD mounts), and PLAY (the dunk host's own HUD: the run-up, a slam, the judges) — the sum of each, its
// worst 5-second window (the Web Vitals session window), and every shift over 0.001 with what moved and from where to where.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
if (process.env.BUILD_ONLY === '1') {
  const { buildRig } = await import('../a11y/rig.mts');
  const site = process.env.SITE!; const out = path.join(site, process.env.HOST_NAME ?? 'host10');
  fs.mkdirSync(path.join(site, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'app/fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(ROOT, 'app/fonts', f), path.join(site, 'fonts', f));
  await buildRig(out, { entry: path.join(ROOT, 'scripts/probes/_dunk-host-entry.tsx'), fontBase: '/fonts', prodFonts: true, external: ['@mediapipe/tasks-vision'] });
  console.log('[host] built', out);
  process.exit(0);
}
const BASE = process.env.BASE ?? 'http://127.0.0.1:3611', OUT = process.env.OUT ?? '.';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
// a fake pad (the dunk rig's own shape): window.__PAD, read through navigator.getGamepads
await ctx.addInitScript(`(() => { const btn = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { index: 0, id: 'fake-pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, btn) };
  window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null];
  window.addEventListener('load', () => { try { window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad })); } catch {} }); })();`);
const p = await ctx.newPage();
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
const t0 = Date.now(); const at = () => `${Math.round((Date.now() - t0) / 1000)} s`;
await p.goto(`${BASE}/${process.env.HOST_NAME ?? 'host10'}/index.html?agent=1&tier=mobile&perf=off`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('canvas', { timeout: 240000 });
const shot = async (name: string) => p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 70 });
const now = () => p.evaluate(() => Math.round(performance.now()));
// the READY card: wait for the arena to load (the card's own button), let it settle, photograph it
await p.waitForFunction(() => document.body.innerText.includes('TAP TO START'), null, { timeout: 240000, polling: 500 });
await p.waitForTimeout(3000); await shot('1-ready'); const tReady = await now(); console.log('[host] ready', at());
// the pixels do not matter here, the layout does: draw the 3D canvas coarse so the game runs near its real pace on SwiftShader
await p.evaluate(() => { const e = (window as unknown as { __FEL_DEV__?: { scene: { getEngine(): { setHardwareScalingLevel(n: number): void } } } }).__FEL_DEV__?.scene.getEngine(); e?.setHardwareScalingLevel(6); });
const set = (i: number, on: boolean) => p.evaluate(([i, on]) => { const w = window as unknown as { __PAD: { buttons: { pressed: boolean; value: number }[]; timestamp: number } }; w.__PAD.buttons[i as number].pressed = on as boolean; w.__PAD.buttons[i as number].value = on ? 1 : 0; w.__PAD.timestamp = performance.now(); }, [i, on] as const);
const tap = async (i: number, ms = 90) => { await set(i, true); await p.waitForTimeout(ms); await set(i, false); };
// START on the pad (any button), then the 3-2-1; PLAY begins when the host's HUD is up
await tap(0); const tStart = await now();
await p.waitForFunction(() => !!document.querySelector('[data-dunk-bottom]'), null, { timeout: 60000, polling: 250 }).catch(() => {});
await p.waitForTimeout(1500); const tPlay = await now(); await shot('2-runway'); console.log('[host] playing', at());
// one dunk: hold RUN (RT) with the stick forward to the automatic take-off, SLAM through the window; then the judges and the next runway
await p.waitForTimeout(4000);   // the runway's hints cycle
await p.evaluate(() => { (window as unknown as { __PAD: { axes: number[] } }).__PAD.axes[1] = -1; });
await set(7, true); await p.waitForTimeout(5000);
await set(7, false); await p.evaluate(() => { (window as unknown as { __PAD: { axes: number[] } }).__PAD.axes[1] = 0; });
for (let k = 0; k < 14; k++) { await tap(0, 80); await p.waitForTimeout(170); }
await shot('3-flight'); console.log('[host] dunk thrown', at());
await p.waitForTimeout(22000); await shot('4-show'); console.log('[host] after the show', at());
type Shift = { v: number; t: number; input: boolean; src: string[]; rects?: string[] };
const cls = await p.evaluate(() => (window as unknown as { __CLS: Shift[] }).__CLS);
const counted = cls.filter((c) => !c.input);
const part = (a: number, b: number) => counted.filter((c) => c.t >= a && c.t < b);
// the worst 5 s session window (Web Vitals' CLS: shifts less than 1 s apart, a window of at most 5 s)
const worstWindow = (xs: Shift[]) => { let best = 0, cur = 0, w0 = -1, last = -1e9; for (const c of [...xs].sort((x, y) => x.t - y.t)) { if (c.t - last > 1000 || c.t - w0 > 5000) { cur = 0; w0 = c.t; } cur += c.v; last = c.t; best = Math.max(best, cur); } return best; };
const sum = (xs: Shift[]) => xs.reduce((a, c) => a + c.v, 0);
const parts = { ready: part(0, tStart), start: part(tStart, tPlay), play: part(tPlay, Infinity) };
const report = Object.fromEntries(Object.entries(parts).map(([k, xs]) => [k, { shifts: xs.length, sum: Number(sum(xs).toFixed(4)), worst5s: Number(worstWindow(xs).toFixed(4)), over001: xs.filter((c) => c.v >= 0.001).length }]));
fs.writeFileSync(path.join(OUT, 'cls.json'), JSON.stringify({ viewport: '390x844', tReady, tStart, tPlay, report, total: sum(counted), shifts: cls, errors }, null, 1));
console.log(`[host] layout shift at 390x844: ${JSON.stringify(report)} · errors ${errors.length}`);
for (const [k, xs] of Object.entries(parts)) for (const c of xs.filter((x) => x.v >= 0.001).sort((a, b) => b.v - a.v).slice(0, 8)) console.log(`   ${k.padEnd(5)} ${c.v.toFixed(4)} @${c.t} ms  ${(c.src[0] ?? '').slice(0, 90)}  [${(c.rects ?? [])[0] ?? ''}]${c.src.length > 1 ? ` +${c.src.length - 1}` : ''}`);
await b.close();
