// LOOK-AUDIT (2026-11-24): what the game LOOKS like today, at the three sizes players hold it — the instrument behind
// docs/LOOK-PASS-AUDIT.md. Read-only: it opens pages and taps the way a player would; it writes nothing to the app or its
// database except the rig's own sign-ins (scripts/every-screen/rig.mts).
//
// Two jobs:
//   shots  — per screen and per size (upright phone 390x844 touch, sideways phone 844x390 touch, desktop 1280x720), JPGs at
//            the moments a player sees most: a page at rest (and its full length); a game's loading card, its READY screen,
//            the first seconds of play and a few seconds later (after the stick and a button were pressed). No CPU throttle:
//            the pictures are what is judged here, and the frame clock is the second job's.
//   perf   — the owner's own PERF readout (lib/babylon/core/perfReadout.ts, opened through its PERF tab as the rig's admin) on
//            the phone tier (390x844, DPR 3, touch, CPU slowed 4x): draw calls, active meshes, texture MB, frame p50 / p95 and
//            JS work per frame. SwiftShader draws on the CPU, so frame times are a comparison with the control (tennis), never a
//            phone's; draw calls, meshes and texture MB are the same numbers a phone pays for.
//
//   /home/user/wt/gate-run.sh 1700 npx tsx scripts/probes/look-audit/look-walk.mts <outDir> shots --tier=portrait|landscape|desktop [--only=id,id] [--tag=b1]
//   /home/user/wt/gate-run.sh 1700 npx tsx scripts/probes/look-audit/look-walk.mts <outDir> perf [--only=id,id] [--tag=p1]
// ES_PORT / ES_DIST / ES_PG_DIR / ES_PG_PORT / ES_OUT pick the rig's port, build folder and throwaway database (rig.mts).
// A phase in docs/LOOK-PASS-AUDIT.md takes its before/after from this file: same route, same size, same moment.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState, type People, type Person } from '../../every-screen/rig.mts';

