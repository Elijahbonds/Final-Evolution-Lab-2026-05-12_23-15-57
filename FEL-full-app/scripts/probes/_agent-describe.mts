// _agent-describe — ask a mode's agent bridge what verbs it admits to having.
//
// Written mid-pass when the 1v1 lab could reach everything EXCEPT the block, to find out whether the verb was missing
// from the bridge or missing from the mode. describe().actions said 'guard' (the karate stance) and no block at all,
// which is what pointed at PlayerSlot.Intent — the block was the one defensive verb not on the slot. The bridge has a
// 'block' and a 'contest' now; this stays because "what can a driver actually ask for" is the first question of any
// mode's instrumentation.
//
//   BASE=http://127.0.0.1:3098 MODE=onevone npx tsx scripts/probes/_agent-describe.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const MODE = process.env.MODE ?? 'onevone';
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT','1'); } catch {}" });
const page = await ctx.newPage();
{ const lp = await ctx.newPage(); await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  if (!await lp.evaluate(`fetch('/api/auth/session').then(r=>r.json()).then(j=>!!(j&&j.user)).catch(()=>false)`)) {
    await lp.waitForSelector('button[type="submit"]', { timeout: 120000 }); await lp.waitForTimeout(800);
    await lp.fill('input[type="email"]','playtest@fel.local'); await lp.fill('input[type="password"]','playtest-local-only');
    await Promise.all([lp.waitForResponse((r)=>/api\/auth\/(callback|signin)/.test(r.url()),{timeout:60000}).catch(()=>null), lp.click('button[type="submit"]')]);
    const t=Date.now(); while (Date.now()-t<45000) { if (await lp.evaluate(`fetch('/api/auth/session').then(r=>r.json()).then(j=>!!(j&&j.user)).catch(()=>false)`)) break; await lp.waitForTimeout(400);} }
  await lp.close(); }
await page.goto(`${BASE}/play/${MODE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
{ const t=Date.now(); while (Date.now()-t<300000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(()=>''); if (s==='loaded'||s==='playing') break; await page.waitForTimeout(500);} }
await page.waitForTimeout(2000);
console.log(JSON.stringify(await page.evaluate(`(() => { const a = window.__NEXUS_AGENT__; return a && a.describe ? a.describe() : 'no describe'; })()`), null, 1).slice(0, 1800));
await browser.close();
