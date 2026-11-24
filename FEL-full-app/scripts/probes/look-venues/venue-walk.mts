// LOOK-VENUES (look pass lane B, 2026-11-24): the A/B walk for phases B1-B3 of docs/LOOK-PASS-AUDIT.md.
//
// The audit's look-walk.mts, cut to what a venue A/B needs: the same route opened with each VARIANT's query (e.g. `aa=0` / `aa=1`),
// the variants INTERLEAVED inside every run (A B A B ...) so a slow minute on the shared box lands on both sides, and N runs.
//   shots  the phone (or desktop) pictures at full render scale (`perf=off` is added: the rig's guard would soften one side), a
//          lossless PNG of the moment 3 s into play (the edge metric reads it) and a JPG of it and of +6 s after the stick and a button.
//   perf   the owner's PERF readout on the phone tier (390x844, DPR 3, touch, CPU 4x slower), read after 9 s of play, the guard ON
//          (as a phone runs); READY time too. The control (tennis) runs in the same hold.
// Every run's JSON keeps the rig's [FEL-TIER] lines, which include the light rig's "edges: msaa N, fxaa on|off" line: the proof that
// the variant was applied (a variant whose line does not match is a failed control, not a result).
//
//   /home/user/wt/gate-run.sh 1790 npx tsx scripts/probes/look-venues/venue-walk.mts <outDir> shots --tier=portrait \
//       --ids=onevone,threevthree,dunk --variants=aa=0,aa=1,aa=2 --runs=3 --tag=b1
//   /home/user/wt/gate-run.sh 1790 npx tsx scripts/probes/look-venues/venue-walk.mts <outDir> perf \
//       --ids=tennis,onevone,dunk --variants=aa=0,aa=1 --runs=3 --tag=b1p   (tennis runs with the first variant only: the control)
// Needs the every-screen rig's production build first (scripts/every-screen/rig.mts build) with the same ES_* env; FEEL_PANEL_ENABLED=1
// for the perf job (the PERF tab opens for the rig's admin only).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState, type People, type Person } from '../../every-screen/rig.mts';

type Kind = 'game' | 'hub' | 'adventure';
interface Route { id: string; path: string; kind: Kind }
const ROUTES: Route[] = [
  { id: 'onevone', path: '/play/onevone', kind: 'game' },
  { id: 'threevthree', path: '/play/threevthree', kind: 'game' },
  { id: 'threepoint', path: '/play/threepoint', kind: 'game' },
  { id: 'dunk', path: '/play/dunk', kind: 'game' },
  { id: 'tennis', path: '/play/tennis', kind: 'game' },
  { id: 'venice', path: '/play/venice', kind: 'hub' },
  { id: 'adventure', path: '/play/adventure', kind: 'adventure' },
];
const CONTROL = 'tennis';

interface Tier { id: 'portrait' | 'landscape' | 'desktop' | 'phoneperf'; vw: number; vh: number; dpr: number; touch: boolean; cpu: number }
const TIERS: Record<Tier['id'], Tier> = {
  portrait: { id: 'portrait', vw: 390, vh: 844, dpr: 2, touch: true, cpu: 1 },
  landscape: { id: 'landscape', vw: 844, vh: 390, dpr: 2, touch: true, cpu: 1 },
  desktop: { id: 'desktop', vw: 1280, vh: 720, dpr: 1, touch: false, cpu: 1 },
  phoneperf: { id: 'phoneperf', vw: 390, vh: 844, dpr: 3, touch: true, cpu: 4 },
};

