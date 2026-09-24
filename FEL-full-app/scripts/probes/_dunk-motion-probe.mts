// _dunk-motion-probe — every dunk as MOTION, not as a verdict (DUNK MOTION pass, owner 2026-09-23: "all of the dunks need
// work, smoothening out, sharpening for accuracy in name and style. The body movement looks unnatural").
//
// The lab (_dunk-lab) says whether a named dunk fired and what the judges paid. It cannot say whether the body moved
// like a person. This records the FINAL DRAWN POSE of every bone on every rendered frame of a real attempt (after the
// clips, the posture layer, the spin layer, the reach IK — whatever the player saw), then:
//
//   1. MEASURES it (node side): smoothness of every end effector (SPARC on the body-local speed), single-frame pops
//      (a bone's angular speed spiking over its neighbours), held bones (a thoracic chain frozen in the air), locked
//      elbows / knees, the ball against the palm, the hand against the rim at the contact, and the beat timings.
//   2. REPLAYS it frozen (a second page, same body): the render loop stopped, animations off, the recorded pose written
//      onto the hero frame by frame and photographed from a fixed SIDE view and a FRONT 3/4 view — so a sheet shows the
//      real pose at the real moment, with no screenshot latency and no game camera cutting away.
//
//   BASE=http://127.0.0.1:3011 TAG=base TRICKS=all npx tsx scripts/probes/_dunk-motion-probe.mts
//   TRICKS=windmill,tomahawk,plain,rw:backflip   (air ids as in DUNK_TRICKS; 'plain' = no call; rw:<id> = a runway beat)
//   SCRUB=0  — numbers only, no sheets        PER_PAGE=4 — attempts per contest page
//   FROM_REC=<dir> — skip the recording, re-measure / re-sheet recordings already on disk
import { chromium, type Page, type Browser } from 'playwright-core';
import fs from 'node:fs';
import sharp from 'sharp';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const TAG = process.env.TAG ?? 'run';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/dunkmotion/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
const SCRUB = process.env.SCRUB !== '0';
const PER_PAGE = Number(process.env.PER_PAGE ?? 4);
const QS = process.env.QS ?? '';
const FROM_REC = process.env.FROM_REC ?? '';

