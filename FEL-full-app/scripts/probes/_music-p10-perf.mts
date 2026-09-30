// MUSIC-SUITE P10 (2026-09-29) — 60 FPS and OOM hygiene, measured live on the lane's :3121 (next dev, .next-music).
//
// FRAME TIME (rAF deltas, _p10-lib INIT): p50 / p95 / p99 / max and the share of frames over 20 ms, for
//   the Academy — STUDIO (a 14-cell beat playing), FLIP (the FEL theme loaded, the groovebox running, a pad struck every
//   0.5 s), PERFORM (the four lanes, a key on every offered note) — and the Cypher on both venues (STUDIO = the home look,
//   NEON CLUB), a whole WARM UP bar-run by the P9 intent driver;
// on two profiles: desktop 1280×800, and the phone profile the brief names — 390×844 portrait, DPR 3, touch, CPU throttled
// 4× over CDP (applied after the load, for the measured window only: a dev bundle parsed at 4× would measure the dev
// server, not the room).
// OOM / DISPOSE (desktop): each room is LEFT the way a player leaves it inside the app — a client-side navigation
// (window.next.router) to a route that mounts nothing (/dev/mode/p10-left) — then GC ×3 (CDP) and a count of what the room
// left alive: AudioContexts not closed (SoundKit's one shared context is the app's by design and is named apart), WebGL
// contexts neither lost nor collected, the room's AudioEngine / Babylon scene / engine through WeakRefs taken while it ran
// (memory: loseContextOnDispose; FloatingOriginCurrentScene held the last rendered scene), RTCPeerConnections still open,
// and the JS heap against the same blank route before the room was entered.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-perf.mts  (ONLY=studio,flip,perform,dance-home,dance-neon  PROFILES=desktop,phone)
import fs from 'node:fs';
import type { Page } from 'playwright-core';
import {
  BASE, assertDisk, launch, newPage, cdpOf, throttle, heap, markFrames, frameStats, danceBegin, leaveRoom, writeJson, sleep,
  CONTEXTS, OUT_ROOT, DESKTOP, PHONE, PHONE_CPU_RATE, type Any,
} from './_p10-lib.mts';

