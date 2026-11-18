// VENICE WALK-THROUGH (lane/venice-v1, improvement pass phase 1, 2026-11-17): the hub end to end, on the REAL app — a production
// build (scripts/every-screen/rig.mts: `next build` into ES_DIST, served by `next start` against the local throwaway database), signed
// in as the rig's adult "solo" account, on a phone profile (390 × 844, touch).
//
// For each of the four courts: arrive at /play/venice (?agent=1: the hub's walk seam, window.__VENICE__, honoured on a loopback host
// only), WALK to the court's ring, read the walk-up card, tap Play, the game's page loads to its START (the splash's TAP TO START),
// then come back:
//   Courts 1–3   QUIT through the game header's back link (it reads "Venice" for a game opened from a court);
//   Court 4      FINISH: the 3-point contest runs its clock to the end screen, then "Back to Venice".
// Each return must land on /play/venice?spot=<that court> with the player beside that court and its card up again.
//
//   ES_OUT=<dir> /home/user/wt/gate-run.sh 1500 npx tsx scripts/probes/venice-hub/walkthrough.mts   (build first: rig.mts build)
//   COURTS=court.ones,court.run  (a subset)   OUT=<dir for shots + walkthrough.json>
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState } from '../../every-screen/rig.mts';

const OUT = process.env.OUT ?? process.env.ES_OUT ?? '/tmp/venice-walk';
fs.mkdirSync(OUT, { recursive: true });
const ALL = ['court.ones', 'court.run', 'court.flight', 'court.arc'];
const COURTS = (process.env.COURTS ?? ALL.join(',')).split(',').filter(Boolean);
const ROUTE: Record<string, string> = { 'court.ones': '/play/onevone', 'court.run': '/play/threevthree', 'court.flight': '/play/dunk', 'court.arc': '/play/threepoint' };
const CENTRE: Record<string, [number, number]> = { 'court.ones': [-64, -100], 'court.run': [-24, -100], 'court.flight': [-64, -38], 'court.arc': [-24, -38] };

type VState = { x: number; z: number; y: number; walking: boolean; spot: string | null };
const vstate = (p: Page) => p.evaluate(() => (window as unknown as { __VENICE__?: { state(): VState } }).__VENICE__?.state() ?? null);

async function hubReady(p: Page, timeout = 120000): Promise<void> {
  await p.waitForFunction(() => !!(window as unknown as { __VENICE__?: unknown }).__VENICE__, null, { timeout });
}

dbUp();
const stop = await serve(path.join(OUT, 'server.log'));
const report: Record<string, unknown>[] = [];
let failed = 0;
try {
  const ppl = await makePeople();
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const court of COURTS) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: storageState(ppl, 'solo') });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
      const row: Record<string, unknown> = { court, steps: [] as string[] };
      const step = (s: string) => { (row.steps as string[]).push(s); console.log(`[${court}] ${s}`); };
      try {
        const t0 = Date.now();
        await page.goto(`${ORIGIN}/play/venice?agent=1`);
        await hubReady(page);
        row.hubReadySec = Number(((Date.now() - t0) / 1000).toFixed(1));
        step(`hub ready in ${row.hubReadySec} s`);
        await page.evaluate((id) => (window as unknown as { __VENICE__: { walkTo(i: string): boolean } }).__VENICE__.walkTo(id), court);
        await page.waitForFunction((id) => { const s = (window as unknown as { __VENICE__: { state(): VState } }).__VENICE__.state(); return !s.walking && s.spot === id; }, court, { timeout: 90000 });
        const at = await vstate(page);
        step(`walked to the ring (${at?.x.toFixed(1)}, ${at?.z.toFixed(1)}); the card is up`);
        await page.getByTestId('venice-walkup').waitFor({ timeout: 10000 });
        if (court === 'court.ones') await page.screenshot({ path: path.join(OUT, 'walk-card.jpg'), type: 'jpeg', quality: 80 });
        const tPlay = Date.now();
        await page.getByTestId('venice-play').click();
        await page.waitForURL((u) => u.pathname === ROUTE[court], { timeout: 30000 });
        const q = new URL(page.url()).searchParams;
        if (q.get('from') !== 'venice' || q.get('spot') !== court) throw new Error(`the game opened without the Venice query: ${page.url()}`);
        step(`tapped Play → ${ROUTE[court]} (from=venice, spot=${court})`);
        await page.getByRole('button', { name: /TAP TO START/i }).waitFor({ timeout: 180000 });
        row.gameLoadSec = Number(((Date.now() - tPlay) / 1000).toFixed(1));
        step(`the game loaded to its START in ${row.gameLoadSec} s`);
        if (court !== 'court.arc') {
          await page.getByTestId('game-header-back').waitFor({ timeout: 20000 });
          await page.waitForFunction(() => { const a = document.querySelector('a[data-testid="game-header-back"]'); return !!a && /\/play\/venice/.test(a.getAttribute('href') ?? ''); }, null, { timeout: 15000 });
          await page.getByTestId('game-header-back').click();
          step('quit with the header back link ("Venice")');
        } else {
          await page.getByRole('button', { name: /TAP TO START/i }).click();
          await page.locator('[data-end-screen]').waitFor({ timeout: 240000 });
          step('played the contest to its end screen');
          await page.getByTestId('end-back-to-venice').waitFor({ timeout: 30000 });
          await page.waitForTimeout(1200);   // the end card arms its buttons after a beat (ARM_MS)
          await page.getByTestId('end-back-to-venice').click();
          step('tapped "Back to Venice"');
        }
        await page.waitForURL((u) => u.pathname === '/play/venice' && u.searchParams.get('spot') === court, { timeout: 30000 });
        if (!/[?&]agent=1/.test(page.url())) {
          // the return URL has no ?agent=1, so the probe seam needs the hub reloaded with it to read the position (same spot)
          await page.goto(`${page.url()}&agent=1`);
        }
        await hubReady(page);
        await page.waitForFunction((id) => (window as unknown as { __VENICE__: { state(): VState } }).__VENICE__.state().spot === id, court, { timeout: 30000 });
        const back = await vstate(page);
        const [cx, cz] = CENTRE[court];
        const dist = back ? Math.hypot(back.x - cx, back.z - cz) : Infinity;
        if (!(dist < 16)) throw new Error(`back in Venice but ${dist.toFixed(1)} m from the court`);
        step(`back beside the same court: ${dist.toFixed(1)} m from its centre, its card up`);
        if (court === 'court.arc') await page.screenshot({ path: path.join(OUT, 'back-to-venice.jpg'), type: 'jpeg', quality: 80 });
        row.ok = true;
      } catch (e) {
        failed++; row.ok = false; row.error = String((e as Error).message ?? e).slice(0, 300);
        console.log(`[${court}] FAIL: ${row.error}`);
        await page.screenshot({ path: path.join(OUT, `fail-${court}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
      }
      row.pageErrors = errors.slice(0, 5);
      report.push(row);
      await ctx.close();
    }
  } finally { await browser.close(); }
} finally { stop(); }
fs.writeFileSync(path.join(OUT, 'walkthrough.json'), JSON.stringify(report, null, 1));
console.log(`walkthrough: ${report.length - failed} of ${report.length} courts round-tripped`);
process.exit(failed ? 1 : 0);
