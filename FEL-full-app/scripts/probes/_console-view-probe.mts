// _console-view-probe — what does each mode look like SIDEWAYS and on a TV, measured (console-view lane, 2026-10-06).
//
// Owner: "Let's fix how it looks when it's horizontal, it looks bad when you screen mirror. We need it not to look
// squished. It needs to feel like a console game." Screen mirroring = a phone held sideways, mirrored to a TV; or a
// laptop/console browser on a 16:9 TV. This drives the REAL player routes (/play/**, which carry the GameShell) at
// landscape-phone, TV and portrait sizes and reads back, per shot:
//   - the canvas CSS box against the viewport: how much of the screen it covers, how much of it is OFF the screen
//     (cropped), the black bands around it, and whether the page scrolls;
//   - the backing size against the CSS size: a backing aspect that differs from the display aspect IS a stretch;
//   - the camera: fov, fovMode, and the effective vertical / horizontal FOV at this aspect;
//   - the hero's height as a fraction of the visible frame, and whether his head and feet are on the screen;
//   - the HUD: the smallest text, and how much of the screen height its top and bottom bands take.
//
// The /play routes are auth-gated and the profile comes from the database, so the probe mints a LOCAL session cookie
// (the dev server must run with the same NEXTAUTH_SECRET) and answers /api/profile itself. Nothing else is mocked.
//
//   NEXTAUTH_SECRET=console-view-local-probe … next dev -p 3170          (the server)
//   PORT=3170 OUT=/tmp/console-view/before MODES=dunk,skate SIZES=phone844,tv1080 \
//     CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome SWIFT=1 npx tsx scripts/probes/_console-view-probe.mts
import { chromium, type BrowserContext } from 'playwright-core';
import { encode } from 'next-auth/jwt';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3170';
const OUT = process.env.OUT ?? '/tmp/console-view/before';
const SECRET = process.env.NEXTAUTH_SECRET ?? 'console-view-local-probe';
const WAIT_PLAY_S = Number(process.env.WAIT_PLAY_S ?? 6);
fs.mkdirSync(OUT, { recursive: true });

const ROUTES: Record<string, string> = {
  dunk: '/play/dunk', onevone: '/play/onevone', threevthree: '/play/threevthree', skate: '/play/skateboard',
  karatevs: '/play/karate-vs', mixed: '/play/mixedcombat', kart: '/play/velocity-kart', aero: '/play/aero-aces',
  golf: '/play/golf', tennis: '/play/tennis', dance: '/play/dance', carnival: '/play/carnival',
};
type Size = { w: number; h: number; dsf: number; mobile: boolean };
const SIZES: Record<string, Size> = {
  phone844: { w: 844, h: 390, dsf: 3, mobile: true },
  phone932: { w: 932, h: 430, dsf: 3, mobile: true },
  tv1080: { w: 1920, h: 1080, dsf: 1, mobile: false },
  tv720: { w: 1280, h: 720, dsf: 1, mobile: false },
  portrait: { w: 390, h: 844, dsf: 3, mobile: true },
};
// DSF_PHONE=1: render the phone sizes at 1x. Layout is in CSS pixels and unchanged; the backing is 4x smaller, which is
// what lets a run finish on a box whose memory cgroup is OOM-killing renderers (the 2026-10-06 console-view run).
if (process.env.DSF_PHONE) for (const k of Object.keys(SIZES)) if (SIZES[k].mobile) SIZES[k].dsf = Number(process.env.DSF_PHONE);
const modes = (process.env.MODES ?? 'dunk,threevthree,skate,karatevs,kart,golf,dance,carnival').split(',');
const sizes = (process.env.SIZES ?? 'portrait,phone844,phone932,tv1080,tv720').split(',');

const GL = process.env.SWIFT
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: chromiumExe(), args: GL });
const token = await encode({ token: { sub: 'console-view-probe', email: 'probe@local', name: 'Probe', profileId: null, role: 'player' }, secret: SECRET });

async function context(s: Size): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dsf, isMobile: s.mobile, hasTouch: s.mobile });
  await ctx.addCookies([{ name: '__session', value: token, domain: 'localhost', path: '/' }]);
  await ctx.route('**/api/profile', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ prq: 62, grade: { label: 'Contender', color: '#00E5FF' } }) }));
  // window.__name: tsx's helper inside evaluated code. The Next dev overlay (its error toast) is dev-only chrome, not the game.
  await ctx.addInitScript({ content: `window.__name = window.__name || function (f) { return f; };
    addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(st); });` });
  return ctx;
}