const OUT = `${OUT_ROOT}/perf`;
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY ?? 'studio,flip,perform,dance-home,dance-neon').split(',');
const PROFILES = (process.env.PROFILES ?? 'desktop,phone').split(',');
const MEASURE_MS = Number(process.env.MEASURE_MS ?? 15000);
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p10-perf +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const R: Any = { at: new Date().toISOString(), measureMs: MEASURE_MS, phoneCpuRate: PHONE_CPU_RATE, rooms: {}, errors: [] as string[] };
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch (e) {}`;
const CAL = `try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}`;
/** RTCPeerConnections (the phone room) and the room's AudioEngine, by WeakRef. */
const EXTRA_INIT = `(() => {
  window.__RTC = [];
  const O = window.RTCPeerConnection;
  if (O && !O.__p10) { const W = class extends O { constructor(...a) { super(...a); window.__RTC.push(new WeakRef(this)); } }; W.__p10 = true; window.RTCPeerConnection = W; }
})()`;
const HOOK_ENGINE = `(() => {
  const m = window.__MOD('lib/babylon/music/AudioEngine\\\\.ts$'); if (!m) return false;
  const P = m.AudioEngine.prototype; if (P.__p10perf) return true; P.__p10perf = true;
  window.__ENGS = [];
  const o = P.scheduleStep; P.scheduleStep = function (...a) { if (!this.__p10seen) { this.__p10seen = true; window.__ENGS.push(new WeakRef(this)); } return o.apply(this, a); };
  return true;
})()`;
/** Babylon scenes / engines alive now, by WeakRef (taken while the room ran). */
const TAKE_SCENE_REFS = `(() => {
  let es = null; const r = window.__wreq || (window.__MOD('^$'), window.__wreq);
  for (const m of Object.values(r.c)) { try { const x = m && m.exports && m.exports.EngineStore; if (x && x.Instances) { es = x; break; } } catch (e) {} }
  window.__ES = es;
  window.__SCENES = (window.__SCENES || []).concat(es ? es.Instances.flatMap((e) => (e.scenes || []).map((s) => new WeakRef(s))) : []);
  window.__ENGINES = (window.__ENGINES || []).concat(es ? es.Instances.map((e) => new WeakRef(e)) : []);
  return { engines: es ? es.Instances.length : null, scenes: window.__SCENES.length };
})()`;
const LEFT_REPORT = `(() => {
  const st = (r) => { const x = r.deref(); return x ? (x.isDisposed === true || (typeof x.isDisposed === 'function' && x.isDisposed()) ? 'disposed-but-retained' : 'LIVE') : 'collected'; };
  const engs = (window.__ENGS || []).map((r) => { const e = r.deref(); return e ? { alive: true, ctx: e.ctx ? e.ctx.state : null, running: e.timerId !== null } : { alive: false }; });
  const rtc = (window.__RTC || []).map((r) => { const c = r.deref(); return c ? c.connectionState + '/' + c.signalingState : 'collected'; });
  return { audioEngines: engs, scenes: (window.__SCENES || []).map(st), engines: (window.__ENGINES || []).map(st), engineStoreInstances: window.__ES ? window.__ES.Instances.length : null, rtc };
})()`;

/** A fixed piece of main-thread work (ms): the CONTROL that proves the CPU throttle is really on — it must take ~rate× as
 *  long throttled (a 60 fps reading under a throttle that never engaged would prove nothing). */
const WORK = `(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 20000000; i++) x += i % 7; return Math.round((performance.now() - t) * 10) / 10 + (x < 0 ? 1 : 0); })()`;
async function measure(p: Page, cdpRate: number, ms: number): Promise<Any> {
  const cdp = await cdpOf(p);
  await cdp.send('Performance.enable').catch(() => undefined);
  const workFree = await p.evaluate(WORK) as number;
  if (cdpRate > 1) await throttle(cdp, cdpRate);
  const workThrottled = cdpRate > 1 ? await p.evaluate(WORK) as number : null;
  await sleep(1500);   // let the throttle settle before the window opens
  await markFrames(p);
  const metric = async (): Promise<Record<string, number>> => Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]));
  const m0 = await metric();
  await sleep(ms);
  const m1 = await metric();
  const s = await frameStats(p);
  if (cdpRate > 1) await throttle(cdp, 1);
  await cdp.detach().catch(() => undefined);
  const wall = (m1.Timestamp - m0.Timestamp) || ms / 1000;
  // MAIN-THREAD LOAD: the share of the window the renderer's main thread was busy (CDP TaskDuration), and script alone —
  // the headroom a vsync-capped 60 fps reading hides (16.7 ms p95 says the frame was on time, not how close it came)
  return { ...s, cpuRate: cdpRate, control: { workFreeMs: workFree, workThrottledMs: workThrottled, ratio: workThrottled ? Math.round((workThrottled / workFree) * 100) / 100 : null },
    mainThreadBusyPct: Math.round(((m1.TaskDuration - m0.TaskDuration) / wall) * 1000) / 10, scriptPct: Math.round(((m1.ScriptDuration - m0.ScriptDuration) / wall) * 1000) / 10,
    busyMsPerFrame: s.n ? Math.round(((m1.TaskDuration - m0.TaskDuration) * 1000 / s.n) * 10) / 10 : null };
}

async function leaveAndCount(p: Page, heapBefore: Any): Promise<Any> {
  await p.evaluate('window.__eng = null; window.__DPERF = null; window.__STAGE = null;').catch(() => undefined);
  await leaveRoom(p);
  const cdp = await cdpOf(p);
  const h = await heap(cdp);
  await cdp.detach().catch(() => undefined);
  const ctxs = await p.evaluate(CONTEXTS);
  const left = await p.evaluate(LEFT_REPORT);
  const liveAudio = (ctxs.acs as Any[]).filter((a) => a.state !== 'closed' && a.state !== 'collected');
  return {
    heapBefore, heapAfterLeave: h, heapDeltaMB: Math.round((h.usedMB - heapBefore.usedMB) * 10) / 10,
    audioContexts: ctxs.acs, liveAudioNotSoundKit: liveAudio.filter((a) => !/SoundKit/.test(a.who)).length, liveAudioSoundKit: liveAudio.filter((a) => /SoundKit/.test(a.who)).length,
    webgl: ctxs.gls, liveWebGl: ctxs.liveGl, offlineRenders: ctxs.offline, ...left,
  };
}

async function academyRoom(room: 'studio' | 'flip' | 'perform', profile: 'desktop' | 'phone'): Promise<Any> {
  const b = await launch();
  const out: Any = { room, profile, disk: assertDisk(`${room}-${profile}`) };
  try {
    const ctx = await b.newContext(profile === 'phone' ? PHONE : DESKTOP);
    for (const s of [STUDIO_TIER, CAL, EXTRA_INIT]) await ctx.addInitScript({ content: s });
    const p = await newPage(ctx, R.errors, `${room}-${profile}`);
    // the heap floor: the same blank route the room is left for, loaded first
    await p.goto(`${BASE}/dev/mode/p10-left`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await p.waitForFunction(() => /no registry mode/.test(document.body.textContent ?? ''), undefined, { timeout: 120000 });
    const c0 = await cdpOf(p); const heapBefore = await heap(c0); await c0.detach();
    await p.evaluate(() => (window as Any).next.router.push('/dev/music?stage=studio&player=p10perf'));
    const start = p.getByRole('button', { name: 'TAP TO START' }); await start.waitFor({ timeout: 300000 }); await start.click(); await sleep(700);
    await p.waitForFunction(() => !!document.querySelector('[data-qa="cell"]'), undefined, { timeout: 60000 });
    out.hooked = await p.evaluate(HOOK_ENGINE);
    for (const [row, steps] of [['kick', [0, 4, 8, 12]], ['snare', [4, 12]], ['hat', [0, 2, 4, 6, 8, 10, 12, 14]]] as [string, number[]][]) {
      for (const s of steps) { const c = p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${s}"]`); if (await c.count() && (await c.getAttribute('data-on')) !== '1') await c.click(); }
    }
    let driver: Promise<unknown> | null = null;
    if (room === 'studio') {
      await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
    } else if (room === 'flip') {
      await p.getByRole('button', { name: 'FLIP', exact: true }).click();
      await p.waitForFunction(() => !!((window as Any).__FEL_FLIP__ && (window as Any).__FEL_FLIP__.decoded), undefined, { timeout: 90000 });
      await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
      driver = p.evaluate(async (ms) => { const end = performance.now() + ms; let i = 0; while (performance.now() < end) { const b = document.querySelector(`[aria-label="pad ${(i++ % 4) + 1}"]`) as HTMLElement | null; b?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await new Promise((r) => setTimeout(r, 500)); } }, MEASURE_MS + 3000);
    } else {
      await p.getByRole('button', { name: 'PERFORM', exact: true }).click();
      await p.waitForSelector('[data-qa="perform-play"]', { timeout: 30000 });
      await p.locator('[data-qa="perform-play"]').click();
      // a busy player: a lane key every 150 ms, round the four lanes (frame time wants the input path live, not a score)
      driver = p.evaluate(async (ms) => {
        const end = performance.now() + ms; const K = ['h', 'j', 'k', 'l']; let i = 0;
        while (performance.now() < end) { const k = K[i++ % 4]; document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); document.body.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); await new Promise((r) => setTimeout(r, 150)); }
      }, MEASURE_MS + 3000);
    }
    await p.waitForFunction(() => { const e = (window as Any).__FEL_STUDIO__?.engine(); return !!e && e.running; }, undefined, { timeout: 20000 });
    await sleep(1500);
    out.frames = await measure(p, profile === 'phone' ? PHONE_CPU_RATE : 1, MEASURE_MS);
    out.status = await p.evaluate(() => (document.querySelector('[data-qa="perform-status"]')?.textContent ?? '').slice(0, 80));
    await driver?.catch(() => undefined);
    await p.screenshot({ path: `${OUT}/${room}-${profile}.png` });
    if (profile === 'desktop') out.left = await leaveAndCount(p, heapBefore);
    await ctx.close();
  } catch (e) { out.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); }
  finally { await b.close(); }
  return out;
}

