// MUSIC-SUITE P9 (2026-09-29), LIVE PROOF — "charts, freestyle and fair dance duels" played in the real Cypher on the lane's
// dev server (:3121, /dev/mode/dance — every /play route is auth-gated and the dev database is deliberately offline).
// One browser, one page at a time, one context for the free-play runs (so the per-song grade book carries between them).
//
// Runs, in order:
//   A. ?track=cypher  (difficulty 2) — an INTENT DRIVER plays the authored chart: every press step pressed on its beat on
//      the judge's own heard clock (__FEL_DEV__.danceClock, DanceMode's dev seam) ± a small seeded jitter, every freeze
//      HOLD kept to its end, every DOUBLE TAP both taps, and freestyle slots VARIED (J K L I = A B X Y, the pad's four moves).
//   B. ?track=battle  (difficulty 4) — the same driver, but freestyle slots REPEATED (J only), the FIRST hold DROPPED on
//      purpose (let go at 40 % of it), and every press +35 ms late (a steady drag: the rush/drag line must say so).
//   C. ?free=1 — the pick screen: every song's banner (the per-song BEST grades A and B just earned), free dance ON, then
//      a song danced with no judge (hit() never runs, no score, no result posted) back to the pick screen at the end.
//   D. ?arena=<seed> — the Arena ready screen (the house song, ONE ATTEMPT) for seed A, seed B, then seed A again
//      (deterministic across loads, and equal to houseSongFor in Node). Nothing is ever posted to the dev server.
//   E. seed A again: ONE ATTEMPT played end to end against a FAKE Arena — page.route() answers /api/arena/music-attempt in
//      this script (the real route is behind auth and the offline DB; its behaviour is proved by the fake-prisma tests):
//      START answers the house song's summary as the route does; FINISH is parsed and REJUDGED here in Node with the
//      route's own pure functions (houseSong.parseDancePresses + judgeDanceSet — what lib/arena-music.ts HOUSE_SET_RULES
//      .dance.judge calls). The room's frame-driven counts, the room's own rejudge and this rejudge are compared.
//   F. ?arena=p9-live-moves (never started) — the captured moves danced one by one through __FEL_DEV__.danceMove, each
//      screenshotted across its step AND sampled on EVERY rendered frame for the T-pose signature (Spine, LeftArm and
//      RightArm all within a few degrees of identity — danceClips.transSpin.test.ts's definition), with a control.
// The judge is observed by wrapping DancePerformance's prototype through the dev server's webpack module cache (the
// P2 probe's hook) — observation only: every wrapped call runs the original with the same arguments.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p9-live-proof.mts   (BASE, OUT, ONLY env override)
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright-core';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chromiumExe } from './_chromium.mts';
// houseSong.ts through require: an ESM import of a CJS-transpiled .ts sees none of its named exports (measured this run)
const requireTs = createRequire(import.meta.url);
const {
  houseSongFor, houseSongSummary, parseDancePresses, judgeDanceSet, danceArenaScore, DANCE_ARENA_RULES,
} = requireTs('../../lib/babylon/dance/houseSong.ts') as typeof import('../../lib/babylon/dance/houseSong');

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p9/live';
const ONLY = (process.env.ONLY ?? 'A,B,C,D,E,F').split(',');
const SEED_A = 'p9-live-b';   // canals (difficulty 5) — computed in Node before the run
const SEED_B = 'p9-live-h';   // warmup (difficulty 1)
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p9-live +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), frames: {}, pageErrors: [] as string[], console: [] as string[], runs: {} };
const RAW = process.env.RAW ?? 'p9-live-proof-raw.json';
const save = () => fs.writeFileSync(`${OUT}/${RAW}`, JSON.stringify(R, null, 2));

const INIT = `
window.__name = window.__name || function (f) { return f; };
(() => {
  const mk = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, mk) };
  navigator.getGamepads = () => [pad];
  window.__padBtn = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0, value: v }; pad.timestamp = Date.now(); };
  // the HUD as the dev route renders it (<pre> JSON): distinct top chips / banners / bottom lines, the last instrument row
  window.__HUDLOG = { round: [], banner: [], nextStep: [], instrumentsLast: '', scoreMax: 0, mic: [] };
  const push = (L, v) => { if (v && L[L.length - 1] !== v) { L.push(v); if (L.length > 600) L.splice(0, 200); } };
  let micNow = '';
  const watch = () => {
    const pre = document.querySelector('pre');
    if (!pre) { setTimeout(watch, 500); return; }
    new MutationObserver(() => {
      let h; try { h = JSON.parse(pre.textContent || '{}'); } catch (e) { return; }
      const H = window.__HUDLOG;
      push(H.round, h.round); push(H.banner, h.banner); push(H.nextStep, h.nextStep);
      // run 5: every Stoop caption as it goes UP, stamped on the judge's heard clock (the observer runs after React's
      // commit, so the stamp lags the line's real start by a frame or two — measurement slack, said in the result)
      if (typeof h.mic === 'string' && h.mic !== micNow) {
        micNow = h.mic;
        if (h.mic) { const dc = window.__FEL_DEV__ && window.__FEL_DEV__.danceClock; let heard = null; try { heard = dc ? dc.heard() : null; } catch (e) {} H.mic.push({ mic: h.mic, who: h.micWho || '', heard }); }
      }
      if (h.instruments) H.instrumentsLast = h.instruments;
      if (typeof h.score === 'number' && h.score > H.scoreMax) H.scoreMax = h.score;
      window.__HUDNOW = h;
    }).observe(pre, { childList: true, characterData: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();`;

