// DUNK-POSTURE-LEGS probe (2026-09-08): the LEGS and the WHOLE-BODY FACING per rendered frame on /dev/mode/dunk. The eye is
// the bar; this is the supporting evidence and the shot list (full-body + profile cards). Off the live rig every frame:
//   part yaw   — root / hips / chest (Spine2) / head / clavicles / thighs / shins / feet, each part's own forward (calibrated
//                once at spawn, where the athlete faces the rim) against the bearing to the rim: a part ~180° off is the
//                early "backwards model" bug surviving as a partial wrong facing
//   knees      — hip–knee–ankle angle (180 = locked straight), thigh drive (the knee's angle forward of straight down)
//   feet       — ankle heights over the root, foot pitch (toes up +), the lateral / fore–aft split between the feet
//   ball       — distance to the nearest hand (the windmill finish's release timing), height
// Gates: L1 legs athletic (approach / plant / hang / land) · L2 full-body facing (jam: hips + chest + feet + head together; no
// part ~180° off plant → land; mid-turn the lower rides the spin) · L3 anim cleanup (windmill release, land T, mid-air T /
// clip-less) · L4 runway ball-carry + PP continuity (no pops) + the replay re-flies L1–L2. Pad driver (pre-boot fake DualShock).
//   PORT=3004 npx tsx scripts/probes/_dunk-legs-probe.mts        (QS=… · SCEN= · OUT_DIR= · TAG= · VERBOSE=1)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const PORT = process.env.PORT ?? '3004', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-legs', TAG = process.env.TAG ?? 'after';
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE;
mkdirSync(OUT, { recursive: true });
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