type Dir = 'up' | 'down' | 'left' | 'right'; type Btn = 'A' | 'B' | 'X' | 'Y';
const AIR: Record<string, [Dir, Btn]> = {
  windmill: ['up', 'A'], tomahawk: ['up', 'Y'], tap: ['up', 'B'], windmill360: ['up', 'X'],
  spin360: ['right', 'B'], scorpion: ['right', 'Y'], cradle: ['right', 'A'], fakeeastbay: ['right', 'X'],
  eastbay: ['down', 'Y'], betweenlegs: ['down', 'B'], clutch: ['down', 'A'], doubleeastbay: ['down', 'X'],
  lostfound: ['left', 'B'], hideseek: ['left', 'A'], behindback: ['left', 'Y'], fakeback: ['left', 'X'],
};
const RUNWAY: Record<string, [Btn, Dir | null]> = { selflob: ['Y', null], kickup: ['B', null], cartwheel: ['X', null], doubleup: ['A', null], backflip: ['B', 'up'] };
const ALL = ['plain', 'plainJ', ...Object.keys(AIR), ...Object.keys(RUNWAY).map((r) => `rw:${r}`)];
const TRICKS = (process.env.TRICKS ?? 'all') === 'all' ? ALL : (process.env.TRICKS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
for (const t of TRICKS) if (t !== 'plain' && t !== 'plain2' && t !== 'plainJ' && !AIR[t] && !(t.startsWith('rw:') && RUNWAY[t.slice(3)])) throw new Error(`unknown trick ${t} (have ${ALL.join(', ')})`);

const RIM = { x: 0, y: 3.05, z: -10.28 };
const JN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const J = Object.fromEntries(JN.map((n, i) => [n, i])) as Record<string, number>;

interface Frame { t: number; rp: number[]; rq: number[] | null; rr: number[]; rs: number[]; q: number[]; hp?: number[]; j: (number[] | null)[]; ball?: number[]; bpar?: string; clips?: [string, number][]; pw?: string }
interface Rec { trick: string; names: string[]; frames: Frame[]; marks: { t: number; msg: string }[]; t0: number; launchAt: number | null; hud: string[] }

// ── in-page recorder ────────────────────────────────────────────────────────────────────────────────────────────────
const RECORDER = `(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene;
  const S = window.__smp = { marks: [] };
  const markRe = /^\\[(DUNK-[A-Z-]+|LOB|HANDS|JUICE-SOFT|FEL-DUNK)/;
  for (const k of ['info', 'log', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { const s = String(a[0]); if (markRe.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 220) }); o(...a); }; }
  const R = window.__rec = { on: false, frames: [], names: null, rootRef: null, nodes: null, jIdx: null };
  const JN = ${JSON.stringify(JN)};
  const clean = (n) => n.replace(/^mixamorig:?/, '').replace(/_c\\d+$/, '');
  const bind = (root) => {
    const sk = scene.skeletons.find((s) => s.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(root); }));
    const nodes = sk ? sk.bones.map((b) => b.getTransformNode()).filter(Boolean) : [];
    R.nodes = nodes; R.names = nodes.map((n) => n.name); R.rootRef = root;
    R.jIdx = JN.map((j) => nodes.findIndex((n) => clean(n.name) === j));
    R.targets = new Set(nodes);
  };
  let ballRef = null;
  const findBall = () => { if (ballRef && !ballRef.isDisposed()) return ballRef; ballRef = scene.meshes.find((m) => m.name === 'ball' && m.metadata && m.metadata.felPalmMirrorLeft) || null; return ballRef; };
  const r5 = (v) => Math.round(v * 1e5) / 1e5, r4 = (v) => Math.round(v * 1e4) / 1e4;
  scene.onAfterRenderObservable.add(() => {
    if (!R.on) return;
    const h = dev.hero(); if (!h) return; let root = h; while (root.parent) root = root.parent;
    if (R.rootRef !== root) bind(root);
    const f = { t: performance.now() };
    const rp = root.position, rq = root.rotationQuaternion;
    f.rp = [r4(rp.x), r4(rp.y), r4(rp.z)]; f.rq = rq ? [r5(rq.x), r5(rq.y), r5(rq.z), r5(rq.w)] : null; f.rr = [r5(root.rotation.x), r5(root.rotation.y), r5(root.rotation.z)]; f.rs = [r4(root.scaling.x), r4(root.scaling.y), r4(root.scaling.z)];
    const q = [];
    for (const n of R.nodes) { const r = n.rotationQuaternion; if (r) q.push(r5(r.x), r5(r.y), r5(r.z), r5(r.w)); else q.push(0, 0, 0, 1); }
    f.q = q;
    const hi = R.jIdx[0]; if (hi >= 0) { const hp = R.nodes[hi].position; f.hp = [r5(hp.x), r5(hp.y), r5(hp.z)]; }
    f.j = R.jIdx.map((i) => { if (i < 0) return null; const a = R.nodes[i].getAbsolutePosition(); return [r4(a.x), r4(a.y), r4(a.z)]; });
    const b = findBall(); if (b) { const a = b.getAbsolutePosition(); f.ball = [r4(a.x), r4(a.y), r4(a.z)]; f.bpar = b.parent ? b.parent.name : ''; }
    f.clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations.some((t) => R.targets.has(t.target))).map((g) => { const a = g.animatables && g.animatables[0]; const w = a && typeof a.weight === 'number' && a.weight >= 0 ? a.weight : (g.weight >= 0 ? g.weight : 1); return [g.name, Math.round(w * 100) / 100]; }).filter((c) => c[1] > 0.02);
    try { const pp = dev.dunkPosture && dev.dunkPosture.get && dev.dunkPosture.get(); if (pp) f.pw = String(pp.window || ''); } catch (e) {}
    R.frames.push(f);
    if (R.frames.length > 1500) R.frames.shift();
  });
  window.__hud = () => { try { return JSON.parse(document.querySelector('pre').textContent || '{}'); } catch (e) { return {}; } };
  window.__HUDLOG = []; let last = '';
  setInterval(() => { const h = window.__hud(); const s = [h.banner, h.slamTiming, h.hint].filter(Boolean).join(' | '); if (s && s !== last) { last = s; window.__HUDLOG.push({ t: performance.now(), s }); } }, 50);
  // the slam, pressed IN the page on the window's own tell (NOW!) — a node round trip is a third of the window
  window.__slamAt = null;
  window.__armSlam = () => {
    window.__slamAt = null; const t0 = performance.now();
    const tick = () => {
      if (performance.now() - t0 > 4000) return;
      if (window.__hud().hint !== 'NOW!') { requestAnimationFrame(tick); return; }
      const b = window.__PAD.buttons[0]; b.pressed = true; b.value = 1; window.__PAD.timestamp = performance.now(); window.__slamAt = performance.now();
      setTimeout(() => { b.pressed = false; b.value = 0; window.__PAD.timestamp = performance.now(); }, 60);
    };
    requestAnimationFrame(tick);
  };
})()`;

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.__name = window.__name || function (f) { return f; };
})()`;

async function boot(b: Browser, recorder: boolean): Promise<{ p: Page; errors: string[] }> {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|gamepad/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`${BASE}/dev/mode/dunk${QS ? '?' + QS : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 120000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  if (recorder) await p.evaluate(RECORDER);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, errors };
}
const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
async function btn(p: Page, b: Btn, on: boolean): Promise<void> { await padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`); }
async function tapBtn(p: Page, b: Btn, ms = 70): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
async function dpad(p: Page, d: Dir, on: boolean): Promise<void> { await padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`); }
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;
async function waitApproach(p: Page, ms = 30000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await text(p);
    if (/HOLD to run|Pick your PROP|FINAL ROUND/.test(t) && !/SLAM!|CONFER|CARD|RIVAL ROUND/.test(t)) return true;
    if (/CONTEST|result/.test(t) && !/· playing/.test(t)) return false;
    await p.waitForTimeout(120);
  }
  return false;
}