// The judge, observed (P2's hook, extended with P9's press fields): every judgement with its step's kind, signed offset,
// points, the freestyle pick's variety factor, and every hold's end.
const HOOK = `(() => {
  if (!window.__wreq) { try { self.webpackChunk_N_E.push([['felprobe' + Date.now()], {}, (r) => { window.__wreq = r; }]); } catch (e) { return { ok: false, why: String(e) }; } }
  const r = window.__wreq;
  if (!r || !r.c) return { ok: false, why: 'no webpack module cache' };
  const mod = Object.values(r.c).find((m) => { try { return m && m.exports && m.exports.DancePerformance; } catch (e) { return false; } });
  if (!mod) return { ok: false, why: 'DanceCore not in the module cache yet' };
  const P = mod.exports.DancePerformance.prototype;
  const kindOf = (s) => !s ? 'wild' : s.pressFree ? 'free' : (s.pressHoldBeats > 0 ? 'hold' : (s.pressKind || 'move'));
  if (!P.__felWrapped) {
    P.__felWrapped = true;
    window.__JLOG = []; window.__HITS = 0; window.__RELEASES = [];
    const oh = P.hit;
    // (the ROOM's instance only: an Arena run also rejudges its own list in the page — judgeDanceSet builds a fresh
    // DancePerformance with no onJudged — and that instance must not be counted or read as the room's)
    P.hit = function (now, press) { if (this.__felRoom) window.__HITS++; return oh.call(this, now, press); };
    const orl = P.release;
    P.release = function (now, key) { const res = orl.call(this, now, key); window.__RELEASES.push({ key, res }); return res; };
    const ou = P.update;
    P.update = function (now) {
      if (!this.__felJudged) {
        this.__felJudged = true;
        this.__felRoom = !!this.onJudged;
        if (!this.__felRoom) return ou.call(this, now);
        const self = this;
        const oj = this.onJudged;
        this.onJudged = (l, p, c, s, d) => {
          window.__JLOG.push({ k: 'judge', label: l, points: p, combo: c, kind: kindOf(s), beat: s ? +s.beat.toFixed(3) : null,
            holdBeats: s && s.pressHoldBeats || null, deltaMs: d === undefined ? null : +(+d).toFixed(1),
            factor: self.lastFree ? self.lastFree.factor : null, pick: self.lastFree ? self.lastFree.move : null, score: self.score });
          return oj && oj(l, p, c, s, d);
        };
        const oe = this.onHoldEnd;
        this.onHoldEnd = (kept, s, p, c) => { window.__JLOG.push({ k: 'holdEnd', kept, beat: +s.beat.toFixed(3), holdBeats: s.pressHoldBeats, points: p, score: self.score }); return oe && oe(kept, s, p, c); };
      }
      if (this.__felRoom) window.__DPERF = this;
      return ou.call(this, now);
    };
  }
  return { ok: true, clock: !!(window.__FEL_DEV__ && window.__FEL_DEV__.danceClock) };
})()`;

