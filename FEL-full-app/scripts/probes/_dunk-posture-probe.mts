// DUNK-POSTURE probe (2026-09-08): SILHOUETTE checks per rendered frame on /dev/mode/dunk — not degrees-to-rim alone. The eye
// is the bar; this is the supporting evidence and the shot list the eye grades. Off the live rig every frame:
//   trunk    — the Hips → Spine2 line's lean from vertical, signed toward the facing (+ = leaning in / forward)
//   open     — the thoracic angle: Spine2 → Head against Hips → Spine2, + = extended (chest open), − = rounded / hunched
//   roll     — the shoulders' line off level (a collapsed side-lean read as "facing")
//   eyes     — the head's forward elevation vs the elevation of the rim from the head (0 = looking at the iron)
//   chest    — the shoulders' line vs the bearing to the rim (the B1 number, kept)
//   hands    — heights vs the shoulders and the rim, spread (the T-pose test)
// Gates: S1 approach still · S2 hang tall + ball-ready · S3 CONTACT = rim chest AND jam silhouette · S4 a 360 resolves to
// S3 (mid-turn honest, upright, tucked) · S5 land / miss / blown readable. Pad driver (pre-boot fake DualShock).
//   PORT=3004 npx tsx scripts/probes/_dunk-posture-probe.mts        (QS=noposture=1 for the BEFORE set · SCEN= · OUT_DIR= · TAG=)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3004', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-posture', TAG = process.env.TAG ?? (process.env.QS?.includes('noposture') ? 'before' : 'after');
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE;
mkdirSync(OUT, { recursive: true });
const EXE = chromiumExe();   // BIOMECH-WAVE2: the hardcoded chromium-1234 path broke when the cache was reinstalled at 1243 — see _chromium.mts

