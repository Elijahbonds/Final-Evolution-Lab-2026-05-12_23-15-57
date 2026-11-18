// VENICE → COAST → VENICE on the REAL app (lane/coast-door, 2026-11-18; docs/COAST-ISLANDS-PLAN.md phase F): the production build
// (the every-screen rig's `next start`), one phone tab (390×844, DPR 3, touch), the app's own links all the way:
//   1. /play/venice?agent=1 — walk to the boat (the hub's probe seam, window.__VENICE__.walkTo('pier.end')), its card comes up
//      (picture: venice-boat-card-phone.jpg), tap "Take the boat to the coast";
//   2. the coast loads on its dock (picture: coast-arrival-from-venice-phone.jpg), where the player stands is read from the zone's
//      seam (window.__COAST__, the same tab's probe mark); walk to the boat back, its card comes up, tap "Back to Venice";
//   3. the hub loads at the boat: where the player stands, against the boat's ring (picture: venice-back-at-boat-phone.jpg).
// Every step is checked: the URLs, the cards, the positions, no page errors. Prints one JSON verdict and writes door-roundtrip.json.
// Run inside the browser hold, after the build:  ES_DIST=.next-coast ES_PORT=3811 … npx tsx scripts/probes/coast-islands/door-roundtrip.mts <out-dir>
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, serve } from '../../every-screen/rig.mts';
import * as layoutNs from '../../../lib/adventure/coast/zoneLayout.ts';
import * as doorNs from '../../../lib/adventure/venice/coastDoor.ts';

const { ZONE_SPOTS, arrivalSpawn } = ((layoutNs as { default?: unknown }).default ?? layoutNs) as typeof layoutNs;
const { BOAT_STOP, boatReturnSpawn } = ((doorNs as { default?: unknown }).default ?? doorNs) as typeof doorNs;

const OUT = process.argv[2] ?? '/tmp/coast-door';
fs.mkdirSync(OUT, { recursive: true });
const verdict: Record<string, unknown> = {};
const fail = (why: string) => { verdict.ok = false; (verdict.failures as string[]).push(why); console.log('FAIL', why); };
verdict.failures = [];
verdict.ok = true;

async function until<T>(page: Page, fn: string, ok: (v: T) => boolean, sec: number): Promise<T | null> {
  for (let k = 0; k < sec * 4; k++) {
    const v = await page.evaluate(fn).catch(() => null) as T | null;
    if (v !== null && ok(v)) return v;
    await page.waitForTimeout(250);
  }
  return null;
}

