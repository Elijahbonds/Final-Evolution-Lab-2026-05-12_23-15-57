// HOOPS-MOVE-KIT-B probe (2026-09-08): the POST KIT on /dev/mode/onevone and threevthree, driven by a pre-boot fake
// DualShock and read off the live rig every rendered frame (the KIT-A probe's harness, plus a body-frame LEAN read).
// Grades SPEC-HOOPS-MOVE-KIT M4–M6:
//   PATH the post-up: L1/LT held with a body to back down turns the BACK to the basket (the seal clip, the `post` posture
//        window) and the stick becomes a slow back-down — not a drive.
//   M4 the FADEAWAY: the post squeeze with the stick pulled off the rim is a fade — its own clip, a real LEAN (the
//      shoulders behind the hips in the body frame) at the release, and GROUND GIVEN UP: the gap to the defender grows
//      from the take-off through the release to feet-down. It used to be a label on a standing jumpshot.
//   M5 the JUMP HOOK: the post squeeze without that pull is a hook — its own clip, the ball over the head and OUT to the
//      side (not on the midline), released from the hand AWAY from the defender, off a real hop.
//   M6 the SPIN: the stick swung across the seal (and a drive that MEETS a body) pivots — a full 360° of yaw, monotonic
//      and eased (a readable pivot, never a snap), the root arcing around the planted foot and coming out toward the rim
//      with the drive's speed back in the legs.
//   NO REGRESS: the KIT-A pull-up and layup still gather, pace and finish (run the KIT-A probe alongside).
//   MODE=onevone PORT=3040 npx tsx scripts/probes/_hoops-move-kit-b-probe.mts     (TAG= · OUT_DIR= · VERBOSE=1 · ONLY=…)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const MODE = (process.env.MODE ?? 'onevone') as 'onevone' | 'threevthree';
const PORT = process.env.PORT ?? '3040', OUT = process.env.OUT_DIR ?? 'docs/shots/hoops-move-kit-b', TAG = process.env.TAG ?? 'after';
const VERBOSE = !!process.env.VERBOSE;
/** ONLY=post,fade,hook,spinpost,spindrive,runhook,pump,pivot,floater,reverse,bank,hop,euro — a subset. */
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (k: string) => ONLY.length === 0 || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });
const EXE = chromiumExe();   // BIOMECH-WAVE2: the hardcoded chromium-1234 path broke when the cache was reinstalled at 1243 — see _chromium.mts

type Job = { id: string; job: string; phase: string; x: number; z: number; y: number; speed: number; facing: number; boxing: boolean; objX: number; objZ: number; yaw: number; clips: string };
type Row = { t: number; x: number; y: number; z: number; yaw: number; chestRim: number; jobs: Job[]; spread: number; lat: number; elb: number; lhy: number; rhy: number; shy: number; headY: number; lean: number; ballLat: number; ballHand: number; ballSide: string; ballY: number; ballX: number; ballZ: number; clips: string[]; win: string; foeClips: string[]; foeDist: number; foeX: number; foeZ: number; foeY: number; banner: string; hint: string; shotType: string; meter: number; poss: string; att: string };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y';

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;
const RIM = { x: 0, y: 3.05, z: -0.6 };

let PAGE: Page | null = null;
/** A fresh game on the same page (the 1v1 ends at 11 points, the 3v3 at 90 s — both inside one probe run). */
async function reboot(): Promise<void> {
  if (!PAGE) return;
  await PAGE.goto(`http://localhost:${PORT}/dev/mode/${MODE}${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await instrument(PAGE);
}
const gameEnded = async (p: Page): Promise<boolean> => p.evaluate(`(() => { const d = window.__FEL_DEV__; const md = d.scene && d.scene.metadata && d.scene.metadata.onevone; const f = (md && md.ended) || (d.hoopsPosture && d.hoopsPosture.ended); return f ? !!f() : false; })()`) as Promise<boolean>;
async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[]; frames: string[] }> {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage(); PAGE = p;
  const errors: string[] = []; const frames: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await instrument(p);
  return { p, close: () => b.close(), errors, frames };
}
async function instrument(p: Page): Promise<void> {
  await p.goto(`http://localhost:${PORT}/dev/mode/${MODE}${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const S = window.__smp = { rows: [], marks: [], sign: 0, foePrev: null };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(1V1-MOVE|3V3-MOVE|1V1-CONTACT|3V3-CONTACT|1V1-JUICE|3V3-JUICE|1V1-DEF|3V3-DEF|1V1-OFF|3V3-OFF)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 200) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-|posture layer/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 180) }); ow(...a); };
    const RIM = { x: ${RIM.x}, y: ${RIM.y}, z: ${RIM.z} };
    const R2D = 180 / Math.PI, wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    const partsOf = (h) => { const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\\\d+|_p\\\\d+)?$').test(n.name)) ?? null; return { LA: f('LeftArm'), RA: f('RightArm'), LE: f('LeftForeArm'), RE: f('RightForeArm'), LH: f('LeftHand'), RH: f('RightHand'), Head: f('Head') }; };
    const fresh = (h, n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
    const P = (n) => n.getAbsolutePosition();
    const chestOf = (la, ra, rootYaw) => { const sx = ra.x - la.x, sz = ra.z - la.z; if (!S.sign) { const a = Math.atan2(-sz, sx), b = Math.atan2(sz, -sx); S.sign = Math.abs(wrap(a - rootYaw)) <= Math.abs(wrap(b - rootYaw)) ? 1 : -1; } return Math.atan2(-sz * S.sign, sx * S.sign); };
    let heroSeen = null, N = null;
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; N = partsOf(h); }
      if (!N || !N.LA || !N.RA || !N.Head) return;
      h.computeWorldMatrix(true); for (const n of Object.values(N)) if (n) fresh(h, n);
      const la = P(N.LA), ra = P(N.RA), head = P(N.Head), lh = N.LH ? P(N.LH) : la, rh = N.RH ? P(N.RH) : ra;
      const rootYaw = h.rotationQuaternion ? h.rotationQuaternion.toEulerAngles().y : h.rotation.y;
      const chest = chestOf(la, ra, rootYaw);
      const rimB = Math.atan2(RIM.x - h.position.x, RIM.z - h.position.z);
      const elbow = (a, e, hd) => { const u = { x: e.x - a.x, y: e.y - a.y, z: e.z - a.z }, v = { x: hd.x - e.x, y: hd.y - e.y, z: hd.z - e.z }; const nu = Math.hypot(u.x, u.y, u.z) || 1, nv = Math.hypot(v.x, v.y, v.z) || 1; return 180 - Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv)))) * R2D; };
      const elb = N.LE && N.RE ? Math.min(elbow(la, P(N.LE), lh), elbow(ra, P(N.RE), rh)) : 180;
      const ball = scene.meshes.find((m) => m.name === 'ball' && m.metadata && 'felReleased' in m.metadata) ?? scene.getMeshByName('ball'); let ballHand = -1, ballY = -1, ballSide = '';
      let ballX = 0, ballZ = 0;
      if (ball) { ball.computeWorldMatrix(true); const bp = ball.getAbsolutePosition(); ballY = bp.y; ballX = bp.x; ballZ = bp.z; const dl = Math.hypot(bp.x - lh.x, bp.y - lh.y, bp.z - lh.z), dr = Math.hypot(bp.x - rh.x, bp.y - rh.y, bp.z - rh.z); ballHand = Math.min(dl, dr); ballSide = dl < dr ? 'L' : 'R'; }
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const hp = dev.hoopsPosture; const me = hp && hp.me ? hp.me() : null;
      const md = scene.metadata && scene.metadata.onevone;
      const foeRoot = (md && md.foeRoot) || (hp && hp.driverRoot && hp.driverRoot()) || (hp && hp.nearestFoeRoot ? hp.nearestFoeRoot() : null) || null;
      let foeClips = [], foeDist = -1, foeX = 0, foeZ = 0, foeY = 0;
      if (foeRoot) { foeClips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === foeRoot).map((g) => g.name); foeDist = Math.hypot(h.position.x - foeRoot.position.x, h.position.z - foeRoot.position.z); foeX = foeRoot.position.x; foeZ = foeRoot.position.z; foeY = foeRoot.position.y; }
      let jobs = [];
      try { if (hp && hp.jobs) jobs = hp.jobs().map((j) => ({ id: j.id, job: j.job, phase: j.phase, x: j.x, z: j.z, y: j.y, speed: j.speed, facing: j.facing, boxing: j.boxing, objX: j.objX, objZ: j.objZ, yaw: j.root.rotation.y, clips: scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === j.root).map((g) => g.name).join(',') })); else if (md && md.foeJob && foeRoot) { const fy = foeRoot.rotationQuaternion ? foeRoot.rotationQuaternion.toEulerAngles().y : foeRoot.rotation.y; const dx = h.position.x - foeX, dz = h.position.z - foeZ, dd = Math.hypot(dx, dz) || 1; const fsp = S.foePrev ? Math.hypot(foeX - S.foePrev.x, foeZ - S.foePrev.z) * 60 : 0; S.foePrev = { x: foeX, z: foeZ }; jobs = [{ id: 'foe', job: md.foeJob(), phase: '', x: foeX, z: foeZ, y: foeY, speed: fsp, facing: (Math.sin(fy) * dx + Math.cos(fy) * dz) / dd, boxing: md.foeBoxing(), objX: h.position.x, objZ: h.position.z, yaw: fy, clips: foeClips.join(',') }]; } } catch {}
      S.rows.push({ t: performance.now(), x: h.position.x, y: h.position.y, z: h.position.z, yaw: rootYaw, chestRim: wrap(chest - rimB) * R2D, jobs,
        spread: Math.hypot(lh.x - rh.x, lh.y - rh.y, lh.z - rh.z), lat: (() => { const ax = ra.x - la.x, az = ra.z - la.z, n = Math.hypot(ax, az) || 1; return Math.abs(((lh.x - rh.x) * ax + (lh.z - rh.z) * az) / n); })(), elb,
        lhy: lh.y - h.position.y, rhy: rh.y - h.position.y, shy: (la.y + ra.y) / 2 - h.position.y, headY: head.y,
        lean: -(((la.x + ra.x) / 2 - h.position.x) * Math.sin(rootYaw) + ((la.z + ra.z) / 2 - h.position.z) * Math.cos(rootYaw)),
        ballLat: ball ? Math.abs((ballX - h.position.x) * Math.cos(rootYaw) - (ballZ - h.position.z) * Math.sin(rootYaw)) : -1, ballHand, ballSide, ballY, ballX, ballZ, clips, win: me ? String(me.window) : '?',
        foeClips, foeDist, foeX, foeZ, foeY, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? ''), shotType: String(hud.shotType ?? ''), meter: Number(hud.shotMeterT ?? 0), poss: md ? String(md.possession()) : (hp && hp.carrier ? String(hp.carrier()) : ''), att: md ? String(md.attackPhase()) : '' });
      if (S.rows.length > 60000) S.rows.splice(0, 20000);
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
}

