// Build my program at 390 px: ask → chips → week view → day 1 in the player (PROGRAM-ASK, 2026-11-02). No server: the
// entry (scripts/probes/_program-ask-entry.tsx) is bundled with esbuild, the app's Tailwind compiled with its CLI. WebGL is
// off (NEXT_PUBLIC_DISABLE_3D): the player shows its demo fallback. Each frame is a JPG (quality 70), then one contact
// sheet. Checks: no sideways scroll, no page error, the elements each frame promises.
//   npx tsx scripts/probes/_program-ask-phone.mts <outDir>
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv[2];
if (!OUT) throw new Error('outDir required');
mkdirSync(OUT, { recursive: true });
const js = join(OUT, 'program.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_program-ask-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_DISABLE_3D': '"1"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty' },
});
const css = join(OUT, 'program.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script src="program.js"></script></body></html>`);

const ASK = 'all I have is a band, full body, 3 days a week, 40 minutes';
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`file://${html}`);
await page.waitForSelector('[data-testid="program-builder"]', { timeout: 30000 });
const frames: { name: string; file: string; note: string }[] = [];
const shot = async (name: string, note: string) => {
  const file = join(OUT, `${frames.length + 1}-${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
  frames.push({ name, file, note });
};
const scroll = await page.evaluate(() => document.documentElement.scrollWidth);

await page.fill('[data-testid="program-ask-input"]', ASK);
await shot('ask', 'The ask, typed');
await page.click('[data-testid="program-ask-build"]');
await page.waitForSelector('[data-testid="program-view"]', { timeout: 60000 });
await page.evaluate(() => document.querySelector('[data-testid="program-chips"]')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(200);
await shot('chips', 'Read-back chips: − / + on numbers, one tap');
// one tap: 3 days → 4
await page.click('[data-chip="days"] button[aria-label^="More"]');
await page.waitForFunction(() => document.querySelector('[data-chip="days"]')?.textContent?.includes('4 days'), null, { timeout: 60000 });
const fourDays = await page.locator('[data-day]').count();
await page.click('[data-chip="days"] button[aria-label^="Fewer"]');
await page.waitForFunction(() => document.querySelector('[data-chip="days"]')?.textContent?.includes('3 days'), null, { timeout: 60000 });
await page.evaluate(() => document.querySelector('[data-testid="program-view"]')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(200);
await shot('summary', 'Title, ≤ 50 words, Start today');
await page.locator('[data-day]').first().locator('summary').click();
await page.evaluate(() => document.querySelector('[role="tablist"][aria-label="Weeks"]')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(200);
await shot('week', 'Week view: day 1 open');
const summaryWords = await page.locator('[data-testid="program-summary"]').innerText().then((t) => t.split(/\s+/).length);
const r = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, days: document.querySelectorAll('[data-day]').length, chips: Array.from(document.querySelectorAll('[data-chip]')).map((c) => c.textContent) }));
await page.click('[data-testid="program-start"]');
await page.waitForTimeout(2500);
await shot('player', 'Day 1 in the session player (3D off: demo fallback)');
const playerOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"], [data-testid="session-player"]'));
await browser.close();

// the contact sheet: the frames side by side
const sheet = join(OUT, 'program-ask-contact-sheet.jpg');
const b2 = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const p2 = await b2.newPage({ viewport: { width: 390 * frames.length + 20 * (frames.length + 1), height: 960 } });
// embedded: a page set with setContent is about:blank, which may not load file:// images
const imgs = frames.map((f) => `<figure style="margin:0;width:390px"><img src="data:image/jpeg;base64,${readFileSync(f.file).toString('base64')}" style="width:390px;height:844px;object-fit:cover;object-position:top;border-radius:12px"><figcaption style="font:600 14px system-ui;color:#ddd;margin-top:10px">${f.note}</figcaption></figure>`).join('');
await p2.setContent(`<body style="margin:0;background:#111;display:flex;gap:20px;padding:20px">${imgs}</body>`);
await p2.waitForTimeout(500);
await p2.screenshot({ path: sheet, type: 'jpeg', quality: 70 });
await b2.close();
const ok = !errors.length && r.scrollWidth <= 390 && scroll <= 390 && summaryWords <= 50 && r.days === 3 && fourDays === 4 && playerOpen;
console.log(JSON.stringify({ ok, sheet, frames: frames.map((f) => f.file), errors, ...r, summaryWords, fourDays, playerOpen }, null, 1));
process.exit(ok ? 0 : 1);
