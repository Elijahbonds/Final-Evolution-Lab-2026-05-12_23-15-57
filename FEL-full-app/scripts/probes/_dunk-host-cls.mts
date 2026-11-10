// dunk-flagship Phase 10: the dunk host's layout shift at 390×844 — the plan's "renders through the design system's tokens with no layout
// shift". Builds the host page (scripts/probes/_dunk-host-entry.tsx through scripts/a11y/rig.mts: the app's Tailwind, theme and fonts the
// way production loads them), served from the dunk rig's static server (the GLBs at the site root); boots it on a phone viewport, plays
// one dunk on a fake pad, and sums the layout shifts.
//   BUILD_ONLY=1 SITE=<rig/site> npx tsx scripts/probes/_dunk-host-cls.mts         (build into <site>/host10)
//   BASE=http://127.0.0.1:3611 OUT=<dir> npx tsx scripts/probes/_dunk-host-cls.mts   (measure)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
if (process.env.BUILD_ONLY === '1') {
  const { buildRig } = await import('../a11y/rig.mts');
  const site = process.env.SITE!; const out = path.join(site, 'host10');
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
await p.goto(`${BASE}/host10/index.html?agent=1&tier=mobile`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForSelector('canvas', { timeout: 240000 });
const shot = async (name: string) => p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 70 });
await p.waitForTimeout(25000); await shot('1-runway'); console.log('[host] runway', at());
const set = (i: number, on: boolean) => p.evaluate(([i, on]) => { const w = window as unknown as { __PAD: { buttons: { pressed: boolean; value: number }[]; timestamp: number } }; w.__PAD.buttons[i as number].pressed = on as boolean; w.__PAD.buttons[i as number].value = on ? 1 : 0; w.__PAD.timestamp = performance.now(); }, [i, on] as const);
// one dunk: hold RUN (RT) with the stick forward until the automatic take-off, then SLAM a few times through the window
await p.evaluate(() => { (window as unknown as { __PAD: { axes: number[] } }).__PAD.axes[1] = -1; });
await set(7, true); await p.waitForTimeout(6000);
await set(7, false); await p.evaluate(() => { (window as unknown as { __PAD: { axes: number[] } }).__PAD.axes[1] = 0; });
for (let k = 0; k < 12; k++) { await set(0, true); await p.waitForTimeout(80); await set(0, false); await p.waitForTimeout(220); }
await shot('2-flight'); console.log('[host] dunk thrown', at());
await p.waitForTimeout(20000); await shot('3-show'); console.log('[host] after the show', at());
const cls = await p.evaluate(() => (window as unknown as { __CLS: { v: number; t: number; input: boolean; src: string[] }[] }).__CLS);
const counted = cls.filter((c) => !c.input);
const total = counted.reduce((a, c) => a + c.v, 0);
fs.writeFileSync(path.join(OUT, 'cls.json'), JSON.stringify({ total, shifts: cls, errors }, null, 1));
console.log(`[host] layout shift: ${counted.length} shifts, CLS ${total.toFixed(4)} · errors ${errors.length}`);
for (const c of counted.sort((a, b) => b.v - a.v).slice(0, 8)) console.log(`   ${c.v.toFixed(4)} @${c.t} ms  ${c.src.join(' | ')}`);
await b.close();