// THE T-POSE SAMPLER: every rendered frame, the hero's Spine / LeftArm / RightArm local rotation's distance from identity
// (degrees). A T-pose frame (a bone with nothing driving it reports the rig's identity local rotation) shows as ALL three
// within TPOSE_DEG of identity at once.
// The dev handle carries no scene (that is __FEL_QA__'s, ?agent=1 sessions only — measured: 'dev.scene is not a function'),
// so the scene comes from Babylon's EngineStore in the webpack module cache, and the HERO is the skeleton whose Hips is
// nearest (on the floor plane) to where the front audience camera aims — P8's stage camera frames the dancer.
const TPOSE = `(() => {
  if (!window.__wreq) { try { self.webpackChunk_N_E.push([['felprobe' + Date.now()], {}, (r) => { window.__wreq = r; }]); } catch (e) { return { ok: false, why: String(e) }; } }
  let es = null;
  for (const m of Object.values(window.__wreq.c)) { try { const x = m && m.exports && m.exports.EngineStore; if (x && x.Instances) { es = x; break; } } catch (e) {} }
  if (!es) return { ok: false, why: 'no EngineStore' };
  const scenes = es.Instances.flatMap((e) => e.scenes || []).filter((s) => !s.isDisposed && s.skeletons.length);
  const sc = scenes.sort((a, b) => b.meshes.length - a.meshes.length)[0];
  if (!sc) return { ok: false, why: 'no scene with skeletons' };
  const bare = (n) => n.replace(/^mixamorig:/, '').replace(/_c\\d+$/, '').replace(/_p\\d+$/, '');
  // THE HERO: the skeleton targeted by the animation groups the dev anim probe says the HERO is playing (animProbe
  // readHeroBody finds them from the hero root, which the dev handle does not expose). The first pass picked the crowd
  // rig nearest the camera target instead — every move read the same minima, a Meshy crowd body's idle (measured).
  const H = window.__FEL_DEV__ && window.__FEL_DEV__.anim && window.__FEL_DEV__.anim();
  const clips = new Set(((H && H.hero && H.hero.playing) || []).map((p) => p.clip));
  const hits = new Map();
  for (const g of sc.animationGroups) {
    if (!g.isPlaying || !clips.has(g.name)) continue;
    const targets = new Set(g.targetedAnimations.map((ta) => ta.target));
    for (const s of sc.skeletons) if (s.bones.some((b) => targets.has(b.getTransformNode()))) hits.set(s, (hits.get(s) || 0) + 1);
  }
  const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1]);
  // A rigged body is several skinned meshes (body, top, shorts, shoes), each with its OWN Skeleton object linked to the
  // SAME bone nodes (measured pass 3: four 'Human.rig_c27x' tied on the hero's clip) — one rig, so a tie among
  // skeletons that share their Spine node is no tie at all.
  const spineOf = (s) => { const b = s.bones.find((b) => bare(b.name) === 'Spine'); return b && b.getTransformNode(); };
  const top = ranked.filter(([, n]) => ranked.length && n === ranked[0][1]);
  const oneRig = top.length > 0 && top.every(([s]) => spineOf(s) && spineOf(s) === spineOf(top[0][0]));
  const sk = oneRig ? top[0][0] : null;
  const pick = { skeletons: sc.skeletons.length, heroPlaying: [...clips], tiedSkeletonsShareOneRig: oneRig, tied: top.length, candidates: ranked.slice(0, 6).map(([s, n]) => ({ name: s.name, bones: s.bones.length, groups: n })) };
  if (!sk) return { ok: false, why: ranked.length ? 'the hero clips target more than one skeleton equally' : 'no skeleton targeted by the hero clips', pick };
  const node = (n) => { const b = sk.bones.find((b) => bare(b.name) === n); return b && b.getTransformNode(); };
  const N = { spine: node('Spine'), la: node('LeftArm'), ra: node('RightArm') };
  const deg = (q) => q ? Math.acos(Math.min(1, Math.abs(q.w))) * 360 / Math.PI : null;
  window.__TP_DEG = deg; window.__TP_N = N; window.__TP_SCENE = sc;
  window.__TP = { frames: 0, tFrames: 0, min: { spine: 1e9, la: 1e9, ra: 1e9 }, worst: null, ring: { frames: 0, maxTiltDeg: 0, over30: 0, minSurfaceM: 1e9 } };
  // run 5: THE PLAYER RING (the harness's flat disc at the hero's feet, parented to the hero root — ModeHarness.ts:763,
  // PlayerRing.ts:23-24). Every frame: how far its normal tilts from world up (0 = flat on the floor) and how close its
  // rim comes to the camera — the run-4 moves sheet showed it swinging up in front of the dancer on the floor moves.
  const rings = sc.meshes.filter((m) => m.name === 'player_ring');
  if (window.__TP_OBS) sc.onAfterRenderObservable.remove(window.__TP_OBS);
  window.__TP_OBS = sc.onAfterRenderObservable.add(() => {
    const T = window.__TP; if (!T) return;
    for (const r of rings) {
      if (r.isDisposed() || !r.isEnabled()) continue;
      const m = r.getWorldMatrix().m; const nx = m[8], ny = m[9], nz = m[10]; const nl = Math.hypot(nx, ny, nz) || 1;
      const tilt = Math.acos(Math.min(1, Math.abs(ny) / nl)) * 180 / Math.PI;
      const cam = sc.activeCamera; const p = r.getAbsolutePosition(); const rad = r.getBoundingInfo().boundingSphere.radiusWorld;
      const surf = cam ? Math.hypot(p.x - cam.globalPosition.x, p.y - cam.globalPosition.y, p.z - cam.globalPosition.z) - rad : 1e9;
      T.ring.frames++; if (tilt > T.ring.maxTiltDeg) T.ring.maxTiltDeg = +tilt.toFixed(1); if (tilt > 30) T.ring.over30++; if (surf < T.ring.minSurfaceM) T.ring.minSurfaceM = +surf.toFixed(2);
    }
    const d = { spine: deg(N.spine && N.spine.rotationQuaternion), la: deg(N.la && N.la.rotationQuaternion), ra: deg(N.ra && N.ra.rotationQuaternion) };
    if (d.spine === null || d.la === null || d.ra === null) return;
    T.frames++;
    for (const k of ['spine', 'la', 'ra']) if (d[k] < T.min[k]) T.min[k] = d[k];
    const m = Math.max(d.spine, d.la, d.ra);
    if (!T.worst || m < T.worst.maxDeg) T.worst = { maxDeg: +m.toFixed(2), spine: +d.spine.toFixed(2), la: +d.la.toFixed(2), ra: +d.ra.toFixed(2) };
    if (d.spine < 3 && d.la < 5 && d.ra < 5) T.tFrames++;
  });
  return { ok: true, pick, skeleton: sk.name, bones: sk.bones.length, nodes: { spine: !!N.spine, la: !!N.la, ra: !!N.ra },
    control: { identity: deg({ w: 1 }), identityFlagged: deg({ w: 1 }) < 3,
      restNow: (() => { try { const q = (b) => { const m = b.getRestMatrix ? b.getRestMatrix() : null; if (!m) return null; const s = new (N.spine.scaling.constructor)(); const qq = new (N.spine.rotationQuaternion.constructor)(); const t = new (N.spine.position.constructor)(); m.decompose(s, qq, t); return +deg(qq).toFixed(2); };
        return { spine: q(sk.bones.find((b) => bare(b.name) === 'Spine')), la: q(sk.bones.find((b) => bare(b.name) === 'LeftArm')), ra: q(sk.bones.find((b) => bare(b.name) === 'RightArm')) }; } catch (e) { return String(e); } })() } };
})()`;
// What is between the camera and the dancer: meshes whose bounding sphere comes within 1.5 m of the camera, and every
// visible mesh named like a ring / hoop / band / disc, with its distance from the camera (m) and its world radius (m).
const NEAR = `(() => {
  const sc = window.__TP_SCENE; if (!sc || !sc.activeCamera) return { err: 'no scene' };
  const cp = sc.activeCamera.globalPosition;
  const rec = (m) => { const bs = m.getBoundingInfo().boundingSphere; const c = bs.centerWorld;
    return { name: m.name, parent: m.parent ? m.parent.name : null, surface: +(Math.hypot(c.x - cp.x, c.y - cp.y, c.z - cp.z) - bs.radiusWorld).toFixed(2),
      r: +bs.radiusWorld.toFixed(2), c: [c.x, c.y, c.z].map((v) => +v.toFixed(2)), mat: m.material ? m.material.name : null, alpha: m.material ? m.material.alpha : null }; };
  const vis = sc.meshes.filter((m) => { try { return m.isEnabled() && m.isVisible && m.visibility > 0 && m.getTotalVertices() > 0 && m.getBoundingInfo; } catch (e) { return false; } });
  const near = vis.map(rec).filter((x) => x.surface < 1.5).sort((a, b) => a.surface - b.surface).slice(0, 8);
  const ringish = vis.filter((m) => /ring|hoop|torus|band|halo|disc|spot|shadow|pulse/i.test(m.name)).map(rec).sort((a, b) => a.surface - b.surface).slice(0, 10);
  return { cam: [cp.x, cp.y, cp.z].map((v) => +v.toFixed(2)), near, ringish };
})()`;
const tpRead = (p: Page) => p.evaluate(() => { const T = (window as Any).__TP; return T ? { frames: T.frames, tPoseFrames: T.tFrames, minDeg: { spine: +T.min.spine.toFixed(2), leftArm: +T.min.la.toFixed(2), rightArm: +T.min.ra.toFixed(2) }, closestFrame: T.worst, playerRing: T.ring } : null; });
const tpReset = (p: Page) => p.evaluate(() => { const T = (window as Any).__TP; if (T) { T.frames = 0; T.tFrames = 0; T.min = { spine: 1e9, la: 1e9, ra: 1e9 }; T.worst = null; T.ring = { frames: 0, maxTiltDeg: 0, over30: 0, minSurfaceM: 1e9 }; } });