type Kind = 'page' | 'game' | 'arena' | 'hub' | 'adventure';
interface Route { id: string; path: string; who: Person; kind: Kind; extra?: boolean }
export const ROUTES: Route[] = [
  { id: 'home', path: '/', who: 'anon', kind: 'page' },
  { id: 'try', path: '/try', who: 'anon', kind: 'page' },
  { id: 'signup', path: '/signup', who: 'anon', kind: 'page' },
  { id: 'login', path: '/login', who: 'anon', kind: 'page' },
  { id: 'play', path: '/play', who: 'solo', kind: 'page' },
  { id: 'modes', path: '/modes', who: 'solo', kind: 'page' },
  { id: 'store', path: '/store', who: 'solo', kind: 'page' },
  { id: 'account', path: '/account', who: 'solo', kind: 'page' },
  { id: 'train', path: '/train', who: 'solo', kind: 'page' },
  { id: 'groups', path: '/groups', who: 'solo', kind: 'page' },
  { id: 'closet', path: '/closet', who: 'solo', kind: 'page' },
  { id: 'onevone', path: '/play/onevone', who: 'solo', kind: 'game' },
  { id: 'threevthree', path: '/play/threevthree', who: 'solo', kind: 'game' },
  { id: 'threepoint', path: '/play/threepoint', who: 'solo', kind: 'game' },
  { id: 'dunk', path: '/play/dunk', who: 'solo', kind: 'game' },
  { id: 'tennis', path: '/play/tennis', who: 'solo', kind: 'game' },
  { id: 'arena-hoops', path: '/play/arena?sport=hoops', who: 'solo', kind: 'arena' },
  { id: 'arena-threes', path: '/play/arena?sport=threes', who: 'solo', kind: 'arena' },
  { id: 'arena-threepoint', path: '/play/arena?sport=threepoint', who: 'solo', kind: 'arena' },
  { id: 'venice', path: '/play/venice', who: 'solo', kind: 'hub' },
  { id: 'coast', path: '/play/coast', who: 'solo', kind: 'hub' },
  { id: 'adventure', path: '/play/adventure', who: 'solo', kind: 'adventure' },
  // A/B variants (only with --only): the switched-off look lifts that already ship behind a URL switch
  // (lib/babylon/scene/venueQualityV1.ts: ?vq=ibl is venue.iblEnvV1, the prefiltered CC0 sky light), and the pre-pass look
  { id: 'onevone-ibl', path: '/play/onevone?vq=ibl', who: 'solo', kind: 'game', extra: true },
  { id: 'threevthree-ibl', path: '/play/threevthree?vq=ibl', who: 'solo', kind: 'game', extra: true },
  { id: 'dunk-ibl', path: '/play/dunk?vq=ibl', who: 'solo', kind: 'game', extra: true },
  // the rig's perf guard steps every scene down to 0.6-0.75 render scale on SwiftShader (its [FEL-PERF] lines); a phone that keeps
  // up stays at 1. ?perf=off (lib/babylon/core/perfGuard.ts) draws at full scale, so edges and textures are judged as a phone shows them
  { id: 'onevone-perfoff', path: '/play/onevone?perf=off', who: 'solo', kind: 'game', extra: true },
  { id: 'dunk-perfoff', path: '/play/dunk?perf=off', who: 'solo', kind: 'game', extra: true },
];
/** the perf job's set: the 3D places players spend time in, and the control */
const PERF_IDS = ['tennis', 'onevone', 'threevthree', 'threepoint', 'dunk', 'arena-hoops', 'venice', 'coast', 'adventure'];

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
const shot = async (page: Page, file: string, fullPage = false) => { await page.screenshot({ path: file, type: 'jpeg', quality: 70, fullPage, timeout: 90000 }).catch(() => {}); };
async function tap(page: Page, t: Tier, x: number, y: number) { if (t.touch) await page.touchscreen.tap(x, y).catch(() => {}); else await page.mouse.click(x, y).catch(() => {}); }
async function tapSel(page: Page, t: Tier, sel: string): Promise<boolean> {
  const box = await page.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return false;
  await tap(page, t, box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

/** a few seconds of play: the stick (or WASD) and an action button, so bodies move and the HUD answers */
async function drive(page: Page, t: Tier, ms: number) {
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    if (t.touch) {
      const sx = Math.round(t.vw * 0.2), sy = Math.round(t.vh * 0.78);
      await page.touchscreen.tap(sx, sy).catch(() => {});
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

async function one(browser: Browser, t: Tier, p: People, r: Route, out: string, tag: string, perf: boolean, feelOv: Record<string, number> | null) {
  // the perf job and a --feel= A/B run as the rig's admin: the owner tools (the PERF tab, feel overrides) open only for an admin
  const who: Person = (perf || feelOv) ? (r.who === 'anon' ? 'anon' : 'admin') : r.who;
  const ctx = await browser.newContext({
    viewport: { width: t.vw, height: t.vh }, deviceScaleFactor: t.dpr, isMobile: t.touch, hasTouch: t.touch,
    storageState: storageState(p, who), permissions: ['camera', 'microphone'],
    userAgent: t.touch ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 LookAuditRig'
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 LookAuditRig',
  });
  const page = await ctx.newPage();
  const errors: string[] = []; const consoleErr: string[] = []; const tierLines: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => {
    const s = m.text();
    if (m.type() === 'error' && consoleErr.length < 20) consoleErr.push(s.slice(0, 200));
    if (/\[FEL-TIER\]|\[FEL-FIT\]|canvasFit|FEL-PERF/.test(s) && tierLines.length < 20) tierLines.push(s.slice(0, 200));
  });
  page.on('dialog', (d) => { void d.dismiss().catch(() => {}); });
  await page.addInitScript(INIT);
  if (feelOv) await page.addInitScript(`try { localStorage.setItem('fel.feel.overrides.v1', ${JSON.stringify(JSON.stringify(feelOv))}); } catch {}`);
  if (t.cpu > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: t.cpu }); }
  const base = join(out, `${tag}-${t.id}-${r.id}`);
  const res: Record<string, unknown> = { id: r.id, path: r.path, tier: t.id, tag, who };
  const t0 = Date.now();
  await page.goto(ORIGIN + r.path, { waitUntil: 'load', timeout: 90000 }).catch((e) => errors.push('goto: ' + String(e).slice(0, 160)));
  res.finalUrl = page.url().replace(ORIGIN, '');

  if (r.kind === 'page') {
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot(page, `${base}.jpg`);
    await shot(page, `${base}-full.jpg`, true);
    res.docHeight = await page.evaluate('document.documentElement.scrollHeight').catch(() => null);
    res.hScroll = await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1').catch(() => null);
  } else {
    // the loading card (what every player stares at first)
    await page.waitForTimeout(perf ? 6000 : 3500);
    if (!perf) await shot(page, `${base}-a-loading.jpg`);
    let started = false;
    if (r.kind === 'game') {
      const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 180000 }).then(() => true).catch(() => false);
      res.readyS = ready ? Math.round((Date.now() - t0) / 100) / 10 : null;
      if (!perf) await shot(page, `${base}-b-ready.jpg`);
      if (ready) {
        const startBtn = page.locator('[data-splash-phase="ready"] button, [data-splash-phase="ready"] [role="button"]').filter({ hasText: /tap to start|^start$/i }).first();
        const sb = await startBtn.boundingBox().catch(() => null);
        if (sb) await tap(page, t, sb.x + sb.width / 2, sb.y + sb.height / 2); else await tapSel(page, t, '[data-splash-phase="ready"]');
        started = await page.waitForFunction(`!document.querySelector('[data-splash-phase]')`, undefined, { timeout: 60000 }).then(() => true).catch(() => false);
      }
    } else if (r.kind === 'arena') {
      started = await page.waitForSelector('[data-testid="arena-score"]', { timeout: 180000 }).then(() => true).catch(() => false);
      res.readyS = started ? Math.round((Date.now() - t0) / 100) / 10 : null;
    } else if (r.kind === 'hub') {
      started = await page.waitForFunction(`!/Heading to the courts|Sailing to the coast/.test(document.body.innerText) && !!document.querySelector('canvas')`, undefined, { timeout: 180000 }).then(() => true).catch(() => false);
      res.readyS = started ? Math.round((Date.now() - t0) / 100) / 10 : null;
    } else if (r.kind === 'adventure') {
      const pick = await page.waitForSelector('[data-testid="adventure-partner-picker"], [data-testid="adventure-start"]', { timeout: 90000 }).then((h) => h.getAttribute('data-testid')).catch(() => null);
      if (!perf) await shot(page, `${base}-b-first.jpg`);
      if (pick === 'adventure-partner-picker') {
        await tapSel(page, t, '[data-testid^="partner-species-"]');
        await page.waitForTimeout(300);
        await tapSel(page, t, '[data-testid="adventure-partner-confirm"]');
      }
      const ready = await page.waitForSelector('[data-testid="adventure-start"]:not([disabled])', { timeout: 180000 }).then(() => true).catch(() => false);
      res.readyS = ready ? Math.round((Date.now() - t0) / 100) / 10 : null;
      if (!perf) await shot(page, `${base}-b-ready.jpg`);
      if (ready) { await tapSel(page, t, '[data-testid="adventure-start"]'); started = true; }
    }
    res.started = started;
    if (started) {
      if (perf) {
        await page.waitForTimeout(2500);
        const tabbed = await tapSel(page, t, '[data-testid="perf-tab"]');
        res.perfTab = tabbed;
        await drive(page, t, 9000);
        res.readout = await readout(page);
        await shot(page, `${base}-perf.jpg`);
      } else {
        await page.waitForTimeout(3000);
        await shot(page, `${base}-c-play.jpg`);
        await drive(page, t, 6000);
        await shot(page, `${base}-d-play.jpg`);
        // 3-Point runs on a 60 s clock: keep shooting until its end card (the results screen every mode shares) is up
        if (r.id === 'threepoint') {
          const until = Date.now() + 100000;
          let ended = false;
          while (!ended && Date.now() < until) {
            await drive(page, t, 3000);
            ended = await page.evaluate(`/play again/i.test(document.body.innerText)`).catch(() => false) as boolean;
          }
          res.endCard = ended;
          await page.waitForTimeout(ended ? 4500 : 0);   // the reveal plays out
          await shot(page, `${base}-e-end.jpg`);
        }
      }
    }
  }
  res.errors = errors; res.consoleErrors = consoleErr; res.tierLines = tierLines;
  res.wallS = Math.round((Date.now() - t0) / 1000);
  await ctx.close();
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  const job = process.argv[3];
  if (!out || !/^(shots|perf)$/.test(job ?? '')) { console.error('usage: look-walk.mts <outDir> shots|perf [--tier=portrait|landscape|desktop] [--only=id,id] [--tag=x]'); process.exit(2); }
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const perf = job === 'perf';
  const tier = perf ? TIERS.phoneperf : TIERS[(arg('tier') ?? 'portrait') as Tier['id']];
  const only = arg('only')?.split(',') ?? (perf ? PERF_IDS : null);
  const tag = arg('tag') ?? (perf ? 'p1' : 'b1');
  // --feel=id:value,id:value — a switched-off look knob turned on for an A/B picture (lib/feel-panel/feel.ts: this device's overrides)
  const feelOv = arg('feel') ? Object.fromEntries(arg('feel')!.split(',').map((kv) => { const [k, v] = kv.split(':'); return [k, Number(v)]; })) : null;
  mkdirSync(out, { recursive: true });
  dbUp();
  const stop = await serve(join(out, 'server.log'));
  try {
    const p = await makePeople();
    const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
    for (const r of ROUTES.filter((x) => (only ? only.includes(x.id) : !x.extra))) {
      const t = Date.now();
      let res: Record<string, unknown>;
      try { res = await one(browser, tier, p, r, out, tag, perf, feelOv); } catch (e) { res = { id: r.id, tier: tier.id, tag, crash: String(e).slice(0, 300) }; }
      writeFileSync(join(out, `${tag}-${tier.id}-${r.id}.json`), JSON.stringify(res, null, 1));
      console.log(`${tier.id} ${r.id} ${Math.round((Date.now() - t) / 1000)}s ready ${res.readyS ?? '-'} started ${res.started ?? '-'} err ${(res.errors as string[] | undefined)?.length ?? '?'}${res.readout ? ' | ' + String(res.readout).replace(/\n/g, ' | ') : ''}`);
    }
    await browser.close();
  } finally { stop(); }
}
