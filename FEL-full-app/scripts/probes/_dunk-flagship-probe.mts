// _dunk-flagship-probe — the dunk FLAGSHIP pass's instrument (owner playtest 2026-10-27: "Dunk game mode is the flagship —
// needs to be improved still … smoother movement, better lobs"). One recording per attempt, on the virtual clock
// (_vclock-page.js: every rendered frame is exactly 1/60 s of game time), of what the player saw:
//
//   · the APPROACH — root speed / acceleration / jerk, the hips' one-frame pops, each foot's slide while it is planted, the
//     hero's clip changes (a clip that arrives at full weight in one frame is a hard cut), bone angular-speed pops;
//   · the TAKE-OFF — press (A on the run, or RT let go) → the launch line → the hips leaving the floor, in frames;
//   · the HANG — feet off the floor → back on it, the hips' apex over their runway height, the time within 10 cm of the apex;
//   · the LOB — the ball's arc (apex, flight time), the hand-to-ball gap over the flight, CAUGHT / LOST, the catch's clip time;
//   · the SLAM — what the player perceived on the iron (the harness's QA trace: hit-stop, shake, slow-mo, flash, impact, sfx);
//   · the CAMERA — cuts (a one-frame jump of the eye or the target), through the replay and the reveal;
//   · the TRICKS — each air trick's body-local hand / foot / head path, normalised over the flight, and its nearest neighbour.
//
// Runs against any page that mounts the mode with the dev runner's text ("DEV · dunk · <phase>" + the HUD JSON): the esbuild
// rig (scratchpad round9/dunk-flagship/rig, NODE_ENV=development) or /dev/mode/dunk.
//
//   BASE=http://127.0.0.1:3611 PAGE='base.html?mode=dunk' OUT=/abs/dir SCEN=approach,press,release,oop,selflob,tricks \
//     REPS=3 STRIP=1 npx tsx scripts/probes/_dunk-flagship-probe.mts
//   SCEN items: approach (stick walk → RT run → auto take-off at the line), press (A on the run), release (RT let go),
//     oop / oopglass / oopbounce (the ?prop= page), selflob (Y standing, then run), runlob (Y on the run), tricks (every air
//     trick), show (one make recorded through the replay and the card: the camera). PROP=<id> loads the page with ?prop=.
//   STRIP=1 photographs a frame strip of the first attempt of each scenario (pauses the clock on the frame, so it is exact).
import { chromium, type Page, type Browser } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3611';
const PAGE = process.env.PAGE ?? 'base.html?mode=dunk';
const OUT = process.env.OUT ?? path.join(process.cwd(), '.dunk-flagship-out');
const SCEN = (process.env.SCEN ?? 'approach,press,release,selflob,oop').split(',').map((s) => s.trim()).filter(Boolean);
const REPS = Number(process.env.REPS ?? 3);
const STRIP = process.env.STRIP === '1';
const SEED = Number(process.env.SEED ?? 7);
const W = Number(process.env.VW ?? 480), H = Number(process.env.VH ?? 270);
const SCALE = Number(process.env.HWSCALE ?? 2);
fs.mkdirSync(OUT, { recursive: true });
const VCLOCK_JS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '_vclock-page.js'), 'utf8');

type Dir = 'up' | 'down' | 'left' | 'right'; type Btn = 'A' | 'B' | 'X' | 'Y';
const AIR: Record<string, [Dir, Btn]> = {
  windmill: ['up', 'A'], tomahawk: ['up', 'Y'], tap: ['up', 'B'], windmill360: ['up', 'X'],
  spin360: ['right', 'B'], scorpion: ['right', 'Y'], cradle: ['right', 'A'], fakeeastbay: ['right', 'X'],
  eastbay: ['down', 'Y'], betweenlegs: ['down', 'B'], clutch: ['down', 'A'], doubleeastbay: ['down', 'X'],
  lostfound: ['left', 'B'], hideseek: ['left', 'A'], behindback: ['left', 'Y'], fakeback: ['left', 'X'],
};
const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
const JN = ['Hips', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftHand', 'RightHand', 'Head'];
const QN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];

