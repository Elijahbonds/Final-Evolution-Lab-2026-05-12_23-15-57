// DUNK-GLASS-BOUNCE probe (2026-09-08): the off-glass throw, the bounce lob(s), the env bounce and the catch's honesty, per
// rendered frame on /dev/mode/dunk with a pre-boot fake DualShock (the legs probe's driver). The eye is the bar; this is the
// supporting evidence. Off the live scene every frame: the ball (position, distance to each hand, the per-frame jump), the
// hero root, the mode's window / phase / clip time / lob state (`__FEL_DEV__.dunkPosture.get()`), the HUD banner + hint,
// the player's clips; and the [LOB] / [DUNK-WIN] / [HANDS] / [DUNK-PROP] console marks.
// Gates: G1 off-glass (hits the board inside its face, above the iron, comes back, caught, dunked) · G2 bounce lob (a real
// floor contact / two from standing, caught, dunked) · G3 env (a bounce off the CAR's roof) · G4 catch honesty (banners for
// every rebound / catch / loss, 0 ball jumps > 0.45 m/frame, 0 in-hand frames airborne, a bad throw clanks and is a miss)
//   PORT=3026 npx tsx scripts/probes/_dunk-glass-bounce-probe.mts        (SCEN= · OUT_DIR= · TAG= · VERBOSE=1)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const PORT = process.env.PORT ?? '3026', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-glass-bounce', TAG = process.env.TAG ?? 'after';
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE;
mkdirSync(OUT, { recursive: true });
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