type Err = { root: number | null; hips: number | null; chest: number | null; head: number | null; lsh: number | null; rsh: number | null; lul: number | null; rul: number | null; ll: number | null; rl: number | null; lf: number | null; rf: number | null };
type Row = { t: number; y: number; ct: number; ph: string; chest: number; trunk: number; open: number; eyes: number; spread: number; lat: number; elb: number; lhy: number; rhy: number; shy: number; kneeL: number; kneeR: number; driveL: number; driveR: number; bendL: number; bendR: number; twistL: number | null; twistR: number | null; footLocL: number; raw: string; ballJump: number; drib: boolean; dribPhase: number; gather: boolean; lhBall: number; ankL: number; ankR: number; pitchL: number | null; pitchR: number | null; feetLat: number; feetFA: number; feetDy: number; ballHand: number; ballY: number; handFA: number; handY: number; err: Err; clips: string[]; win: string; ppw: string; trick: string; replay: boolean; banner: string; hint: string };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';
type Gate = 'L1' | 'L2' | 'L3' | 'L4' | 'A4';
interface Scenario { name: string; prop: 'none' | 'car' | 'selflob'; style?: 'power' | 'flashy' | 'sig'; air?: { at: number; dir?: Dir; btn: Btn }[]; slam?: boolean | 'perfect'; look?: number; gates: Gate[]; spin?: boolean; cards?: boolean }
const S: Scenario[] = [
  { name: 'L1+L2+L4 plain POWER make (approach carry, plant, hang, jam, land)', prop: 'none', look: 0.7, gates: ['L1', 'L2', 'L3', 'L4'], cards: true },
  { name: 'L2 360 at the rise (right+B at +80 ms) — the lower rides the turn, resolves with the chest', prop: 'none', air: [{ at: 80, dir: 'right', btn: 'B' }], gates: ['L1', 'L2', 'L3'], spin: true, cards: true },
  { name: 'L3 WINDMILL FINISH (perfect slam, or QS=finish=windmill) — the ball stays in the hand to the top of the sweep', prop: 'none', slam: process.env.QS?.includes('finish=windmill') ? true : 'perfect', gates: ['L2', 'L3'], cards: true },
  { name: 'L1 SIG eastbay make (the clip\'s own knee drive)', prop: 'none', style: 'sig', look: 0.7, gates: ['L1', 'L2', 'L3', 'L4'], cards: true },
  { name: 'L1 FLASHY launch make (dunk_launch legs)', prop: 'none', style: 'flashy', gates: ['L1', 'L2', 'L3'] },
  { name: 'L1+L2 360 over the CAR (tuck to clear)', prop: 'car', air: [{ at: 80, dir: 'right', btn: 'B' }], gates: ['L1', 'L2', 'L3'], spin: true, cards: true },
  { name: 'L1+L3 plain MISS (no slam) — the brace and the land legs', prop: 'none', slam: false, gates: ['L1', 'L3'], cards: true },
  { name: 'A4 SELF-LOB (d-pad left prop) — the throw, the arc, the catch, the gather', prop: 'selflob', gates: ['L2', 'L3', 'A4'], cards: true },
  { name: 'L2 SCORPION at the hang (right+Y at +100 ms) — trick legs compose', prop: 'none', air: [{ at: 100, dir: 'right', btn: 'Y' }], gates: ['L1', 'L2', 'L3'] },
];

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;
// The in-page sampler: written without template literals so the page code carries no ${}.
const SAMPLER = String.raw`(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene;
  const S = window.__smp = { rows: [], marks: [], replay: false, cal: null };
  const oi = console.info.bind(console), ow = console.warn.bind(console);
  console.info = (...a) => { const s = String(a[0]); if (/^\[(DUNK-WIN|DUNK-LAUNCH|DUNK-PP|DUNK-PROP|DUNK-TRICK|DUNK-CUE|HANDS|JUICE-SOFT|FEL-DUNK|LOB|DUNK-LL)/.test(s)) { S.marks.push({ t: performance.now(), msg: s.slice(0, 180) }); if (/replay air/.test(s)) S.replay = true; if (/replay end/.test(s)) S.replay = false; } oi(...a); };
  console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 180) }); ow(...a); };
  const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
  const RIM = { x: 0, y: 3.05, z: -10.28 };
  let heroSeen = null, N = {}, V3 = null, Q = null;
  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
  const R2D = 180 / Math.PI;
  const NAMES = { Hips: 'Hips', Spine2: 'Spine2', Head: 'Head', LSh: 'LeftShoulder', RSh: 'RightShoulder', LA: 'LeftArm', RA: 'RightArm', LE: 'LeftForeArm', RE: 'RightForeArm', LH: 'LeftHand', RH: 'RightHand', LUL: 'LeftUpLeg', RUL: 'RightUpLeg', LL: 'LeftLeg', RL: 'RightLeg', LF: 'LeftFoot', RF: 'RightFoot', LTB: 'LeftToeBase', RTB: 'RightToeBase' };
  const PARTS = { root: 'ROOT', hips: 'Hips', chest: 'Spine2', head: 'Head', lsh: 'LSh', rsh: 'RSh', lul: 'LUL', rul: 'RUL', ll: 'LL', rl: 'RL', lf: 'LF', rf: 'RF' };
  scene.onBeforeRenderObservable.add(() => {
    const h = dev.hero(); if (!h) return;
    if (h !== heroSeen) { heroSeen = h; S.cal = null; const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\d+|_p\\d+)?$').test(n.name)) ?? null; N = {}; for (const k in NAMES) N[k] = f(NAMES[k]); V3 = h.position.constructor; Q = h.absoluteRotationQuaternion.constructor; }
    if (!N.LA || !N.RA || !N.Hips || !N.Spine2 || !N.Head || !N.LUL || !N.LF) return;
    const fresh = (n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
    h.computeWorldMatrix(true); for (const k in N) if (N[k]) fresh(N[k]);
    const P = (n) => n.getAbsolutePosition();
    const rot = (v, q) => { const o = new V3(v.x, v.y, v.z); return o.rotateByQuaternionToRef(q, o); };
    const nodeOf = (part) => part === 'ROOT' ? h : N[part];
    const toRim = new V3(RIM.x - h.position.x, 0, RIM.z - h.position.z); toRim.normalize();
    const rimB = Math.atan2(toRim.x, toRim.z);
    // calibrate once: every part's own forward, in its local frame, is the direction to the rim at spawn (the athlete faces it)
    if (!S.cal) { S.cal = {}; S.calR = {}; const right = new V3(toRim.z, 0, -toRim.x); for (const k in PARTS) { const n = nodeOf(PARTS[k]); if (!n) continue; const q = n.absoluteRotationQuaternion; S.cal[k] = rot(toRim, Q.Inverse(q)); S.calR[k] = rot(right, Q.Inverse(q)); } }
    const fwdOf = (k) => { const n = nodeOf(PARTS[k]); if (!n || !S.cal[k]) return null; return rot(S.cal[k], n.absoluteRotationQuaternion); };
    const rightOf = (k) => { const n = nodeOf(PARTS[k]); if (!n || !S.calR[k]) return null; return rot(S.calR[k], n.absoluteRotationQuaternion); };
    const rimRight = new V3(toRim.z, 0, -toRim.x);
    const twist = (k) => { const r = rightOf(k); if (!r || Math.hypot(r.x, r.z) < 0.35) return null; return wrap(Math.atan2(r.x, r.z) - Math.atan2(rimRight.x, rimRight.z)) * R2D; };   // the knee hinge axis vs the rim's right: ~180 = the kneecap faces backward
    const bend = (k, knee, ankle) => { const f = fwdOf(k); if (!f) return 0; const v = { x: ankle.x - knee.x, y: ankle.y - knee.y, z: ankle.z - knee.z }; const n = Math.hypot(v.x, v.y, v.z) || 1; return (v.x * f.x + v.y * f.y + v.z * f.z) / n; };   // the shin along the kneecap's forward: ≤ 0 = a normal flexion (heel back), > 0.3 = bent the wrong way
    const err = {};
    for (const k in PARTS) { const f = fwdOf(k); err[k] = f && Math.hypot(f.x, f.z) > 0.35 ? wrap(Math.atan2(f.x, f.z) - rimB) * R2D : null; }
    const hipsF = fwdOf('hips') ?? toRim; const hf = new V3(hipsF.x, 0, hipsF.z); hf.normalize(); const hr = new V3(hf.z, 0, -hf.x);
    const la = P(N.LA), ra = P(N.RA), hips = P(N.Hips), sp2 = P(N.Spine2), head = P(N.Head), lh = N.LH ? P(N.LH) : la, rh = N.RH ? P(N.RH) : ra;
    const lul = P(N.LUL), rul = P(N.RUL), ll = P(N.LL), rl = P(N.RL), lf = P(N.LF), rf = P(N.RF);
    const chestF = fwdOf('chest') ?? hf; const chest = Math.atan2(chestF.x, chestF.z);
    const fx = Math.sin(chest), fz = Math.cos(chest);
    const tr = { x: sp2.x - hips.x, y: sp2.y - hips.y, z: sp2.z - hips.z }; const trunk = Math.atan2(tr.x * fx + tr.z * fz, tr.y) * R2D;
    const nk = { x: head.x - sp2.x, y: head.y - sp2.y, z: head.z - sp2.z }; const neckLean = Math.atan2(nk.x * fx + nk.z * fz, nk.y) * R2D;
    const open = trunk - neckLean;
    const headF = fwdOf('head'); const headEl = headF ? Math.asin(Math.max(-1, Math.min(1, headF.y))) * R2D : 0;
    const rimEl = Math.atan2(RIM.y - head.y, Math.hypot(RIM.x - head.x, RIM.z - head.z)) * R2D;
    const ang = (a, b, c) => { const u = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }, v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z }; const nu = Math.hypot(u.x, u.y, u.z) || 1, nv = Math.hypot(v.x, v.y, v.z) || 1; return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv)))) * R2D; };
    const kneeL = ang(lul, ll, lf), kneeR = ang(rul, rl, rf);
    const drive = (hip, knee) => { const v = { x: knee.x - hip.x, y: knee.y - hip.y, z: knee.z - hip.z }; const fwd = v.x * hf.x + v.z * hf.z; return Math.atan2(fwd, -v.y) * R2D; };   // + = the knee forward of straight down
    const elbow = (a, e, hd) => 180 - ang(a, e, hd);
    const elb = N.LE && N.RE ? Math.min(elbow(la, P(N.LE), lh), elbow(ra, P(N.RE), rh)) : 180;
    const pitch = (k) => { const f = fwdOf(k); return f ? Math.asin(Math.max(-1, Math.min(1, f.y))) * R2D : null; };
    const d = { x: lf.x - rf.x, y: lf.y - rf.y, z: lf.z - rf.z };
    const ball = scene.getMeshByName('ball'); let ballHand = -1, ballY = -1;
    if (ball) { ball.computeWorldMatrix(true); const b = ball.getAbsolutePosition(); ballY = b.y; ballHand = Math.min(Math.hypot(b.x - lh.x, b.y - lh.y, b.z - lh.z), Math.hypot(b.x - rh.x, b.y - rh.y, b.z - rh.z)); }
    const bh = ball && ball.parent ? (rootOf(ball.parent) === h ? (ball.parent.name.startsWith('Left') ? lh : rh) : rh) : rh;
    const handFA = (bh.x - h.position.x) * hf.x + (bh.z - h.position.z) * hf.z;
    const relPt = (pt) => { const dx = pt.x - h.position.x, dz = pt.z - h.position.z; return { f: dx * toRim.x + dz * toRim.z, r: dx * toRim.z - dz * toRim.x, y: pt.y - h.position.y }; };
    const rawOf = (nm, pt) => { const q = relPt(pt); return nm + ' f' + q.f.toFixed(2) + ' r' + q.r.toFixed(2) + ' y' + q.y.toFixed(2); };
    const raw = [rawOf('hipL', lul), rawOf('kneeL', ll), rawOf('ankL', lf), rawOf('kneeR', rl), rawOf('ankR', rf), 'names ' + [N.LUL, N.LL, N.LF].map((n) => n.name + ':' + n.getClassName()).join(',')].join(' | ');
    const bNow = ball ? ball.getAbsolutePosition() : null; const ballJump = bNow && S.lastBall ? Math.hypot(bNow.x - S.lastBall.x, bNow.y - S.lastBall.y, bNow.z - S.lastBall.z) : 0; if (bNow) S.lastBall = { x: bNow.x, y: bNow.y, z: bNow.z };
    const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
    let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
    const pp = dev.dunkPosture ? dev.dunkPosture.get() : { window: '?', trick: null, phase: '?', clipTime: 0, replaying: false, dribble: null, gather: false };
    S.rows.push({ t: performance.now(), y: h.position.y, ct: pp.clipTime ?? 0, ph: pp.phase ?? '?', chest: wrap(chest - rimB) * R2D, trunk, open, eyes: headEl - rimEl,
      spread: Math.hypot(lh.x - rh.x, lh.y - rh.y, lh.z - rh.z), lat: (() => { const ax = ra.x - la.x, az = ra.z - la.z, n = Math.hypot(ax, az) || 1; return Math.abs(((lh.x - rh.x) * ax + (lh.z - rh.z) * az) / n); })(), elb,
      lhy: lh.y - h.position.y, rhy: rh.y - h.position.y, shy: (la.y + ra.y) / 2 - h.position.y,
      kneeL, kneeR, driveL: drive(lul, ll), driveR: drive(rul, rl), bendL: bend('lul', ll, lf), bendR: bend('rul', rl, rf), twistL: twist('lul'), twistR: twist('rul'), footLocL: (() => { const q = N.LF.rotationQuaternion; return q ? Math.acos(Math.min(1, Math.abs(q.w))) * 2 * R2D : -1; })(), ankL: lf.y - h.position.y, ankR: rf.y - h.position.y, pitchL: pitch('lf'), pitchR: pitch('rf'),
      feetLat: Math.abs(d.x * hr.x + d.z * hr.z), feetFA: Math.abs(d.x * hf.x + d.z * hf.z), feetDy: Math.min(lf.y, rf.y) - hips.y,
      ballHand, ballY, handFA, handY: bh.y - h.position.y, err, raw, ballJump, drib: pp.dribble ? pp.dribble.active : false, dribPhase: pp.dribble ? pp.dribble.phase : -1, gather: !!pp.gather, lhBall: ball ? Math.hypot(ball.getAbsolutePosition().x - lh.x, ball.getAbsolutePosition().y - lh.y, ball.getAbsolutePosition().z - lh.z) : -1,
      clips, win: S.marks.filter((m) => /DUNK-WIN/.test(m.msg)).slice(-1)[0]?.msg.slice(11) ?? '', ppw: pp.window, trick: pp.trick ?? '', replay: !!pp.replaying || S.replay, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? '') });
    if (S.rows.length > 40000) S.rows.splice(0, 10000);
  });
})()`;
async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[]; frames: string[] }> {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = []; const frames: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/dev/mode/dunk${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(SAMPLER);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors, frames };
}