// THE INTENT DRIVER, in the page: presses on the judge's heard clock (a 1 ms loop; a key event is judged the instant it
// is dispatched — DanceMode's input handler reads the song clock itself).
const DRIVER = `window.__drive = (o) => {
  const w = window, d = w.__DPERF, dc = w.__FEL_DEV__.danceClock;
  const bd = 60 / d.bpm, steps = d.steps;
  let seed = (o.seed >>> 0) || 7;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const FREE = ['j', 'k', 'l', 'i'];
  const plan = []; let holdN = 0, freeN = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const t = d.started + s.beat * bd;
    const kind = s.pressFree ? 'free' : (s.pressHoldBeats > 0 ? 'hold' : (s.pressKind || 'move'));
    if (o.skip && rnd() < o.skip) { plan.push({ i, kind, skipped: true }); continue; }
    // run 5: a double tap's SECOND tap left out on purpose (its head is still pressed) — the judge must MISS it
    if (o.skipDoubleSecond && kind === 'double') { plan.push({ i, kind, skipped: true }); continue; }
    const jit = (rnd() * 2 - 1) * (o.jitterMs || 0) / 1000;
    const at = t + (o.offsetMs || 0) / 1000 + jit;
    let key = 'j';
    if (kind === 'free') { key = o.freeMode === 'repeat' ? 'j' : FREE[freeN % 4]; freeN++; }
    const p = { i, t, at, key, kind, beat: s.beat };
    if (kind === 'hold') {
      const end = t + s.pressHoldBeats * bd; const drop = holdN === o.dropHold;
      p.holdBeats = s.pressHoldBeats; p.drop = drop; p.upAt = drop ? t + 0.4 * s.pressHoldBeats * bd : end + 0.02; holdN++;
    }
    plan.push(p);
  }
  const downs = plan.filter((p) => !p.skipped);
  for (let k = 0; k < downs.length; k++) {
    const p = downs[k]; if (p.kind === 'hold') continue;
    const nx = downs[k + 1]; p.upAt = p.at + Math.min(0.06, nx ? Math.max(0.01, (nx.at - p.at) * 0.5) : 0.06);
  }
  const ev = [];
  for (const p of downs) { ev.push({ at: p.at, type: 'keydown', p }); ev.push({ at: p.upAt, type: 'keyup', p }); }
  ev.sort((a, b) => a.at - b.at || (a.type === 'keyup' ? -1 : 1));
  let k = 0; w.__DRV = { steps: steps.length, planned: downs.length, skipped: plan.length - downs.length, done: false, late: [] };
  const iv = setInterval(() => {
    const st = dc.state(); if (st.paused) return;
    const h = dc.heard();
    while (k < ev.length && h >= ev[k].at) {
      const e = ev[k++];
      w.dispatchEvent(new KeyboardEvent(e.type, { key: e.p.key, bubbles: true }));
      if (e.type === 'keydown') {
        w.__DRV.late.push(+((h - e.p.at) * 1000).toFixed(1));
        if (e.p.kind === 'hold' && !e.p.drop && !w.__HOLD_NOW && e.p.holdBeats >= 2) w.__HOLD_NOW = { beat: e.p.beat, holdBeats: e.p.holdBeats, endHeard: e.p.t + e.p.holdBeats * bd };
        if (e.p.kind === 'free') w.__FREE_N = (w.__FREE_N || 0) + 1;
      }
    }
    if (k >= ev.length) { clearInterval(iv); w.__DRV.done = true; }
  }, 1);
  return { steps: steps.length, planned: downs.length, holds: plan.filter((p) => p.kind === 'hold').length, free: freeN, bpm: d.bpm };
};`;

const hud = (p: Page): Promise<Any> => p.evaluate(() => { try { return JSON.parse(document.querySelector('pre')?.textContent ?? '{}'); } catch { return {}; } });
const sleep = (p: Page, ms: number) => p.waitForTimeout(ms);
async function padPress(p: Page, i: number, ms = 90): Promise<void> {
  await p.evaluate((b) => (window as Any).__padBtn(b, 1), i); await sleep(p, ms); await p.evaluate((b) => (window as Any).__padBtn(b, 0), i);
}
const frame = async (p: Page, name: string): Promise<string> => { const path = `${OUT}/p9live-${name}.png`; await p.screenshot({ path }); R.frames[name] = path; log('frame', name); return path; };

