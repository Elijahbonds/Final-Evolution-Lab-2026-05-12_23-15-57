// HOOPS-MOVE-KIT-A probe (2026-09-08): the move kit on /dev/mode/onevone and threevthree, driven by a pre-boot fake DualShock,
// read off the live rig every rendered frame (the BIOMECH-HOOPS-WAVE1 probe's harness). Grades SPEC-HOOPS-MOVE-KIT M1–M3:
//   M1 the pull-up: a squeeze while moving GATHERS (the 'gather' posture window, the gather clip) and the body decelerates
//      over several frames with ≤ 1 m of travel — no feet-freeze; a set body rises at once (0 gather frames); the step-back.
//   M3 the layup: the finish clip on the side the drive comes from, the ball in THAT hand, a real hop, the release from the
//      hand at the top, never the dunk launch clip; the floater: its own clip, the soft high arc.
//   M2 the contested drive dunk: the bump mark where the bodies meet, the defender's react / knockdown at the contact, the
//      flight longer than the bare 550 ms (the velocity kill), the verdict; the iron resolve + the land crouch unchanged
//      (no dunk regress). Floor contact: the hard-contact mark and the react.
//   D1 BLOCK (the amendment): the AI blocks my shot / layup / dunk with the rolls forced (the dev luck seam) — the ball loose,
//      never flying to the rim; the rival DUNKS off a blow-by and my timed jump inside range SWATS it.
//   D2 STRIP: a hard contact opens the window — my poke inside it takes the driver's ball; a set defender I jog into strips
//      me on the bump (forced) — the ball goes LOOSE (no warp: the ball's per-frame jump stays small) and the possession follows.
//   D3 CONTEST NO-JUMP: X held on defense = the hand-up clip on a grounded body and the rival's release logs the contest;
//      the AI's hand-up on my load (luck 0.5: the hand-up path, not the jump) shows on him and my release logs it.
//   MODE=onevone PORT=3004 npx tsx scripts/probes/_hoops-move-kit-probe.mts     (TAG= · OUT_DIR= · VERBOSE=1 · ONLY=…)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const MODE = (process.env.MODE ?? 'onevone') as 'onevone' | 'threevthree';
const PORT = process.env.PORT ?? '3004', OUT = process.env.OUT_DIR ?? 'docs/shots/hoops-move-kit', TAG = process.env.TAG ?? 'after';
const VERBOSE = !!process.env.VERBOSE;
/** ONLY=pullup,set,stepback,layup,floater,dunk,floor — a subset of the scenarios. */
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (k: string) => ONLY.length === 0 || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

type Job = { id: string; job: string; phase: string; x: number; z: number; y: number; speed: number; facing: number; boxing: boolean; objX: number; objZ: number; yaw: number; clips: string };
type Row = { t: number; x: number; y: number; z: number; yaw: number; chestRim: number; jobs: Job[]; spread: number; lat: number; elb: number; lhy: number; rhy: number; shy: number; headY: number; ballHand: number; ballSide: string; ballY: number; ballX: number; ballZ: number; clips: string[]; win: string; foeClips: string[]; foeDist: number; foeX: number; foeZ: number; foeY: number; banner: string; hint: string; shotType: string; meter: number; poss: string; att: string };
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
        lhy: lh.y - h.position.y, rhy: rh.y - h.position.y, shy: (la.y + ra.y) / 2 - h.position.y, headY: head.y, ballHand, ballSide, ballY, ballX, ballZ, clips, win: me ? String(me.window) : '?',
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
const shotResolved = (R: Row[]) => R.map((r) => r.banner).filter(Boolean).some((b) => /GREEN|EARLY|LATE|BRICK|WAY LATE|SPLASH|GOOD|RIMS OUT|\+\d/.test(b));