const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
const stickUp = (p: Page, on: boolean) => padSet(p, `p.axes[1] = ${on ? -1 : 0}`);
const look = (p: Page, x: number) => padSet(p, `p.axes[2] = ${x}`);
const runHold = (p: Page, on: boolean, v = 1) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`);
const btn = (p: Page, b: Btn, on: boolean) => padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`);
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
const dpad = (p: Page, d: Dir, on: boolean) => padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`);
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
/** A FULL-BODY card: the game keeps running; the camera is overridden just before it renders (a 3/4 or a profile view at hip
 *  height, far enough for the feet and the head), the shot, the camera handed back. */
async function card(p: Page, path: string, angleDeg = 40, dist = 4.4): Promise<void> {
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; }
    const a = ${angleDeg} * Math.PI / 180, dist = ${dist};
    window.__card = scene.onBeforeCameraRenderObservable.add((cam) => {
      const h = dev.hero(); if (!h || cam !== scene.activeCamera) return;
      const yaw = h.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fx * Math.sin(a) + fz * Math.cos(a);
      const c = h.position.clone(); c.y += 1.0;
      cam.position.set(c.x + dx * dist, c.y + 0.25, c.z + dz * dist);
      if (cam.rotationQuaternion) cam.rotationQuaternion = null;
      cam.setTarget(c);
      cam.getViewMatrix(true);
    });
  })()`);
  await p.waitForTimeout(50);
  await p.screenshot({ path });
  await p.evaluate(`(() => { const scene = window.__FEL_DEV__.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; } })()`);
}
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const rows = async (p: Page, a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const lastRow = async (p: Page): Promise<Row> => p.evaluate('window.__smp.rows[window.__smp.rows.length - 1]') as Promise<Row>;
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;
const hudProp = async (p: Page): Promise<string> => p.evaluate(`(() => { try { return JSON.parse(document.querySelector('pre').textContent).prop || ''; } catch { return ''; } })()`) as Promise<string>;
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
let curProp: 'none' | 'car' | 'selflob' = 'none', curStyle: 'power' | 'flashy' | 'sig' = 'power';
async function setProp(p: Page, want: 'none' | 'car' | 'selflob', lines: string[]): Promise<void> {
  if (want === 'none') { await dpad(p, 'up', true); await p.waitForTimeout(90); await dpad(p, 'up', false); }
  else if (want === 'selflob') { await dpad(p, 'left', true); await p.waitForTimeout(90); await dpad(p, 'left', false); }
  else if (curProp !== 'car') { await dpad(p, 'down', true); await p.waitForTimeout(90); await dpad(p, 'down', false); }
  curProp = want;
  await p.waitForTimeout(want === 'none' ? 250 : 1300);
  const shown = await hudProp(p);
  const label = want === 'none' ? 'NO PROP' : want === 'car' ? 'CAR' : 'SELF-LOB';
  lines.push(`${shown === label ? 'PASS' : 'FAIL'}  prop ${want} → HUD "${shown}"`);
}
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2);
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const nn = (a: (number | null)[]): number[] => a.filter((v): v is number => v != null && Number.isFinite(v));
const maxAbs = (a: (number | null)[]) => Math.max(0, ...nn(a).map(Math.abs));
const PART_KEYS: (keyof Err)[] = ['root', 'hips', 'chest', 'head', 'lsh', 'rsh', 'lul', 'rul', 'll', 'rl', 'lf', 'rf'];
const errLine = (r: Row) => PART_KEYS.map((k) => `${k} ${r.err[k] == null ? '—' : f0(r.err[k]!)}`).join(' ');
const worstPart = (rs: Row[], skip: Set<keyof Err> = new Set()) => { let w = { k: '' as keyof Err | '', v: 0, r: null as Row | null }; for (const r of rs) for (const k of PART_KEYS) { if (skip.has(k)) continue; const v = r.err[k]; if (v != null && Math.abs(v) > w.v) w = { k, v: Math.abs(v), r }; } return w; };

