// COAST & ISLANDS phase B: the creature log panel on the REAL page (the every-screen rig's production build, `next start`), as a
// phone (390×844, DPR 3, touch). The device's Adventure save is seeded before the page loads with two creatures logged (one met,
// one seen), the way the zone writes them (lib/adventure/coast/creatureLog withLog), so the panel has something to show.
// Run inside the browser hold, after the build:  ES_DIST=.next-coast ES_PORT=3811 … npx tsx scripts/probes/coast-islands/log-shot.mts <out-dir>
import { chromium } from 'playwright-core';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, serve } from '../../every-screen/rig.mts';
import * as logNs from '../../../lib/adventure/coast/creatureLog.ts';
import * as contractsNs from '../../../lib/babylon/adventure/contracts.ts';
import * as storeNs from '../../../lib/babylon/adventure/save/deviceStore.ts';

const { withLog } = ((logNs as { default?: unknown }).default ?? logNs) as typeof logNs;
const { emptyAdventureSave } = ((contractsNs as { default?: unknown }).default ?? contractsNs) as typeof contractsNs;
const { ADVENTURE_SAVE_KEY } = ((storeNs as { default?: unknown }).default ?? storeNs) as typeof storeNs;

const OUT = process.argv[2] ?? '/tmp/coast-b';
const now = Date.now();
const doc = withLog(withLog(withLog(emptyAdventureSave(now), 'shellhopper', 1)!, 'shellhopper', 2)!, 'palmglider', 1)!;
const stop = await serve(path.join(OUT, 'log-shot-server.log'));
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* none */ } }, [ADVENTURE_SAVE_KEY, JSON.stringify(doc)] as const);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${ORIGIN}/play/coast`);
  await page.getByTestId('coast-log-open').waitFor({ timeout: 240000 });
  const label = await page.getByTestId('coast-log-open').textContent();
  await page.getByTestId('coast-log-open').click();
  await page.getByTestId('coast-log').waitFor();
  await page.waitForTimeout(500);
  const file = path.join(OUT, 'coast-log-phone.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
  console.log(JSON.stringify({ wrote: file, button: label, entries: await page.locator('[data-testid^="coast-log-"] li, li[data-testid^="coast-log-"]').count(), errors }));
} finally {
  await browser.close();
  stop();
}