let resultArgs: Any = null;
function attach(p: Page): void {
  p.on('pageerror', (e) => { R.pageErrors.push(String(e).slice(0, 300)); log('PAGEERROR', String(e).slice(0, 200)); });
  p.on('console', async (m) => {
    const s = m.text();
    if (/\[dev\] result/.test(s)) { try { const a = await Promise.all(m.args().map((x) => x.jsonValue())); resultArgs = a[1] ?? a; } catch { resultArgs = s; } }
    if (/\[dev\] result|FEL-DANCE\] (track|count-in)|no AudioContext|ChunkLoadError/.test(s)) { R.console.push(s.slice(0, 400)); log('CON', s.slice(0, 200)); }
  });
}
async function open(p: Page, url: string): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (attempt === 1) await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    else { log('reload', attempt); await p.reload({ waitUntil: 'domcontentloaded', timeout: 300000 }); }
    const ok = await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 })
      .then(() => true).catch(() => false);
    if (ok) return;
  }
  throw new Error(`never reached ready: ${url}`);
}
async function hook(p: Page): Promise<Any> {
  let h: Any = null;
  for (let i = 0; i < 150; i++) { h = await p.evaluate(HOOK); if (h.ok && h.clock) break; await sleep(p, 200); }
  await p.evaluate(DRIVER);
  return h;
}
async function waitRunning(p: Page): Promise<boolean> {
  for (let i = 0; i < 300; i++) { if (await p.evaluate(() => !!(window as Any).__DPERF?.running)) return true; await sleep(p, 100); }
  return false;
}
async function waitResult(p: Page, maxMs = 200000): Promise<Any> {
  const until = Date.now() + maxMs;
  while (Date.now() < until && !resultArgs) await sleep(p, 250);
  return resultArgs;
}
function summarise(J: Any[]): Any {
  const judged = J.filter((e) => e.k === 'judge');
  const by = (kind: string) => {
    const L = judged.filter((e) => e.kind === kind);
    const c: Any = { n: L.length, PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    for (const e of L) c[e.label]++;
    return c;
  };
  const free = judged.filter((e) => e.kind === 'free' && e.label !== 'MISS');
  const holdEnds = J.filter((e) => e.k === 'holdEnd');
  const offs = judged.filter((e) => e.label !== 'MISS' && e.deltaMs !== null).map((e) => e.deltaMs as number);
  const mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : null;
  return {
    byKind: { move: by('move'), accent: by('accent'), double: by('double'), hold: by('hold'), free: by('free'), wild: by('wild') },
    holdEnds: holdEnds.map((e) => ({ beat: e.beat, holdBeats: e.holdBeats, kept: e.kept, points: e.points })),
    freestyle: {
      slotsHit: free.length,
      meanFactor: free.length ? +(free.reduce((a, e) => a + e.factor, 0) / free.length).toFixed(3) : null,
      picks: [...new Set(free.map((e) => e.pick))],
      firstSlots: free.slice(0, 8).map((e) => ({ pick: e.pick, label: e.label, factor: e.factor, points: e.points })),
      factorHistogram: free.reduce((m: Any, e) => { m[e.factor] = (m[e.factor] ?? 0) + 1; return m; }, {}),
    },
    offsets: { hits: offs.length, meanMs: mean === null ? null : +mean.toFixed(1), minMs: offs.length ? Math.min(...offs) : null, maxMs: offs.length ? Math.max(...offs) : null },
  };
}

// ── A / B: an authored chart, played ──────────────────────────────────────────────────────────────────────────────
async function chartRun(p: Page, name: string, song: string, o: Any): Promise<void> {
  resultArgs = null;
  await open(p, `${BASE}/dev/mode/dance?track=${song}`);
  const h = await hook(p);
  await padPress(p, 0);   // A wakes the harness; ?track= goes straight to the count-in
  if (!(await waitRunning(p))) { R.runs[name] = { ...R.runs[name], fatal: 'the song never started' }; await frame(p, `${name}-stuck`); return; }
  const plan0 = p.evaluate((x) => (window as Any).__drive(x), o);   // (the driver is armed before the first step)
  await sleep(p, 1200);   // the hero is on a chart clip: the T-pose sampler finds its skeleton by what it plays
  R.runs[name] = { ...(R.runs[name] ?? {}), tposeSetup: await p.evaluate(TPOSE).catch((e: unknown) => ({ ok: false, why: String(e).slice(0, 300) })) };
  const chart = await p.evaluate(() => {
    const d = (window as Any).__DPERF; const s = d.steps as Any[]; const bd = 60 / d.bpm;
    const last = s[s.length - 1];
    const kinds = s.reduce((m: Any, x: Any) => { const k = x.pressFree ? 'free' : (x.pressHoldBeats > 0 ? 'hold' : (x.pressKind || 'move')); m[k] = (m[k] ?? 0) + 1; return m; }, {});
    const gaps = s.slice(1).map((x: Any, i: number) => (x.beat - s[i].beat) * bd);
    const lengthSec = (last.beat + last.holdBeats) * bd;
    return { steps: s.length, bpm: d.bpm, kinds, lengthSec: +lengthSec.toFixed(2), tapsPerMin: +(s.length / (lengthSec / 60)).toFixed(1), longestGapSec: +Math.max(...gaps).toFixed(2), minGapSec: +Math.min(...gaps).toFixed(3) };
  });
  const plan = await plan0;
  log(name, 'chart', JSON.stringify(chart), 'plan', JSON.stringify(plan));
  // frames: a hold mid-hold (the first kept hold of 2+ beats), and the first freestyle bar after its 3rd pick
  let holdHud: Any = null, freeHud: Any = null;
  const holdShot = p.waitForFunction(() => { const w = window as Any; return w.__HOLD_NOW && w.__FEL_DEV__.danceClock.heard() > w.__HOLD_NOW.endHeard - (w.__HOLD_NOW.holdBeats * 60 / w.__DPERF.bpm) * 0.5; }, undefined, { timeout: 150000, polling: 16 })
    .then(async () => { holdHud = { hud: await hud(p), holding: await p.evaluate(() => ({ holding: (window as Any).__DPERF.holding, left: (window as Any).__DPERF.holdLeftSec((window as Any).__FEL_DEV__.danceClock.heard()), at: (window as Any).__HOLD_NOW })) }; await frame(p, `${name}-hold`); }).catch(() => { holdHud = 'no 2+ beat kept hold reached'; });
  const freeShot = p.waitForFunction(() => ((window as Any).__FREE_N ?? 0) >= 3, undefined, { timeout: 150000, polling: 16 })
    .then(async () => { await sleep(p, 120); freeHud = await hud(p); await frame(p, `${name}-freestyle`); }).catch(() => { freeHud = 'no freestyle slot reached'; });
  await Promise.all([holdShot, freeShot]);
  // the song to its end
  await p.waitForFunction(() => (window as Any).__DRV?.done, undefined, { timeout: 200000, polling: 250 });
  const endInstruments = await p.evaluate(() => (window as Any).__HUDLOG.instrumentsLast);
  const res = await waitResult(p, 30000);
  await sleep(p, 300);
  const endHud = await hud(p);
  await frame(p, `${name}-results`);
  const judge = await p.evaluate(() => { const w = window as Any; const d = w.__DPERF; return { counts: d.counts, score: d.score, maxCombo: d.maxCombo, result: d.result(), hits: w.__HITS, releases: w.__RELEASES.length, late: w.__DRV.late }; });
  const J = await p.evaluate(() => (window as Any).__JLOG);
  const late = judge.late as number[];
  delete judge.late;
  R.runs[name] = {
    ...R.runs[name], url: `/dev/mode/dance?track=${song}`, song, driver: o, hook: h, chart, plan,
    driverDispatchLateMs: { n: late.length, mean: +(late.reduce((a, b) => a + b, 0) / late.length).toFixed(2), max: Math.max(...late) },
    judge, summary: summarise(J), holdFrameHud: holdHud, freestyleFrameHud: freeHud, endInstruments,
    results: { banner: endHud.banner, round: endHud.round, nextStep: endHud.nextStep, devResult: res },
    hudSeen: await p.evaluate(() => { const H = (window as Any).__HUDLOG; return { rounds: H.round.slice(0, 40), bannersSample: [...new Set(H.banner as string[])].filter((b: string) => /FREESTYLE|CALL BAR|HELD|HOLD|GRADE/.test(b)).slice(0, 30), nextStepSample: [...new Set(H.nextStep as string[])].filter((b: string) => /HOLD|YOUR MOVE/.test(b)).slice(0, 12) }; }),
    tpose: await tpRead(p),
    // run 5: Stoop's captions against the chart's step times (heard clock) — P8's guard promises a line never STARTS
    // inside a step's ±0.12 s window and ends before the next one opens (SpeechQueue.poll, hostVoice.ts:96-100)
    stoop: await p.evaluate(() => {
      const w = window as Any; const d = w.__DPERF; const bd = 60 / d.bpm;
      const times: number[] = (d.steps as Any[]).map((s: Any) => d.started + s.beat * bd);
      const last = times[times.length - 1];
      const B: string[] = w.__HUDLOG.banner;
      return {
        songStartHeard: d.started, lastStepHeard: last,
        cueBanners: { freestyle: B.filter((b) => /^FREESTYLE/.test(b)).length, callBar: B.filter((b) => /^CALL BAR/.test(b)).length },
        captions: (w.__HUDLOG.mic as Any[]).map((c: Any) => {
          if (c.heard === null) return c;
          const k = times.findIndex((t) => t + 0.12 > c.heard);
          const next = k >= 0 ? times[k] : null;
          return { ...c, songSec: +(c.heard - d.started).toFixed(3), duringChart: c.heard >= d.started && c.heard <= last + 0.12, nextStepIn: next === null ? null : +(next - c.heard).toFixed(3) };
        }),
      };
    }),
  };
  log(name, 'result', JSON.stringify(R.runs[name].results).slice(0, 600));
  log(name, 'summary', JSON.stringify(R.runs[name].summary).slice(0, 900));
  save();
}

// ── C: the pick screen, BEST grades, free dance ───────────────────────────────────────────────────────────────────
async function freeRun(p: Page): Promise<void> {
  resultArgs = null;
  await open(p, `${BASE}/dev/mode/dance?free=1`);
  await hook(p);
  await padPress(p, 9);   // START wakes the harness to its playing phase: the room's own pick screen
  await sleep(p, 1500);
  const banners: Any[] = [];
  const first = await hud(p);
  banners.push({ banner: first.banner, round: first.round, nextStep: first.nextStep });
  for (let i = 0; i < 9; i++) {
    await padPress(p, 15, 60);   // d-pad right: the next song (each browse restarts the pick timeout)
    await sleep(p, 450);
    const h = await hud(p);
    banners.push({ banner: h.banner, round: h.round, nextStep: h.nextStep });
    if (i === 1) await frame(p, 'C-pick-best');
  }
  // back to the warm-up (the list wraps), then dance it free
  let guard = 0;
  while (!/MORNING BOARDWALK|WARM/i.test(String((await hud(p)).banner)) && guard++ < 12) { await padPress(p, 15, 60); await sleep(p, 400); }
  const onPick = await hud(p);
  await frame(p, 'C-free-pick');
  const hits0 = await p.evaluate(() => (window as Any).__HITS ?? 0);
  await padPress(p, 0);   // A: dance (free)
  await sleep(p, 6000);   // count-in + into the song
  const moves: Any[] = [];
  for (let i = 0; i < 12; i++) {
    const key = ['j', 'k', 'l', 'i'][i % 4];
    await p.evaluate((k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })), 80); }, key);
    await sleep(p, 150);
    const h = await hud(p);
    moves.push({ key, banner: h.banner, score: h.score ?? null });
    if (i === 5) await frame(p, 'C-free-dancing');
    await sleep(p, 700);
  }
  const mid = await hud(p);
  // the song to its end: the room goes back to the pick screen (no result)
  const endBy = Date.now() + 130000;
  let back: Any = null;
  while (Date.now() < endBy) {
    const h = await hud(p);
    if (/▲\s+SCORED|A\s+DANCE/.test(String(h.nextStep)) && /FREE DANCE/.test(String(h.round ?? '') + String(h.hint ?? '') + String(h.banner ?? '') + JSON.stringify(h))) { back = h; break; }
    await sleep(p, 1000);
  }
  await sleep(p, 3000);
  const hits1 = await p.evaluate(() => (window as Any).__HITS ?? 0);
  const perf = await p.evaluate(() => { const d = (window as Any).__DPERF; return d ? { running: d.running, score: d.score, counts: d.counts } : null; });
  R.runs.C = {
    url: '/dev/mode/dance?free=1', pickBanners: banners, freePick: { banner: onPick.banner, round: onPick.round, nextStep: onPick.nextStep },
    freeMoves: moves, midSong: { banner: mid.banner, score: mid.score ?? null, instruments: mid.instruments, round: mid.round },
    judgeHitCallsDuringFreeDance: hits1 - hits0, perfAfter: perf, backToPick: back ? { banner: back.banner, nextStep: back.nextStep, round: back.round } : null,
    devResultPosted: resultArgs, gradeBook: await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('fel:dance:grades:v1') ?? 'null'); } catch { return null; } }),
  };
  if (back) await frame(p, 'C-back-to-pick');
  log('C', JSON.stringify(R.runs.C).slice(0, 1500));
  save();
}

