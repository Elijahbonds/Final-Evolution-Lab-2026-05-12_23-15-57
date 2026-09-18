// _block-shot — photograph the CONTEST JUMP.
//
// Owner: "fix the legs when you jump for a block, they shouldn't go in the air." The fix keys the legs in
// `bball_block_reach`; this is the frame that proves it. The player spends most of a 1v1 possession on DEFENCE
// (measured: the AI strips at about two seconds), so getting a block jump on camera needs nothing clever — hold the
// position and tap A, repeatedly, and shoot the frames.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops`;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT','1'); } catch {}" });
const page = await ctx.newPage();
const hits: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/block|BLOCK|JUMPED/.test(t)) hits.push(t.slice(0, 120)); });
{ const lp = await ctx.newPage(); await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (/\/login/.test(lp.url())) { await lp.fill('input[type="email"]','playtest@fel.local'); await lp.fill('input[type="password"]','playtest-local-only'); await lp.click('button[type="submit"]');
    const t=Date.now(); while (Date.now()-t<30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300);} await lp.close(); }
await page.goto(`${BASE}/play/onevone?agent=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
{ const t=Date.now(); while (Date.now()-t<180000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(()=>''); if (s==='loaded'||s==='playing') break; await page.waitForTimeout(400);} }
await page.evaluate(`(() => { const pad = { index:0,id:'fake',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})) };
  window.__PAD = pad; navigator.getGamepads = () => [pad]; window.dispatchEvent(new Event('gamepadconnected'));
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; }; })()`);
const b = page.locator('text=/^(TAP TO START|START|PLAY)$/').first(); if (await b.count()) await b.first().click().catch(()=>{});
await page.waitForTimeout(4000);
let shots = 0;
for (let i = 0; i < 26 && shots < 4; i++) {
  const onD = await page.evaluate(`/^STAY IN FRONT/.test(window.__hudNow().hint || '')`);
  if (onD) {
    await page.evaluate(`(() => { const x = window.__PAD.buttons[0]; x.pressed = true; x.value = 1; window.__PAD.timestamp = Date.now(); })()`);
    await page.waitForTimeout(110);   // mid-jump: the clip is 0.5 s and the reach peaks around 0.25
    await page.screenshot({ path: `${OUT}/block-${++shots}.png` });
    await page.evaluate(`(() => { const x = window.__PAD.buttons[0]; x.pressed = false; x.value = 0; window.__PAD.timestamp = Date.now(); })()`);
  }
  await page.waitForTimeout(900);
}
console.log('shots', shots, '| console:', JSON.stringify(hits.slice(0, 4)));
await browser.close();
