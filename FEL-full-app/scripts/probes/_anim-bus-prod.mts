// SHARED-ANIM-BUS (2026-09-14) — the production readout, on `next start`: /try mounts the dunk mode with no auth, so
// `__FEL_DEV__.anim()` must answer there with the scope, zero out-of-scope clips and the hero's arms verdict.
// Usage: npx tsx scripts/probes/_anim-bus-prod.mts <port>
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const PORT = process.argv[2] ?? '3093';
const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/FEL-ANIM/.test(t)) logs.push(t.slice(0, 220)); });
await p.goto(`http://127.0.0.1:${PORT}/try`, { waitUntil: 'domcontentloaded', timeout: 180000 });
let r: any = null;
for (let i = 0; i < 90; i++) {
  r = await p.evaluate(() => { const d = (window as any).__FEL_DEV__; return d ? { keys: Object.keys(d), hasScene: 'scene' in d, anim: d.anim ? d.anim() : null } : null; });
  if (r?.anim?.hero?.arms) break;
  await p.waitForTimeout(1000);
}
console.log(JSON.stringify({ handle: r && { keys: r.keys, hasScene: r.hasScene }, modeId: r?.anim?.modeId, suites: r?.anim?.suites, registered: r?.anim?.registered?.length, outOfScope: r?.anim?.outOfScope, refused: r?.anim?.refused, hero: r?.anim?.hero && { playing: r.anim.hero.playing, window: r.anim.hero.window, arms: r.anim.hero.arms }, log: logs.find((l) => /registered/.test(l)) }, null, 1));
await browser.close();
