// _p10-lib — shared plumbing for the MUSIC-SUITE P10 (2026-09-29) "gauntlet and ship" probes: the scorecard-and-perf
// lane's live measurements on the music lane's dev server (:3121, NEXT_DIST_DIR=.next-music, database pinned offline).
//
// Nothing here edits app code. Everything is watched from the page:
//   · INIT (installed before any app script): a fake standard pad, a registry of every AudioContext / OfflineAudioContext
//     and every WebGL context the page creates (WeakRefs, so a probe can ask "is it still alive, is it closed / lost"
//     after the room is left — memory: loseContextOnDispose, FloatingOriginCurrentScene), and a rAF frame-time log.
//     The AudioContext registry is a subclass, so `instanceof` and statics hold; it also fills window.__ACS, the name
//     _dom-room.mts's AUDIO_CLOCK_INIT uses, so the scorecard drivers can read the room's audio clock through it.
//   · MOD(re): a module from the dev server's webpack cache (the P6/P9 probes' hook) — how a probe reaches the SAME
//     SoundKit singleton / AudioEngine prototype / EngineStore the page is running, without a dev hook in app code.
//   · heap(): CDP HeapProfiler.collectGarbage ×3, then Runtime.getHeapUsage (used / total, MB).
//   · frameStats(): p50 / p95 / max frame time (ms) of the rAF log since a mark — the "60 fps" measure (16.7 ms p50,
//     p95 ≤ 20 ms is the bar the P10 brief sets).
// DISK (docs/LANES.md floor 12 GB): `diskFreeGb()` is read before every browser launch and a probe refuses to start below
// the floor — it never cleans anything but its own output.
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

export const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
export const OUT_ROOT = process.env.OUT_ROOT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p10/scorecard-perf';
export const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

export function diskFreeGb(): number {
  const out = execFileSync('/bin/df', ['-k', '/'], { encoding: 'utf8' }).trim().split('\n').pop() ?? '';
  const cols = out.split(/\s+/);
  return Math.round((Number(cols[3]) / 1048576) * 10) / 10;
}
export function assertDisk(label: string): number {
  const gb = diskFreeGb();
  if (gb < 12) throw new Error(`[${label}] only ${gb} GB free on / (floor 12 GB, docs/LANES.md) — not launching a browser`);
  return gb;
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
}

/** Desktop 1280×800 and the phone profile the P10 brief asks for: a 390×844 portrait touch phone at DPR 3, with the CPU
 *  throttled 4× over CDP (applied per page by `throttle()` — Emulation.setCPUThrottlingRate is a page setting). */
export const DESKTOP = { viewport: { width: 1280, height: 800 } };
export const DESKTOP_169 = { viewport: { width: 1280, height: 720 } };
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
export const PHONE_CPU_RATE = 4;

