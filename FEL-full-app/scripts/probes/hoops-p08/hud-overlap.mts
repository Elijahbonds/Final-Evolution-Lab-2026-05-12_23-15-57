// hoops-p08 (2026-11-12): HOW MANY HUD TEXT LAYERS ARE DRAWN OVER EACH OTHER, per hoops mode, on a phone and on a desktop.
//
//   node scripts/probes/hoops-gap/serve.mjs <site> 3352 &        (the site from scripts/probes/hoops-audit/show/build.mts)
//   BASE=http://127.0.0.1:3352 MODES=onevone,threevthree VIEWS=phone,land,desktop OUT=<dir> \
//     /home/user/wt/gate-run.sh 3000 npx tsx scripts/probes/hoops-p08/hud-overlap.mts
//   (scripts/probes/hoops-p08/run.sh wraps the server and the gate.)
//
// It drives the REAL hoops screens (GameShell + the mode's Babylon host, scripts/probes/hoops-audit/show/host-entry.tsx) and reads
// the DOM, not pixels. What it counts:
//   * a HUD BOX is (a) one line of visible text inside the mode's own stage (the canvas's parent: the shell's corner buttons are not
//     in it — they are the game-hud lane's), measured tight with a Range, or (b) a HUD meter bar ([data-hud-meter-bar]). Opacity is
//     multiplied up the tree; a box under 5 % is not drawn. The READY / pause splash is not up while it measures.
//   * an OVERLAP is two boxes from different elements, neither inside the other, whose rectangles share at least 12 px² (2 px each
//     way). Each pair is named by the first words of both, so the same collision seen in many samples counts once. Counted twice:
//     anywhere in the stage (`pairs`), and ON SCREEN (`pairsOnScreen`: the shared rectangle clipped to the viewport — an upright
//     phone's stage runs under the bottom of the screen, and a collision there is not seen).
// Two readings per mode and view:
//   * PLAY — the scripted player (the show rig's) plays SECONDS game seconds; the DOM is read every half game second. The pairs any
//     sample saw, and the worst sample.
//   * STACK — the worst case on purpose: every bottom layer the mode can put up at one time is pushed through the harness's HUD
//     (the probe seam `__FEL_DEV__.hud`, development / agent hooks only): the MC's line, the longest offence hint, the pass chip, the
//     shot meter, a banner. Read twice: the voice ON (the line is marked voiced, as ModeMic marks a line whose audio started) and the
//     voice OFF (the captions must show and still not sit on anything). A JPG of the stacked screen is written for the contact sheet.
// Virtual clock (1/60 s of game per drawn frame), Math.random seeded: a slow box plays the same seconds.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3352';
const MODES = (process.env.MODES ?? 'onevone,threevthree,threepoint,dunk,dunkduel').split(',').filter(Boolean);
const VIEWS = (process.env.VIEWS ?? 'phone,desktop').split(',').filter(Boolean);
const SECONDS = Number(process.env.SECONDS ?? 8);
const OUT = process.env.OUT ?? '/tmp/hud-overlap';
const RASTER = Number(process.env.RASTER ?? 6);
const SEED = Number(process.env.SEED ?? 7);
const TAG = process.env.TAG ?? 'run';
fs.mkdirSync(OUT, { recursive: true });

const VIEW: Record<string, { viewport: { width: number; height: number }; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean }> = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  land: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