const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
const stick = (p: Page, x: number, y: number) => padSet(p, `p.axes[0] = ${x}; p.axes[1] = ${y}`);
const rt = (p: Page, on: boolean, v = 1) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`);
const btn = (p: Page, b: Btn, on: boolean) => padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`);
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const rows = async (p: Page, a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const lastRow = async (p: Page): Promise<Row> => p.evaluate('window.__smp.rows[window.__smp.rows.length - 1]') as Promise<Row>;
/** HOOPS-MOVE-KIT-B: the mode's own post seam (why the seal is / is not on). */
const postSeam = async (p: Page): Promise<Record<string, unknown>> => p.evaluate(`(() => { const d = window.__FEL_DEV__; const md = d.scene.metadata && d.scene.metadata.onevone; const f = (md && md.post) || (d.hoopsPosture && d.hoopsPosture.post); return f ? f() : null; })()`) as Promise<Record<string, unknown>>;
async function card(p: Page, path: string, angleDeg = 40, dist = 3.4): Promise<void> {
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; }
    const a = ${angleDeg} * Math.PI / 180, dist = ${dist};
    window.__card = scene.onBeforeCameraRenderObservable.add((cam) => {
      const h = dev.hero(); if (!h || cam !== scene.activeCamera) return;
      const yaw = h.rotationQuaternion ? h.rotationQuaternion.toEulerAngles().y : h.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fx * Math.sin(a) + fz * Math.cos(a);
      const c = h.position.clone(); c.y += 1.05;
      cam.position.set(c.x + dx * dist, c.y + 0.3, c.z + dz * dist);
      if (cam.rotationQuaternion) cam.rotationQuaternion = null;
      cam.setTarget(c);
      cam.getViewMatrix(true);
    });
  })()`);
  await p.waitForTimeout(50);
  await p.screenshot({ path });
  await p.evaluate(`(() => { const scene = window.__FEL_DEV__.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; } })()`);
}
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2);
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const absMean = (a: number[]) => mean(a.map(Math.abs));
const isT = (r: Row) => r.lat >= 0.95 && Math.abs(r.lhy - r.shy) < 0.22 && Math.abs(r.rhy - r.shy) < 0.22 && r.elb >= 150;
const wins = (R: Row[]): string => { const out: string[] = []; for (const r of R) if (out[out.length - 1] !== r.win) out.push(r.win); return out.join('→'); };
const clipsIn = (R: Row[]): string => [...new Set(R.flatMap((r) => r.clips))].join(',');
const has = (ms: Mark[], re: RegExp) => ms.some((m) => re.test(m.msg));
/** Planar speed per row from the position deltas (m/s). */
const speeds = (R: Row[]): number[] => R.map((r, i) => { if (i === 0) return 0; const p = R[i - 1]; const dt = (r.t - p.t) / 1000; return dt > 1e-4 ? Math.hypot(r.x - p.x, r.z - p.z) / dt : 0; });
const distRim = (r: Row) => Math.hypot(r.x - RIM.x, r.z - RIM.z);
type Lines = string[];
const say = (L: Lines, ok: boolean, what: string) => L.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
const mine = (r: Row) => MODE === 'onevone' ? r.poss === 'mine' : r.poss === 'me';

/** Back to MY possession, deterministically (the dev seams). */
async function waitOffense(p: Page, ms = 12000): Promise<boolean> {
  if (await gameEnded(p)) { console.log('      (the game ended — a fresh one)'); await reboot(); }
  await p.evaluate(`(() => { const d = window.__FEL_DEV__; const md = d.scene.metadata && d.scene.metadata.onevone; if (md && md.offense) md.offense(); else if (d.hoopsPosture && d.hoopsPosture.offense) d.hoopsPosture.offense(); })()`);
  await p.waitForTimeout(MODE === 'threevthree' ? 120 : 500);
  const t0 = Date.now(); let nudged = false;
  while (Date.now() - t0 < ms) {
    const r = await lastRow(p); if (mine(r) && r.ballHand >= 0 && r.ballHand < 1.2 && r.win !== 'land') return true;
    if (!nudged && Date.now() - t0 > 3000) { nudged = true; await p.evaluate(`(() => { const d = window.__FEL_DEV__; const md = d.scene.metadata && d.scene.metadata.onevone; if (md && md.offense) md.offense(); else if (d.hoopsPosture && d.hoopsPosture.offense) d.hoopsPosture.offense(); })()`); }   // the rival strips a standing hero: ask again
    await p.waitForTimeout(60);
  }
  const r = await lastRow(p); console.log(`      waitOffense timed out: poss ${r.poss} ballHand ${f2(r.ballHand)} win ${r.win} hint ${r.hint.slice(0, 40)} banner ${r.banner}`);
  return false;
}
/** Hold the stick until the hero is inside `dist` of the rim's floor point (or possession is lost); returns whether it arrived. */
async function approach(p: Page, sx: number, sy: number, dist: number, maxMs = 3500): Promise<boolean> {
  await stick(p, sx, sy);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { const r = await lastRow(p); if (!mine(r) || /STOLEN|STRIPPED/.test(r.banner)) return false; if (distRim(r) < dist) return true; await p.waitForTimeout(16); }
  return false;
}
const shotResolved = (R: Row[]) => R.map((r) => r.banner).filter(Boolean).some((b) => /GREEN|EARLY|LATE|BRICK|WAY LATE|SPLASH|GOOD|RIMS OUT|BLOCKED|SWATTED|STUFFED|BOARD|\+\d/.test(b));

// ── the pad's post button (L1 = brace) ───────────────────────────────────────
const l1 = (p: Page, on: boolean) => padSet(p, `p.buttons[4].pressed = ${on}; p.buttons[4].value = ${on ? 1 : 0}`);
/** Total yaw swept over a window, UNWRAPPED (a 360° pivot wraps π four times), and the largest one-frame step. */
function yawSweep(R: Row[]): { total: number; maxStep: number; monotonic: boolean } {
  let total = 0, maxStep = 0, up = 0, down = 0;
  for (let i = 1; i < R.length; i++) {
    let d = R[i].yaw - R[i - 1].yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    total += d; maxStep = Math.max(maxStep, Math.abs(d));
    if (d > 0.02) up++; else if (d < -0.02) down++;
  }
  return { total: Math.abs(total) * 180 / Math.PI, maxStep: maxStep * 180 / Math.PI, monotonic: Math.min(up, down) <= 2 };
}
/** Walk into the post band and let the body close on me, then hold L1 (the seal). Two beats, because the defender keeps a
 *  1.4–1.6 m cushion on a MOVING handler and only presses a standing one. */
async function intoThePost(p: Page, L: Lines, dist = 4.0): Promise<boolean> {
  // L1 is PLANT YOUR FOOT (M9), so it cannot be held on the way in — a planted body does not walk. Drive in first, and
  // press it the moment the post band and a body to back down are both there: from then on the seal protects the ball.
  await stick(p, 0, -0.45);
  const t0 = Date.now(); let arrived = false, resets = 0, planted = false;
  while (Date.now() - t0 < 10000) {
    const r = await lastRow(p);
    if (!mine(r) || /STOLEN|STRIPPED/.test(r.banner)) { await stick(p, 0, 0); await l1(p, false); L.push(`      (lost it on the way in: poss ${r.poss} banner ${r.banner})`); return false; }
    // a foul / a charge keeps the ball but puts both bodies back on their spawns: keep driving, do not call it a failure
    if (/FOUL|CHARGE/.test(r.banner)) { if (++resets > 3) { await stick(p, 0, 0); await l1(p, false); L.push('      (four resets on the way in)'); return false; } if (planted) { await l1(p, false); planted = false; } await p.waitForTimeout(700); continue; }
    if (!planted && distRim(r) < 5.2 && r.foeDist >= 0 && r.foeDist < 2.3) { await l1(p, true); planted = true; }
    if (distRim(r) < dist) { arrived = true; break; }
    await p.waitForTimeout(16);
  }
  if (!planted) await l1(p, true);
  await stick(p, 0, 0);
  if (!arrived) { const r = await lastRow(p); L.push(`      (never reached the block: rim ${f2(distRim(r))} m, poss ${r.poss})`); return false; }
  const t1 = Date.now();                                   // stand: the press closes on a stationary handler
  while (Date.now() - t1 < 1600) { const r = await lastRow(p); if (mine(r) && r.foeDist >= 0 && r.foeDist < 2.3) break; await p.waitForTimeout(16); }
  // let any spin from the way in play out AND its cooldown expire, so the seal is measured on its own
  let quiet = Date.now();
  while (Date.now() - quiet < 1800) { const r = await lastRow(p); if (r.clips.some((c) => /bball_spin/.test(c))) quiet = Date.now(); if (Date.now() - quiet > 5000) break; await p.waitForTimeout(30); }
  const r = await lastRow(p);
  if (!mine(r) || distRim(r) >= 5.1 || r.foeDist < 0 || r.foeDist > 2.3) { await l1(p, false); L.push(`      (no seal: rim ${f2(distRim(r))} m, foe ${f2(r.foeDist)} m, poss ${r.poss}, banner ${r.banner})`); return false; }
  await p.waitForTimeout(220);
  const q = await lastRow(p);
  if (!q.clips.some((c) => /post_up/.test(c))) L.push(`      (L1 held but no seal clip yet: rim ${f2(distRim(q))} foe ${f2(q.foeDist)} win ${q.win} clips ${q.clips.join(',')} · seam ${JSON.stringify(await postSeam(p))})`);
  return mine(q);
}

/** The PATH: the seal. L1 held with a body to back down turns the back to the basket and the stick becomes a back-down. */
async function postUp(p: Page, L: Lines, slug: string): Promise<boolean> {
  const m0 = (await marks(p)).length;
  if (!(await intoThePost(p, L))) { L.push('      (the post: that attempt never reached the block with a body on me)'); await l1(p, false); await stick(p, 0, 0); return false; }
  const tS = await now(p);
  await stick(p, 0, -0.9);                       // the stick INTO the rim: a back-down, not a drive
  await p.waitForTimeout(700);
  await card(p, `${OUT}/${slug}-post.png`, 45);
  await stick(p, 0, 0); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  const held = R.filter((r) => r.clips.some((c) => /post_up/.test(c)));
  const posted = R.filter((r) => r.win === 'post');
  // the back to the basket: the bearing to the rim is BEHIND me (|chest − rim| near 180°)
  const backOn = R.filter((r) => Math.abs(r.chestRim) > 120).length;
  // the BACK-DOWN is measured on the frames the seal is actually on the body: a defender who drifts past the post band for a
  // frame drops the seal, and the full stick then drives into him — which is a SPIN (M6), not a back-down
  const B = R.filter((r) => r.clips.some((c) => /post_up/.test(c)) && !r.clips.some((c) => /bball_spin/.test(c)));
  const sp = speeds(B).slice(2);
  const top = sp.length ? Math.max(...sp) : 0;
  const moved = B.length > 2 ? distRim(B[0]) - distRim(B[B.length - 1]) : 0;
  say(L, has(ms, /MOVE\] post up/) && held.length >= 10, `the POST-UP holds the seal: ${held.length} seal-clip frames (≥ 10) · ${posted.length} post-window frames · clips ${clipsIn(R)}`);
  say(L, backOn >= R.length * 0.5, `the BACK is to the basket: ${backOn}/${R.length} frames with the rim behind the chest (> 120° off)`);
  say(L, B.length >= 10 && top > 0.05 && top <= 1.9 && moved > 0.02, `it is a BACK-DOWN, not a drive: top speed ${f2(top)} m/s (≤ 1.9) and ${f2(moved)} m closer to the rim over ${B.length} sealed frames`);
  if (VERBOSE) { for (let i = 0; i < R.length; i += 2) L.push(`        +${f0(R[i].t - tS)} poss ${R[i].poss} rim ${f2(distRim(R[i]))} foe ${f2(R[i].foeDist)} chestRim ${f0(R[i].chestRim)} ${R[i].win} ${R[i].clips.join(',')} ${R[i].banner}`); L.push('      marks: ' + ms.map((m) => m.msg).join(' | ')); }
  return true;
}

/** M4: the fadeaway out of the post — the stick pulled off the rim at the squeeze. */
async function fadeaway(p: Page, L: Lines, slug: string): Promise<boolean> {
  const m0 = (await marks(p)).length;
  if (!(await intoThePost(p, L))) { L.push('      (M4 fadeaway: that attempt never reached the block with a body on me)'); await l1(p, false); await stick(p, 0, 0); return false; }
  await stick(p, 0, -0.9); await p.waitForTimeout(420);          // back him down first (the read the fade answers)
  await stick(p, 0, 0.95);                                       // the stick OFF the rim …
  await p.waitForTimeout(60);
  await rt(p, true); const tS = await now(p);                    // … and the squeeze: a FADEAWAY
  await p.waitForTimeout(300); await card(p, `${OUT}/${slug}-fade-lean.png`, 75, 3.2);
  await p.waitForTimeout(320); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(1400); await stick(p, 0, 0); await l1(p, false); const tZ = await now(p);
  const R = await rows(p, tS - 200, tZ), ms = (await marks(p)).slice(m0);
  const after = R.filter((r) => r.t >= tS);
  const types = [...new Set(after.map((r) => r.shotType).filter(Boolean))];
  const clip = after.filter((r) => r.clips.some((c) => /fadeaway/.test(c)));
  const takeoff = after[0], rel = after.find((r) => r.t >= tRel) ?? after[after.length - 1];
  // feet-down is the LAST frame the fade's own clip is still on the body: past it the possession resolves and the reset
  // teleports both bodies (a 6 m "gap" that is not the shot)
  const land = (clip.length ? clip[clip.length - 1] : after.filter((r) => r.t <= tRel + 450).slice(-1)[0]) ?? rel;
  const gap = (r: Row) => r.foeDist;
  const grewToRel = gap(rel) - gap(takeoff);
  // the ground I gave up is MY OWN displacement down the escape line (away from him at the take-off) — the raw gap also
  // moves because he chases the shot, and he can shove me on the way past
  const ax = takeoff.x - takeoff.foeX, az = takeoff.z - takeoff.foeZ, an = Math.hypot(ax, az) || 1;
  const proj = (r: Row) => ((r.x - takeoff.x) * ax + (r.z - takeoff.z) * az) / an;
  const myRel = proj(rel), myLand = proj(land);
  const iRel = after.findIndex((r) => r.t >= tRel);
  // averaged over the frames either side of the release: a one-frame derivative on a body that is also being bumped is noise
  const a0 = Math.max(0, iRel - 2), a1 = Math.min(after.length - 1, iRel + 2);
  const driftAtRelease = iRel > 0 && a1 > a0 ? (proj(after[a1]) - proj(after[a0])) / ((after[a1].t - after[a0].t) / 1000) : 0;
  const leanPeak = Math.max(...after.filter((r) => r.t <= tRel + 200).map((r) => r.lean));
  const hop = Math.max(...after.filter((r) => r.t <= tRel + 700).map((r) => r.y));
  say(L, types.includes('FADEAWAY'), `M4 the post squeeze off the rim is a FADEAWAY: ${types.join(' | ') || 'no shot type'}`);
  say(L, clip.length >= 6, `M4 it plays its OWN clip (it was a label on the standing jumpshot): ${clip.length} fadeaway frames · clips ${clipsIn(after.filter((r) => r.t <= tRel + 300))}`);
  say(L, leanPeak >= 0.06, `M4 a REAL LEAN: the shoulders sit ${(leanPeak * 100).toFixed(0)} cm behind the hips in the body frame at the peak (≥ 6)`);
  say(L, grewToRel >= 0.25 && myRel >= 0.4, `M4 it BUYS GROUND: the gap to him grows ${f2(grewToRel)} m by the release (≥ 0.25) — ${f2(myRel)} m of it my own body down the escape line (≥ 0.4), ${f2(myLand)} m of it by feet-down`);
  say(L, driftAtRelease >= 0.5, `M4 the drift is BALLISTIC: still going ${f2(driftAtRelease)} m/s away from him ACROSS the release (≥ 0.5 — a jumpshot is stopped dead there)`);
  say(L, hop >= 0.15, `M4 a real jump: ${f2(hop)} m of hop`);
  say(L, shotResolved(after), `the shot resolved: ${[...new Set(after.map((r) => r.banner).filter(Boolean))].slice(0, 4).join(' | ') || 'no banner'}`);
  if (VERBOSE) for (let i = 0; i < after.length; i += 3) L.push(`        +${f0(after[i].t - tS)} y ${f2(after[i].y)} lean ${f2(after[i].lean)} foe ${f2(after[i].foeDist)} ${after[i].win} ${after[i].clips.join(',')} ${after[i].shotType} ${after[i].banner}`);
  return true;
}

/** M5: the jump hook out of the post — the squeeze with no pull off the rim. */
async function hook(p: Page, L: Lines, slug: string): Promise<boolean> {
  const m0 = (await marks(p)).length;
  if (!(await intoThePost(p, L))) { L.push('      (M5 hook: that attempt never reached the block with a body on me)'); await l1(p, false); await stick(p, 0, 0); return false; }
  await stick(p, 0, -0.9); await p.waitForTimeout(420);
  await stick(p, 0, 0);
  await rt(p, true); const tS = await now(p);
  await p.waitForTimeout(260); await card(p, `${OUT}/${slug}-hook.png`, 70, 3.2);
  await p.waitForTimeout(240); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(1400); await l1(p, false); const tZ = await now(p);
  const R = await rows(p, tS - 200, tZ), ms = (await marks(p)).slice(m0);
  const after = R.filter((r) => r.t >= tS);
  const types = [...new Set(after.map((r) => r.shotType).filter(Boolean))];
  const clip = after.filter((r) => r.clips.some((c) => /bball_hook/.test(c)));
  const inHand = after.filter((r) => r.t <= tRel + 60 && r.ballHand >= 0 && r.ballHand < 0.35);
  const top = inHand.filter((r) => r.ballY > r.headY);
  const lat = Math.max(...inHand.map((r) => r.ballLat));
  const hop = Math.max(...after.filter((r) => r.t <= tRel + 700).map((r) => r.y));
  const sides = [...new Set(inHand.map((r) => r.ballSide))];
  const foeSide = after[0] ? (after[0].foeX - after[0].x) * Math.cos(after[0].yaw) - (after[0].foeZ - after[0].z) * Math.sin(after[0].yaw) : 0;   // + = he is on my body-right
  say(L, types.some((t) => /JUMP HOOK/.test(t)), `M5 the post squeeze at the rim is a JUMP HOOK: ${types.join(' | ') || 'no shot type'}`);
  say(L, clip.length >= 6, `M5 its OWN clip (the game had no hook): ${clip.length} hook frames · clips ${clipsIn(after.filter((r) => r.t <= tRel + 300))}`);
  say(L, top.length >= 2 && lat >= 0.2, `M5 the release goes OVER the top and OUT to the side: ${top.length} frames with the ball above the head, ${f2(lat)} m off the midline (≥ 0.2 — a jumper is on it)`);
  say(L, sides.length === 1 && ((foeSide > 0.2 && sides[0] === 'L') || (foeSide < -0.2 && sides[0] === 'R') || Math.abs(foeSide) <= 0.2), `M5 the SHIELD: the ball is in the hand away from him — he is ${foeSide > 0 ? 'on my right' : 'on my left'} (${f2(foeSide)}), the ball in the ${sides.join('/')} hand`);
  say(L, hop >= 0.12, `M5 a real jump hook, not a standing flip: ${f2(hop)} m of hop`);
  say(L, shotResolved(after), `the shot resolved: ${[...new Set(after.map((r) => r.banner).filter(Boolean))].slice(0, 4).join(' | ') || 'no banner'}`);
  if (VERBOSE) for (let i = 0; i < after.length; i += 3) L.push(`        +${f0(after[i].t - tS)} y ${f2(after[i].y)} ballY ${f2(after[i].ballY)} lat ${f2(after[i].ballLat)} ${after[i].ballSide} ${after[i].win} ${after[i].clips.join(',')} ${after[i].shotType} ${after[i].banner}`);
  return true;
}

/** M6: the quick spin out of the post — the stick swung ACROSS the seal. */
async function spinPost(p: Page, L: Lines, slug: string): Promise<boolean> {
  const m0 = (await marks(p)).length;
  if (!(await intoThePost(p, L))) { L.push('      (M6 post spin: that attempt never reached the block with a body on me)'); await l1(p, false); await stick(p, 0, 0); return false; }
  await stick(p, 0, -0.9); await p.waitForTimeout(380);
  const tS = await now(p);
  await stick(p, 1, 0);                                          // swung across the body
  await p.waitForTimeout(260); await card(p, `${OUT}/${slug}-spin.png`, 60, 3.6);
  await p.waitForTimeout(520); await stick(p, 0, 0); await l1(p, false);
  await p.waitForTimeout(700); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  return gradeSpin(L, R, ms, 'M6 post spin', tS);
}
/** M6: the spin off CONTACT — drive into the body in front, then SWING the stick across (the contact arms it, the swing
 *  throws it: a spin is a move you make, not something that happens to you). */
async function spinDrive(p: Page, L: Lines, slug: string): Promise<boolean> {
  const m0 = (await marks(p)).length;
  await stick(p, 0, 0); await p.waitForTimeout(120);
  const tS = await now(p);
  await stick(p, 0, -1);                                         // straight through him at full stick
  const t0 = Date.now(); let armed = false;
  while (Date.now() - t0 < 3200) {
    const r = await lastRow(p);
    if (!mine(r) || /STOLEN|STRIPPED/.test(r.banner)) break;
    const seam = await postSeam(p);
    if (seam && Number(seam.armed ?? 0) > 0) { armed = true; break; }
    await p.waitForTimeout(16);
  }
  let met = false;
  if (armed) {                                                   // the body is met: swing across it
    await stick(p, 1, 0);
    const t1 = Date.now();
    while (Date.now() - t1 < 700) { const r = await lastRow(p); if (r.clips.some((c) => /bball_spin/.test(c))) { met = true; break; } await p.waitForTimeout(16); }
  }
  if (met) { await p.waitForTimeout(120); await card(p, `${OUT}/${slug}-spindrive.png`, 60, 3.6); }
  await p.waitForTimeout(500); await stick(p, 0, -1);            // out of the turn: keep driving
  await p.waitForTimeout(500); await stick(p, 0, 0);
  await p.waitForTimeout(300); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  if (!met) { L.push(`      (M6 spin off contact: that attempt never met a body / never turned — armed ${armed} · marks ${ms.map((m) => m.msg).slice(0, 3).join(' | ') || 'none'})`); return false; }
  return gradeSpin(L, R, ms, 'M6 spin off contact', tS);
}
/** The shared spin bar: a full turn, readable, arcing, and it comes out INTO the drive. */
function gradeSpin(L: Lines, R: Row[], ms: Mark[], what: string, tS: number): boolean {
  const spinRows = R.filter((r) => r.clips.some((c) => /bball_spin/.test(c)));
  if (!spinRows.length) { say(L, false, `${what}: the spin never fired · marks ${ms.map((m) => m.msg).slice(0, 3).join(' | ') || 'none'} · clips ${clipsIn(R)}`); return false; }
  const a = spinRows[0].t, z = spinRows[spinRows.length - 1].t;
  const W = R.filter((r) => r.t >= a && r.t <= z);
  const sw = yawSweep(W);
  const sp = speeds(W);
  // the exit's own speed: a possession reset inside the window teleports the body (a 300 m/s "step") — those frames are
  // not the drive, so they are dropped rather than counted as one
  const exitWin = R.filter((r) => r.t > z - 30 && r.t <= z + 520);
  const exitSpeed = Math.max(0, ...speeds(exitWin).filter((v) => v < 12));
  const closed = W.length > 1 ? distRim(W[0]) - distRim(W[W.length - 1]) : 0;
  const banners = [...new Set(R.map((r) => r.banner).filter((b) => /SPIN/.test(b)))];
  say(L, has(ms, /MOVE\] spin (left|right)/) && spinRows.length >= 8, `${what} FIRES: ${spinRows.length} spin-clip frames over ${f0(z - a)} ms · ${ms.filter((m) => /MOVE\] spin/.test(m.msg)).map((m) => m.msg).join(' | ')}`);
  say(L, sw.total >= 300 && sw.total <= 420, `${what} is a FULL PIVOT: ${f0(sw.total)}° of yaw swept (300–420)`);
  say(L, sw.monotonic && sw.maxStep <= 32, `${what} is READABLE: one direction the whole way, biggest one-frame turn ${f0(sw.maxStep)}° (≤ 32 — a pivot, not a snap)`);
  say(L, Math.max(...sp) <= 8 && Math.max(...sp) >= 1.5, `${what} ARCS on a body: peak ${f2(Math.max(...sp))} m/s through the turn (1.5–8)`);
  say(L, closed >= 0.3, `${what} comes out toward the rim: ${f2(closed)} m closer over the pivot (≥ 0.3)`);
  say(L, exitSpeed >= 2.5, `${what} ends IN the drive: ${f2(exitSpeed)} m/s out of the turn (≥ 2.5 — it used to end standing still)`);
  say(L, banners.length > 0, `${what} tells me: ${banners.join(' | ') || 'no banner'}`);
  if (VERBOSE) for (let i = 0; i < W.length; i += 2) L.push(`        +${f0(W[i].t - tS)} yaw ${f0(W[i].yaw * 180 / Math.PI)}° sp ${f2(sp[i])} rim ${f2(distRim(W[i]))} ${W[i].win} ${W[i].clips.join(',')} ${W[i].banner}`);
  return true;
}

// ── wave 2 (AMEND-HOOPS-KIT-B-FOOTWORK + -EURO-HOP): M7–M14 ─────────────────────────────────────────────────────────
const r1 = (p: Page, on: boolean) => padSet(p, `p.buttons[5].pressed = ${on}; p.buttons[5].value = ${on ? 1 : 0}`);
/** Drive at the rim until inside `dist` (or the ball is gone). Returns whether it arrived. */
async function driveTo(p: Page, L: Lines, dist: number, sx = 0, sy = -1, maxMs = 6000): Promise<boolean> {
  await stick(p, sx, sy);
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const r = await lastRow(p);
    if (!mine(r) || /STOLEN|STRIPPED/.test(r.banner)) { await stick(p, 0, 0); L.push(`      (lost it on the way in: ${r.banner || r.poss})`); return false; }
    if (distRim(r) < dist) return true;
    await p.waitForTimeout(16);
  }
  L.push(`      (never reached ${dist} m: ${f2(distRim(await lastRow(p)))} m)`);
  await stick(p, 0, 0); return false;
}
/** The shared finish bar: the HUD named it, its own clip played, it resolved. */
function gradeFinish(L: Lines, R: Row[], tRel: number, what: string, label: RegExp, clip: RegExp, minClipFrames = 6): boolean {
  const types = [...new Set(R.map((r) => r.shotType).filter(Boolean))];
  const onClip = R.filter((r) => r.clips.some((c) => clip.test(c)));
  const named = types.some((t) => label.test(t));
  say(L, named, `${what}: the HUD names it — ${types.join(' | ') || 'no shot type'}`);
  say(L, onClip.length >= minClipFrames, `${what}: its OWN clip — ${onClip.length} frames · clips ${clipsIn(R.filter((r) => r.t <= tRel + 300))}`);
  say(L, shotResolved(R), `${what}: the shot resolved — ${[...new Set(R.map((r) => r.banner).filter(Boolean))].slice(0, 3).join(' | ') || 'no banner'}`);
  return named && onClip.length >= minClipFrames;
}

/** M7: a hook thrown ON THE MOVE, over a body in the lane. */
async function runningHookScenario(p: Page, L: Lines, slug: string): Promise<boolean> {
  if (!(await driveTo(p, L, 3.0))) return false;
  // the hook lives in the SHORT paint with him on my hip: keep moving (a standing squeeze is the jump hook) and wait
  await stick(p, 0, -0.4);
  const t0 = Date.now(); let read = false;
  while (Date.now() - t0 < 2200) {
    const r = await lastRow(p);
    if (!mine(r) || /STOLEN|STRIPPED/.test(r.banner)) { await stick(p, 0, 0); L.push(`      (lost it lining the hook up: ${r.banner})`); return false; }
    const d = distRim(r);
    if (d < 2.95 && d > 2.35 && r.foeDist >= 0 && r.foeDist < 1.85) { read = true; break; }
    if (d <= 2.3) break;
    await p.waitForTimeout(16);
  }
  if (!read) { await stick(p, 0, 0); L.push(`      (never got the hook's read: rim ${f2(distRim(await lastRow(p)))} m, foe ${f2((await lastRow(p)).foeDist)} m)`); return false; }
  const tS = await now(p);
  await rt(p, true); await p.waitForTimeout(220); await card(p, `${OUT}/${slug}-runhook.png`, 65, 3.4);
  await p.waitForTimeout(200); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(1300); await stick(p, 0, 0); const tZ = await now(p);
  const R = (await rows(p, tS - 200, tZ)).filter((r) => r.t >= tS - 200);
  const sp = speeds(R.filter((r) => r.t <= tS + 60));
  const moving = sp.length ? Math.max(...sp) : 0;
  const ok = gradeFinish(L, R, tRel, 'M7 the running hook', /HOOK/, /bball_hook/);
  say(L, moving >= 1.5, `M7 it was thrown ON THE MOVE: ${f2(moving)} m/s at the squeeze (≥ 1.5 — the jump hook is the standing one)`);
  return ok;
}
/** M8: the pump fake, then the step-through inside its window. */
async function pumpStepThrough(p: Page, L: Lines, slug: string): Promise<boolean> {
  if (!(await driveTo(p, L, 4.0))) return false;
  await stick(p, 0, 0); await p.waitForTimeout(200);
  const m0 = (await marks(p)).length;
  const tS = await now(p);
  await rt(p, true); await p.waitForTimeout(90); await rt(p, false);      // a SHORT squeeze: the pump
  await p.waitForTimeout(140); await card(p, `${OUT}/${slug}-pump.png`, 55, 3.2);
  const tP = await now(p);
  await p.waitForTimeout(140);
  await rt(p, true); await p.waitForTimeout(380); await rt(p, false);     // inside the window: the step-through
  const tRel = await now(p);
  await p.waitForTimeout(1400); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  const pumpRows = R.filter((r) => r.t <= tP + 200 && r.clips.some((c) => /pump_fake/.test(c)));
  const feet = R.filter((r) => r.t <= tP + 200).map((r) => r.y);
  const step = R.filter((r) => r.t > tP && r.clips.some((c) => /step_through/.test(c)));
  const types = [...new Set(R.filter((r) => r.t > tP).map((r) => r.shotType).filter(Boolean))];
  say(L, has(ms, /MOVE\] pump fake/) && pumpRows.length >= 4, `M8 the PUMP FAKE fires (an early release used to be a 0.35-pct brick): ${pumpRows.length} pump frames · ${ms.filter((m) => /pump/.test(m.msg)).map((m) => m.msg).join(' | ') || 'no mark'}`);
  say(L, Math.max(...feet, 0) < 0.05, `M8 the feet never leave on the fake: max root y ${f2(Math.max(...feet, 0))} (< 0.05)`);
  say(L, step.length >= 5 && types.some((t) => /STEP-THROUGH/.test(t)), `M8 the STEP-THROUGH takes the next squeeze: ${step.length} step frames · ${types.join(' | ') || 'no type'} · ${ms.filter((m) => /footwork/.test(m.msg)).map((m) => m.msg).join(' | ') || 'no mark'}`);
  const a = step[0], b = step[step.length - 1];
  const travel = a && b ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
  say(L, travel >= 0.25 && travel <= 1.1, `M8 it is a real STEP, and a legal one: ${f2(travel)} m across the step (0.25–1.1)`);
  say(L, shotResolved(R.filter((r) => r.t > tP)), `M8 the step-through finished: ${[...new Set(R.filter((r) => r.t > tP).map((r) => r.banner).filter(Boolean))].slice(0, 3).join(' | ') || 'no banner'}`);
  return true;
}
/** M9: the front pivot and the reverse pivot on a planted foot (L1 with nobody to back down). */
async function pivotScenario(p: Page, L: Lines, slug: string): Promise<boolean> {
  await stick(p, 0, 0); await p.waitForTimeout(200);
  const before = await lastRow(p);
  if (!mine(before)) return false;
  const m0 = (await marks(p)).length;
  const out: Array<{ what: string; sweep: number; moved: number; clip: number; banner: string }> = [];
  // the pad's y is INVERTED (up is negative), so +y here is the stick pulled BACK: across AND back is the reverse pivot
  for (const [what, sx, sy] of [['front', 1, 0], ['reverse', 0.75, 0.75]] as Array<[string, number, number]>) {
    // each pivot gets a fresh possession: the body starts facing the rim (so "across and back" means the same thing both
    // times) and the pivot's own cooldown has long expired
    if (what === 'reverse' && !(await waitOffense(p))) break;
    await stick(p, 0, 0); await p.waitForTimeout(200);
    await l1(p, true); await p.waitForTimeout(120);
    const tA = await now(p);
    await stick(p, sx, sy); await p.waitForTimeout(120);
    if (what === 'front') await card(p, `${OUT}/${slug}-pivot.png`, 50, 3.2);
    await p.waitForTimeout(420); await stick(p, 0, 0); await l1(p, false);
    await p.waitForTimeout(400);
    const tB = await now(p);
    const R = await rows(p, tA, tB);
    const pv = R.filter((r) => r.clips.some((c) => /bball_pivot/.test(c)));
    const W = pv.length ? R.filter((r) => r.t >= pv[0].t && r.t <= pv[pv.length - 1].t) : [];
    const sw = W.length ? yawSweep(W) : { total: 0, maxStep: 0, monotonic: false };
    const moved = W.length > 1 ? Math.max(...W.map((r) => Math.hypot(r.x - W[0].x, r.z - W[0].z))) : 0;
    out.push({ what, sweep: sw.total, moved, clip: pv.length, banner: [...new Set(R.map((r) => r.banner).filter((b) => /PIVOT/.test(b)))].join('|') });
    await p.waitForTimeout(1800);   // the pivot's own cooldown (SPIN_COOLDOWN_SEC)
  }
  const ms = (await marks(p)).slice(m0);
  const front = out[0] ?? { what: 'front', sweep: 0, moved: 9, clip: 0, banner: '' };
  const rev = out[1] ?? { what: 'reverse', sweep: 0, moved: 9, clip: 0, banner: '' };
  say(L, front.clip >= 5 && has(ms, /MOVE\] front pivot/), `M9 the FRONT pivot fires on the plant + the stick across: ${front.clip} pivot frames · ${ms.filter((m) => /pivot/.test(m.msg)).map((m) => m.msg).join(' | ') || 'no mark'}`);
  say(L, front.sweep >= 70 && front.sweep <= 150, `M9 the front pivot turns ${f0(front.sweep)}° (70–150)`);
  say(L, front.moved <= 0.5, `M9 the planted foot HOLDS: the body moved ${f2(front.moved)} m through the turn (≤ 0.5 — a pivot, not a step)`);
  say(L, rev.clip >= 5 && rev.sweep >= 130, `M9 the REVERSE pivot turns further, the other way: ${f0(rev.sweep)}° over ${rev.clip} frames (≥ 130)`);
  say(L, rev.moved <= 0.5, `M9 the reverse pivot stays home too: ${f2(rev.moved)} m`);
  say(L, /PIVOT/.test(front.banner + rev.banner), `M9 it tells me: ${[front.banner, rev.banner].filter(Boolean).join(' | ') || 'no banner'}`);
  return true;
}
/** M10: a protected rim is a floater over the length, not a layup into a chest. */
async function floaterOverLength(p: Page, L: Lines): Promise<boolean> {
  if (!(await driveTo(p, L, 2.6))) return false;
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) { const r = await lastRow(p); if (r.foeDist >= 0 && r.foeDist < 2.2) break; await p.waitForTimeout(16); }
  const tS = await now(p);
  await rt(p, true); await p.waitForTimeout(340); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(1500); await stick(p, 0, 0); const tZ = await now(p);
  const R = await rows(p, tS - 100, tZ);
  const apex = Math.max(...R.filter((r) => r.t > tRel).map((r) => r.ballY), 0);
  const types = [...new Set(R.map((r) => r.shotType).filter(Boolean))];
  const over = types.some((t) => /FLOATER|HOOK/.test(t));
  const near = R.find((r) => r.t >= tS)?.foeDist ?? -1;
  say(L, over && !types.some((t) => /^LAYUP/.test(t)), `M10 a PROTECTED rim is never a layup into his chest: he is ${f2(near)} m away and the shot is ${types.join(' | ') || 'no type'}`);
  say(L, R.some((r) => r.clips.some((c) => /bball_floater|bball_hook/.test(c))), `M10 it plays the OVER-him clip: ${clipsIn(R.filter((r) => r.t <= tRel + 300))}`);
  say(L, apex >= 3.6, `M10 it goes OVER him: ball apex ${f2(apex)} m (≥ 3.6 — a layup tops out at the rim)`);
  say(L, shotResolved(R), `M10 it resolved: ${[...new Set(R.map((r) => r.banner).filter(Boolean))].slice(0, 3).join(' | ') || 'no banner'}`);
  return over;
}
/** M11: a drive across / under the rim finishes reverse, off the glass. */
async function reverseScenario(p: Page, L: Lines, slug: string): Promise<boolean> {
  if (!(await driveTo(p, L, 1.3, 0.5, -0.85))) return false;
  await stick(p, -1, 0);                                          // run the baseline ACROSS the rim
  await p.waitForTimeout(110);
  const tS = await now(p);
  await rt(p, true); await p.waitForTimeout(200); await card(p, `${OUT}/${slug}-reverse.png`, 60, 3.2);
  await p.waitForTimeout(160); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(1400); await stick(p, 0, 0); const tZ = await now(p);
  const R = await rows(p, tS - 200, tZ);
  const inHand = R.filter((r) => r.t <= tRel + 60 && r.ballHand >= 0 && r.ballHand < 0.4);
  const behind = inHand.filter((r) => r.ballZ < r.z);             // the ball on the far side of the body from the court
  const ok = gradeFinish(L, R, tRel, 'M11 the reverse', /REVERSE/, /layup_reverse/);
  say(L, behind.length >= 2 || inHand.length === 0, `M11 the ball is laid back on the FAR side: ${behind.length} of ${inHand.length} in-hand frames behind the body`);
  return ok;
}
/** M12: R1 held from the wing calls glass — the ball is routed through the square. */
async function bankScenario(p: Page, L: Lines): Promise<boolean> {
  if (!(await driveTo(p, L, 4.4, 0.8, -0.6))) return false;
  await stick(p, 0, 0); await p.waitForTimeout(260);
  const tS = await now(p);
  await r1(p, true);
  await rt(p, true); await p.waitForTimeout(430); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(2000); await r1(p, false); const tZ = await now(p);   // the banked flight is a two-leg trip
  const R = await rows(p, tS, tZ), ms = (await marks(p)).filter((m) => m.t >= tS);
  const banners = [...new Set(R.map((r) => r.banner).filter(Boolean))];
  const called = banners.some((b) => /OFF THE GLASS/.test(b)) || has(ms, /MOVE\] called glass/);
  const flight = R.filter((r) => r.t > tRel && r.ballY > 2.0);
  // the square sits BEHIND the ring (z < RIM.z): a banked ball goes past it and comes back
  const past = flight.filter((r) => r.ballZ < RIM.z - 0.1);
  say(L, called, `M12 CALLED GLASS: ${ms.filter((m) => /called glass/.test(m.msg)).map((m) => m.msg).join(' | ') || 'no mark'} · ${banners.slice(0, 3).join(' | ') || 'no banner'}`);
  say(L, past.length >= 2, `M12 the ball goes to the SQUARE, behind the ring: ${past.length} flight frames past z ${f2(RIM.z - 0.1)} (a straight shot never gets there)`);
  say(L, shotResolved(R), `M12 the bank resolved: ${banners.slice(0, 4).join(' | ') || 'no banner'}`);
  return called;
}
/** Is a body between me and the rim right now (the probe's own read of the mode's helpInTheWay)? */
function bodyInTheWay(r: Row): boolean {
  if (r.foeDist < 0) return false;
  const tx = RIM.x - r.x, tz = RIM.z - r.z, tn = Math.hypot(tx, tz) || 1;
  const ux = tx / tn, uz = tz / tn;
  const rx = r.foeX - r.x, rz = r.foeZ - r.z;
  const along = rx * ux + rz * uz;
  return along > 0 && along <= 2.4 && Math.abs(rx * uz - rz * ux) <= 1.2;
}
/** M13: the hop step — an explosive gather into a CLEAR lane (with a body in the way the face-up read owns the squeeze:
 *  you hook over him or float it, which is the point of that gate). The probe drives past his hip first. */
