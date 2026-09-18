// OOM-HYGIENE probe — short-session WebGL survival. Enters a mode, plays it, leaves it (or lets it end and replays), comes
// back, and after every checkpoint forces a GC and counts what is still alive: WebGL contexts (created / lost / collected),
// Babylon scenes and engines (WeakRefs taken as each mount publishes __FEL_DEV__), the live engine's GPU texture cache,
// scene meshes / materials / observers, and the JS heap. A context lost on a CONNECTED canvas, a page crash, or a second
// enter that grows the texture cache / keeps the previous scene alive = FAIL.
//   PORT=3047 MODE=try npx tsx scripts/probes/_oom-hygiene-probe.mts          two full guest contests + DUNK AGAIN + a soft reload
//   PORT=3047 MODE=karate|karate_vs npx tsx …                                  login, play ~35 s, exit to /play, re-enter ×2, reload
//   PORT=3047 MODE=skateboard|tennis npx tsx …                                 canaries: play 20 s, exit, re-enter once
//   PLAY_S=35 LOOPS=2 override the per-mode defaults. Needs a `next dev` server (the probe reads __FEL_DEV__).
import { chromium, request, type Page } from 'playwright-core';
const PORT = process.env.PORT ?? '3047', BASE = `http://localhost:${PORT}`, MODE = process.env.MODE ?? 'try';
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const ROUTE: Record<string, string> = { try: '/try', karate: '/play/karate', karate_vs: '/play/karate-vs', skateboard: '/play/skateboard', tennis: '/play/tennis' };
const LOOPS = Number(process.env.LOOPS ?? (MODE === 'try' ? 2 : MODE === 'karate' || MODE === 'karate_vs' ? 2 : 1));
const PLAY_S = Number(process.env.PLAY_S ?? (MODE === 'karate' || MODE === 'karate_vs' ? 35 : 20));

// ── in-page instrumentation, installed BEFORE navigation: every WebGL context ever created, its canvas, its lost event ──
const INIT = `(() => {
  const O = window.__oom = { contexts: [], lostEvents: [], scenes: [], engines: [], mounts: 0, token: Math.random().toString(36).slice(2) };   // token: a new document = a new token (a hard navigation)
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const ctx = orig.call(this, kind, ...rest);
    if (ctx && /webgl/.test(String(kind)) && !O.contexts.some((c) => c.ref.deref() === ctx)) {
      const id = O.contexts.length;
      O.contexts.push({ id, kind: String(kind), ref: new WeakRef(ctx), canvas: new WeakRef(this), at: performance.now() });
      this.addEventListener('webglcontextlost', () => O.lostEvents.push({ id, at: performance.now(), connected: this.isConnected, mounts: O.mounts }));
    }
    return ctx;
  };
  let last = null;
  setInterval(() => {
    const d = window.__FEL_DEV__; const s = d && d.scene;
    if (s && s !== last) { last = s; O.mounts++; O.scenes.push(new WeakRef(s)); O.engines.push(new WeakRef(s.getEngine())); }
  }, 100);
})()`;

const REPORT = `(() => {
  const O = window.__oom; const d = window.__FEL_DEV__; const s = d && d.scene && !d.scene.isDisposed ? d.scene : null;
  const ctxs = O.contexts.map((c) => { const g = c.ref.deref(); const cv = c.canvas.deref(); return { id: c.id, alive: !!g, lost: g ? g.isContextLost() : null, connected: cv ? cv.isConnected : false, canvasAlive: !!cv }; });
  const scenes = O.scenes.map((r, i) => { const x = r.deref(); return x ? (x.isDisposed ? 'disposed' : 'LIVE') : 'gc'; });
  const engines = O.engines.map((r) => { const e = r.deref(); return e ? { alive: true, disposed: !!e.isDisposed, tex: (e._internalTexturesCache || []).length, scenes: (e.scenes || []).length } : { alive: false }; });
  const cur = s ? { tex: (s.getEngine()._internalTexturesCache || []).length, meshes: s.meshes.length, mats: s.materials.length, textures: s.textures.length, groups: s.animationGroups.length, obs: s.onBeforeRenderObservable.observers.length + s.onAfterAnimationsObservable.observers.length, skeletons: s.skeletons.length, lights: s.lights.length, cams: s.cameras.length } : null;
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
  return JSON.stringify({ ctxs, scenes, engines, cur, heapMB: mem, lost: O.lostEvents, mounts: O.mounts, token: O.token, path: location.pathname });
})()`;