/** The worst case each mode can show at once: its bottom layers, its longest lines. */
const LONG_MC = 'VENICE, SAY HELLO! THE RUN IS ON AND THE WHOLE BOARDWALK CAME OUT FOR IT';
const STACK: Record<string, Record<string, unknown>> = {
  onevone: { mic: LONG_MC, micWho: 'MC', hint: 'TAP THE STICK TO JAB · SQUARE (L) SHOOT · L2 (F) POST UP', shotMeterT: 0.55, shotMeterGreen: '0.700,0.080', banner: 'MID-RANGE +2', shotPips: 'GGEPL' },
  threevthree: { mic: LONG_MC, micWho: 'MC', hint: 'TAP THE STICK TO JAB · BOTTOM BUTTON (J) PASS · CIRCLE (K) SCREEN', passPreview: 'CHEST PASS', shotMeterT: 0.55, shotMeterGreen: '0.700,0.080', banner: 'MID-RANGE +2' },
  threepoint: { mic: LONG_MC, micWho: 'MC', banner: 'PERFECT — SPLASH', meter: 0.6, meterGreen: 0.72, meterHalf: 0.06, relPips: 'EPGLGPG', cut: 14, rackIdx: 1, ballIdx: 2, round: 'QUALIFYING', left: 18, streak: 3 },
  dunk: { mic: LONG_MC, micWho: 'MC', hint: 'X — NEXT PROP FAMILY · D-PAD picks inside: RIGHT oops, LEFT lobs, DOWN the rest, UP none', call: 'FROM THE STRIPE!', banner: '' },
  dunkduel: { mic: LONG_MC, micWho: 'MC', hint: 'HOLD RT to load the jump · A at the rim to SLAM', banner: 'P1 — 48' },
  carnival: { mic: LONG_MC, micWho: 'MC', hint: 'TAP A ON THE BEAT · HOLD RT TO CHARGE', banner: 'ROUND 1' },
};

const INIT = `(() => {
  const realNow = performance.now.bind(performance); window.__realNow = realNow;
  let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  let lastTs = -1; window.__vframes = 0;
  window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; window.__vframes++; } cb(vt); });
  const si = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { let last = performance.now(); const want = Math.max(1, Number(ms) || 0); return si(() => { const n = performance.now(); if (n - last >= want) { last = n; fn(...a); } }, Math.min(want, 50)); };
  let t = ${SEED} >>> 0;
  Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 600000 : ms, ...a);
  window.__name = window.__name || function (f) { return f; };
})()`;

/** The scripted player (the show rig's), and __HOLD to stand still. */
const PLAYER = (mode: string) => `(() => {
  const dev = window.__FEL_DEV__; const scene = dev.scene; const bus = dev.input; const t0 = performance.now();
  const down = {}; const btn = (b, on) => { if (!!down[b] === on) return; down[b] = on; bus.emit({ t: 'button', btn: b, pressed: on }); };
  let lastStick = ''; const stick = (x, y) => { const k = x.toFixed(2) + ',' + y.toFixed(2); if (k === lastStick) return; lastStick = k; bus.emit({ t: 'stick', side: 'L', x, y }); };
  let lastTrig = -1; const trig = (v) => { if (v === lastTrig) return; lastTrig = v; bus.emit({ t: 'trigger', side: 'R', value: v }); };
  const MODE = ${JSON.stringify(mode)};
  window.__G = () => (performance.now() - t0) / 1000;
  scene.onBeforeRenderObservable.add(() => {
    const g = window.__G();
    if (window.__HOLD) { stick(0, 0); trig(0); for (const b of ['A', 'X', 'Y']) btn(b, false); return; }
    if (MODE === 'onevone' || MODE === 'threevthree') {
      stick(Math.sin(g * 0.9) * 0.55, -0.85); const c = g % 4.2; btn('X', c > 2.9 && c < 3.38);
      btn('A', MODE === 'threevthree' && (g % 5.5) > 1.0 && (g % 5.5) < 1.08);
    } else if (MODE === 'threepoint') { stick(0, 0); const c = g % 2.4; btn('X', c > 1.2 && c < 1.66); }
    else if (MODE === 'dunk' || MODE === 'dunkduel') { const c = g % 16; if (c < 5.5) { trig(1); stick(0, -1); btn('A', false); } else if (c < 9) { trig(0); stick(0, 0); btn('A', ((c - 5.5) % 0.25) < 0.08); } else { trig(0); stick(0, 0); btn('A', false); } }
    else { const c = g % 1.4; btn('A', c < 0.08); stick(Math.sin(g) * 0.5, -0.6); }
  });
  return 'ok';
})()`;