export const INIT = `(() => {
  if (window.__P10) return;
  window.__name = window.__name || function (f) { return f; };
  const R = window.__P10 = { acs: [], offline: 0, gls: [], ft: [], mark: 0 };
  // ── the fake standard pad ──
  const mk = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { index: 0, id: 'p10 fake pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: performance.now(), buttons: Array.from({ length: 17 }, mk) };
  window.__PAD = pad;
  try { Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] }); } catch (e) { navigator.getGamepads = () => [pad, null, null, null]; }
  window.__padBtn = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0, value: v }; pad.timestamp = performance.now(); };
  window.__padSet = (i, down) => window.__padBtn(i, down ? 1 : 0);
  // ── every AudioContext (and how many offline renders) ──
  window.__ACS = [];
  const O = window.AudioContext;
  if (O && !O.__p10) {
    const W = class extends O { constructor(...a) { super(...a); window.__ACS.push(this); R.acs.push({ ref: new WeakRef(this), at: Math.round(performance.now()), path: location.pathname, who: (new Error().stack || '').split('\\n').slice(2, 5).map((s) => s.trim().replace(/\\?[^)]*/g, '').slice(-90)).join(' < ') }); } };
    W.__p10 = true; window.AudioContext = W; try { window.webkitAudioContext = W; } catch (e) {}
  }
  const OO = window.OfflineAudioContext;
  if (OO && !OO.__p10) { const WO = class extends OO { constructor(...a) { super(...a); R.offline++; } }; WO.__p10 = true; window.OfflineAudioContext = WO; }
  // ── every WebGL context, its canvas, and its lost event ──
  const og = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const ctx = og.call(this, kind, ...rest);
    if (ctx && /webgl/.test(String(kind)) && !R.gls.some((c) => c.ref.deref() === ctx)) {
      const id = R.gls.length; const cv = this;
      R.gls.push({ id, kind: String(kind), ref: new WeakRef(ctx), canvas: new WeakRef(cv), at: Math.round(performance.now()), path: location.pathname, lostAt: null });
      cv.addEventListener('webglcontextlost', () => { const g = R.gls[id]; if (g) g.lostAt = Math.round(performance.now()); });
    }
    return ctx;
  };
  // ── the frame clock ──
  let last = 0;
  const f = (t) => { if (last) { R.ft.push(t - last); if (R.ft.length > 40000) { R.ft.splice(0, 10000); R.mark = Math.max(0, R.mark - 10000); } } last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  // ── a module from the dev server's webpack cache ──
  window.__MOD = (re) => {
    if (!window.__wreq) { try { self.webpackChunk_N_E.push([['p10probe' + Math.random()], {}, (r) => { window.__wreq = r; }]); } catch (e) { return null; } }
    const r = window.__wreq; if (!r || !r.c) return null;
    const rx = new RegExp(re);
    const k = Object.keys(r.c).find((x) => rx.test(x));
    return k ? r.c[k].exports : null;
  };
})()`;

/** What is alive right now: AudioContexts by state, WebGL contexts (alive / lost / canvas connected), offline renders. */
export const CONTEXTS = `(() => {
  const R = window.__P10;
  const acs = R.acs.map((a, i) => { const c = a.ref.deref(); return { i, at: a.at, path: a.path, who: a.who, state: c ? c.state : 'collected' }; });
  const gls = R.gls.map((g) => { const c = g.ref.deref(); const cv = g.canvas.deref(); return { id: g.id, kind: g.kind, at: g.at, path: g.path, alive: !!c, lost: c ? c.isContextLost() : null, connected: cv ? cv.isConnected : false, lostAt: g.lostAt }; });
  return { acs, liveAudio: acs.filter((a) => a.state !== 'closed' && a.state !== 'collected').length, gls, liveGl: gls.filter((g) => g.alive && g.lost === false).length, offline: R.offline, path: location.pathname };
})()`;

export async function newPage(ctx: BrowserContext, errors: string[], tag: string): Promise<Page> {
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${tag} pageerror ${String(e?.message ?? e).slice(0, 240)}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/status of 40[14]|favicon|Download the React DevTools|_next\/static\/chunks\/undefined/.test(t)) return;
    errors.push(`${tag} console.error ${t.slice(0, 240)}`);
  });
  return p;
}

export async function cdpOf(p: Page): Promise<CDPSession> { return p.context().newCDPSession(p); }
export async function throttle(cdp: CDPSession, rate: number): Promise<void> { await cdp.send('Emulation.setCPUThrottlingRate', { rate }); }

export async function heap(cdp: CDPSession): Promise<{ usedMB: number; totalMB: number }> {
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined); await new Promise((r) => setTimeout(r, 250)); }
  const h = await cdp.send('Runtime.getHeapUsage') as { usedSize: number; totalSize: number };
  return { usedMB: Math.round(h.usedSize / 1048576 * 10) / 10, totalMB: Math.round(h.totalSize / 1048576 * 10) / 10 };
}

export const markFrames = (p: Page) => p.evaluate(() => { const R = (window as Any).__P10; R.mark = R.ft.length; });
/** Frame times since the last mark: n, p50 / p95 / p99 / max (ms), and the share of frames over 20 ms and over 33 ms. */
export const frameStats = (p: Page) => p.evaluate(() => {
  const R = (window as Any).__P10; const a = R.ft.slice(R.mark).filter((x: number) => x > 0).sort((x: number, y: number) => x - y);
  const q = (f: number) => (a.length ? Math.round(a[Math.min(a.length - 1, Math.floor(a.length * f))] * 10) / 10 : null);
  return { n: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a.length ? Math.round(a[a.length - 1]) : null,
    over20: a.length ? Math.round(a.filter((x: number) => x > 20).length / a.length * 1000) / 10 : null,
    over33: a.length ? Math.round(a.filter((x: number) => x > 33.4).length / a.length * 1000) / 10 : null,
    fps: a.length ? Math.round(1000 / (a.reduce((s: number, x: number) => s + x, 0) / a.length)) : null };
});

