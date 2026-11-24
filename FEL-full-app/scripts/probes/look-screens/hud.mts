// LOOK-SCREENS (2026-11-24): the measuring probe for phases A1 and A2 of docs/LOOK-PASS-AUDIT.md — the upright game header and the
// upright hoops HUD. Read-only, on the look-audit rig (scripts/every-screen/rig.mts: a production build, a throwaway database, the
// rig's admin signed in through the real routes). Before and after are the SAME build: "before" is the new knobs at their off
// values (which restore today's screen exactly: tests pin it), "after" is them at 1 — so both sides are the same route, size,
// moment and account (the admin: feel overrides apply only for an admin), and `?perf=off` keeps the perf guard from softening one.
//
// Per run and per moment (3 s into play, then 6 s later after the stick and an action button were pressed, as look-walk.mts):
//   header      the game header's height, and the stage's and the canvas's top / height
//   hudText     every visible text box over the canvas (the HUD, the deck's hint slot, the juice overlay's callout) with its text
//   deck        every touch-deck control's box
//   bodies/rim  the players' and the rim's boxes on screen, projected from the running scene (window.__NEXUS_AGENT__, which a
//               production build arms only on a server-marked agent run on loopback: the page is opened with ?agent=1)
//   overlap     px² of HUD text over a body or the rim, and of HUD text over a deck control
//
//   /home/user/wt/gate-run.sh 1700 npx tsx scripts/probes/look-screens/hud.mts <outDir> --side=before|after [--only=id,id] [--runs=3] [--size=390x844]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState, type People } from '../../every-screen/rig.mts';

const ROUTES: Record<string, string> = {
  onevone: '/play/onevone', threevthree: '/play/threevthree', threepoint: '/play/threepoint', dunk: '/play/dunk', tennis: '/play/tennis',
};
const KNOBS_OFF = { 'ui.compactGameHeader': 0, 'ui.hudZonesUpright': 0 };
const KNOBS_ON = { 'ui.compactGameHeader': 1, 'ui.hudZonesUpright': 1 };
const INIT = `(() => { const st = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a); })()`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** In the page: the boxes. A string so tsx does not rewrite it. */
const MEASURE = `(() => {
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    for (let p = el.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05) return false; } return true; };
  const box = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const header = document.querySelector('header[data-game-chrome]');
  const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  const cr = canvas ? canvas.getBoundingClientRect() : null;
  const out = { header: header && vis(header) ? box(header.getBoundingClientRect()) : null, canvas: cr ? box(cr) : null, hudText: [], deck: [], bodies: [], rim: null, scene: false };
  // text boxes over the canvas: leaf-ish elements with their own text, outside the shell's header and the capture menu
  const host = canvas ? canvas.parentElement : document.body;
  for (const el of host.querySelectorAll('*')) {
    if (el.closest('[data-capture-ui]') || el.closest('header')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!own || !vis(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (cr && (r.bottom < cr.top || r.top > cr.bottom)) continue;
    const inDeck = !!el.closest('[data-touch-deck]');
    const isButton = !!el.closest('button');
    out.hudText.push({ ...box(r), t: el.textContent.trim().slice(0, 60), deck: inDeck, button: isButton, hint: !!el.closest('[data-hoops-deck-hint]') });
  }
  for (const el of host.querySelectorAll('[data-touch-deck] button, [data-touch-deck] [data-float-stick], [data-touch-deck] .rounded-full.border')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 8) continue; out.deck.push({ ...box(r), t: (el.textContent || '').trim().slice(0, 20) });
  }
  // the scene, through the agent bridge (production arms it only on a server-marked agent run)
  try {
    const b = window.__NEXUS_AGENT__; const scene = b && b.host && b.host.scene;
    if (scene && cr) {
      out.scene = true;
      const cam = scene.activeCamera, eng = scene.getEngine(), W = eng.getRenderWidth(), H = eng.getRenderHeight();
      const tm = scene.getTransformMatrix(), V = cam.position.constructor, M = tm.constructor, vp = cam.viewport.toGlobal(W, H), I = M.Identity();
      const proj = (p) => { const s = V.Project(p, I, tm, vp); return { x: cr.left + s.x * cr.width / W, y: cr.top + s.y * cr.height / H, z: s.z }; };
      const rectOf = (pts) => { const ps = pts.map(proj).filter((p) => p.z > 0 && p.z < 1); if (!ps.length) return null;
        const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y); const x0 = Math.max(cr.left, Math.min(...xs)), x1 = Math.min(cr.right, Math.max(...xs)), y0 = Math.max(cr.top, Math.min(...ys)), y1 = Math.min(cr.bottom, Math.max(...ys));
        return x1 > x0 && y1 > y0 ? { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) } : null; };
      // the players: the hero and the characters the mode tells the bridge about are skinned bodies near the play; group meshes by skeleton
      const bySkel = new Map();
      for (const m of scene.meshes) {
        if (!m.skeleton || !m.isEnabled() || !m.isVisible || m.visibility < 0.05) continue;
        if (typeof m.refreshBoundingInfo === 'function') { try { m.refreshBoundingInfo({ applySkeleton: true }); } catch { try { m.refreshBoundingInfo(true); } catch {} } }
        const bb = m.getBoundingInfo().boundingBox; const k = m.skeleton.uniqueId;
        const a = bySkel.get(k) || { name: m.skeleton.name || m.name, pts: [] }; a.pts.push(...bb.vectorsWorld); bySkel.set(k, a);
      }
      const hero = b.snapshot ? (b.snapshot().hero) : null;
      for (const [, a] of bySkel) {
        // a body: under 2.6 m tall and within 25 m of the hero (the crowd stands farther back, behind the rim)
        const ys = a.pts.map((p) => p.y), xs = a.pts.map((p) => p.x), zs = a.pts.map((p) => p.z);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        if (Math.max(...ys) - Math.min(...ys) > 2.8) continue;
        if (hero && Math.hypot(cx - hero.x, cz - hero.z) > 14) continue;
        const r = rectOf(a.pts); if (r) out.bodies.push({ ...r, n: a.name });
      }
      // the rim: a mesh named like one
      const rims = scene.meshes.filter((m) => /rim|hoop|ring|backboard/i.test(m.name) && m.isEnabled() && m.isVisible);
      const rimPts = []; for (const m of rims) { if (/backboard/i.test(m.name)) continue; rimPts.push(...m.getBoundingInfo().boundingBox.vectorsWorld); }
      out.rim = rimPts.length ? rectOf(rimPts) : null;
      out.rimNames = rims.slice(0, 6).map((m) => m.name);
    }
  } catch (e) { out.sceneErr = String(e).slice(0, 160); }
  return out;
})()`;