type Ctx = { id: number; alive: boolean; lost: boolean | null; connected: boolean; canvasAlive: boolean };
type Report = { ctxs: Ctx[]; scenes: string[]; engines: { alive: boolean; disposed?: boolean; tex?: number; scenes?: number }[]; cur: { tex: number; meshes: number; mats: number; textures: number; groups: number; obs: number; skeletons: number } | null; heapMB: number; lost: { id: number; at: number; connected: boolean; mounts: number }[]; mounts: number; token: string; path: string };

const b = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
let storage: Awaited<ReturnType<Awaited<ReturnType<typeof request.newContext>>['storageState']>> | undefined;
if (MODE !== 'try') {
  const rc = await request.newContext({ baseURL: BASE });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', callbackUrl: `${BASE}/`, json: 'true' } });
  storage = await rc.storageState(); await rc.dispose();
}
const context = await b.newContext({ viewport: { width: 1280, height: 800 }, storageState: storage });
const p = await context.newPage();
const cdp = await context.newCDPSession(p);
const errors: string[] = []; const diag: string[] = []; const chromeLost: string[] = []; const devChunk: string[] = []; const spam = new Map<string, number>(); let crashed = false;
p.on('crash', () => { crashed = true; console.log('!!! PAGE CRASHED'); });
p.on('console', (m) => {
  const t = m.text();
  if (/Graphics were reset|\[FEL-MODE\].*context|context restored/i.test(t)) diag.push(t.slice(0, 160));
  if (/WebGL: CONTEXT_LOST_WEBGL/.test(t)) chromeLost.push(t.slice(0, 120));   // Chrome's own line — expected once per DISPOSED engine (loseContextOnDispose), graded via the canvas' connected flag
  if (/_next\/static\/chunks\/undefined\.js/.test(t)) { devChunk.push(t.slice(0, 120)); return; }   // next dev's undefined chunk after a recompile — a dev-server artifact, counted apart
  if (m.type() === 'error' && !/status of 401/.test(t)) errors.push(t.slice(0, 200));
  if (m.type() === 'warning' || m.type() === 'error') { const k = t.replace(/\d+/g, '#').slice(0, 90); spam.set(k, (spam.get(k) ?? 0) + 1); }
});
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
await p.addInitScript(INIT);

const checkpoints: { label: string; r: Report }[] = [];
async function checkpoint(label: string): Promise<Report> {
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await p.evaluate('typeof gc === "function" && gc()').catch(() => {}); await p.waitForTimeout(300); }
  const r = JSON.parse(await p.evaluate<string>(REPORT)) as Report;
  checkpoints.push({ label, r });
  const live = r.ctxs.filter((c) => c.alive && c.lost === false);
  const liveDetached = live.filter((c) => !c.connected).length;
  console.log(`[${label}] ctx created ${r.ctxs.length} · alive+unlost ${live.length} (detached ${liveDetached}) · lost ${r.ctxs.filter((c) => c.lost === true).length} · gc'd ${r.ctxs.filter((c) => !c.alive).length} | scenes ${r.scenes.join(',')} | engines ${r.engines.map((e) => e.alive ? `${e.disposed ? 'disposed' : 'LIVE'}:tex${e.tex}` : 'gc').join(',')} | cur ${r.cur ? `tex ${r.cur.tex} meshes ${r.cur.meshes} mats ${r.cur.mats} textures ${r.cur.textures} groups ${r.cur.groups} obs ${r.cur.obs} skel ${r.cur.skeletons}` : '—'} | heap ${r.heapMB} MB`);
  return r;
}

