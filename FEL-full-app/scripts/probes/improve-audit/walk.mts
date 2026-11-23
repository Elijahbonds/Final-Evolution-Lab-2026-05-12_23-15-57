// IMPROVE-AUDIT (2026-11-22): the player's walk through the product, measured — the instrument behind
// docs/IMPROVE-10-PHASE-AUDIT.md. Read-only: it opens pages and taps the way a first-time player would; it writes nothing
// to the app or its database except the rig's own sign-ins.
//
// What it reads, per screen and per tier (phone: 390x844 touch, DPR 3, CPU slowed 4x; desktop: 1440x900, no throttle):
//   - page errors (uncaught), console errors, failed requests (status >= 400 or no answer)
//   - load: TTFB, first paint with content (FCP), largest paint (LCP), the load event, layout shift (CLS)
//   - for a game: time to its READY screen, the start tap's own event timing (tap -> the next paint), time to live play,
//     then an 8 s window of live play: every requestAnimationFrame interval (p50 / p95 / max, frames over 50 ms) and the
//     browser's long-animation-frame entries; the key / touch presses' event timing; sounds started (AudioNode.start and
//     <audio>.play calls, counted by a hook installed before the page's own scripts)
//   - the screen as a person reads it (scripts/every-screen/inpage.ts measure(), the every-screen scorer's own collector):
//     words before scrolling, tap targets under 44 px, unfinished marks, links that go nowhere, the ways on or back
//   - contrast and other static findings (scripts/a11y/inpage.ts staticScan)
//   - a JPG of the screen at rest, and one in live play
//
// The rig: the every-screen rig's production build and throwaway database (scripts/every-screen/rig.mts; the ES_* env
// picks the port, the database and the build folder). Run it inside the gate lock:
//   /home/user/wt/gate-run.sh 1500 npx tsx scripts/probes/improve-audit/walk.mts <outDir> [--tier=phone|desktop|both] [--only=id,id] [--tag=x]
// SwiftShader draws the 3D on the CPU: a frame time here is an upper bound on a phone's (its GPU does that work), and the
// CPU share of a frame is what the 4x throttle models. Say so wherever a number from here is quoted.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, ROOT, dbUp, people as makePeople, serve, storageState, type People, type Person } from '../../every-screen/rig.mts';

type Kind = 'page' | 'game' | 'hub' | 'adventure';
interface Route { id: string; path: string; who: Person; kind: Kind; note?: string }
export const ROUTES: Route[] = [
  { id: 'home', path: '/', who: 'anon', kind: 'page', note: 'first visit' },
  { id: 'try', path: '/try', who: 'anon', kind: 'page', note: 'the /try landing' },
  { id: 'signup', path: '/signup', who: 'anon', kind: 'page' },
  { id: 'login', path: '/login', who: 'anon', kind: 'page' },
  { id: 'play', path: '/play', who: 'solo', kind: 'page', note: 'the Play menu' },
  { id: 'onevone', path: '/play/onevone', who: 'solo', kind: 'game' },
  { id: 'threevthree', path: '/play/threevthree', who: 'solo', kind: 'game' },
  { id: 'dunk', path: '/play/dunk', who: 'solo', kind: 'game' },
  { id: 'threepoint', path: '/play/threepoint', who: 'solo', kind: 'game' },
  { id: 'tennis', path: '/play/tennis', who: 'solo', kind: 'game', note: 'control: a light 3D mode that passes every-screen' },
  { id: 'venice', path: '/play/venice', who: 'solo', kind: 'hub' },
  { id: 'coast', path: '/play/coast', who: 'solo', kind: 'hub' },
  { id: 'adventure', path: '/play/adventure', who: 'solo', kind: 'adventure', note: 'Adventure Ch1' },
  { id: 'creator', path: '/creator', who: 'solo', kind: 'page' },
  { id: 'closet', path: '/closet', who: 'solo', kind: 'page' },
  { id: 'train', path: '/train', who: 'solo', kind: 'page' },
  { id: 'today-drill', path: '/train/today-drill', who: 'solo', kind: 'page' },
  { id: 'train-library', path: '/train/library', who: 'solo', kind: 'page' },
  { id: 'train-build', path: '/train/build', who: 'solo', kind: 'page' },
  { id: 'train-progress', path: '/train/progress', who: 'solo', kind: 'page' },
  { id: 'train-jumps', path: '/train/jumps', who: 'solo', kind: 'page' },
  { id: 'workout', path: '/workout', who: 'solo', kind: 'page' },
  { id: 'party', path: '/party', who: 'solo', kind: 'page', note: 'online parties' },
  { id: 'studio', path: '/studio', who: 'admin', kind: 'page', note: 'NEXUS_STUDIO_ENABLED' },
];

