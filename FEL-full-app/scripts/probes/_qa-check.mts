import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
{ const lp = await ctx.newPage(); await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await lp.waitForTimeout(600);
  if (/\/login/.test(lp.url())) { await lp.fill('input[type="email"]', 'playtest@fel.local'); await lp.fill('input[type="password"]', 'playtest-local-only'); await lp.click('button[type="submit"]'); const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300); } await lp.close(); }
for (const path of (process.env.PATHS ?? '/try,/play/carnival').split(',')) {
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.goto(`${BASE}${path}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const t0 = Date.now(); let st = '';
  while (Date.now() - t0 < 120000) { st = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (st === 'loaded' || st === 'failed') break; await p.waitForTimeout(400); }
  const btns = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).filter(Boolean).slice(0, 12));
  for (const label of ['START THE NIGHT', 'TAP TO START', 'START', 'PLAY']) { const l = p.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }); if (await l.count()) { await l.first().click().catch(() => {}); break; } }
  await p.waitForTimeout(2500);
  await p.waitForTimeout(6000);
  const qa = await p.evaluate(() => {
    const w = window as any;
    return {
      qa: w.__FEL_QA__ ? { modeId: w.__FEL_QA__.modeId, presses: w.__FEL_QA__.summary(450, 0)?.presses ?? null } : null,
      dev: w.__FEL_DEV__ ? { modeId: w.__FEL_DEV__.modeId, hasAnim: !!w.__FEL_DEV__.anim } : null,
      agentFlag: (() => { try { return window.sessionStorage.getItem('NEXUS_AGENT'); } catch { return 'ERR'; } })(),
      search: window.location.search,
      canvases: document.querySelectorAll('canvas').length,
    };
  });
  const phase = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '');
  console.log(path, 'ready', JSON.stringify(st), 'phase', JSON.stringify(phase), 'qa', JSON.stringify(qa), 'buttons', JSON.stringify(btns).slice(0, 200));
  await p.close();
}
await b.close();