// ── scenarios ────────────────────────────────────────────────────────────────
/** M1: the 1-dribble pull-up — one push toward the rim, the squeeze while moving. */
async function pullUp(p: Page, L: Lines, slug: string): Promise<void> {
  const m0 = (await marks(p)).length;
  await stick(p, 0, -0.75); await p.waitForTimeout(420);
  await rt(p, true); const tS = await now(p);
  await p.waitForTimeout(640); await rt(p, false); const tRel = await now(p); await stick(p, 0, 0);
  await p.waitForTimeout(60); await card(p, `${OUT}/${slug}-release.png`, 50);
  await p.waitForTimeout(1500); const tZ = await now(p);
  const R = await rows(p, tS - 400, tZ), ms = (await marks(p)).slice(m0);
  const after = R.filter((r) => r.t >= tS);
  const gather = after.filter((r) => r.win === 'gather' && r.t < tRel);
  const sp = speeds(R); const iS = R.findIndex((r) => r.t >= tS);
  const preSpeed = mean(sp.slice(Math.max(1, iS - 6), iS));
  let stopAt = -1; for (let i = iS; i < R.length; i++) if (sp[i] < 0.4) { stopAt = i; break; }
  const framesToStop = stopAt < 0 ? -1 : stopAt - iS;
  const travel = stopAt < 0 ? -1 : Math.hypot(R[stopAt].x - R[iS].x, R[stopAt].z - R[iS].z);
  let maxDrop = 0; for (let i = iS + 1; i < R.length && i <= (stopAt < 0 ? R.length - 1 : stopAt); i++) maxDrop = Math.max(maxDrop, sp[i - 1] - sp[i]);
  const relRow = after.find((r) => r.t >= tRel + 30) ?? after[after.length - 1];
  const types = [...new Set(after.map((r) => r.shotType).filter(Boolean))];
  say(L, preSpeed >= 1.2 && gather.length >= 4 && has(ms, /MOVE\] gather pullup/), `M1 the moving squeeze GATHERS: ${f2(preSpeed)} m/s at the squeeze (≥ 1.2), ${gather.length} gather frames (≥ 4) · windows ${wins(after.filter((r) => r.t < tRel + 1200))} · ${ms.filter((m) => /MOVE\]/.test(m.msg)).map((m) => m.msg).join(' | ')}`);
  say(L, framesToStop >= 4 && travel >= 0 && travel <= 1.05 && maxDrop < 2.5, `M1 no feet-freeze, no float: ${framesToStop} frames to stop (≥ 4), ${f2(travel)} m of travel in the gather (≤ 1.05), largest one-frame speed drop ${f2(maxDrop)} m/s (< 2.5)`);
  say(L, gather.some((r) => r.clips.some((c) => /pullup_gather/.test(c))) && after.some((r) => r.t >= tRel - 200 && r.clips.some((c) => /jumpshot/.test(c))), `M1 the gather clip then the rise: clips ${clipsIn(after.filter((r) => r.t < tRel + 300))}`);
  say(L, types.includes('PULL-UP'), `M1 the HUD names it: ${types.join(' | ') || 'no shot type'}`);
  const tRows = after.filter((r) => r.t < tRel + 1200).filter(isT);
  const knownT = tRows.every((r) => r.clips.some((c) => c === 'jumpshot'));   // the base jumpshot lifts the arms through the sides before its release frame (flagged in BIOMECH-HOOPS-WAVE1)
  if (tRows.length) L.push(`      T frames at +${tRows.slice(0, 6).map((r) => f0(r.t - tRel)).join(', +')} ms around the release · clips ${clipsIn(tRows)}${knownT ? ' (inside the base jumpshot — the forge clip\'s own side lift, flagged in BIOMECH-HOOPS-WAVE1)' : ''}`);
  say(L, Math.abs(relRow.chestRim) <= 30 && knownT, `the shot squares to the rim (${f0(Math.abs(relRow.chestRim))}° at the release, ≤ 30), T frames outside the base jumpshot ${tRows.filter((r) => !r.clips.some((c) => c === 'jumpshot')).length} (0)`);
  say(L, !after.some((r) => r.t > tRel && r.t < tRel + 900 && r.clips.some((c) => /hit_react/.test(c))), `the follow-through is not cut by a contact react (${after.filter((r) => r.t > tRel && r.t < tRel + 900 && r.clips.some((c) => /hit_react/.test(c))).length} react frames)`);
  say(L, shotResolved(after), `the shot resolved: ${[...new Set(after.map((r) => r.banner).filter(Boolean))].slice(0, 4).join(' | ') || 'no banner'}`);
  if (VERBOSE) for (let i = Math.max(0, iS - 3); i < R.length; i += 2) L.push(`        +${f0(R[i].t - tS)} sp ${f2(sp[i])} ${R[i].win} ${R[i].clips.join(',')} ${R[i].shotType} ${R[i].banner}`);
}
/** M1: the set shot — a squeeze at rest rises at once. */
async function setShot(p: Page, L: Lines): Promise<void> {
  await stick(p, 0, 0); await p.waitForTimeout(120);   // the rival presses a standing hero inside 0.6 s: squeeze at once
  await rt(p, true); const tS = await now(p);
  await p.waitForTimeout(520); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(1300); const tZ = await now(p);
  const R = (await rows(p, tS, tZ));
  const gather = R.filter((r) => r.win === 'gather' && r.t < tRel);
  const load = R.filter((r) => r.win === 'load' && r.t < tRel);
  say(L, gather.length === 0 && load.length >= 5 && R.slice(0, 6).some((r) => r.clips.some((c) => /jumpshot/.test(c))), `M1 a set body rises at once: ${gather.length} gather frames (0), ${load.length} load frames, first clips ${clipsIn(R.slice(0, 6))} · ${[...new Set(R.map((r) => r.shotType).filter(Boolean))].join('|')}`);
  say(L, shotResolved(R), `the shot resolved: ${[...new Set(R.map((r) => r.banner).filter(Boolean))].slice(0, 3).join(' | ') || 'no banner'}`);
}
/** M1: the step-back — contested, the stick pulled off the rim at the squeeze. */
async function stepBack(p: Page, L: Lines, slug: string): Promise<void> {
  const m0 = (await marks(p)).length;
  await stick(p, 0, -0.7);
  const t0 = Date.now(); let near = false;
  while (Date.now() - t0 < 3000) { const r = await lastRow(p); if (!mine(r)) break; if (r.foeDist >= 0 && r.foeDist < 1.35) { near = true; break; } await p.waitForTimeout(16); }
  if (!near) { L.push('FAIL  M1 step-back: never got inside 1.35 m of the defender'); await stick(p, 0, 0); return; }
  await stick(p, 0, 0.9); await p.waitForTimeout(20);
  await rt(p, true); const tS = await now(p);
  await p.waitForTimeout(200); await card(p, `${OUT}/${slug}-stepback.png`, 55);
  await p.waitForTimeout(560); await rt(p, false); const tRel = await now(p); await stick(p, 0, 0);
  await p.waitForTimeout(1300); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  const gather = R.filter((r) => r.win === 'gather' && r.t < tRel);
  const z0 = R[0]?.z ?? 0, zEnd = gather.length ? gather[gather.length - 1].z : z0;
  const types = [...new Set(R.map((r) => r.shotType).filter(Boolean))];
  say(L, types.includes('STEP-BACK') && has(ms, /MOVE\] gather stepback/), `M1 contested + the stick pulled off the rim = a STEP-BACK: ${types.join('|') || 'no type'} · ${ms.filter((m) => /MOVE\]/.test(m.msg)).map((m) => m.msg).join(' | ')}`);
  say(L, gather.length >= 6 && zEnd - z0 >= 0.35, `M1 the body steps AWAY from the rim in the gather: ${f2(zEnd - z0)} m (≥ 0.35) over ${gather.length} gather frames`);
  say(L, shotResolved(R), `the shot resolved: ${[...new Set(R.map((r) => r.banner).filter(Boolean))].slice(0, 3).join(' | ') || 'no banner'}`);
}
/** M3: the layup — a half-speed diagonal drive, the squeeze inside the layup range. */
async function layup(p: Page, L: Lines, slug: string, sx: number): Promise<{ side: string; x: number } | null> {
  const m0 = (await marks(p)).length;
  // to the side of the lane first (a strafe), then straight at the rim under the dunk gate's speed (≈ 2.4 m/s)
  await stick(p, sx > 0 ? 0.9 : -0.9, 0); await p.waitForTimeout(400);
  const arrived = await approach(p, 0, MODE === 'threevthree' ? -0.72 : -0.55, 2.18);   // the layup band is < 2.2 m planar; a body in the lane stops the drive at the standoff
  if (!arrived) { await stick(p, 0, 0); const r = await lastRow(p); L.push(`      layup (stick x ${sx}): the drive did not reach the layup range (poss ${r.poss}, ${f2(distRim(r))} m, x ${f2(r.x)}, ${r.banner || r.shotType || 'no banner'})`); return null; }
  await rt(p, true); const tS = await now(p); const r0 = await lastRow(p);
  await p.waitForTimeout(170); await card(p, `${OUT}/${slug}-top.png`, sx > 0 ? 40 : -40);
  await p.waitForTimeout(190); await rt(p, false); const tRel = await now(p); await stick(p, 0, 0);
  await p.waitForTimeout(1500); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  const mark = ms.find((m) => /MOVE\] finish layup/.test(m.msg));
  const side = mark ? (/finish layup (left|right)/.exec(mark.msg)?.[1] ?? '?') : '?';
  const clipSide = side === 'left' ? 'bball_layup_gather_left' : 'bball_layup_gather';
  const inClip = R.filter((r) => r.t < tRel + 600 && r.clips.some((c) => c === clipSide));
  const rel = (() => { let last: Row | null = null; for (const r of R) { if (r.ballHand >= 0 && r.ballHand <= 0.3) last = r; else if (r.ballHand > 0.45 && last) return last; } return null; })();
  const yMax = Math.max(0, ...R.filter((r) => r.t < tRel + 800).map((r) => r.y));
  const landed = R.find((r) => r.t > tRel + 150 && r.y < 0.02);
  const types = [...new Set(R.map((r) => r.shotType).filter(Boolean))];
  const flight = R.filter((r) => r.t <= (landed?.t ?? tRel + 800));
  say(L, !!mark && inClip.length >= 8 && !R.some((r) => r.clips.some((c) => /dunk_launch/.test(c))), `M3 the layup runs its OWN finish clip (${clipSide}): ${inClip.length} frames on it, dunk_launch frames ${R.filter((r) => r.clips.some((c) => /dunk_launch/.test(c))).length} (0) · ${mark?.msg ?? 'no finish mark'} · squeezed at x ${f2(r0.x)} z ${f2(r0.z)} (${f2(distRim(r0))} m from the rim)`);
  say(L, !!rel && rel.ballSide === (side === 'left' ? 'L' : 'R') && types.some((t) => t.includes(side.toUpperCase())), `M3 the ball in the finishing hand: ${rel ? rel.ballSide : '?'} hand (${side}) at the release, HUD ${types.join('|')}`);
  say(L, yMax >= 0.12 && yMax <= 0.42 && !!landed, `M3 a real hop: root y max ${f2(yMax)} (0.12–0.42), feet down ${landed ? '+' + f0(landed.t - tRel) + ' ms after the release' : 'never'}`);
  say(L, !!rel && rel.ballY >= 1.75 && rel.y > 0.05, `M3 the ball leaves the hand at the top: ball y ${rel ? f2(rel.ballY) : '?'} (≥ 1.75) with the root at y ${rel ? f2(rel.y) : '?'} (> 0.05)`);
  say(L, !flight.some(isT) && flight.length >= 10, `no T through the finish (${flight.filter(isT).length} T frames over ${flight.length}) · windows ${wins(R.filter((r) => r.t < tRel + 900))}`);
  say(L, shotResolved(R), `the layup resolved: ${[...new Set(R.map((r) => r.banner).filter(Boolean))].slice(0, 4).join(' | ') || 'no banner'}`);
  if (VERBOSE) for (let i = 0; i < R.length && R[i].t < tRel + 900; i += 2) L.push(`        +${f0(R[i].t - tS)} y ${f2(R[i].y)} bh ${f2(R[i].ballHand)}${R[i].ballSide} ballY ${f2(R[i].ballY)} ${R[i].win} ${R[i].clips.join(',')} ${R[i].shotType} ${R[i].banner}`);
  return { side, x: r0.x };
}
/** M3: the floater — a jog to 2.5–4.5 m, the squeeze while moving. */
async function floater(p: Page, L: Lines, slug: string): Promise<void> {
  const m0 = (await marks(p)).length;
  let arrived = false;
  for (let a = 0; a < 3 && !arrived; a++) { if (a > 0 && !(await waitOffense(p))) break; arrived = await approach(p, 0, MODE === 'threevthree' ? -0.72 : -0.55, 3.15); if (!arrived) { await stick(p, 0, 0); const r = await lastRow(p); L.push(`      floater try ${a + 1}: did not reach the range (poss ${r.poss}, ${f2(distRim(r))} m, ${r.banner})`); } }
  if (!arrived) { L.push('FAIL  M3 floater: the jog did not reach the floater range in 3 tries'); return; }
  await rt(p, true); const tS = await now(p);
  await p.waitForTimeout(200); await card(p, `${OUT}/${slug}-floater.png`, 45);
  await p.waitForTimeout(200); await rt(p, false); const tRel = await now(p); await stick(p, 0, 0);
  await p.waitForTimeout(1600); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  const rel = (() => { let last: Row | null = null; for (const r of R) { if (r.ballHand >= 0 && r.ballHand <= 0.3) last = r; else if (r.ballHand > 0.45 && last) return last; } return null; })();
  const ballMax = Math.max(0, ...R.filter((r) => r.t > tRel && r.t < tRel + 1200).map((r) => r.ballY));
  const types = [...new Set(R.map((r) => r.shotType).filter(Boolean))];
  say(L, has(ms, /MOVE\] finish floater/) && R.some((r) => r.clips.some((c) => c === 'bball_floater')) && !R.some((r) => r.t < tRel && r.clips.some((c) => /jumpshot/.test(c))), `M3 the floater is its own clip: ${clipsIn(R.filter((r) => r.t < tRel + 400))} (no jumpshot before the release) · ${types.join('|')}`);
  say(L, !!rel && rel.ballY >= rel.headY - 0.1, `M3 released from a hand at the head or above: ball y ${rel ? f2(rel.ballY) : '?'} vs head ${rel ? f2(rel.headY) : '?'}`);
  say(L, ballMax >= 4.1, `M3 the soft high arc: ball apex ${f2(ballMax)} m (≥ 4.1; a jumper's apex from here ≈ 3.6)`);
  say(L, shotResolved(R), `the floater resolved: ${[...new Set(R.map((r) => r.banner).filter(Boolean))].slice(0, 4).join(' | ') || 'no banner'}`);
}
/** M2: the contested drive dunk — a full sprint through the defender in the lane. */
async function contestedDunk(p: Page, L: Lines, slug: string): Promise<void> {
  const m0 = (await marks(p)).length;
  let fired = false, tFire = 0;
  for (let attempt = 0; attempt < 3 && !fired; attempt++) {
    if (attempt > 0) { if (!(await waitOffense(p))) break; L.push(`      dunk attempt ${attempt + 1} (the last sprint was stripped / bled out)`); }
    // find a LANE first: straight into three bodies now bleeds the drive under the dunk gate (M2's own contact), so take an angle
    if (MODE === 'threevthree') { await stick(p, attempt % 2 ? -0.95 : 0.95, -0.35); await p.waitForTimeout(650); }
    await stick(p, 0, -1);
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) { const r = await lastRow(p); if (/STOLEN|STRIPPED/.test(r.banner) || !mine(r)) break; if (distRim(r) < 2.5) { await rt(p, true); fired = true; break; } await p.waitForTimeout(16); }
    tFire = await now(p);
    await p.waitForTimeout(120); await rt(p, false); await stick(p, 0, 0);
    if (!fired) await p.waitForTimeout(300);
  }
  const t1 = Date.now(); const seen = new Set<string>();
  while (Date.now() - t1 < 1600) { const r = await lastRow(p); for (const w of ['hang', 'jam', 'brace', 'land']) if (r.win === w && !seen.has(w)) { seen.add(w); await card(p, `${OUT}/${slug}-${w}.png`, 55); } await p.waitForTimeout(16); }
  await p.waitForTimeout(700); const tZ = await now(p);
  const R = await rows(p, tFire - 200, tZ), ms = (await marks(p)).slice(m0);
  const flight = R.filter((r) => r.t > tFire && ['rise', 'hang', 'extend', 'jam', 'brace'].includes(r.win));
  const land = R.filter((r) => r.win === 'land');
  const bump = ms.find((m) => /CONTACT\] drive bump/.test(m.msg));
  const flightMs = flight.length ? flight[flight.length - 1].t - flight[0].t : 0;
  const foeReact = R.filter((r) => r.t > tFire && r.foeClips.some((c) => /karate_hit_react|karate_knockdown|karate_floor_hold/.test(c)));
  const rel = (() => { let last: Row | null = null; for (const r of R) { if (r.t <= tFire) continue; if (r.ballHand >= 0 && r.ballHand <= 0.3) last = r; else if (r.ballHand > 0.45 && last) return last; } return null; })();
  const banners = [...new Set(R.map((r) => r.banner).filter(Boolean))];
  const verdict = banners.find((b) => /THROWN|POSTER|RATTLED|STUFFED|AND ONE|FOULED/.test(b));
  say(L, fired && flight.length >= 8, `the drive dunk flew: ${flight.length} flight frames, windows ${wins(R.filter((r) => r.t > tFire))} · ${verdict ?? 'no verdict banner'}`);
  say(L, !!bump, `M2 the bodies MET in the flight: ${bump?.msg ?? 'no bump mark'} · defender ${f2(R.find((r) => r.t >= tFire)?.foeDist ?? -1)} m away at the squeeze · ${ms.find((m) => /drive contest/.test(m.msg))?.msg ?? 'no contest mark'}`);
  say(L, !!bump && foeReact.length >= 4, `M2 the defender took the hit: ${foeReact.length} frames of react / knockdown on him (≥ 4) · his clips ${[...new Set(R.filter((r) => r.t > tFire).flatMap((r) => r.foeClips))].join(',')}`);
  say(L, !!bump && flightMs >= 600, `M2 the velocity kill: ${f0(flightMs)} ms of flight (≥ 600; the bare parabola is 550) · banners ${banners.join(' | ')}`);
  say(L, !!rel && rel.y >= 0.85 && rel.ballY >= 2.5, `no dunk regress — the ball leaves the hand at the iron: root y ${rel ? f2(rel.y) : '?'} (≥ 0.85), ball y ${rel ? f2(rel.ballY) : '?'} (≥ 2.5)`);
  const tF = flight.filter(isT);
  if (tF.length) L.push(`      T frames in flight at +${tF.slice(0, 8).map((r) => f0(r.t - tFire)).join(', +')} ms · clips ${clipsIn(tF)} (the authored dunk_launch's own arm sweep — flagged in BIOMECH-HOOPS-WAVE1, unchanged)`);
  say(L, land.length >= 6 && land.some((r) => r.clips.some((c) => /land_crouch/.test(c))) && !land.some(isT) && tF.every((r) => r.clips.some((c) => /dunk_launch/.test(c))), `no dunk regress — the land crouch at feet-down (${land.length} land frames, clips ${clipsIn(land)}), T frames on the land ${land.filter(isT).length}, in flight ${tF.length} (all inside dunk_launch: ${tF.every((r) => r.clips.some((c) => /dunk_launch/.test(c)))})`);
  if (VERBOSE) for (const r of R.filter((r) => r.t > tFire - 100).filter((_, i) => i % 2 === 0)) L.push(`        +${f0(r.t - tFire)} y ${f2(r.y)} ${r.win} foe ${f2(r.foeDist)} ${r.foeClips.join(',')} bh ${f2(r.ballHand)} ballY ${f2(r.ballY)} ${r.banner}`);
}
/** M2: floor contact — a sprint into the defender with no squeeze. */
async function floorContact(p: Page, L: Lines): Promise<void> {
  // separate first: after a reset the defender presses to the standoff within half a second, and Havok raises a collision
  // only on a FRESH contact (a sprint that starts jammed against him never fires one — measured)
  { const r = await lastRow(p); const dx = r.foeX - r.x, dz = r.foeZ - r.z, len = Math.hypot(dx, dz) || 1; await stick(p, dx / len, -dz / len); await p.waitForTimeout(MODE === 'onevone' ? 650 : 350); }
  const m0 = (await marks(p)).length;
  const tS = await now(p);
  const t0 = Date.now(); let hit: Mark | undefined;
  while (Date.now() - t0 < 2200) {
    const r = await lastRow(p); if (!mine(r)) break;
    // steer at the nearest defender (stick +x = world −x, stick −y = world −z — measured on the layup strafe)
    const dx = r.foeX - r.x, dz = r.foeZ - r.z, len = Math.hypot(dx, dz) || 1;
    await stick(p, -dx / len, dz / len);
    const ms = (await marks(p)).slice(m0); hit = ms.find((m) => /CONTACT\] (hard|charge|foul)/.test(m.msg)); if (hit) break;
    await p.waitForTimeout(16);
  }
  await p.waitForTimeout(350); await stick(p, 0, 0); await p.waitForTimeout(300);
  const tZ = await now(p);
  const R = await rows(p, tS, tZ);
  const sp = speeds(R);
  let drop = 0, before = 0, after = 0;
  if (hit) { const i = R.findIndex((r) => r.t >= hit!.t); if (i > 6) { before = Math.max(...sp.slice(i - 6, i)); after = Math.min(...sp.slice(i, Math.min(R.length, i + 6))); drop = before > 0 ? 1 - after / before : 0; } }
  const react = R.filter((r) => hit && r.t >= hit.t && r.t < hit.t + 500 && (r.foeClips.some((c) => /karate_hit_react/.test(c)) || r.clips.some((c) => /karate_hit_react/.test(c))));
  const events = MODE === 'onevone' ? await p.evaluate(`(() => { const md = window.__FEL_DEV__.scene.metadata.onevone; return md && md.contacts ? md.contacts().filter((c) => c.t >= ${tS}).map((c) => c.severity + ' ' + c.closing.toFixed(1) + ' ' + c.attacker + '→' + c.victim) : []; })()`) as string[] : [];
  say(L, !!hit, `M2 a sprint into the body is a HIT: ${hit?.msg ?? 'no hard-contact mark'} · nearest ${f2(Math.min(...R.map((r) => r.foeDist >= 0 ? r.foeDist : 9)))} m${MODE === 'onevone' ? ' · Havok events: ' + (events.slice(0, 6).join(' | ') || 'none') : ''}`);
  say(L, !!hit && drop >= 0.25, `M2 the contact costs speed: ${f2(before)} → ${f2(after)} m/s across the hit (${f0(drop * 100)} % off, ≥ 25)`);
  say(L, react.length >= 3 || /charge|foul|react true/.test(hit?.msg ?? ''), `M2 the hit reads: ${react.length} react frames on the measured bodies (≥ 3), or the react / whistle named in the mark · banners ${[...new Set(R.map((r) => r.banner).filter(Boolean))].join(' | ')}`);
}