const INIT = `(() => {
  const w = window;
  w.__ia = { cls: 0, long: 0, loaf: [], sounds: 0, soundsAt: [], ev: [], raf: null, lcp: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) w.__ia.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { w.__ia.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__ia.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__ia.loaf.push([Math.round(e.startTime), Math.round(e.duration), Math.round(e.blockingDuration || 0)]); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__ia.ev.push([e.name, Math.round(e.startTime), Math.round(e.duration), Math.round((e.processingStart || e.startTime) - e.startTime)]); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
  const bump = () => { w.__ia.sounds++; if (w.__ia.soundsAt.length < 200) w.__ia.soundsAt.push(Math.round(performance.now())); };
  // which beds run: every looped buffer started (its length), and every SoundKit-style bed filter (bandpass, Q 0.4: its
  // centre names the bed in SoundKit.startAmbient — 900 stadium, 500 ocean, 1400 wind, 220 dojo)
  w.__ia.loops = []; w.__ia.bedFilters = [];
  try { const S = w.AudioScheduledSourceNode && w.AudioScheduledSourceNode.prototype; if (S) { const o = S.start; S.start = function (...a) { bump(); try { if (this.loop && this.buffer && w.__ia.loops.length < 20) w.__ia.loops.push(Math.round(this.buffer.duration * 10) / 10); } catch {} return o.apply(this, a); }; } } catch {}
  try { const C = w.BaseAudioContext && w.BaseAudioContext.prototype; if (C) { const o = C.createBiquadFilter; C.createBiquadFilter = function (...a) { const f = o.apply(this, a); if (w.__ia.bedFilters.length < 60) w.__ia.bedFilters.push(f); return f; }; } } catch {}
  w.__iaBeds = () => w.__ia.bedFilters.filter((f) => f.type === 'bandpass' && Math.abs(f.Q.value - 0.4) < 0.01).map((f) => Math.round(f.frequency.value));
  try { const M = w.HTMLMediaElement.prototype; const o = M.play; M.play = function (...a) { bump(); return o.apply(this, a); }; } catch {}
  w.__iaRaf = (ms) => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last;
    const f = (t) => { out.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); });
})();`;

async function bundleInpage(): Promise<string> {
  const one = async (entry: string) => (await build({ entryPoints: [join(ROOT, entry)], bundle: true, format: 'iife', platform: 'browser', write: false, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error' })).outputFiles[0].text;
  return [await one('scripts/every-screen/inpage.ts'), await one('scripts/a11y/inpage.ts')].join('\n;\n');
}

const pct = (a: number[], p: number) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] * 10) / 10; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Tier { id: 'phone' | 'desktop'; vw: number; vh: number; dpr: number; touch: boolean; cpu: number }
const TIERS: Record<Tier['id'], Tier> = {
  phone: { id: 'phone', vw: 390, vh: 844, dpr: 3, touch: true, cpu: 4 },
  desktop: { id: 'desktop', vw: 1440, vh: 900, dpr: 1, touch: false, cpu: 1 },
};

async function context(browser: Browser, tier: Tier, p: People, who: Person): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: tier.vw, height: tier.vh }, deviceScaleFactor: tier.dpr, isMobile: tier.touch, hasTouch: tier.touch,
    storageState: storageState(p, who), permissions: ['camera', 'microphone'],
    userAgent: tier.touch ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ImproveAuditRig'
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 ImproveAuditRig',
  });
}

async function tap(page: Page, tier: Tier, x: number, y: number) { if (tier.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); }
async function tapSel(page: Page, tier: Tier, sel: string): Promise<boolean> {
  const box = await page.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return false;
  await tap(page, tier, box.x + box.width / 2, box.y + box.height / 2);
  return true;
}
const shot = async (page: Page, file: string) => { await page.screenshot({ path: file, type: 'jpeg', quality: 62, timeout: 30000 }).catch(() => {}); };

