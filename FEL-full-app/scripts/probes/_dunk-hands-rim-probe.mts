// DUNK-HANDS-RIM probe (2026-09-08): the HANDS and the RIM on /dev/mode/dunk, per rendered frame off the live rig.
//   H1 wrist lag   — the ball hand's distance to the iron through the hang → the press: continuous (no whip), closing, the hand
//                    arriving at the iron AFTER the body (the lag, ms) — never rigid on the clip
//   H3 CONTACT     — press → contact (ms), ONE hit-stop on the contact frame (animationTimeScale ≤ 0.01, ≤ 90 ms, restored),
//                    NO second slow-mo after the rise's, a camera shake, one slam thud, one hoop punch
//   H4 palm stick  — the ball parented to a hand every frame from the reach to the release, its local offset ON the palm
//                    (Δ ≤ 1 cm), and through the jam the ball within reach of the palm until the contact frame
//   H5 no T-pose   — no idle / rest clip while airborne, no clip-less frame, no T frame from the press through feet-down + 450 ms
//   RIM            — the hoop answers ONCE per make (juice_rim shown, net squash depth), never on a miss
// Pad driver (pre-boot fake DualShock). Closeups: the active camera parked at the ball hand for the eye (hang / extend / jam / contact).
//   PORT=3004 npx tsx scripts/probes/_dunk-hands-rim-probe.mts        (SCEN= · OUT_DIR= · TAG= · QS= · VERBOSE=1)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const PORT = process.env.PORT ?? '3004', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-hands-rim', TAG = process.env.TAG ?? 'after';
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE;
mkdirSync(OUT, { recursive: true });
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

type V = { x: number; y: number; z: number };
type Row = { t: number; dt: number; y: number; z: number; ats: number; phase: string; ppw: string; win: string; clips: string[];
  rh: V; lh: V; rhRim: number; lhRim: number; ballParent: string; ball: V; ballLocal: V; localOff: number; ballPalm: number; ballRim: number;
  cam: V; lat: number; lhy: number; rhy: number; shy: number; elb: number; rimVis: boolean; rimS: number; rimY: number; netS: number; netRot: number; banner: string; hint: string; finishRelease: number };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';