// ── the DEFENSE package (D1–D3) ──────────────────────────────────────────
const luck = (p: Page, v: number | null) => p.evaluate(`(() => { const d = window.__FEL_DEV__; const md = d.scene.metadata && d.scene.metadata.onevone; const f = (md && md.luck) || (d.hoopsPosture && d.hoopsPosture.luck); if (f) f(${v === null ? 'null' : v}); })()`);
const stickAt = async (p: Page, r: Row, mag: number) => { const dx = r.foeX - r.x, dz = r.foeZ - r.z, len = Math.hypot(dx, dz) || 1; await stick(p, -dx / len * mag, dz / len * mag); };
const onD = (r: Row) => MODE === 'onevone' ? r.poss === 'defense' : r.poss === 'foeTeam';
/** Wait for THEIR possession (1v1: the defend() seam; 3v3: after a miss / the opponent possession). */
async function waitDefense(p: Page): Promise<boolean> {
  if (await gameEnded(p)) { console.log('      (the game ended — a fresh one)'); await reboot(); }
  if (MODE === 'onevone') { await p.evaluate('window.__FEL_DEV__.scene.metadata.onevone.defend()'); await p.waitForTimeout(200); }
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) { const r = await lastRow(p); if (MODE === 'onevone' ? r.poss === 'defense' && r.att !== 'check' : r.poss === 'foeTeam') return true; await p.waitForTimeout(40); }
  return false;
}
const bumpAgeOf = async (p: Page): Promise<number> => p.evaluate(`(() => { const d = window.__FEL_DEV__; const md = d.scene.metadata && d.scene.metadata.onevone; const f = (md && md.bumpAge) || (d.hoopsPosture && d.hoopsPosture.bumpAge); return f ? f() : 99; })()`) as Promise<number>;
/** The ball never teleports: the largest per-frame jump of the ball over a window (a launched ball moves < 0.4 m a frame). */
const ballJump = (R: Row[]): number => { let m = 0; for (let i = 1; i < R.length; i++) if (R[i].ballHand >= 0 && R[i - 1].ballHand >= 0) m = Math.max(m, Math.hypot(R[i].ballX - R[i - 1].ballX, R[i].ballY - R[i - 1].ballY, R[i].ballZ - R[i - 1].ballZ)); return m; };
/** D1: the AI blocks my shot (rolls forced to land): the ball goes loose from the hand, never to the rim. */
async function aiBlocks(p: Page, L: Lines, kind: 'jumper' | 'layup' | 'dunk'): Promise<boolean> {
  const m0 = (await marks(p)).length;
  if (kind === 'layup') { await stick(p, 0.9, 0); await p.waitForTimeout(400); const ok = await approach(p, 0, MODE === 'threevthree' ? -0.72 : -0.55, 2.18); if (!ok) { await stick(p, 0, 0); return false; } }
  else if (kind === 'dunk') { const t0 = Date.now(); let fired = false; while (Date.now() - t0 < 2500) { const r = await lastRow(p); if (!mine(r)) break; if (distRim(r) < 2.5) { fired = true; break; } if (MODE === 'threevthree' && r.foeDist >= 0 && r.foeDist < 2.8 && distRim(r) > 3.2) await stickAt(p, r, 1); else await stick(p, 0, -1); await p.waitForTimeout(16); } if (!fired) { await stick(p, 0, 0); L.push('      D1 dunk: the sprint did not reach the takeoff'); return false; } }
  else { const t0 = Date.now(); while (Date.now() - t0 < 3500) { const r = await lastRow(p); if (!mine(r)) return false; if (r.foeDist >= 0 && r.foeDist < 1.7) break; if (r.foeDist > 2.0) await stickAt(p, r, 0.4); else await stick(p, 0, 0); await p.waitForTimeout(30); } await stick(p, 0, 0); await p.waitForTimeout(120); }   // walk into his reach (a sprint into him is a charge), then squeeze
  await rt(p, true); const tS = await now(p);
  await p.waitForTimeout(kind === 'dunk' ? 120 : 380); await rt(p, false); await stick(p, 0, 0);
  await p.waitForTimeout(1400); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  const blocked = ms.find((m) => /DEF\] (blocked at the release|ai swat at the bump)/.test(m.msg));
  const armed = ms.filter((m) => /DEF\] ai (block jump|hand up)/.test(m.msg)).map((m) => m.msg);
  const banners = [...new Set(R.map((r) => r.banner).filter(Boolean))];
  const after = R.filter((r) => blocked && r.t >= blocked.t && r.t < blocked.t + 700);
  const ballMax = Math.max(0, ...after.map((r) => r.ballY));
  const foeReach = R.some((r) => r.foeClips.some((c) => /block_reach|hand_up/.test(c)));
  say(L, !!blocked, `D1 ${kind}: the AI blocks — ${blocked?.msg ?? 'no block mark'} · ${armed.join(' | ') || 'no arm mark'} · ${ms.filter((m) => /my release|drive contest/.test(m.msg)).map((m) => m.msg).slice(0, 2).join(' | ')}`);
  say(L, !!blocked && ballMax < 3.0 && ballMax > 0 && after.length >= 8 && !banners.some((b) => /\+2|THROWN|POSTERIZED!|GOOD|SPLASH/.test(b)), `D1 ${kind}: the ball goes LOOSE, not through the rim: ball apex ${f2(ballMax)} m after the block (< 3.0), no make · banners ${banners.join(' | ')}`);
  say(L, foeReach, `D1 ${kind}: the defender's arm is up: ${[...new Set(R.flatMap((r) => r.foeClips))].join(',')}`);
  say(L, !!blocked && ballJump(after) < 0.5, `D1 ${kind}: no teleport — the ball's largest per-frame jump after the block ${f2(ballJump(after))} m (< 0.5)`);
  return true;
}
/** D1: the rival dunks the lane he beat (a whiffed reach = the blow-by); my jump inside range while he is up swats it. */
async function swatRival(p: Page, L: Lines, attempt: number): Promise<boolean> {
  if (!(await waitDefense(p))) { L.push('      D1 swat: no rival possession reached'); return false; }
  const m0 = (await marks(p)).length;
  if (MODE === 'onevone') { const t0 = Date.now(); while (Date.now() - t0 < 3500) { const r = await lastRow(p); if (r.foeDist >= 0 && r.foeDist < 1.3 && r.att !== 'check') break; await stickAt(p, r, r.foeDist > 2.2 ? 0.55 : 0.3); await p.waitForTimeout(16); } await stick(p, 0, 0); await p.waitForTimeout(450); await tapBtn(p, 'X', 60); }   // contain him (containedSec) so the whiff BEATS a defender who was there — that is the dunk read
  else { const r = await lastRow(p); await stick(p, r.foeX > r.x ? -0.7 : 0.7, 0); await p.waitForTimeout(250); await stick(p, 0, 0); }
  const t1 = Date.now(); let dunk: Mark | undefined, jumped = 0;
  while (Date.now() - t1 < 4500) {
    const ms = (await marks(p)).slice(m0); dunk = dunk ?? ms.find((m) => /DEF\] rival dunk/.test(m.msg));
    const r = await lastRow(p);
    if (!onD(r)) break;
    if (dunk && !jumped) { if (r.foeDist > 1.3) { await stickAt(p, r, 1); } else { await stick(p, 0, 0); await tapBtn(p, 'A', 50); jumped = await now(p); } }
    else if (!dunk) { const dx = RIM.x - r.x, dz = (RIM.z + 1.0) - r.z, len = Math.hypot(dx, dz) || 1; if (len > 0.5) await stick(p, -dx / len, dz / len); else await stick(p, 0, 0); }   // to the rim: the chase-down
    if (jumped && (await now(p)) - jumped > 1500) break;
    await p.waitForTimeout(16);
  }
  await stick(p, 0, 0); await p.waitForTimeout(600);
  const ms = (await marks(p)).slice(m0);
  const R = await rows(p, (dunk?.t ?? (await now(p)) - 3000) - 200, await now(p));
  const swat = ms.find((m) => /DEF\] swat/.test(m.msg));
  const banners = [...new Set(R.map((r) => r.banner).filter(Boolean))];
  const foeAir = R.filter((r) => r.foeY > 0.15);
  if (!dunk) { L.push(`      D1 swat try ${attempt + 1}: the rival did not dunk (${ms.filter((m) => /rival release|strip|foul/.test(m.msg)).map((m) => m.msg).slice(0, 2).join(' | ') || 'no release mark'} · banners ${banners.join(' | ')})`); return false; }
  say(L, foeAir.length >= 6, `D1 the rival DUNKS the lane he beat: ${dunk.msg} · ${foeAir.length} frames in the air, his clips ${[...new Set(foeAir.flatMap((r) => r.foeClips))].join(',')}`);
  const distAtJump = jumped ? (R.find((r) => r.t >= jumped)?.foeDist ?? -1) : -1;
  say(L, !!swat, `D1 my timed jump SWATS it: ${swat?.msg ?? 'no swat'} · jumped ${jumped ? '+' + f0(jumped - dunk.t) + ' ms after his takeoff at ' + f2(distAtJump) + ' m' : 'never'} · banners ${banners.join(' | ')}`);
  return true;
}
/** D2: my poke inside the bump window takes the driver's ball (a jog into him opens the window). */
async function myBumpStrip(p: Page, L: Lines): Promise<void> {
  if (!(await waitDefense(p))) { L.push('FAIL  D2 my strip: no rival possession reached'); return; }
  const m0 = (await marks(p)).length;
  const t0 = Date.now(); let hit: Mark | undefined, poked = 0, pokes = 0, onBump = 0;
  while (Date.now() - t0 < 7000) {
    const r = await lastRow(p); if (!onD(r)) break;
    const ms = (await marks(p)).slice(m0);
    hit = hit ?? ms.find((m) => /CONTACT\] (hard|foul)/.test(m.msg));
    const bumpAge = await bumpAgeOf(p);
    const fresh = !!hit && (await now(p)) - hit.t < 500;
    const tNow = await now(p);
    if (r.foeDist < 1.6 && tNow - poked > 550) { await stick(p, 0, 0); await tapBtn(p, 'X', 60); poked = tNow; pokes++; if (bumpAge <= 0.45 || fresh) onBump++; }
    else if (!poked) await stickAt(p, r, 0.62);
    if (pokes >= 3 || (poked && tNow - poked > 900 && ms.some((m) => /DEF\] strip by me/.test(m.msg)))) break;
    await p.waitForTimeout(16);
  }
  await stick(p, 0, 0); await p.waitForTimeout(500);
  const ms = (await marks(p)).slice(m0);
  const R = await rows(p, poked ? poked - 300 : (await now(p)) - 2000, await now(p));
  const strip = ms.find((m) => /DEF\] strip by me/.test(m.msg));
  const banners = [...new Set(R.map((r) => r.banner).filter(Boolean))];
  say(L, !!hit && pokes > 0, `D2 the bump opened the window: ${hit?.msg ?? 'no contact mark'} · ${pokes} pokes inside 1.6 m, ${onBump} of them inside the window`);
  say(L, !!strip, `D2 my poke on the bump takes the ball: ${strip?.msg ?? 'no strip'} · banners ${banners.join(' | ')}`);
  const afterS = strip ? R.filter((r) => r.t >= strip.t && r.t < strip.t + 700) : [];
  say(L, !!strip && ballJump(afterS) < 0.5, `D2 no teleport: the ball's largest per-frame jump after the strip ${strip ? f2(ballJump(afterS)) : '?'} m (< 0.5)`);
}
/** D2: a set defender I jog into strips me on the bump (roll forced): the ball loose, the possession follows. */
async function aiBumpStrip(p: Page, L: Lines): Promise<void> {
  { const r = await lastRow(p); const dx = r.foeX - r.x, dz = r.foeZ - r.z, len = Math.hypot(dx, dz) || 1; await stick(p, dx / len, -dz / len); await p.waitForTimeout(MODE === 'onevone' ? 650 : 350); }
  const m0 = (await marks(p)).length; const tS = await now(p);
  const t0 = Date.now(); let strip: Mark | undefined;
  while (Date.now() - t0 < 2500) { const r = await lastRow(p); if (!mine(r)) break; await stickAt(p, r, 0.62); const ms = (await marks(p)).slice(m0); strip = ms.find((m) => /DEF\] strip by the ai/.test(m.msg)); if (strip) break; await p.waitForTimeout(16); }
  await stick(p, 0, 0); await p.waitForTimeout(1200);
  const ms = (await marks(p)).slice(m0);
  const R = await rows(p, tS, await now(p));
  const after = strip ? R.filter((r) => r.t >= strip.t && r.t < strip.t + 700) : [];
  const banners = [...new Set(R.map((r) => r.banner).filter(Boolean))];
  const myJump = (() => { let m = 0; for (let i = 1; i < after.length; i++) m = Math.max(m, Math.hypot(after[i].x - after[i - 1].x, after[i].z - after[i - 1].z)); return m; })();
  say(L, !!strip, `D2 the set defender strips me on the bump: ${strip?.msg ?? 'no strip mark'} · ${ms.filter((m) => /CONTACT\]/.test(m.msg)).map((m) => m.msg).slice(0, 2).join(' | ')} · banners ${banners.join(' | ')}`);
  say(L, !!strip && after.some((r) => r.foeClips.some((c) => /steal_reach/.test(c))), `D2 the strip reads: the reach on him (${after.filter((r) => r.foeClips.some((c) => /steal_reach/.test(c))).length} frames)`);
  say(L, !!strip && ballJump(after) < 0.5 && myJump < 0.5 && after.length >= 8, `D2 no teleport: the ball's largest per-frame jump ${f2(ballJump(after))} m, mine ${f2(myJump)} m (< 0.5) over ${after.length} frames after the strip`);
}
/** D3: X held on defense = a grounded hand-up that contests the rival's release. */
async function myHandUp(p: Page, L: Lines): Promise<void> {
  if (!(await waitDefense(p))) { L.push('FAIL  D3 my hand-up: no rival possession reached'); return; }
  const m0 = (await marks(p)).length; const tS = await now(p);
  await btn(p, 'X', true);
  const t0 = Date.now(); let rel: Mark | undefined;
  while (Date.now() - t0 < 8000) {
    const r = await lastRow(p); if (!onD(r)) break;
    // stand IN THE LANE 1 m in front of him (contained: he pulls up instead of reaching the rim, inside a hand-up's range)
    const dx = RIM.x - r.foeX, dz = RIM.z - r.foeZ, len = Math.hypot(dx, dz) || 1;
    const gx = r.foeX + dx / len * 1.0, gz = r.foeZ + dz / len * 1.0;
    const ex = gx - r.x, ez = gz - r.z, el = Math.hypot(ex, ez);
    if (el > 0.35) await stick(p, -ex / el * Math.min(0.75, el), ez / el * Math.min(0.75, el)); else await stick(p, 0, 0);
    const ms = (await marks(p)).slice(m0); rel = ms.find((m) => /DEF\] (rival release|rival dunk)/.test(m.msg)); if (rel) break; await p.waitForTimeout(16);
  }
  await p.waitForTimeout(300); await btn(p, 'X', false); await stick(p, 0, 0); await p.waitForTimeout(400);
  const R = await rows(p, tS, await now(p));
  const up = R.filter((r) => r.clips.some((c) => c === 'bball_hand_up'));
  const banners = [...new Set(R.map((r) => r.banner).filter(Boolean))];
  say(L, up.length >= 10 && up.every((r) => r.y < 0.05), `D3 the hand-up is a grounded hold: ${up.length} frames on bball_hand_up, root y max ${f2(Math.max(0, ...up.map((r) => r.y)))} (no jump) · windows ${wins(R)}`);
  say(L, !!rel && /handUp true/.test(rel.msg), `D3 it contests the release without a jump: ${rel?.msg ?? 'no release mark'} · banners ${banners.join(' | ')}`);
}
/** D3: the AI's hand-up on my load (luck 0.5 = the hand-up path, not the jump) shows on him and my release logs the contest. */
async function aiHandUp(p: Page, L: Lines): Promise<void> {
  const m0 = (await marks(p)).length;
  await stick(p, 0, 0);
  { const t0 = Date.now(); while (Date.now() - t0 < 2200) { const r = await lastRow(p); if (!mine(r)) break; if (r.foeDist >= 0 && r.foeDist < 2.0) break; await p.waitForTimeout(30); } }   // the AI's hand-up is a CLOSEOUT: let him arrive
  await rt(p, true); const tS = await now(p);
  await p.waitForTimeout(450); await rt(p, false);
  await p.waitForTimeout(1200);
  const R = await rows(p, tS, await now(p)), ms = (await marks(p)).slice(m0);
  const up = ms.find((m) => /DEF\] ai hand up/.test(m.msg)), rel = ms.find((m) => /DEF\] my release/.test(m.msg));
  const foeUp = R.filter((r) => r.t < tS + 900 && r.foeClips.some((c) => c === 'bball_hand_up'));
  say(L, !!up && foeUp.length >= 8 && foeUp.every((r) => r.foeY < 0.05), `D3 the AI puts a hand up on my load, grounded: ${up?.msg ?? 'no mark'} · ${foeUp.length} frames on bball_hand_up, his y max ${f2(Math.max(0, ...foeUp.map((r) => r.foeY)))}`);
  say(L, !!rel && /handUp true/.test(rel.msg) && /contest 0\.[2-9]/.test(rel.msg), `D3 my release is contested by it: ${rel?.msg ?? 'no release mark'} · ${[...new Set(R.map((r) => r.banner).filter(Boolean))].join(' | ')}`);
}