// ── G: per-song BEST grades on the pick screen ────────────────────────────────────────────────────────────────────
async function gradesRun(p: Page): Promise<void> {
  await open(p, `${BASE}/dev/mode/dance`);
  await padPress(p, 9);   // START wakes the harness: the room's own pick screen (no A — A would lock a song in)
  await sleep(p, 1500);
  const banners: string[] = [String((await hud(p)).banner)];
  let shot = false;
  for (let i = 0; i < 6; i++) {
    await padPress(p, 15, 60);
    await sleep(p, 450);
    const b = String((await hud(p)).banner);
    banners.push(b);
    if (!shot && /BEST/.test(b)) { await frame(p, 'G-pick-best'); shot = true; }
  }
  R.runs.G = { url: '/dev/mode/dance (pick screen, never started)', banners: [...new Set(banners)],
    gradeBook: await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('fel:dance:grades:v1') ?? 'null'); } catch { return null; } }) };
  log('G', JSON.stringify(R.runs.G).slice(0, 900));
  save();
}

// ── D / E: the Arena ──────────────────────────────────────────────────────────────────────────────────────────────
async function arenaReady(p: Page, seed: string, tag: string): Promise<Any> {
  await open(p, `${BASE}/dev/mode/dance?arena=${seed}`);
  await padPress(p, 9);   // harness START only — the room's own START (A / B) is what posts, and it is not pressed here
  await sleep(p, 2500);
  const h = await hud(p);
  await frame(p, `D-arena-ready-${tag}`);
  const node = houseSongSummary(houseSongFor(seed));
  return { seed, banner: h.banner, round: h.round, nextStep: h.nextStep, hint: h.hint, node, bannerNamesNodeSong: new RegExp(String(node.bpm)).test(String(h.banner)) };
}
async function arenaRun(p: Page): Promise<void> {
  resultArgs = null;
  const house = houseSongFor(SEED_A);
  const posts: Any[] = [];
  await p.route('**/api/arena/music-attempt', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    posts.push({ phase: body.phase, room: body.room, matchId: body.matchId, attemptId: body.attemptId ?? null, taps: Array.isArray(body.taps) ? body.taps.length : null });
    if (body.phase === 'start') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, phase: 'start', song: houseSongSummary(house), rules: DANCE_ARENA_RULES }) });
      return;
    }
    const parsed = parseDancePresses(house, body.taps);
    if (!parsed.ok) { posts[posts.length - 1].refused = parsed; await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: parsed.code, detail: parsed.detail }) }); return; }
    const v = judgeDanceSet(house, parsed.presses);
    posts[posts.length - 1].rejudge = { score: v.score, counts: v.counts, accuracy: +v.accuracy.toFixed(4), steps: v.steps, judgedPresses: v.judgedPresses, holds: v.holds ?? null, variety: v.variety ?? null };
    R.arenaFinishList = parsed.presses;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, phase: 'finish', taps: parsed.presses.length, score: v.score }) });
  });
  await open(p, `${BASE}/dev/mode/dance?arena=${SEED_A}`);
  await hook(p);
  await padPress(p, 9);   // harness START: the ready screen
  await sleep(p, 2000);
  const ready = await hud(p);
  await padPress(p, 0);   // the room's START: the one attempt (answered by the fake Arena above)
  if (!(await waitRunning(p))) { R.runs.E = { fatal: 'the Arena set never started', posts, hud: await hud(p) }; await frame(p, 'E-stuck'); return; }
  const plan = await p.evaluate((x) => (window as Any).__drive(x), { seed: 99, jitterMs: 45, offsetMs: -8, freeMode: 'varied', skip: 0.04, dropHold: 1 });
  await sleep(p, 1200);
  const tposeSetup = await p.evaluate(TPOSE).catch((e: unknown) => ({ ok: false, why: String(e).slice(0, 300) }));
  await sleep(p, 20000);
  const midHud = await hud(p);
  await frame(p, 'E-arena-playing');
  await p.waitForFunction(() => (window as Any).__DRV?.done, undefined, { timeout: 200000, polling: 250 });
  const res = await waitResult(p, 40000);
  await sleep(p, 300);
  const endHud = await hud(p);
  await frame(p, 'E-arena-end');
  const room = await p.evaluate(() => { const d = (window as Any).__DPERF; return { counts: d.counts, score: d.score, result: d.result() }; });
  const roomAccuracyScore = danceArenaScore(room.counts);
  const J = await p.evaluate(() => (window as Any).__JLOG);
  R.runs.E = {
    url: `/dev/mode/dance?arena=${SEED_A}`, house: houseSongSummary(house), readyHud: { banner: ready.banner, round: ready.round, nextStep: ready.nextStep },
    plan, posts, midHud: { banner: midHud.banner, round: midHud.round, nextStep: midHud.nextStep },
    roomFrameDriven: { ...room, arenaScoreFromCounts: roomAccuracyScore }, summary: summarise(J),
    endHud: { banner: endHud.banner, round: endHud.round, nextStep: endHud.nextStep, hint: endHud.hint }, devResult: res,
    agree: { roomCountsVsRejudge: roomAccuracyScore === posts.find((x) => x.phase === 'finish')?.rejudge?.score, shellScoreVsRejudge: (res as Any)?.score === posts.find((x) => x.phase === 'finish')?.rejudge?.score },
    tposeSetup, tpose: await tpRead(p),
  };
  log('E', JSON.stringify(R.runs.E).slice(0, 1500));
  await p.unroute('**/api/arena/music-attempt');
  save();
}

