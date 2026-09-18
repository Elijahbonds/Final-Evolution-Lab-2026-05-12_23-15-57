// ANIM-RESIDUAL (2026-09-14) — boot a mode on /dev/mode, then run an in-page snippet file on a schedule and print what it
// returns. For one-off rig measurements (a bone in a prop's frame, a layer on/off) without writing a whole probe.
// Usage: npx tsx scripts/probes/_anim-residual-eval.mts <port> <mode> <snippet.js> [outdir]
//   the snippet is the BODY of `async (dev, pad, step) => { ... }`; `pad(x, y, a)` drives the fake pad, `step` counts
//   calls. It is called every 500 ms until it returns { done: true, ... }. Return values are printed as JSON.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const [PORT = '3061', MODE = 'skateboard', SNIP = '', OUT = '/tmp/anim-residual-eval'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const body = fs.readFileSync(SNIP, 'utf8');

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
    (window as any).__pad = (x: number, y: number, a?: boolean, btn = 0) => { pad.axes[0] = x; pad.axes[1] = y; if (a !== undefined) pad.buttons[btn] = { pressed: a, touched: a, value: a ? 1 : 0 }; pad.timestamp = Date.now(); };
  });
  p.on('console', (m) => { const s = m.text(); if (/REFUSED|MISSING|PAGEERROR|\[EVAL\]|SKATE-(MANUAL|LAND)|Error/.test(s)) console.log('CON', s.slice(0, 300)); });
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  for (let i = 0; i < 200; i++) {
    const ok = await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero?.() && /playing/i.test(document.body.innerText)).catch(() => false);
    if (ok) break;
    await p.keyboard.press('Space').catch(() => {});
    await p.evaluate(() => { (window as any).__pad(0, 0, true); });
    await p.waitForTimeout(100);
    await p.evaluate(() => { (window as any).__pad(0, 0, false); });
    await p.waitForTimeout(700);
  }
  for (let step = 0; step < 400; step++) {
    const r = await p.evaluate(async ([src, s]) => {
      const w = window as any;
      const fn = new Function('dev', 'pad', 'step', `return (async () => { ${src} })();`);
      try { return await fn(w.__FEL_DEV__, w.__pad, s); } catch (e) { return { err: String(e), done: true }; }
    }, [body, step] as [string, number]);
    if (r !== undefined && r !== null) console.log(JSON.stringify(r));
    if (r?.shot) await p.screenshot({ path: `${OUT}/${r.shot}.png` });
    if (r?.done) break;
    await p.waitForTimeout(r?.wait ?? 500);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