interface Scenario { name: string; prop: 'none' | 'car'; rt?: number; hold?: number; style?: 'power' | 'flashy' | 'sig'; air?: { at: number; dir?: Dir; btn: Btn }[]; slam?: boolean; slamAt?: number; hang?: boolean; gates: ('H1' | 'H3' | 'H4' | 'H5' | 'RIM')[] }
const S: Scenario[] = [
  { name: 'plain POWER make — H1 lag, H3 punch, H4 stick, H5 latch, rim', prop: 'none', gates: ['H1', 'H3', 'H4', 'H5', 'RIM'] },
  { name: 'SIG eastbay make — the left hand carries (H4 across the hand-off), H1/H3', prop: 'none', style: 'sig', gates: ['H1', 'H3', 'H4', 'H5', 'RIM'] },
  { name: 'RIM HANG make — SLAM held through the flush', prop: 'none', hang: true, gates: ['H1', 'H3', 'H4', 'RIM'] },
  { name: 'plain MISS (no slam) — H5 brace, no punch, no hoop', prop: 'none', slam: false, gates: ['H5', 'RIM'] },
  { name: 'CAR clipped (weak run) — H5 on the blown path', prop: 'car', rt: 0.25, hold: 900, slam: false, gates: ['H5', 'RIM'] },
  { name: 'SCORPION make (right+Y at +100 ms) — H1/H4 under a trick body', prop: 'none', air: [{ at: 100, dir: 'right', btn: 'Y' }], gates: ['H1', 'H3', 'H4', 'H5'] },
  { name: 'LATE-slam POWER make (taps from +1560 ms: the hang / tomahawk finish, not the windmill)', prop: 'none', slamAt: 1560, gates: ['H1', 'H3', 'H4', 'H5', 'RIM'] },
];

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
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
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const S = window.__smp = { rows: [], marks: [] };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|DUNK-PP|DUNK-PROP|DUNK-TRICK|DUNK-CUE|HANDS|JUICE-SOFT|JUICE-SFX|JUICE-LOOK|FEL-DUNK|LOB)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 180) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL|HANDS/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 180) }); ow(...a); };
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    const RIM = { x: 0, y: 3.05, z: -10.28 }, RIM_T = { x: 0, y: 3.13, z: -10.28 };   // the reach target = rim + HAND_IK_RIM_UP
    const PALM = { x: 0.12, y: -0.04, z: -0.08 };   // ballRig.PALM_OFFSET (the ball's centre in the hand frame)
    let heroSeen = null, N = {};
    const V = (v) => ({ x: v.x, y: v.y, z: v.z });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\\\d+|_p\\\\d+)?$').test(n.name)) ?? null; N = { LA: f('LeftArm'), RA: f('RightArm'), LE: f('LeftForeArm'), RE: f('RightForeArm'), LH: f('LeftHand'), RH: f('RightHand') }; }
      if (!N.LA || !N.RA || !N.LH || !N.RH) return;
      const fresh = (n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
      h.computeWorldMatrix(true); for (const n of Object.values(N)) if (n) fresh(n);
      const P = (n) => n.getAbsolutePosition();
      const la = P(N.LA), ra = P(N.RA), lh = P(N.LH), rh = P(N.RH);
      const ball = scene.getMeshByName('ball'); let ballParent = '', ballW = { x: 0, y: 0, z: 0 }, ballL = { x: 0, y: 0, z: 0 }, localOff = -1, ballPalm = -1;
      if (ball) { ballParent = ball.parent ? ball.parent.name : ''; ball.computeWorldMatrix(true); ballW = V(ball.getAbsolutePosition()); ballL = V(ball.position);
        const hand = ballParent ? ball.parent : (ballW.y > 0 ? (dist(ballW, rh) < dist(ballW, lh) ? N.RH : N.LH) : null);
        if (ballParent) localOff = dist(ballL, PALM);
        if (hand) { hand.computeWorldMatrix(true); const m = hand.getWorldMatrix(); const pw = { x: PALM.x * m.m[0] + PALM.y * m.m[4] + PALM.z * m.m[8] + m.m[12], y: PALM.x * m.m[1] + PALM.y * m.m[5] + PALM.z * m.m[9] + m.m[13], z: PALM.x * m.m[2] + PALM.y * m.m[6] + PALM.z * m.m[10] + m.m[14] }; ballPalm = dist(ballW, pw); } }
      const elbow = (a, e, hd) => { const u = { x: e.x - a.x, y: e.y - a.y, z: e.z - a.z }, v = { x: hd.x - e.x, y: hd.y - e.y, z: hd.z - e.z }; const nu = Math.hypot(u.x, u.y, u.z) || 1, nv = Math.hypot(v.x, v.y, v.z) || 1; return 180 - Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv)))) * 180 / Math.PI; };
      const elb = N.LE && N.RE ? Math.min(elbow(la, P(N.LE), lh), elbow(ra, P(N.RE), rh)) : 180;
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const pp = dev.dunkPosture ? dev.dunkPosture.get() : { window: '?', phase: '?', finishRelease: -1 };
      const jr = scene.getMeshByName('juice_rim'), jn = scene.getTransformNodeByName('juice_net_pivot');
      const cam = scene.activeCamera;
      S.rows.push({ t: performance.now(), dt: scene.getEngine().getDeltaTime(), y: h.position.y, z: h.position.z, ats: scene.animationTimeScale ?? 1, phase: pp.phase, ppw: pp.window, win: S.marks.filter((m) => /DUNK-WIN/.test(m.msg)).slice(-1)[0]?.msg.slice(11) ?? '', clips,
        rh: V(rh), lh: V(lh), rhRim: dist(rh, RIM_T), lhRim: dist(lh, RIM_T), ballParent, ball: ballW, ballLocal: ballL, localOff, ballPalm, ballRim: dist(ballW, RIM),
        cam: cam ? V(cam.position) : { x: 0, y: 0, z: 0 }, lat: (() => { const ax = ra.x - la.x, az = ra.z - la.z, n = Math.hypot(ax, az) || 1; return Math.abs(((lh.x - rh.x) * ax + (lh.z - rh.z) * az) / n); })(), lhy: lh.y - h.position.y, rhy: rh.y - h.position.y, shy: (la.y + ra.y) / 2 - h.position.y, elb,
        rimVis: !!jr && jr.isVisible, rimS: jr ? jr.scaling.x : 1, rimY: jr ? jr.position.y : RIM.y, netS: jn ? jn.scaling.y : 1, netRot: jn ? jn.rotation.z : 0, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? ''), finishRelease: pp.finishRelease ?? -1 });
      if (S.rows.length > 40000) S.rows.splice(0, 10000);
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors, frames };
}