async function attempt(p: Page, trick: string): Promise<Rec | null> {
  if (!(await waitApproach(p))) return null;
  await p.waitForTimeout(400);
  const t0 = await p.evaluate('(() => { window.__rec.frames = []; window.__rec.on = true; return performance.now(); })()') as number;
  const launchedAt = async (): Promise<number | null> => p.evaluate(`(() => { const m = window.__smp.marks.find((m) => m.t >= ${t0} && /JUICE-SOFT\\] launch|\\[DUNK-LAUNCH\\]/.test(m.msg)); return m ? m.t : null; })()`) as Promise<number | null>;
  // DUNK MOTION phase 8 (decision "triangle commits"): the self-lob is thrown STANDING (Y on the run is the attempt, the J)
  if (trick === 'rw:selflob') { await tapBtn(p, 'Y', 60); await p.waitForTimeout(120); }
  await padSet(p, 'p.axes[1] = -1; p.buttons[7].pressed = true; p.buttons[7].value = 1');
  // plain2: the same run with GATHER (L2) held — the two-foot take-off
  if (trick === 'plain2') await padSet(p, 'p.buttons[6].pressed = true; p.buttons[6].value = 1');
  const hold0 = Date.now(); let threw = !trick.startsWith('rw:') || trick === 'rw:selflob'; let launch: number | null = null;
  let committed = trick !== 'plainJ';   // plainJ: the plain run with the J committed on triangle early in the run
  while (Date.now() - hold0 < 3600) {
    // the double-up is only a double-up inside its window (DOUBLE_UP_WINDOW_M): press it on the game's own prompt, not on a
    // clock — at 700 ms a slower run-up was 3.39 m out, the A took off from there, and the slam after it was the ignored second press
    const dblReady = trick === 'rw:doubleup' ? /DOUBLE-UP/.test(String((await p.evaluate('window.__hud().hint || ""')) ?? '')) : true;
    if (!committed && Date.now() - hold0 >= 350) { committed = true; await tapBtn(p, 'Y', 60); }
    if (!threw && Date.now() - hold0 >= 700 && dblReady) {
      threw = true; const [b, d] = RUNWAY[trick.slice(3)];
      if (d) { await dpad(p, d, true); await p.waitForTimeout(60); }
      await tapBtn(p, b, 60);
      if (d) { await p.waitForTimeout(40); await dpad(p, d, false); }
    }
    launch = await launchedAt(); if (launch) break;
    await p.waitForTimeout(25);
  }
  await padSet(p, 'p.axes[1] = 0; p.buttons[7].pressed = false; p.buttons[7].value = 0; p.buttons[6].pressed = false; p.buttons[6].value = 0');
  if (!launch) { const r0 = Date.now(); while (!launch && Date.now() - r0 < 2000) { await p.waitForTimeout(40); launch = await launchedAt(); } }
  if (!launch) { await p.evaluate('window.__rec.on = false'); console.log(`  ${trick}: never launched`); return null; }
  const air = AIR[trick];
  if (air) { await dpad(p, air[0], true); await p.waitForTimeout(80); await tapBtn(p, air[1], 60); await p.waitForTimeout(50); await dpad(p, air[0], false); }
  await p.evaluate('window.__armSlam()');
  const end = launch + 3600;
  while ((await p.evaluate('performance.now()') as number) < end) await p.waitForTimeout(100);
  const rec = await p.evaluate(`(() => { const R = window.__rec; R.on = false; return { names: R.names, frames: R.frames, marks: window.__smp.marks.filter((m) => m.t >= ${t0}), hud: window.__HUDLOG.filter((h) => h.t >= ${t0}).map((h) => h.s) }; })()`) as { names: string[]; frames: Frame[]; marks: { t: number; msg: string }[]; hud: string[] };
  return { trick, t0, launchAt: launch, ...rec };
}

