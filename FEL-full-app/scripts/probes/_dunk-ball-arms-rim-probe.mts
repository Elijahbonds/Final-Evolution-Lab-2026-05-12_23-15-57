// DUNK-BALL-ARMS-RIM probe (2026-09-14): the ball, the rim and the arms on /dev/mode/dunk, per rendered frame off the live rig.
//   R1 hold  — from the gather to the iron the ball is IN a palm every frame (parented, on the palm, never through the wrist);
//              the replay carries it in the replayed hands, and after the make it is on the floor, not hovering
//   R2 rim   — a make's ball goes DOWN THROUGH the ring (crosses the rim plane inside the ring, never travels through the iron,
//              falls under gravity through the net to the floor and bounces); a miss never crosses inside the ring
//   R3 arms  — no T, no hand inside the torso, no hand pop, no out-of-scope clip, from the run to feet-down and through the replay
// Pad driver (pre-boot fake DualShock); the SLAM is pressed IN THE PAGE on the flight's clip clock.
// SHOTS=1: the render loop is stopped on each beat after one 2×2 frame (game camera · ball-hand side · ball-hand front ·
// wide profile with the rim) — the freeze perturbs the run, so grade a SHOTS=0 run.
//   PORT=3061 npx tsx scripts/probes/_dunk-ball-arms-rim-probe.mts      (SCEN= · OUT_DIR= · TAG= · SHOTS=1 · VERBOSE=1)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3061', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-ball-arms-rim', TAG = process.env.TAG ?? 'after';
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE, SHOTS = !!process.env.SHOTS;
mkdirSync(OUT, { recursive: true });

type V = { x: number; y: number; z: number };
type Hand = { fwd: number; up: number; out: number };
type Row = { t: number; phase: string; ppw: string; clipTime: number; replaying: boolean; jamContact: boolean; gather: boolean; lob: boolean; dribble: boolean;
  root: V; ats: number; ball: V; parent: string; palmR: V; palmL: V; ballPalm: number; ballWrist: number; ballForearm: number;
  clips: string[]; rider: string; riderOnPalm: boolean; handOff: boolean; hands: { left: Hand; right: Hand } | null; refused: number; outOfScope: number; rim: V; rb: number; banner: string; win: string };
type Mark = { t: number; msg: string };
interface Scenario { name: string; prop: 'none' | 'selflob'; style?: 'power' | 'sig'; slamAt?: number; slam?: boolean; lobAt?: number }
const S: Scenario[] = [
  { name: 'POWER make (slam at clip 1.22)', prop: 'none', slamAt: 1.22 },
  { name: 'LATE make (slam at clip 1.34)', prop: 'none', slamAt: 1.34 },
  { name: 'SIG eastbay make (left-hand carry)', prop: 'none', style: 'sig', slamAt: 1.3 },
  { name: 'MISS (no slam)', prop: 'none', slam: false },
  { name: 'SELF-LOB make (Y on the run, catch, slam)', prop: 'selflob', slamAt: 1.3, lobAt: 500 },
];

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;

