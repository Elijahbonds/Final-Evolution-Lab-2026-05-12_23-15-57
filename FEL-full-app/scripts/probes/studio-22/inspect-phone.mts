// studio-22 (2026-11-11): where the inspector's fields are when a person opens Inspect after placing a light, at a phone
// (390 × 844) and the desktop control (1280 × 800). Nothing is filled or scrolled by the rig: it reports what is on the first
// screen as the person sees it. Reuses the studio-easy probe's bundle (<outDir>/.build-<label>, made by
// `_studio-easy-probe.mts <outDir> <label> --build-only`).
//   /home/user/wt/gate-run.sh 600 npx tsx scripts/probes/studio-22/inspect-phone.mts <outDir> <label> [--port=3711]
// Prints one JSON line a width: the page's scroll, the boxes of the header, viewport, sheet tabs and inspector, the
// inspector's own scroll, and each field (label, box, fully on screen). Writes inspect-<width>-<label>.jpg into <outDir>.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const port = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 0);
const [outDir, label = 'now'] = pos;
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
await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const btn = (re: string) => `button:text-matches("${re}", "i"), [role=tab]:text-matches("${re}", "i")`;
const press = async (page: Page, sel: string) => { const l = page.locator(sel).filter({ visible: true }).first(); await l.click({ timeout: 15000 }).catch(() => l.dispatchEvent('click')); };

async function measure(page: Page, width: number, height: number) {
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { coach: 'coming_soon', studio: 'coming_soon' } }));
  await page.goto(`${ORIGIN}/index.html?fresh=1`, { timeout: 120000 });
  await page.waitForFunction('document.body.dataset.a11yReady || document.body.dataset.a11yError', null, { timeout: 60000 });
  await page.waitForFunction('!!window.__NEXUS_STUDIO__', null, { timeout: 150000 }).catch(() => {});
  const sheet = page.locator(btn('^(assets|add)$')).filter({ visible: true });
  if (await sheet.count() && (await sheet.first().getAttribute('aria-selected')) !== 'true') await press(page, btn('^(assets|add)$'));
  await press(page, '[data-testid=asset-list] button:has-text("Floodlight")');
  await page.waitForTimeout(400);
  // before Inspect: what the studio-easy probe's "is the inspector already showing?" check sees (it skipped the Inspect tap on a phone)
  const pre = page.locator('[data-testid=inspector] input[type=color]');
  const preSeen = { count: await pre.count(), visibleFilter: await pre.filter({ visible: true }).count(),
    // a real function with no named inner function (tsx would wrap a named one in a helper the page does not have)
    each: await pre.evaluateAll((els) => els.map((e) => ({ box: [e.getBoundingClientRect().left, e.getBoundingClientRect().top, e.getBoundingClientRect().width, e.getBoundingClientRect().height].map(Math.round),
      rects: e.getClientRects().length, label: e.getAttribute('aria-label'), aside: e.closest('aside') ? getComputedStyle(e.closest('aside')!).display : 'no aside',
      sheet: document.querySelector('[data-testid=sheet-inspect]')?.getAttribute('aria-selected') ?? 'no tab' }))) };
  if (await page.locator('[data-testid=sheet-inspect]').filter({ visible: true }).count()) await press(page, '[data-testid=sheet-inspect]');
  await page.waitForTimeout(700);
  // a string, not a function: tsx names arrow functions with a helper the page does not have
  const r = await page.evaluate(`(() => {
    const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const insp = document.querySelector('[data-testid=inspector]') ;
    const aside = document.getElementById('studio-inspector');
    const scroller = [insp, aside].find((e) => e && e.scrollHeight > e.clientHeight + 1);
    const fields = [...(insp?.querySelectorAll('input, select, button') ?? [])].map((e) => {
      const b = e.getBoundingClientRect();
      const clip = aside?.getBoundingClientRect();
      const onScreen = b.top >= 0 && b.bottom <= innerHeight && (!clip || (b.top >= clip.top && b.bottom <= clip.bottom));
      return { label: e.getAttribute('aria-label') || e.getAttribute('title') || e.tagName.toLowerCase(), top: Math.round(b.top), onScreen };
    });
    const colour = fields.find((f) => f.label === 'Light colour');
    return {
      page: { scrollY: Math.round(scrollY), scrollHeight: document.documentElement.scrollHeight, innerHeight },
      header: box(document.querySelector('[data-testid=nexus-studio] > header')),
      viewport: box(document.querySelector('section[aria-label=Viewport]')),
      tabs: box(document.querySelector('nav[aria-label=Panels]')),
      inspector: box(aside),
      scroll: scroller ? { scrollTop: Math.round(scroller.scrollTop), clientHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight } : null,
      colour, belowScreenPx: colour ? Math.max(0, colour.top + 24 - innerHeight) : null,
      fieldsOnScreen: fields.filter((f) => f.onScreen).map((f) => f.label),
      focus: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
    };
  })()`) as Record<string, unknown>;
  await page.screenshot({ path: join(resolve(outDir), `inspect-${width}-${label}.jpg`), type: 'jpeg', quality: 72 });
  return { width, height, preInspect: preSeen, ...r };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [w, h] of [[390, 844], [1280, 800]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 768 });
    const page = await ctx.newPage();
    console.log(JSON.stringify(await measure(page, w, h).catch((e) => ({ width: w, error: String(e).slice(0, 300) }))));
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