// ── measurement ─────────────────────────────────────────────────────────────────────────────────────────────────────
type V = [number, number, number];
const sub = (a: number[], b: number[]): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angleAt = (a: number[], m: number[], b: number[]) => { const u = sub(a, m), v = sub(b, m); return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v) || 1)))) * 180) / Math.PI; };
function fft(re: number[], im: number[]): void {   // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let size = 2; size <= n; size <<= 1) {
    const ang = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) for (let k = 0; k < size / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      const xr = re[i + k + size / 2] * wr - im[i + k + size / 2] * wi, xi = re[i + k + size / 2] * wi + im[i + k + size / 2] * wr;
      re[i + k + size / 2] = re[i + k] - xr; im[i + k + size / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
}
/** SPARC (Balasubramanian 2015): the spectral arc length of a speed profile. ~−1.5 is a single smooth reach; more negative is jerkier. */
function sparc(speed: number[], fs: number, fc = 10, amp = 0.05, pad = 4): number {
  if (speed.length < 8) return NaN;
  const nfft = 1 << (Math.ceil(Math.log2(speed.length)) + pad);
  const re = new Array(nfft).fill(0), im = new Array(nfft).fill(0);
  speed.forEach((v, i) => { re[i] = v; });
  fft(re, im);
  const mag = re.map((r, i) => Math.hypot(r, im[i]));
  const mx = Math.max(...mag.slice(0, nfft / 2)) || 1;
  const df = fs / nfft; const sel: number[] = [];
  for (let i = 0; i * df <= fc && i < nfft / 2; i++) sel.push(mag[i] / mx);
  let last = 0; sel.forEach((m, i) => { if (m >= amp) last = i; });
  const cut = sel.slice(0, last + 1);
  let s = 0; for (let i = 1; i < cut.length; i++) s += Math.hypot(df / fc, cut[i] - cut[i - 1]);
  return -s;
}
function yawOf(f: Frame): number {
  if (f.rq) { const [x, y, z, w] = f.rq; return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x)); }
  return f.rr[1];
}
/** A world point in the root's frame (x right, y up, z forward), yaw only. */
function local(f: Frame, p: number[]): V {
  const d = sub(p, f.rp); const a = -yawOf(f); const c = Math.cos(a), s = Math.sin(a);
  return [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c];
}
function qAngleDeg(a: number[], b: number[]): number { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI; }

