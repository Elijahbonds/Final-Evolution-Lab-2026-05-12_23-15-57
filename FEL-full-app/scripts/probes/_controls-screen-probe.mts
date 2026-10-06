// _controls-screen-probe — the CONTROLS screen, measured on the real /play routes (controls-screen, console-view lane,
// 2026-10-06). Owner: "take off that wall of text when the game starts, maybe have that show as a beginning screen for
// the controls" — nothing static during play; the controls before START and on pause.
//
// Per mode and size it shoots READY, in play and paused, and reads back:
//   READY  — the page does not scroll; START is wholly on the screen; the CONTROLS panel is on the screen, and how much
//            of its lines it had to scroll away (hiddenPx: 0 = everything shows);
//   play   — whether any of the mode's static controls lines is anywhere in the page's text (it must not be);
//   paused — the panel is up, on the screen, and its device.
// Same session cookie / profile mock as _console-view-probe.mts (the dev server runs with the same NEXTAUTH_SECRET).
//
//   NEXT_DIST_DIR=.next-console-view NEXTAUTH_SECRET=console-view-local-probe next dev -p 3170
//   PORT=3170 OUT=/tmp/x MODES=threevthree,dunk SIZES=portrait,phone844,tv720 SWIFT=1 npx tsx scripts/probes/_controls-screen-probe.mts
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { encode } from 'next-auth/jwt';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from './_chromium.mts';
import * as scNs from '../../lib/babylon/ui/staticControls.ts';
import * as slotNs from '../../lib/creator/cardSlot.ts';
// tsx hands a .ts module to an .mts file as CJS: the named exports sit on `default`
const { STATIC_CONTROLS } = ((scNs as unknown as { default?: typeof scNs }).default ?? scNs);
const { slotModeKey } = ((slotNs as unknown as { default?: typeof slotNs }).default ?? slotNs);

const PORT = process.env.PORT ?? '3170';
const OUT = process.env.OUT ?? '/tmp/controls-screen';
const SECRET = process.env.NEXTAUTH_SECRET ?? 'console-view-local-probe';
const WAIT_PLAY_S = Number(process.env.WAIT_PLAY_S ?? 8);
fs.mkdirSync(OUT, { recursive: true });

const ROUTES: Record<string, { route: string; id: string }> = {
  threevthree: { route: '/play/threevthree', id: 'threevthree' }, dunk: { route: '/play/dunk', id: 'dunk' },
  karatevs: { route: '/play/karate-vs', id: 'karate_vs' }, kart: { route: '/play/velocity-kart', id: 'velocitykart' },
  onevone: { route: '/play/onevone', id: 'onevone' }, skate: { route: '/play/skateboard', id: 'skateboard' },
  golf: { route: '/play/golf', id: 'golf' }, mixed: { route: '/play/mixedcombat', id: 'mixedcombat' },
  // the sweep (controls-screen-2, 2026-10-06): every other game route
  aero: { route: '/play/aero-aces', id: 'aeroaces' }, bigair: { route: '/play/big-air', id: 'bigair' },
  dance: { route: '/play/dance', id: 'dance' }, duel: { route: '/play/duel', id: 'duel' },
  dunkduel: { route: '/play/dunkduel', id: 'dunkduel' }, football: { route: '/play/football', id: 'football' },
  freerun: { route: '/play/freerun', id: 'freerun' }, karate: { route: '/play/karate', id: 'karate' },
  showdown: { route: '/play/showdown', id: 'showdown' }, snowboard: { route: '/play/snowboard', id: 'snowboard_slalom' },
  sprint: { route: '/play/sprint', id: 'sprint' }, surf: { route: '/play/surf', id: 'surf' },
  tennis: { route: '/play/tennis', id: 'tennis' }, threepoint: { route: '/play/threepoint', id: 'threepoint' },
  volleyball: { route: '/play/volleyball', id: 'volleyball' }, whosceneit: { route: '/play/who-scene-it', id: 'who_scene_it' },
  brainbrawl: { route: '/play/brain-brawl', id: 'brainbrawl' }, tiebreak: { route: '/play/tiebreak', id: 'tiebreak' },
};
/** READY_ONLY=1: measure the READY card and stop (the sweep); otherwise READY, play and pause. */
const READY_ONLY = !!process.env.READY_ONLY;
type Size = { w: number; h: number; mobile: boolean };
const SIZES: Record<string, Size> = {
  portrait: { w: 390, h: 844, mobile: true }, phone844: { w: 844, h: 390, mobile: true },
  tv720: { w: 1280, h: 720, mobile: false }, tv1080: { w: 1920, h: 1080, mobile: false },
};
const modes = (process.env.MODES ?? 'threevthree,dunk,karatevs,kart').split(',');
const sizes = (process.env.SIZES ?? 'portrait,phone844,tv720').split(',');
const GL = process.env.SWIFT ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: chromiumExe(), args: GL });
const token = await encode({ token: { sub: 'controls-screen-probe', email: 'probe@local', name: 'Probe', profileId: null, role: 'player' }, secret: SECRET });

