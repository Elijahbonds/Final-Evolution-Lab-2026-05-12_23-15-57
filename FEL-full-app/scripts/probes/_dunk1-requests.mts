// _dunk1-requests — what a phone downloads before dunk 1 on /try, and that none of it comes from a Babylon CDN (FDB-2, 2026-10-17).
//
//   BASE=http://localhost:3197 npx --no-install tsx scripts/probes/_dunk1-requests.mts            (/links → "Play FEL")
//   BASE=http://localhost:3197 DIRECT=1 npx --no-install tsx scripts/probes/_dunk1-requests.mts   (a cold, direct /try open)
//
// Against a production build (`next start`; /dev/* is not needed). AM's method: /links → "Play FEL" → /try on a phone (393×852,
// DPR 3, touch, 4G 9/1.5 Mbps 150 ms, 4× CPU), then TAP TO START, hold ArrowUp+Space, let go, J. "Before dunk 1" is decided on the
// PAGE's clock: Resource Timing's startTime against DunkMode's `performance.mark('fel:dunk1-in')`, never against the time this
// process happens to receive a console line (that is how AM's run put rivals/jinx.glb, the request after the mark, before it).
// Bytes are each response's encoded body + headers (Playwright's request.sizes()), workers included: the Draco wrapper is fetched
// by the decoder's worker, and never shows in the page's own Resource Timing (it is counted under worker/unknown).
// DIRECT=1 (FDB-4: AM's bar of record, < 8,000,000 B) opens /try cold and counts everything from the navigation to the mark,
// the document and the decoder's worker fetches included.
// Exit 1 if any request went to *.babylonjs.com, a song preview (/audio/songs/*/preview.mp3) started before the mark (FDB-2:
// /try's soundtrack waits for dunk 1), or the dunk never came.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3197';
const THROTTLE = process.env.THROTTLE !== '0';
const DIRECT = process.env.DIRECT === '1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
const bytes: { url: string; bytes: number }[] = [];   // every finished response, page and workers
const hosts = new Map<string, number>();
context.on('request', (r) => { try { const h = new URL(r.url()).host || '(data/blob)'; hosts.set(h, (hosts.get(h) ?? 0) + 1); } catch { /* not a URL */ } });
context.on('requestfinished', async (r) => { try { const z = await r.sizes(); bytes.push({ url: r.url(), bytes: z.responseBodySize + z.responseHeadersSize }); } catch { /* a page that closed */ } });
const cdp = await context.newCDPSession(page);
if (THROTTLE) {
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}
await page.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch { /* old engine */ } });

