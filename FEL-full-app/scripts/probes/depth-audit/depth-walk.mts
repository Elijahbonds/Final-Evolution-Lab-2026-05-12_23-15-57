// DEPTH-AUDIT (2026-11-25): the "depth and detail" look pass's before pictures. docs/DEPTH-PASS-AUDIT.md.
// Owner, 2026-11-25: "Let's do a 10 phase pass improving how things look. Adding depth, detail."
//
// Read-only, like look-audit/look-walk.mts (whose rig, moments and taps this follows): it opens pages and plays the way a player
// would and writes nothing to the app. Every 3D route runs with `?perf=off` (lib/babylon/core/perfGuard.ts) so the speed guard
// cannot drop the render scale on SwiftShader: the picture is the one a phone that keeps up draws. Each depth phase takes its
// before/after from this file: same route, same size, same moment, 3 runs a side (`--tag=<phase>-<before|after>-<run>`).
//
//   /home/user/wt/gate-run.sh 1750 npx tsx scripts/probes/depth-audit/depth-walk.mts <outDir> --tier=portrait|landscape|desktop [--only=id,id] [--tag=d0] [--feel=knob:v,knob:v]
//
// Moments for a 3D place: a-loading (3.5 s after opening), b-ready, c-play (3 s into play), d-play (6 s later, after the stick and
// an action button). 3-Point is played on to its end card (e-end). Pages: the screen at rest.
// ES_PORT / ES_DIST / ES_PG_DIR / ES_PG_PORT / ES_OUT pick the rig's port, build folder and throwaway database (every-screen/rig.mts).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState, type People, type Person } from '../../every-screen/rig.mts';

type Kind = 'page' | 'game' | 'arena' | 'hub' | 'adventure';
interface Route { id: string; path: string; who: Person; kind: Kind; extra?: boolean }
const P = 'perf=off';
export const ROUTES: Route[] = [
  // menus and 2D surfaces (depth cues: layers, shadows, glass)
  { id: 'home', path: '/', who: 'anon', kind: 'page' },
  { id: 'try', path: '/try', who: 'anon', kind: 'page' },
  { id: 'play', path: '/play', who: 'solo', kind: 'page' },
  // the hoops, on the three courts players pick most (Venice is the default location)
  { id: 'onevone', path: `/play/onevone?${P}`, who: 'solo', kind: 'game' },
  { id: 'onevone-canopy', path: `/play/onevone?${P}&location=canopy`, who: 'solo', kind: 'game' },
  { id: 'onevone-blossom', path: `/play/onevone?${P}&location=blossom`, who: 'solo', kind: 'game' },
  { id: 'threevthree', path: `/play/threevthree?${P}`, who: 'solo', kind: 'game' },
  { id: 'threepoint', path: `/play/threepoint?${P}`, who: 'solo', kind: 'game' },
  { id: 'dunk', path: `/play/dunk?${P}`, who: 'solo', kind: 'game' },
  { id: 'tennis', path: `/play/tennis?${P}`, who: 'solo', kind: 'game' },
  // the Physics Arena, all four sports
  { id: 'arena-hoops', path: `/play/arena?sport=hoops&${P}`, who: 'solo', kind: 'arena' },
  { id: 'arena-threes', path: `/play/arena?sport=threes&${P}`, who: 'solo', kind: 'arena' },
  { id: 'arena-threepoint', path: `/play/arena?sport=threepoint&${P}`, who: 'solo', kind: 'arena' },
  { id: 'arena-soccer', path: `/play/arena?sport=soccer&${P}`, who: 'solo', kind: 'arena' },
  // the zones and the story
  { id: 'venice', path: `/play/venice?${P}`, who: 'solo', kind: 'hub' },
  { id: 'coast', path: `/play/coast?${P}`, who: 'solo', kind: 'hub' },
  { id: 'adventure', path: `/play/adventure?${P}`, who: 'solo', kind: 'adventure' },
  // A/B (only with --only): what a phone gives up — the same upright phone drawn on the high tier's rig (SSAO, cascades, MSAA,
  // fixture lights, the glossy floor and the venue probe), so a depth finding can say which of it the phone tier lacks
  { id: 'onevone-high', path: `/play/onevone?${P}&tier=high`, who: 'solo', kind: 'game', extra: true },
  { id: 'dunk-high', path: `/play/dunk?${P}&tier=high`, who: 'solo', kind: 'game', extra: true },
  { id: 'arena-hoops-high', path: `/play/arena?sport=hoops&${P}&tier=high`, who: 'solo', kind: 'arena', extra: true },
];