// ── the OFF-BALL package (O1–O3) ─────────────────────────────────────────
const jobsOf = (R: Row[], id: string): Job[] => R.map((r) => r.jobs.find((j) => j.id === id)).filter((j): j is Job => !!j);
/** O1: dribble at the top (the screen comes to my defender), then drive off it; read the screener's plant, the clip, the roll / pop, the defender's fight. */
async function screenScenario(p: Page, L: Lines, attempt: number): Promise<boolean> {
  const m0 = (await marks(p)).length; const tS = await now(p);
  // hold the ball at the top with a slow lateral dribble (the AI strips a standing handler) until the screen is SET
  const t0 = Date.now(); let set: Mark | undefined;
  while (Date.now() - t0 < 4500) { const r = await lastRow(p); if (!mine(r)) break; await stick(p, Math.sin((Date.now() - t0) / 400) * 0.45, 0); const ms = (await marks(p)).slice(m0); set = ms.find((m) => /OFF\] screen set/.test(m.msg)); if (set) break; await p.waitForTimeout(16); }
  if (!set) { await stick(p, 0, 0); const r = await lastRow(p); L.push(`      O1 try ${attempt + 1}: no screen set (poss ${r.poss}, jobs ${r.jobs.map((j) => j.id + ':' + j.job + '/' + j.phase).join(' ')})`); return false; }
  const side = /side (LEFT|RIGHT)/.exec(set.msg)?.[1] ?? 'RIGHT';
  await p.waitForTimeout(350); await card(p, `${OUT}/${TAG}-${MODE}-screen.png`, 110, 4.5);
  // drive off it (toward the screen's side), then let the play resolve
  await stick(p, side === 'RIGHT' ? 0.7 : -0.7, -0.7); await p.waitForTimeout(700); await stick(p, 0, -0.5); await p.waitForTimeout(600); await stick(p, 0, 0);
  await p.waitForTimeout(1200); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  const mateId = /mate(\d)/.exec(set.msg)?.[0] ?? 'mate0';
  const sc = jobsOf(R.filter((r) => r.t >= set.t), mateId);
  const planted = sc.filter((j) => j.phase === 'set');
  const plantSec = planted.length ? (R.filter((r) => r.t >= set.t).filter((r) => r.jobs.find((j) => j.id === mateId)?.phase === 'set').reduce((a, r, i, arr) => i ? a + (r.t - arr[i - 1].t) : 0, 0)) / 1000 : 0;
  const foeNear = (() => { const row = R.find((r) => r.t >= set.t); const mate = row?.jobs.find((j) => j.id === mateId); if (!row || !mate) return 9; return Math.min(...row.jobs.filter((j) => j.id.startsWith('foe')).map((j) => Math.hypot(j.x - mate.x, j.z - mate.z))); })();
  const after = sc.find((j) => j.phase === 'roll' || j.phase === 'pop');
  const nav = ms.find((m) => /OFF\] navigate/.test(m.msg));
  const switched = R.some((r) => /SWITCHED/.test(r.banner));
  say(L, planted.length >= 8 && plantSec >= 0.5 && mean(planted.map((j) => j.speed)) < 0.6 && foeNear < 1.6, `O1 the screener PLANTS on my defender: ${set.msg} · ${f2(plantSec)} s set (≥ 0.5) at a mean ${f2(mean(planted.map((j) => j.speed)))} m/s (< 0.6, peak ${f2(Math.max(0, ...planted.map((j) => j.speed)))}), ${f2(foeNear)} m from the nearest defender (< 1.6)`);
  say(L, planted.some((j) => /screen_set/.test(j.clips)) && mean(planted.map((j) => j.facing)) >= 0.6, `O1 the plant reads: the screen clip on him (${planted.filter((j) => /screen_set/.test(j.clips)).length} frames), chest on the man he screens (mean facing ${f2(mean(planted.map((j) => j.facing)))} ≥ 0.6)`);
  say(L, !!after, `O1 the read after the plant: ${after ? after.phase.toUpperCase() : 'none'} · phases ${[...new Set(sc.map((j) => j.phase))].join('→')} · jobs ${[...new Set(sc.map((j) => j.job))].join(',')}`);
  say(L, !!nav || switched, `O1 the defender navigates the screen: ${nav?.msg ?? (switched ? 'THEY SWITCHED' : 'no navigate mark, no switch')} · banners ${[...new Set(R.map((r) => r.banner).filter(Boolean))].join(' | ')}`);
  return true;
}
/** O2: a set shot from the top; the moment the ball is up the defenders seal their men, the mates crash, the board is a race. */
async function boxOutScenario(p: Page, L: Lines): Promise<void> {
  const m0 = (await marks(p)).length;
  await stick(p, 0, 0); await p.waitForTimeout(150);
  await rt(p, true); const tS = await now(p);
  await p.waitForTimeout(440); await rt(p, false);
  await padSet(p, 'p.buttons[4].pressed = true; p.buttons[4].value = 1');   // hold L1 (button 4): my own box-out
  await p.waitForTimeout(400); await card(p, `${OUT}/${TAG}-${MODE}-boxout.png`, 120, 5);
  await p.waitForTimeout(1400);
  await padSet(p, 'p.buttons[4].pressed = false; p.buttons[4].value = 0');
  await p.waitForTimeout(400); const tZ = await now(p);
  const R = await rows(p, tS, tZ), ms = (await marks(p)).slice(m0);
  const box = ms.find((m) => /OFF\] box out/.test(m.msg));
  const win = R.filter((r) => box && r.t >= box.t && r.t < box.t + 900);
  const foesBoxing = win.map((r) => r.jobs.filter((j) => j.id.startsWith('foe') && j.boxing).length);
  const facing = win.flatMap((r) => r.jobs.filter((j) => j.id.startsWith('foe') && j.boxing).map((j) => j.facing));
  const crash = win.flatMap((r) => r.jobs.filter((j) => j.id.startsWith('mate') && j.job === 'crash'));
  const board = ms.find((m) => /OFF\] board/.test(m.msg));
  const banners = [...new Set(R.map((r) => r.banner).filter(Boolean))];
  const stance = win.flatMap((r) => r.jobs.filter((j) => j.id.startsWith('foe') && j.boxing && /defend_stance/.test(j.clips)));
  say(L, !!box && Math.max(0, ...foesBoxing) >= (MODE === 'onevone' ? 1 : 2), `O2 the shot goes up and the defenders SEAL: ${box?.msg ?? 'no box-out mark'} · up to ${Math.max(0, ...foesBoxing)} boxing at once over ${win.length} frames`);
  say(L, facing.length >= 8 && absMean(facing) >= 0.5, `O2 the seal faces the man: mean facing ${f2(absMean(facing))} over ${facing.length} boxer-frames (≥ 0.5) · the stance clip ${stance.length} frames`);
  if (MODE === 'threevthree') say(L, crash.length >= 8, `O2 the offense CRASHES: ${crash.length} crasher-frames (≥ 8) · jobs ${[...new Set(win.flatMap((r) => r.jobs.map((j) => j.id + ':' + j.job)))].join(' ')}`);
  say(L, MODE === 'onevone' ? banners.some((b) => /BOARD|\+2|GREEN|LATE|EARLY/.test(b)) : (!!board || banners.some((b) => /GOOD|SPLASH/.test(b))), `O2 the board is a race, not a possession by fiat: ${board?.msg ?? 'no board mark (a make)'} · banners ${banners.join(' | ')}`);
}
/** O3: two seconds of live dribbling at the top: every AI body holds a job and faces its objective most of the time. */
async function awarenessScenario(p: Page, L: Lines): Promise<void> {
  const tS = await now(p);
  const t0 = Date.now();
  while (Date.now() - t0 < 2600) { const r = await lastRow(p); if (!mine(r)) break; await stick(p, Math.sin((Date.now() - t0) / 500) * 0.5, -0.2); await p.waitForTimeout(16); }
  await stick(p, 0, 0); const tZ = await now(p);
  const R = (await rows(p, tS, tZ)).filter((r) => mine(r) && r.jobs.length);
  const ids = [...new Set(R.flatMap((r) => r.jobs.map((j) => j.id)))].filter((id) => id !== 'me');
  let allOk = R.length >= 30;
  for (const id of ids) {
    const J = jobsOf(R, id);
    const idle = J.filter((j) => j.job === 'idle' || j.job === '').length;
    const facing = J.filter((j) => j.facing >= 0.5 || j.speed >= 2.5).length / Math.max(1, J.length);   // facing its job, or running a cut (it faces where it runs)
    const wander = J.filter((j) => j.speed > 0.6 && j.speed < 2.5 && j.facing < 0).length;               // drifting with its back to the play: the mannequin
    const ok = idle === 0 && facing >= 0.7 && wander <= J.length * 0.1;
    allOk = allOk && ok;
    const w = J[Math.floor(J.length / 2)];
    say(L, ok, `O3 ${id}: jobs ${[...new Set(J.map((j) => j.job))].join(',')} · on its job (facing it, or running a cut) ${f0(facing * 100)} % of ${J.length} frames (≥ 70) · idle ${idle} · wandering (moving with the back to the play) ${wander}${ok ? '' : ` · mid-frame at (${f2(w.x)}, ${f2(w.z)}) yaw ${f0(w.yaw * 180 / Math.PI)}° objective (${f2(w.objX)}, ${f2(w.objZ)}) bearing ${f0(Math.atan2(w.objX - w.x, w.objZ - w.z) * 180 / Math.PI)}° speed ${f2(w.speed)} clips ${w.clips}`}`);
  }
  say(L, allOk && ids.length >= (MODE === 'onevone' ? 1 : 5), `O3 every AI body was on a job through ${R.length} live frames (${ids.length} bodies)`);
}

