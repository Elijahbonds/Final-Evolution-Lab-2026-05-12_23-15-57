// DUNK-VISUAL-POLISH — the OTHER courts. The Venice scan is shared by dunk, ones, threes and the carnival hub, so
// dropping its mesh and painting the surface changes all four. This boots each one and grabs a frame, so "the dunk
// court is beautiful" cannot quietly mean "the other three have a hole in the floor".
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3004';
const OUT = process.env.OUT ?? '/tmp/venice-courts';
const ROUTES = (process.env.ROUTES ?? 'onevone,threevthree,threepoint,dunkduel,carnival').split(',');
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    headless: true, executablePath: chromiumExe(),
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const p: Page = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(700);
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', 'playtest@fel.local');
    await p.fill('input[type="password"]', 'playtest-local-only');
    await p.click('button[type="submit"]'); await p.waitForTimeout(2400);
  }
  for (const route of ROUTES) {
    const errs: string[] = []; const notes: string[] = [];
    const onMsg = (m: { type(): string; text(): string }) => {
      const t = m.text();
      if (m.type() === 'error') errs.push(t.slice(0, 180));
      if (/FEL-COURT|MISSING|no venue spec|FEL-READY .* error/i.test(t)) notes.push(t.slice(0, 160));
    };
    p.on('console', onMsg);
    try {
      // "dunk" → /play/dunk?arena=1 · "dunk@blossom-park" → /play/dunk?location=blossom-park&arena=1
      const [mode, loc] = route.split('@');
      const url = `${BASE}/play/${mode}?${loc ? `location=${loc}&` : ''}arena=1`;
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await p.waitForSelector('canvas', { timeout: 180000 });
      await p.waitForTimeout(2500);
      const btn = p.getByRole('button', { name: /TAP TO START/i });
      if (await btn.count()) await btn.click({ force: true }).catch(() => {});
      await p.waitForTimeout(5000);
      await p.screenshot({ path: `${OUT}/${route.replace('@', '-')}.png` });
      const hud = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 160);
      console.log(`${route}: OK  errs=${errs.length}  ${notes.join(' | ')}  HUD="${hud}"`);
      if (errs.length) console.log('   ERR', errs.slice(0, 3).join(' ;; '));
    } catch (e) {
      console.log(`${route}: FAIL ${(e as Error).message.slice(0, 120)}`);
    }
    p.off('console', onMsg);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
