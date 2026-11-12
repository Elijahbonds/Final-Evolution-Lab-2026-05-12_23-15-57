// switch-on (2026-11-10): why the Studio's colour field "timed out" on a phone (STUDIO-EASY-AUDIT §5, the one open item, seen again
// on 2026-11-10: phone · place · locator.fill timeout). Reuses the studio-easy probe's bundle (<outDir>/.build-<label>, made by
// `_studio-easy-probe.mts <outDir> <label> --build-only`); serves it the same way; at 390 × 844 places a floodlight, opens Inspect,
// and reports the colour input as Playwright and the page see it: visible, box, what sits on its centre, and the error a 6 s fill
// gives. Then the same at 1280 × 800 as the control (desktop passed).
//   /home/user/wt/gate-run.sh 600 npx tsx scripts/probes/switch-on/studio-colour.mts <outDir> <label>
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../../..');
const [outDir, label = 'now'] = process.argv.slice(2);
const BUILD = join(resolve(outDir), `.build-${label}`);
if (!existsSync(join(BUILD, 'index.html'))) { console.error(`no bundle at ${BUILD}`); process.exit(2); }
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.env': 'application/octet-stream', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}'); return; }
  const file = p.startsWith('/__fonts/') ? join(ROOT, 'app/fonts', p.slice(9)) : existsSync(join(BUILD, p)) && p !== '/' ? join(BUILD, p) : join(ROOT, 'public', p);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const btn = (re: string) => `button:text-matches("${re}", "i"), [role=tab]:text-matches("${re}", "i")`;

async function measure(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { coach: 'coming_soon', studio: 'coming_soon' } }));
  await page.goto(`${ORIGIN}/index.html?fresh=1`, { timeout: 120000 });
  await page.waitForFunction('document.body.dataset.a11yReady || document.body.dataset.a11yError', null, { timeout: 60000 });
  await page.waitForFunction('!!window.__NEXUS_STUDIO__', null, { timeout: 150000 }).catch(() => {});
  const sheet = page.locator(btn('^(assets|add)$')).filter({ visible: true });
  if (await sheet.count() && (await sheet.first().getAttribute('aria-selected')) !== 'true') await sheet.first().click().catch(() => sheet.first().dispatchEvent('click'));
  await page.locator('[data-testid=asset-list] button:has-text("Floodlight")').filter({ visible: true }).first().click({ timeout: 15000 }).catch(() => page.locator('[data-testid=asset-list] button:has-text("Floodlight")').first().dispatchEvent('click'));
  await page.waitForTimeout(400);
  const tab = page.locator(btn('^inspect')).filter({ visible: true });
  if (await tab.count()) await tab.first().click().catch(() => tab.first().dispatchEvent('click'));
  await page.waitForTimeout(400);
  const all = page.locator('[data-testid=inspector] input[type=color]');
  const state = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLInputElement>('[data-testid=inspector] input[type=color]')];
    return els.map((e) => {
      const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], display: s.display, visibility: s.visibility, opacity: s.opacity,
        disabled: e.disabled, readOnly: e.readOnly, label: e.getAttribute('aria-label') ?? '', onTop: top === e ? 'itself' : top ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}.${String(top.className).slice(0, 60)}` : 'nothing',
        inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
    });
  });
  const vis = page.locator('[data-testid=inspector] input[type=color]').filter({ visible: true }).first();
  let fill = 'no visible colour input';
  if (await vis.count()) fill = await vis.fill('#ff3366', { timeout: 6000 }).then(() => 'filled', (e) => String(e).split('\n').filter((l) => /waiting|element|intercepts|not|retrying|Timeout/.test(l)).slice(0, 8).join(' | '));
  const value = await vis.count() ? await vis.inputValue().catch(() => '?') : '';
  await page.screenshot({ path: join(resolve(outDir), `colour-${width}.jpg`), type: 'jpeg', quality: 70 });
  return { width, inputs: await all.count(), state, fill, value };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h] of [[390, 844], [1280, 800]] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 768 });
  const page = await ctx.newPage();
  console.log(JSON.stringify(await measure(page, w, h).catch((e) => ({ width: w, error: String(e).slice(0, 300) }))));
  await ctx.close();
}
await browser.close(); server.close();