interface Frame { lv?: number; t: number; f: number; rp: number[]; yaw: number; j: (number[] | null)[]; q: number[]; ball: number[] | null; bpar: string; cam: number[]; tgt: number[]; clips: [string, number][]; ts: number }
interface Rec { scen: string; rep: number; frames: Frame[]; marks: { t: number; msg: string }[]; qa: { t: number; kind: string; name: string }[]; pressAt: number | null; t0: number; hud: string[]; err?: string }

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.__name = window.__name || function (f) { return f; };
})()`;

// ── the in-page recorder (after the clock) ──────────────────────────────────────────────────────────────────────────
const RECORDER = `(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene;
  const S = window.__smp = { marks: [] };
  const markRe = /^\\[(DUNK-[A-Z-]+|LOB|HANDS|JUICE-[A-Z]+|FEL-DUNK|DUBBLE|RIG-FEEL)/;
  for (const k of ['info', 'log', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { const s = String(a[0]); if (markRe.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 240) }); o(...a); }; }
  const R = window.__rec = { on: false, frames: [], strip: null, stripWait: false, stripN: 0, f0: 0 };
  const JN = ${JSON.stringify(JN)}, QN = ${JSON.stringify(QN)};
  const clean = (n) => n.replace(/^mixamorig:?/, '').replace(/_c\\d+$/, '');
  let rootRef = null, jn = null, qn = null, targets = null;
  // YTRAP (Phase 2): every change to the hero root's height with a short stack, as a mark (an unminified bundle names the writer)
  const ytrap = ${process.env.YTRAP === '1'}; let yTrapped = null;
  const trapY = (root) => { if (!ytrap || yTrapped === root) return; yTrapped = root; const v = root.position; let y = v._y; let n = 0;
    Object.defineProperty(v, '_y', { configurable: true, get() { return y; }, set(nv) { if (Math.abs(nv - y) > 1e-4 && n < 40 && (Math.abs(nv) < 0.06 || Math.abs(y) < 0.06)) { n++; S.marks.push({ t: performance.now(), msg: '[YTRAP] ' + y.toFixed(4) + ' → ' + Number(nv).toFixed(4) + ' @ ' + new Error().stack.split('\\n').slice(2, 6).map((x) => x.trim().replace(/\\(?https?:[^)]*\\/([a-z]+)\\.js:/, '($1:').slice(0, 60)).join(' < ') }); } y = nv; } }); };
  const bind = (root) => {
    const sk = scene.skeletons.find((s) => s.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(root); }));
    const nodes = sk ? sk.bones.map((b) => b.getTransformNode()).filter(Boolean) : [];
    const by = new Map(nodes.map((n) => [clean(n.name), n]));
    jn = JN.map((n) => by.get(n) || null); qn = QN.map((n) => by.get(n) || null); targets = new Set(nodes); rootRef = root;
  };
  let ballRef = null;
  const findBall = () => { if (ballRef && !ballRef.isDisposed()) return ballRef; ballRef = scene.meshes.find((m) => m.name === 'ball' && m.metadata && m.metadata.felPalmMirrorLeft) || null; return ballRef; };
  const r4 = (v) => Math.round(v * 1e4) / 1e4, r5 = (v) => Math.round(v * 1e5) / 1e5;
  scene.onAfterRenderObservable.add(() => {
    if (!R.on) return;
    const h = dev.hero(); if (!h) return; let root = h; while (root.parent) root = root.parent;
    if (rootRef !== root) bind(root);
    trapY(root);
    const rp = root.position;
    let yaw = root.rotation.y; const rq = root.rotationQuaternion; if (rq) { yaw = Math.atan2(2 * (rq.w * rq.y + rq.x * rq.z), 1 - 2 * (rq.y * rq.y + rq.x * rq.x)); }
    const j = jn.map((n) => { if (!n) return null; const a = n.getAbsolutePosition(); return [r4(a.x), r4(a.y), r4(a.z)]; });
    const q = []; for (const n of qn) { const r = n && n.rotationQuaternion; if (r) q.push(r5(r.x), r5(r.y), r5(r.z), r5(r.w)); else q.push(0, 0, 0, 1); }
    const b = findBall(); let ball = null, bpar = ''; if (b) { const a = b.getAbsolutePosition(); ball = [r4(a.x), r4(a.y), r4(a.z)]; bpar = b.parent ? b.parent.name : ''; }
    const cam = scene.activeCamera; const cp = cam.globalPosition || cam.position; let tg = [0, 0, 0];
    try { const T = cam.getTarget ? cam.getTarget() : (cam.target || null); if (T) tg = [r4(T.x), r4(T.y), r4(T.z)]; } catch (e) {}
    const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations.some((t) => targets.has(t.target))).map((g) => { const a = g.animatables && g.animatables[0]; const w = a && typeof a.weight === 'number' && a.weight >= 0 ? a.weight : (g.weight >= 0 ? g.weight : 1); return [g.name, Math.round(w * 100) / 100]; }).filter((c) => c[1] > 0.02);
    const f = window.__vc ? window.__vc.C.frames : 0;
    const ringM = scene.getMeshByName('lob_catch_ring'), shadowM = scene.getMeshByName('lob_ball_shadow');
    const lv = (ringM && ringM.isVisible && ringM.isEnabled() ? 1 : 0) + (shadowM && shadowM.isVisible && shadowM.isEnabled() ? 2 : 0);
    R.frames.push({ t: performance.now(), f, rp: [r4(rp.x), r4(rp.y), r4(rp.z)], yaw: r5(yaw), j, q, ball, bpar, cam: [r4(cp.x), r4(cp.y), r4(cp.z)], tgt: tg, clips, ts: scene.animationTimeScale ?? 1, lv });
    if (R.frames.length > 4000) R.frames.shift();
    // the frame strip: pause the clock ON this frame so node photographs exactly it
    if (R.strip && R.strip.length && (f - R.f0) >= R.strip[0]) { R.strip.shift(); R.stripN++; R.stripWait = true; window.__vc.pause(); }
  });
  if (ytrap) { const h0 = dev.hero(); if (h0) { let r0 = h0; while (r0.parent) r0 = r0.parent; trapY(r0); } }   // from boot: the intro's writes too
  window.__hud = () => window.__hudObj || {};
  window.__HUDLOG = []; let last = '';
  setInterval(() => { const h = window.__hud(); const s = [h.banner, h.hint, h.slamBeat].filter(Boolean).join(' | '); if (s && s !== last) { last = s; window.__HUDLOG.push({ t: performance.now(), s }); } }, 16);
  // the slam on the beat the mode publishes (slamBeat 'beat' = the window's centre), pressed in the page
  window.__armSlam = (mode) => {
    const t0 = performance.now();
    const tick = () => {
      if (performance.now() - t0 > 5000) return;
      const sb = window.__hud().slamBeat;
      if (!(mode === 'open' ? (sb === 'open' || sb === 'beat') : sb === 'beat')) { requestAnimationFrame(tick); return; }
      const b = window.__PAD.buttons[0]; b.pressed = true; b.value = 1; window.__PAD.timestamp = performance.now();
      setTimeout(() => { b.pressed = false; b.value = 0; window.__PAD.timestamp = performance.now(); }, 60);
    };
    requestAnimationFrame(tick);
  };
})()`;

interface PadLike { buttons: { pressed: boolean; value: number }[]; axes: number[]; timestamp: number }
interface QaLike { events(n?: number): { t: number; kind: string; key?: string }[] }
interface DunkWin { __vc: { pause(): void; resume(): void; reseed(seed: number): void; C: { vt: number; frames: number; paused: boolean } }; __rec: { on: boolean; frames: Frame[]; strip: number[] | null; stripWait: boolean; f0: number }; __smp: { marks: { t: number; msg: string }[] }; __PAD: PadLike; __hud(): Record<string, unknown>; __armSlam(mode?: string): void; __HUDLOG: { t: number; s: string }[]; __FEL_QA__?: QaLike }

async function startInPage(settleMs: number): Promise<{ playing: boolean; frames: number }> {
  const w = window as unknown as DunkWin; const pad = w.__PAD;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  w.__vc.resume();
  pad.buttons[0].pressed = true; pad.buttons[0].value = 1; pad.timestamp = performance.now();
  await sleep(70);
  pad.buttons[0].pressed = false; pad.buttons[0].value = 0; pad.timestamp = performance.now();
  const t0 = performance.now(); let playing = false;
  while (performance.now() - t0 < 30000) { if (document.body.innerText.includes('· playing')) { playing = true; break; } await sleep(50); }
  await sleep(settleMs);
  w.__vc.pause();
  return { playing, frames: w.__vc.C.frames };
}

interface AttemptCfg { scen: string; seed: number; standMs: number; walkMs: number; walkY: number; holdMs: number; takeoff: 'auto' | 'press' | 'release'; pressAfterMs: number;
  preY: boolean; runY: boolean; air: [number, number] | null; slam: 'beat' | 'open' | 'none'; recMs: number; strip: number[] | null }
type AttemptOut = { err: string } | { t0: number; pressAt: number | null; frames: Frame[]; marks: { t: number; msg: string }[]; qa: { t: number; kind: string; name: string }[]; hud: string[] };

/** One attempt in the page, on the virtual clock. */
async function attemptInPage(c: AttemptCfg): Promise<AttemptOut> {
  const w = window as unknown as DunkWin; const pad = w.__PAD;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const now = () => performance.now();
  const setB = (i: number, on: boolean) => { pad.buttons[i].pressed = on; pad.buttons[i].value = on ? 1 : 0; pad.timestamp = now(); };
  const tap = async (i: number, ms: number) => { setB(i, true); await sleep(ms); setB(i, false); };
  w.__vc.resume(); w.__vc.reseed(c.seed);
  try {
    let ok = false; const a0 = now();
    while (now() - a0 < 40000) {
      const t = document.body.innerText;
      if (/HOLD to run|Pick your PROP|FINAL ROUND|PRACTICE/.test(t) && !/SLAM!|CONFER|CARD|RIVAL ROUND/.test(t) && /· playing/.test(t)) { ok = true; break; }
      // the rival's turn: skip it (B), it is not what this measures
      if (/RIVAL/.test(String(w.__hud().banner ?? '')) || w.__hud().rivalSkip === true) { await tap(1, 60); await sleep(300); }
      await sleep(120);
    }
    if (!ok) return { err: 'no approach' };
    await sleep(500);
    const R = w.__rec; R.frames = []; R.f0 = w.__vc.C.frames; R.strip = c.strip ? c.strip.slice() : null; R.on = true; const t0 = now();
    const launchedAt = (): number | null => { const m = w.__smp.marks.find((x) => x.t >= t0 && /\[DUNK-LAUNCH\]/.test(x.msg)); return m ? m.t : null; };
    await sleep(c.standMs);
    if (c.preY) { await tap(3, 60); await sleep(150); }
    if (c.walkMs > 0) { pad.axes[1] = c.walkY; pad.timestamp = now(); await sleep(c.walkMs); }
    pad.axes[1] = -1; setB(7, true);
    let pressAt: number | null = null; let launch: number | null = null; const hold0 = now(); let ranY = false;
    while (now() - hold0 < Math.max(c.holdMs, 200) + 4000) {
      if (c.runY && !ranY && now() - hold0 >= 250) { ranY = true; await tap(3, 60); }
      if (c.takeoff !== 'auto' && pressAt == null && now() - hold0 >= c.pressAfterMs) {
        pressAt = now();
        if (c.takeoff === 'press') await tap(0, 60); else { setB(7, false); }
      }
      launch = launchedAt(); if (launch) break;
      await sleep(16);
    }
    pad.axes[1] = 0; setB(7, false);
    if (!launch) { R.on = false; return { err: 'never launched' }; }
    if (c.air) { setB(c.air[0], true); await sleep(80); await tap(c.air[1], 60); await sleep(50); setB(c.air[0], false); }
    if (c.slam !== 'none') w.__armSlam(c.slam);
    const end = launch + c.recMs;
    while (now() < end) { await sleep(100); }
    R.on = false;
    const qa = w.__FEL_QA__ ? w.__FEL_QA__.events(4000).filter((e) => e.t >= t0).map((e) => ({ t: e.t, kind: String(e.kind), name: String(e.key ?? '') })) : [];
    return { t0, pressAt, frames: R.frames, marks: w.__smp.marks.filter((m) => m.t >= t0 || m.msg.startsWith('[YTRAP]')), qa, hud: w.__HUDLOG.filter((h) => h.t >= t0).map((h) => h.s) };
  } finally { w.__vc.pause(); }
}

async function boot(b: Browser, prop: string | null): Promise<{ p: Page; errors: string[] }> {
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(PAD_INIT);
  await ctx.addInitScript({ content: `(() => { let a = ${SEED >>> 0 || 1}; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; try { localStorage.clear(); } catch (e) {} })()` });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 40[14]|favicon|gamepad/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  const url = `${BASE}/${PAGE}${prop ? (PAGE.includes('?') ? '&' : '?') + 'prop=' + prop : ''}${(PAGE.includes('?') || prop) ? '&' : '?'}agent=1`;
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000, polling: 500 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 240000, polling: 500 });
  await p.waitForTimeout(1500);
  if (SCALE !== 1) await p.evaluate((s) => { const e = (window as unknown as { __FEL_DEV__: { scene: { getEngine(): { setHardwareScalingLevel(n: number): void } } } }).__FEL_DEV__.scene.getEngine(); e.setHardwareScalingLevel(s); }, SCALE);
  await p.evaluate(`window.__VC_CFG = ${JSON.stringify({ dt: 1000 / 60, seed: SEED })}`);
  await p.evaluate(VCLOCK_JS);
  await p.evaluate(RECORDER);
  const st = await p.evaluate(startInPage, 2500);
  console.log(`[boot] ${url} start ${JSON.stringify(st)}`);
  return { p, errors };
}

function cfgFor(scen: string, rep: number): AttemptCfg {
  const base: AttemptCfg = { scen, seed: SEED * 1000 + rep * 17 + scen.length, standMs: 300, walkMs: 700, walkY: -0.5, holdMs: 0, takeoff: 'auto', pressAfterMs: 0,
    preY: false, runY: false, air: null, slam: 'beat', recMs: 3200, strip: null };
  const jit = [0, 120, 260, 400, 60, 200][rep % 6];   // reps vary the run so the lob timing is not one sample
  switch (scen) {
    case 'approach': return { ...base, walkMs: 700 + jit };
    case 'press': return { ...base, takeoff: 'press', pressAfterMs: 650 + jit };
    case 'release': return { ...base, takeoff: 'release', pressAfterMs: 650 + jit };
    case 'selflob': return { ...base, walkMs: 0, standMs: 300 + jit, preY: true };
    case 'runlob': return { ...base, runY: true, walkMs: 300 + jit };
    case 'oop': case 'oopglass': case 'oopbounce': return { ...base, walkMs: 500 + jit };
    case 'oopstand': return { ...base, walkMs: 0, standMs: 300 + jit };                                  // RT from standing
    case 'ooppress': return { ...base, walkMs: 400, takeoff: 'press', pressAfterMs: 500 + jit };          // A early on the run
    case 'ooprelease': return { ...base, walkMs: 400, takeoff: 'release', pressAfterMs: 450 + jit };      // RT let go early
    case 'show': return { ...base, recMs: 14000 };
    default: if (scen.startsWith('trick:')) { const a = AIR[scen.slice(6)]; return { ...base, walkMs: 400, air: [DPAD_I[a[0]], BTN_I[a[1]]] }; }
  }
  throw new Error('unknown scenario ' + scen);
}

async function runScen(b: Browser, scen: string, reps: number): Promise<Rec[]> {
  const prop = scen === 'oop' || scen === 'oopstand' || scen === 'ooppress' || scen === 'ooprelease' ? 'alleyoop' : scen === 'oopglass' || scen === 'oopbounce' ? scen : (process.env.PROP ?? null);
  const list = scen === 'tricks' ? Object.keys(AIR).map((k) => `trick:${k}`) : Array.from({ length: reps }, () => scen);
  const out: Rec[] = [];
  let pg: { p: Page; errors: string[] } | null = null; let used = 0;
  for (let i = 0; i < list.length; i++) {
    if (!pg || used >= 4) { if (pg) await pg.p.context().close(); pg = await boot(b, prop); used = 0; }
    const s = list[i]; const rep = scen === 'tricks' ? 0 : i + Number(process.env.REP0 ?? 0);   // REP0: a piece's first rep (one attempt per piece on a loaded rig)
    const cfg = cfgFor(s, rep);
    const stripOn = STRIP && i === 0;
    if (stripOn) cfg.strip = Array.from({ length: Number(process.env.STRIP_N ?? 20) }, (_, k) => Number(process.env.STRIP_FROM ?? 60) + k * Number(process.env.STRIP_STEP ?? 6));
    const p = pg.p;
    const shotsDir = path.join(OUT, 'strip', s.replace(':', '-'));
    if (stripOn) fs.mkdirSync(shotsDir, { recursive: true });
    const run = p.evaluate(attemptInPage, cfg);
    let done = false; let res: AttemptOut | null = null;
    run.then((r) => { res = r; done = true; }, (e) => { res = { err: String(e).slice(0, 200) }; done = true; });
    const tw = Date.now(); let k = 0, k0 = 0;
    while (!done && Date.now() - tw < 600000) {
      if (stripOn) {
        const wait = await p.evaluate(() => (window as unknown as DunkWin).__rec.stripWait).catch(() => false);
        if (wait) {
          await p.evaluate(() => { const o = document.getElementById('o'); if (o) o.style.display = 'none'; }).catch(() => {});
          await p.screenshot({ path: path.join(shotsDir, `f${String(++k).padStart(2, '0')}.jpg`), quality: 70, type: 'jpeg' });
          await p.evaluate(() => { const w = window as unknown as DunkWin; w.__rec.stripWait = false; w.__vc.resume(); });
          continue;
        }
      }
      await new Promise((r) => setTimeout(r, stripOn ? 60 : 400));
      if (process.env.PROGRESS && Date.now() - tw > 30000 * (k0 + 1)) { k0++; const fr = await p.evaluate(() => (window as unknown as DunkWin).__vc.C.frames).catch(() => -1); console.log(`    … ${Math.round((Date.now() - tw) / 1000)} s wall, frame ${fr}`); }
    }
    used++;
    const r = res as AttemptOut | null;
    if (!r || 'err' in r) { console.log(`  ${s}#${rep}: ${r ? r.err : 'timeout'}`); out.push({ scen: s, rep, frames: [], marks: [], qa: [], pressAt: null, t0: 0, hud: [], err: r ? r.err : 'timeout' }); continue; }
    out.push({ scen: s, rep, ...r });
    fs.writeFileSync(path.join(OUT, `rec-${scen}.json`), JSON.stringify(out));   // each attempt saved as it lands: a killed run keeps what it measured
    console.log(`  ${s}#${rep}: ${r.frames.length} frames, ${r.marks.length} marks${pg.errors.length ? ' · errors ' + pg.errors.length : ''}`);
  }
  if (pg) await pg.p.context().close();
  return out;
}