export interface Metrics {
  trick: string; frames: number; fps: number; flightMs: number; launchToLandMs: number | null;
  beats: Record<string, number>;
  clips: string[];
  sparc: Record<string, number>; sparcMean: number;
  pops: { bone: string; atMs: number; degPerSec: number; clip: string }[];
  /** Frames on which an arm / leg bone turned faster than 1500°/s in the air (an authored swing too fast for a body). */
  whips: number;
  /** The run-up (last 1.5 s): frames, chicken-wing frames (an elbow at shoulder height and > 0.15 m out), mean elbow angle. */
  runFrames: number; runWing: number; ballScreenRight: number | null; runElbowMean: number | null;
  heldFrac: Record<string, number>;
  lockedElbow: number; lockedKnee: number;
  ballGapP90: number | null; ballGapMax: number | null; ballFar: number;
  rimHandAtContact: number | null; ballRimAtContact: number | null;
  slam: string;
}
export function measure(rec: Rec): Metrics {
  const L = rec.launchAt ?? rec.frames[0]?.t ?? 0;
  const markAt = (re: RegExp) => rec.marks.find((m) => re.test(m.msg))?.t ?? null;
  // the flight window: 0.3 s before the launch → 0.5 s after the feet are back down
  const post = rec.frames.filter((f) => f.t >= L);
  const landF = post.find((f, i) => i > 10 && f.t - L > 350 && f.rp[1] < 0.03);
  const landAt = landF ? landF.t : null;
  // the flight ends at the CONTACT: the mode hands the root to the instant replay a beat later (a teleport back up the
  // runway, by design), so nothing after contact + 250 ms is the live body
  const contact0 = markAt(/\[HANDS\] (contact|iron contact)/);
  const flightEnd = contact0 != null ? contact0 + 250 : (landAt ?? L + 1800) + 300;
  const win = rec.frames.filter((f) => f.t >= L - 300 && f.t <= flightEnd);
  const dtAvg = win.length > 1 ? (win[win.length - 1].t - win[0].t) / (win.length - 1) : 16.7;
  const fs = 1000 / dtAvg;
  const eff: Record<string, number> = { RightHand: J.RightHand, LeftHand: J.LeftHand, RightFoot: J.RightFoot, LeftFoot: J.LeftFoot, Head: J.Head, RightForeArm: J.RightForeArm, LeftForeArm: J.LeftForeArm, LeftLeg: J.LeftLeg, RightLeg: J.RightLeg };
  const sp: Record<string, number> = {};
  for (const [name, ji] of Object.entries(eff)) {
    const pts = win.map((f) => (f.j[ji] ? local(f, f.j[ji]!) : null));
    const speed: number[] = [];
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (!a || !b) continue; const dt = (win[i].t - win[i - 1].t) / 1000 || 1 / 60; speed.push(len(sub(b, a)) / dt); }
    sp[name] = +sparc(speed, fs).toFixed(2);
  }
  const vals = Object.values(sp).filter((v) => isFinite(v));
  // pops: a ONE- OR TWO-FRAME spike — ≥ 600°/s, ≥ 3.5× the median of its ±6-frame neighbourhood, and ≥ 3× the speed 3 frames
  // either side (a fast authored swing is a bell several frames wide; a snap is a spike). whips: a limb past 1500°/s at all.
  const nb = rec.names.length; const pops: Metrics['pops'] = []; let whips = 0;
  const watch = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
  const idxOf = (n: string) => rec.names.findIndex((x) => x.replace(/^mixamorig:?/, '').replace(/_c\d+$/, '') === n);
  const held: Record<string, number> = {};
  for (const bn of watch) {
    const bi = idxOf(bn); if (bi < 0 || bi >= nb) continue;
    const w: number[] = [];
    for (let i = 1; i < win.length; i++) { const a = win[i - 1].q.slice(bi * 4, bi * 4 + 4), b = win[i].q.slice(bi * 4, bi * 4 + 4); const dt = (win[i].t - win[i - 1].t) / 1000 || 1 / 60; w.push(qAngleDeg(a, b) / dt); }
    for (let i = 0; i < w.length; i++) {
      const nbh = w.slice(Math.max(0, i - 6), i).concat(w.slice(i + 1, i + 7)).sort((a, b) => a - b);
      const med = nbh[Math.floor(nbh.length / 2)] ?? 0;
      const side = Math.max(w[i - 3] ?? 0, w[i + 3] ?? 0);
      if (/Arm|Leg|Hand|Foot/.test(bn) && w[i] > 1500 && win[i + 1].t >= L && win[i + 1].t <= flightEnd - 250) whips++;
      if (w[i] >= 600 && w[i] >= 3.5 * Math.max(med, 60) && w[i] >= 3 * side) pops.push({ bone: bn, atMs: Math.round(win[i + 1].t - L), degPerSec: Math.round(w[i]), clip: (win[i + 1].clips ?? []).map((c) => `${c[0]}:${c[1]}`).join('+') });
    }
    // held: inside the AIR only (launch → land), angular speed under 8°/s
    const airIdx = win.map((f, i) => (f.t >= L + 50 && f.t <= flightEnd - 250 ? i : -1)).filter((i) => i > 0);
    const still = airIdx.filter((i) => w[i - 1] !== undefined && w[i - 1] < 8).length;
    held[bn] = airIdx.length ? +(still / airIdx.length).toFixed(2) : 0;
  }
  let lockedElbow = 0, lockedKnee = 0;
  const air = win.filter((f) => f.t >= L && f.t <= flightEnd - 250);
  for (const f of air) {
    const e = (a: string, m: string, b: string) => (f.j[J[a]] && f.j[J[m]] && f.j[J[b]] ? angleAt(f.j[J[a]]!, f.j[J[m]]!, f.j[J[b]]!) : 0);
    if (e('RightArm', 'RightForeArm', 'RightHand') > 172 || e('LeftArm', 'LeftForeArm', 'LeftHand') > 172) lockedElbow++;
    if (e('RightUpLeg', 'RightLeg', 'RightFoot') > 176 || e('LeftUpLeg', 'LeftLeg', 'LeftFoot') > 176) lockedKnee++;
  }
  // THE RUN-UP ARMS (owner, 2026-09-23: "fix the arms when running too"): the last 1.5 s before the take-off. A WING frame is an
  // elbow at (or over) its shoulder's height AND more than 0.15 m out to the side of it — the chicken wing; plus the mean elbow angle.
  const run = rec.frames.filter((f) => f.t >= L - 1500 && f.t <= L - 100);
  let runWing = 0, elbowSum = 0, elbowN = 0;
  for (const f of run) {
    let wing = false;
    for (const sd of ['Left', 'Right']) {
      const S = f.j[J[sd + 'Arm']], E = f.j[J[sd + 'ForeArm']], H = f.j[J[sd + 'Hand']]; if (!S || !E || !H) continue;
      const Sl = local(f, S), El = local(f, E);
      if (El[1] > Sl[1] - 0.05 && Math.abs(El[0]) - Math.abs(Sl[0]) > 0.15) wing = true;
      elbowSum += angleAt(S, E, H); elbowN++;
    }
    if (wing) runWing++;
  }
  // DUNK MOTION phase 8: which side of the SCREEN the ball is on through the run-up. The run heads to −z with the camera behind,
  // so the screen's right is world −x (the spawn renders a body as its model's mirror: the rig's Right hand is on screen LEFT)
  const sided = run.filter((f) => f.ball && f.j[J.Hips] && Math.abs(f.ball[0] - f.j[J.Hips]![0]) > 0.05);
  const ballScreenRight = sided.length ? +(sided.filter((f) => f.ball![0] < f.j[J.Hips]![0]).length / sided.length).toFixed(2) : null;
  // the ball against the palm while it is carried (parented to a hand / a hand socket)
  const held2 = win.filter((f) => f.ball && f.bpar && /hand|palm|socket/i.test(f.bpar));
  const gaps = held2.map((f) => { const hand = /left/i.test(f.bpar!) ? f.j[J.LeftHand] : f.j[J.RightHand]; return hand ? len(sub(f.ball!, hand)) : 0; }).sort((a, b) => a - b);
  const contactAt = markAt(/\[HANDS\] (contact|iron contact)|\[DUNK-SLAM\].*(contact|flush)/);
  const cF = contactAt ? rec.frames.reduce((a, f) => (Math.abs(f.t - contactAt) < Math.abs(a.t - contactAt) ? f : a), rec.frames[0]) : null;
  const handRim = cF ? Math.min(...[cF.j[J.RightHand], cF.j[J.LeftHand]].filter(Boolean).map((h) => len(sub(h!, [RIM.x, RIM.y, RIM.z])))) : null;
  const beats: Record<string, number> = {};
  const addBeat = (k: string, re: RegExp) => { const t = markAt(re); if (t) beats[k] = Math.round(t - L); };
  addBeat('trick', /\[DUNK-TRICK\] air/); addBeat('slam', /\[DUNK-SLAM\]/); addBeat('contact', /\[HANDS\] (contact|iron contact)/); addBeat('flush', /\[HANDS\] through the net/);
  if (landAt) beats.land = Math.round(landAt - L);
  const clips: string[] = []; for (const f of win) { const top = (f.clips ?? []).slice().sort((a, b) => b[1] - a[1])[0]; if (top && clips[clips.length - 1] !== top[0]) clips.push(top[0]); }
  return {
    trick: rec.trick, frames: win.length, fps: +fs.toFixed(1), flightMs: Math.round((landAt ?? L) - L), launchToLandMs: landAt ? Math.round(landAt - L) : null, beats, clips,
    sparc: sp, sparcMean: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : NaN,
    pops, whips, heldFrac: held, lockedElbow, lockedKnee, runFrames: run.length, runWing, ballScreenRight, runElbowMean: elbowN ? Math.round(elbowSum / elbowN) : null,
    ballGapP90: gaps.length ? +gaps[Math.floor(gaps.length * 0.9)].toFixed(3) : null, ballGapMax: gaps.length ? +gaps[gaps.length - 1].toFixed(3) : null, ballFar: gaps.filter((g) => g > 0.2).length,
    rimHandAtContact: handRim != null ? +handRim.toFixed(3) : null, ballRimAtContact: cF?.ball ? +len(sub(cF.ball, [RIM.x, RIM.y, RIM.z])).toFixed(3) : null,
    slam: rec.hud.filter((h) => /EARLY|LATE|ON TIME|EXECUTION|MISS/.test(h)).pop() ?? '',
  };
}