const stop = await serve(path.join(OUT, 'door-server.log'));
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  const shot = async (name: string) => { const f = path.join(OUT, name); await page.screenshot({ path: f, type: 'jpeg', quality: 85 }); console.log('wrote', f); };

  // 1. Venice: to the boat, its card, the boat
  const t0 = Date.now();
  await page.goto(`${ORIGIN}/play/venice?agent=1`);
  const seam = await until<boolean>(page, '!!(window.__VENICE__ && window.__VENICE__.state)', Boolean, 240);
  if (!seam) throw new Error('the hub never published its probe seam');
  verdict.veniceReadySec = (Date.now() - t0) / 1000;
  const spots = await page.evaluate('window.__VENICE__.spots()') as string[];
  verdict.veniceSpots = spots;
  if (!spots.includes('pier.end')) fail('the hub does not offer the boat (pier.end)');
  await page.waitForTimeout(4000);   // the scenery lands
  await page.evaluate("window.__VENICE__.walkTo('pier.end')");
  const atBoat = await until<{ x: number; z: number; walking: boolean; spot: string | null }>(page, 'window.__VENICE__.state()', (s) => !s.walking && s.spot === 'pier.end', 180);
  verdict.veniceAtBoat = atBoat;
  if (!atBoat) fail('the walk to the boat did not bring its card up');
  const card = page.getByTestId('venice-boat');
  try { await card.waitFor({ timeout: 10000 }); } catch { fail('no "Take the boat" button on the card'); }
  verdict.veniceCard = await page.getByTestId('venice-walkup').textContent().catch(() => null);
  await page.waitForTimeout(500);
  await shot('venice-boat-card-phone.jpg');
  await card.click();

  // 2. the coast, on its dock
  await page.waitForURL(/\/play\/coast\?/, { timeout: 30000 }).catch(() => fail('the boat did not open /play/coast'));
  verdict.coastUrl = page.url().replace(ORIGIN, '');
  if (!/[?&]from=venice/.test(page.url()) || !/[?&]spot=pier\.end/.test(page.url())) fail(`the coast's URL lacks from=venice&spot=pier.end (${verdict.coastUrl})`);
  const coastSeam = await until<boolean>(page, '!!(window.__COAST__ && window.__COAST__.state && window.__COAST__.state())', Boolean, 240);
  if (!coastSeam) throw new Error('the coast never published its probe seam');
  await page.waitForTimeout(6000);
  const arrived = await page.evaluate('window.__COAST__.state()') as { x: number; y: number; z: number };
  const a = arrivalSpawn();
  verdict.coastArrival = { x: +arrived.x.toFixed(2), z: +arrived.z.toFixed(2), expected: { x: +a.pos.x.toFixed(2), z: +a.pos.z.toFixed(2) } };
  if (Math.hypot(arrived.x - a.pos.x, arrived.z - a.pos.z) > 1.5) fail('the coast did not land the player on its dock');
  await shot('coast-arrival-from-venice-phone.jpg');
  const ring = ZONE_SPOTS.find((s) => s.id === 'dock.venice')!;
  await page.evaluate(`window.__COAST__.drive({ x: ${ring.at[0]}, z: ${ring.at[1]} })`);
  const atCoastBoat = await until<string | null>(page, 'window.__COAST__.spot()', (s) => s === 'dock.venice', 60);
  await page.evaluate('window.__COAST__.drive(null)');
  if (!atCoastBoat) fail('the walk to the coast\'s boat back did not bring its card up');
  const back = page.getByTestId('coast-to-venice');
  try { await back.waitFor({ timeout: 10000 }); } catch { fail('no "Back to Venice" button on the coast\'s card'); }
  await page.waitForTimeout(400);
  await shot('coast-boat-back-card-phone.jpg');
  await back.click();

  // 3. back in Venice, at the boat
  await page.waitForURL(/\/play\/venice\?spot=pier\.end/, { timeout: 30000 }).catch(() => fail('the boat back did not open /play/venice?spot=pier.end'));
  verdict.backUrl = page.url().replace(ORIGIN, '');
  const seam2 = await until<boolean>(page, '!!(window.__VENICE__ && window.__VENICE__.state)', Boolean, 240);
  if (!seam2) throw new Error('the hub never came back');
  await page.waitForTimeout(5000);
  const home = await page.evaluate('window.__VENICE__.state()') as { x: number; z: number; spot: string | null };
  const r = boatReturnSpawn();
  verdict.veniceBack = { x: +home.x.toFixed(2), z: +home.z.toFixed(2), spot: home.spot, expected: { x: r.pos.x, z: r.pos.z }, boat: BOAT_STOP };
  if (Math.hypot(home.x - r.pos.x, home.z - r.pos.z) > 1.5) fail('back in Venice, the player is not at the boat');
  await shot('venice-back-at-boat-phone.jpg');
  verdict.errors = errors;
  if (errors.length) fail(`${errors.length} page error(s)`);
  verdict.totalSec = (Date.now() - t0) / 1000;
} catch (e) {
  fail(String(e).slice(0, 300));
} finally {
  await browser.close();
  stop();
  fs.writeFileSync(path.join(OUT, 'door-roundtrip.json'), JSON.stringify(verdict, null, 1));
  console.log(JSON.stringify(verdict));
}
