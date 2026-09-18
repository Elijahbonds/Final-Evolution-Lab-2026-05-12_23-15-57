// Does the draw-budget warning correspond to a real frame cost, on the tier the budget exists for?
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const MODE = process.env.MODE ?? 'threepoint';
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 760);
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto(`http://localhost:3061/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(11000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(4000); }
await p.waitForTimeout(9000);
const hud = await p.evaluate("(() => { const t = document.body.innerText; const f = /([0-9]+) fps/.exec(t); const d = /draws (\\d+)/.exec(t); const w = /worst ([0-9.]+)ms/.exec(t); const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; return { fps: f?f[1]:null, draws: d?d[1]:null, worst: w?w[1]:null, tier: s && s.metadata && s.metadata.felTier, bodies: s ? s.skeletons.length : null }; })()");
console.log(`${MODE} @ ${W}x${H}:`, JSON.stringify(hud));
await b.close();