async function hopStep(p: Page, L: Lines, slug: string): Promise<boolean> {
  // squeeze on the FIRST frame inside the hop's range with the lane still clear — the on-ball defender closes onto the
  // line within about a second of the check, and a long approach is a poke waiting to happen
  await stick(p, 0, -1);
  const t0 = Date.now(); let clear = false;
  while (Date.now() - t0 < 6000) {
    const r = await lastRow(p);
    if (!mine(r) || /STOLEN|STRIPPED/.test(r.banner)) { await stick(p, 0, 0); L.push(`      (lost it lining the hop up: ${r.banner})`); return false; }
    const d = distRim(r);
    if (d < 4.9 && d > 3.0 && (r.foeDist < 0 || r.foeDist > 1.9)) { clear = true; break; }   // not on my hip: the hop is the read
    if (d <= 3.0) break;
    await p.waitForTimeout(16);
  }
  if (!clear) { await stick(p, 0, 0); L.push(`      (never got the hop's read: rim ${f2(distRim(await lastRow(p)))} m, foe ${f2((await lastRow(p)).foeDist)} m)`); return false; }
  const tS = await now(p);
  await rt(p, true);                                              // full stick still held: sprint = an explosive gather
  await p.waitForTimeout(180); await card(p, `${OUT}/${slug}-hop.png`, 55, 3.4);
  await p.waitForTimeout(220); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(1900); await stick(p, 0, 0); const tZ = await now(p);
  const R = await rows(p, tS - 100, tZ), ms = await marks(p);
  const hop = R.filter((r) => r.clips.some((c) => /hop_step/.test(c)));
  const types = [...new Set(R.map((r) => r.shotType).filter(Boolean))];
  const a = hop[0], b = hop[hop.length - 1];
  const travel = a && b ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
  say(L, hop.length >= 5 && types.some((t) => /HOP STEP/.test(t)), `M13 the HOP STEP takes the squeeze: ${hop.length} hop frames · ${types.join(' | ') || 'no type'}`);
  say(L, travel > 0.1 && travel <= 0.95, `M13 a LEGAL gather: ${f2(travel)} m across the hop (≤ 0.95 — a hop, not a travel pop)`);
  say(L, shotResolved(R), `M13 it finished: ${[...new Set(R.map((r) => r.banner).filter(Boolean))].slice(0, 3).join(' | ') || 'no banner'}`);
  return hop.length >= 5;
}
/** M14: the euro — the stick sells a side at the squeeze, against help. */
async function euroStep(p: Page, L: Lines, slug: string): Promise<boolean> {
  if (!(await driveTo(p, L, 4.0))) return false;
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) { const r = await lastRow(p); if (r.foeDist >= 0 && r.foeDist < 2.6) break; await p.waitForTimeout(16); }
  const tS = await now(p);
  await stick(p, 0.85, -0.5);                                     // sell to one side …
  await p.waitForTimeout(30);
  await rt(p, true); await p.waitForTimeout(240); await card(p, `${OUT}/${slug}-euro.png`, 60, 3.6);
  await p.waitForTimeout(220); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(1400); await stick(p, 0, 0); const tZ = await now(p);
  const R = await rows(p, tS - 100, tZ), ms = await marks(p);
  const euro = R.filter((r) => r.clips.some((c) => /euro_step/.test(c)));
  const types = [...new Set(R.map((r) => r.shotType).filter(Boolean))];
  say(L, euro.length >= 6 && types.some((t) => /EURO/.test(t)), `M14 the EURO takes the squeeze: ${euro.length} euro frames · ${types.join(' | ') || 'no type'} · ${ms.filter((m) => /footwork euro/.test(m.msg)).map((m) => m.msg).join(' | ') || 'no mark'}`);
  if (euro.length >= 3) {
    // the two steps go OPPOSITE ways across the drive line: sample the lateral offset at A and at B
    const a = euro[0], mid = euro[Math.floor(euro.length * 0.45)], b = euro[euro.length - 1];
    const dirX = Math.sin(a.yaw), dirZ = Math.cos(a.yaw);
    const lat = (r: Row) => (r.x - a.x) * dirZ - (r.z - a.z) * dirX;
    say(L, Math.sign(lat(mid)) !== 0 && Math.sign(lat(b) - lat(mid)) !== Math.sign(lat(mid)), `M14 SELL then CROSS: lateral ${f2(lat(mid))} m at step A, ${f2(lat(b))} m by step B (it comes back the other way)`);
    say(L, Math.hypot(b.x - a.x, b.z - a.z) >= 0.5, `M14 it covers ground: ${f2(Math.hypot(b.x - a.x, b.z - a.z))} m across the two steps (≥ 0.5)`);
  } else { say(L, false, 'M14 SELL then CROSS: no euro to measure'); say(L, false, 'M14 it covers ground: no euro to measure'); }
  say(L, shotResolved(R), `M14 the euro finished: ${[...new Set(R.map((r) => r.banner).filter(Boolean))].slice(0, 3).join(' | ') || 'no banner'}`);
  return euro.length >= 6;
}