// ── the frozen replay: the recorded pose on a stopped scene, photographed ────────────────────────────────────────────
const SCRUB_INIT = `(() => {
  const dev = window.__FEL_DEV__, s = dev.scene, eng = s.getEngine();
  eng.stopRenderLoop();
  s.animationsEnabled = false;
  for (const k of ['onBeforeRenderObservable', 'onAfterRenderObservable', 'onAfterAnimationsObservable', 'onBeforeAnimationsObservable', 'onBeforeCameraRenderObservable', 'onAfterCameraRenderObservable', 'onBeforeActiveMeshesEvaluationObservable']) { try { s[k].clear(); } catch (e) {} }
  const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}'; document.head.appendChild(st);
  let root = dev.hero(); while (root.parent) root = root.parent;
  const sk = s.skeletons.find((k) => k.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(root); }));
  const byName = new Map(); for (const b of sk.bones) { const n = b.getTransformNode(); if (n) byName.set(n.name.replace(/^mixamorig:?/, '').replace(/_c\\d+$/, ''), n); }
  const ball = s.meshes.find((m) => m.name === 'ball' && m.metadata && m.metadata.felPalmMirrorLeft) || null;
  if (ball) ball.setParent(null);
  // every other body on the court (the rival, the crowd props) stays; only the hero is posed
  window.__scrub = { root, byName, ball, cam: s.activeCamera };
  s.activeCamera.fov = 0.72;
  return { cam: s.activeCamera.getClassName(), bones: sk.bones.length, ball: !!ball };
})()`;
async function scrubPose(p: Page, names: string[], f: Frame, view: 'side' | 'front', runDir: V): Promise<void> {
  await p.evaluate(`((names, f, view, rd) => {
    const S = window.__scrub, s = window.__FEL_DEV__.scene;
    const r = S.root; r.position.set(f.rp[0], f.rp[1], f.rp[2]);
    if (f.rq) { if (!r.rotationQuaternion) r.rotationQuaternion = r.rotation.toQuaternion(); r.rotationQuaternion.set(f.rq[0], f.rq[1], f.rq[2], f.rq[3]); } else { r.rotationQuaternion = null; r.rotation.set(f.rr[0], f.rr[1], f.rr[2]); }
    r.scaling.set(f.rs[0], f.rs[1], f.rs[2]);
    for (let i = 0; i < names.length; i++) { const n = S.byName.get(names[i].replace(/^mixamorig:?/, '').replace(/_c\\d+$/, '')); if (!n) continue; if (!n.rotationQuaternion) n.rotationQuaternion = n.rotation.toQuaternion(); n.rotationQuaternion.set(f.q[i * 4], f.q[i * 4 + 1], f.q[i * 4 + 2], f.q[i * 4 + 3]); }
    const hips = S.byName.get('Hips'); if (hips && f.hp) hips.position.set(f.hp[0], f.hp[1], f.hp[2]);
    if (S.ball && f.ball) S.ball.position.set(f.ball[0], f.ball[1], f.ball[2]);
    r.computeWorldMatrix(true); for (const n of r.getDescendants(false)) n.computeWorldMatrix && n.computeWorldMatrix(true);
    const hp = f.j[0] || f.rp; const tgt = hp.constructor === Array ? { x: hp[0], y: hp[1] + 0.3, z: hp[2] } : hp;
    // SIDE: square to the run (the dunker's right) · FRONT: from the rim side, 40° off the run line, a touch above
    const side = [-rd[2], 0, rd[0]];
    const dir = view === 'side' ? side : [ rd[0] * 0.77 + side[0] * 0.64, 0, rd[2] * 0.77 + side[2] * 0.64 ];
    const D = 5.2, c = S.cam, P = c.position.constructor;
    const pos = new P(tgt.x + dir[0] * D, tgt.y + (view === 'side' ? 0.15 : 0.6), tgt.z + dir[2] * D);
    if (c.setPosition && c.target) { c.target = new P(tgt.x, tgt.y, tgt.z); c.setPosition(pos); } else { c.position.copyFrom(pos); c.setTarget(new P(tgt.x, tgt.y, tgt.z)); }
    // OCCLUDERS: anything between the lens and the body (a parked prop, the backboard from the rim side) is switched off
    // for this frame only — the pose is the subject; the floor and the hoop stay for scale
    for (const m of S.hidden || []) m.setEnabled(true);
    S.hidden = [];
    const Ray = c.getForwardRay(1).constructor;
    for (let k = 0; k < 10; k++) {
      c.computeWorldMatrix(true);
      const from = c.position.clone(), to = new P(tgt.x, tgt.y, tgt.z); const d = to.subtract(from); const L = d.length();
      const hit = s.pickWithRay(new Ray(from, d.normalize(), L - 0.7), (m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && !m.isDescendantOf(r) && m !== S.ball && !(S.ball && m.isDescendantOf(S.ball)), false);
      if (!hit || !hit.hit || !hit.pickedMesh) break;
      hit.pickedMesh.setEnabled(false); S.hidden.push(hit.pickedMesh);
    }
    s.render();
  })(${JSON.stringify(names)}, ${JSON.stringify(f)}, ${JSON.stringify(view)}, ${JSON.stringify(runDir)})`);
}
const CELL_W = 250, CELL_H = 390, COLS = Number(process.env.COLS ?? 12);
/** WIN=air (default): 0.25 s before the take-off → 0.35 s after feet-down · WIN=trick: the trick's fire → 0.3 s past the contact ·
 *  WIN=run: the last 1.5 s of the run-up (the arms while running) · WIN=gather: push 1-2 and the take-off up close. */