async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[] }> {
  const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|FEL-FRAME/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/dev/mode/dunk${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 120000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene, eng = scene.getEngine();
    const S = window.__smp = { rows: [], marks: [], drv: { slamAt: -1, frames: 0, done: true }, shots: ${SHOTS}, shotReq: [], shotsDone: {}, frozen: '', loops: null, grid: null };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|HANDS|JUICE-SOFT|JUICE-SFX|JUICE-LOOK|LOB)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 320) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL|HANDS/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 200) }); ow(...a); };
    const PALM = { x: 0.12, y: -0.04, z: -0.08 };
    const V = (v) => ({ x: v.x, y: v.y, z: v.z });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const segDist = (p, a, b) => { const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z }; const L = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1; const k = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / L)); return dist(p, { x: a.x + ab.x * k, y: a.y + ab.y * k, z: a.z + ab.z * k }); };
    const xf = (m, v) => ({ x: v.x * m.m[0] + v.y * m.m[4] + v.z * m.m[8] + m.m[12], y: v.x * m.m[1] + v.y * m.m[5] + v.z * m.m[9] + m.m[13], z: v.x * m.m[2] + v.y * m.m[6] + v.z * m.m[10] + m.m[14] });
    let heroSeen = null, N = {};
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    // ── the 2×2 eye frame ──
    const mkCam = (name, vp) => { const c = scene.activeCamera.clone(name); c.viewport = vp; c.minZ = 0.02; if (c.rotationQuaternion) c.rotationQuaternion = null; if (c.inputs) c.inputs.clear(); return c; };
    const placeGrid = () => {
      const h = dev.hero(); const ball = scene.getMeshByName('ball'); ball.computeWorldMatrix(true); const c = ball.getAbsolutePosition();
      const pp = dev.dunkPosture.get(); const rim = pp.rim;
      const g = S.grid; const game = S.gameCam;
      // side: the hero's right, level with the ball; front: from the court ahead-left of the body looking back at the ball (the
      // hero runs toward −z, so 'ahead' is −z unless that is inside the backboard — then from behind-left); wide: the full body + rim
      const body = h.position.clone(); body.y += 1.0;
      g.side.position.set(c.x + 1.1, c.y + 0.05, c.z); g.side.setTarget(c.clone());
      const ahead = c.z - 1.0 > rim.z + 0.2 ? -1.0 : 1.0;
      g.front.position.set(c.x - 0.8, c.y + 0.35, c.z + ahead); g.front.setTarget(c.clone());
      const mid = body.clone(); mid.y = Math.max(1.1, (body.y + rim.y) / 2); mid.z = (body.z + rim.z) / 2;
      g.wide.position.set(mid.x - 5.0, mid.y + 0.3, mid.z + 1.2); g.wide.setTarget(mid);
    };
    S.setGrid = (on) => {
      if (on) {
        if (!S.grid) { S.gameCam = scene.activeCamera; S.grid = { side: mkCam('probe_side', new BABYLON_VP(0.5, 0.5, 0.5, 0.5)), front: mkCam('probe_front', new BABYLON_VP(0, 0, 0.5, 0.5)), wide: mkCam('probe_wide', new BABYLON_VP(0.5, 0, 0.5, 0.5)) }; }
        S.gameVp = S.gameCam.viewport; S.gameCam.viewport = new BABYLON_VP(0, 0.5, 0.5, 0.5);
        placeGrid(); scene.activeCameras = [S.gameCam, S.grid.side, S.grid.front, S.grid.wide];
      } else if (S.grid) { scene.activeCameras = []; S.gameCam.viewport = S.gameVp; scene.activeCamera = S.gameCam; }
    };
    const VP = scene.activeCamera.viewport.constructor; window.BABYLON_VP = VP;
    S.thaw = () => { S.setGrid(false); S.frozen = ''; const pm = eng._performanceMonitor; if (pm) { pm.sampleFrame(); pm.sampleFrame(); } if (S.loops) { for (const fn of S.loops) eng.runRenderLoop(fn); S.loops = null; } };
    let gridArmed = '';
    scene.onAfterRenderObservable.add(() => {
      if (S.frozen) return;
      if (gridArmed) { S.frozen = gridArmed; gridArmed = ''; S.loops = [...(eng._activeRenderLoops ?? [])]; eng.stopRenderLoop(); return; }
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\\\d+|_p\\\\d+)?$').test(n.name)) ?? null; N = { LE: f('LeftForeArm'), RE: f('RightForeArm'), LH: f('LeftHand'), RH: f('RightHand') }; }
      if (!N.LH || !N.RH) return;
      h.computeWorldMatrix(true);
      const fresh = (n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
      for (const n of Object.values(N)) if (n) fresh(n);
      const rh = V(N.RH.getAbsolutePosition()), lh = V(N.LH.getAbsolutePosition()), re = V(N.RE.getAbsolutePosition()), le = V(N.LE.getAbsolutePosition());
      const palmR = xf(N.RH.getWorldMatrix(), PALM), palmL = xf(N.LH.getWorldMatrix(), (scene.getMeshByName('ball')?.metadata?.felPalmMirrorLeft ? { x: -PALM.x, y: PALM.y, z: PALM.z } : PALM));
      const ball = scene.getMeshByName('ball'); ball.computeWorldMatrix(true); const bw = V(ball.getAbsolutePosition());
      const pp = dev.dunkPosture.get();
      const an = dev.anim ? dev.anim() : null;
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const row = { t: performance.now(), phase: pp.phase, ppw: pp.window, clipTime: pp.clipTime ?? 0, replaying: !!pp.replaying, jamContact: !!pp.jamContact, gather: !!pp.gather, lob: !!pp.lob?.live, dribble: !!pp.dribble?.active,
        root: V(h.position), ats: scene.animationTimeScale ?? 1, ball: bw, parent: ball.parent ? ball.parent.name : '', palmR, palmL,
        ballPalm: Math.min(dist(bw, palmR), dist(bw, palmL)), ballWrist: Math.min(dist(bw, rh), dist(bw, lh)), ballForearm: Math.min(segDist(bw, re, rh), segDist(bw, le, lh)),
        clips, wts: (an?.hero?.playing ?? []).map((g) => g.clip + ':' + g.weight).join(' '), rider: pp.replayRider || '', handOff: !!pp.handOff, riderOnPalm: (() => { const l = pp.replayRiderLocal; if (!pp.replayRider || !l || !/Hand/.test(pp.replayRider)) return false; const px = /Left/.test(pp.replayRider) && ball.metadata?.felPalmMirrorLeft ? -PALM.x : PALM.x; return Math.hypot(l.x - px, l.y - PALM.y, l.z - PALM.z) < 0.02; })(), hands: an?.hero?.hands ?? null, refused: an ? Object.keys(an.refused ?? {}).length : 0, outOfScope: an ? (an.outOfScope ?? []).length : 0,
        rim: pp.rim, rb: pp.ballRadius, banner: String(hud.banner ?? ''), win: S.marks.filter((m) => /DUNK-WIN/.test(m.msg)).slice(-1)[0]?.msg.slice(11) ?? '' };
      S.rows.push(row); if (S.rows.length > 30000) S.rows.splice(0, 8000);
      // ── the in-page SLAM on the clip clock ──
      const pad = window.__PAD, d = S.drv;
      if (!d.done && pp.phase === 'cinematic' && row.clipTime >= d.slamAt && d.frames === 0) { pad.buttons[0].pressed = true; pad.buttons[0].value = 1; pad.timestamp = performance.now(); d.frames = 5; }
      else if (d.frames > 0) { d.frames--; if (d.frames === 0) { pad.buttons[0].pressed = false; pad.buttons[0].value = 0; pad.timestamp = performance.now(); d.done = true; } }
      // ── beats for the eye ──
      if (S.shots) {
        const R = S.rows, prev = R[R.length - 2];
        const beat = (k, cond) => { if (!gridArmed && cond && !S.shotsDone[k]) { S.shotsDone[k] = row.t; S.setGrid(true); gridArmed = k; } };
        const c0 = S.shotsDone.contact, g0 = S.shotsDone.gather;
        const inT = (x) => x && Math.abs(x.out) < 0.1 && x.fwd < 0.05 && x.fwd > -0.12 && x.up < -0.05 && x.up > -0.5;
        beat('torso', !!row.hands && !row.replaying && (inT(row.hands.left) || inT(row.hands.right)));
        beat('run', S.shotReq.includes('run'));
        beat('gather', row.gather && pp.phase !== 'cinematic');
        beat('plant', pp.phase === 'cinematic' && row.clipTime >= 0.07);
        beat('takeoff', pp.phase === 'cinematic' && row.clipTime >= 0.4);
        beat('hang', pp.phase === 'cinematic' && row.clipTime >= 0.85);
        beat('reach', pp.phase === 'cinematic' && row.clipTime >= 1.15);
        beat('contact', row.jamContact && prev && !prev.jamContact);
        beat('through', !!c0 && !row.replaying && row.ball.y < row.rim.y - 0.28 && !row.parent);
        beat('floor', !!c0 && row.t > c0 + 900 && !row.replaying);
        beat('replay', row.replaying && row.root.y > 0.6);
        beat('miss', pp.phase === 'resolve' && !row.jamContact && !!S.missAt && row.t > S.missAt + 250);
        beat('post', S.shotReq.includes('post'));
        void g0;
      }
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors };
}