type Row = { t: number; hz: number; hy: number; ct: number; ph: string; win: string; bx: number; by: number; bz: number; bh: number; lh: number; rh: number; jump: number; live: boolean; parent: boolean; banner: string; hint: string; clips: string[]; replay: boolean };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';
type Gate = 'G1' | 'G2' | 'G3' | 'G4';
type PropPick = 'none' | 'selflob' | 'offglass' | 'bounce' | 'car';
interface Scenario { name: string; prop: PropPick; gates: Gate[]; throw?: { dir: Dir; when: 'standing' | 'run'; atAhead?: number; walkTo?: number }; lateRun?: number; expectMiss?: boolean; cards?: boolean }
const S: Scenario[] = [
  { name: 'G1 OFF THE GLASS prop (auto-toss on the run) — hits the board, comes back, caught, dunked', prop: 'offglass', gates: ['G1', 'G4'], cards: true },
  { name: 'G1 off the glass BY HAND (up + Y on the run, 3.2 m out)', prop: 'none', throw: { dir: 'up', when: 'run', atAhead: 3.2 }, gates: ['G1', 'G4'], cards: true },
  { name: 'G4 off the glass thrown TOO EARLY (up + Y 4.6 m out) — sails over the board / clanks, a miss that says so', prop: 'none', throw: { dir: 'up', when: 'run', atAhead: 4.6 }, gates: ['G4'], expectMiss: true },
  { name: 'G2 BOUNCE LOB prop (one bounce on the run) — floor contact, caught, dunked', prop: 'bounce', gates: ['G2', 'G4'], cards: true },
  { name: 'G2 BOUNCE-BOUNCE standing (down + Y before the run, then the RUN cue) — two floor contacts, caught, dunked', prop: 'none', throw: { dir: 'down', when: 'standing' }, gates: ['G2', 'G4'], cards: true },
  { name: 'G3 OFF THE CAR (car prop, walk up to its takeoff line, down + Y standing, the RUN cue) — the toss lands on the roof and comes up to the hand', prop: 'car', throw: { dir: 'down', when: 'standing', walkTo: -5.6 }, gates: ['G3', 'G4'], cards: true },
  { name: 'G4 SELF-LOB prop unchanged (A4 regression) — the plain toss still caught', prop: 'selflob', gates: ['G4'] },
  { name: 'G4 LOST: standing bounce-bounce, the run ignored for 2.5 s after the cue — the ball is gone, the miss says LOST', prop: 'none', throw: { dir: 'down', when: 'standing' }, lateRun: 2500, gates: ['G4'], expectMiss: true },
];

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;
const SAMPLER = String.raw`(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene;
  const S = window.__smp = { rows: [], marks: [], replay: false, lastBall: null };
  const oi = console.info.bind(console), ow = console.warn.bind(console);
  console.info = (...a) => { const s = String(a[0]); if (/^\[(DUNK-WIN|DUNK-LAUNCH|DUNK-PROP|DUNK-TRICK|DUNK-CUE|HANDS|JUICE-SOFT|FEL-DUNK|LOB|DUNK-LL)/.test(s)) { S.marks.push({ t: performance.now(), msg: s.slice(0, 220) }); if (/replay air/.test(s)) S.replay = true; if (/replay end/.test(s)) S.replay = false; } oi(...a); };
  console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL|LOB/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 220) }); ow(...a); };
  const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
  let heroSeen = null, LH = null, RH = null;
  scene.onBeforeRenderObservable.add(() => {
    const h = dev.hero(); if (!h) return;
    if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\d+|_p\\d+)?$').test(n.name)) ?? null; LH = f('LeftHand'); RH = f('RightHand'); }
    if (!LH || !RH) return;
    const fresh = (n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
    h.computeWorldMatrix(true); fresh(LH); fresh(RH);
    const lh = LH.getAbsolutePosition(), rh = RH.getAbsolutePosition();
    const ball = scene.getMeshByName('ball'); if (!ball) return; ball.computeWorldMatrix(true); const b = ball.getAbsolutePosition();
    const dl = Math.hypot(b.x - lh.x, b.y - lh.y, b.z - lh.z), dr = Math.hypot(b.x - rh.x, b.y - rh.y, b.z - rh.z);
    const jump = S.lastBall ? Math.hypot(b.x - S.lastBall.x, b.y - S.lastBall.y, b.z - S.lastBall.z) : 0; S.lastBall = { x: b.x, y: b.y, z: b.z };
    const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
    let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
    const pp = dev.dunkPosture ? dev.dunkPosture.get() : { window: '?', phase: '?', clipTime: 0, replaying: false, lob: null };
    S.rows.push({ t: performance.now(), hz: h.position.z, hy: h.position.y, ct: pp.clipTime ?? 0, ph: pp.phase ?? '?', win: pp.window ?? '?', bx: b.x, by: b.y, bz: b.z, bh: Math.min(dl, dr), lh: dl, rh: dr, jump, live: !!(pp.lob && pp.lob.live), parent: !!ball.parent, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? ''), clips, replay: !!pp.replaying || S.replay });
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
const runHold = (p: Page, on: boolean, v = 1) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`);
const btn = (p: Page, b: Btn, on: boolean) => padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`);
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
const dpad = (p: Page, d: Dir, on: boolean) => padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`);
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const rows = async (p: Page, a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const lastRow = async (p: Page): Promise<Row> => p.evaluate('window.__smp.rows[window.__smp.rows.length - 1]') as Promise<Row>;
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;
const hudProp = async (p: Page): Promise<string> => p.evaluate(`(() => { try { return JSON.parse(document.querySelector('pre').textContent).prop || ''; } catch { return ''; } })()`) as Promise<string>;
const heroZ = async (p: Page): Promise<number> => p.evaluate('window.__FEL_DEV__.hero().position.z') as Promise<number>;
async function card(p: Page, path: string, angleDeg = 40, dist = 4.4, target: 'hero' | 'ball' = 'hero'): Promise<void> {
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; }
    const a = ${angleDeg} * Math.PI / 180, dist = ${dist};
    window.__card = scene.onBeforeCameraRenderObservable.add((cam) => {
      const h = dev.hero(); if (!h || cam !== scene.activeCamera) return;
      const yaw = h.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fx * Math.sin(a) + fz * Math.cos(a);
      const c = h.position.clone(); c.y += 1.0;
      ${target === 'ball' ? "const ball = scene.getMeshByName('ball'); if (ball) { const b = ball.getAbsolutePosition(); c.x = (c.x + b.x) / 2; c.y = (c.y + b.y) / 2; c.z = (c.z + b.z) / 2; }" : ''}
      cam.position.set(c.x + dx * dist, c.y + 0.6, c.z + dz * dist);
      if (cam.rotationQuaternion) cam.rotationQuaternion = null;
      cam.setTarget(c);
      cam.getViewMatrix(true);
    });
  })()`);
  await p.waitForTimeout(50);
  await p.screenshot({ path });
  await p.evaluate(`(() => { const scene = window.__FEL_DEV__.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; } })()`);
}
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
let curProp: PropPick = 'none';
const LOB_RING: PropPick[] = ['selflob', 'offglass', 'bounce'];
async function setProp(p: Page, want: PropPick, lines: string[]): Promise<void> {
  const press = async (d: Dir) => { await dpad(p, d, true); await p.waitForTimeout(90); await dpad(p, d, false); await p.waitForTimeout(160); };
  if (want === 'none') await press('up');
  else if (want === 'car') { if (curProp !== 'car') await press('down'); }
  else { const from = LOB_RING.indexOf(curProp), to = LOB_RING.indexOf(want); const n = from < 0 ? to + 1 : (to - from + 3) % 3 || 0; for (let i = 0; i < n; i++) await press('left'); }
  curProp = want;
  await p.waitForTimeout(want === 'car' ? 1300 : 250);
  const shown = await hudProp(p);
  const label: Record<PropPick, string> = { none: 'NO PROP', car: 'CAR', selflob: 'SELF-LOB', offglass: 'OFF THE GLASS', bounce: 'BOUNCE LOB' };
  lines.push(`${shown === label[want] ? 'PASS' : 'FAIL'}  prop ${want} → HUD "${shown}"`);
}
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2);
const LINE_PLAIN = -7.5, LINE_CAR = -10.28 + 4.3;

async function attempt(p: Page, sc: Scenario, idx: number): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  const m0 = (await marks(p)).length, tA = await now(p);
  await setProp(p, sc.prop, lines);
  const slug = `${TAG}-${idx}-${sc.name.split(/[ (—]/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sc.prop}`;
  const shot = async (name: string, angle = 40, dist = 4.4, target: 'hero' | 'ball' = 'hero') => { if (sc.cards) await card(p, `${OUT}/${slug}-${name}.png`, angle, dist, target); };
  const line = sc.prop === 'car' ? LINE_CAR : LINE_PLAIN;
  const pageAt = await now(p); const t0 = Date.now(); const pageNow = () => pageAt + (Date.now() - t0);
  // ── the standing throw (a walk up the runway first when asked), then the RUN cue ──
  let thrownAt = 0, cueAt = 0;
  if (sc.throw?.when === 'standing') {
    if (sc.throw.walkTo != null) { await stickUp(p, true); const w0 = Date.now(); while (Date.now() - w0 < 4000 && (await heroZ(p)) > sc.throw.walkTo) await p.waitForTimeout(15); await stickUp(p, false); await p.waitForTimeout(500); lines.push(`      walked to z ${f2(await heroZ(p))}`); }
    await dpad(p, sc.throw.dir, true); await p.waitForTimeout(40); await tapBtn(p, 'Y', 80); await dpad(p, sc.throw.dir, false);
    thrownAt = pageNow(); lines.push(`      standing ${sc.throw.dir} + Y at z ${f2(await heroZ(p))}`);
    await p.waitForTimeout(150); await shot('throw', 55, 5, 'ball');
    // wait for the RUN cue (the banner / hint), up to 4 s
    const c0 = Date.now(); let cued = false;
    while (Date.now() - c0 < 4500) { const r = await lastRow(p); if (/RUN!/.test(r.banner) || /^RUN!/.test(r.hint)) { cued = true; break; } await p.waitForTimeout(12); }
    cueAt = pageNow();
    say(cued, `RUN cue shown ${cued ? `+${f0(cueAt - thrownAt)} ms after the throw` : 'NEVER'}`);
    await shot('cue', 40, 6, 'ball');
    if (sc.lateRun) await p.waitForTimeout(sc.lateRun);
  }
  // ── the run: HOLD (the pad's RUN) from where we stand; a hand throw on the run at the asked distance ──
  await runHold(p, true, 1);
  const tHold = pageNow(); let launched = false, launchPage = 0, handThrown = false;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  const h0 = Date.now();
  while (!launched && Date.now() - h0 < 4500) {
    if (sc.throw?.when === 'run' && !handThrown) { const z = await heroZ(p); if (z <= line + (sc.throw.atAhead ?? 3.2)) { await dpad(p, sc.throw.dir, true); await p.waitForTimeout(30); await tapBtn(p, 'Y', 70); await dpad(p, sc.throw.dir, false); handThrown = true; lines.push(`      run ${sc.throw.dir} + Y at z ${f2(z)} (${f2(z - line)} m out)`); } }
    await p.waitForTimeout(12); await launchedYet();
  }
  await runHold(p, false);
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 2000) await p.waitForTimeout(40);
  if (!launched) { lines.push('FAIL  never launched'); return lines; }
  const sinceLaunch = () => pageNow() - launchPage;
  // the SLAM taps
  let slamOn = true; const shots = new Set<string>();
  const slamLoop = (async () => { let next = 950; while (slamOn && sinceLaunch() < 2300) { const el = sinceLaunch(); if (el >= next) { await tapBtn(p, 'A', 60); next = el + 85; } await new Promise((res) => setTimeout(res, 15)); } })();
  while (sinceLaunch() < 2600) {
    const r = await lastRow(p); const ms = (await marks(p)).slice(m0);
    const want = (k: string, cond: boolean) => { if (cond && !shots.has(k)) { shots.add(k); return true; } return false; };
    if (want('glass', ms.some((m) => /OFF THE GLASS at/.test(m.msg)))) await shot('glass', 70, 6, 'ball');
    if (want('bounce', ms.some((m) => /\[LOB\] BOUNCE 1/.test(m.msg)))) await shot('bounce', 55, 6, 'ball');
    if (want('air', r.live && r.ph === 'cinematic' && r.ct > 0.3)) await shot('air', 55, 5, 'ball');
    if (want('catch', ms.some((m) => /\[LOB\] CAUGHT/.test(m.msg)))) await shot('catch', 55, 4.4);
    if (want('jam', r.win === 'contact')) await shot('jam', 55, 4.4);
    await p.waitForTimeout(20);
  }
  slamOn = false; await slamLoop;
  // wait for the attempt to end (the next approach / the rival's round)
  { const e0 = Date.now(); while (Date.now() - e0 < 14000) { const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND|RIVAL ROUND/.test(t) && !/SLAM!|CONFER|CARD/.test(t) && Date.now() - e0 > 1500) break; await p.waitForTimeout(120); } }
  const tZ = await now(p);
  const ms = (await marks(p)).slice(m0), R = await rows(p, tA, tZ);
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg)), mark = (re: RegExp) => ms.find((m) => re.test(m.msg));
  const made = has(/DUNK-WIN\] contact/);
  const thrown = mark(/\[LOB\] (OFF-GLASS LOB|BOUNCE LOB|BOUNCE-BOUNCE LOB|SELF-LOB) from/), caught = mark(/\[LOB\] CAUGHT/), lost = mark(/\[LOB\] LOST/);
  const live = R.filter((r) => !r.replay);
  const banners = [...new Set(live.map((r) => r.banner).filter(Boolean))];
  const span = live.filter((r) => thrown && r.t >= thrown.t + 20 && r.t <= (caught?.t ?? lost?.t ?? thrown.t + 4000));
  // in-hand while live = the ball RIDING the hand (parented, or ≥ 6 consecutive frames inside 0.2 m of it) from 150 ms after the
  // release (the throw's hands travel with the ball for ~70 ms) to the catch; a ball passing the hands on its way is not a ride
  const jumps = span.filter((r) => r.jump > 0.45);
  const liveRows = span.filter((r) => r.live && thrown && r.t > thrown.t + 150 && r.t < (caught?.t ?? Infinity) - 30);
  const inHand: Row[] = []; { let run: Row[] = []; for (const r of liveRows) { if (r.parent) inHand.push(r); if (r.bh < 0.2 && r.by > 0.5) run.push(r); else { if (run.length >= 6) inHand.push(...run); run = []; } } if (run.length >= 6) inHand.push(...run); }
  const nearHand = liveRows.filter((r) => r.bh < 0.2 && r.by > 0.5);
  const apex = Math.max(-1, ...span.map((r) => r.by));
  lines.push(`      ${made ? 'MAKE' : 'MISS'} · thrown ${thrown ? `+${f0(thrown.t - (launchPage))} ms vs launch` : 'NO'} · caught ${caught ? `@${/@([\d.]+)/.exec(caught.msg)?.[1] ?? '?'} clip (+${f0(caught.t - launchPage)} ms)` : 'NO'} · lost ${lost ? 'yes' : 'no'} · ball apex ${f2(apex)} m · banners: ${banners.join(' | ')}`);
  if (thrown) lines.push(`      ${thrown.msg.slice(6)}`);
  for (const m of ms.filter((m) => /\[LOB\] (OFF THE GLASS|BOUNCE|OVER|WIDE|CLANK|RUN|off the side|glass =)/.test(m.msg))) lines.push(`      ${m.msg.slice(6)}${thrown ? ` (+${f0(m.t - thrown.t)} ms after the throw)` : ''}`);
  const glassHit = mark(/\[LOB\] OFF THE GLASS at/);
  const hitY = glassHit ? Number(/,([\d.]+)\)/.exec(glassHit.msg)?.[1] ?? NaN) : NaN;
  const bounces = ms.filter((m) => /\[LOB\] BOUNCE \d/.test(m.msg));
  // ── G1: off the glass ──
  if (sc.gates.includes('G1')) {
    const back = glassHit && caught ? live.filter((r) => r.t > glassHit.t && r.t < caught.t) : [];
    const cameBack = back.length > 2 && back[back.length - 1].bz > back[0].bz + 0.5;
    say(!!thrown && !!glassHit && hitY >= 3.05 + 0.2 && hitY <= 4.03 && cameBack && !!caught && made,
      `G1 off the glass: thrown ${thrown ? 'yes' : 'NO'}, met the board ${glassHit ? `at ${f2(hitY)} m (band 2.98–4.03, iron 3.05)` : 'NEVER'}, came back out ${cameBack ? `${f2(back[back.length - 1].bz - back[0].bz)} m` : 'NO'}, caught ${caught ? 'yes' : 'NO'}, ${made ? 'DUNKED' : 'not dunked'}`);
  }
  // ── G2: the bounce lob ──
  if (sc.gates.includes('G2')) {
    const wantN = sc.throw?.when === 'standing' ? 2 : 1;
    const floorRows = span.filter((r) => r.by < 0.2).length;
    say(!!thrown && bounces.length >= wantN && !!caught && made && apex >= 2.4,
      `G2 bounce lob: ${bounces.length} floor contact${bounces.length === 1 ? '' : 's'} (≥ ${wantN}), ball near the floor ${floorRows} frames, last apex ${f2(apex)} m (≥ 2.4), caught ${caught ? 'yes' : 'NO'}, ${made ? 'DUNKED' : 'not dunked'}`);
  }
  // ── G3: the env bounce ──
  if (sc.gates.includes('G3')) {
    const env = mark(/off the CAR|on the CAR/);
    say(!!env && has(/\[LOB\] BOUNCE \d off the CAR/) && !!caught,
      `G3 off the car: ${env ? env.msg.slice(6, 90) : 'no car contact'} · caught ${caught ? 'yes' : 'NO'} · ${made ? 'DUNKED' : 'not dunked'} · ${has(/CLEARED CAR/) ? 'car cleared' : has(/CLIPPED CAR/) ? 'car CLIPPED (the run from 1.7 m out)' : 'car not crossed'}`);
  }
  // ── G4: the catch's honesty ──
  if (sc.gates.includes('G4')) {
    const rebound = banners.some((b) => /OFF THE GLASS!|BOUNCE|OFF THE CAR|OFF THE IRON|OVER THE GLASS|WIDE OF/.test(b));
    const catchB = banners.some((b) => /CAUGHT/.test(b)), lostB = banners.some((b) => /LOST THE|OFF THE IRON|OVER THE GLASS/.test(b));
    if (sc.expectMiss) say(!made && !caught && lostB && jumps.length === 0, `G4 honest miss: ${made ? 'MADE?!' : 'missed'}, caught ${caught ? 'YES?!' : 'no'}, the banner said ${lostB ? `"${banners.find((b) => /LOST THE|OFF THE IRON|OVER THE GLASS/.test(b))}"` : 'NOTHING'}, ${jumps.length} ball jumps > 0.45 m/frame (0)`);
    else say(!!caught && jumps.length === 0 && inHand.length === 0 && catchB && (rebound || sc.prop === 'selflob'),
      `G4 catch honesty: caught ${caught ? 'yes' : 'NO'}, ${jumps.length} ball jumps > 0.45 m/frame (0), ${inHand.length} frames riding the hand while the lob was live (0; ${nearHand.length} frames merely passing inside 0.2 m${nearHand.length ? ': ' + nearHand.slice(0, 4).map((r) => `+${f0(r.t - (thrown?.t ?? 0))} ms ${r.ph} y ${f2(r.by)}`).join(', ') : ''}), banners: rebound ${rebound ? 'yes' : sc.prop === 'selflob' ? 'n/a' : 'NO'} · catch ${catchB ? 'yes' : 'NO'}`);
    if (jumps.length) lines.push(`      jumps: ${jumps.slice(0, 5).map((r) => `+${f0(r.t - (thrown?.t ?? 0))} ms ${f2(r.jump)} m (ball ${f2(r.bx)},${f2(r.by)},${f2(r.bz)} ${r.ph} ${r.win})`).join(' · ')}`);
  }
  const judged = /JUDGES (\d+)/.exec(R.map((r) => r.banner).join('|'))?.[1];
  if (judged) lines.push(`      card: JUDGES ${judged}`);
  if (VERBOSE && thrown) { const seq = span.filter((_, i) => i % 4 === 0); for (const r of seq) lines.push(`        +${f0(r.t - thrown.t)} ball (${f2(r.bx)},${f2(r.by)},${f2(r.bz)}) hand ${f2(r.bh)} hero z ${f2(r.hz)} ${r.ph} ${r.win} ct ${f2(r.ct)} ${r.banner}`); }
  return lines;
}

(async () => {
  const picked = S.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const groups: Scenario[][] = []; for (let i = 0; i < picked.length; i += 4) groups.push(picked.slice(i, i + 4));
  const out: string[] = [`DUNK-GLASS-BOUNCE probe · ${TAG} · port ${PORT} · ${process.env.QS ?? ''} · ${new Date().toISOString()}`];
  let allErrors: string[] = [], allFrames: string[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const { p, close, errors, frames } = await boot();
    curProp = 'none';
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