const WIN = process.env.WIN ?? 'air';
async function sheet(p: Page, rec: Rec, m: Metrics, file: string): Promise<void> {
  const L = rec.launchAt ?? rec.frames[0].t;
  const land = m.launchToLandMs ?? 1500;
  let t0 = L - 250, t1 = L + land + 350;
  if (WIN === 'trick') { t0 = L + (m.beats.trick ?? 250) - 60; t1 = L + (m.beats.contact ?? land) + 300; }
  if (WIN === 'run') { t0 = L - 1500; t1 = L + 150; }   // the run-up: the dribble run into the gather and the plant
  if (WIN === 'gather') { t0 = L - 450; t1 = L + 200; }   // DUNK MOTION phase 8: push 1-2 up close — the pick-up, the push, 1, 2, the take-off
  const picks: Frame[] = [];
  for (let k = 0; k < COLS; k++) { const t = t0 + ((t1 - t0) * k) / (COLS - 1); picks.push(rec.frames.reduce((a, f) => (Math.abs(f.t - t) < Math.abs(a.t - t) ? f : a), rec.frames[0])); }
  const a = rec.frames.find((f) => f.t >= L - 300) ?? rec.frames[0];
  const d = sub([RIM.x, 0, RIM.z], [a.rp[0], 0, a.rp[2]]); const n = Math.hypot(d[0], d[2]) || 1; const runDir: V = [d[0] / n, 0, d[2] / n];
  const cells: { input: Buffer; left: number; top: number }[] = [];
  for (const [row, view] of (['side', 'front'] as const).entries()) {
    for (const [col, f] of picks.entries()) {
      await scrubPose(p, rec.names, f, view, runDir);
      const png = await p.screenshot({ clip: { x: 640 - CELL_W / 2, y: 400 - CELL_H / 2 - 30, width: CELL_W, height: CELL_H } });
      const top = (f.clips ?? []).slice().sort((x, y) => y[1] - x[1]).slice(0, 2).map((c) => `${c[0].replace(/^dunk_|^bball_/, '')}${c[1] < 0.98 ? ' ' + c[1] : ''}`).join(' / ');
      const label = `<svg width="${CELL_W}" height="${CELL_H}"><rect x="0" y="0" width="${CELL_W}" height="34" fill="rgba(0,0,0,0.72)"/><text x="4" y="14" font-family="monospace" font-size="12" fill="#ffd54a">${view} ${Math.round(f.t - L)} ms ${f.pw ?? ''}</text><text x="4" y="29" font-family="monospace" font-size="10" fill="#e0e0e0">${top.replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 40)}</text></svg>`;
      const cellBuf = await sharp(png).composite([{ input: Buffer.from(label), top: 0, left: 0 }]).png().toBuffer();
      cells.push({ input: cellBuf, left: col * CELL_W, top: 40 + row * CELL_H });
    }
  }
  const title = `<svg width="${COLS * CELL_W}" height="40"><rect width="100%" height="40" fill="#101010"/><text x="8" y="26" font-family="monospace" font-size="20" fill="#fff">${rec.trick.replace(/&/g, '&amp;')} · ${m.clips.join(' → ').replace(/&/g, '&amp;').slice(0, 160)} · SPARC ${m.sparcMean} · pops ${m.pops.length} · ${m.slam.replace(/&/g, '&amp;').slice(0, 40)}</text></svg>`;
  await sharp({ create: { width: COLS * CELL_W, height: 40 + 2 * CELL_H, channels: 3, background: '#000' } }).composite([{ input: Buffer.from(title), top: 0, left: 0 }, ...cells]).png().toFile(file);
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const recs: Rec[] = [];
if (FROM_REC) {
  for (const f of fs.readdirSync(FROM_REC).filter((f) => /^rec-.*\.json$/.test(f))) recs.push(JSON.parse(fs.readFileSync(`${FROM_REC}/${f}`, 'utf8')));
} else {
  let page: { p: Page; errors: string[] } | null = null; let used = 0;
  for (const trick of TRICKS) {
    for (let tries = 0; tries < 2; tries++) {
      if (!page || used >= PER_PAGE) { if (page) await page.p.context().close(); page = await boot(browser, true); used = 0; }
      used++;
      const rec = await attempt(page.p, trick).catch((e) => { console.log(`  ${trick}: ${String(e).slice(0, 160)}`); return null; });
      if (rec && rec.frames.length > 30) { recs.push(rec); fs.writeFileSync(`${OUT}/rec-${trick.replace(/\W+/g, '_')}.json`, JSON.stringify(rec)); break; }
      used = PER_PAGE;   // a contest that stopped answering: a fresh page for the retry
    }
  }
  if (page) { if (page.errors.length) console.log('page errors:', [...new Set(page.errors)].slice(0, 5)); await page.p.context().close(); }
}
const ms = recs.map(measure);
const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(`\n${pad('trick', 16)}${pad('land', 6)}${pad('SPARC', 7)}${pad('pops', 5)}${pad('elb', 5)}${pad('knee', 5)}${pad('ball p90', 9)}${pad('far', 4)}${pad('rimH', 6)}held(Spine2/Neck/Head/LHand)  clips`);
for (const m of ms) console.log(`${pad(m.trick, 16)}${pad(m.launchToLandMs ?? '-', 6)}${pad(m.sparcMean, 7)}${pad(m.pops.length, 5)}${pad(m.lockedElbow, 5)}${pad(m.lockedKnee, 5)}${pad(m.ballGapP90 ?? '-', 9)}${pad(m.ballFar, 4)}${pad(m.rimHandAtContact ?? '-', 6)}${pad([m.heldFrac.Spine2, m.heldFrac.Neck, m.heldFrac.Head, m.heldFrac.LeftHand].join('/'), 29)}${m.clips.join(' → ')}`);
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(ms, null, 1));
if (SCRUB && recs.length) {
  const sp = await boot(browser, false);
  const info = await sp.p.evaluate(SCRUB_INIT);
  console.log('scrub', JSON.stringify(info));
  await sp.p.waitForTimeout(300);
  for (const [i, rec] of recs.entries()) {
    const file = `${OUT}/sheet-${rec.trick.replace(/\W+/g, '_')}.png`;
    await sheet(sp.p, rec, ms[i], file).catch((e) => console.log(`sheet ${rec.trick}: ${String(e).slice(0, 200)}`));
  }
  await sp.p.context().close();
}
await browser.close();
console.log(`\n${recs.length} recordings → ${OUT}`);