// ── F: the captured moves, frame by frame ─────────────────────────────────────────────────────────────────────────
async function movesRun(p: Page): Promise<void> {
  const MOVES = ['dance_toprock_kick', 'dance_pop_moonwalk', 'dance_pop_robot', 'dance_freeze_side', 'dance_power_headstand', 'dance_power_helicopter', 'dance_toprock_basic', 'dance_trans_spin'];
  const AT = [0.25, 0.7, 1.15, 1.6, 2.05, 2.5];
  await open(p, `${BASE}/dev/mode/dance?arena=p9-live-moves`);
  await padPress(p, 9);
  await p.waitForFunction(() => typeof (window as Any).__FEL_DEV__?.danceMove === 'function', undefined, { timeout: 60000 });
  await sleep(p, 2500);
  // the hero's skeleton is found by the clip it plays: a captured move only the hero dances (no crowd body plays it)
  await p.evaluate(() => (window as Any).__FEL_DEV__.danceMove('dance_power_headstand'));
  await sleep(p, 500);
  const setup = await p.evaluate(TPOSE).catch((e: unknown) => ({ ok: false, why: String(e).slice(0, 300) }));
  await p.evaluate(() => (window as Any).__FEL_DEV__.danceMove('dance_bounce_shoulder'));
  const registered = await p.evaluate(() => (window as Any).__FEL_DEV__.danceRegistered());
  const canvas = await p.evaluate(() => { const c = document.querySelector('canvas')!.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  const clip = { x: canvas.x + canvas.w * 0.36, y: canvas.y + canvas.h * 0.22, width: canvas.w * 0.28, height: canvas.h * 0.56 };
  const out: Any = {};
  R.runs.F = { url: '/dev/mode/dance?arena=p9-live-moves (never started)', setup, registered, moves: out };
  // control: the room's own shoulder bounce (a DANCE_LIBRARY clip) before the captured moves
  await tpReset(p); await sleep(p, 1500); const idle = await tpRead(p);
  for (const id of MOVES) {
    await tpReset(p);
    const playing = await p.evaluate((m) => (window as Any).__FEL_DEV__.danceMove(m), id);
    const t = Date.now();
    const shots: string[] = [];
    const near: Any[] = [];
    for (const at of AT) {
      const wait = at * 1000 - (Date.now() - t);
      if (wait > 0) await sleep(p, wait);
      const path = `${OUT}/p9live-move-${id}-${at.toFixed(2)}.png`;
      await p.screenshot({ path, clip });
      shots.push(path);
      // run 4: the large teal ring the run-3 sheet shows in front of the floor moves — what is near the camera, and every
      // ring-like mesh in view, at the instant of each shot (observation only)
      near.push({ at, ...(await p.evaluate(NEAR).catch((e: unknown) => ({ err: String(e).slice(0, 200) }))) });
    }
    out[id] = { playing, registered: registered.includes(id), shots, tpose: await tpRead(p), near };
    log(id, JSON.stringify(out[id].tpose));
    await p.evaluate(() => (window as Any).__FEL_DEV__.danceMove('dance_bounce_shoulder'));
    await sleep(p, 700);
  }
  const rows = MOVES.map((id) => `<tr><th>${id.replace('dance_', '')}<br>T-pose frames ${out[id].tpose?.tPoseFrames ?? '?'} / ${out[id].tpose?.frames ?? '?'}</th>${out[id].shots.map((s: string) => `<td><img src="data:image/png;base64,${fs.readFileSync(s).toString('base64')}"></td>`).join('')}</tr>`).join('');
  const sheet = await p.context().newPage();
  await sheet.setViewportSize({ width: 1400, height: 400 });
  await sheet.setContent(`<html><body style="margin:0;background:#111;color:#eee;font:12px monospace"><table style="border-spacing:2px">
    <tr><th></th>${AT.map((a) => `<th>+${a}s</th>`).join('')}</tr>${rows}</table>
    <style>img{height:260px;display:block}th{padding:2px 6px;text-align:left}</style></body></html>`);
  await sheet.screenshot({ path: `${OUT}/p9live-moves-sheet.png`, fullPage: true });
  await sheet.close();
  R.frames['F-moves-sheet'] = `${OUT}/p9live-moves-sheet.png`;
  // KNOWN-POSITIVE CONTROL: force the three bones to identity for 30 frames (after every animation and layer: the last
  // onBeforeRender observer) — the sampler must count those frames as T-pose frames, or it reads nothing real
  await tpReset(p);
  const forced = await p.evaluate(() => new Promise<number>((res) => {
    const w = window as Any; const sc = w.__TP_SCENE; let n = 0;
    if (!sc) { res(-1); return; }
    const obs = sc.onBeforeRenderObservable.add(() => {
      for (const k of ['spine', 'la', 'ra']) w.__TP_N[k].rotationQuaternion.copyFromFloats(0, 0, 0, 1);
      if (++n >= 30) { sc.onBeforeRenderObservable.remove(obs); res(n); }
    });
  }));
  await sleep(p, 200);
  const positiveControl = { forcedFrames: forced, ...(await tpRead(p)) };
  log('T-pose positive control', JSON.stringify(positiveControl));
  R.runs.F = { url: '/dev/mode/dance?arena=p9-live-moves (never started)', setup, registered, idleControl: idle, positiveControl, moves: out };
  save();
}

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
  try {
    const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript({ content: INIT });
    const p = await ctx.newPage();
    attach(p);
    const step = async (tag: string, f: () => Promise<void>) => {
      if (!ONLY.includes(tag)) return;
      try { await f(); } catch (e) { R.runs[tag] = { ...(R.runs[tag] ?? {}), error: String((e as Error)?.stack ?? e).slice(0, 1200) }; log(tag, 'ERROR', String(e).slice(0, 300)); save(); }
    };
    await step('A', () => chartRun(p, 'A', 'cypher', { seed: 11, jitterMs: 12, offsetMs: 0, freeMode: 'varied', dropHold: -1 }));
    await step('B', () => chartRun(p, 'B', 'battle', { seed: 23, jitterMs: 12, offsetMs: 35, freeMode: 'repeat', dropHold: 0 }));
    // A2: THE SAME SONG as A, the same driver and seed, freestyle slots REPEATED (J only) — varied vs repeated on one chart
    await step('A2', () => chartRun(p, 'A2', 'cypher', { seed: 11, jitterMs: 12, offsetMs: 0, freeMode: 'repeat', dropHold: -1 }));
    // G: the pick screen after the runs above, in the same context — the per-song BEST grades they left on the device
    await step('G', () => gradesRun(p));
    await step('C', () => freeRun(p));
    await step('D', async () => {
      const a1 = await arenaReady(p, SEED_A, 'seedA');
      const b = await arenaReady(p, SEED_B, 'seedB');
      const a2 = await arenaReady(p, SEED_A, 'seedA-again');
      R.runs.D = { seedA: a1, seedB: b, seedAagain: a2, deterministic: a1.banner === a2.banner && a1.round === a2.round, differs: a1.banner !== b.banner };
      log('D', JSON.stringify(R.runs.D).slice(0, 1200));
      save();
    });
    await step('E', () => arenaRun(p));
    await step('F', () => movesRun(p));
    // H (run 5): THE CYPHER again, a steady RUSH (every press 35 ms early: the rush half of the coaching line), every
    // double tap's SECOND tap left out (the judge must MISS exactly those), freestyle varied — and Stoop's captions
    // logged on the heard clock: P8 wrote dance.freestyle / dance.callbar and P9 wired them, never heard live until now.
    await step('H', async () => {
      await chartRun(p, 'H', 'cypher', { seed: 31, jitterMs: 12, offsetMs: -35, freeMode: 'varied', dropHold: -1, skipDoubleSecond: true });
      const man = JSON.parse(fs.readFileSync(new URL('../../public/audio/voice/v1/stoop/dance.json', import.meta.url), 'utf8')) as { lines: { moment: string; text: string; sec: number }[] };
      const byText = new Map(man.lines.map((l) => [l.text, l]));
      const st = R.runs.H?.stoop;
      if (st) {
        st.captions = (st.captions as Any[]).map((c) => {
          const l = byText.get(c.mic);
          const sec = l?.sec ?? null;
          const guard = c.duringChart && c.nextStepIn !== null && sec !== null
            ? { startsOutsideWindow: c.nextStepIn >= 0.12, endsBeforeNextWindowOpens: c.nextStepIn - 0.12 >= sec, slackSec: +(c.nextStepIn - 0.12 - sec).toFixed(3) }
            : null;
          return { ...c, moment: l?.moment ?? '(not in the Stoop manifest)', sec, guard };
        });
        const during = (st.captions as Any[]).filter((c) => c.duringChart);
        st.summary = {
          captionsDuringChart: during.length,
          byMoment: during.reduce((m: Any, c: Any) => { m[c.moment] = (m[c.moment] ?? 0) + 1; return m; }, {}),
          freestyleLines: during.filter((c) => c.moment === 'dance.freestyle').length,
          callBarLines: during.filter((c) => c.moment === 'dance.callbar').length,
          startedInsideAWindow: during.filter((c) => c.guard && !c.guard.startsOutsideWindow).length,
          ranIntoTheNextWindow: during.filter((c) => c.guard && !c.guard.endsBeforeNextWindowOpens).map((c) => ({ moment: c.moment, songSec: c.songSec, slackSec: c.guard.slackSec })),
        };
        log('H stoop', JSON.stringify(st.summary));
        save();
      }
    });
    await ctx.close();
  } catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); console.error(e); }
  finally {
    await browser.close();
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    save();
    log('wrote', `${OUT}/p9-live-proof-raw.json`);
  }
}
main();