/** Read the HUD boxes in the mode's stage and the overlapping pairs. */
const READ = `(() => {
  const canvas = document.querySelector('canvas'); const stage = canvas && canvas.parentElement; if (!stage) return { boxes: 0, pairs: [] };
  const alpha = (el) => { let a = 1; for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return 0; a *= Number(s.opacity); } return a; };
  const boxes = [];
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = (n.textContent || '').trim(); if (!txt) continue;
    const el = n.parentElement; if (!el || alpha(el) < 0.05) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const q of r.getClientRects()) if (q.width >= 2 && q.height >= 2) boxes.push({ el, x: q.left, y: q.top, w: q.width, h: q.height, label: txt.slice(0, 28) });
  }
  for (const el of stage.querySelectorAll('[data-hud-meter-bar]')) { if (alpha(el) < 0.05) continue; const q = el.getBoundingClientRect(); if (q.width >= 2 && q.height >= 2) boxes.push({ el, x: q.left, y: q.top, w: q.width, h: q.height, label: '[meter bar]' }); }
  const pairs = [], seen = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w >= 2 && h >= 2 && w * h >= 12) {
      const tag = [a.label, b.label].sort().join('  ×  ') + '  (' + Math.round(w * h) + ' px²)';
      pairs.push(tag);
      // ON SCREEN: the overlap, clipped to the viewport (an upright phone's stage runs under the bottom of the screen)
      const x0 = Math.max(a.x, b.x, 0), x1 = Math.min(a.x + a.w, b.x + b.w, innerWidth), y0 = Math.max(a.y, b.y, 0), y1 = Math.min(a.y + a.h, b.y + b.h, innerHeight);
      if (x1 - x0 >= 2 && y1 - y0 >= 2 && (x1 - x0) * (y1 - y0) >= 12) seen.push(tag);
    }
  }
  return { boxes: boxes.length, pairs, seen };
})()`;

const key = (p: string) => p.replace(/\s+\(\d+ px²\)$/, '');

