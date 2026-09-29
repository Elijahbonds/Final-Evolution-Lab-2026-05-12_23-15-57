// MIRROR-COACH P2 (2026-09-25) — LIVE PROOF of the compliance-and-roster lane on the lane's dev server (:3131).
//
// The lane's database is offline on purpose, so /coach's routes cannot answer. This loads /dev/mirror-shots (the
// production CoachView, nothing added — see that page's header) and answers its /api/coach/* calls with what the REAL
// routes returned on a fixture roster (lib/coach/compliance-routes.test.ts, run with COMPLIANCE_PROOF_OUT), exactly as
// the P1 baseline frames did. Then, as a coach would, one page at a time, headless chromium:
//   1. the Clients tab: "Needs you today" names the drifting (Gia: games, no coached work) and the roster shows two
//      numbers per client ("N coached · M games") and the six-pattern strip;
//   2. Cole's program in the builder: Week 1's pull-over-push suggestion (10 pressing sets, 6 pulling, 2 untagged);
//   3. Rae's program: 6 and 6 would pass FEL's default, but a coach note mentions the shoulder, so it suggests 9.
// Frames at phone width (390) and desktop (900); every strip cell's data-state and every suggestion line are read off
// the DOM into live-proof.json. Console errors are collected.
//
// Run from FEL-full-app:
//   env COMPLIANCE_PROOF_OUT=<out>/routes.json <vitest> run lib/coach/compliance-routes.test.ts
//   /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_coach-compliance-p2.mts <out>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.MIRROR_BASE ?? 'http://127.0.0.1:3131';
const OUT = process.argv[2] ?? '/tmp/coach-compliance-p2';
mkdirSync(OUT, { recursive: true });
const routes = JSON.parse(readFileSync(join(OUT, 'routes.json'), 'utf8')) as Record<string, unknown>;
const out: Record<string, unknown> = { base: BASE, date: new Date().toISOString(), runs: {} as Record<string, unknown> };

async function clientsTab(page: Page) {
  const tab = page.getByRole('button', { name: 'Clients' });
  await tab.waitFor({ timeout: 300_000 });
  for (let i = 0; i < 60; i++) {
    await tab.click();
    if (await page.getByText('Needs you today').count()) break;
    await page.waitForTimeout(1000);
  }
  await page.locator('[data-testid="coverage-strip"]').first().waitFor({ timeout: 120_000 });
  await page.locator('[data-testid="program-builder"]').first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800);
}

async function run(width: number, tag: string) {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  const served: string[] = [];
  await page.route('**/api/**', (route) => {
    const u = new URL(route.request().url());
    const body = routes[u.pathname + u.search] ?? routes[u.pathname];
    served.push(`${body !== undefined || u.pathname === "/api/coach/messages" ? 200 : 404} ${u.pathname}${u.search}`);
    if (body !== undefined) return route.fulfill({ json: body });
    if (u.pathname === '/api/coach/messages') return route.fulfill({ json: { messages: [] } });
    return route.fulfill({ status: 404, json: { error: 'not in the fixture' } });
  });
  const r: Record<string, unknown> = {};
  try {
    await page.goto(`${BASE}/dev/mirror-shots`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await clientsTab(page);

    // 1. the panel and the roster
    r.panel = (await page.locator('section[aria-labelledby="attention-heading"]').innerText()).split('\n').filter(Boolean);
    r.drifting = await page.locator('[data-testid="drifting"] li').allInnerTexts();
    r.rosterRows = await page.locator('[data-roster-row]').evaluateAll((rows) => rows.map((row) => ({
      client: row.getAttribute('data-roster-row'),
      head: (row.querySelector('.text-sm') as HTMLElement | null)?.innerText ?? '',
      cells: Object.fromEntries([...row.querySelectorAll('[data-pattern]')].map((c) => [c.getAttribute('data-pattern'), c.getAttribute('data-state')])),
      line: (row.querySelector('[data-testid="coverage-strip"] > div') as HTMLElement | null)?.innerText ?? null,
    })));
    r.legend = await page.locator('[data-testid="coverage-legend"]').innerText().catch(() => null);
    await page.locator('section[aria-labelledby="attention-heading"]').evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${tag}-1-clients-top.png`), fullPage: false });
    const roster = page.locator('[data-roster-row]').first().locator('xpath=..');
    await roster.screenshot({ path: join(OUT, `${tag}-2-roster.png`) });

    // 2. Cole's program (selected first): Week 1's suggestion
    r.cole = await page.locator('[data-testid="pull-push"]').allInnerTexts();
    // the suggestion sits under the week's label: put that label near the top of the frame
    const toSuggestion = () => page.locator('[data-testid="pull-push"]').first().evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -140); });
    await toSuggestion();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${tag}-3-builder-cole.png`), fullPage: false });

    // 3. Rae's program: a coach note mentions the shoulder
    await page.getByRole('button', { name: /Rae Tagged · Strength base/ }).click();
    await page.getByText(/mentions the shoulder/).first().waitFor({ timeout: 30_000 });
    r.rae = await page.locator('[data-testid="pull-push"]').allInnerTexts();
    await toSuggestion();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${tag}-4-builder-rae-shoulder.png`), fullPage: false });

    // control: Gia's program is the same 6-and-6 week with no note — no suggestion
    await page.getByRole('button', { name: /Gia Games · Strength base/ }).click();
    await page.waitForTimeout(600);
    r.giaSuggestions = await page.locator('[data-testid="pull-push"]').count();

    await page.screenshot({ path: join(OUT, `${tag}-5-full.png`), fullPage: true });
  } catch (e) {
    r.error = (e as Error).message.slice(0, 500);
    await page.screenshot({ path: join(OUT, `${tag}-error.png`), fullPage: true }).catch(() => {});
  }
  r.errors = errors;
  r.served = [...new Set(served)];
  (out.runs as Record<string, unknown>)[tag] = r;
  console.log(tag, JSON.stringify(r, null, 1).slice(0, 4000));
  await browser.close();
}

await run(390, 'phone');
await run(900, 'desktop');
writeFileSync(join(OUT, 'live-proof.json'), JSON.stringify(out, null, 2));
console.log('wrote', join(OUT, 'live-proof.json'));