let clickAt = 0;   // the page's clock: /links → /try is one document; a direct open counts from its navigation (0)
if (DIRECT) {
  await page.goto(`${BASE}/try`, { waitUntil: 'commit', timeout: 120_000 });
} else {
  await page.goto(`${BASE}/links`, { waitUntil: 'load', timeout: 120_000 });
  await sleep(1500);
  clickAt = await page.evaluate(() => performance.now());
  await page.click('a[data-link="play"]');
}
const t0 = Date.now();
let state = '';
while (Date.now() - t0 < 300_000 && state !== 'loaded' && state !== 'failed') { state = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); await sleep(250); }
console.log(`ready: ${state || 'never'} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
let marked = false;
if (state === 'loaded') {
  await sleep(1500);
  await page.getByText('TAP TO START').first().click({ timeout: 10_000 }).catch(() => {});
  await sleep(1500);
  for (let attempt = 0; attempt < 4 && !marked; attempt++) {
    await page.keyboard.down('ArrowUp'); await page.keyboard.down(' ');
    await sleep(2600);
    await page.keyboard.up(' '); await page.keyboard.up('ArrowUp');
    await sleep(250); await page.keyboard.press('j'); await sleep(200); await page.keyboard.press('j');
    for (let i = 0; i < 60 && !marked; i++) { marked = await page.evaluate(() => performance.getEntriesByName('fel:dunk1-in').length > 0); await sleep(200); }
  }
}
// let the contest set land (the network quiet for 15 s, at most 120 s)
let last = bytes.length, quietSince = Date.now();
for (const end = Date.now() + 120_000; Date.now() < end && Date.now() - quietSince < 15_000; await sleep(500)) if (bytes.length !== last) { last = bytes.length; quietSince = Date.now(); }

const clock = await page.evaluate(() => ({
  mark: performance.getEntriesByName('fel:dunk1-in')[0]?.startTime ?? null,
  res: performance.getEntriesByType('resource').map((e) => ({ name: e.name, start: e.startTime })),
}));
const startOf = new Map<string, number>();
if (DIRECT) startOf.set(`${BASE}/try`, 0);   // the document: not a Resource Timing entry
for (const r of clock.res) if (!startOf.has(r.name)) startOf.set(r.name, r.start);
const before: { url: string; bytes: number }[] = [];
let after = 0, unknown = 0;
for (const b of bytes) {
  const s = startOf.get(b.url);
  if (s == null || clock.mark == null) unknown += b.bytes;      // worker fetches are not in the page's Resource Timing
  else if (s < clock.mark) before.push(b); else after += b.bytes;
}
const mb = (n: number) => (n / 1e6).toFixed(2);
before.sort((a, b) => b.bytes - a.bytes);
console.log(`dunk 1: ${clock.mark == null ? 'NEVER' : 'in'}`);
const fromClick = before.filter((b) => (startOf.get(b.url) ?? 0) >= clickAt);
console.log(`before dunk 1: ${mb(fromClick.reduce((a, b) => a + b.bytes, 0))} MB from the click (${mb(before.reduce((a, b) => a + b.bytes, 0))} MB with /links) · after: ${mb(after)} MB · worker/unknown: ${mb(unknown)} MB`);
// the bar (FDB-4): exact bytes to the mark, plus the decoder's worker fetches (off the page's clock, loaded with the first Draco model)
const counted = (DIRECT ? before : fromClick).reduce((a, b) => a + b.bytes, 0);
const workerDraco = bytes.filter((b) => /\/loaders\/draco\//.test(b.url) && !startOf.has(b.url)).reduce((a, b) => a + b.bytes, 0);
const total = counted + workerDraco;
console.log(`${DIRECT ? 'cold direct /try' : 'from the click'} → fel:dunk1-in: ${counted.toLocaleString('en-US')} B + Draco worker ${workerDraco.toLocaleString('en-US')} B = ${total.toLocaleString('en-US')} B (bar < 8,000,000 B: ${total < 8_000_000 ? 'under' : 'OVER'})`);
for (const b of before.filter((x) => x.bytes >= 20_000)) console.log(`  ${(b.bytes / 1024).toFixed(0).padStart(6)} KB  ${b.url.replace(BASE, '')}`);
const offClock = [...bytes].filter((b) => !b.url.startsWith('data:') && !b.url.startsWith('blob:') && (clock.mark == null || !startOf.has(b.url)));
console.log(`worker/unknown: ${offClock.map((b) => `${b.url.replace(BASE, '')} ${(b.bytes / 1024).toFixed(0)} KB`).join(' · ') || 'none'}`);
const firstGlbAfter = clock.mark == null ? null : clock.res.filter((r) => /\.glb/.test(r.name) && r.start >= clock.mark!).sort((a, b) => a.start - b.start)[0];
if (firstGlbAfter) console.log(`first GLB after the mark: ${firstGlbAfter.name.replace(BASE, '')} (+${(firstGlbAfter.start - clock.mark!).toFixed(1)} ms)`);
console.log(`/favicon.svg requests: ${bytes.filter((b) => /\/favicon\.svg/.test(b.url)).length}`);
console.log(`hosts: ${[...hosts].map(([h, n]) => `${h} ×${n}`).join(' · ')}`);
const previews = clock.res.filter((r) => /\/audio\/songs\/[^/]+\/preview\.mp3/.test(r.name));
const early = clock.mark == null ? previews : previews.filter((r) => r.start < clock.mark!);
console.log(`song previews: ${previews.map((r) => `${r.name.replace(BASE, '')} ${clock.mark == null ? '' : `${r.start < clock.mark ? '' : '+'}${((r.start - clock.mark) / 1000).toFixed(2)} s`}`).join(' · ') || 'none'}`);
console.log(early.length ? `FAIL: ${early.length} song preview(s) before the fel:dunk1-in mark` : 'song previews before dunk 1: 0');
const cdn = [...hosts.keys()].filter((h) => /(^|\.)babylonjs\.com$/.test(h));
console.log(cdn.length ? `FAIL: requests to ${cdn.join(', ')}` : 'babylonjs.com requests: 0');
await browser.close();
process.exit(cdn.length || early.length || clock.mark == null ? 1 : 0);