// ── node-side measures ──────────────────────────────────────────────────────────────────────────────────────────────
const DT = 1 / 60;
const hyp = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const pct = (a: number[], p: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const mean = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const rnd = (v: number, d = 2) => Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null;
function markT(r: Rec, re: RegExp): number | null { const m = r.marks.find((x) => re.test(x.msg)); return m ? m.t : null; }
function idxAt(r: Rec, t: number | null): number { if (t == null) return -1; let i = r.frames.findIndex((f) => f.t >= t - 1e-6); return i < 0 ? r.frames.length - 1 : i; }
function qAngDeg(a: number[], b: number[]): number { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; }

/** The approach: root kinematics, hips pops, foot slide, clip cuts, bone pops — from the first move to the launch. */
function approachMetrics(r: Rec) {
  const L = idxAt(r, markT(r, /\[DUNK-LAUNCH\]/));
  const fr = r.frames.slice(0, Math.max(0, L));
  if (fr.length < 10) return null;
  // the root's horizontal speed, acceleration, jerk
  const v: number[] = []; for (let i = 1; i < fr.length; i++) v.push(hyp(fr[i].rp, fr[i - 1].rp) / DT);
  const a: number[] = []; for (let i = 1; i < v.length; i++) a.push((v[i] - v[i - 1]) / DT);
  const jk: number[] = []; for (let i = 1; i < a.length; i++) jk.push(Math.abs((a[i] - a[i - 1]) / DT));
  const moving = v.findIndex((x) => x > 0.3);
  const jkMove = jk.slice(Math.max(0, moving));
  // the hips (what the eye follows): one-frame second difference = acceleration; a pop is a spike over its neighbourhood
  const hipsAcc: number[] = [];
  for (let i = 1; i < fr.length - 1; i++) {
    const p0 = fr[i - 1].j[0], p1 = fr[i].j[0], p2 = fr[i + 1].j[0]; if (!p0 || !p1 || !p2) { hipsAcc.push(0); continue; }
    hipsAcc.push(Math.hypot(p2[0] - 2 * p1[0] + p0[0], p2[1] - 2 * p1[1] + p0[1], p2[2] - 2 * p1[2] + p0[2]) / (DT * DT));
  }
  let hipPops = 0; const hipPopAt: number[] = [];
  for (let i = 3; i < hipsAcc.length - 3; i++) { const nb = [...hipsAcc.slice(i - 3, i), ...hipsAcc.slice(i + 1, i + 4)]; const med = pct(nb, 0.5); if (hipsAcc[i] > 40 && hipsAcc[i] > 3.5 * Math.max(med, 4)) { hipPops++; hipPopAt.push(i + 1); } }
  // the feet: a foot is planted while its lower joint (ankle or toe) is within 4 cm of that joint's floor height; its slide is
  // the horizontal travel of that joint while planted. A planted foot that travels is skating.
  const slides: { side: string; frames: number; cm: number; mps: number }[] = [];
  const contactSpeeds: number[] = [];
  for (const [side, fi, ti] of [['L', 1, 3], ['R', 2, 4]] as const) {
    const ys = fr.map((f) => Math.min(f.j[fi]?.[1] ?? 9, f.j[ti]?.[1] ?? 9));
    const floor = pct(ys.filter((y) => y < 5), 0.03);
    let span: number[] = [];
    const flush = () => { if (span.length >= 3) { let cm = 0; for (let k = 1; k < span.length; k++) { const A = fr[span[k - 1]], B = fr[span[k]]; const pa = (A.j[ti] && A.j[ti]![1] <= (A.j[fi]?.[1] ?? 9)) ? A.j[ti]! : A.j[fi]!; const pb = (B.j[ti] && B.j[ti]![1] <= (B.j[fi]?.[1] ?? 9)) ? B.j[ti]! : B.j[fi]!; const d = hyp(pa, pb); cm += d * 100; contactSpeeds.push(d / DT); }
      slides.push({ side, frames: span.length, cm: rnd(cm, 1)!, mps: rnd(cm / 100 / ((span.length - 1) * DT), 2)! }); } span = []; };
    for (let i = Math.max(0, moving); i < fr.length; i++) { if (ys[i] <= floor + 0.04) span.push(i); else flush(); }
    flush();
  }
  // FOOT SKATE (the gate's measure): each frame, the LOWER of the four foot joints, when within 3 cm of the floor and the same joint
  // as last frame, its world horizontal speed weighted (2 − 2^(h/H)) — the motion-synthesis literature's skate. The span measure
  // above counts a swing foot skimming the floor at a sprint as a plant; this one reads only the foot carrying the body. By band.
  const skate: Record<string, { n: number; mps: number }> = {};
  {
    const FJ = [1, 2, 3, 4];
    const lowJ = (f: Frame) => FJ.reduce((b, k) => ((f.j[k]?.[1] ?? 9) < (f.j[b]?.[1] ?? 9) ? k : b), FJ[0]);
    const gi = idxAt(r, markT(r, /gather stride/)); const G = gi > 0 && gi < fr.length ? gi : fr.length;
    const hs = fr.slice(0, G).map((f) => f.j[lowJ(f)]?.[1] ?? 9); const floor = pct(hs.filter((y) => y < 5), 0.02); const Hc = 0.03;
    const acc: Record<string, [number, number]> = {};
    for (let i = 1; i < G; i++) {
      const k = lowJ(fr[i]); if (k !== lowJ(fr[i - 1])) continue;
      const a = fr[i - 1].j[k], b2 = fr[i].j[k]; if (!a || !b2) continue;
      const h = b2[1] - floor; if (h > Hc) continue;
      const v = hyp(fr[i].rp, fr[i - 1].rp) / DT, sp = hyp(b2, a) / DT, w = 2 - 2 ** (Math.max(0, h) / Hc);
      const band = v < 2.5 ? 'walk' : v < 5 ? 'run' : 'sprint';
      const e = (acc[band] ??= [0, 0]); e[0] += sp * w; e[1] += w;
      const all = (acc.all ??= [0, 0]); if (v >= 2.5) { all[0] += sp * w; all[1] += w; }
    }
    for (const [k, [sw, w]] of Object.entries(acc)) skate[k] = { n: Math.round(w), mps: rnd(sw / Math.max(1e-9, w))! };
  }
  // clip changes: a clip that enters at ≥ 0.6 weight on its first frame (no fade) is a hard cut
  let cuts = 0, changes = 0; const cutNames: string[] = [];
  for (let i = 1; i < fr.length; i++) {
    const prev = new Map(fr[i - 1].clips); for (const [n, wv] of fr[i].clips) if (!prev.has(n)) { changes++; if (wv >= 0.6) { cuts++; cutNames.push(n); } }
  }
  // bone pops: a bone's one-frame angular speed ≥ 600°/s and ≥ 3.5× its neighbourhood (the motion probe's rule)
  let bonePops = 0; const popBones: Record<string, number> = {};
  for (let b = 0; b < QN.length; b++) {
    const w: number[] = []; for (let i = 1; i < fr.length; i++) w.push(qAngDeg(fr[i].q.slice(b * 4, b * 4 + 4), fr[i - 1].q.slice(b * 4, b * 4 + 4)) / DT);
    for (let i = 3; i < w.length - 3; i++) { const nb = [...w.slice(i - 3, i), ...w.slice(i + 1, i + 4)]; if (w[i] >= 600 && w[i] >= 3.5 * Math.max(pct(nb, 0.5), 30)) { bonePops++; popBones[QN[b]] = (popBones[QN[b]] ?? 0) + 1; } }
  }
  // yaw: the facing's one-frame steps
  const yawStep: number[] = []; for (let i = 1; i < fr.length; i++) { let d = fr[i].yaw - fr[i - 1].yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yawStep.push(Math.abs(d) * 180 / Math.PI); }
  return {
    frames: fr.length, peakMps: rnd(Math.max(...v)), meanMps: rnd(mean(v.slice(Math.max(0, moving)))),
    accelP95: rnd(pct(a.map(Math.abs), 0.95), 1), jerkRms: rnd(Math.sqrt(mean(jkMove.map((x) => x * x))), 0), jerkP95: rnd(pct(jkMove, 0.95), 0), jerkMax: rnd(Math.max(...jkMove), 0),
    hipAccP95: rnd(pct(hipsAcc, 0.95), 1), hipAccMax: rnd(Math.max(...hipsAcc), 1), hipPops, hipPopAt: hipPopAt.slice(0, 8),
    plants: slides.length, slideCmMed: rnd(pct(slides.map((s) => s.cm), 0.5), 1), slideCmP90: rnd(pct(slides.map((s) => s.cm), 0.9), 1), slideMpsMed: rnd(pct(slides.map((s) => s.mps), 0.5)),
    contactFastShare: rnd(contactSpeeds.filter((x) => x > 0.5).length / Math.max(1, contactSpeeds.length)), slides: slides.slice(0, 16), skate,
    clipChanges: changes, hardCuts: cuts, cutNames: [...new Set(cutNames)], bonePops, popBones, yawStepMaxDeg: rnd(Math.max(...yawStep), 1),
  };
}

/** Take-off and hang: press → launch line → hips leave → feet leave → feet back; apex. */
function flightMetrics(r: Rec) {
  const tL = markT(r, /\[DUNK-LAUNCH\]/); const L = idxAt(r, tL);
  if (L < 0 || L >= r.frames.length - 5) return null;
  const pre = r.frames.slice(Math.max(0, L - 20), L);
  const hip0 = mean(pre.map((f) => f.j[0]?.[1] ?? 0));
  const footMin = (f: Frame) => Math.min(f.j[1]?.[1] ?? 9, f.j[2]?.[1] ?? 9, f.j[3]?.[1] ?? 9, f.j[4]?.[1] ?? 9);
  const floorFoot = pct(pre.map(footMin), 0.1);
  let hipsUp = -1, feetOff = -1, feetOn = -1, apexI = L, apexY = -1;
  for (let i = L; i < r.frames.length; i++) {
    const f = r.frames[i]; const hy = f.j[0]?.[1] ?? 0;
    if (hipsUp < 0 && hy > hip0 + 0.03 && f.rp[1] > 0.01) hipsUp = i;
    if (feetOff < 0 && footMin(f) > floorFoot + 0.08) feetOff = i;
    if (feetOff >= 0 && feetOn < 0 && i > feetOff + 5 && footMin(f) <= floorFoot + 0.05) feetOn = i;
    if (feetOn < 0 && hy > apexY) { apexY = hy; apexI = i; }
  }
  const nearApex = r.frames.slice(feetOff >= 0 ? feetOff : L, feetOn >= 0 ? feetOn : r.frames.length).filter((f) => (f.j[0]?.[1] ?? 0) >= apexY - 0.1).length;
  const ms = (i: number) => i >= 0 ? rnd((r.frames[i].t - (r.pressAt ?? tL!)), 0) : null;
  // THE LANDING (Phase 2): touchdown − 12 frames … + 48: clips arriving at ≥ 0.6 weight in one frame (hard cuts), the hips' one-frame
  // pops (the approach's rule), bone pops; and the root's height step on the take-off frame
  const land = { hardCuts: 0, cutNames: [] as string[], hipPops: 0, bonePops: 0 };
  if (feetOn > 0) {
    const a = Math.max(1, feetOn - 12), b2 = Math.min(r.frames.length - 1, feetOn + 48), W2 = r.frames.slice(a - 1, b2 + 1);
    for (let i = 1; i < W2.length; i++) { const prev = new Map(W2[i - 1].clips); for (const [n, wv] of W2[i].clips) if (!prev.has(n) && wv >= 0.6) { land.hardCuts++; land.cutNames.push(n); } }
    const acc: number[] = []; for (let i = 1; i < W2.length - 1; i++) { const p0 = W2[i - 1].j[0], p1 = W2[i].j[0], p2 = W2[i + 1].j[0]; acc.push(p0 && p1 && p2 ? Math.hypot(p2[0] - 2 * p1[0] + p0[0], p2[1] - 2 * p1[1] + p0[1], p2[2] - 2 * p1[2] + p0[2]) / (DT * DT) : 0); }
    for (let i = 3; i < acc.length - 3; i++) { const nb = [...acc.slice(i - 3, i), ...acc.slice(i + 1, i + 4)]; if (acc[i] > 40 && acc[i] > 3.5 * Math.max(pct(nb, 0.5), 4)) land.hipPops++; }
    for (let bI = 0; bI < QN.length; bI++) { const w: number[] = []; for (let i = 1; i < W2.length; i++) w.push(qAngDeg(W2[i].q.slice(bI * 4, bI * 4 + 4), W2[i - 1].q.slice(bI * 4, bI * 4 + 4)) / DT); for (let i = 3; i < w.length - 3; i++) { const nb = [...w.slice(i - 3, i), ...w.slice(i + 1, i + 4)]; if (w[i] >= 600 && w[i] >= 3.5 * Math.max(pct(nb, 0.5), 30)) land.bonePops++; } }
  }
  const rootStepCm = L > 0 ? rnd(Math.abs(r.frames[L].rp[1] - r.frames[L - 1].rp[1]) * 100, 1) : null;
  const hipsStepCm = L > 0 && r.frames[L].j[0] && r.frames[L - 1].j[0] ? rnd(Math.abs(r.frames[L].j[0]![1] - r.frames[L - 1].j[0]![1]) * 100, 1) : null;
  return {
    pressToLaunchMs: r.pressAt != null ? rnd(tL! - r.pressAt, 0) : null,
    pressToHipsUpMs: r.pressAt != null ? ms(hipsUp) : null, pressToFeetOffMs: r.pressAt != null ? ms(feetOff) : null,
    launchToFeetOffMs: feetOff >= 0 ? rnd(r.frames[feetOff].t - tL!, 0) : null,
    hangMs: feetOff >= 0 && feetOn >= 0 ? rnd(r.frames[feetOn].t - r.frames[feetOff].t, 0) : null,
    apexOverRunwayM: rnd(apexY - hip0), nearApexMs: rnd(nearApex * 1000 / 60, 0),
    apexMsAfterOff: feetOff >= 0 ? rnd(r.frames[apexI].t - r.frames[feetOff].t, 0) : null,
    timeScaleMin: rnd(Math.min(...r.frames.slice(L).map((f) => f.ts)), 2),
    land: { ...land, cutNames: [...new Set(land.cutNames)] }, takeoffRootStepCm: rootStepCm, takeoffHipsStepCm: hipsStepCm,
  };
}

/** The lob: the ball's free flight (unparented), its apex and length, the hand's gap to it, the verdict. */
function lobMetrics(r: Rec) {
  const thrown = r.marks.find((m) => /^\[LOB\] .*(from|OFF-GLASS|BOUNCE)/.test(m.msg) && !/RUN cue|glass =/.test(m.msg));
  const caught = r.marks.find((m) => /^\[LOB\] CAUGHT/.test(m.msg)); const lost = r.marks.find((m) => /^\[LOB\] LOST/.test(m.msg));
  if (!thrown) return null;
  const i0 = idxAt(r, thrown.t), i1 = caught ? idxAt(r, caught.t) : lost ? idxAt(r, lost.t) : r.frames.length - 1;
  const fl = r.frames.slice(i0, Math.max(i0 + 1, i1));
  const ys = fl.map((f) => f.ball?.[1] ?? 0);
  // the hand nearest the ball through the last 0.3 s before the catch / the loss
  const gaps = fl.slice(-18).map((f) => f.ball ? Math.min(...[5, 6].map((h) => f.j[h] ? Math.hypot(f.j[h]![0] - f.ball![0], f.j[h]![1] - f.ball![1], f.j[h]![2] - f.ball![2]) : 9)) : 9);
  const catchClip = caught ? Number(/@([\d.]+)/.exec(caught.msg)?.[1] ?? NaN) : null;
  // speed of the ball at the catch (how hard it arrives into the hand)
  const last = fl.slice(-3); const vIn = last.length >= 2 && last[0].ball && last[last.length - 1].ball ? Math.hypot(...[0, 1, 2].map((k) => last[last.length - 1].ball![k] - last[0].ball![k])) / ((last.length - 1) * DT) : NaN;
  const to = /to \(([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(thrown.msg); const catchY = to ? Number(to[2]) : NaN;
  const ringShare = fl.filter((f) => ((f.lv ?? 0) & 1) === 1).length / Math.max(1, fl.length), shadowShare = fl.filter((f) => ((f.lv ?? 0) & 2) === 2).length / Math.max(1, fl.length);
  const ringAfter = r.frames.slice(i1 + 25, i1 + 60).filter((f) => ((f.lv ?? 0) & 1) === 1).length;   // still up 0.4–1 s after the catch?
  return { catchY: rnd(catchY), apexOverCatchM: rnd(Math.max(...ys) - catchY), ringShare: rnd(ringShare), shadowShare: rnd(shadowShare), ringLingerFrames: ringAfter, onRun: r.marks.some((m) => /lobs it on the run/.test(m.msg)),
    label: /\[LOB\] ([A-Z-' ]+?) (from|at|OFF)/.exec(thrown.msg)?.[1] ?? thrown.msg.slice(6, 30), caught: !!caught, lost: !!lost, flightMs: rnd(fl.length * 1000 / 60, 0), apexM: rnd(Math.max(...ys)),
    catchClipT: catchClip, gapMinM: rnd(Math.min(...gaps)), gapAtEndM: rnd(gaps[gaps.length - 1]), arriveMps: rnd(vIn, 1), reaimed: r.marks.some((m) => /re-aimed/.test(m.msg)) };
}

/** What the slam made the player perceive (the QA trace) and the camera's cuts. */
function showMetrics(r: Rec) {
  const tL = markT(r, /\[DUNK-LAUNCH\]/); const L = idxAt(r, tL);
  const fr = r.frames.slice(Math.max(0, L));
  let camCuts = 0; const cutAt: number[] = [];
  for (let i = 1; i < fr.length; i++) { const dp = Math.hypot(fr[i].cam[0] - fr[i - 1].cam[0], fr[i].cam[1] - fr[i - 1].cam[1], fr[i].cam[2] - fr[i - 1].cam[2]); const dt = Math.hypot(fr[i].tgt[0] - fr[i - 1].tgt[0], fr[i].tgt[1] - fr[i - 1].tgt[1], fr[i].tgt[2] - fr[i - 1].tgt[2]); if (dp > 0.6 || dt > 0.8) { camCuts++; cutAt.push(Math.round((fr[i].t - tL!) )); } }
  const juice: Record<string, number> = {}; for (const e of r.qa) if (e.kind === 'juice' || e.kind === 'sfx') { const k = `${e.kind}:${e.name}`; juice[k] = (juice[k] ?? 0) + 1; }
  const contact = r.marks.find((m) => /\[JUICE-SOFT\] contact|\[HANDS\] contact|CONTACT/.test(m.msg));
  const made = r.marks.some((m) => /\[DUNK-SLAM\].*(MADE|made|flush)|\[HANDS\] through the net/.test(m.msg));
  const slam = r.marks.find((m) => /\[DUNK-SLAM\]/.test(m.msg));
  return { camCuts, cutAtMs: cutAt.slice(0, 12), juice, made, slam: slam?.msg.slice(0, 120) ?? null, contactMs: contact && tL ? rnd(contact.t - tL, 0) : null,
    replay: r.marks.filter((m) => /REPLAY|DUNK-SHOW|DUNK-CAM/.test(m.msg)).map((m) => `${Math.round(m.t - (tL ?? 0))} ${m.msg.slice(0, 80)}`).slice(0, 10) };
}

/** A trick's body-local path: hands, feet, head relative to the hips in the root's yaw frame, 24 samples launch → +1.3 s. */
function trickPath(r: Rec): number[] | null {
  const L = idxAt(r, markT(r, /\[DUNK-LAUNCH\]/)); if (L < 0) return null;
  const fr = r.frames.slice(L, L + 78); if (fr.length < 60) return null;
  const out: number[] = [];
  for (let s = 0; s < 24; s++) {
    const f = fr[Math.round(s * (fr.length - 1) / 23)]; const hp = f.j[0]!; const c = Math.cos(-f.yaw), sn = Math.sin(-f.yaw);
    for (const ji of [5, 6, 1, 2, 7]) { const p = f.j[ji]; if (!p) { out.push(0, 0, 0); continue; } const dx = p[0] - hp[0], dz = p[2] - hp[2]; out.push(dx * c - dz * sn, p[1] - hp[1], dx * sn + dz * c); }
  }
  return out;
}

let browser: Browser | null = null;   // launched on first use: a FROM_REC re-measure opens no browser
const getBrowser = async (): Promise<Browser> => (browser ??= await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }));
const summary: Record<string, unknown> = { base: BASE, page: PAGE, seed: SEED, at: new Date().toISOString() };
try {
  for (const scen of SCEN) {
    console.log(`[${scen}]`);
    const recFile = path.join(OUT, `rec-${scen}.json`);
    const recs: Rec[] = process.env.FROM_REC === '1' && fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, 'utf8')) : await runScen(await getBrowser(), scen, REPS);
    fs.writeFileSync(path.join(OUT, `rec-${scen}.json`), JSON.stringify(recs));
    const rows = recs.map((r) => r.err ? { scen: r.scen, rep: r.rep, err: r.err } : { scen: r.scen, rep: r.rep, approach: approachMetrics(r), flight: flightMetrics(r), lob: lobMetrics(r), show: showMetrics(r), hud: r.hud.slice(0, 30) });
    if (scen === 'tricks') {
      const paths = recs.map((r) => ({ id: r.scen.slice(6), p: r.err ? null : trickPath(r), fired: r.marks.filter((m) => /\[DUNK-CUE\]|\[DUNK-TRICK\]/.test(m.msg)).map((m) => m.msg.slice(0, 90)) }));
      const ok = paths.filter((x) => x.p);
      const nn = ok.map((x) => { let best = ''; let bd = Infinity; for (const y of ok) { if (y === x) continue; let s = 0; for (let k = 0; k < x.p!.length; k++) s += (x.p![k] - y.p![k]) ** 2; const d = Math.sqrt(s / (x.p!.length / 3)); if (d < bd) { bd = d; best = y.id; } } return { id: x.id, nearest: best, rmsM: rnd(bd, 3), fired: x.fired.slice(0, 3) }; });
      summary.tricks = nn.sort((x, y) => (x.rmsM ?? 0) - (y.rmsM ?? 0));
    }
    summary[scen] = rows;
    fs.writeFileSync(path.join(OUT, `summary-${scen}.json`), JSON.stringify({ [scen]: rows, ...(scen === 'tricks' ? { tricks: summary.tricks } : {}) }, null, 1));   // one per scenario: a later run of another one keeps it
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  }
} finally { if (browser) await browser.close(); }
console.log(`[done] ${OUT}/summary.json`);
