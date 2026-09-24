// THE MIC (2026-09-24): the lower third on the real dunk host (/try: the guest shell mounts dunk-babylon.tsx, not the dev HUD) —
// a screenshot while the MC's caption is up, and the MC toggle.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/mic/probe`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
await p.goto(`${BASE}/try`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('canvas', { timeout: 180000 });
await p.waitForTimeout(8000);
await p.mouse.click(640, 400); await p.waitForTimeout(400); await p.keyboard.press('Space');
const t0 = Date.now(); let shot = false;
while (Date.now() - t0 < 45000 && !shot) {
  const who = await p.evaluate(`(() => { const el = [...document.querySelectorAll('span')].find((s) => /^(BOARDWALK|SCOOP|CASS|TY|PILOT|ZO|STACK)$/.test(s.textContent || '')); return el ? el.textContent : ''; })()`);
  if (who) { await p.screenshot({ path: `${OUT}/try-caption.png` }); shot = true; console.log('caption up:', who); }
  else await p.waitForTimeout(250);
}
const toggle = await p.evaluate(`!!document.querySelector('button[aria-label^="Turn the announcer"]')`);
console.log('shot:', shot, '· MC toggle present:', toggle, '· errors:', errors.length ? errors : 'none');
await b.close();
