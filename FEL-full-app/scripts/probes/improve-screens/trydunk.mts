// IMPROVE-SCREENS phase 2 (docs/IMPROVE-10-PHASE-AUDIT.md §2.4): a first-time guest on /try, birth date -> the dunk's
// TAP TO START, with a person's typing modelled (a pause on the step). Read-only: a guest makes no account.
// Phone tier as the audit: 390 x 844 touch, DPR 3, CPU slowed 4x. Optional network shaping (--net=4g: 150 ms RTT,
// 9 Mbps down, 1.5 Mbps up, a phone on an ordinary 4G signal; default none, the rig's localhost, as the audit ran).
//
// It records:
//   - the times: the step ready (its buttons live), CONTINUE tapped (the birth date given), LOADING ARENA, TAP TO START;
//   - every request: method, path, type, when it started (relative to CONTINUE), bytes, and whether it carried a body;
//   - THE PRIVACY CHECK: every request that left the browser before CONTINUE. Each must be a GET of a static file (no
//     body, no query string) or the page's own document — nothing that carries anything about the visitor.
//   /home/user/wt/gate-run.sh 1800 npx tsx scripts/probes/improve-screens/trydunk.mts <outDir> [--runs=3] [--pause=10] [--net=4g] [--tag=x]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, serve } from '../../every-screen/rig.mts';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const out = process.argv[2];
if (!out || out.startsWith('--')) { console.error('usage: trydunk.mts <outDir> [--runs=3] [--pause=10] [--net=4g] [--tag=x]'); process.exit(2); }
const runs = Number(arg('runs') ?? 3), pauseS = Number(arg('pause') ?? 10), net = arg('net') ?? 'none', tag = arg('tag') ?? 'try';
mkdirSync(out, { recursive: true });
dbUp();
const stop = await serve(join(out, 'server.log'));
/** a static file: the build's chunks and media, or a public/ asset; nothing that a server answers per visitor */
export const STATIC = /^\/(_next\/static\/|models\/|backdrops\/|loaders\/|textures\/|audio\/|sounds\/|fonts\/|images\/|img\/|hdr\/|env\/|icons?\/|favicon|manifest|[^/?]+\.(png|jpe?g|webp|svg|ico|glb|gltf|bin|ktx2|env|dds|mp3|ogg|wav|m4a|json|woff2?)$)/;
try {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const all: unknown[] = [];
  for (let run = 1; run <= runs; run++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ImproveScreensRig' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    if (net === '4g') await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
    // which requests the browser answered from its own cache (a prefetched file asked for again)
    const urlOf = new Map<string, string>(); const fromCache: string[] = [];
    cdp.on('Network.requestWillBeSent', (e: { requestId: string; request: { url: string } }) => { urlOf.set(e.requestId, e.request.url); });
    cdp.on('Network.requestServedFromCache', (e: { requestId: string }) => { const u = urlOf.get(e.requestId); if (u && Date.now() >= tBirth) fromCache.push(u.replace(ORIGIN, '')); });
    cdp.on('Network.responseReceived', (e: { requestId: string; response: { fromDiskCache?: boolean; url: string } }) => { if (e.response.fromDiskCache && Date.now() >= tBirth) fromCache.push(e.response.url.replace(ORIGIN, '')); });
    // the main thread while the person is on the step: every long task (a keystroke there would wait for it)
    await page.addInitScript(`window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}`);
    const t0 = Date.now();
    let tBirth = Infinity;
    const reqs: { m: string; path: string; type: string; at: number; end?: number; bytes?: number; body: boolean; beforeBirth: boolean; status?: number }[] = [];
    const byReq = new Map<object, (typeof reqs)[number]>();
    page.on('request', (q) => {
      const u = new URL(q.url());
      if (u.origin !== ORIGIN && !u.protocol.startsWith('http')) return;
      const r = { m: q.method(), path: (u.origin === ORIGIN ? '' : u.origin) + u.pathname + u.search, type: q.resourceType(), at: Date.now() - t0, body: !!q.postData(), beforeBirth: Date.now() < tBirth };
      reqs.push(r); byReq.set(q, r);
    });
    page.on('requestfinished', async (q) => { const r = byReq.get(q); if (!r) return; r.end = Date.now() - t0; try { const s = await q.sizes(); r.bytes = s.responseBodySize; r.status = (await q.response())?.status(); } catch { /* gone */ } });
    await page.goto(ORIGIN + '/try', { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('[data-testid="guest-age-step"] select', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(`![...document.querySelectorAll('[data-testid="guest-age-step"] button')].some((b) => b.disabled)`, undefined, { timeout: 60000 }).catch(() => {});
    const tStep = Date.now() - t0;
    const perfStep = await page.evaluate('performance.now()') as number;
    // a person reads the question and types the date: the pause, then the three fields and CONTINUE
    await new Promise((r) => setTimeout(r, pauseS * 1000));
    await page.selectOption('select', '1995').catch(() => {});
    await page.fill('input[aria-label="Month"]', '6').catch(() => {});
    await page.fill('input[aria-label="Day"]', '15').catch(() => {});
    const cont = await page.locator('button').filter({ hasText: /^\s*continue\s*$/i }).first().boundingBox().catch(() => null);
    const perfBirth = await page.evaluate('performance.now()') as number;
    const onStep = (await page.evaluate('window.__lt') as number[][]).filter(([t]) => t >= perfStep && t < perfBirth);
    tBirth = Date.now();
    if (cont) await page.touchscreen.tap(cont.x + cont.width / 2, cont.y + cont.height / 2);
    const birthAt = tBirth - t0;
    const tArena = await page.waitForFunction(`/LOADING ARENA/i.test(document.body.innerText)`, undefined, { timeout: 120000, polling: 200 }).then(() => Date.now() - t0).catch(() => null);
    const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 240000 }).then(() => true).catch(() => false);
    const tReady = ready ? Date.now() - t0 : null;
    await page.screenshot({ path: join(out, `${tag}${run}-ready.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const before = reqs.filter((r) => r.beforeBirth);
    const notStatic = before.filter((r) => !(r.m === 'GET' && !r.body && (r.type === 'document' || (STATIC.test(r.path) && !r.path.includes('?')))));
    const res = {
      run, tag, net, pauseS, stepReadyMs: tStep, birthAt, arenaAfterBirthMs: tArena === null ? null : tArena - birthAt,
      readyAfterBirthMs: tReady === null ? null : tReady - birthAt, readyMs: tReady,
      requests: reqs.length, bytes: reqs.reduce((a, r) => a + (r.bytes ?? 0), 0),
      beforeBirth: { n: before.length, bytes: before.reduce((a, r) => a + (r.bytes ?? 0), 0), notStatic: notStatic.map((r) => `${r.m} ${r.path} ${r.type}${r.body ? ' BODY' : ''}`) },
      afterBirth: reqs.filter((r) => !r.beforeBirth).map((r) => ({ m: r.m, path: r.path, type: r.type, at: r.at - birthAt, end: r.end === undefined ? null : r.end - birthAt, bytes: r.bytes ?? null, status: r.status ?? null })),
      longTasksOnStep: { n: onStep.length, worstMs: onStep.reduce((a, [, d]) => Math.max(a, d), 0), totalMs: onStep.reduce((a, [, d]) => a + d, 0) },
      servedFromCacheAfterBirth: [...new Set(fromCache)],
      prefetchedBeforeBirth: before.filter((r) => r.at > tStep).map((r) => `${r.path} ${r.bytes ?? '?'}`),
      errors,
    };
    all.push(res);
    console.log(`${tag}${run} net ${net}: step ready ${tStep} birth ${birthAt} arena +${res.arenaAfterBirthMs} READY +${res.readyAfterBirthMs} | long tasks on the step ${res.longTasksOnStep.n} (worst ${res.longTasksOnStep.worstMs} ms) | before birth ${before.length} req ${Math.round(res.beforeBirth.bytes / 1024)} KB, not static ${notStatic.length} [${res.beforeBirth.notStatic.slice(0, 4).join('; ')}] | after ${res.afterBirth.length} req, ${res.servedFromCacheAfterBirth.length} from cache, err ${errors.length}`);
    writeFileSync(join(out, `${tag}-all.json`), JSON.stringify(all, null, 1));
    await ctx.close();
  }
  await browser.close();
} finally { stop(); }