async function context(s: Size): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, isMobile: s.mobile, hasTouch: s.mobile });
  await ctx.addCookies([{ name: '__session', value: token, domain: 'localhost', path: '/' }]);
  await ctx.route('**/api/profile', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prq: 62, grade: { label: 'Contender', color: '#00E5FF' } }) }));
  await ctx.addInitScript({ content: `window.__name = window.__name || function (f) { return f; };
    addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(st); });` });
  return ctx;
}

const PANEL = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const on = (r) => r.width > 0 && r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1;
  const box = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const panels = [...document.querySelectorAll('[data-controls-panel]')].filter((e) => e.getBoundingClientRect().width > 0);
  const p = panels[0]; const lines = p && p.querySelector('[data-controls-lines]');
  // controls-screen-2: every row cell and line the panel holds that is NOT wholly visible — cut by the panel's own box,
  // by a scroll box inside it, or by the screen. 0 = a pad player sees everything without scrolling.
  const clip = (el) => { const r = el.getBoundingClientRect(); if (r.height === 0) return false;
    if (r.top < -1 || r.bottom > vh + 1) return true;
    for (let a = el.parentElement; a && a !== p.parentElement; a = a.parentElement) { const cs = getComputedStyle(a);
      if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') { const q = a.getBoundingClientRect(); if (r.top < q.top - 1 || r.bottom > q.bottom + 1) return true; } }
    return false; };
  const items = p ? [...p.querySelectorAll('[data-controls-rows] > span > span, [data-controls-lines] > span')] : [];
  const h1 = [...document.querySelectorAll('h1')].find((e) => e.getBoundingClientRect().width > 0);
  const pills = [...document.querySelectorAll('[data-testid="host-lobby-badge"], [data-testid="usb-connect-hint"]')].filter((e) => e.getBoundingClientRect().width > 0);
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const titleOverlap = h1 ? pills.filter((e) => hit(e.getBoundingClientRect(), h1.getBoundingClientRect())).length : null;
  const start = [...document.querySelectorAll('button')].find((x) => /TAP TO START/.test(x.textContent || '') && x.getBoundingClientRect().width > 0);
  return {
    pageScroll: Math.max(0, document.documentElement.scrollHeight - vh) + Math.max(0, document.documentElement.scrollWidth - vw),
    start: start ? { ...box(start.getBoundingClientRect()), onScreen: on(start.getBoundingClientRect()) } : null,
    panel: p ? { ...box(p.getBoundingClientRect()), onScreen: on(p.getBoundingClientRect()), device: p.getAttribute('data-controls-panel'),
      rows: p.querySelectorAll('[data-controls-rows] > span').length, lines: lines ? lines.children.length : 0,
      hiddenPx: lines ? Math.max(0, lines.scrollHeight - lines.clientHeight) : 0,
      items: items.length, clipped: items.filter(clip).length, overflowPx: Math.max(0, p.scrollHeight - p.clientHeight),
      fit: p.dataset.controlsFit ?? null,
      fontPx: lines && lines.firstElementChild ? +(parseFloat(getComputedStyle(lines.firstElementChild).fontSize) * (lines.firstElementChild.currentCSSZoom || 1)).toFixed(1) : null } : null,
    panels: panels.length, titleOverlap, pills: pills.length,
    boostCaption: [...document.querySelectorAll('[data-testid="boost-gauge"]')].map((e) => e.textContent).join(' | ') || null,
  };
})()`;

const within = <T,>(ms: number, pr: Promise<T>) => Promise.race([pr, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
const FREEZE = `(() => { const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return false; const e = s.getEngine();
  window.__csLoops = [...(e._activeRenderLoops || [])]; e.stopRenderLoop(); return true; })()`;
const THAW = `(() => { const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s || !window.__csLoops) return; const e = s.getEngine();
  for (const f of window.__csLoops) e.runRenderLoop(f); window.__csLoops = null; })()`;
async function shot(p: Page, file: string): Promise<void> {
  await p.evaluate(FREEZE).catch(() => {});
  await p.screenshot({ path: file, timeout: 240000 }).catch((e) => console.log('shot failed', file, String(e).slice(0, 80)));
  await p.evaluate(THAW).catch(() => {});
}

const out: Record<string, unknown>[] = [];
const log = (r: Record<string, unknown>) => { out.push(r); fs.appendFileSync(path.join(OUT, 'all.jsonl'), JSON.stringify(r) + '\n'); console.log(JSON.stringify(r)); };
const groups = [sizes.filter((k) => SIZES[k].mobile), sizes.filter((k) => !SIZES[k].mobile)].filter((g) => g.length);
for (const mode of modes) {
  const { route, id } = ROUTES[mode];
  const statics = STATIC_CONTROLS.filter((s) => s.mode === slotModeKey(id)).map((s) => s.text.slice(0, 28));
  for (const group of groups) {
    const ctx = await context(SIZES[group[0]]);
    const p = await ctx.newPage();
    try {
      await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      const btn = p.locator('button:has-text("TAP TO START") >> visible=true').first();
      let ready = false;
      for (let i = 0; i < Number(process.env.READY_TRIES ?? 400) && !ready; i++) {
        const retry = p.locator('button:has-text("RETRY") >> visible=true').first();
        if (i % 5 === 4 && await within(10000, retry.count())) await retry.click({ timeout: 5000 }).catch(() => {});
        ready = !!(await within(20000, btn.count())) && await btn.isVisible().catch(() => false);
        if (!ready) await p.waitForTimeout(1000);
      }
      for (const s of group) {
        await p.setViewportSize({ width: SIZES[s].w, height: SIZES[s].h }); await p.waitForTimeout(1500);
        await shot(p, path.join(OUT, `${mode}-${s}-ready.png`));
        const first = await p.evaluate(PANEL) as { panel?: { device?: string } };
        log({ mode, size: s, screen: 'ready', ready, ...first });
        // the pad's list too (a pad cannot scroll; its list carries the look and pause rows): the panel's own chooser
        const label: Record<string, string> = { pad: 'CONTROLLER', keys: 'KEYBOARD', touch: 'TOUCH' };
        const dev = first.panel?.device;
        if (dev && dev !== 'pad') {
          const pick = (d: string) => p.locator(`[data-controls-panel] button:has-text("${label[d]}") >> visible=true`).first();
          if (await within(5000, pick('pad').count())) {
            await pick('pad').click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(600);
            if (process.env.PAD_SHOTS) await shot(p, path.join(OUT, `${mode}-${s}-ready-pad.png`));
            log({ mode, size: s, screen: 'ready-pad', ...(await p.evaluate(PANEL) as object) });
            await pick(dev).click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
          }
        }
      }
      if (READY_ONLY) { await ctx.close(); continue; }
      await p.setViewportSize({ width: SIZES[group[0]].w, height: SIZES[group[0]].h });
      for (let i = 0; i < 12 && await btn.isVisible().catch(() => false); i++) { await btn.click({ timeout: 3000, force: true }).catch(() => {}); await p.waitForTimeout(2500); }
      await p.waitForTimeout(WAIT_PLAY_S * 1000);
      for (const s of group) {
        await p.setViewportSize({ width: SIZES[s].w, height: SIZES[s].h }); await p.waitForTimeout(2500);
        await shot(p, path.join(OUT, `${mode}-${s}-play.png`));
        const text = await p.evaluate('document.body.innerText') as string;
        const hints = await p.evaluate(`[...document.querySelectorAll('span.fel-panel.font-mono')].map((e) => e.textContent).filter(Boolean).slice(0, 6)`);
        const gauge = await p.evaluate(`[...document.querySelectorAll('[data-testid="boost-gauge"]')].map((e) => e.textContent).join(' | ') || null`);
        log({ mode, size: s, screen: 'play', boostGauge: gauge, staticOnScreen: statics.filter((t) => text.includes(t)), monoPanels: hints, panels: (await p.evaluate(PANEL) as { panels: number }).panels });
      }
      await p.keyboard.press('Escape'); await p.waitForTimeout(2500);
      for (const s of group) {
        await p.setViewportSize({ width: SIZES[s].w, height: SIZES[s].h }); await p.waitForTimeout(1500);
        await shot(p, path.join(OUT, `${mode}-${s}-paused.png`));
        const paused = await p.evaluate(`/PAUSED — TAP TO RESUME/.test(document.body.innerText)`);
        log({ mode, size: s, screen: 'paused', paused, ...(await p.evaluate(PANEL) as object) });
      }
    } catch (e) { log({ mode, group, error: String(e).slice(0, 200) }); }
    await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(out, null, 1));
await browser.close();
