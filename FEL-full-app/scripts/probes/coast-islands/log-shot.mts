// COAST & ISLANDS phase B: the creature log panel on the REAL page (the every-screen rig's production build, `next start`), as a
// phone (390×844, DPR 3, touch). The device's Adventure save is seeded before the page loads with two creatures logged (one met,
// one seen), the way the zone writes them (lib/adventure/coast/creatureLog withLog), so the panel has something to show.
// Phase D, on the same real page: the quest panel (a save with Marisol's quest taken and Pip's done, the way the zone writes them:
// zoneQuests withQuestTaken), the volleyball spot's card (the page opened as a game sends you back, `?from=coast&spot=volley.net`,
// then a step forward into the ring on the move stick), and the town seen from the kart's start line (`?spot=kart.start`).
// Run inside the browser hold, after the build:  ES_DIST=.next-coast ES_PORT=3811 … npx tsx scripts/probes/coast-islands/log-shot.mts <out-dir>
import { chromium } from 'playwright-core';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, serve } from '../../every-screen/rig.mts';
import * as logNs from '../../../lib/adventure/coast/creatureLog.ts';
import * as contractsNs from '../../../lib/babylon/adventure/contracts.ts';
import * as storeNs from '../../../lib/babylon/adventure/save/deviceStore.ts';
import * as questsNs from '../../../lib/adventure/coast/zoneQuests.ts';

const { withLog } = ((logNs as { default?: unknown }).default ?? logNs) as typeof logNs;
const { emptyAdventureSave } = ((contractsNs as { default?: unknown }).default ?? contractsNs) as typeof contractsNs;
const { ADVENTURE_SAVE_KEY } = ((storeNs as { default?: unknown }).default ?? storeNs) as typeof storeNs;
const { withQuestTaken } = ((questsNs as { default?: unknown }).default ?? questsNs) as typeof questsNs;

const OUT = process.argv[2] ?? '/tmp/coast-b';
const now = Date.now();
const logged = withLog(withLog(withLog(emptyAdventureSave(now), 'shellhopper', 1)!, 'shellhopper', 2)!, 'palmglider', 1)!;
// Pip's quest is done the moment it is taken (the Shellhopper is already met); Marisol's is open
const doc = withQuestTaken(withQuestTaken(logged, 'q.shell')!, 'q.reefstone')!;
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
  // the quest panel
  await page.getByTestId('coast-log-close').click();
  const qLabel = await page.getByTestId('coast-quests-open').textContent();
  await page.getByTestId('coast-quests-open').click();
  await page.getByTestId('coast-quests').waitFor();
  await page.waitForTimeout(500);
  const qFile = path.join(OUT, 'coast-quests-phone.jpg');
  await page.screenshot({ path: qFile, type: 'jpeg', quality: 85 });
  console.log(JSON.stringify({ wrote: qFile, button: qLabel, quests: await page.locator('li[data-testid^="coast-quest-"]').allTextContents(), errors }));
  await page.close();
  // back from a game at the volleyball spot: you stand just outside its ring, facing it; a step in and its card offers the game
  for (const [spot, name, step] of [['volley.net', 'coast-sport-real-phone.jpg', 1400], ['kart.start', 'coast-town-real-phone.jpg', 0]] as const) {
    const p2 = await ctx.newPage();
    const errs: string[] = [];
    p2.on('pageerror', (e) => errs.push(String(e)));
    await p2.goto(`${ORIGIN}/play/coast?from=coast&spot=${spot}`);
    await p2.getByTestId('coast-log-open').waitFor({ timeout: 240000 });
    await p2.waitForTimeout(6000);   // the dressing and the townsfolk land
    let card: string | null = null;
    if (step) {
      // the move stick (a phone has no keyboard): a thumb down on the stick's zone, pushed up (forward), held, let go
      const z = await p2.locator('[data-float-stick]').boundingBox();
      const cx = z ? z.x + z.width / 2 : 100, cy = z ? z.y + z.height / 2 : 760;
      await p2.mouse.move(cx, cy); await p2.mouse.down(); await p2.mouse.move(cx, cy - 70, { steps: 5 });
      await p2.waitForTimeout(step); await p2.mouse.up();
      try { await p2.getByTestId('coast-sport').waitFor({ timeout: 8000 }); card = await p2.getByTestId('coast-sport').textContent(); } catch { card = null; }
      await p2.waitForTimeout(400);
    }
    const f = path.join(OUT, name);
    await p2.screenshot({ path: f, type: 'jpeg', quality: 85 });
    console.log(JSON.stringify({ wrote: f, spot, card, errors: errs }));
    await p2.close();
  }
} finally {
  await browser.close();
  stop();
}