interface Tier { id: 'portrait' | 'landscape' | 'desktop'; vw: number; vh: number; dpr: number; touch: boolean }
const TIERS: Record<Tier['id'], Tier> = {
  portrait: { id: 'portrait', vw: 390, vh: 844, dpr: 2, touch: true },
  landscape: { id: 'landscape', vw: 844, vh: 390, dpr: 2, touch: true },
  desktop: { id: 'desktop', vw: 1280, vh: 720, dpr: 1, touch: false },
};

// the harness's 20 s load watchdog is a phone-on-a-network guard; software GL on a shared box can take longer to build a venue
const INIT = `(() => { const st = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a); })()`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shot = async (page: Page, file: string) => { await page.screenshot({ path: file, type: 'jpeg', quality: 78, timeout: 90000 }).catch(() => {}); };
async function tap(page: Page, t: Tier, x: number, y: number) { if (t.touch) await page.touchscreen.tap(x, y).catch(() => {}); else await page.mouse.click(x, y).catch(() => {}); }
async function tapSel(page: Page, t: Tier, sel: string): Promise<boolean> {
  const box = await page.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return false;
  await tap(page, t, box.x + box.width / 2, box.y + box.height / 2);
  return true;
}
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

/** What the scene is drawing with, read from the page: the tier line, the edges line, the air/haze line, and a scene census. */
const CENSUS = `(() => {
  const s = (window.BABYLON && window.BABYLON.EngineStore && window.BABYLON.EngineStore.LastCreatedScene) || null;
  if (!s) return null;
  const mats = s.materials || [];
  const pbr = mats.filter((m) => m.getClassName && m.getClassName() === 'PBRMaterial');
  return {
    meshes: s.meshes.length, active: s.getActiveMeshes ? s.getActiveMeshes().length : null, materials: mats.length,
    pbr: pbr.length, withBump: mats.filter((m) => m.bumpTexture).length, withDetail: pbr.filter((m) => m.detailMap && m.detailMap.isEnabled).length,
    withRefl: mats.filter((m) => m.reflectionTexture).length, env: !!s.environmentTexture, fogMode: s.fogMode, fogDensity: s.fogDensity,
    lights: s.lights.map((l) => l.name + ':' + (l.getClassName ? l.getClassName() : '')).slice(0, 12),
    shadowCasters: (s.lights.find((l) => l.getShadowGenerator && l.getShadowGenerator()) || { getShadowGenerator: () => null }).getShadowGenerator()?.getShadowMap?.()?.renderList?.length ?? null,
    post: (s.postProcessRenderPipelineManager && s.postProcessRenderPipelineManager.supportedPipelines || []).map((p) => p._name || p.name),
  };
})()`;