/** Live play: drive it a little (the stick / WASD, a shot button) and read the frames, presses and sounds. */
async function playWindow(page: Page, tier: Tier, ms: number) {
  // the first seconds of play carry first-use shader compiles: read them apart (warm), then the steady window
  const w0 = await page.evaluate('performance.now()') as number;
  const warmFrames = await page.evaluate('window.__iaRaf(4000)') as number[];
  const warm = { frames: warmFrames.length, max: pct(warmFrames, 1), loafWorst: ((await page.evaluate('window.__ia.loaf')) as number[][]).filter((l) => l[0] >= w0).reduce((a, l) => Math.max(a, l[1]), 0) };
  const t0 = await page.evaluate('performance.now()') as number;
  const raf = page.evaluate(`window.__iaRaf(${ms})`) as Promise<number[]>;
  const drive = (async () => {
    const end = Date.now() + ms - 500;
    let i = 0;
    while (Date.now() < end) {
      if (tier.touch) {
        // a stick drag at the lower left, then a tap at the lower right (where the touch decks put their action buttons)
        await page.touchscreen.tap(90, tier.vh - 170).catch(() => {});
        await sleep(600);
        await page.touchscreen.tap(tier.vw - 70, tier.vh - 150).catch(() => {});
      } else {
        const k = ['w', 'd', 's', 'a'][i % 4];
        await page.keyboard.down(k).catch(() => {}); await sleep(700); await page.keyboard.up(k).catch(() => {});
        await page.keyboard.press(i % 2 ? 'Space' : 'j').catch(() => {});
      }
      i++; await sleep(700);
    }
  })();
  const frames = await raf; await drive;
  const ia = await page.evaluate('window.__ia') as { loaf: number[][]; ev: (string | number)[][]; sounds: number; soundsAt: number[] };
  const loaf = ia.loaf.filter((l) => l[0] >= t0);
  const ev = ia.ev.filter((e) => (e[1] as number) >= t0 && /^(keydown|pointerdown|touchstart|pointerup|keyup|click)$/.test(e[0] as string));
  return {
    warm, frames: frames.length, fps: Math.round(frames.length / (ms / 1000) * 10) / 10,
    p50: pct(frames, 0.5), p95: pct(frames, 0.95), max: pct(frames, 1), over50: frames.filter((f) => f > 50).length, over100: frames.filter((f) => f > 100).length,
    loaf: loaf.length, loafWorst: loaf.reduce((a, l) => Math.max(a, l[1]), 0),
    presses: ev.length, pressP50: pct(ev.map((e) => e[2] as number), 0.5), pressMax: ev.reduce((a, e) => Math.max(a, e[2] as number), 0), pressDelayMax: ev.reduce((a, e) => Math.max(a, e[3] as number), 0),
    soundsInPlay: ia.soundsAt.filter((t) => t >= t0).length,
  };
}