interface Box { x: number; y: number; w: number; h: number }
const inter = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function score(m: { hudText: (Box & { deck: boolean; button: boolean; t: string })[]; deck: Box[]; bodies: Box[]; rim: Box | null }) {
  const text = m.hudText.filter((t) => !t.button);   // the deck's own button labels are not HUD text
  const targets = [...m.bodies, ...(m.rim ? [m.rim] : [])];
  const overBody = text.map((t) => ({ t: t.t, px: targets.reduce((s, b) => s + inter(t, b), 0) })).filter((o) => o.px > 0);
  const overDeck = text.filter((t) => !t.deck).map((t) => ({ t: t.t, px: m.deck.reduce((s, b) => s + inter(t, b), 0) })).filter((o) => o.px > 0);
  return { textOverBodyPx: overBody.reduce((s, o) => s + o.px, 0), overBody, textOverDeckPx: overDeck.reduce((s, o) => s + o.px, 0), overDeck, textBoxes: text.length };
}

async function one(browser: Browser, p: People, id: string, side: 'before' | 'after', run: number, vw: number, vh: number, out: string) {
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: storageState(p, 'admin'),
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 LookScreensRig',
  });
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT);
  await page.addInitScript(`try { localStorage.setItem('fel.feel.overrides.v1', ${JSON.stringify(JSON.stringify(side === 'after' ? KNOBS_ON : KNOBS_OFF))}); } catch {}`);
  const tag = `${side}-${vw}x${vh}-${id}-r${run}`;
  const res: Record<string, unknown> = { id, side, run, vw, vh };
  const t0 = Date.now();
  await page.goto(`${ORIGIN}${ROUTES[id]}?agent=1&perf=off`, { waitUntil: 'load', timeout: 90000 }).catch((e) => errors.push('goto ' + String(e).slice(0, 120)));
  const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 180000 }).then(() => true).catch(() => false);
  res.readyS = ready ? Math.round((Date.now() - t0) / 100) / 10 : null;
  res.headerAtReady = await page.evaluate(`(() => { const h = document.querySelector('header[data-game-chrome]'); return h ? Math.round(h.getBoundingClientRect().height) : null; })()`).catch(() => null);
  if (ready) {
    const sb = await page.locator('[data-splash-phase="ready"] button').filter({ hasText: /tap to start|^start$/i }).first().boundingBox().catch(() => null);
    if (sb) await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2).catch(() => {});
    else { const b = await page.locator('[data-splash-phase="ready"]').boundingBox().catch(() => null); if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2).catch(() => {}); }
    res.started = await page.waitForFunction(`!document.querySelector('[data-splash-phase]')`, undefined, { timeout: 60000 }).then(() => true).catch(() => false);
  }
  const moments: Record<string, unknown>[] = [];
  if (res.started) {
    await sleep(3000);
    const m1 = await page.evaluate(MEASURE).catch((e) => ({ err: String(e).slice(0, 160) })) as Record<string, unknown>;
    await page.screenshot({ path: join(out, `${tag}-c-play.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
    moments.push({ at: 'c-play', ...m1, ...(m1.hudText ? score(m1 as never) : {}) });
    const end = Date.now() + 6000;
    while (Date.now() < end) {
      await page.touchscreen.tap(Math.round(vw * 0.2), Math.round(vh * 0.85)).catch(() => {}); await sleep(500);
      await page.touchscreen.tap(Math.round(vw * 0.78), Math.round(vh * 0.76)).catch(() => {}); await sleep(500);
    }
    const m2 = await page.evaluate(MEASURE).catch((e) => ({ err: String(e).slice(0, 160) })) as Record<string, unknown>;
    await page.screenshot({ path: join(out, `${tag}-d-play.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
    moments.push({ at: 'd-play', ...m2, ...(m2.hudText ? score(m2 as never) : {}) });
  }
  // the menu, opened, on the after side's first run (the folded pieces are in it)
  if (res.started && run === 1) {
    const dots = page.locator('[data-testid="capture-overflow"]').first();
    const db = await dots.boundingBox().catch(() => null);
    if (db) { await page.touchscreen.tap(db.x + db.width / 2, db.y + db.height / 2).catch(() => {}); await sleep(600);
      await page.screenshot({ path: join(out, `${tag}-m-menu.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
      res.menuText = await page.evaluate(`(() => { const m = document.querySelector('[data-capture-ui]'); return m ? m.innerText.replace(/\\s+/g, ' ').slice(0, 400) : null; })()`).catch(() => null);
      res.menuTaps = await page.evaluate(`[...document.querySelectorAll('[data-capture-ui] button, [data-capture-ui] select')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })`).catch(() => null);
    }
  }
  res.moments = moments; res.errors = errors; res.wallS = Math.round((Date.now() - t0) / 1000);
  await ctx.close();
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const side = (arg('side') ?? 'after') as 'before' | 'after';
  const only = arg('only')?.split(',') ?? ['onevone', 'threevthree', 'threepoint', 'dunk'];
  const runs = Number(arg('runs') ?? 3);
  const [vw, vh] = (arg('size') ?? '390x844').split('x').map(Number);
  mkdirSync(out, { recursive: true });
  dbUp();
  const stop = await serve(join(out, 'server.log'));
  try {
    const p = await makePeople();
    const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
    for (let run = 1; run <= runs; run++) for (const id of only) {
      let res: Record<string, unknown>;
      try { res = await one(browser, p, id, side, run, vw, vh, out); } catch (e) { res = { id, side, run, crash: String(e).slice(0, 300) }; }
      writeFileSync(join(out, `${side}-${vw}x${vh}-${id}-r${run}.json`), JSON.stringify(res, null, 1));
      const ms = (res.moments as Record<string, unknown>[] | undefined) ?? [];
      console.log(`${side} ${vw}x${vh} ${id} r${run} ready ${res.readyS ?? '-'} header ${res.headerAtReady ?? '-'} ` +
        ms.map((m) => `${m.at}: hdr ${(m.header as Box | null)?.h ?? '-'} scene ${m.scene} bodies ${(m.bodies as unknown[] | undefined)?.length ?? '-'} rim ${m.rim ? 'y' : 'n'} overBody ${m.textOverBodyPx ?? '-'} overDeck ${m.textOverDeckPx ?? '-'} text ${m.textBoxes ?? '-'}`).join(' | ') +
        ` err ${(res.errors as string[] | undefined)?.length ?? '?'}`);
    }
    await browser.close();
  } finally { stop(); }
}