/** Everything is read in the page, from the DOM and the live scene (`__FEL_DEV__.scene`, dev builds only). */
const MEASURE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const canvases = [...document.querySelectorAll('canvas')].filter((c) => c.width > 32 && c.height > 32);
  const c = canvases.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  const out = { vw, vh, scrollY: Math.max(0, document.documentElement.scrollHeight - vh), scrollX: Math.max(0, document.documentElement.scrollWidth - vw) };
  if (!c) return out;
  const r = c.getBoundingClientRect();
  const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)), visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  Object.assign(out, {
    css: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    cssAspect: +(r.width / r.height).toFixed(3),
    backing: { w: c.width, h: c.height }, backingAspect: +(c.width / c.height).toFixed(3),
    stretchPct: +(((c.width / c.height) / (r.width / r.height) - 1) * 100).toFixed(1),
    screenCoverPct: +((visW * visH) / (vw * vh) * 100).toFixed(1),
    canvasOffscreenPct: +((1 - (visW * visH) / Math.max(1, r.width * r.height)) * 100).toFixed(1),
    bandsPx: { top: Math.max(0, Math.round(r.top)), bottom: Math.max(0, Math.round(vh - r.bottom)), left: Math.max(0, Math.round(r.left)), right: Math.max(0, Math.round(vw - r.right)) },
  });
  const dev = window.__FEL_DEV__;
  const scene = dev && dev.scene; const cam = scene && scene.activeCamera;
  if (cam) {
    const eng = scene.getEngine(); const aspect = eng.getRenderWidth() / eng.getRenderHeight();
    const vf = cam.fovMode === 1 ? 2 * Math.atan(Math.tan(cam.fov / 2) / aspect) : cam.fov;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    out.camera = { name: cam.name, type: cam.getClassName(), fov: +cam.fov.toFixed(3), fovMode: cam.fovMode, vfovDeg: +(vf * 180 / Math.PI).toFixed(1), hfovDeg: +(hf * 180 / Math.PI).toFixed(1), render: eng.getRenderWidth() + 'x' + eng.getRenderHeight() };
    try {
      const hero = dev.hero && dev.hero();
      if (hero) {
        let top = hero; while (top.parent) top = top.parent;
        const bv = top.getHierarchyBoundingVectors ? top.getHierarchyBoundingVectors(true) : null;
        if (bv) {
          const V = bv.min.constructor; const m = scene.getTransformMatrix();
          const xs = [bv.min.x, bv.max.x], ys = [bv.min.y, bv.max.y], zs = [bv.min.z, bv.max.z];
          let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, behind = false;
          for (const x of xs) for (const y of ys) for (const z of zs) {
            const p = V.TransformCoordinates(new V(x, y, z), m);
            if (p.z > 1 || p.z < 0) behind = true;
            const sx = (p.x + 1) / 2 * r.width + r.left, sy = (1 - p.y) / 2 * r.height + r.top;
            y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
          }
          out.hero = { heightM: +(bv.max.y - bv.min.y).toFixed(2), topPx: Math.round(y0), bottomPx: Math.round(y1), leftPx: Math.round(x0), rightPx: Math.round(x1),
            fracOfScreenH: +((y1 - y0) / vh).toFixed(3), headOn: y0 >= 0, feetOn: y1 <= vh, behind };
        }
      }
    } catch (e) { out.heroErr = String(e); }
  }
  // HUD: visible text inside the stage, the splash excluded (it is a full-screen card, not the HUD)
  const host = c.parentElement;
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement; if (!el || !n.textContent.trim()) continue;
    if (el.closest('[data-boot-splash]') || el.closest('script,style,noscript')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const rr = el.getBoundingClientRect(); if (rr.width < 1 || rr.height < 1) continue;
    if (rr.bottom < 0 || rr.top > vh || rr.right < 0 || rr.left > vw) { texts.push({ off: true, t: n.textContent.trim().slice(0, 24) }); continue; }
    texts.push({ t: n.textContent.trim().slice(0, 24), fs: +(parseFloat(cs.fontSize) * (el.currentCSSZoom || 1)).toFixed(1), top: rr.top, bottom: rr.bottom, left: rr.left, right: rr.right });
  }
  const on = texts.filter((t) => !t.off);
  const fsz = on.map((t) => t.fs).sort((a, b) => a - b);
  const topBand = on.filter((t) => t.bottom < vh * 0.5).reduce((m, t) => Math.max(m, t.bottom), 0);
  const botBand = on.filter((t) => t.top > vh * 0.5).reduce((m, t) => Math.max(m, vh - t.top), 0);
  const centre = on.filter((t) => t.left < vw * 0.7 && t.right > vw * 0.3 && t.top < vh * 0.7 && t.bottom > vh * 0.3).map((t) => t.t);
  const edge = on.reduce((m, t) => Math.min(m, t.left, vw - t.right, t.top, vh - t.bottom), 1e9);
  out.hud = { n: on.length, offscreen: texts.filter((t) => t.off).length, minFontPx: fsz[0] ?? null, medianFontPx: fsz[Math.floor(fsz.length / 2)] ?? null,
    minFontPctVh: fsz.length ? +(fsz[0] / vh * 100).toFixed(2) : null,
    topBandPctVh: +(topBand / vh * 100).toFixed(1), bottomBandPctVh: +(botBand / vh * 100).toFixed(1),
    nearestEdgePx: on.length ? Math.round(edge) : null, centreText: centre.slice(0, 6) };
  out.shellChrome = !!document.querySelector('header[data-game-chrome]:not(.hidden)') && getComputedStyle(document.querySelector('header[data-game-chrome]')).display !== 'none';
  return out;
})()`;

/** The READY card: does it fit the screen? Its title's top, its last control's bottom, and whether its column overflows. */
const SPLASH = `(() => {
  const vh = innerHeight; const b = [...document.querySelectorAll('button')].find((x) => /TAP TO START/.test(x.textContent || ''));
  if (!b) return null;
  let col = b.parentElement; while (col && col.scrollHeight <= col.clientHeight + 1 && col.parentElement && col !== document.body) col = col.parentElement;
  const h1 = b.parentElement.querySelector('h1'); const t = h1 ? h1.getBoundingClientRect() : null;
  const items = [...b.parentElement.querySelectorAll('button,p,h1')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
  const lo = Math.min(...items.map((r) => r.top)), hi = Math.max(...items.map((r) => r.bottom));
  return { titleTop: t ? Math.round(t.top) : null, contentTop: Math.round(lo), contentBottom: Math.round(hi), overflowPx: Math.round(Math.max(0, -lo) + Math.max(0, hi - vh)),
    startBtn: Math.round(b.getBoundingClientRect().top) + '..' + Math.round(b.getBoundingClientRect().bottom), h1Px: h1 ? parseFloat(getComputedStyle(h1).fontSize) : null };
})()`;

// SOFTWARE GL ON A SHARED BOX: a 1080p frame took longer than a 90 s screenshot timeout, because a screenshot waits for a
// fresh compositor frame and the render loop keeps the GPU process busy. So each still is taken on a FROZEN engine: wait
// for two frames drawn at the current size (the backing has followed any resize), stop the render loop, measure and
// shoot (compositing the last frame is cheap), then resume the same loop functions.
const FRAMES = `(n) => new Promise((res) => { const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return res(false);
  let k = 0; const o = s.onAfterRenderObservable.add(() => { if (++k >= n) { s.onAfterRenderObservable.remove(o); res(true); } }); })`;
const FREEZE = `(() => { const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return false; const e = s.getEngine();
  window.__cvLoops = [...(e._activeRenderLoops || [])]; e.stopRenderLoop(); return window.__cvLoops.length; })()`;
const THAW = `(() => { const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s || !window.__cvLoops) return; const e = s.getEngine();
  for (const f of window.__cvLoops) e.runRenderLoop(f); window.__cvLoops = null; })()`;
const within = <T,>(ms: number, pr: Promise<T>) => Promise.race([pr, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
async function still(p: import('playwright-core').Page, file: string): Promise<Record<string, unknown>> {
  const drew = await within(240000, p.evaluate(`(${FRAMES})(2)`));
  const frozen = await p.evaluate(FREEZE);
  const m = await p.evaluate(MEASURE) as Record<string, unknown>;
  await p.screenshot({ path: file, timeout: 240000 });
  await p.evaluate(THAW);
  return { ...m, drewAtSize: drew === true, frozenLoops: frozen };
}

const results: Record<string, unknown>[] = [];
// ROTATE=1: the turn itself. A phone starts in portrait, the game runs, then it is turned sideways and back; the backing
// is read after each turn. A canvas whose box changed without the engine hearing about it renders the old aspect
// stretched into the new box — the literal squish.
if (process.env.ROTATE) {
  const ctx = await context(SIZES.portrait);
  for (const mode of modes) {
    const p = await ctx.newPage();
    try {
      await p.goto(`http://localhost:${PORT}${ROUTES[mode]}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      const btn = p.locator('button:has-text("TAP TO START") >> visible=true').first();
      for (let i = 0; i < 180 && !(await btn.count()); i++) await p.waitForTimeout(1000);
      for (let i = 0; i < 20 && await btn.isVisible().catch(() => false); i++) { await btn.click({ force: true }).catch(() => {}); await p.waitForTimeout(2500); }
      const read = () => p.evaluate(MEASURE) as Promise<Record<string, any>>;
      const pick = (m: Record<string, any>) => ({ css: m.css, backing: m.backing, stretchPct: m.stretchPct, screenCoverPct: m.screenCoverPct, render: m.camera?.render });
      const a = pick(await read());
      await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(4000);
      const b = pick(await read());
      await p.screenshot({ path: path.join(OUT, `${mode}-rotated-landscape.png`), timeout: 60000 });
      await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(4000);
      const c = pick(await read());
      results.push({ mode, rotate: { portrait: a, landscape: b, backToPortrait: c } });
    } catch (e) { results.push({ mode, rotate: 'error ' + String(e).slice(0, 160) }); }
    console.log(JSON.stringify(results.at(-1)));
    await p.close();
  }
  await ctx.close();
  fs.writeFileSync(path.join(OUT, 'rotate.json'), JSON.stringify(results, null, 1));
  await browser.close();
  process.exit(0);
}
// One load per mode and DEVICE CLASS: a phone page is opened at the first phone size and turned to the others (the
// turn is the real thing a phone does), a desktop page likewise across the TV sizes. Five cold loads per mode were
// ~5 min each on a shared 4-core box under software GL; this is two.
const groups: string[][] = [sizes.filter((k) => SIZES[k].mobile), sizes.filter((k) => !SIZES[k].mobile)].filter((g) => g.length);
const append = (r: Record<string, unknown>) => { results.push(r); fs.appendFileSync(path.join(OUT, 'all.jsonl'), JSON.stringify(r) + '\n'); console.log(JSON.stringify(r)); };
for (const mode of modes) {
  for (const group of groups) {
    const ctx = await context(SIZES[group[0]]);
    const p = await ctx.newPage();
    const errs: string[] = [];
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
    // a renderer the box OOM-kills leaves every locator call waiting; the crash event ends the attempt instead
    let crashed = false;
    p.on('crash', () => { crashed = true; });
    const t0 = Date.now();
    try {
      await p.goto(`http://localhost:${PORT}${ROUTES[mode]}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      // the READY card first (it is part of how a mode looks sideways), then its start button until the card goes
      const btn = p.locator('button:has-text("TAP TO START") >> visible=true').first();
      let ready = false;
      for (let i = 0; i < 600 && !ready; i++) {
        if (crashed) throw new Error('renderer crashed');
        // the harness's own load timeout fires on a box this slow; its RETRY reloads the arena in place
        const retry = p.locator('button:has-text("RETRY") >> visible=true').first();
        if (i % 5 === 4 && await within(10000, retry.count())) await retry.click({ timeout: 5000 }).catch(() => {});
        ready = !!(await within(20000, btn.count())) && await btn.isVisible().catch(() => false);
        if (!ready) await p.waitForTimeout(1000);
        // a dev server killed under us (this box OOM-kills the biggest process) leaves the page waiting forever
        if (i % 15 === 14 && !(await fetch(`http://localhost:${PORT}/favicon.svg`).then((r) => r.ok, () => false))) throw new Error('dev server down');
      }
      const readyM: Record<string, unknown> = {};
      for (const sizeKey of group) {
        if (!ready) break;
        await p.setViewportSize({ width: SIZES[sizeKey].w, height: SIZES[sizeKey].h });
        await p.waitForTimeout(1500);
        const shot = await still(p, path.join(OUT, `${mode}-${sizeKey}-ready.png`));
        readyM[sizeKey] = { ...(await p.evaluate(SPLASH) as object), drewAtSize: shot.drewAtSize };
      }
      await p.setViewportSize({ width: SIZES[group[0]].w, height: SIZES[group[0]].h });
      let started = false;
      for (let i = 0; i < 20 && ready && !started; i++) {
        if (await btn.isVisible().catch(() => false)) await btn.click({ timeout: 3000, force: true }).catch(() => {});
        await p.waitForTimeout(2500);
        started = !(await btn.isVisible().catch(() => false));
      }
      if (!started) await p.keyboard.press('Escape').catch(() => {});
      await p.waitForTimeout(WAIT_PLAY_S * 1000);
      for (const sizeKey of group) {
        await p.setViewportSize({ width: SIZES[sizeKey].w, height: SIZES[sizeKey].h });
        await p.waitForTimeout(sizeKey === group[0] ? 500 : 4000);
        const m = await still(p, path.join(OUT, `${mode}-${sizeKey}.png`));
        append({ mode, size: sizeKey, turnedFrom: sizeKey === group[0] ? null : group[0], started, ready: readyM[sizeKey] ?? null,
          secs: Math.round((Date.now() - t0) / 1000), ...m, errs: errs.slice(0, 3) });
      }
    } catch (e) {
      append({ mode, sizes: group, error: String(e).slice(0, 200) });
    }
    await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(results, null, 1));
await browser.close();