async function one(browser: Browser, t: Tier, p: People, r: Route, out: string, tag: string, feelOv: Record<string, number> | null) {
  const who: Person = feelOv ? (r.who === 'anon' ? 'anon' : 'admin') : r.who;
  const ctx = await browser.newContext({
    viewport: { width: t.vw, height: t.vh }, deviceScaleFactor: t.dpr, isMobile: t.touch, hasTouch: t.touch,
    storageState: storageState(p, who), permissions: ['camera', 'microphone'],
    userAgent: t.touch ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 DepthAuditRig'
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 DepthAuditRig',
  });
  const page = await ctx.newPage();
  const errors: string[] = []; const lines: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { const s = m.text(); if (/\[FEL-(TIER|AIR|LIGHT|PERF|FIT)\]/.test(s) && lines.length < 24) lines.push(s.slice(0, 220)); });
  page.on('dialog', (d) => { void d.dismiss().catch(() => {}); });
  await page.addInitScript(INIT);
  if (feelOv) await page.addInitScript(`try { localStorage.setItem('fel.feel.overrides.v1', ${JSON.stringify(JSON.stringify(feelOv))}); } catch {}`);
  const base = join(out, `${tag}-${t.id}-${r.id}`);
  const res: Record<string, unknown> = { id: r.id, path: r.path, tier: t.id, tag, who };
  const t0 = Date.now();
  await page.goto(ORIGIN + r.path, { waitUntil: 'load', timeout: 90000 }).catch((e) => errors.push('goto: ' + String(e).slice(0, 160)));
  if (r.kind === 'page') {
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, `${base}.jpg`);
  } else {
    await page.waitForTimeout(3500);
    await shot(page, `${base}-a-loading.jpg`);
    let started = false;
    if (r.kind === 'game') {
      const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 180000 }).then(() => true).catch(() => false);
      res.readyS = ready ? Math.round((Date.now() - t0) / 100) / 10 : null;
      await shot(page, `${base}-b-ready.jpg`);
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
    } else {
      const pick = await page.waitForSelector('[data-testid="adventure-partner-picker"], [data-testid="adventure-start"]', { timeout: 90000 }).then((h) => h.getAttribute('data-testid')).catch(() => null);
      if (pick === 'adventure-partner-picker') {
        await tapSel(page, t, '[data-testid^="partner-species-"]');
        await page.waitForTimeout(300);
        await tapSel(page, t, '[data-testid="adventure-partner-confirm"]');
      }
      const ready = await page.waitForSelector('[data-testid="adventure-start"]:not([disabled])', { timeout: 180000 }).then(() => true).catch(() => false);
      res.readyS = ready ? Math.round((Date.now() - t0) / 100) / 10 : null;
      if (ready) { await tapSel(page, t, '[data-testid="adventure-start"]'); started = true; }
    }
    res.started = started;
    if (started) {
      await page.waitForTimeout(3000);
      await shot(page, `${base}-c-play.jpg`);
      res.census = await page.evaluate(CENSUS).catch(() => null);
      await drive(page, t, 6000);
      await shot(page, `${base}-d-play.jpg`);
      if (r.id === 'threepoint') {
        const until = Date.now() + 100000;
        let ended = false;
        while (!ended && Date.now() < until) {
          await drive(page, t, 3000);
          ended = await page.evaluate(`/play again/i.test(document.body.innerText)`).catch(() => false) as boolean;
        }
        res.endCard = ended;
        await page.waitForTimeout(ended ? 4500 : 0);
        await shot(page, `${base}-e-end.jpg`);
      }
    }
  }
  res.errors = errors; res.lines = lines;
  res.wallS = Math.round((Date.now() - t0) / 1000);
  await ctx.close();
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: depth-walk.mts <outDir> [--tier=portrait|landscape|desktop] [--only=id,id] [--tag=d0] [--feel=k:v,k:v]'); process.exit(2); }
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
  const tier = TIERS[(arg('tier') ?? 'portrait') as Tier['id']];
  const only = arg('only')?.split(',') ?? null;
  const tag = arg('tag') ?? 'd0';
  const feelArg = arg('feel');
  const feelOv = feelArg ? Object.fromEntries(feelArg.split(',').map((kv) => { const [k, v] = kv.split(':'); return [k, Number(v)]; })) : null;
  mkdirSync(out, { recursive: true });
  dbUp();
  const stop = await serve(join(out, `server-${tag}-${tier.id}.log`));
  try {
    const p = await makePeople();
    const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
    for (const r of ROUTES.filter((x) => (only ? only.includes(x.id) : !x.extra))) {
      const t = Date.now();
      let res: Record<string, unknown>;
      try { res = await one(browser, tier, p, r, out, tag, feelOv); } catch (e) { res = { id: r.id, tier: tier.id, tag, crash: String(e).slice(0, 300) }; }
      writeFileSync(join(out, `${tag}-${tier.id}-${r.id}.json`), JSON.stringify(res, null, 1));
      console.log(`${tier.id} ${r.id} ${Math.round((Date.now() - t) / 1000)}s ready ${res.readyS ?? '-'} started ${res.started ?? '-'} err ${(res.errors as string[] | undefined)?.length ?? '?'}`);
    }
    await browser.close();
  } finally { stop(); }
}
