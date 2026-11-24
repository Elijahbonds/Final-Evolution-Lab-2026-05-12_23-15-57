// LOOK-SCREENS (2026-11-24): phase A3's before/after (docs/LOOK-PASS-AUDIT.md) — the first-run pages, /play, and the places' loading,
// on the look-audit rig (scripts/every-screen/rig.mts). Read-only. Per page and run: a picture at rest (a place: its loading at 3.5 s),
// the layout shift over the first 8 s (PerformanceObserver 'layout-shift', buffered, excluding shifts after input), first contentful
// paint, and the boxes that matter for the findings (the USB line against the splash's venue line; the end card is pictured by
// look-walk.mts). The "phone" tier is the plan's: 390 x 844, DPR 3, touch, CPU 4x slower.
//
//   /home/user/wt/gate-run.sh 1700 npx tsx scripts/probes/look-screens/pages.mts <outDir> --side=before|after [--runs=3] [--tier=portrait|landscape|phone] [--only=id,id]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState, type People, type Person } from '../../every-screen/rig.mts';

const PAGES: { id: string; path: string; who: Person; place?: boolean }[] = [
  { id: 'home', path: '/', who: 'anon' },
  { id: 'try', path: '/try', who: 'anon' },
  { id: 'login', path: '/login', who: 'anon' },
  { id: 'play', path: '/play', who: 'solo' },
  { id: 'closet', path: '/closet', who: 'solo' },   // look-world's flag: the app header over the Closet stage, sideways
  { id: 'venice', path: '/play/venice', who: 'solo', place: true },
  { id: 'coast', path: '/play/coast', who: 'solo', place: true },
  { id: 'arena', path: '/play/arena?sport=hoops', who: 'solo', place: true },
  { id: 'dunk', path: '/play/dunk', who: 'solo', place: true },
];
const TIERS = {
  portrait: { vw: 390, vh: 844, dpr: 2, cpu: 1 },
  landscape: { vw: 844, vh: 390, dpr: 2, cpu: 1 },
  phone: { vw: 390, vh: 844, dpr: 3, cpu: 4 },
} as const;
const CLS_INIT = `(() => { window.__lsCls = 0; window.__lsShifts = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; window.__lsCls += e.value; if (window.__lsShifts.length < 12) window.__lsShifts.push({ t: Math.round(e.startTime), v: Math.round(e.value * 10000) / 10000, n: (e.sources || []).map((s) => s.node ? (s.node.nodeName + '.' + String(s.node.className || '').slice(0, 40)) : '?').slice(0, 3) }); } }).observe({ type: 'layout-shift', buffered: true }); } catch {} })()`;
const SLOW = `(() => { const st = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a); })()`;

async function one(browser: Browser, p: People, pg: typeof PAGES[number], tier: keyof typeof TIERS, side: string, run: number, out: string) {
  const t = TIERS[tier];
  const ctx = await browser.newContext({
    viewport: { width: t.vw, height: t.vh }, deviceScaleFactor: t.dpr, isMobile: true, hasTouch: true, storageState: storageState(p, pg.who),
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 LookScreensRig',
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(CLS_INIT); await page.addInitScript(SLOW);
  if (t.cpu > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: t.cpu }); }
  const tag = `${side}-${tier}-${pg.id}-r${run}`;
  const t0 = Date.now();
  await page.goto(ORIGIN + pg.path, { waitUntil: 'load', timeout: 120000 }).catch((e) => errors.push('goto ' + String(e).slice(0, 120)));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(out, `${tag}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
  await page.waitForTimeout(4500);
  const res = await page.evaluate(`(() => {
    const fcp = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
    const usb = document.querySelector('[data-testid="usb-connect-hint"]');
    const usbVisible = !!usb && !!usb.offsetParent;
    const venueLine = [...document.querySelectorAll('[data-splash-column] p')].find((e) => /COURT|ARENA|BEACH/.test(e.textContent || ''));
    const header = document.querySelector('header');
    const hero = document.querySelector('[data-fel-hero] a[href="/try"]');
    return { cls: Math.round(window.__lsCls * 10000) / 10000, shifts: window.__lsShifts, fcpMs: fcp ? Math.round(fcp.startTime) : null,
      docH: document.documentElement.scrollHeight, hScroll: document.documentElement.scrollWidth > innerWidth + 1,
      header: box(header), usb: usbVisible ? box(usb) : null, venueLine: box(venueLine || null), playNow: box(hero),
      placeCard: !!document.querySelector('[data-place-loading]'), ageCard: !!document.querySelector('[data-age-card]') };
  })()`).catch((e) => ({ err: String(e).slice(0, 160) }));
  await ctx.close();
  return { id: pg.id, tier, side, run, wallS: Math.round((Date.now() - t0) / 1000), errors, ...(res as object) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const side = arg('side') ?? 'after';
  const runs = Number(arg('runs') ?? 3);
  const tier = (arg('tier') ?? 'portrait') as keyof typeof TIERS;
  const only = arg('only')?.split(',');
  mkdirSync(out, { recursive: true });
  dbUp();
  const stop = await serve(join(out, 'server.log'));
  try {
    const p = await makePeople();
    const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    for (let run = 1; run <= runs; run++) for (const pg of PAGES.filter((x) => !only || only.includes(x.id))) {
      let r: Record<string, unknown>;
      try { r = await one(browser, p, pg, tier, side, run, out); } catch (e) { r = { id: pg.id, crash: String(e).slice(0, 200) }; }
      writeFileSync(join(out, `${side}-${tier}-${pg.id}-r${run}.json`), JSON.stringify(r, null, 1));
      console.log(`${side} ${tier} ${pg.id} r${run} cls ${r.cls ?? '-'} fcp ${r.fcpMs ?? '-'} header ${(r.header as { h: number } | null)?.h ?? '-'} usb ${JSON.stringify(r.usb ?? null)} venue ${JSON.stringify(r.venueLine ?? null)} playNow ${JSON.stringify(r.playNow ?? null)} card ${r.placeCard ?? '-'} age ${r.ageCard ?? '-'} err ${(r.errors as string[] | undefined)?.length ?? '?'}`);
    }
    await browser.close();
  } finally { stop(); }
}