// the harness's 20 s load watchdog is a phone-on-a-network guard; software GL on a shared box can take longer to build a venue
const INIT = `(() => { const st = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a); })()`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shot = async (page: Page, file: string, type: 'jpeg' | 'png' = 'jpeg') => {
  await page.screenshot({ path: file, type, ...(type === 'jpeg' ? { quality: 80 } : {}), timeout: 90000 }).catch(() => {});
};
async function tap(page: Page, t: Tier, x: number, y: number) { if (t.touch) await page.touchscreen.tap(x, y).catch(() => {}); else await page.mouse.click(x, y).catch(() => {}); }
async function tapSel(page: Page, t: Tier, sel: string): Promise<boolean> {
  const box = await page.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return false;
  await tap(page, t, box.x + box.width / 2, box.y + box.height / 2);
  return true;
}
/** a few seconds of play: the stick (or WASD) and an action button, so bodies move */
async function drive(page: Page, t: Tier, ms: number) {
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    if (t.touch) {
      await page.touchscreen.tap(Math.round(t.vw * 0.2), Math.round(t.vh * 0.78)).catch(() => {});
      await sleep(500);
      await page.touchscreen.tap(Math.round(t.vw * 0.85), Math.round(t.vh * 0.8)).catch(() => {});
    } else {
      const k = ['w', 'd', 's', 'a'][i % 4];
      await page.keyboard.down(k).catch(() => {}); await sleep(600); await page.keyboard.up(k).catch(() => {});
      await page.keyboard.press(i % 2 ? 'Space' : 'j').catch(() => {});
    }
    i++; await sleep(500);
  }
}
async function readout(page: Page): Promise<string | null> {
  return page.evaluate(`(() => { const el = document.querySelector('[data-fel-perf-readout] pre'); return el ? el.textContent : null; })()`).catch(() => null) as Promise<string | null>;
}

const withQuery = (path: string, q: string) => (q ? path + (path.includes('?') ? '&' : '?') + q : path);