(async () => {
  const out: string[] = [`HOOPS-MOVE-KIT-A probe · ${MODE} · ${TAG} · port ${PORT} · ${new Date().toISOString()}`];
  const { p, close, errors, frames } = await boot();
  try {
    if (want('pullup')) { out.push('\n## 1. M1 — the 1-dribble pull-up (one push, the squeeze while moving)');
    if (await waitOffense(p)) await pullUp(p, out, `${TAG}-${MODE}-pullup`); else out.push('FAIL  no offensive possession for the pull-up'); }
    if (want('set')) { out.push('\n## 2. M1 — the set shot (a squeeze at rest)');
    if (await waitOffense(p)) await setShot(p, out); else out.push('FAIL  no offensive possession for the set shot'); }
    if (want('stepback')) { out.push('\n## 3. M1 — the step-back (contested, the stick pulled off the rim)');
    if (await waitOffense(p)) await stepBack(p, out, `${TAG}-${MODE}`); else out.push('FAIL  no offensive possession for the step-back'); }
    if (want('layup')) { out.push('\n## 4. M3 — the layup, up each side of the lane');
    const sides: { side: string; x: number }[] = [];
    for (const sx of [-0.45, 0.45]) {
      let got: { side: string; x: number } | null = null;
      for (let a = 0; a < 5 && !got; a++) { if (!(await waitOffense(p))) break; got = await layup(p, out, `${TAG}-${MODE}-layup${sx > 0 ? 'B' : 'A'}`, sx); }
      if (got) sides.push(got); else out.push(`FAIL  M3 layup (stick x ${sx}): no attempt reached the layup range in 5 tries`);
    }
    if (sides.length === 2) say(out, sides[0].side !== sides[1].side && sides.every((s) => (s.x < -0.35 ? s.side === 'right' : s.x > 0.35 ? s.side === 'left' : true)), `M3 the finishing hand follows the side of the drive: x ${f2(sides[0].x)} → ${sides[0].side}, x ${f2(sides[1].x)} → ${sides[1].side} (the rim's right side, −x when facing it, is the right hand)`); }
    if (want('floater')) { out.push('\n## 5. M3 — the floater');
    if (await waitOffense(p)) await floater(p, out, `${TAG}-${MODE}`); else out.push('FAIL  no offensive possession for the floater'); }
    if (want('dunk')) { out.push('\n## 6. M2 — the contested drive dunk (through the body in the lane)');
    if (await waitOffense(p)) await contestedDunk(p, out, `${TAG}-${MODE}-dunk`); else out.push('FAIL  no offensive possession for the dunk'); }
    if (want('floor')) { out.push('\n## 7. M2 — floor contact (a sprint into the defender, no squeeze)');
    if (await waitOffense(p)) await floorContact(p, out); else out.push('FAIL  no offensive possession for the floor contact'); }
    if (want('d1')) { out.push('\n## 8. D1 — the AI BLOCKS my jumper / layup / dunk (the rolls forced), the ball loose');
      await luck(p, 0);
      if (await waitOffense(p)) await aiBlocks(p, out, 'jumper'); else out.push('FAIL  no offensive possession for the block (jumper)');
      let got = false; for (let a = 0; a < 4 && !got; a++) { if (!(await waitOffense(p))) break; got = await aiBlocks(p, out, 'layup'); }
      if (!got) out.push('FAIL  D1 layup: no attempt reached the layup range in 4 tries');
      if (await waitOffense(p)) await aiBlocks(p, out, 'dunk'); else out.push('FAIL  no offensive possession for the swat (dunk)');
      await luck(p, null); }
    if (want('d1swat')) { out.push('\n## 9. D1 — the rival DUNKS the lane he beat, and my timed jump SWATS it');
      let seen = false; for (let a = 0; a < 3 && !seen; a++) { if (!(await waitOffense(p))) break; seen = await swatRival(p, out, a); }
      if (!seen) out.push('FAIL  D1 the rival never got a dunk up in 3 possessions'); }
    if (want('d2')) { out.push('\n## 10. D2 — the STRIP on the bump: my poke inside the window; a set defender I jog into strips me (forced), the ball loose');
      if (await waitOffense(p)) await myBumpStrip(p, out); else out.push('FAIL  no possession for my bump strip');
      await luck(p, 0);
      if (await waitOffense(p)) await aiBumpStrip(p, out); else out.push('FAIL  no offensive possession for the ai bump strip');
      await luck(p, null); }
    if (want('o1') && MODE === 'threevthree') { out.push('\n## 12. O1 — the SCREEN: a teammate plants on my defender, rolls or pops; the defender fights over / under');
      let got = false; for (let a = 0; a < 3 && !got; a++) { if (!(await waitOffense(p))) break; got = await screenScenario(p, out, a); }
      if (!got) out.push('FAIL  O1 no screen was set in 3 possessions'); }
    if (want('o2')) { out.push('\n## 13. O2 — the BOX-OUT on a shot: the seals, the crash, the board race');
      if (await waitOffense(p)) await boxOutScenario(p, out); else out.push('FAIL  no offensive possession for the box-out'); }
    if (want('o3')) { out.push('\n## 14. O3 — AWARENESS: every AI body holds a job and faces it through a live possession');
      if (await waitOffense(p)) await awarenessScenario(p, out); else out.push('FAIL  no offensive possession for the awareness read'); }
    if (want('d3')) { out.push('\n## 11. D3 — the grounded hand-up: mine on their release, the AI\'s on my load');
      if (await waitOffense(p)) await myHandUp(p, out); else out.push('FAIL  no possession for my hand-up');
      await luck(p, 0.5);
      if (await waitOffense(p)) await aiHandUp(p, out); else out.push('FAIL  no offensive possession for the ai hand-up');
      await luck(p, null); }
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