async function danceRoom(place: 'home' | 'neon-club', profile: 'desktop' | 'phone'): Promise<Any> {
  const b = await launch();
  const out: Any = { room: `dance-${place}`, profile, disk: assertDisk(`dance-${place}-${profile}`) };
  try {
    const ctx = await b.newContext(profile === 'phone' ? PHONE : DESKTOP);
    for (const s of [CAL, EXTRA_INIT]) await ctx.addInitScript({ content: s });
    const p = await newPage(ctx, R.errors, `dance-${place}-${profile}`);
    await p.goto(`${BASE}/dev/mode/p10-left`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await p.waitForFunction(() => /no registry mode/.test(document.body.textContent ?? ''), undefined, { timeout: 120000 });
    const c0 = await cdpOf(p); const heapBefore = await heap(c0); await c0.detach();
    // into the room client-side too, so the page (and its registries) is the same one the room is left from
    await p.evaluate((q) => (window as Any).next.router.push(`/dev/mode/dance${q}`), `?track=warmup&place=${place}`);
    await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 });
    out.begin = await danceBegin(p);
    out.note = 'entered client-side (window.next.router); the song started by A and danced by the P9 intent driver';
    await sleep(4000);
    out.sceneRefs = await p.evaluate(TAKE_SCENE_REFS);
    out.frames = await measure(p, profile === 'phone' ? PHONE_CPU_RATE : 1, MEASURE_MS);
    out.judge = await p.evaluate(() => { const d = (window as Any).__DPERF; return d ? { score: d.score, combo: d.combo, maxCombo: d.maxCombo } : null; });
    await p.screenshot({ path: `${OUT}/dance-${place}-${profile}.png` });
    if (profile === 'desktop') { await p.evaluate(() => { const w = window as Any; if (w.__DRV) w.__DRV.stop = true; }); out.left = await leaveAndCount(p, heapBefore); }
    await ctx.close();
  } catch (e) { out.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); }
  finally { await b.close(); }
  return out;
}

for (const profile of PROFILES as ('desktop' | 'phone')[]) {
  for (const room of ONLY) {
    const key = `${room}-${profile}`;
    log('room', key);
    R.rooms[key] = room.startsWith('dance-') ? await danceRoom(room === 'dance-home' ? 'home' : 'neon-club', profile) : await academyRoom(room as 'studio' | 'flip' | 'perform', profile);
    const r = R.rooms[key];
    log(key, JSON.stringify({ frames: r.frames, fatal: r.fatal?.slice(0, 200), left: r.left && { liveAudioNotSoundKit: r.left.liveAudioNotSoundKit, liveWebGl: r.left.liveWebGl, engines: r.left.audioEngines, scenes: r.left.scenes, bab: r.left.engines, rtc: r.left.rtc, heapDeltaMB: r.left.heapDeltaMB } }));
    writeJson(`${OUT}/perf-proof.json`, R);
  }
}
R.runtimeSec = Math.round((Date.now() - t0) / 1000);
writeJson(`${OUT}/perf-proof.json`, R);
log('wrote', `${OUT}/perf-proof.json`, R.errors.length ? `errors ${R.errors.length}: ${R.errors.slice(0, 3).join(' | ')}` : 'no page errors');
