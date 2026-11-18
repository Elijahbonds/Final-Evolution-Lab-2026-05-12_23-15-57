// VENICE ROUND TRIPS (lane/venice-v1, improvement pass phase 10, 2026-11-17): TRIPS in-and-out trips — hub → walk to a court → Play → the
// game's page loads to its START → the header's "Venice" back link → back in the hub — in ONE tab, on the REAL app (rig.mts production build), so the
// navigation is the app's own client navigation and anything a trip leaves behind stays in the page's memory.
// After each trip, back in the hub: a forced garbage collection (CDP), then the JS heap, the DOM's event listeners (CDP DOMDebugger on
// window + document), the live WebGL contexts the page holds, and the hub scene's meshes / textures / sounds (the hub's walk seam).
// A leak shows as a heap or a count that climbs trip over trip; the verdict compares the last three trips with trips 2–4 (trip 1 warms
// caches) and fails on growth above GROW_MB.
//
//   ES_OUT=<dir> /home/user/wt/gate-run.sh 2400 npx tsx scripts/probes/venice-hub/roundtrip.mts   (TRIPS=10 GROW_MB=8)
import { chromium, type CDPSession, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState } from '../../every-screen/rig.mts';

const OUT = process.env.OUT ?? process.env.ES_OUT ?? '/tmp/venice-trips';
fs.mkdirSync(OUT, { recursive: true });
const TRIPS = Number(process.env.TRIPS ?? 10), GROW_MB = Number(process.env.GROW_MB ?? 8);
const COURTS = ['court.ones', 'court.run', 'court.flight', 'court.arc'];
const ROUTE: Record<string, string> = { 'court.ones': '/play/onevone', 'court.run': '/play/threevthree', 'court.flight': '/play/dunk', 'court.arc': '/play/threepoint' };

async function sample(page: Page, cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(500);
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = await cdp.send('Runtime.getHeapUsage') as { usedSize: number };
  const win = await cdp.send('Runtime.evaluate', { expression: 'window', objectGroup: 'rt' }) as { result: { objectId: string } };
  const doc = await cdp.send('Runtime.evaluate', { expression: 'document', objectGroup: 'rt' }) as { result: { objectId: string } };
  const lw = await cdp.send('DOMDebugger.getEventListeners', { objectId: win.result.objectId }) as { listeners: unknown[] };
  const ld = await cdp.send('DOMDebugger.getEventListeners', { objectId: doc.result.objectId }) as { listeners: unknown[] };
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'rt' });
  const scene = await page.evaluate(() => {
    const v = (window as unknown as { __VENICE__?: { counts?: () => unknown } }).__VENICE__;
    return v?.counts ? v.counts() : null;
  });
  return { heapMb: Math.round((heap.usedSize / 1048576) * 10) / 10, windowListeners: lw.listeners.length, documentListeners: ld.listeners.length, canvases: await page.evaluate(() => document.querySelectorAll('canvas').length), scene };
}

dbUp();
const stop = await serve(path.join(OUT, 'server.log'));
const rows: Record<string, unknown>[] = [];
let verdict = 'not run';
try {
  const ppl = await makePeople();
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState: storageState(ppl, 'solo') });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(`${ORIGIN}/play/venice?agent=1`);
    for (let trip = 1; trip <= TRIPS; trip++) {
      const court = COURTS[(trip - 1) % COURTS.length];
      await page.waitForFunction(() => !!(window as unknown as { __VENICE__?: unknown }).__VENICE__, null, { timeout: 120000 });
      await page.evaluate((id) => (window as unknown as { __VENICE__: { walkTo(i: string): boolean } }).__VENICE__.walkTo(id), court);
      await page.getByTestId('venice-play').waitFor({ timeout: 90000 });
      await page.getByTestId('venice-play').click();
      await page.waitForURL((u) => u.pathname === ROUTE[court], { timeout: 30000 });
      await page.getByRole('button', { name: /TAP TO START/i }).waitFor({ timeout: 180000 });
      await page.waitForFunction(() => /\/play\/venice/.test(document.querySelector('a[data-testid="game-header-back"]')?.getAttribute('href') ?? ''), null, { timeout: 20000 });
      // the trip back: the Leave link with ?agent=1 kept, so the hub's seam answers (the probe's only change to the page)
      await page.evaluate(() => { const a = document.querySelector('a[data-testid="game-header-back"]') as HTMLAnchorElement; a.setAttribute('href', `${a.getAttribute('href')}&agent=1`); });
      await page.getByTestId('game-header-back').click();
      await page.waitForURL((u) => u.pathname === '/play/venice', { timeout: 30000 });
      await page.waitForFunction(() => !!(window as unknown as { __VENICE__?: unknown }).__VENICE__, null, { timeout: 120000 });
      await page.waitForTimeout(3000);   // the deferred scenery lands
      const s = await sample(page, cdp);
      rows.push({ trip, court, ...s });
      console.log(`trip ${trip} (${court}): heap ${s.heapMb} MB, listeners window ${s.windowListeners} / document ${s.documentListeners}, canvases ${s.canvases}, scene ${JSON.stringify(s.scene)}`);
    }
    const heap = rows.map((r) => r.heapMb as number);
    const early = heap.slice(1, 4), late = heap.slice(-3);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const grow = avg(late) - avg(early);
    const lw = rows.map((r) => r.windowListeners as number), ld = rows.map((r) => r.documentListeners as number);
    const listenersGrow = (lw.at(-1)! - lw[1]) + (ld.at(-1)! - ld[1]);
    verdict = grow <= GROW_MB && listenersGrow <= 0 ? 'pass' : 'fail';
    console.log(`round trips: heap trips 2–4 ${avg(early).toFixed(1)} MB → last 3 ${avg(late).toFixed(1)} MB (${grow >= 0 ? '+' : ''}${grow.toFixed(1)} MB); listeners ${listenersGrow >= 0 ? '+' : ''}${listenersGrow}; ${verdict}`);
    rows.push({ errors: errors.slice(0, 5) });
    await ctx.close();
  } finally { await browser.close(); }
} finally { stop(); }
fs.writeFileSync(path.join(OUT, 'roundtrip.json'), JSON.stringify({ rows, verdict }, null, 1));
process.exit(verdict === 'pass' ? 0 : 1);