/** The Academy's splash: TAP TO START (the shared BootSplash pill), then the room. */
export async function openAcademy(p: Page, path: string): Promise<number> {
  const t0 = Date.now();
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 300000 });
  const ms = Date.now() - t0;
  await start.click();
  await p.waitForTimeout(700);
  return ms;
}

/** The dance room on /dev/mode (its dev readout, not the real player HUD — every /play route is auth-gated here). */
export async function openDance(p: Page, query: string): Promise<number> {
  const t0 = Date.now();
  await p.goto(`${BASE}/dev/mode/dance${query}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 });
  return Date.now() - t0;
}
export const devPhase = (p: Page) => p.evaluate(() => (document.querySelector('pre')?.previousElementSibling?.textContent ?? '').replace(/^DEV · \S+ · /, ''));
export const hud = (p: Page): Promise<Any> => p.evaluate(() => { try { return JSON.parse(document.querySelector('pre')?.textContent ?? '{}'); } catch { return {}; } });
export async function padTap(p: Page, i: number, ms = 80): Promise<void> {
  await p.evaluate((b) => (window as Any).__padBtn(b, 1), i); await p.waitForTimeout(ms); await p.evaluate((b) => (window as Any).__padBtn(b, 0), i);
}

/** Leave the room the way a player does inside the app: a client-side navigation (Next's app router — window.next.router,
 *  set by next/dist/client/components/app-router.js), so the page, its registries and its heap live on and what the room
 *  left behind can be counted. `/dev/mode/p10-left` mounts the generic runner with no registry mode: no engine, no audio. */
export async function leaveRoom(p: Page): Promise<void> {
  await p.evaluate(() => (window as Any).next.router.push('/dev/mode/p10-left'));
  await p.waitForFunction(() => location.pathname === '/dev/mode/p10-left' && /no registry mode/.test(document.body.textContent ?? ''), undefined, { timeout: 60000 });
  await p.waitForTimeout(1500);
}

export const writeJson = (path: string, v: unknown) => { fs.mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(path, JSON.stringify(v, null, 2)); };
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── THE DANCE JUDGE, OBSERVED, AND THE INTENT DRIVER (copied from _music-p9-live-proof.mts HOOK / DRIVER, P9's live proof:
// 99.7 % GRADE S on CYPHER). The hook wraps DancePerformance.update / hit through the webpack cache (observe only:
// every wrapper runs the original) and publishes the ROOM's instance as window.__DPERF; the driver presses on the judge's
// heard clock (__FEL_DEV__.danceClock), freeze holds kept, freestyle slots varied (J K L I = A B X Y).
export const DANCE_HOOK = `(() => {
  if (!window.__wreq) { try { self.webpackChunk_N_E.push([['p10dance' + Date.now()], {}, (r) => { window.__wreq = r; }]); } catch (e) { return { ok: false, why: String(e) }; } }
  const r = window.__wreq; if (!r || !r.c) return { ok: false, why: 'no webpack module cache' };
  const mod = Object.values(r.c).find((m) => { try { return m && m.exports && m.exports.DancePerformance; } catch (e) { return false; } });
  if (!mod) return { ok: false, why: 'DanceCore not in the module cache yet' };
  const P = mod.exports.DancePerformance.prototype;
  if (!P.__p10Wrapped) {
    P.__p10Wrapped = true; window.__HITS = 0; window.__JUDGED = [];
    const oh = P.hit; P.hit = function (now, press) { if (this.__p10Room) window.__HITS++; return oh.call(this, now, press); };
    const ou = P.update;
    P.update = function (now) {
      if (!this.__p10Seen) {
        this.__p10Seen = true; this.__p10Room = !!this.onJudged;
        if (this.__p10Room) { const oj = this.onJudged; this.onJudged = (l, p, c, s, d) => { window.__JUDGED.push({ l, c, t: performance.now() }); if (window.__JUDGED.length > 4000) window.__JUDGED.splice(0, 1000); return oj && oj(l, p, c, s, d); }; }
      }
      if (this.__p10Room) window.__DPERF = this;
      return ou.call(this, now);
    };
  }
  return { ok: true, clock: !!(window.__FEL_DEV__ && window.__FEL_DEV__.danceClock) };
})()`;

export const DANCE_DRIVER = `window.__drive = (o) => {
  const w = window, d = w.__DPERF, dc = w.__FEL_DEV__.danceClock;
  const bd = 60 / d.bpm, steps = d.steps;
  let seed = (o.seed >>> 0) || 7;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const FREE = ['j', 'k', 'l', 'i'];
  const plan = []; let freeN = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]; const t = d.started + s.beat * bd;
    const kind = s.pressFree ? 'free' : (s.pressHoldBeats > 0 ? 'hold' : (s.pressKind || 'move'));
    const at = t + (o.offsetMs || 0) / 1000 + (rnd() * 2 - 1) * (o.jitterMs || 0) / 1000;
    let key = 'j'; if (kind === 'free') { key = FREE[freeN % 4]; freeN++; }
    const p = { i, t, at, key, kind, beat: s.beat };
    if (kind === 'hold') { p.holdBeats = s.pressHoldBeats; p.upAt = t + s.pressHoldBeats * bd + 0.02; }
    plan.push(p);
  }
  for (let k = 0; k < plan.length; k++) { const p = plan[k]; if (p.kind === 'hold') continue; const nx = plan[k + 1]; p.upAt = p.at + Math.min(0.06, nx ? Math.max(0.01, (nx.at - p.at) * 0.5) : 0.06); }
  const ev = []; for (const p of plan) { ev.push({ at: p.at, type: 'keydown', p }); ev.push({ at: p.upAt, type: 'keyup', p }); }
  ev.sort((a, b) => a.at - b.at || (a.type === 'keyup' ? -1 : 1));
  let k = 0; w.__DRV = { steps: steps.length, planned: plan.length, done: false };
  const iv = setInterval(() => {
    if (w.__DRV.stop) { clearInterval(iv); return; }
    const st = dc.state(); if (st.paused) return;
    const h = dc.heard();
    while (k < ev.length && h >= ev[k].at) { const e = ev[k++]; w.dispatchEvent(new KeyboardEvent(e.type, { key: e.p.key, bubbles: true })); }
    if (k >= ev.length) { clearInterval(iv); w.__DRV.done = true; }
  }, 1);
  return { steps: steps.length, planned: plan.length, bpm: d.bpm, lengthSec: Math.round(((steps[steps.length - 1].beat + (steps[steps.length - 1].pressHoldBeats || 0)) * bd) * 10) / 10 };
};`;

/** Open the dance room on `query` (?track=… goes straight to the count-in), wake the harness with A, hook the judge,
 *  wait for the song to run, and start the intent driver. Returns the plan (steps, bpm, length). */
export async function danceStart(p: Page, query: string, drive: Any | null = { seed: 11, jitterMs: 6 }): Promise<Any> {
  const loadMs = await openDance(p, query);
  return { loadMs, ...(await danceBegin(p, drive)) };
}
/** danceStart without the navigation: the page is already on the dance route and ready (a client-side entry). */
export async function danceBegin(p: Page, drive: Any | null = { seed: 11, jitterMs: 6 }): Promise<Any> {
  let h: Any = null;
  for (let i = 0; i < 150; i++) { h = await p.evaluate(DANCE_HOOK); if (h.ok && h.clock) break; await p.waitForTimeout(200); }
  await p.evaluate(DANCE_DRIVER);
  await padTap(p, 0);   // A wakes the harness
  for (let i = 0; i < 300; i++) { if (await p.evaluate(() => !!(window as Any).__DPERF?.running)) break; await p.waitForTimeout(100); }
  const plan = drive ? await p.evaluate((x) => (window as Any).__drive(x), drive) : null;
  return { hook: h, plan };
}
