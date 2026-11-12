// GROUP-BOOKING (2026-11-02): the 390 px contact sheet of the three flows, tapped through in headless Chromium over the
// real components (scripts/probes/_group-booking-entry.tsx, bundled with esbuild; the app's Tailwind compiled with its own
// CLI — the _coach-delivery-phone.mts mechanism, no server, no database):
//   1. join a group: the Gym chip → the group's Join → "Reserve, pay at the gym" (3 taps), shot after each;
//   2. book a 1:1 in person: In person → a gym → a time → "Reserve, pay at the gym" (4 taps);
//   3. the coach's roster: open the group → tap a session → the roster with Present / Missed / Paid in person.
// Counts the taps, checks no horizontal scroll at 390 px, and writes JPGs only: each step, and <out>/contact-sheet.jpg.
//
//   npx tsx scripts/probes/_group-booking-shots.mts <outDir>
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.group-booking-shots'));
mkdirSync(OUT, { recursive: true });
const W = 390, H = 844;

const js = join(OUT, 'gb.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_group-booking-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty' },
});
const css = join(OUT, 'gb.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const shots: { file: string; caption: string }[] = [];
const report: Record<string, unknown> = {};
const errors: string[] = [];

async function open(view: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`${view}: ${String(e)}`));
  await page.setContent(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body class="bg-[#050505]"><div id="root"></div></body></html>`);
  await page.evaluate((v) => { (window as unknown as { __VIEW: string }).__VIEW = v; }, view);
  await page.addScriptTag({ content: readFileSync(js, 'utf8') });
  await page.waitForTimeout(400);
  return page;
}
async function shot(page: Page, name: string, caption: string) {
  await page.waitForTimeout(350);
  const file = join(OUT, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
  shots.push({ file, caption });
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

try {
  // 1. join a group
  let p = await open('join');
  await shot(p, '1a-groups', 'Groups: gym, days, time chips; seats left');
  let taps = 0;
  await p.locator('[data-chip="24hr-victory"]').first().click(); taps++;
  await p.locator('[data-action="join"]').first().click(); taps++;
  await shot(p, '1b-sheet', `Join → the sheet (tap ${taps}): 4 weeks picked, pay at the gym`);
  await p.getByRole('button', { name: 'Reserve, pay at the gym' }).click(); taps++;
  await p.waitForSelector('[data-buy-done]');
  await shot(p, '1c-reserved', `Reserved (tap ${taps})`);
  report.join = { taps, overflowX: await overflow(p) };
  await p.close();

  // 2. 1:1 in person
  p = await open('one');
  taps = 0;
  await p.locator('[data-mode="in_person"]').click(); taps++;
  await p.locator('[data-gym="la-fitness-balboa"]').click(); taps++;
  await p.locator('[data-slot]').first().click(); taps++;
  await shot(p, '2a-one-on-one', `1:1: in person → gym → time (tap ${taps})`);
  await p.getByRole('button', { name: 'Reserve, pay at the gym' }).click(); taps++;
  await p.waitForSelector('[data-booked]');
  await shot(p, '2b-booked', `Booked (tap ${taps})`);
  report.oneOnOne = { taps, overflowX: await overflow(p) };
  await p.close();

  // 3. the coach's roster
  p = await open('coach');
  await p.waitForSelector('[data-group-line]');
  await shot(p, '3a-coach-board', 'Coach: one line per group; the under-6 notice');
  await p.locator('[data-group="g1"] button[aria-expanded]').click();
  await p.locator('[data-session="group:g1:0"]').click();
  await p.waitForSelector('[data-roster]');
  await p.locator('[data-roster] [data-seat]').first().scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -140));
  await shot(p, '3b-roster', 'Roster: Present / Missed / Paid in person');
  report.coach = { overflowX: await overflow(p) };
  await p.close();

  // the contact sheet: every step side by side, captions under each
  const sheet = await browser.newPage({ viewport: { width: 4 * (W + 24) + 24, height: 2 * (H + 70) + 24 }, deviceScaleFactor: 1 });
  const imgs = shots.map((s) => `<figure><img src="data:image/jpeg;base64,${readFileSync(s.file).toString('base64')}" width="${W}" height="${H}"><figcaption>${s.caption}</figcaption></figure>`).join('');
  await sheet.setContent(`<!doctype html><html><body style="margin:0;background:#1a1d24;font:14px system-ui;color:#e8e8e8"><div style="display:grid;grid-template-columns:repeat(4,${W}px);gap:24px;padding:24px">${imgs}</div></body></html>`);
  await sheet.screenshot({ path: join(OUT, 'contact-sheet.jpg'), type: 'jpeg', quality: 70, fullPage: true });
  await sheet.close();
} finally {
  await browser.close();
}
report.errors = errors;
report.shots = shots.map((s) => s.caption);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