const readyState = (): Promise<string> => p.evaluate('(document.getElementById("fel-ready") || {}).dataset ? (document.getElementById("fel-ready").dataset.state || "") : ""') as Promise<string>;
async function waitLoaded(timeoutMs = 120000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const st = await readyState();
    if (st === 'loaded' || st === 'playing') return;
    if (st === 'failed') throw new Error('mode FAILED to load: ' + (await p.evaluate('document.body.innerText.slice(0,300)')));
    await p.waitForTimeout(250);
  }
  throw new Error('load timeout');
}
async function tapStart(): Promise<void> {
  const btn = p.locator('button', { hasText: /TAP TO START/i }).first();
  if (await btn.count()) await btn.click(); else await p.keyboard.press('Space');
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) { if ((await readyState()) === 'playing') return; await p.waitForTimeout(200); }
  throw new Error('never reached playing');
}
async function enter(route: string): Promise<void> {
  await p.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await waitLoaded();
  await p.waitForTimeout(800);
}

// ── drivers ──
const modalCount = (): Promise<number> => p.locator('h2', { hasText: /CONTEST|NICE DUNK/ }).count();
const launchLines: number[] = [];
p.on('console', (m) => { if (/JUICE-SOFT\] launch/.test(m.text())) launchLines.push(Date.now()); });
async function dunkContest(maxS = 200): Promise<boolean> {
  await tapStart();
  await p.waitForTimeout(2500);
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < maxS * 1000 && (await modalCount()) === 0 && n < 10 && !crashed) {
    n++;
    const before = launchLines.length;
    await p.keyboard.down('w'); await p.waitForTimeout(900); await p.keyboard.up('w');
    await p.keyboard.down(' ');
    const h0 = Date.now(); while (launchLines.length === before && Date.now() - h0 < 1400) await p.waitForTimeout(50);
    await p.keyboard.up(' ');
    const l0 = Date.now(); while (launchLines.length === before && Date.now() - l0 < 1500) await p.waitForTimeout(50);
    if (launchLines.length === before) { console.log(`   attempt ${n}: no launch`); continue; }
    await p.waitForTimeout(1000);
    for (let i = 0; i < 14; i++) { await p.keyboard.down('j'); await p.waitForTimeout(35); await p.keyboard.up('j'); await p.waitForTimeout(50); }
    const w0 = Date.now();
    while (Date.now() - w0 < 40000 && !crashed) {
      await p.waitForTimeout(500);
      if ((await modalCount()) > 0) break;
      const txt = (await p.evaluate('document.body.innerText') as string).replace(/\s+/g, ' ');
      if (/Pick your PROP|HOLD to run|FINAL ROUND/.test(txt) && Date.now() - w0 > 3000) break;
    }
    console.log(`   attempt ${n} @${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const done = (await modalCount()) > 0;
  console.log(`   contest ${done ? 'ENDED (modal up)' : 'did not reach the modal'} after ${n} attempts, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return done;
}
async function playFor(seconds: number, keys: string[]): Promise<void> {
  const t0 = Date.now(); let i = 0;
  while (Date.now() - t0 < seconds * 1000 && !crashed) {
    const k = keys[i++ % keys.length];
    if (k.startsWith('hold:')) { const [, key, ms] = k.split(':'); await p.keyboard.down(key); await p.waitForTimeout(Number(ms)); await p.keyboard.up(key); }
    else { await p.keyboard.down(k); await p.waitForTimeout(60); await p.keyboard.up(k); await p.waitForTimeout(200); }
    // a result modal (down / round over) → PLAY AGAIN keeps the loop honest: that is the host's retry path
    const again = p.locator('button', { hasText: /PLAY AGAIN|DUNK AGAIN/i }).first();
    if (await again.count()) { console.log('   result modal → PLAY AGAIN'); await again.click(); await waitLoaded(); await tapStart(); }
    const st = await readyState();
    if (st === 'loaded') await tapStart();
  }
}
const KEYS: Record<string, string[]> = {
  karate: ['hold:w:400', 'j', 'k', 'hold:a:300', 'i', 'j', 'hold:d:300', 'k', 'l', 'j'],
  karate_vs: ['hold:w:400', 'j', 'k', 'hold:a:300', 'i', 'j', 'hold:d:300', 'k', 'l', 'j'],
  skateboard: ['hold: :700', 'hold:a:400', 'hold: :700', 'j', 'hold:d:400', 'hold: :700', 'k'],
  tennis: ['hold:a:500', ' ', 'hold:d:500', ' ', 'j', 'hold:a:400', ' '],
};

// ── the loops ──
try {
  const route = ROUTE[MODE];
  await enter(route);
  const first = await checkpoint('enter 1');
  if (MODE === 'try') {
    for (let loop = 1; loop <= LOOPS; loop++) {
      await dunkContest();
      await checkpoint(`contest ${loop} ended`);
      if (loop < LOOPS) {
        const again = p.locator('button', { hasText: /DUNK AGAIN/i }).first();
        if (!(await again.count())) { console.log('no DUNK AGAIN button — reloading instead'); await p.reload({ waitUntil: 'domcontentloaded' }); }
        else await again.click();
        await waitLoaded(); await p.waitForTimeout(800);
        await checkpoint(`re-enter ${loop + 1} (DUNK AGAIN)`);
      }
    }
    console.log('soft reload');
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 90000 }); await waitLoaded(); await p.waitForTimeout(800);
    await checkpoint('after reload');
    await tapStart(); await p.waitForTimeout(3000);
    // one attempt on the reloaded page
    await p.keyboard.down('w'); await p.waitForTimeout(900); await p.keyboard.up('w'); await p.keyboard.down(' '); await p.waitForTimeout(1200); await p.keyboard.up(' '); await p.waitForTimeout(6000);
    await checkpoint('after reload + 1 attempt');
  } else {
    for (let loop = 1; loop <= LOOPS; loop++) {
      await tapStart();
      await playFor(PLAY_S, KEYS[MODE]);
      await checkpoint(`played ${loop}`);
      // exit: the shell's own Home link — a client-side navigation, so the JS context (and any leak) survives into the next enter
      const home = p.locator('a[href="/"]', { hasText: /Home/ }).first();   // the GameShell header's back link (an icon + ' Home')
      const clientExit = (await home.count()) > 0;
      if (clientExit) { await home.dispatchEvent('click'); await p.waitForURL((u) => u.pathname === '/', { timeout: 30000 }).catch(() => {}); }   // a dispatched click: the canvas host overlaps the header link's hit box
      else await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      const before = checkpoints[checkpoints.length - 1].r.token;
      const ex = await checkpoint(`exited ${loop} (${clientExit ? 'client nav' : 'full load'})`);
      if (clientExit && ex.token !== before) { console.log(`   NOTE: the exit became a HARD navigation (new document at ${ex.path}) — next dev's chunk-load fallback; the checkpoint reads the home page's own scene, so this exit cannot grade the teardown`); checkpoints[checkpoints.length - 1].label = `exited ${loop} (hard nav — ungraded)`; }
      const back = p.locator(`a[href="${route}"]`).first();
      if (await back.count()) { await back.dispatchEvent('click'); await p.waitForSelector('canvas', { timeout: 90000 }); await waitLoaded(); await p.waitForTimeout(800); console.log('   re-entered through a page link (client nav)'); }
      else await enter(route);
      await checkpoint(`re-enter ${loop + 1}`);
    }
    console.log('soft reload');
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 90000 }); await waitLoaded(); await p.waitForTimeout(800);
    await checkpoint('after reload');
    await tapStart(); await playFor(10, KEYS[MODE]);
    await checkpoint('after reload + 10 s play');
  }
} catch (e) { console.log('probe error:', String((e as Error)?.message ?? e).slice(0, 300)); }