const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
const stickUp = (p: Page, on: boolean) => padSet(p, `p.axes[1] = ${on ? -1 : 0}`);
const runHold = (p: Page, on: boolean, v = 1) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`);
const btn = (p: Page, b: Btn, on: boolean) => padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`);
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
const dpad = (p: Page, d: Dir, on: boolean) => padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`);
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
/** A hand CLOSEUP: the active camera parked beside the ball hand looking at it, for a few frames around the shot. */
async function closeShot(p: Page, path: string, angleDeg = 40, dist = 0.7): Promise<void> {
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; }
    const a = ${angleDeg} * Math.PI / 180, dist = ${dist};
    window.__card = scene.onBeforeCameraRenderObservable.add((cam) => {
      const h = dev.hero(); if (!h || cam !== scene.activeCamera) return;
      const ball = scene.getMeshByName('ball'); const d = h.getDescendants(false);
      const hand = (ball && ball.parent) ? ball.parent : d.find((n) => /^RightHand(_c\\d+|_p\\d+)?$/.test(n.name)); if (!hand) return;
      hand.computeWorldMatrix(true); const c = hand.getAbsolutePosition().clone();
      if (ball && ball.parent) { ball.computeWorldMatrix(true); c.copyFrom(ball.getAbsolutePosition()); }
      // the hero attacks the rim along −z: the closeup sits on his right side (+x), ahead of the hand by the angle, a touch above
      const dx = Math.cos(a), dz = -Math.sin(a);
      cam.position.set(c.x + dx * dist, c.y + 0.12, c.z + dz * dist);
      if (cam.rotationQuaternion) cam.rotationQuaternion = null;
      cam.setTarget(c);
      cam.getViewMatrix(true);
    });
  })()`);
  await p.waitForTimeout(40);
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
let curProp: 'none' | 'car' = 'none', curStyle: 'power' | 'flashy' | 'sig' = 'power';
async function setProp(p: Page, want: 'none' | 'car', lines: string[]): Promise<void> {
  if (want === 'none') { await dpad(p, 'up', true); await p.waitForTimeout(90); await dpad(p, 'up', false); }
  else if (curProp !== 'car') { await dpad(p, 'down', true); await p.waitForTimeout(90); await dpad(p, 'down', false); }
  curProp = want;
  await p.waitForTimeout(want === 'none' ? 250 : 1300);
  const shown = await hudProp(p);
  lines.push(`${shown === (want === 'none' ? 'NO PROP' : 'CAR') ? 'PASS' : 'FAIL'}  prop ${want} → HUD "${shown}"`);
}
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2), f3 = (n: number) => n.toFixed(3);
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