/** Run a scenario up to `tries` times and report the attempt that actually reached its setup — a drive that is stripped
 *  on the way in has measured nothing, and its bars are noise, not findings. The notes from every attempt are kept. */
async function attempt(p: Page, out: Lines, tries: number, fail: string, fn: (L: Lines) => Promise<boolean>): Promise<boolean> {
  const notes: Lines = [];
  for (let a = 0; a < tries; a++) {
    if (!(await waitOffense(p))) break;
    const L: Lines = [];
    const ok = await fn(L);
    if (ok) { out.push(...notes, ...L); return true; }
    notes.push(...L.filter((l) => l.startsWith('      ')));
    if (a === tries - 1) out.push(...notes, ...L.filter((l) => !l.startsWith('      ')));
  }
  out.push(`FAIL  ${fail}`);
  return false;
}

(async () => {
  const out: string[] = [`HOOPS-MOVE-KIT-B probe · ${MODE} · ${TAG} · port ${PORT} · ${new Date().toISOString()}`];
  const { p, close, errors, frames } = await boot();
  try {
    if (want('post')) { out.push('\n## 1. the PATH — the post-up seal (L1 held with a body to back down)');
      let got = false; for (let a = 0; a < 6 && !got; a++) { if (!(await waitOffense(p))) break; got = await postUp(p, out, `${TAG}-${MODE}`); }
      if (!got) out.push('FAIL  the post-up never got a possession at the block in 6 tries'); }
    if (want('fade')) { out.push('\n## 2. M4 — the POST FADEAWAY (the stick pulled off the rim at the squeeze)');
      let got = false; for (let a = 0; a < 6 && !got; a++) { if (!(await waitOffense(p))) break; got = await fadeaway(p, out, `${TAG}-${MODE}`); }
      if (!got) out.push('FAIL  M4 no fadeaway reached the block in 6 tries'); }
    if (want('hook')) { out.push('\n## 3. M5 — the JUMP HOOK (the post squeeze, no pull off the rim)');
      let got = false; for (let a = 0; a < 6 && !got; a++) { if (!(await waitOffense(p))) break; got = await hook(p, out, `${TAG}-${MODE}`); }
      if (!got) out.push('FAIL  M5 no hook reached the block in 6 tries'); }
    if (want('spinpost')) { out.push('\n## 4. M6 — the QUICK SPIN out of the post (the stick swung across the seal)');
      let got = false; for (let a = 0; a < 6 && !got; a++) { if (!(await waitOffense(p))) break; got = await spinPost(p, out, `${TAG}-${MODE}`); }
      if (!got) out.push('FAIL  M6 no post spin reached the block in 6 tries'); }
    if (want('spindrive')) { out.push('\n## 5. M6 — the SPIN OFF CONTACT (a drive straight into the body in front of it)');
      let got = false; for (let a = 0; a < 6 && !got; a++) { if (!(await waitOffense(p))) break; got = await spinDrive(p, out, `${TAG}-${MODE}`); }
      if (!got) out.push('FAIL  M6 no drive met a body in 6 tries'); }
    // ── wave 2 ──
    if (want('runhook')) { out.push('\n## 6. M7 — the RUNNING HOOK (thrown on the move, over a body in the lane)');
      await attempt(p, out, 5, 'M7 no running hook reached its setup in 5 tries', (L) => runningHookScenario(p, L, `${TAG}-${MODE}`)); }
    if (want('pump')) { out.push('\n## 7. M8 — the PUMP FAKE and the STEP-THROUGH');
      await attempt(p, out, 5, 'M8 no pump / step-through reached its setup in 5 tries', (L) => pumpStepThrough(p, L, `${TAG}-${MODE}`)); }
    if (want('pivot')) { out.push('\n## 8. M9 — the PIVOT and the REVERSE PIVOT (L1 planted, the stick across)');
      await attempt(p, out, 4, 'M9 no possession to pivot on in 4 tries', (L) => pivotScenario(p, L, `${TAG}-${MODE}`)); }
    if (want('floater')) { out.push('\n## 9. M10 — the FLOATER / the shot OVER a protected rim');
      await attempt(p, out, 5, 'M10 no protected-rim finish reached its setup in 5 tries', (L) => floaterOverLength(p, L)); }
    if (want('reverse')) { out.push('\n## 10. M11 — the REVERSE layup (carried across the rim, off the glass)');
      await attempt(p, out, 8, 'M11 no reverse reached its setup in 8 tries', (L) => reverseScenario(p, L, `${TAG}-${MODE}`)); }
    if (want('bank')) { out.push('\n## 11. M12 — the BANK (R1 held from the wing: called glass)');
      await attempt(p, out, 5, 'M12 no called bank reached its setup in 5 tries', (L) => bankScenario(p, L)); }
    if (want('hop')) { out.push('\n## 12. M13 — the HOP STEP (an explosive gather into a clear lane)');
      await attempt(p, out, 5, 'M13 no hop step reached its setup in 5 tries', (L) => hopStep(p, L, `${TAG}-${MODE}`)); }
    if (want('euro')) { out.push('\n## 13. M14 — the EURO STEP (sell one way, cross the other, against help)');
      await attempt(p, out, 5, 'M14 no euro reached its setup in 5 tries', (L) => euroStep(p, L, `${TAG}-${MODE}`)); }
  } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 300)}`); }
  const ms = await marks(p);
  out.push(`\nwarnings: ${ms.filter((m) => /^WARN/.test(m.msg)).slice(0, 4).map((m) => m.msg).join(' | ') || 'none'}`);
  await close();
  out.push(`console errors: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 8).join('\n  ') : ''}`);
  out.push(`FEL-FRAME / MISSING CLIP: ${frames.length}${frames.length ? '\n  ' + [...new Set(frames)].slice(0, 6).join('\n  ') : ''}`);
  const pass = out.filter((l) => l.startsWith('PASS')).length, fail = out.filter((l) => l.startsWith('FAIL')).length;
  out.push(`\nTOTAL PASS ${pass} · FAIL ${fail}`);
  writeFileSync(`${OUT}/report-${MODE}-${TAG}.md`, out.join('\n'));
  console.log(out.join('\n'));
})();