async function runOne(b: import('playwright-core').Browser, mode: string, view: string) {
  const ctx = await b.newContext({ ...VIEW[view] });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  const errs: string[] = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const ev = <T,>(fn: string | (() => T), cap = 180000): Promise<T> => Promise.race([p.evaluate(fn as never) as Promise<T>, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('evaluate timed out')), cap))]);
  const frames = () => ev<number>(() => (window as unknown as { __vframes: number }).__vframes);
  const waitFrames = async (n: number, capMs = 120000) => { const f0 = await frames(); const t = Date.now(); while ((await frames()) < f0 + n && Date.now() - t < capMs) await p.waitForTimeout(120); };
  const setScale = (s: number) => ev(`(() => { const d = window.__FEL_DEV__; if (d) d.scene.getEngine().setHardwareScalingLevel(${s}); return 1; })()`);
  const press = (btn: string) => ev(`(() => { const b = window.__FEL_DEV__.input; b.emit({ t: 'button', btn: '${btn}', pressed: true }); b.emit({ t: 'button', btn: '${btn}', pressed: false }); })()`);
  const out: Record<string, unknown> = { mode, view, tag: TAG };
  const t0 = Date.now();
  try {
    await p.goto(`${BASE}/host/index.html?mode=${mode}&agent=1&perf=off`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await p.waitForFunction(() => /TAP TO START|PRESS START|START/i.test(document.body.innerText) && !!(window as unknown as { __FEL_DEV__?: unknown }).__FEL_DEV__, null, { timeout: 900000, polling: 1000 });
    const base = await ev<number>(`window.__FEL_DEV__.scene.getEngine().getHardwareScalingLevel()`);
    await setScale(base * RASTER);
    await ev(`window.__HOLD = 1`);
    await ev(PLAYER(mode));
    const clicked = await p.locator('text=/TAP TO START/i').first().click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!clicked) await press('START');
    await waitFrames(30);
    if (await ev<boolean>(`/PAUSED — TAP TO RESUME/.test(document.body.innerText)`)) await press('START');
    await ev(`window.__HOLD = 0`);
    // PLAY
    const seen = new Map<string, number>(), onScreen = new Map<string, number>(); let worst = 0, samples = 0, samplesWith = 0;
    for (let next = 0.5; ;) {
      const g = await ev<number>(`window.__G()`);
      if (g >= next) {
        if (await ev<boolean>(`/PAUSED — TAP TO RESUME/.test(document.body.innerText)`)) { await press('START'); continue; }
        const r = await ev<{ boxes: number; pairs: string[]; seen: string[] }>(READ);
        samples++; if (r.pairs.length) samplesWith++; worst = Math.max(worst, r.pairs.length);
        for (const pr of r.pairs) seen.set(key(pr), (seen.get(key(pr)) ?? 0) + 1);
        for (const pr of r.seen) onScreen.set(key(pr), (onScreen.get(key(pr)) ?? 0) + 1);
        next = g + 0.5;
      }
      if (g >= SECONDS || Date.now() - t0 > 1500000) break;
      await p.waitForTimeout(300);
    }
    out.play = { samples, samplesWith, worst, distinct: seen.size, pairs: Object.fromEntries(seen), distinctOnScreen: onScreen.size, pairsOnScreen: Object.fromEntries(onScreen) };
    // STACK
    await ev(`window.__HOLD = 1`); await waitFrames(10);
    const stack = STACK[mode] ?? {};
    for (const voiced of [true, false]) {
      await ev(`window.__FEL_DEV__.hud(${JSON.stringify({ ...stack, micVoiced: voiced })})`);
      await waitFrames(4);
      const r = await ev<{ boxes: number; pairs: string[]; seen: string[] }>(READ);
      out[voiced ? 'stackVoiceOn' : 'stackVoiceOff'] = { boxes: r.boxes, overlaps: r.pairs.length, pairs: r.pairs, onScreen: r.seen.length, pairsOnScreen: r.seen };
      if (!voiced) {
        await setScale(base); await waitFrames(2);
        await p.screenshot({ path: path.join(OUT, `${TAG}-${mode}-${view}-stack.jpg`), type: 'jpeg', quality: 80, timeout: 300000 });
        await setScale(base * RASTER);
      }
    }
    // the natural screen too (the stack cleared): what a player sees mid-play
    await ev(`window.__FEL_DEV__.hud(${JSON.stringify(Object.fromEntries(Object.keys(stack).map((k) => [k, typeof stack[k] === 'number' ? 0 : ''])))})`);
    await ev(`window.__HOLD = 0`); await waitFrames(30);
    await setScale(base); await waitFrames(2);
    await p.screenshot({ path: path.join(OUT, `${TAG}-${mode}-${view}-play.jpg`), type: 'jpeg', quality: 80, timeout: 300000 });
  } catch (e) {
    out.error = String((e as Error).message).slice(0, 300);
  } finally {
    out.errors = errs.slice(0, 10); out.wallS = (Date.now() - t0) / 1000;
    fs.appendFileSync(path.join(OUT, `overlap-${TAG}.jsonl`), JSON.stringify(out) + '\n');
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 30000))]);
  }
  const pl = out.play as { distinct: number; worst: number } | undefined, on = out.stackVoiceOn as { overlaps: number } | undefined, off = out.stackVoiceOff as { overlaps: number } | undefined;
  console.log(`[overlap] ${TAG} ${mode}/${view}: play ${pl?.distinct ?? '-'} distinct pairs (worst sample ${pl?.worst ?? '-'}) · stack voice-on ${on?.overlaps ?? '-'} · voice-off ${off?.overlaps ?? '-'}${out.error ? ' ERROR ' + out.error : ''} (${Math.round((Date.now() - t0) / 1000)} s)`);
}

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
for (const m of MODES) for (const v of VIEWS) await runOne(b, m, v);
await b.close();