async function attempt(p: Page, sc: Scenario, idx: number): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  const m0 = (await marks(p)).length, tA = await now(p);
  await setProp(p, sc.prop, lines);
  { const ring = ['power', 'flashy', 'sig'] as const; const want = sc.style ?? 'power'; const n = (ring.indexOf(want) - ring.indexOf(curStyle) + 3) % 3; for (let i = 0; i < n; i++) { await tapBtn(p, 'B'); await p.waitForTimeout(140); } curStyle = want; if (n) lines.push(`      style → ${want}`); }
  const slug = `${TAG}-${idx}-${sc.name.split(/[ (—]/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const shot = async (name: string, angle = 40, dist = 4.4) => { if (sc.cards) await card(p, `${OUT}/${slug}-${name}.png`, angle, dist); };
  // ── the approach: the stick run, then the HOLD-RUN (the carry) with a 3/4 look for the in-game frame + full-body cards ──
  const tRun = await now(p);
  await stickUp(p, true);
  await p.waitForTimeout(500);
  await shot('run');
  await runHold(p, true, 1);
  const holdStart = Date.now(), tHold = await now(p);
  if (sc.look) await look(p, sc.look); await p.waitForTimeout(380); await shot('load'); await shot('load-profile', 90); if (sc.look) await look(p, 0);
  let launched = false, launchPage = 0;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  while (!launched && Date.now() - holdStart < 3200) { await p.waitForTimeout(30); await launchedYet(); }
  await runHold(p, false); await stickUp(p, false);
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 2000) await p.waitForTimeout(40);
  if (!launched) { lines.push('FAIL  never launched'); return lines; }
  const pageNow = await now(p);
  const sinceLaunch = () => Date.now() - (r0 - (pageNow - launchPage));
  const air = [...(sc.air ?? [])].sort((a, b) => a.at - b.at);
  const shotsDone = new Set<string>(); let landShotAt = 0;
  let jamAt = Infinity;
  // the SLAM taps run on their own clock; 'perfect' waits for the flight clock to reach the extension beat (a windmill finish)
  let slamOn = sc.slam !== false;
  const slamLoop = (async () => {
    if (sc.slam === 'perfect') { while (slamOn && sinceLaunch() < 3000) { const r = await lastRow(p); if (r.ph === 'cinematic' && r.ct >= 1.17) { await tapBtn(p, 'A', 60); lines.push(`      perfect tap at clip ${f2(r.ct)} (+${f0(sinceLaunch())} ms)`); break; } await new Promise((res) => setTimeout(res, 8)); } return; }
    let next = 950; while (slamOn && sinceLaunch() < 2300) { const el = sinceLaunch(); if (el >= next) { await tapBtn(p, 'A', 60); next = el + 85; } await new Promise((res) => setTimeout(res, 15)); }
  })();
  while (sinceLaunch() < 2900) {
    const el = sinceLaunch();
    if (air.length && el >= air[0].at) { const a = air.shift()!; if (a.dir) { await dpad(p, a.dir, true); await p.waitForTimeout(20); } await tapBtn(p, a.btn, 70); if (a.dir) await dpad(p, a.dir, false); lines.push(`      air ${a.dir ?? ''}+${a.btn} at +${el} ms`); }
    const r = await lastRow(p);
    if (r.ppw === 'jam' && jamAt === Infinity) jamAt = r.t;
    const want = (k: string, cond: boolean) => { if (cond && !shotsDone.has(k)) { shotsDone.add(k); return true; } return false; };
    if (want('plant', r.ppw === 'plant' && el > 30)) { await shot('plant'); await shot('plant-profile', 90); }
    if (want('rise', r.ppw === 'rise')) { await shot('rise'); }
    if (want('hang', r.ppw === 'hang' && el > 100)) { await shot('hang'); await shot('hang-profile', 90); }
    if (sc.spin && want('turn', Math.abs(r.chest) > 140)) { await shot('midturn'); }
    if (want('extend', r.ppw === 'extend')) { await shot('extend'); }
    if (want('jam', r.ppw === 'jam')) { await shot('jam-profile', 90); await shot('jam', 55); }   // the profile first: CONTACT (+0.47 s) hands the root to the replay
    if (want('rimhang', r.ppw === 'jam' && r.t - jamAt > 300)) { await shot('rimhang', 55); }
    if (want('brace', r.ppw === 'brace')) { await shot('brace'); }
    if (want('land', r.ppw === 'land' || r.ppw === 'celebrate')) { landShotAt = Date.now(); await shot('land-0'); await shot('land-0-profile', 90); }
    if (landShotAt && want('land2', Date.now() - landShotAt > 220)) { await shot('land-220'); }
    await p.waitForTimeout(20);
  }
  slamOn = false; await slamLoop;
  if (!shotsDone.has('land')) { const t0 = Date.now(); while (Date.now() - t0 < 12000) { const r = await lastRow(p); if (r.ppw === 'land' || r.ppw === 'celebrate') { await shot('land-0'); await shot('land-0-profile', 90); await p.waitForTimeout(200); await shot('land-220'); shotsDone.add('land'); break; } await p.waitForTimeout(30); } }
  // the replay (a make): wait for it and shoot its jam
  { const t0 = Date.now(); let seen = false; while (Date.now() - t0 < 9000) { const ms = (await marks(p)).slice(m0); if (ms.some((m) => /replay aerial/.test(m.msg))) { seen = true; break; } if (ms.some((m) => /replay end|CONTEST|miss clank|CLIPPED|LOST/.test(m.msg)) && Date.now() - t0 > 2500) break; await p.waitForTimeout(40); } if (seen) { await p.waitForTimeout(120); await shot('replay-jam', 55); } }
  const tEnd0 = Date.now(); while (Date.now() - tEnd0 < 12000) { const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND|RIVAL ROUND/.test(t) && !/SLAM!|CONFER|CARD/.test(t) && Date.now() - tEnd0 > 1500) break; await p.waitForTimeout(120); }
  const tZ = await now(p);
  const ms = (await marks(p)).slice(m0), R = await rows(p, tA, tZ);
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg));
  const mark = (re: RegExp) => ms.find((m) => re.test(m.msg));
  const made = has(/DUNK-WIN\] contact/);
  const resolveM = mark(/DUNK-WIN\] contact|miss clank|\[LOB\] LOST|CLIPPED|HANDS\] hold dunk_finish|HANDS\] hold dunk_score_hang/);
  const pressM = mark(/HANDS\] hold dunk_finish|HANDS\] hold dunk_score_hang|DUNK-WIN\] contact|miss clank/);
  const resolveT = (() => { const r = R.find((r) => r.t > launchPage && r.ph === 'resolve'); return r ? r.t : (pressM?.t ?? launchPage + 1700); })();
  const landM = mark(/HANDS\] land /);
  const live = R.filter((r) => !r.replay);
  const flight = live.filter((r) => r.t > launchPage && r.t <= resolveT);
  const tricks = ms.filter((m) => /DUNK-TRICK\] air/.test(m.msg));
  const finish = ms.find((m) => /HANDS\] hold dunk_finish_\w+|DUNK-PP\] jam/.test(m.msg));
  const finClip = [...new Set(live.filter((r) => r.t > resolveT && r.t < resolveT + 400).flatMap((r) => r.clips).filter((c) => /finish|score_hang/.test(c)))].join(',');
  lines.push(`      ${made ? 'MAKE' : 'MISS'} · resolve @+${f0(resolveT - launchPage)} ms · finish ${finClip || (finish?.msg ?? 'none')} · tricks ${tricks.map((m) => m.msg.slice(17, 50)).join(' | ') || 'none'} · flight ${flight.length} frames`);
  const isT = (r: Row) => r.lat >= 0.95 && Math.abs(r.lhy - r.shy) < 0.22 && Math.abs(r.rhy - r.shy) < 0.22 && r.elb >= 150;
  const win = (w: string) => flight.filter((r) => r.ppw === w);
  const landRows = live.filter((r) => landM && r.t > landM.t && r.t < landM.t + 450);
  const jamRows = live.filter((r) => r.ppw === 'jam' && r.t >= resolveT - 20 && r.t <= resolveT + 120);
  const spinMid = (r: Row) => sc.spin && r.err.hips != null && Math.abs(r.err.hips) > 60;
  // ── L1: legs athletic ──
  if (sc.gates.includes('L1')) {
    const run = live.filter((r) => r.t >= tRun + 200 && r.t <= tRun + 480), load = live.filter((r) => r.t >= tHold + 200 && r.t < launchPage);
    const kneeMin = (rs: Row[]) => Math.min(180, ...rs.map((r) => Math.min(r.kneeL, r.kneeR)));
    const plant = flight.filter((r) => r.ct < 0.3), rise = flight.filter((r) => r.ct >= 0.3 && r.ct < 0.7), hang = win('hang').concat(flight.filter((r) => r.ct >= 0.7 && r.ct < 1.0));
    const first = flight.slice(0, 3);
    const feetAtTakeoff = first.length ? Math.min(...first.map((r) => Math.min(r.ankL, r.ankR))) : NaN;
    const driveMax = Math.max(0, ...plant.concat(rise).map((r) => Math.max(r.driveL, r.driveR)));
    let locked = 0, lockRun = 0; for (const r of plant.concat(rise)) { if (r.kneeL >= 172 && r.kneeR >= 172) { lockRun++; locked = Math.max(locked, lockRun); } else lockRun = 0; }
    const hangKnee = mean(hang.map((r) => Math.min(r.kneeL, r.kneeR))), hangTuck = mean(hang.map((r) => r.feetDy)), hangFeet = maxAbs(hang.filter((r) => !spinMid(r)).flatMap((r) => [r.err.lul, r.err.rul]));
    const lKnee = landRows.length ? kneeMin(landRows) : NaN, lLat = Math.max(0, ...landRows.map((r) => r.feetLat)), lFA = Math.max(0, ...landRows.map((r) => r.feetFA));
    const lFootYaw = maxAbs(landRows.flatMap((r) => [r.err.lf == null || r.err.hips == null ? null : r.err.lf - r.err.hips, r.err.rf == null || r.err.hips == null ? null : r.err.rf - r.err.hips]));
    const lPitch = maxAbs(landRows.flatMap((r) => [r.pitchL, r.pitchR]));
    say(run.length > 3 && kneeMin(run) <= 155 && load.length > 3 && kneeMin(load) <= 155,
      `L1 approach: RUN knee min ${f0(kneeMin(run))}° (≤ 155 = soft), LOAD knee min ${f0(kneeMin(load))}°, feet yaw off the hips run ≤ ${f0(maxAbs(run.flatMap((r) => [r.err.lf, r.err.rf])))}° load ≤ ${f0(maxAbs(load.flatMap((r) => [r.err.lf, r.err.rf])))}°`);
    say(plant.length > 2 && Number.isFinite(feetAtTakeoff) && feetAtTakeoff <= 0.22 && kneeMin(plant) <= 140 && driveMax >= 30 && locked < 4,
      `L1 plant/takeoff: feet ${f2(feetAtTakeoff)} m over the root at launch (≤ 0.22 = on the floor), plant knee min ${f0(kneeMin(plant))}° (≤ 140 = loaded), knee drive ${f0(driveMax)}° forward (≥ 30), locked-straight run ${locked} frames (< 4) — plant ${plant.length} rise ${rise.length} frames`);
    say(hang.length > 2 && hangKnee <= 150 && hangTuck >= -0.88 && hangFeet <= 70,
      `L1 hang: knee ${f0(hangKnee)}° (≤ 150 = bent), feet ${f2(hangTuck)} m under the hips (≥ −0.88), thighs ≤ ${f0(hangFeet)}° off the rim (≤ 70) — ${hang.length} frames`);
    say(landRows.length > 5 && lKnee <= 128 && lLat <= 0.6 && lFA <= 0.5 && lFootYaw <= 42 && lPitch <= 28,
      `L1 land: knee min ${f0(lKnee)}° (≤ 128 = absorb), feet lateral ${f2(lLat)} m (≤ 0.6) fore-aft ${f2(lFA)} m (≤ 0.5 = no scissor), foot yaw off the hips ≤ ${f0(lFootYaw)}° (≤ 42), foot pitch ≤ ${f0(lPitch)}° (≤ 28 = flat) — ${landRows.length} frames`);
  }
  // ── L2: full-body facing ──
  if (sc.gates.includes('L2')) {
    const skipMid = flight.filter((r) => !spinMid(r));
    const bodyRows = skipMid.concat(live.filter((r) => r.t > resolveT && r.t < (landM?.t ?? resolveT + 800) + 450 && !spinMid(r)));
    const kicked = bodyRows.some((r) => r.trick === 'scorpion');
    const w = worstPart(bodyRows, new Set<keyof Err>(kicked ? ['lf', 'rf', 'll', 'rl'] : ['lf', 'rf']));
    const midRows = flight.filter(spinMid);
    // mid-turn: every part within 60° of the HIPS (the lower rides the spin body)
    const ride = maxAbs(midRows.flatMap((r) => PART_KEYS.filter((k) => k !== 'root' && k !== 'hips').map((k) => (r.err[k] == null || r.err.hips == null) ? null : Math.atan2(Math.sin((r.err[k]! - r.err.hips!) * Math.PI / 180), Math.cos((r.err[k]! - r.err.hips!) * Math.PI / 180)) * 180 / Math.PI)));
    say(w.v < 95, `L2 no part ~180° off (plant → land, mid-turn excluded; feet graded at the jam / land): worst ${w.k} ${f0(w.v)}° off the rim${w.r ? ` at +${f0(w.r.t - launchPage)} ms ${w.r.ppw} (${errLine(w.r)})` : ''}${midRows.length ? ` · mid-turn ${midRows.length} frames: every part within ${f0(ride)}° of the hips (≤ 60)` : ''}`);
    if (made && jamRows.length) {
      const j = jamRows[0];
      const feetJ = kicked ? 0 : maxAbs([j.err.lf, j.err.rf]), thighJ = maxAbs([j.err.lul, j.err.rul]);
      const settle = flight.filter((r) => r.t >= resolveT - 200);
      const together = settle.length ? Math.max(...settle.map((r) => Math.max(Math.abs(r.err.hips ?? 0), Math.abs(r.err.chest ?? 0), maxAbs([r.err.lf, r.err.rf])))) : NaN;
      say(Math.abs(j.err.hips ?? 99) <= 30 && Math.abs(j.err.chest ?? 99) <= 22 && Math.abs(j.err.head ?? 99) <= 40 && feetJ <= 45 && thighJ <= 45 && (!sc.spin || midRows.length === 0 || ride <= 60),
        `L2 jam (the release): hips ${f0(j.err.hips ?? 99)}° chest ${f0(j.err.chest ?? 99)}° head ${f0(j.err.head ?? 99)}° feet ≤ ${f0(feetJ)}°${kicked ? ' (kicked back: the scorpion, not graded)' : ''} thighs ≤ ${f0(thighJ)}° off the rim (hips ≤ 30, chest ≤ 22, head ≤ 40, feet / thighs ≤ 45) · last 200 ms: hips + chest + feet all within ${f0(together)}° — ${errLine(j)}`);
    } else if (sc.slam !== false) lines.push(`      L2 jam not graded: ${made ? 'no jam rows' : 'MISSED (the slam did not land)'}`);
    // the replay re-flies the jam
    const rep = R.filter((r) => r.replay && r.ph === 'resolve'); const rj = rep[0];
    if (made && rj) say(Math.abs(rj.err.hips ?? 99) <= 45 && Math.abs(rj.err.chest ?? 99) <= 40 && maxAbs([rj.err.lf, rj.err.rf]) <= 60, `L2/L4 replay jam: hips ${f0(rj.err.hips ?? 99)}° chest ${f0(rj.err.chest ?? 99)}° feet ≤ ${f0(maxAbs([rj.err.lf, rj.err.rf]))}° off the rim — ${rep.length} replay-resolve frames`);
  }
  // ── L3: anim cleanup ──
  if (sc.gates.includes('L3')) {
    const fall = live.filter((r) => r.t > resolveT && r.t < (landM?.t ?? resolveT + 2500) && r.y > 0.05);
    const tAir = flight.concat(fall).filter(isT).length, clipless = flight.concat(fall).filter((r) => r.clips.length === 0).length, idleAir = flight.concat(fall).filter((r) => r.clips.some((c) => /idle/.test(c))).length;
    const tLand = landRows.filter(isT).length, wide = landRows.filter((r) => r.lat >= 1.0 && r.elb >= 150).length, maxSpread = Math.max(0, ...landRows.map((r) => r.lat));
    say(tAir === 0 && clipless === 0 && idleAir === 0 && tLand === 0 && wide === 0, `L3 clean: mid-air ${tAir} T-pose / ${clipless} clip-less / ${idleAir} idle frames (0), LAND ${landRows.length} frames ${tLand} T-pose ${wide} arms-wide (max spread ${f2(maxSpread)} m)`);
    if (tAir || tLand || wide) lines.push(`      T frames: ${flight.concat(fall, landRows).filter(isT).slice(0, 6).map((r) => `+${f0(r.t - launchPage)} ${r.ppw} sp ${f2(r.lat)} ${r.clips.join(',')}`).join(' · ')}`);
    if (made && /windmill/.test(finClip)) {
      // the windmill finish: the ball rides the hand through the cock-back and the sweep, leaves at the slam key
      const fin = live.filter((r) => r.t > resolveT && r.t < resolveT + 900 && r.clips.some((c) => /finish_windmill/.test(c)));
      const leave = fin.find((r) => r.ballHand > 0.22);
      const leaveAt = leave ? leave.t - resolveT : -1;
      const contact = mark(/DUNK-WIN\] contact/); const contactAt = contact ? contact.t - resolveT : -1;
      say(!!leave && leaveAt >= 380, `L3 windmill release: the ball left the hand +${f0(leaveAt)} ms after the press (≥ 380 = through the cock-back and the sweep; the slam key is at 550), contact +${f0(contactAt)} ms, ${fin.length} windmill frames`);
      if (VERBOSE) for (const r of fin.filter((_, i) => i % 3 === 0)) lines.push(`        +${f0(r.t - resolveT)} ball-hand ${f2(r.ballHand)} ballY ${f2(r.ballY)} rh ${f2(r.rhy)} ${r.clips.join(',')}`);
    } else if (sc.slam === 'perfect') lines.push(`      L3 windmill not graded: ${made ? `finish was ${finClip || 'unknown'}` : 'MISSED'}`);
  }
  // ── L4: runway ball-carry + continuity ──
  if (sc.gates.includes('L4')) {
    const load = live.filter((r) => r.t >= tHold + 150 && r.t < launchPage - 30);
    const fa = load.map((r) => r.handFA), hy = load.map((r) => r.handY);
    const travel = fa.length ? Math.max(...fa) - Math.min(...fa) : NaN, hMin = Math.min(...hy), hMax = Math.max(...hy), ballOff = Math.max(0, ...load.map((r) => r.ballHand));
    const kneeMin = Math.min(180, ...load.map((r) => Math.min(r.kneeL, r.kneeR)));
    // A2 / A3 / L4: the runway is a dribble — the ball leaves the palm, hits the floor at a cadence, the ball hand follows it; the
    // last bounce is gathered into two hands a stride before the line; the ball is in the hand at the takeoff with no jump
    const runway = live.filter((r) => r.t >= tRun + 100 && r.t < launchPage);
    const drib = runway.filter((r) => r.drib);
    let floorHits = 0; for (let i = 1; i < drib.length - 1; i++) if (drib[i].ballY <= 0.20 && drib[i].ballY <= drib[i - 1].ballY && drib[i].ballY < drib[i + 1].ballY) floorHits++;
    const ballFar = drib.filter((r) => r.ballHand > 0.35).length, ballNear = drib.filter((r) => r.ballHand < 0.2).length;
    const armPump = drib.length ? Math.max(...drib.map((r) => r.handY)) - Math.min(...drib.map((r) => r.handY)) : 0;
    const gatherRows = runway.filter((r) => r.gather); const gatherAt = gatherRows[0] ? launchPage - gatherRows[0].t : -1;
    const preLaunch = live.filter((r) => r.t >= launchPage - 120 && r.t <= launchPage + 30);
    const inHand = preLaunch.length ? Math.max(...preLaunch.map((r) => r.ballHand)) : 9, offHand = preLaunch.length ? Math.min(...preLaunch.map((r) => r.lhBall)) : 9;
    const jumps = runway.concat(preLaunch).filter((r) => r.ballJump > 0.45).length;
    say(drib.length > 10 && floorHits >= 2 && ballFar > 3 && ballNear > 3 && armPump >= 0.12,
      `A2/A3 dribble: ${drib.length} dribbling frames, ${floorHits} floor hits (≥ 2), ball ≥ 0.35 m from the hand ${ballFar} frames / at the palm ${ballNear} frames, ball-hand pump ${f2(armPump)} m (≥ 0.12), knee min ${f0(kneeMin)}°`);
    say(gatherAt >= 80 && inHand <= 0.2 && offHand <= 0.45 && jumps === 0,
      `A1/L4 gather: gathered ${gatherAt >= 0 ? f0(gatherAt) + ' ms' : 'NEVER'} before the takeoff (≥ 80), ball-to-hand ≤ ${f2(inHand)} m through the takeoff (≤ 0.2), off hand ≤ ${f2(offHand)} m from the ball (≤ 0.45 = two hands), ${jumps} ball jumps > 0.45 m/frame (0) · load: hand fore-aft travel ${f2(travel)} m, height ${f2(hMin)}–${f2(hMax)} m, ball-to-hand ≤ ${f2(ballOff)} m`);
    // no pops: per-frame steps of the chest yaw (mid-turn excluded) and the trunk lean through the flight and the land
    const seq = flight.concat(live.filter((r) => r.t > resolveT && r.t < (landM?.t ?? resolveT + 800) + 450));
    let stepChest = 0, stepTrunk = 0, at = 0; for (let i = 1; i < seq.length; i++) { const a = seq[i - 1], b = seq[i]; if (b.t - a.t > 60) continue; const dc = Math.abs(((b.chest - a.chest + 540) % 360) - 180), dt = Math.abs(b.trunk - a.trunk); if (!spinMid(a) && !spinMid(b) && dc > stepChest) { stepChest = dc; at = b.t - launchPage; } stepTrunk = Math.max(stepTrunk, dt); }
    say(stepChest <= 22 && stepTrunk <= 14, `L4 continuity: max chest step ${f0(stepChest)}°/frame (≤ 22, at +${f0(at)} ms), max trunk step ${f0(stepTrunk)}°/frame (≤ 14) over ${seq.length} frames`);
  }
  // ── A4: the self-lob — the ball leaves the hand on an arc (no teleport), flies, is caught by the hand, gathered for the jam ──
  if (sc.gates.includes('A4')) {
    const thrown = mark(/\[LOB\] SELF-LOB from/), caught = mark(/\[LOB\] CAUGHT/);
    const span = live.filter((r) => thrown && r.t >= thrown.t - 400 && r.t <= (caught?.t ?? thrown.t + 2500) + 300);
    const jumps = span.filter((r) => r.ballJump > 0.45);
    const flightBall = live.filter((r) => thrown && caught && r.t > thrown.t + 30 && r.t < caught.t - 30);
    const apex = Math.max(-1, ...flightBall.map((r) => r.ballY)), inHand = flightBall.filter((r) => r.ballHand < 0.2).length;
    say(!!thrown && !!caught && jumps.length === 0 && apex >= 2.4 && inHand === 0, `A4 self-lob: thrown ${thrown ? 'yes' : 'NO'} @+${thrown ? f0(thrown.t - launchPage) : '—'} ms, caught ${caught ? 'yes' : 'NO'} @+${caught ? f0(caught.t - launchPage) : '—'} ms, ball apex ${f2(apex)} m (≥ 2.4 = a real arc), ${inHand} in-hand frames while airborne (0), ${jumps.length} ball jumps > 0.45 m/frame (0 = no teleport)${jumps.length ? ' at +' + jumps.slice(0, 4).map((r) => f0(r.t - launchPage) + ' (' + f2(r.ballJump) + ')').join(', +') : ''}`);
  }
  const judged = /JUDGES (\d+)/.exec(R.map((r) => r.banner).join('|'))?.[1];
  if (judged) lines.push(`      card: JUDGES ${judged}`);
  // per-window part table (the eye's numbers): the plant, the hang, the jam / brace, the land
  const pick = (rs: Row[], n = 1) => rs.slice(0, n);
  const tbl: [string, Row[]][] = [['plant', pick(flight.filter((r) => r.ct >= 0.05 && r.ct < 0.3))], ['rise', pick(flight.filter((r) => r.ct >= 0.35))], ['hang', pick(win('hang').slice(2))], ['extend', pick(win('extend'))], ['jam/brace', pick(live.filter((r) => r.t >= resolveT && (r.ppw === 'jam' || r.ppw === 'brace')))], ['land+80', pick(landRows.filter((r) => r.t > (landM?.t ?? 0) + 80))], ['land+300', pick(landRows.filter((r) => r.t > (landM?.t ?? 0) + 300))]];
  for (const [w, rs] of tbl) for (const r of rs) lines.push(`      ${w.padEnd(9)} +${f0(r.t - launchPage).padStart(4)} ${r.ppw.padEnd(9)} knees ${f0(r.kneeL)}/${f0(r.kneeR)} drive ${f0(r.driveL)}/${f0(r.driveR)} bend ${f2(r.bendL)}/${f2(r.bendR)} twist ${r.twistL == null ? '—' : f0(r.twistL)}/${r.twistR == null ? '—' : f0(r.twistR)} footLoc ${f0(r.footLocL)} ank ${f2(r.ankL)}/${f2(r.ankR)} pitch ${r.pitchL == null ? '—' : f0(r.pitchL)}/${r.pitchR == null ? '—' : f0(r.pitchR)} feet lat ${f2(r.feetLat)} fa ${f2(r.feetFA)} · ${errLine(r)} · ${r.clips.join(',')}\n                raw ${r.raw}`);
  if (VERBOSE) { const step = Math.max(1, Math.floor(flight.length / 30)); for (let i = 0; i < flight.length; i += step) { const r = flight[i]; lines.push(`        +${f0(r.t - launchPage)} ct ${f2(r.ct)} y ${f2(r.y)} ${r.ppw}${r.trick ? '+' + r.trick : ''} knees ${f0(r.kneeL)}/${f0(r.kneeR)} drive ${f0(r.driveL)}/${f0(r.driveR)} bend ${f2(r.bendL)}/${f2(r.bendR)} twist ${r.twistL == null ? '—' : f0(r.twistL)}/${r.twistR == null ? '—' : f0(r.twistR)} ${errLine(r)} ${r.clips.join(',')}`); } }
  return lines;
}

(async () => {
  const picked = S.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const groups: Scenario[][] = []; for (let i = 0; i < picked.length; i += 4) groups.push(picked.slice(i, i + 4));
  const out: string[] = [`DUNK-LEGS probe · ${TAG} · port ${PORT} · ${process.env.QS ?? ''} · ${new Date().toISOString()}`];
  let allErrors: string[] = [], allFrames: string[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const { p, close, errors, frames } = await boot();
    curProp = 'none'; curStyle = 'power';
    for (const [k, sc] of groups[gi].entries()) {
      const idx = gi * 4 + k;
      out.push(`\n## ${idx + 1}. ${sc.name}`);
      try { out.push(...await attempt(p, sc, idx)); } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 200)}`); }
      console.log(out.slice(-14).join('\n'));
    }
    allErrors = allErrors.concat(errors); allFrames = allFrames.concat(frames);
    await close();
  }
  out.push(`\nconsole errors: ${allErrors.length}${allErrors.length ? '\n  ' + [...new Set(allErrors)].slice(0, 8).join('\n  ') : ''}`);
  out.push(`FEL-FRAME / MISSING CLIP: ${allFrames.length}${allFrames.length ? '\n  ' + [...new Set(allFrames)].slice(0, 6).join('\n  ') : ''}`);
  const pass = out.filter((l) => l.startsWith('PASS')).length, fail = out.filter((l) => l.startsWith('FAIL')).length;
  out.push(`\nTOTAL PASS ${pass} · FAIL ${fail}`);
  writeFileSync(`${OUT}/report-${TAG}.md`, out.join('\n'));
  console.log(out.slice(-4).join('\n'));
})();
