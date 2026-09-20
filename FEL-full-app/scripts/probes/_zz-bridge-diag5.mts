import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = 'http://127.0.0.1:3098';
const MODE = process.env.MODE ?? 'onevone';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
await p.goto(`${BASE}/dev/mode/${MODE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.${MODE} && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
await p.waitForTimeout(1500);
const ev = (c: string) => p.evaluate(c).catch((e) => 'ERR ' + String(e).slice(0, 80));
await ev(`window.__FEL_DEV__.scene.metadata.${MODE}.offense()`);
await p.waitForTimeout(700);
console.log('events:', await ev(`JSON.stringify((window.__NEXUS_AGENT__.events || []).filter((e) => e.kind === 'lifecycle').map((e) => e.message))`));
if (MODE === 'threevthree') console.log('identity:', await ev(`(() => { const k = window.__FEL_DEV__.scene.metadata.threevthree.kinetic(); const h = window.__NEXUS_AGENT__.host; return JSON.stringify({ ctlIsHost: k.ctl === h.control, slotIsCtl: k.slotSrc === k.ctl, slotIsHost: k.slotSrc === h.control, ctlNull: k.ctl === null }); })()`));
const run = ev(`window.__NEXUS_AGENT__.do('turbo', { x: 0, y: 1, ms: 1500 })`);
for (let i = 0; i < 4; i++) {
  await p.waitForTimeout(250);
  console.log(`  ${MODE} t${(i + 1) * 250}`, await ev(`(() => { const d = window.__FEL_DEV__.scene.metadata.${MODE}; const k = d.kinetic(); return JSON.stringify({ sp: +k.meSpeed.toFixed(2), busy: window.__NEXUS_AGENT__.host.control.busy }); })()`));
}
await run;
await b.close();