async function one(browser: Browser, t: Tier, p: People, r: Route, variant: string, out: string, base: string, perf: boolean) {
  const who: Person = perf ? 'admin' : 'solo';
  const ctx = await browser.newContext({
    viewport: { width: t.vw, height: t.vh }, deviceScaleFactor: t.dpr, isMobile: t.touch, hasTouch: t.touch,
    storageState: storageState(p, who) as never,
    userAgent: t.touch ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 LookVenuesRig'
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 LookVenuesRig',
  });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors: string[] = []; const tierLines: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { const s = m.text(); if (/\[FEL-TIER\]|\[FEL-CANVAS\]|FEL-PERF|\[FEL-VQ\]/.test(s) && tierLines.length < 30) tierLines.push(s.slice(0, 220)); });
  if (t.cpu > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: t.cpu }); }
  // pictures at full render scale (the guard would soften one side at random); the perf job keeps the guard, as a phone does
  const q = perf ? variant : [variant, 'perf=off'].filter(Boolean).join('&');
  const path = withQuery(r.path, q);
  const res: Record<string, unknown> = { id: r.id, path, variant, tier: t.id };
  const t0 = Date.now();
  await page.goto(ORIGIN + path, { waitUntil: 'load', timeout: 90000 }).catch((e) => errors.push('goto: ' + String(e).slice(0, 160)));
  let started = false;
  if (r.kind === 'game') {
    const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 240000 }).then(() => true).catch(() => false);
    res.readyS = ready ? Math.round((Date.now() - t0) / 100) / 10 : null;
    if (ready) {
      const startBtn = page.locator('[data-splash-phase="ready"] button, [data-splash-phase="ready"] [role="button"]').filter({ hasText: /tap to start|^start$/i }).first();
      const sb = await startBtn.boundingBox().catch(() => null);
      if (sb) await tap(page, t, sb.x + sb.width / 2, sb.y + sb.height / 2); else await tapSel(page, t, '[data-splash-phase="ready"]');
      started = await page.waitForFunction(`!document.querySelector('[data-splash-phase]')`, undefined, { timeout: 60000 }).then(() => true).catch(() => false);
    }
  } else if (r.kind === 'hub') {
    started = await page.waitForFunction(`!/Heading to the courts|Sailing to the coast/.test(document.body.innerText) && !!document.querySelector('canvas')`, undefined, { timeout: 240000 }).then(() => true).catch(() => false);
    res.readyS = started ? Math.round((Date.now() - t0) / 100) / 10 : null;
  } else {
    const pick = await page.waitForSelector('[data-testid="adventure-partner-picker"], [data-testid="adventure-start"]', { timeout: 120000 }).then((h) => h.getAttribute('data-testid')).catch(() => null);
    if (pick === 'adventure-partner-picker') {
      await tapSel(page, t, '[data-testid^="partner-species-"]');
      await page.waitForTimeout(300);
      await tapSel(page, t, '[data-testid="adventure-partner-confirm"]');
    }
    const ready = await page.waitForSelector('[data-testid="adventure-start"]:not([disabled])', { timeout: 240000 }).then(() => true).catch(() => false);
    res.readyS = ready ? Math.round((Date.now() - t0) / 100) / 10 : null;
    if (ready) { await tapSel(page, t, '[data-testid="adventure-start"]'); started = true; }
  }
  res.started = started;
  if (started) {
    if (perf) {
      await page.waitForTimeout(2500);
      res.perfTab = await tapSel(page, t, '[data-testid="perf-tab"]');
      await drive(page, t, 9000);
      res.readout = await readout(page);
      await shot(page, `${base}-perf.jpg`);
    } else {
      await page.waitForTimeout(3000);
      await shot(page, `${base}-c-play.png`, 'png');
      await shot(page, `${base}-c-play.jpg`);
      await drive(page, t, 6000);
      await shot(page, `${base}-d-play.jpg`);
    }
  }
  res.errors = errors; res.tierLines = tierLines;
  res.edges = tierLines.find((l) => l.includes('edges:')) ?? null;
  res.wallS = Math.round((Date.now() - t0) / 1000);
  await ctx.close();
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  const job = process.argv[3];
  if (!out || !/^(shots|perf)$/.test(job ?? '')) { console.error('usage: venue-walk.mts <outDir> shots|perf [--tier=portrait|landscape|desktop] --ids=a,b --variants=q1,q2 [--runs=3] [--from=1] [--tag=x]'); process.exit(2); }
  const arg = (k: string) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
  const perf = job === 'perf';
  const tier = perf ? TIERS.phoneperf : TIERS[(arg('tier') ?? 'portrait') as Tier['id']];
  const ids = (arg('ids') ?? 'onevone').split(',');
  // a variant is a query string ('' = none); ';' separates several params inside one variant (aa=1;vq=ibl)
  const variants = (arg('variants') ?? '').split(',').map((v) => v.replace(/;/g, '&'));
  const runs = Number(arg('runs') ?? 3);
  const from = Number(arg('from') ?? 1);   // the first run's number: one round per gate hold, numbered on (--from=2 --runs=1)
  const tag = arg('tag') ?? (perf ? 'p' : 's');
  mkdirSync(out, { recursive: true });
  dbUp();
  const stop = await serve(join(out, 'server.log'));
  try {
    const p = await makePeople();
    const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
    for (let n = from; n < from + runs; n++) {
      for (const id of ids) {
        const r = ROUTES.find((x) => x.id === id);
        if (!r) { console.error('unknown id', id); continue; }
        // the control runs once a round with TODAY's variant (none, or the one ending =0, else the first), whatever order the variants
        // run in: its spread across rounds is the rig's own noise
        const today = variants.find((x) => x === '' || /=0$/.test(x)) ?? variants[0];
        for (const v of id === CONTROL && perf ? [today] : variants) {
          const vname = v.replace(/[^a-z0-9=]+/gi, '_').replace(/=/g, '') || 'none';
          const base = join(out, `${tag}-${tier.id}-${id}-${vname}-r${n}`);
          const t = Date.now();
          let res: Record<string, unknown>;
          try { res = await one(browser, tier, p, r, v, out, base, perf); } catch (e) { res = { id, variant: v, crash: String(e).slice(0, 300) }; }
          res.run = n;
          writeFileSync(`${base}.json`, JSON.stringify(res, null, 1));
          console.log(`${tier.id} ${id} [${v}] r${n} ${Math.round((Date.now() - t) / 1000)}s ready ${res.readyS ?? '-'} started ${res.started ?? '-'} err ${(res.errors as string[] | undefined)?.length ?? '?'} | ${res.edges ?? 'no edges line'}${res.readout ? ' | ' + String(res.readout).replace(/\n/g, ' | ') : ''}`);
        }
      }
    }
    await browser.close();
  } finally { stop(); }
}