const BTN_I = { A: 0, B: 1, X: 2, Y: 3 } as const, DPAD_I = { up: 12, down: 13, left: 14, right: 15 } as const;
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
const stickUp = (p: Page, on: boolean) => padSet(p, `p.axes[1] = ${on ? -1 : 0}`);
const runHold = (p: Page, on: boolean) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? 1 : 0}`);
async function tap(p: Page, i: number, ms = 90): Promise<void> { await padSet(p, `p.buttons[${i}].pressed = true; p.buttons[${i}].value = 1`); await p.waitForTimeout(ms); await padSet(p, `p.buttons[${i}].pressed = false; p.buttons[${i}].value = 0`); }
const tapBtn = (p: Page, b: keyof typeof BTN_I) => tap(p, BTN_I[b]);
const now = async (p: Page) => p.evaluate('performance.now()') as Promise<number>;
const text = async (p: Page) => p.evaluate('document.body.innerText') as Promise<string>;
const hud = async (p: Page, k: string) => p.evaluate(`(() => { try { return String(JSON.parse(document.querySelector('pre').textContent)[${JSON.stringify(k)}] ?? ''); } catch { return ''; } })()`) as Promise<string>;
async function waitApproach(p: Page, ms = 40000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await shoot(p);
    const t = await text(p);
    if (/HOLD to run|Pick your PROP|FINAL ROUND/.test(t) && !/SLAM!|CONFER|CARD|RIVAL ROUND/.test(t)) return true;
    await p.waitForTimeout(120);
  }
  return false;
}
let slugNow = 'x';
async function shoot(p: Page): Promise<void> {
  if (!SHOTS) return;
  const fz = await p.evaluate('window.__smp.frozen') as string;
  if (!fz) return;
  await p.screenshot({ path: `${OUT}/${slugNow}-${fz}.png` });
  await p.evaluate('window.__smp.thaw()');
}
async function waitFor(p: Page, ms: number, until?: () => Promise<boolean>): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await shoot(p); if (until && await until()) return; await p.waitForTimeout(25); }
}

const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2), f3 = (n: number) => n.toFixed(3);
const pct = (a: number[], q: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };

async function attempt(p: Page, sc: Scenario, idx: number): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  slugNow = `${TAG}-${idx}-${sc.name.split(/[ (]/)[0].toLowerCase()}`;
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  // the prop: d-pad up = none; d-pad left cycles the lob family from SELF-LOB
  if (sc.prop === 'none') await tap(p, DPAD_I.up); else { await tap(p, DPAD_I.up); await p.waitForTimeout(200); await tap(p, DPAD_I.left); }
  await p.waitForTimeout(400);
  const want = sc.style ?? 'power';
  for (let i = 0; i < 3 && (await hud(p, 'style')).toLowerCase() !== (want === 'sig' ? 'signature' : want) && !(await hud(p, 'style')).toLowerCase().startsWith(want); i++) { await tapBtn(p, 'B'); await p.waitForTimeout(200); }
  lines.push(`      prop ${await hud(p, 'prop')} · style ${await hud(p, 'style')}`);
  const m0 = (await p.evaluate('window.__smp.marks.length')) as number, tA = await now(p);
  await p.evaluate(`(() => { const S = window.__smp; S.drv = { slamAt: ${sc.slam === false ? 99 : sc.slamAt ?? 1.22}, frames: 0, done: ${sc.slam === false} }; S.shotsDone = {}; S.shotReq = []; S.missAt = 0; })()`);
  await stickUp(p, true); await p.waitForTimeout(200); await runHold(p, true);
  const hold0 = Date.now();
  if (SHOTS) { await waitFor(p, 800); await p.evaluate(`window.__smp.shotReq.push('run')`); }
  if (sc.lobAt != null) { await waitFor(p, Math.max(0, sc.lobAt - (Date.now() - hold0))); await tapBtn(p, 'Y'); lines.push(`      Y (self-lob) at +${Date.now() - hold0} ms`); }
  await waitFor(p, 4000, async () => (await p.evaluate('window.__smp.rows.at(-1)?.phase')) === 'cinematic');
  await runHold(p, false); await stickUp(p, false);
  // the flight, the resolve and the replay
  await waitFor(p, 2600, async () => /resolve|judging/.test(String(await p.evaluate('window.__smp.rows.at(-1)?.phase'))));
  await p.evaluate(`(() => { const S = window.__smp; if (!S.rows.at(-1).jamContact) S.missAt = performance.now(); })()`);
  await waitFor(p, 9000, async () => /HOLD to run|Pick your PROP|RIVAL ROUND|FINAL ROUND/.test(await text(p)) && !/CONFER/.test(await text(p)));
  if (SHOTS) { await p.evaluate(`window.__smp.shotReq.push('post')`); await waitFor(p, 600); }
  const tZ = await now(p);
  const ms = ((await p.evaluate('window.__smp.marks')) as Mark[]).slice(m0);
  const R = ((await p.evaluate('window.__smp.rows')) as Row[]).filter((r) => r.t >= tA && r.t <= tZ);
  if (process.env.DUMP) writeFileSync(`${OUT}/rows-${slugNow}.json`, JSON.stringify({ tA, tZ, marks: ms, rows: R }));
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg)), mark = (re: RegExp) => ms.find((m) => re.test(m.msg));
  const launch = R.find((r) => r.phase === 'cinematic'), resolve = R.find((r) => r.phase === 'resolve'), contact = R.find((r) => r.jamContact);
  const replay0 = R.find((r) => r.replaying), land = mark(/HANDS\] land /);
  const made = !!contact;
  if (!launch || !resolve) { lines.push(`FAIL  never launched/resolved (launch ${!!launch} resolve ${!!resolve})`); return lines; }
  const rim = launch.rim, rb = launch.rb;
  lines.push(`      ${made ? 'MAKE' : 'MISS'} · launch → resolve ${f0(resolve.t - launch.t)} ms · contact ${contact ? '+' + f0(contact.t - launch.t) : '—'} · replay ${replay0 ? '+' + f0(replay0.t - launch.t) : '—'} · land ${land ? '+' + f0(land.t - launch.t) : '—'} · ${ms.filter((m) => /iron contact|windmill top|hang release|LOB\] (CAUGHT|catch|LOST)/.test(m.msg)).map((m) => m.msg.slice(0, 240)).join(' | ')}`);

  // ── R1 HOLD: the gather → the iron, the ball in a palm ──
  const gatherRow = R.find((r) => r.gather) ?? R.find((r) => r.t >= launch.t - 350);
  const holdEnd = contact?.t ?? resolve.t;
  const lobCaught = mark(/LOB\] (CAUGHT|catch)/i);
  const hold = R.filter((r) => r.t >= gatherRow!.t && r.t < holdEnd && !r.lob && !(lobCaught && r.t < lobCaught.t + 110));
  const unparented = hold.filter((r) => !r.parent).length;
  const offPalm = hold.filter((r) => r.ballPalm > 0.03 && !r.handOff);
  const pass = hold.filter((r) => r.handOff && r.ballPalm > 0.03);
  if (pass.length) { let v = 0; for (let i = 1; i < hold.length; i++) if (hold[i].handOff) v = Math.max(v, Math.hypot(hold[i].ball.x - hold[i - 1].ball.x, hold[i].ball.y - hold[i - 1].ball.y, hold[i].ball.z - hold[i - 1].ball.z) / Math.max(1e-3, (hold[i].t - hold[i - 1].t) / 1000)); lines.push(`      hand-to-hand pass: ${pass.length} frames between the palms (max ${f3(Math.max(...pass.map((r) => r.ballPalm)))} m from the nearer palm), ball speed ≤ ${f2(v)} m/s`); }
  const inWrist = hold.filter((r) => r.ballForearm < rb - 0.03);
  say(hold.length > 10 && unparented === 0 && offPalm.length === 0 && inWrist.length === 0,
    `R1 hold gather→${made ? 'iron' : 'resolve'}: ${hold.length} frames from ${gatherRow!.gather ? 'the gather latch' : 'launch −350 ms (no gather latch)'} @${f0(gatherRow!.t - launch.t)} ms — unparented ${unparented}, ball off the palm (> 3 cm) ${offPalm.length} (max ${f3(Math.max(0, ...hold.map((r) => r.ballPalm)))} m), ball centre inside the forearm/wrist (< r−3 cm) ${inWrist.length} (min ${f3(Math.min(9, ...hold.map((r) => r.ballForearm)))} m)`);
  if (inWrist.length && VERBOSE) lines.push(`        in-wrist frames: ${inWrist.slice(0, 12).map((r) => `+${f0(r.t - launch.t)}:${f3(r.ballForearm)} ${r.parent} ct${f2(r.clipTime)} ${r.clips.join('/')}`).join(' ')}`);
  if (offPalm.length && VERBOSE) lines.push(`        off-palm frames: ${offPalm.slice(0, 12).map((r) => `+${f0(r.t - launch.t)}:${f3(r.ballPalm)}${r.parent ? '' : '*'} ${r.phase}`).join(' ')}`);
  // the pre-gather dribble: continuous (no teleport)
  const drib = R.filter((r) => r.t < gatherRow!.t && r.t > tA + 300 && r.phase !== 'cinematic');
  let dribJump = 0; for (let i = 1; i < drib.length; i++) dribJump = Math.max(dribJump, Math.hypot(drib[i].ball.x - drib[i - 1].ball.x, drib[i].ball.y - drib[i - 1].ball.y, drib[i].ball.z - drib[i - 1].ball.z) - Math.hypot(drib[i].root.x - drib[i - 1].root.x, drib[i].root.z - drib[i - 1].root.z));
  const dribFloor = drib.filter((r) => r.ball.y <= rb + 0.04).length;
  lines.push(`      dribble before the gather: ${drib.length} frames, ${dribFloor} on the floor, max ball jump beyond the body's ${f3(dribJump)} m/frame`);
  // the replay: the recorded ball against the replayed hands while the body is in the air before the recorded contact
  if (replay0) {
    const rp = R.filter((r) => r.replaying);
    const air = rp.filter((r) => r.root.y > 0.3);
    const near = air.filter((r) => r.riderOnPalm);   // the recorded ball was IN the palm: the replayed ball must be too
    const floating = near.filter((r) => r.ballPalm > 0.03);
    let pop = 0; for (let i = 1; i < rp.length; i++) if (rp[i].t - rp[i - 1].t < 40) pop = Math.max(pop, Math.hypot(rp[i].ball.x - rp[i - 1].ball.x, rp[i].ball.y - rp[i - 1].ball.y, rp[i].ball.z - rp[i - 1].ball.z));
    lines.push(`      replay riders: palm ${rp.filter((r) => r.riderOnPalm).length} · hand (a pass) ${rp.filter((r) => /Hand/.test(r.rider) && !r.riderOnPalm).length} · body (dribble) ${rp.filter((r) => r.rider && !/Hand/.test(r.rider)).length} · free ${rp.filter((r) => !r.rider).length} · largest ball step ${f3(pop)} m/frame`);
    if (VERBOSE && floating.length) lines.push(`        replay floats: ${floating.slice(0, 14).map((r) => `+${f0(r.t - replay0.t)}:${f3(r.ballPalm)} y${f2(r.root.y)} b${f2(r.ball.y)} ${r.clips.join('/')}`).join(' ')}`);
    say(floating.length <= Math.max(2, near.length * 0.05), `R1 replay: ${rp.length} frames, ${air.length} airborne; ball recorded in the palm ${near.length} — in the palm on the recording but off it (> 3 cm) ${floating.length}, median ${f3(pct(near.map((r) => r.ballPalm), 0.5))} m, p90 ${f3(pct(near.map((r) => r.ballPalm), 0.9))} m`);
  }
  // after the make / miss, before the next attempt resets: the ball rests on the floor, never hovers
  const post = R.filter((r) => r.t > (replay0 ? R.filter((q) => q.replaying).at(-1)!.t : resolve.t + 1500) + 100 && !r.parent && !r.replaying);
  let hover = 0, runH = 0; for (let i = 1; i < post.length; i++) { const still = Math.hypot(post[i].ball.x - post[i - 1].ball.x, post[i].ball.y - post[i - 1].ball.y, post[i].ball.z - post[i - 1].ball.z) < 0.002; runH = still && post[i].ball.y > rb + 0.1 ? runH + 1 : 0; hover = Math.max(hover, runH); }
  say(hover < 10, `R1 after: ${post.length} free frames after the ${replay0 ? 'replay' : 'resolve'}, longest hover (still, ≥ 10 cm off the floor) ${hover} frames${post.length ? ` · ball rests at y ${f2(post.at(-1)!.ball.y)}` : ''}`);

  // ── R2 RIM ──
  const RR = 0.225;
  const ringD = (b: V) => { const dx = b.x - rim.x, dz = b.z - rim.z, rr = Math.hypot(dx, dz); return Math.hypot(rr - RR, b.y - rim.y); };
  const radial = (b: V) => Math.hypot(b.x - rim.x, b.z - rim.z);
  const flushEnd = replay0?.t ?? resolve.t + 1600;
  const fl = R.filter((r) => r.t >= (contact?.t ?? resolve.t) && r.t < flushEnd);
  const release = fl[0];
  if (made) {
    const metal = fl.filter((r) => ringD(r.ball) < rb - 0.015);
    let cross: { r: number; vy: number } | null = null;
    for (let i = 1; i < fl.length; i++) if (fl[i - 1].ball.y >= rim.y && fl[i].ball.y < rim.y) { const k = (fl[i - 1].ball.y - rim.y) / Math.max(1e-6, fl[i - 1].ball.y - fl[i].ball.y); const bx = fl[i - 1].ball.x + (fl[i].ball.x - fl[i - 1].ball.x) * k, bz = fl[i - 1].ball.z + (fl[i].ball.z - fl[i - 1].ball.z) * k; cross = { r: Math.hypot(bx - rim.x, bz - rim.z), vy: (fl[i].ball.y - fl[i - 1].ball.y) / Math.max(1e-3, (fl[i].t - fl[i - 1].t) / 1000) }; break; }
    const minY = Math.min(...fl.map((r) => r.ball.y));
    // coming back UP after it has gone down (a bounce-off ghost) — the lip's ride over the iron is before it goes down
    const downAt = fl.findIndex((r) => r.ball.y < release.y - 0.05);
    let up = 0; for (let i = Math.max(1, downAt + 1); downAt >= 0 && i < fl.length; i++) { const dt = Math.max(1e-3, (fl[i].t - fl[i - 1].t) / 1000); if (fl[i].ats > 0.05 && (fl[i].ball.y - fl[i - 1].ball.y) / dt > 0.4 && fl[i].ball.y > rb + 0.05) up++; }
    let stall = 0, runS = 0; for (let i = 1; i < fl.length; i++) { const d = Math.hypot(fl[i].ball.x - fl[i - 1].ball.x, fl[i].ball.y - fl[i - 1].ball.y, fl[i].ball.z - fl[i - 1].ball.z); runS = d < 0.002 && fl[i].ball.y > rb + 0.1 && fl[i].ats > 0.05 ? runS + 1 : 0; stall = Math.max(stall, runS); }
    const floor = fl.find((r) => r.ball.y <= rb + 0.03);
    say(metal.length <= 2 && !!cross && cross.r <= RR - rb + 0.03 && minY <= rim.y - 0.6 && up === 0 && stall < 6,
      `R2 make: release ${f3(radial(release.ball))} m out / ${f2(release.ball.y - rim.y)} m over the ring; ${fl.length} frames to the replay — inside the iron ${metal.length} (≤ 2 = the touch), crosses the rim plane ${cross ? `${f3(cross.r)} m from the axis (≤ ${f3(RR - rb + 0.03)} clean) at ${f2(cross.vy)} m/s` : 'NEVER'}, lowest ${f2(minY)} m (≤ ${f2(rim.y - 0.6)} = through the net), bounce-back frames ${up}, hover run ${stall}, floor ${floor ? '+' + f0(floor.t - contact!.t) + ' ms' : 'never before the replay'}`);
    if (VERBOSE) lines.push(`        flush: ${fl.filter((_, i) => i % 2 === 0).slice(0, 30).map((r) => `+${f0(r.t - contact!.t)}:(${f2(radial(r.ball))},${f2(r.ball.y)})`).join(' ')}`);
  } else {
    const crossedIn = fl.some((r, i) => i > 0 && fl[i - 1].ball.y >= rim.y && r.ball.y < rim.y && radial(r.ball) < RR);
    say(!crossedIn && !has(/JUICE-LOOK\] punch/), `R2 miss: ball crossed down inside the ring ${crossedIn} · hoop punch ${has(/JUICE-LOOK\] punch/)} (both must be false) · clank ${has(/clank/i)}`);
  }

  // ── R3 ARMS ──
  const body = R.filter((r) => r.t >= tA + 300 && r.t <= (land ? land.t + 600 : resolve.t + 2500));
  const chk = R.filter((r) => (r.t >= tA + 300 && r.t <= (land ? land.t + 600 : resolve.t + 2500)) || r.replaying);
  const isT = (r: Row) => !!r.hands && r.hands.left.out > 0.3 && r.hands.right.out > 0.3 && r.hands.left.up > -0.12 && r.hands.right.up > -0.12;
  const inTorso = (h: Hand) => Math.abs(h.out) < 0.1 && h.fwd < 0.05 && h.fwd > -0.12 && h.up < -0.05 && h.up > -0.5;
  const tee = chk.filter(isT), torso = chk.filter((r) => r.hands && (inTorso(r.hands.left) || inTorso(r.hands.right)));
  let pop = 0; const pops: string[] = [];
  for (let i = 1; i < chk.length; i++) { const a = chk[i - 1], b = chk[i]; if (b.t - a.t > 40 || b.replaying !== a.replaying || b.ats < 0.9) continue; const bodyStep = Math.hypot(b.root.x - a.root.x, b.root.y - a.root.y, b.root.z - a.root.z); const sR = Math.hypot(b.palmR.x - a.palmR.x, b.palmR.y - a.palmR.y, b.palmR.z - a.palmR.z), sL = Math.hypot(b.palmL.x - a.palmL.x, b.palmL.y - a.palmL.y, b.palmL.z - a.palmL.z); const s = Math.max(sR, sL) - bodyStep; if (s > 0.3) { if (VERBOSE && pop === 0) { const j = chk.indexOf(b); lines.push(`        pop detail: ${chk.slice(Math.max(0, j - 3), j + 4).map((r) => `+${f0(r.t - launch.t)} L(${f2(r.palmL.x)},${f2(r.palmL.y)},${f2(r.palmL.z)}) R(${f2(r.palmR.x)},${f2(r.palmR.y)},${f2(r.palmR.z)}) ${(r as unknown as { wts: string }).wts}`).join(' | ')}`); } pop++; if (pops.length < 8) pops.push(`+${f0(b.t - launch.t)}:${f2(s)} ${sR > sL ? 'R' : 'L'} ${a.ppw}→${b.ppw} ct${f2(b.clipTime)} ${b.phase}${b.replaying ? '/replay' : ''} ${b.clips.join('/')}`); } }
  const clipsSeen = [...new Set(chk.flatMap((r) => r.clips))];
  const bleed = clipsSeen.filter((c) => !/^(dunk_|run|idle_stand|walk|bball_|sprint|jog)/.test(c));
  const refused = Math.max(0, ...chk.map((r) => r.refused)), oos = Math.max(0, ...chk.map((r) => r.outOfScope));
  const clipless = body.filter((r) => r.root.y > 0.05 && r.clips.length === 0 && r.t < holdEnd).length;
  // hand-in-torso is REPORTED, not gated: the chest-frame box flags the ball hand carried at the hip, which the eye frames show outside the body
  say(tee.length === 0 && pop === 0 && bleed.length === 0 && oos === 0 && clipless === 0,
    `R3 arms: ${chk.length} frames (run → land+600 + replay): T ${tee.length}${tee.length ? ` @+${f0(tee[0].t - launch.t)} ${tee[0].clips.join('/')}` : ''}, hand in the chest-frame torso box (report only) ${torso.length}${torso.length ? ` @+${f0(torso[0].t - launch.t)} ${torso[0].clips.join('/')}` : ''}, hand pops > 0.3 m/frame ${pop}${pops.length ? ' [' + pops.join(' ') + ']' : ''}, clip-less airborne before the iron ${clipless}, clips ${clipsSeen.join(',')}${bleed.length ? ` — BLEED ${bleed.join(',')}` : ''}, scope refused ${refused} out-of-scope ${oos}`);
  if (VERBOSE && torso.length) { const h = (x: Hand) => `f${f2(x.fwd)} u${f2(x.up)} o${f2(x.out)}`; lines.push(`        torso frames: ${torso.filter((_, i) => i % Math.max(1, Math.floor(torso.length / 10)) === 0).map((r) => `+${f0(r.t - launch.t)} ${r.phase}${r.replaying ? '/replay' : ''} ${r.clips.join('/')} L[${h(r.hands!.left)}] R[${h(r.hands!.right)}]`).join(' · ')}`); }
  return lines;
}

(async () => {
  const picked = S.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const out: string[] = [`DUNK-BALL-ARMS-RIM probe · ${TAG} · port ${PORT} · shots ${SHOTS} · ${new Date().toISOString()}`];
  let errs: string[] = [];
  for (let gi = 0; gi < picked.length; gi += 3) {
    const { p, close, errors } = await boot();
    for (const [k, sc] of picked.slice(gi, gi + 3).entries()) {
      out.push(`\n## ${gi + k + 1}. ${sc.name}`);
      try { out.push(...await attempt(p, sc, gi + k)); } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 300)}`); }
      console.log(out.slice(-8).join('\n'));
    }
    errs = errs.concat(errors); await close();
  }
  out.push(`\nconsole errors: ${errs.length}${errs.length ? '\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : ''}`);
  out.push(`TOTAL PASS ${out.filter((l) => l.startsWith('PASS')).length} · FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`);
  writeFileSync(`${OUT}/report-${TAG}.md`, out.join('\n'));
  console.log(out.slice(-3).join('\n'));
})();