type Row = { t: number; dt: number; y: number; yaw: number; chest: number; trunk: number; open: number; roll: number; eyes: number; headEl: number; rimEl: number; spread: number; lat: number; elb: number; lhy: number; rhy: number; shy: number; rhandY: number; lhandY: number; feetDy: number; clips: string[]; ats: number; banner: string; hint: string; win: string; ppw: string; trick: string; aim: number };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';
interface Scenario { name: string; prop: 'none' | 'car'; rt?: number; hold?: number; style?: 'power' | 'flashy' | 'sig'; air?: { at: number; dir?: Dir; btn: Btn }[]; slam?: boolean; look?: number; gates: ('S1' | 'S2' | 'S3' | 'S4' | 'S5')[]; spin?: boolean }
const S: Scenario[] = [
  { name: 'S1+S2+S3+S5 plain POWER make (approach still, hang, contact, land)', prop: 'none', look: 0.7, gates: ['S1', 'S2', 'S3', 'S5'] },
  { name: 'S4 360 at the rise (right+B at +80 ms) → resolves to the jam', prop: 'none', air: [{ at: 80, dir: 'right', btn: 'B' }], gates: ['S2', 'S3', 'S4'], spin: true },
  { name: 'S2 SCORPION at the hang (right+Y at +100 ms) — chest down, eyes up', prop: 'none', air: [{ at: 100, dir: 'right', btn: 'Y' }], gates: ['S3'] },
  { name: 'S5 MISS with a 360 (no slam) — the brace', prop: 'none', air: [{ at: 80, dir: 'right', btn: 'B' }], slam: false, gates: ['S5'], spin: true },
  { name: 'S3 WINDMILL at the rise (up+A at +350 ms)', prop: 'none', air: [{ at: 350, dir: 'up', btn: 'A' }], gates: ['S2', 'S3'] },
  { name: 'S4 360 → over the CAR (the owner\'s dunk)', prop: 'car', air: [{ at: 80, dir: 'right', btn: 'B' }], gates: ['S3', 'S4'], spin: true },
  { name: 'S5 plain MISS (no slam)', prop: 'none', slam: false, gates: ['S5'] },
  { name: 'S1 SIG eastbay make (the clip\'s own hip turn)', prop: 'none', style: 'sig', look: 0.7, gates: ['S1', 'S3', 'S5'] },
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
    const S = window.__smp = { rows: [], marks: [], sign: 0 };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|DUNK-PP|DUNK-PROP|DUNK-TRICK|DUNK-CUE|HANDS|JUICE-SOFT|FEL-DUNK|LOB)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 180) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 180) }); ow(...a); };
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    const RIM = { x: 0, y: 3.05, z: -10.28 };
    let heroSeen = null, N = {};
    const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
    const R2D = 180 / Math.PI;
    const bearing = (a, b) => { const sx = b.x - a.x, sz = b.z - a.z; const f = { x: -sz * S.sign, z: sx * S.sign }; return Math.atan2(f.x, f.z); };
    const fwdOf = (n) => { n.computeWorldMatrix(true); const q = n.absoluteRotationQuaternion; const v = new (n.position.constructor)(0, 0, 1); return v.rotateByQuaternionToRef(q, v); };
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\\\d+|_p\\\\d+)?$').test(n.name)) ?? null; N = { Hips: f('Hips'), Spine2: f('Spine2'), Head: f('Head'), LA: f('LeftArm'), RA: f('RightArm'), LE: f('LeftForeArm'), RE: f('RightForeArm'), LH: f('LeftHand'), RH: f('RightHand'), LF: f('LeftFoot'), RF: f('RightFoot') }; }
      if (!N.LA || !N.RA || !N.Hips || !N.Spine2 || !N.Head) return;
      const fresh = (n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
      h.computeWorldMatrix(true); for (const n of Object.values(N)) if (n) fresh(n);
      const P = (n) => n.getAbsolutePosition();
      const la = P(N.LA), ra = P(N.RA), hips = P(N.Hips), sp2 = P(N.Spine2), head = P(N.Head), lh = N.LH ? P(N.LH) : la, rh = N.RH ? P(N.RH) : ra;
      if (!S.sign) { const sx = ra.x - la.x; S.sign = sx < 0 ? 1 : -1; }   // calibrate once: at the start the hero faces the rim (−z)
      const chest = bearing(la, ra);
      const rimB = Math.atan2(RIM.x - h.position.x, RIM.z - h.position.z);
      // the facing (world) = the chest's bearing; trunk lean signed toward it
      const fx = Math.sin(chest), fz = Math.cos(chest);
      const tr = { x: sp2.x - hips.x, y: sp2.y - hips.y, z: sp2.z - hips.z }; const trH = tr.x * fx + tr.z * fz; const trunk = Math.atan2(trH, tr.y) * R2D;
      const nk = { x: head.x - sp2.x, y: head.y - sp2.y, z: head.z - sp2.z }; const nkH = nk.x * fx + nk.z * fz; const neckLean = Math.atan2(nkH, nk.y) * R2D;
      const open = trunk - neckLean;   // + = the head line leans back relative to the trunk = extension
      const roll = Math.atan2(la.y - ra.y, Math.hypot(la.x - ra.x, la.z - ra.z)) * R2D;
      const hf = fwdOf(N.Head); const headEl = Math.asin(Math.max(-1, Math.min(1, hf.y))) * R2D;
      const rimEl = Math.atan2(RIM.y - head.y, Math.hypot(RIM.x - head.x, RIM.z - head.z)) * R2D;
      const feetY = Math.min(N.LF ? P(N.LF).y : hips.y, N.RF ? P(N.RF).y : hips.y);
      const elbow = (a, e, hd) => { const u = { x: e.x - a.x, y: e.y - a.y, z: e.z - a.z }, v = { x: hd.x - e.x, y: hd.y - e.y, z: hd.z - e.z }; const nu = Math.hypot(u.x, u.y, u.z) || 1, nv = Math.hypot(v.x, v.y, v.z) || 1; return 180 - Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv)))) * R2D; };   // 180 = straight
      const elb = N.LE && N.RE ? Math.min(elbow(la, P(N.LE), lh), elbow(ra, P(N.RE), rh)) : 180;
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const pp = dev.dunkPosture ? dev.dunkPosture.get() : { window: '?', trick: null, aimDeg: 0 };
      S.rows.push({ t: performance.now(), dt: scene.getEngine().getDeltaTime(), y: h.position.y, yaw: h.rotation.y, chest: wrap(chest - rimB) * R2D, trunk, open, roll, eyes: headEl - rimEl, headEl, rimEl,
        spread: Math.hypot(lh.x - rh.x, lh.y - rh.y, lh.z - rh.z), lat: (() => { const ax = ra.x - la.x, az = ra.z - la.z, n = Math.hypot(ax, az) || 1; return Math.abs(((lh.x - rh.x) * ax + (lh.z - rh.z) * az) / n); })(), elb, lhy: lh.y - h.position.y, rhy: rh.y - h.position.y, shy: (la.y + ra.y) / 2 - h.position.y, rhandY: rh.y, lhandY: lh.y, feetDy: feetY - hips.y,
        clips, ats: scene.animationTimeScale ?? 1, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? ''), win: S.marks.filter((m) => /DUNK-WIN/.test(m.msg)).slice(-1)[0]?.msg.slice(11) ?? '', ppw: pp.window, trick: pp.trick ?? '', aim: pp.aimDeg ?? 0 });
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
const look = (p: Page, x: number) => padSet(p, `p.axes[2] = ${x}`);
const runHold = (p: Page, on: boolean, v = 1) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`);
const btn = (p: Page, b: Btn, on: boolean) => padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`);
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
const dpad = (p: Page, d: Dir, on: boolean) => padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`);
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
/** A posture CARD: the game frozen (render loop stopped, so nothing advances), the camera put on a 3/4 view of the hero at
 *  chest height, one render, the shot, then the loop and the camera handed back. The eye grades shapes; the mode's own
 *  cameras sit behind the runner or under the basket where the chest is hidden. */
async function freezeShot(p: Page, path: string, angleDeg = 40, dist = 3.6): Promise<void> {
  // The game keeps running (a stopped render loop starved the pad polls and stepped the flight's clock by the frozen span
  // — the slam window was skipped whole); the camera is overridden just before it renders, for a few frames around the shot.
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; }
    const a = ${angleDeg} * Math.PI / 180, dist = ${dist};
    window.__card = scene.onBeforeCameraRenderObservable.add((cam) => {
      const h = dev.hero(); if (!h || cam !== scene.activeCamera) return;
      const yaw = h.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);   // the hero faces (sin yaw, cos yaw): the card sits front-right of him
      const dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fx * Math.sin(a) + fz * Math.cos(a);
      const c = h.position.clone(); c.y += 1.1;
      cam.position.set(c.x + dx * dist, c.y + 0.35, c.z + dz * dist);
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
let curProp: 'none' | 'car' = 'none', curStyle: 'power' | 'flashy' | 'sig' = 'power';
async function setProp(p: Page, want: 'none' | 'car', lines: string[]): Promise<void> {
  if (want === 'none') { await dpad(p, 'up', true); await p.waitForTimeout(90); await dpad(p, 'up', false); }
  else if (curProp !== 'car') { await dpad(p, 'down', true); await p.waitForTimeout(90); await dpad(p, 'down', false); }
  curProp = want;
  await p.waitForTimeout(want === 'none' ? 250 : 1300);
  const shown = await hudProp(p);
  lines.push(`${shown === (want === 'none' ? 'NO PROP' : 'CAR') ? 'PASS' : 'FAIL'}  prop ${want} → HUD "${shown}"`);
}
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2);
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

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
  // ── S1: the approach still — the stick run, then the HOLD-RUN (it runs at the rim whatever the camera does) with a 3/4
  //       look orbit for the in-game frame, plus a frozen posture card ──
  const tRun = await now(p);
  await stickUp(p, true);
  await p.waitForTimeout(sc.gates.includes('S1') ? 500 : 250);
  const s1 = await lastRow(p);
  if (sc.gates.includes('S1')) { await freezeShot(p, `${OUT}/${slug}-card-s1-run.png`); }
  await runHold(p, true, sc.rt ?? 1);
  const holdStart = Date.now(), tHold = await now(p);
  if (sc.gates.includes('S1')) { if (sc.look) await look(p, sc.look); await p.waitForTimeout(420); await shot('s1-approach'); await freezeShot(p, `${OUT}/${slug}-card-s1-load.png`); if (sc.look) await look(p, 0); }
  let launched = false, launchPage = 0;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  while (!launched && Date.now() - holdStart < 3200) { const el = Date.now() - holdStart; if (sc.hold != null && el >= sc.hold) break; await p.waitForTimeout(30); await launchedYet(); }
  await runHold(p, false); await stickUp(p, false);
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 2000) await p.waitForTimeout(40);
  if (!launched) { lines.push('FAIL  never launched'); return lines; }
  const pageNow = await now(p);
  const sinceLaunch = () => Date.now() - (r0 - (pageNow - launchPage));
  const air = [...(sc.air ?? [])].sort((a, b) => a.at - b.at);
  const shotsDone = new Set<string>(); let landShotAt = 0;
  // the SLAM taps run on their own clock: a screenshot in the shot loop (~150 ms) used to open a gap wider than the window
  let slamOn = sc.slam !== false;
  const slamLoop = (async () => { let next = 950; while (slamOn && sinceLaunch() < 2300) { const el = sinceLaunch(); if (el >= next) { await tapBtn(p, 'A', 60); next = el + 85; } await new Promise((r) => setTimeout(r, 15)); } })();
  const card = async (name: string, angle = 40) => { await freezeShot(p, `${OUT}/${slug}-card-${name}.png`, angle); };
  while (sinceLaunch() < 2700) {
    const el = sinceLaunch();
    if (air.length && el >= air[0].at) { const a = air.shift()!; if (a.dir) { await dpad(p, a.dir, true); await p.waitForTimeout(20); } await tapBtn(p, a.btn, 70); if (a.dir) await dpad(p, a.dir, false); lines.push(`      air ${a.dir ?? ''}+${a.btn} at +${el} ms`); }
    const r = await lastRow(p);
    // window-driven shots: the plant, the hang, mid-turn, the extension, the jam / the brace, the land
    const want = (k: string, cond: boolean) => { if (cond && !shotsDone.has(k)) { shotsDone.add(k); return true; } return false; };
    if (want('plant', r.ppw === 'plant' && el > 90)) { await shot('plant'); await card('plant'); }
    if (want('hang', r.ppw === 'hang' && el > 100)) { await shot('s2-hang'); await card('s2-hang'); }
    if (sc.spin && want('turn', Math.abs(r.chest) > 140)) { await shot('s4-midturn'); await card('s4-midturn'); }
    if (want('extend', r.ppw === 'extend')) { await shot('extend'); await card('extend'); }
    if (want('jam', r.ppw === 'jam')) { await shot('s3-release'); await card('s3-release', 55); }
    if (want('contact', r.win === 'contact')) { await shot('s3-contact'); await card('s3-contact', 55); }
    if (want('brace', r.ppw === 'brace')) { await shot('s5-brace'); await card('s5-brace'); }
    if (want('land', r.ppw === 'land' || r.ppw === 'celebrate')) { landShotAt = Date.now(); await shot('s5-land-0'); await card('s5-land-0'); }
    if (landShotAt && want('land2', Date.now() - landShotAt > 220)) { await shot('s5-land-220'); await card('s5-land-220'); }
    await p.waitForTimeout(20);
  }
  slamOn = false; await slamLoop;
  if (!shotsDone.has('land')) { const t0 = Date.now(); while (Date.now() - t0 < 12000) { const r = await lastRow(p); if (r.ppw === 'land' || r.ppw === 'celebrate') { await shot('s5-land-0'); await card('s5-land-0'); await p.waitForTimeout(200); await shot('s5-land-220'); await card('s5-land-220'); shotsDone.add('land'); break; } await p.waitForTimeout(30); } }
  const tEnd0 = Date.now(); while (Date.now() - tEnd0 < 10000) { const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND|RIVAL ROUND/.test(t) && !/SLAM!|CONFER|CARD/.test(t) && Date.now() - tEnd0 > 1500) break; await p.waitForTimeout(120); }
  const tZ = await now(p);
  const ms = (await marks(p)).slice(m0), R = await rows(p, tA, tZ);
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg));
  const mark = (re: RegExp) => ms.find((m) => re.test(m.msg));
  const made = has(/DUNK-WIN\] contact/);
  const resolveM = mark(/DUNK-WIN\] contact|miss clank|\[LOB\] LOST|CLIPPED/);
  const resolveT = resolveM?.t ?? launchPage + 1700;
  const landM = mark(/HANDS\] land /);
  const flight = R.filter((r) => r.t > launchPage && r.t <= resolveT);
  const tricks = ms.filter((m) => /DUNK-TRICK\] air/.test(m.msg));
  const ppWins = ms.filter((m) => /DUNK-PP\]/.test(m.msg)).map((m) => `+${f0(m.t - launchPage)} ${m.msg.slice(10)}`);
  lines.push(`      ${made ? 'MAKE' : 'MISS'} · resolve ${resolveM ? resolveM.msg.slice(0, 40) : 'none'} @+${f0(resolveT - launchPage)} ms · tricks ${tricks.map((m) => m.msg.slice(17, 50)).join(' | ') || 'none'}`);
  lines.push(`      posture windows: ${ppWins.join(' · ') || 'NONE (layer off?)'}`);
  const T = (r: Row) => `trunk ${f0(r.trunk)}° open ${f0(r.open)}° roll ${f0(r.roll)}° eyes ${f0(r.eyes)}° chest ${f0(r.chest)}° aim ${f0(r.aim)}°`;
  // a T = the hands WIDE along the shoulders' line at shoulder height (a running arm swing is front-to-back and never a T)
  // … with STRAIGHT elbows (the celebrate's bicep flex — fists beside the head, elbows out — is wide at shoulder height and bent)
  const isT = (r: Row) => r.lat >= 0.95 && Math.abs(r.lhy - r.shy) < 0.22 && Math.abs(r.rhy - r.shy) < 0.22 && r.elb >= 150;
  // ── S1: the approach still — the stick run (from behind) and the hold-run (the load) ──
  if (sc.gates.includes('S1')) {
    const runRows = R.filter((r) => r.t >= tRun + 200 && r.t <= tRun + 480), loadRows = R.filter((r) => r.t >= tHold + 200 && r.t <= tHold + 520 && r.t < launchPage);
    const st = (rows: Row[]) => ({ tr: mean(rows.map((r) => r.trunk)), ey: mean(rows.map((r) => Math.abs(r.eyes))), rl: mean(rows.map((r) => Math.abs(r.roll))), op: mean(rows.map((r) => r.open)), t: rows.some(isT), tn: rows.filter(isT).length, lat: Math.max(0, ...rows.map((r) => r.lat)) });
    const a = st(runRows), b = st(loadRows);
    say(loadRows.length > 5 && b.tr >= 4 && b.tr <= 30 && b.ey <= 22 && b.rl <= 15 && b.op >= -16 && !b.t && !a.t && a.op >= -18, `S1 approach still: LOAD (hold-run) trunk lean ${f0(b.tr)}° (4–30 = leaning in), thoracic ${f0(b.op)}° (≥ −16 = the neck line of a run, not a hunch), eyes ${f0(b.ey)}° off the rim (≤ 22), shoulders ${f0(b.rl)}° off level, T frames ${b.tn} (hands ≤ ${f2(b.lat)} m apart along the shoulders) · RUN trunk ${f0(a.tr)}° thoracic ${f0(a.op)}° eyes ${f0(a.ey)}° T frames ${a.tn} (≤ ${f2(a.lat)} m) — windows ${[...new Set(loadRows.map((r) => r.ppw))].join(',')} clips ${[...new Set(loadRows.flatMap((r) => r.clips))].join(',')}`);
    void s1;
  }
  // ── S2: the hang — tall, open, eyes on the iron, shoulders level ──
  if (sc.gates.includes('S2')) {
    const hang = flight.filter((r) => r.ppw === 'hang');
    const op = mean(hang.map((r) => r.open)), ey = mean(hang.map((r) => Math.abs(r.eyes))), rl = mean(hang.map((r) => Math.abs(r.roll))), tr = mean(hang.map((r) => r.trunk));
    const trickNow = hang.some((r) => r.trick === 'scorpion');
    say(hang.length > 3 && (trickNow || op >= -4) && ey <= 25 && rl <= 18 && Math.abs(tr) <= 40 && !hang.some(isT), `S2 hang: ${hang.length} frames, thoracic ${f0(op)}° (≥ −4 = open, not hunched), trunk ${f0(tr)}°, eyes ${f0(ey)}° off the rim (≤ 25), shoulders ${f0(rl)}° off level (≤ 18)${hang.some(isT) ? ', T-POSE FRAMES' : ''}`);
  }
  // ── S3: CONTACT — the rim chest AND the jam silhouette ──
  if (sc.gates.includes('S3')) {
    const last = flight[flight.length - 1];
    if (made && last) {
      // the JAM = the slam press (the resolve) to the flush: the ball hand at the iron, the chest on it, the shoulders level
      const jam = R.filter((r) => r.ppw === 'jam' && r.t <= resolveT + 30);
      const ballHand = Math.max(...jam.map((r) => Math.max(r.rhandY, r.lhandY)), -1);
      const carry = flight.filter((r) => r.t >= resolveT - 200);
      const worstChest = carry.reduce((w, r) => Math.abs(r.chest) > Math.abs(w) ? r.chest : w, 0);
      const jr = jam[0] ?? last; const rl = mean(jam.map((r) => Math.abs(r.roll)));
      say(Math.abs(last.chest) <= 20 && Math.abs(worstChest) <= 30 && rl <= 18 && ballHand >= 2.95 && jr.trunk >= -25 && jr.trunk <= 40 && !jam.some(isT), `S3 CONTACT: chest ${f0(last.chest)}° at the flush (≤ 20; worst ${f0(worstChest)}° in the last 200 ms), jam ${jam.length} frames: ball hand ${f2(ballHand)} m (rim 3.05, ≥ 2.95), shoulders ${f0(rl)}° off level, trunk ${f0(jr.trunk)}°, thoracic ${f0(jr.open)}°, eyes ${f0(jr.eyes)}° → ${f0(last.eyes)}° — ${last.clips.join(',')}`);
    } else if (sc.gates.includes('S3') && !made) lines.push(`      S3 not graded: ${sc.slam === false ? 'a miss by design' : 'MISSED (the slam taps did not land)'}`);
  }
  // ── S4: the 360 — an honest turn (peak past 150°), upright and tucked mid-turn, resolved to the jam ──
  if (sc.gates.includes('S4')) {
    const peak = flight.reduce((w, r) => Math.max(w, Math.abs(r.chest)), 0);
    const mid = flight.filter((r) => Math.abs(r.chest) > 120);
    const tr = mean(mid.map((r) => Math.abs(r.trunk))), tuck = mean(mid.map((r) => r.feetDy)), rl = mean(mid.map((r) => Math.abs(r.roll)));
    const last = flight[flight.length - 1];
    let maxStep = 0; for (let i = 1; i < flight.length; i++) maxStep = Math.max(maxStep, Math.abs(((flight[i].chest - flight[i - 1].chest + 540) % 360) - 180));
    const resolved = last ? Math.abs(last.chest) <= 25 : false;
    say(peak >= 150 && mid.length > 0 && tr <= 40 && tuck >= -0.75 && rl <= 25 && resolved && maxStep < 60, `S4 360: chest peak ${f0(peak)}° (≥ 150), mid-turn ${mid.length} frames trunk ${f0(tr)}° off vertical (≤ 40), feet ${f2(tuck)} m under the hips (≥ −0.75 = tucked), shoulders ${f0(rl)}° off level, max step ${f0(maxStep)}°/frame, ${last ? `chest ${f0(last.chest)}° at the resolve` : 'no resolve frame'}`);
  }
  // ── S5: land / miss / blown — a readable brace, no T through the fall, the crouch at feet-down, idle standing after ──
  if (sc.gates.includes('S5')) {
    const fall = R.filter((r) => r.t > resolveT && r.t < (landM?.t ?? resolveT + 2500) && r.y > 0.05);
    const endWin = fall.filter((r) => landM && r.t >= landM.t - 150);
    const tFall = fall.filter(isT).length, tEnd = endWin.filter(isT).length, clipless = fall.filter((r) => r.clips.length === 0).length;
    const brace = fall.filter((r) => r.ppw === 'brace'); const bOpen = mean(brace.map((r) => r.open)), bTrunk = mean(brace.map((r) => r.trunk));
    // the LAND itself: feet-down → +450 ms (the crouch, the rise) — the T the eye called "a dead land" lives here, after feet-down
    const land = R.filter((r) => landM && r.t > landM.t && r.t < landM.t + 450); const lTrunk = land.length ? Math.max(...land.map((r) => r.trunk)) : NaN; const lOpen = mean(land.map((r) => r.open));
    const tLand = land.filter(isT).length, wide = land.filter((r) => r.lat >= 1.0 && r.elb >= 150).length, maxSpread = Math.max(0, ...land.map((r) => r.lat));   // a T is ~1.3 m; 0.9 caught a one-frame front swing of the brace's hands
    const after = R.filter((r) => landM && r.t > landM.t + 900 && r.t < landM.t + 1400 && r.hint !== 'RIVAL ROUND'); const a = after[after.length - 1];
    const braceOk = made || brace.length === 0 || (bOpen <= 4 && bTrunk >= 0);
    say(!!landM && tEnd === 0 && tLand === 0 && wide === 0 && clipless === 0 && braceOk && (Number.isNaN(lTrunk) || lTrunk >= 8) && (!a || (a.y < 0.06 && Math.abs(a.chest) <= 50)), `S5 ${made ? 'land' : 'miss'}: ${fall.length} fall frames (${tFall} T-pose, ${tEnd} in the last 150 ms, ${clipless} clip-less)${brace.length ? `, brace ${brace.length} frames trunk ${f0(bTrunk)}° thoracic ${f0(bOpen)}° (rounded ≤ 4)` : ''}, LAND ${land.length} frames: ${tLand} T-pose, ${wide} arms-wide (hands ≥ 1.0 m apart along the shoulders with straight elbows; max spread ${f2(maxSpread)}), crouch trunk ${f0(lTrunk)}° (≥ 8) thoracic ${f0(lOpen)}°${a ? `, settled y ${f2(a.y)} chest ${f0(a.chest)}° ${a.clips.join(',')}` : ''}`);
    if (tFall) { const tf = fall.filter(isT); lines.push(`      T frames in the fall at +${tf.slice(0, 6).map((r) => f0(r.t - resolveT)).join(', +')} ms after the resolve · clips ${[...new Set(tf.flatMap((r) => r.clips))].join(',')} · spread ${f2(tf[0].spread)} hands ${f2(tf[0].lhy)}/${f2(tf[0].rhy)} sh ${f2(tf[0].shy)}`); }
    if (tLand || wide) lines.push(`      land frames: ${land.slice(0, 14).map((r) => `+${f0(r.t - (landM?.t ?? 0))} sp ${f2(r.spread)} h ${f2(r.lhy)}/${f2(r.rhy)} sh ${f2(r.shy)} ${r.clips.join(',')}`).join(' · ')}`);
  }
  const judged = /JUDGES (\d+)/.exec(R.map((r) => r.banner).join('|'))?.[1];
  if (judged) lines.push(`      card: JUDGES ${judged}`);
  if (VERBOSE) { const step = Math.max(1, Math.floor(flight.length / 40)); for (let i = 0; i < flight.length; i += step) { const r = flight[i]; lines.push(`        +${f0(r.t - launchPage)} y ${f2(r.y)} ${r.ppw}${r.trick ? '+' + r.trick : ''} ${T(r)} ${r.clips.join(',')}`); } }
  return lines;
}

(async () => {
  const picked = S.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const groups: Scenario[][] = []; for (let i = 0; i < picked.length; i += 4) groups.push(picked.slice(i, i + 4));
  const out: string[] = [`DUNK-POSTURE probe · ${TAG} · port ${PORT} · ${process.env.QS ?? ''} · ${new Date().toISOString()}`];
  let allErrors: string[] = [], allFrames: string[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const { p, close, errors, frames } = await boot();
    curProp = 'none'; curStyle = 'power';
    for (const [k, sc] of groups[gi].entries()) {
      const idx = gi * 4 + k;
      out.push(`\n## ${idx + 1}. ${sc.name}`);
      try { out.push(...await attempt(p, sc, idx)); } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 200)}`); }
      console.log(out.slice(-12).join('\n'));
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
