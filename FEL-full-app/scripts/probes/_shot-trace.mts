// _shot-trace — why does the shot meter not start? Ask the mode's own possession machine (dev build only).
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3097';
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT','1'); } catch {}" });
const page = await ctx.newPage();
const pad: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/\[PAD\]|\[1V1-REF\]|SHOOT ON/.test(t)) pad.push(t.slice(0, 130)); });
{ const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await lp.waitForSelector('button[type="submit"]', { timeout: 120000 }); await lp.waitForTimeout(800);
  await lp.fill('input[type="email"]','playtest@fel.local'); await lp.fill('input[type="password"]','playtest-local-only');
  await Promise.all([lp.waitForResponse((r) => /api\/auth\/(callback|signin)/.test(r.url()), { timeout: 60000 }).catch(() => null), lp.click('button[type="submit"]')]);
  const t = Date.now(); while (Date.now() - t < 45000) { if (await lp.evaluate(`fetch('/api/auth/session').then(r=>r.json()).then(j=>!!(j&&j.user)).catch(()=>false)`)) break; await lp.waitForTimeout(400); }
  await lp.close(); }
await page.goto(`${BASE}/play/onevone?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
{ const t = Date.now(); while (Date.now() - t < 300000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(()=>''); if (s === 'loaded' || s === 'playing') break; await page.waitForTimeout(500); } }
await page.evaluate(`(() => { const p = { index:0,id:'fake',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})) };
  window.__PAD = p; navigator.getGamepads = () => [p]; window.dispatchEvent(new Event('gamepadconnected'));
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };
  window.__seam = () => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; return s && s.metadata ? s.metadata.onevone : null; }; })()`);
const b = page.locator('text=/^(TAP TO START|START|PLAY)$/').first(); if (await b.count()) await b.first().click().catch(()=>{});
await page.waitForTimeout(4000);
console.log('seam present:', await page.evaluate(`!!window.__seam()`));
await page.evaluate(`(() => { const s = window.__seam(); if (s && s.offense) s.offense(); })()`);
await page.waitForTimeout(800);
console.log('after seam:', JSON.stringify(await page.evaluate(`(() => { const s = window.__seam(); return { possession: s.possession(), post: s.post() }; })()`)).slice(0, 300));
// DOES INTENT REACH THE MODE AT ALL? post() reports `brace` straight off meSlot.intent, so the L trigger is a probe
// into the very thing the shot gate reads.
await page.evaluate(`(() => { const x = window.__PAD.buttons[6]; x.pressed = true; x.value = 1; window.__PAD.timestamp = Date.now(); })()`);
await page.waitForTimeout(500);
console.log('L-trigger held -> brace:', await page.evaluate(`window.__seam().post().brace`));
await page.evaluate(`(() => { const x = window.__PAD.buttons[6]; x.pressed = false; x.value = 0; window.__PAD.timestamp = Date.now(); })()`);
await page.waitForTimeout(300);
// squeeze the trigger and watch
await page.evaluate(`(() => { const x = window.__PAD.buttons[7]; x.pressed = true; x.value = 1; window.__PAD.timestamp = Date.now(); })()`);
for (let i = 0; i < 6; i++) {
  const st = await page.evaluate(`(() => { const s = window.__seam(); const h = window.__hudNow(); const p = s.post();
    return { meter: h.shotMeterT, type: h.shotType, carrying: p.carrying, shooting: p.shooting, possession: s.possession() }; })()`);
  console.log(' t+' + (i*250) + 'ms', JSON.stringify(st));
  await page.waitForTimeout(250);
}
await page.evaluate(`(() => { const x = window.__PAD.buttons[7]; x.pressed = false; x.value = 0; window.__PAD.timestamp = Date.now(); })()`);
console.log('pad/ref console:', JSON.stringify(pad.slice(0, 4)));
await browser.close();