async function attempt(p: Page, sc: Scenario, idx: number): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  const m0 = (await marks(p)).length, tA = await now(p);
  await setProp(p, sc.prop, lines);
  { const ring = ['power', 'flashy', 'sig'] as const; const want = sc.style ?? 'power'; const n = (ring.indexOf(want) - ring.indexOf(curStyle) + 3) % 3; for (let i = 0; i < n; i++) { await tapBtn(p, 'B'); await p.waitForTimeout(140); } curStyle = want; if (n) lines.push(`      style → ${want}`); }
  const slug = `${TAG}-${idx}-${sc.name.split(/[ (—]/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const shot = async (name: string) => { await p.screenshot({ path: `${OUT}/${slug}-${name}.png` }); };
  await stickUp(p, true);
  await p.waitForTimeout(250);
  await runHold(p, true, sc.rt ?? 1);
  const holdStart = Date.now();
  let launched = false, launchPage = 0;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  while (!launched && Date.now() - holdStart < 3200) { const el = Date.now() - holdStart; if (sc.hold != null && el >= sc.hold) break; await p.waitForTimeout(30); await launchedYet(); }
  await runHold(p, false); await stickUp(p, false);
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 2000) await p.waitForTimeout(40);
  if (!launched) { lines.push('FAIL  never launched'); return lines; }
  const pageNow = await now(p);
  const sinceLaunch = () => Date.now() - (r0 - (pageNow - launchPage));
  const air = [...(sc.air ?? [])].sort((a, b) => a.at - b.at);
  const shotsDone = new Set<string>();
  let slamOn = sc.slam !== false, pressed = false;
  // the SLAM taps run on their own clock (a screenshot in the shot loop opens a gap wider than the window); a HANG holds A on the press
  const slamLoop = (async () => { let next = sc.slamAt ?? 950; while (slamOn && sinceLaunch() < 2300) { const el = sinceLaunch(); if (el >= next) { if (sc.hang) { await btn(p, 'A', true); await new Promise((r) => setTimeout(r, 60)); const r = await lastRow(p); if (r.phase === 'resolve') { pressed = true; const t0 = Date.now(); while (Date.now() - t0 < 2200) { const rr = await lastRow(p); if (rr.win === 'contact') break; await new Promise((r2) => setTimeout(r2, 15)); } await new Promise((r2) => setTimeout(r2, 700)); await btn(p, 'A', false); break; } await btn(p, 'A', false); } else await tapBtn(p, 'A', 60); next = el + 85; } await new Promise((r) => setTimeout(r, 15)); } })();
  while (sinceLaunch() < 2700) {
    const el = sinceLaunch();
    if (air.length && el >= air[0].at) { const a = air.shift()!; if (a.dir) { await dpad(p, a.dir, true); await p.waitForTimeout(20); } await tapBtn(p, a.btn, 70); if (a.dir) await dpad(p, a.dir, false); lines.push(`      air ${a.dir ?? ''}+${a.btn} at +${el} ms`); }
    const r = await lastRow(p);
    const want = (k: string, cond: boolean) => { if (cond && !shotsDone.has(k)) { shotsDone.add(k); return true; } return false; };
    if (want('hang', r.ppw === 'hang' && el > 120)) { await closeShot(p, `${OUT}/${slug}-close-hang.png`); }
    if (want('extend', r.ppw === 'extend')) { await closeShot(p, `${OUT}/${slug}-close-extend.png`); }
    if (want('jam', r.ppw === 'jam' || r.phase === 'resolve')) { await shot('jam'); await closeShot(p, `${OUT}/${slug}-close-jam.png`, 55); }
    if (want('contact', r.win === 'contact')) { await shot('contact'); await closeShot(p, `${OUT}/${slug}-close-contact.png`, 55); }
    await p.waitForTimeout(20);
  }
  slamOn = false; await slamLoop;
  void pressed;
  const tEnd0 = Date.now(); while (Date.now() - tEnd0 < 12000) { const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND|RIVAL ROUND/.test(t) && !/SLAM!|CONFER|CARD/.test(t) && Date.now() - tEnd0 > 1500) break; await p.waitForTimeout(120); }
  const tZ = await now(p);
  const ms = (await marks(p)).slice(m0), R = await rows(p, tA, tZ);
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg));
  const mark = (re: RegExp) => ms.find((m) => re.test(m.msg));
  const count = (re: RegExp) => ms.filter((m) => re.test(m.msg)).length;
  const made = has(/DUNK-WIN\] contact/);
  const contactM = mark(/DUNK-WIN\] contact/), landM = mark(/HANDS\] land /), reachOn = mark(/HANDS\] reach on/);
  const pressRow = R.find((r) => r.t > launchPage && r.phase === 'resolve');
  const pressT = pressRow?.t ?? -1;
  const resolveT = contactM?.t ?? mark(/miss clank|\[LOB\] LOST|CLIPPED/)?.t ?? launchPage + 1700;
  lines.push(`      ${made ? 'MAKE' : 'MISS'} · press @+${pressT > 0 ? f0(pressT - launchPage) : '—'} ms · resolve @+${f0(resolveT - launchPage)} ms${contactM ? ` · CONTACT @+${f0(contactM.t - launchPage)} ms (press → contact ${pressT > 0 ? f0(contactM.t - pressT) : '—'} ms)` : ''} · reach on @+${reachOn ? f0(reachOn.t - launchPage) : '—'} ms · land @+${landM ? f0(landM.t - launchPage) : '—'} ms${has(/HANDS\] rim hang/) ? ` · RIM HANG ${mark(/HANDS\] hang release/)?.msg.slice(21) ?? '(no release mark)'}` : ''}${mark(/HANDS\] iron contact/) ? ` · ${mark(/HANDS\] iron contact/)!.msg.slice(8)}` : ''}`);
  const isT = (r: Row) => r.lat >= 0.95 && Math.abs(r.lhy - r.shy) < 0.22 && Math.abs(r.rhy - r.shy) < 0.22 && r.elb >= 150;
  const ballHandOf = (r: Row) => (/Left/.test(r.ballParent) ? 'L' : 'R');
  const handRim = (r: Row, side: 'L' | 'R') => (side === 'L' ? r.lhRim : r.rhRim);
  // ── H1: the wrist into the rim — from the reach's start to the press ──
  if (sc.gates.includes('H1')) {
    if (made && reachOn && pressT > 0) {
      const seg = R.filter((r) => r.t >= reachOn.t && r.t <= pressT + 40);
      const side = ballHandOf(seg[seg.length - 1] ?? R[0]);
      const d = seg.map((r) => handRim(r, side));
      let maxStep = 0, maxHandStep = 0; for (let i = 1; i < seg.length; i++) { maxStep = Math.max(maxStep, d[i] - d[i - 1]); maxHandStep = Math.max(maxHandStep, dist(side === 'L' ? seg[i].lh : seg[i].rh, side === 'L' ? seg[i - 1].lh : seg[i - 1].rh)); }
      const atPress = d[d.length - 1], start = d[0];
      // the LAG: the body's z reaches its flush position (within 0.3 m) before the hand reaches the iron (within 0.3 m of the reach target)
      const ic = /iron contact (\d+) ms into the jam: ball ([\d.]+) m from the rim centre \(([\d.]+) m\)/.exec(mark(/HANDS\] iron contact/)?.msg ?? '');
      const lag = ic ? Number(ic[1]) : NaN, ballOff = ic ? Number(ic[2]) : NaN, ballY = ic ? Number(ic[3]) : NaN;   // the body arrives at the flush point on the press (or the windmill's top); the ball follows into the iron
      // after the press: the jam — the hand ON the iron (≤ 0.2 m of the reach target) by the contact frame, no step
      const jam = R.filter((r) => r.t >= pressT - 20 && r.t <= (contactM?.t ?? pressT + 600) + 20);
      const jd = jam.map((r) => handRim(r, side)); let jamStep = 0; for (let i = 1; i < jam.length; i++) jamStep = Math.max(jamStep, Math.abs(jd[i] - jd[i - 1]));
      const jamMin = Math.min(atPress, ...jd);
      say(seg.length > 3 && maxHandStep <= 0.35 && atPress <= 0.55 && atPress < start && Number.isFinite(lag) && lag >= 0 && lag < 280 && ballOff <= 0.30 && ballY >= 3.02 && jamStep <= 0.30, `H1 wrist lag (${side} hand): reach on @+${f0(reachOn.t - launchPage)} → press @+${f0(pressT - launchPage)} ms, hand→iron ${f2(start)} → ${f2(atPress)} m (≤ 0.55 at the press), max hand step ${f2(maxHandStep)} m/frame (≤ 0.35 = no whip), max opening ${f2(maxStep)} m/frame, LAG ball-at-the-iron ${Number.isFinite(lag) ? f0(lag) + ' ms into the jam' : 'NEVER'} (< 280 = before the timeout), ball ${f2(ballOff)} m from the rim centre at ${f2(ballY)} m (≤ 0.30, ≥ 3.02 = on the ring, not under it), jam: wrist→reach point min ${f2(jamMin)} m, max jam step ${f2(jamStep)} m/frame`);
      if (VERBOSE) lines.push(`        hand→iron: ${seg.filter((_, i) => i % 3 === 0).map((r, i) => `+${f0(r.t - launchPage)}:${f2(d[i * 3])}`).join(' ')}`);
    } else lines.push(`      H1 not graded: ${made ? 'no reach / press mark' : 'MISSED'}`);
  }
  // ── H3: CONTACT — one hit-stop on the contact frame, no second slow-mo, a shake, one thud, one hoop punch ──
  if (sc.gates.includes('H3')) {
    if (made && contactM && pressT > 0) {
      const after = R.filter((r) => r.t >= contactM.t - 5 && r.t <= contactM.t + 400);
      const stopRows = after.filter((r) => r.ats <= 0.01); const stopMs = stopRows.length ? stopRows[stopRows.length - 1].t - stopRows[0].t + stopRows[0].dt : 0;
      const stopAt = stopRows.length ? stopRows[0].t - contactM.t : NaN;
      const restored = after.some((r) => stopRows.length > 0 && r.t > stopRows[stopRows.length - 1].t && r.ats >= 0.9);
      const flight = R.filter((r) => r.t > launchPage && r.t < contactM.t);
      const slowBefore = flight.filter((r) => r.ats > 0.05 && r.ats <= 0.6).length, slowAfter = after.filter((r) => r.ats > 0.05 && r.ats <= 0.6).length;
      let shake = 0; for (let i = 1; i < after.length; i++) shake = Math.max(shake, dist(after[i].cam, after[i - 1].cam));
      const rootDrop = pressRow!.y - (after[after.length - 1]?.y ?? pressRow!.y);
      say(stopRows.length >= 1 && stopMs <= 95 && Number.isFinite(stopAt) && stopAt <= 40 && restored && slowAfter === 0 && count(/JUICE-SFX\] impact slam/) === 1 && count(/JUICE-LOOK\] punch/) === 1 && shake >= 0.015, `H3 CONTACT: press → contact ${f0(contactM.t - pressT)} ms, hit-stop ${stopRows.length} frames / ${f0(stopMs)} ms starting +${Number.isFinite(stopAt) ? f0(stopAt) : '—'} ms after the contact mark (≤ 90 ms, restored ${restored}), slow-mo frames before ${slowBefore} (the hang's) / after ${slowAfter} (must be 0), camera step ${f3(shake)} m (shake ≥ 0.015), slam thud ×${count(/JUICE-SFX\] impact slam/)}, hoop punch ×${count(/JUICE-LOOK\] punch/)}, root drop through the beat ${f2(rootDrop)} m`);
    } else lines.push(`      H3 not graded: ${made ? 'no contact mark' : 'MISSED'}`);
  }
  // ── H4: the ball in the palm — parented every frame from the reach to the release, the offset on the palm, the jam ──
  if (sc.gates.includes('H4')) {
    if (made && reachOn && pressT > 0) {
      const carry = R.filter((r) => r.t >= reachOn.t && r.t < pressT);
      const unparented = carry.filter((r) => !r.ballParent).length, offMax = Math.max(0, ...carry.map((r) => r.localOff)), palmMax = Math.max(0, ...carry.map((r) => r.ballPalm));
      const parents = [...new Set(carry.map((r) => r.ballParent))];
      const jam = R.filter((r) => r.t >= pressT && r.t <= (contactM?.t ?? pressT + 600));
      const jamPalm = jam.map((r) => r.ballPalm); const jamPalmMax = Math.max(0, ...jamPalm);
      const releaseRow = jam.find((r) => !r.ballParent); const releaseAt = releaseRow ? releaseRow.t - pressT : NaN;
      const ballAtContact = contactM ? (R.find((r) => r.t >= contactM.t)?.ballRim ?? NaN) : NaN;
      const floatFrames = jam.filter((r) => !r.ballParent && r.ballPalm > 0.12).length;
      say(carry.length > 3 && unparented === 0 && offMax <= 0.01 && palmMax <= 0.02 && jamPalmMax <= 0.12 && floatFrames === 0, `H4 palm stick: carry ${carry.length} frames in ${parents.join('/') || 'NO HAND'} (unparented ${unparented}), local offset off the palm ≤ ${f3(offMax)} m (≤ 0.01), ball→palm ≤ ${f3(palmMax)} m; JAM ${jam.length} frames: released ${Number.isFinite(releaseAt) ? '+' + f0(releaseAt) + ' ms after the press' : 'on the contact frame'}, ball→palm max ${f2(jamPalmMax)} m (≤ 0.12 = the ball leaves FROM the hand at the iron), ${floatFrames} floating frames (ball > 0.12 m from the palm before the contact), ball→rim ${f2(ballAtContact)} m at the contact`);
      if (VERBOSE) lines.push(`        jam ball→palm: ${jam.map((r) => `+${f0(r.t - pressT)}:${f2(r.ballPalm)}${r.ballParent ? '' : '*'}`).join(' ')}`);
    } else lines.push(`      H4 not graded: ${made ? 'no reach / press mark' : 'MISSED'}`);
  }
  // ── H5: no idle / rest in the air, no clip-less frame, no T from the press (or the resolve) through feet-down + 450 ms ──
  if (sc.gates.includes('H5')) {
    const from = pressT > 0 ? pressT : resolveT;
    const airRows = R.filter((r) => r.t > launchPage && r.t < (landM?.t ?? from + 3000) && r.y > 0.05);
    const idleAir = airRows.filter((r) => r.clips.some((c) => /idle|rest/i.test(c))).length, clipless = airRows.filter((r) => r.clips.length === 0).length;
    const seg = R.filter((r) => r.t >= from && r.t < (landM ? landM.t + 450 : from + 3000));
    const tFrames = seg.filter((r) => isT(r) && (r.y > 0.05 || (landM && r.t > landM.t))).length, tFloor = seg.filter((r) => isT(r) && r.y <= 0.05 && !(landM && r.t > landM.t)).length;
    const land = R.filter((r) => landM && r.t > landM.t && r.t < landM.t + 450); const wide = land.filter((r) => r.lat >= 1.0 && r.elb >= 150).length;
    const heldOk = airRows.filter((r) => r.clips.length === 0 && r.t < (contactM?.t ?? resolveT)).length;   // held BEFORE the contact would be a clip that ran out early
    say(airRows.length > 3 && idleAir === 0 && heldOk === 0 && tFrames === 0 && wide === 0 && !!landM, `H5 latch (${made ? 'make' : 'miss'}): ${airRows.length} airborne frames, ${idleAir} in an idle/rest clip, ${clipless} held (no playing clip: ${heldOk} before the contact — must be 0; the rest is the finish's last frame held through the replay, A+ P8 by design); ${seg.length} frames press/resolve → feet-down+450: ${tFrames} T-pose in the air / on the land${tFloor ? ` (+${tFloor} on the FLOOR during the replay's run-up crossfade)` : ''}, land ${land.length} frames ${wide} arms-wide; clips ${[...new Set(seg.flatMap((r) => r.clips))].join(',')}`);
    if (tFrames || tFloor) { const tf = seg.filter(isT); lines.push(`      T frames at +${tf.slice(0, 6).map((r) => f0(r.t - from)).join(', +')} ms · clips ${[...new Set(tf.flatMap((r) => r.clips))].join(',')} · lat ${f2(tf[0].lat)} h ${f2(tf[0].lhy)}/${f2(tf[0].rhy)} sh ${f2(tf[0].shy)}`); }
  }
  // ── RIM: the hoop answers once per make, never on a miss ──
  if (sc.gates.includes('RIM')) {
    const punches = count(/JUICE-LOOK\] punch/);
    const vis = R.filter((r) => r.t > launchPage && r.rimVis); const netMin = Math.min(1, ...R.filter((r) => r.t > launchPage).map((r) => r.netS)); const rimMax = Math.max(1, ...vis.map((r) => r.rimS)); const rimDip = Math.min(0, ...vis.map((r) => r.rimY - 3.05)); const sway = Math.max(0, ...R.filter((r) => r.t > launchPage).map((r) => Math.abs(r.netRot)));
    const visMs = vis.length ? vis[vis.length - 1].t - vis[0].t : 0;
    const okMade = punches === 1 && vis.length >= 2 && (!sc.hang || has(/rim hang: ring held/)); const okMiss = punches === 0 && vis.length === 0;
    say(made ? okMade : okMiss, `RIM (${made ? 'make' : 'miss'}): hoop punch ×${punches}${made ? ` (1), rim shown ${vis.length} frames / ${f0(visMs)} ms, ring XZ peak ${f3(rimMax)}, ring dip ${f3(rimDip)} m, net squash to ${f2(netMin)}, net sway ${f3(sway)} rad` : ' (must be 0)'}`);
  }
  const judged = /JUDGES (\d+)/.exec(R.map((r) => r.banner).join('|'))?.[1];
  if (judged) lines.push(`      card: JUDGES ${judged}`);
  if (sc.hang) say(R.some((r) => /HANG TIME/.test(r.banner)), `HANG TIME! on the verdict line (SLAM held through the contact — ${mark(/HANDS\] hang release/)?.msg.slice(8) ?? 'no release mark'})`);
  if (VERBOSE) { const flight = R.filter((r) => r.t > launchPage && r.t <= resolveT + 600); const step = Math.max(1, Math.floor(flight.length / 50)); for (let i = 0; i < flight.length; i += step) { const r = flight[i]; lines.push(`        +${f0(r.t - launchPage)} y ${f2(r.y)} ${r.phase}/${r.ppw} ats ${f2(r.ats)} rh→iron ${f2(r.rhRim)} lh→iron ${f2(r.lhRim)} ball ${r.ballParent || 'free'} palm ${f2(r.ballPalm)} ${r.clips.join(',')}`); } }
  return lines;
}

(async () => {
  const picked = S.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const groups: Scenario[][] = []; for (let i = 0; i < picked.length; i += 4) groups.push(picked.slice(i, i + 4));
  const out: string[] = [`DUNK-HANDS-RIM probe · ${TAG} · port ${PORT} · ${process.env.QS ?? ''} · ${new Date().toISOString()}`];
  let allErrors: string[] = [], allFrames: string[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const { p, close, errors, frames } = await boot();
    curProp = 'none'; curStyle = 'power';
    for (const [k, sc] of groups[gi].entries()) {
      const idx = gi * 4 + k;
      out.push(`\n## ${idx + 1}. ${sc.name}`);
      try { out.push(...await attempt(p, sc, idx)); } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 200)}`); }
      console.log(out.slice(-10).join('\n'));
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