// ── grade ──
const last = checkpoints[checkpoints.length - 1]?.r;
const chk = (name: string, ok: boolean, detail: string) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
const lostLive = checkpoints.flatMap((c) => c.r.lost).filter((l) => l.connected);
chk('no page crash', !crashed, crashed ? 'the renderer died' : 'renderer alive to the end');
chk('no WebGL context lost on a live canvas', lostLive.length === 0 && diag.length === 0, lostLive.length ? `${lostLive.length} lost events on a connected canvas` : diag.length ? diag.slice(0, 3).join(' | ') : `no lost event on a connected canvas, no harness context diag (${checkpoints.flatMap((c) => c.r.lost).filter((l) => !l.connected).length} retired canvases released their context; Chrome logged CONTEXT_LOST ${chromeLost.length}×)`);
const reenters = checkpoints.filter((c) => /re-enter|after reload$/.test(c.label));
for (const c of reenters) {
  const live = c.r.ctxs.filter((x) => x.alive && x.lost === false);
  chk(`${c.label}: previous contexts released`, live.length <= 1, `${live.length} live contexts (${live.filter((x) => !x.connected).length} on detached canvases), ${c.r.ctxs.filter((x) => x.lost).length} lost, ${c.r.ctxs.filter((x) => !x.alive).length} gc'd of ${c.r.ctxs.length}`);
  const liveScenes = c.r.scenes.filter((s) => s !== 'gc').length;
  chk(`${c.label}: previous scenes collected`, liveScenes <= 1, `scenes ${c.r.scenes.join(',')} · engines ${c.r.engines.map((e) => e.alive ? (e.disposed ? 'disposed' : 'LIVE') : 'gc').join(',')}`);
}
for (const c of checkpoints.filter((x) => /^exited .*client nav/.test(x.label))) {
  const live = c.r.ctxs.filter((x) => x.alive && x.lost === false);
  chk(`${c.label}: the mode's context is gone after an in-page exit`, live.length === 0, `${live.length} live+unlost contexts, ${c.r.ctxs.filter((x) => x.lost).length} lost, ${c.r.ctxs.filter((x) => !x.alive).length} gc'd of ${c.r.ctxs.length}; canvases alive ${c.r.ctxs.filter((x) => x.canvasAlive).length}`);
  // a DISPOSED husk may stay reachable through the mode singleton's last spawn (`rival.root._scene`, heap snapshot 2026-09-07) — its
  // arrays are emptied and its GLB containers released with it, so it is a few KB; a LIVE (undisposed) scene is the failure. The
  // heap floor after an in-page exit on `next dev` is the bundle's own source text (eval-source-map, ~300 MB), not the game.
  chk(`${c.label}: no live scene / engine after an in-page exit`, c.r.scenes.every((x) => x !== 'LIVE') && c.r.engines.every((e) => !e.alive || e.disposed), `scenes ${c.r.scenes.join(',')} · engines ${c.r.engines.map((e) => e.alive ? (e.disposed ? `disposed:tex${e.tex}` : 'LIVE') : 'gc').join(',')} · heap ${c.r.heapMB} MB`);
}
const first = checkpoints.find((c) => c.label === 'enter 1')?.r.cur;
if (first) for (const c of reenters) if (c.r.cur) chk(`${c.label}: no GPU growth vs enter 1`, c.r.cur.tex <= first.tex + 4 && c.r.cur.meshes <= first.meshes * 1.15 + 5, `tex ${first.tex} → ${c.r.cur.tex}, meshes ${first.meshes} → ${c.r.cur.meshes}, mats ${first.mats} → ${c.r.cur.mats}, obs ${first.obs} → ${c.r.cur.obs}`);
const heaps = checkpoints.map((c) => `${c.label} ${c.r.heapMB}`);
console.log(`heap MB by checkpoint: ${heaps.join(' · ')}`);
if (devChunk.length) console.log(`note: ${devChunk.length} next-dev chunk artifact line(s) (chunks/undefined.js) — the dev server, not the game; the 404 that pairs with it is left in the error list below`);
chk('no console errors', errors.length === 0, errors.length ? `${errors.length}: ${[...new Set(errors)].slice(0, 4).join(' | ')}` : 'none');
const flood = [...spam.entries()].filter(([, n]) => n >= 10).sort((a, b) => b[1] - a[1]);
chk('no console spam (≥10 of one line)', flood.length === 0, flood.length ? flood.slice(0, 4).map(([k, n]) => `${n}× ${k}`).join(' | ') : 'none');
void last;
await b.close();