async function one(browser: Browser, tier: Tier, p: People, r: Route, inpage: string, out: string, tag: string) {
  const ctx = await context(browser, tier, p, r.who);
  const page = await ctx.newPage();
  const errors: string[] = []; const consoleErr: string[] = []; const failed: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 220)));
  const perfLog: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && consoleErr.length < 30) consoleErr.push(m.text().slice(0, 220));
    if (/FEL-PERF|pre-warm|FEL-LOAD|\[LOAD/.test(m.text()) && perfLog.length < 40) perfLog.push(`${Date.now()} ${m.text().slice(0, 200)}`);
  });
  page.on('response', (res) => { if (res.status() >= 400 && failed.length < 30) failed.push(`${res.status()} ${res.url().replace(ORIGIN, '').slice(0, 120)}`); });
  page.on('requestfailed', (q) => { if (failed.length < 30 && !/net::ERR_ABORTED/.test(q.failure()?.errorText || '')) failed.push(`ERR ${q.url().replace(ORIGIN, '').slice(0, 120)} ${q.failure()?.errorText}`); });
  page.on('dialog', (d) => { void d.dismiss().catch(() => {}); });
  await page.addInitScript(INIT);
  const cdp = await ctx.newCDPSession(page);
  if (tier.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: tier.cpu });
  const res: Record<string, unknown> = { id: r.id, path: r.path, who: r.who, kind: r.kind, tier: tier.id, tag };
  const t0 = Date.now();
  const resp = await page.goto(ORIGIN + r.path, { waitUntil: 'load', timeout: 90000 }).catch((e) => { errors.push('goto: ' + String(e).slice(0, 160)); return null; });
  res.status = resp?.status() ?? null; res.finalUrl = page.url().replace(ORIGIN, '');
  res.loadWallMs = Date.now() - t0;
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const nav = await page.evaluate(`(() => { const n = performance.getEntriesByType('navigation')[0]; const f = performance.getEntriesByName('first-contentful-paint')[0];
    return { ttfb: n ? Math.round(n.responseStart) : null, dcl: n ? Math.round(n.domContentLoadedEventEnd) : null, load: n ? Math.round(n.loadEventEnd) : null, fcp: f ? Math.round(f.startTime) : null, lcp: Math.round(window.__ia.lcp), cls: Math.round(window.__ia.cls * 1000) / 1000, longTasks: window.__ia.long }; })()`).catch(() => null);
  res.nav = nav;
  await page.evaluate(inpage).catch(() => {});

  if (r.kind === 'game') {
    // the boot splash: loading -> ready (a tap starts it) -> countdown -> live
    const tReady0 = Date.now();
    const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 120000 }).then(() => true).catch(() => false);
    res.readyMs = ready ? Date.now() - t0 : null; res.readyAfterLoadMs = ready ? Date.now() - tReady0 : null;
    await shot(page, join(out, `${tag}-${tier.id}-${r.id}-ready.jpg`));
    if (ready) {
      await page.evaluate('window.__es.armTap()');
      // the splash's own start button (a person taps it); the splash centre can be another button (Play with friends)
      const startBtn = page.locator('[data-splash-phase="ready"] button, [data-splash-phase="ready"] [role="button"]').filter({ hasText: /tap to start|^start$/i }).first();
      const sb = await startBtn.boundingBox().catch(() => null);
      res.startVia = sb ? 'button' : 'centre';
      if (sb) await tap(page, tier, sb.x + sb.width / 2, sb.y + sb.height / 2); else await tapSel(page, tier, '[data-splash-phase="ready"]');
      await page.waitForTimeout(400);
      res.startTap = await page.evaluate('window.__es.readTap()').catch(() => null);
      const tLive0 = Date.now();
      const live = await page.waitForFunction(`!document.querySelector('[data-splash-phase]')`, undefined, { timeout: 45000 }).then(() => true).catch(() => false);
      res.liveAfterTapMs = live ? Date.now() - tLive0 : null;
      // an intro / crane shot: one more press skips it (the harness's own skip); count it as a player would do it
      await page.waitForTimeout(1500);
      res.play = await playWindow(page, tier, 8000);
      await shot(page, join(out, `${tag}-${tier.id}-${r.id}-play.jpg`));
    }
  } else if (r.kind === 'hub') {
    const loadingGone = await page.waitForFunction(`!/Heading to the courts|Sailing to the coast/.test(document.body.innerText) && !!document.querySelector('canvas')`, undefined, { timeout: 120000 }).then(() => true).catch(() => false);
    res.readyMs = loadingGone ? Date.now() - t0 : null;
    await page.waitForTimeout(2000);
    await shot(page, join(out, `${tag}-${tier.id}-${r.id}-ready.jpg`));
    if (loadingGone) { res.play = await playWindow(page, tier, 8000); await shot(page, join(out, `${tag}-${tier.id}-${r.id}-play.jpg`)); }
  } else if (r.kind === 'adventure') {
    // first visit: the partner picker; then the START screen
    const pick = await page.waitForSelector('[data-testid="adventure-partner-picker"], [data-testid="adventure-start"]', { timeout: 60000 }).then((h) => h.getAttribute('data-testid')).catch(() => null);
    res.firstScreen = pick;
    await shot(page, join(out, `${tag}-${tier.id}-${r.id}-first.jpg`));
    if (pick === 'adventure-partner-picker') {
      await tapSel(page, tier, '[data-testid^="partner-species-"]');
      await page.waitForTimeout(300);
      res.pickedPartner = await tapSel(page, tier, '[data-testid="adventure-partner-confirm"]');
    }
    const ready = await page.waitForSelector('[data-testid="adventure-start"]:not([disabled])', { timeout: 120000 }).then(() => true).catch(() => false);
    res.readyMs = ready ? Date.now() - t0 : null;
    await shot(page, join(out, `${tag}-${tier.id}-${r.id}-ready.jpg`));
    if (ready) {
      await page.evaluate('window.__es.armTap()');
      await tapSel(page, tier, '[data-testid="adventure-start"]');
      await page.waitForTimeout(400);
      res.startTap = await page.evaluate('window.__es.readTap()').catch(() => null);
      await page.waitForTimeout(1500);
      res.play = await playWindow(page, tier, 8000);
      await shot(page, join(out, `${tag}-${tier.id}-${r.id}-play.jpg`));
    }
  }

  // the screen as read at rest (for a game: in live play, the HUD and the touch deck); again, in case the page navigated
  if (!(await page.evaluate('!!window.__es').catch(() => false))) await page.evaluate(inpage).catch(() => {});
  const m = await page.evaluate('window.__es.measure()').catch((e) => ({ err: String(e).slice(0, 120) })) as Record<string, unknown>;
  const a11y = await page.evaluate('window.__a11y.staticScan()').catch(() => null) as { violations: { rule: string; impact: string; target?: string; detail?: string }[] } | null;
  const tiny = await page.evaluate(`(() => { let n = 0; const ex = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) { const s = (t.textContent || '').trim(); const el = t.parentElement; if (!s || !el) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue; if (parseFloat(cs.fontSize) < 12) { n++; if (ex.length < 6) ex.push(s.slice(0, 30) + ' ' + cs.fontSize); } }
    return { n, ex }; })()`).catch(() => null);
  const sounds = await page.evaluate('window.__ia.sounds').catch(() => null);
  res.audioLoops = await page.evaluate('window.__ia.loops').catch(() => null);
  res.audioBeds = await page.evaluate('window.__iaBeds()').catch(() => null);
  res.screen = {
    wordsFold: m.wordsFold, actionsMain: m.actionsMain, targets: m.targets,
    small: Array.isArray(m.smallTargets) ? (m.smallTargets as { label: string; w: number; h: number; chrome: boolean }[]).map((s) => `${s.label} ${Math.round(s.w)}x${Math.round(s.h)}${s.chrome ? ' (chrome)' : ''}`) : [],
    unfinished: m.unfinished, nowhere: m.nowhere, emptyNoNext: m.emptyNoNext,
    linksOut: Array.isArray(m.links) ? (m.links as { chrome: boolean }[]).filter((l) => !l.chrome).length : null,
    linksChrome: Array.isArray(m.links) ? (m.links as { chrome: boolean }[]).filter((l) => l.chrome).length : null,
    notFound: m.notFound, errorScreen: m.errorScreen, blank: m.blank, h1: m.h1, title: m.title,
  };
  res.a11y = a11y ? { serious: a11y.violations.filter((v) => /serious|critical/.test(v.impact)).map((v) => `${v.rule} ${v.impact} ${(v.target || '').slice(0, 60)} ${(v.detail || '').slice(0, 60)}`).slice(0, 12), total: a11y.violations.length } : null;
  // how much of the screen the 3D gets (the largest canvas)
  res.canvas = await page.evaluate(`(() => { let best = null; for (const c of document.querySelectorAll('canvas')) { const r = c.getBoundingClientRect(); if (!best || r.width * r.height > best.w * best.h) best = { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; } return best ? { ...best, share: Math.round(1000 * Math.max(0, Math.min(innerHeight, best.top + best.h) - Math.max(0, best.top)) * Math.min(best.w, innerWidth) / (innerWidth * innerHeight)) / 1000 } : null; })()`).catch(() => null);
  res.urlAfter = page.url().replace(ORIGIN, '');
  res.tinyText = tiny; res.soundsTotal = sounds;
  res.placeholderOnScreen = await page.evaluate(`(document.body.innerText.match(/\\[(PLACEHOLDER|DRAFT|TBD|TODO)\\]|lorem ipsum|coming soon|placeholder/gi) || []).slice(0, 8)`).catch(() => []);
  res.errors = errors; res.consoleErrors = consoleErr; res.failed = failed; res.perfLog = perfLog; res.t0 = t0;
  if (r.kind === 'page') await shot(page, join(out, `${tag}-${tier.id}-${r.id}.jpg`));
  await ctx.close();
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: walk.mts <outDir> [--tier=phone|desktop|both] [--only=id,id] [--tag=x]'); process.exit(2); }
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const tiers = (arg('tier') ?? 'both') === 'both' ? [TIERS.phone, TIERS.desktop] : [TIERS[arg('tier') as Tier['id']]];
  const only = arg('only')?.split(',');
  const tag = arg('tag') ?? 'r1';
  mkdirSync(out, { recursive: true });
  dbUp();
  const stop = await serve(join(out, 'server.log'));
  try {
    const p = await makePeople();
    const inpage = await bundleInpage();
    const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
    for (const tier of tiers) for (const r of ROUTES.filter((x) => !only || only.includes(x.id))) {
      const t = Date.now();
      let res: Record<string, unknown>;
      try { res = await one(browser, tier, p, r, inpage, out, tag); } catch (e) { res = { id: r.id, tier: tier.id, tag, crash: String(e).slice(0, 300) }; }
      writeFileSync(join(out, `${tag}-${tier.id}-${r.id}.json`), JSON.stringify(res, null, 1));
      const pl = res.play as Record<string, unknown> | undefined;
      console.log(`${tier.id} ${r.id} ${Math.round((Date.now() - t) / 1000)}s status ${res.status} err ${(res.errors as string[] | undefined)?.length ?? '?'} ready ${res.readyMs ?? '-'} ${pl ? `fps ${pl.fps} p95 ${pl.p95} >50 ${pl.over50} snd ${pl.soundsInPlay}` : ''}`);
    }
    await browser.close();
  } finally { stop(); }
}
