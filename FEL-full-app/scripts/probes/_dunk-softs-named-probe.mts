// DUNK-SOFTS-NAMED probe (2026-09-08): the three eye softs on /dev/mode/dunk, graded per rendered frame, on a PAD
// (a pre-boot fake standard Gamepad: L stick, R2 analog, face buttons, d-pad) or the KEYBOARD (WASD, space, jkli, arrows).
//   1. named dunks read — cartwheel / kick-up / scorpion / hide & seek / lost & found: the trick fires, its authored
//      body plays, the banner names it, the make is judged under its name (or the miss names it); a press that cannot
//      fire says why (no silent fail); a direction held early or a button tapped before the rise still fires.
//   2. the alley-oop hand-off — the passer holds the ball from the arm (no teleport at the launch), the toss leaves his
//      palm, the catch is a parent swap the ball eases through (max per-frame step across the launch / the catch).
//   3. the MISSED banner — clank / lost lob / car clip: one honest MISSED banner from the miss to the next run-up, no
//      blank frame, no make-only banner, no SLAM! / CONFER hint stacked under it.
//   PORT=3075 SRC=pad npx tsx scripts/probes/_dunk-softs-named-probe.mts        (SRC=key for the keyboard; SCEN= filters)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const PORT = process.env.PORT ?? '3075', SRC = (process.env.SRC ?? 'pad') as 'pad' | 'key', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-softs-named';
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE;
mkdirSync(OUT, { recursive: true });
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

type Row = { t: number; dt: number; x: number; y: number; z: number; clips: string[]; bx: number; by: number; bz: number; hx: number; hy: number; hz: number; sx: number; sy: number; sz: number; fx: number; fy: number; fz: number; cx: number; cy: number; cz: number; feet: number; parent: string; owner: string; banner: string; hint: string; prop: string; score: number };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';
interface Scenario {
  name: string; prop: 'none' | 'alleyoop' | 'selflob' | 'car' | 'barrier' | 'crate';
  standing?: Btn[]; standWait?: number;
  hold?: number;                  // release the run this many ms in (a short hold = jump from here)
  rt?: number;                    // pad: the R2 depth (a shallow hold is the weak jump — the pad's charge is the depth, the keyboard's ramps)
  runway?: { at: number; btn: Btn; whenZ?: number }[];   // whenZ: press once the hero's z is at or past it (the double-up window)
  preHold?: Dir;                  // a direction held from the run-up through the air (the human way)
  air?: { at: number; dir?: Dir; btn: Btn; holdMs?: number }[];
  style?: 'power' | 'flashy' | 'sig'; noSlam?: boolean; miss?: 'clank' | 'lost' | 'clip'; expectTrick?: string; expectRunway?: string; expectRefusal?: boolean; shot?: number;
}
const SCENARIOS: Scenario[] = [
  { name: 'prop ring (d-pad up / right / left / down ×3 / up)', prop: 'none' },
  { name: 'KICK-UP: B on the run', prop: 'none', runway: [{ at: 260, btn: 'B' }], expectRunway: 'kickup' },
  { name: 'CARTWHEEL: X on the run', prop: 'none', runway: [{ at: 220, btn: 'X' }], expectRunway: 'cartwheel', shot: 0.45 },
  { name: 'SELF-LOB: Y on the run', prop: 'none', runway: [{ at: 220, btn: 'Y' }], expectRunway: 'selflob' },
  { name: 'DOUBLE-UP: A inside the window', prop: 'none', runway: [{ at: 300, btn: 'A', whenZ: -6.1 }], expectRunway: 'doubleup' },
  { name: 'SCORPION: right + Y at +450 ms', prop: 'none', air: [{ at: 450, dir: 'right', btn: 'Y' }], expectTrick: 'scorpion', shot: 0.75 },
  { name: 'HIDE & SEEK: left held from the run, A at +120 ms (before the rise)', prop: 'none', preHold: 'left', air: [{ at: 120, btn: 'A' }], expectTrick: 'hideseek', shot: 0.8 },
  { name: 'LOST & FOUND: left + B at +430 ms', prop: 'none', air: [{ at: 430, dir: 'left', btn: 'B' }], expectTrick: 'lostfound', shot: 0.85 },
  { name: 'SCORPION MISSED: right + Y, no slam', prop: 'none', air: [{ at: 450, dir: 'right', btn: 'Y' }], expectTrick: 'scorpion', noSlam: true, miss: 'clank' },
  { name: 'ALLEY-OOP: passer palm → catch', prop: 'alleyoop', shot: 0.7 },
  { name: 'MISSED clank: plain run, no slam', prop: 'none', noSlam: true, miss: 'clank' },
  { name: 'FLASHY clank: authored takeoff, no slam', prop: 'none', style: 'flashy', noSlam: true, miss: 'clank' },
  { name: 'SIG clank: eastbay takeoff, no slam', prop: 'none', style: 'sig', noSlam: true, miss: 'clank' },
  { name: 'MISSED lost lob: standing Y, 2.2 s wait, then run', prop: 'none', standing: ['Y'], standWait: 2200, miss: 'lost' },
  { name: 'MISSED car clip: weak jump over the CAR', prop: 'car', hold: SRC === 'key' ? 240 : undefined, rt: 0.3, miss: 'clip' },
  { name: 'REFUSED: B on the run after the SELF-LOB prop tossed', prop: 'selflob', runway: [{ at: 900, btn: 'B' }], expectRefusal: true },
  { name: 'REFUSED: X on the run with the ALLEY-OOP armed', prop: 'alleyoop', runway: [{ at: 250, btn: 'X' }], expectRefusal: true },
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
  if (SRC === 'pad') await ctx.addInitScript(PAD_INIT);
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
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|DUNK-CAM|LOB|DUNK-PROP|DUNK-TRICK|HANDS|JUICE-SOFT|FEL-DUNK|PAD)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 160) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 160) }); ow(...a); };
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    let hand = null, lhand = null, shoulder = null, forearm = null, feetL = null, feetR = null, heroSeen = null, ballRef = null;
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); hand = d.find((n) => /^RightHand/.test(n.name)) ?? null; lhand = d.find((n) => /^LeftHand/.test(n.name)) ?? null; shoulder = d.find((n) => /^RightArm/.test(n.name)) ?? null; forearm = d.find((n) => /^RightForeArm/.test(n.name)) ?? null; feetL = d.find((n) => /^LeftFoot/.test(n.name)) ?? null; feetR = d.find((n) => /^RightFoot/.test(n.name)) ?? null; }
      // the game's ball: by name in the live scene, else the 'ball' parented to a hand (a dev double-mount can leave the mode's
      // singleton ball in the disposed scene — gameplay still moves it, the scene list no longer has it); cached once seen
      if (!ballRef || ballRef.isDisposed?.() && !ballRef.parent) { const byName = scene.meshes.find((m) => m.name === 'ball'); ballRef = byName ?? [hand, lhand].filter(Boolean).flatMap((n) => n.getChildren()).find((n) => n.name === 'ball') ?? ballRef; }
      const ball = ballRef;
      const bp = ball ? ball.getAbsolutePosition() : null, hp = hand ? hand.getAbsolutePosition() : null, sp = shoulder ? shoulder.getAbsolutePosition() : null, fp = forearm ? forearm.getAbsolutePosition() : null, cp = scene.activeCamera ? scene.activeCamera.globalPosition : null;
      const fy = Math.min(feetL ? feetL.getAbsolutePosition().y : 9, feetR ? feetR.getAbsolutePosition().y : 9);
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const owner = ball && ball.parent ? (rootOf(ball.parent) === h ? 'hero' : 'other:' + rootOf(ball.parent).name) : '';
      S.rows.push({ t: performance.now(), dt: scene.getEngine().getDeltaTime(), x: h.position.x, y: h.position.y, z: h.position.z, clips, bx: bp ? bp.x : 0, by: bp ? bp.y : 0, bz: bp ? bp.z : 0, hx: hp ? hp.x : 0, hy: hp ? hp.y : 0, hz: hp ? hp.z : 0, sx: sp ? sp.x : 0, sy: sp ? sp.y : 0, sz: sp ? sp.z : 0, fx: fp ? fp.x : 0, fy: fp ? fp.y : 0, fz: fp ? fp.z : 0, cx: cp ? cp.x : 0, cy: cp ? cp.y : 0, cz: cp ? cp.z : 0, feet: fy, parent: ball && ball.parent ? ball.parent.name : '', owner, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? ''), prop: String(hud.prop ?? ''), score: Number(hud.score ?? 0) });
      if (S.rows.length > 30000) S.rows.splice(0, 8000);
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors, frames };
}

// ── the driver: one vocabulary, two sources ──
const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
const BTN_K: Record<Btn, string> = { A: 'j', B: 'k', X: 'l', Y: 'i' }, DPAD_K: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
async function stickUp(p: Page, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.axes[1] = ${on ? -1 : 0}`); else { if (on) await p.keyboard.down('w'); else await p.keyboard.up('w'); } }
async function runHold(p: Page, on: boolean, v = 1): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`); else { if (on) await p.keyboard.down(' '); else await p.keyboard.up(' '); } }
async function btn(p: Page, b: Btn, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`); else { if (on) await p.keyboard.down(BTN_K[b]); else await p.keyboard.up(BTN_K[b]); } }
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
async function dpad(p: Page, d: Dir, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`); else { if (on) await p.keyboard.down(DPAD_K[d]); else await p.keyboard.up(DPAD_K[d]); } }
async function tapDpad(p: Page, d: Dir, ms = 90): Promise<void> { await dpad(p, d, true); await p.waitForTimeout(ms); await dpad(p, d, false); }

const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const rows = async (p: Page, a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
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
const RING = ['none', 'alleyoop', 'selflob', 'car', 'barrier', 'crate'] as const;
let curProp: Scenario['prop'] = 'none', curStyle: 'power' | 'flashy' | 'sig' = 'power';
async function setProp(p: Page, want: Scenario['prop'], lines: string[]): Promise<void> {
  if (SRC === 'pad') {
    // the d-pad ring: up = none, right = alley-oop, left = self-lob, down = the next obstacle (car → barrier → crate)
    if (want === 'none') await tapDpad(p, 'up'); else if (want === 'alleyoop') await tapDpad(p, 'right'); else if (want === 'selflob') await tapDpad(p, 'left');
    else { const order = ['car', 'barrier', 'crate']; const cur = order.indexOf(curProp); const n = ((order.indexOf(want) - (cur < 0 ? -1 : cur)) + 3) % 3 || (cur === order.indexOf(want) ? 0 : 3); for (let i = 0; i < n; i++) { await tapDpad(p, 'down'); await p.waitForTimeout(140); } }
  } else {
    const n = (RING.indexOf(want) - RING.indexOf(curProp) + RING.length) % RING.length;
    for (let i = 0; i < n; i++) { await tapBtn(p, 'X'); await p.waitForTimeout(140); }
  }
  curProp = want;
  await p.waitForTimeout(want === 'none' ? 250 : 1300);   // the obstacle mesh / the passer loads
  const shown = await hudProp(p);
  const label = { none: 'NO PROP', alleyoop: 'ALLEY-OOP', selflob: 'SELF-LOB', car: 'CAR', barrier: 'BARRIER', crate: 'CRATE' }[want];
  lines.push(`${shown === label ? 'PASS' : 'FAIL'}  prop ${want} → HUD "${shown}"`);
}

/** Distinct banner runs (text + ms) across the rows. */
function bannerRuns(R: Row[]): { text: string; ms: number; from: number }[] {
  const out: { text: string; ms: number; from: number }[] = [];
  for (const r of R) { const last = out[out.length - 1]; if (last && last.text === r.banner) last.ms += r.dt; else out.push({ text: r.banner, ms: r.dt, from: r.t }); }
  return out;
}
const MAKE_WORDS = /DUNK!|WINDMILL!|TOMAHAWK!|FIFTY|CHAIN x|HANG TIME|ON FIRE|HEATING/;

async function attempt(p: Page, sc: Scenario): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  const m0 = (await marks(p)).length, tA = await now(p);
  if (sc.name.startsWith('prop ring')) {
    if (SRC === 'pad') { for (const [d, want] of [['up', 'NO PROP'], ['right', 'ALLEY-OOP'], ['left', 'SELF-LOB'], ['down', 'CAR'], ['down', 'BARRIER'], ['down', 'CRATE'], ['up', 'NO PROP']] as const) { await tapDpad(p, d); await p.waitForTimeout(d === 'up' ? 300 : 1200); const shown = await hudProp(p); say(shown === want, `d-pad ${d} → "${shown}" (want ${want})`); } curProp = 'none'; }
    else { for (const want of ['ALLEY-OOP', 'SELF-LOB', 'CAR', 'BARRIER', 'CRATE', 'NO PROP']) { await tapBtn(p, 'X'); await p.waitForTimeout(1200); const shown = await hudProp(p); say(shown === want, `X → "${shown}" (want ${want})`); } curProp = 'none'; }
    return lines;
  }
  await setProp(p, sc.prop, lines);
  if (VERBOSE) lines.push('      balls: ' + await p.evaluate(`window.__FEL_DEV__.scene.meshes.filter((m) => /ball/i.test(m.name)).map((m) => { const a = m.getAbsolutePosition(); return m.name + '@(' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + ',' + a.z.toFixed(1) + ') parent=' + (m.parent ? m.parent.name : '-') + ' meta=' + JSON.stringify(m.metadata || null) + ' enabled=' + m.isEnabled(); }).join(' | ')`));
  { const ring = ['power', 'flashy', 'sig'] as const; const want = sc.style ?? 'power'; const n = (ring.indexOf(want) - ring.indexOf(curStyle) + 3) % 3; for (let i = 0; i < n; i++) { await tapBtn(p, 'B'); await p.waitForTimeout(140); } curStyle = want; if (n) lines.push(`      style → ${want}`); }
  for (const b of sc.standing ?? []) { await tapBtn(p, b); lines.push(`      standing ${b}`); }
  if (sc.standWait) await p.waitForTimeout(sc.standWait);
  const tRun = await now(p);
  let preHeld = false;   // the direction is held once the RUN is down (in the approach the pad's d-pad picks the prop)
  await stickUp(p, true); await runHold(p, true, sc.rt ?? 1);
  const holdStart = Date.now();
  const runway = [...(sc.runway ?? [])].sort((a, b) => a.at - b.at);
  let launched = false, launchPage = 0;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  while (!launched && Date.now() - holdStart < 3200) {
    const el = Date.now() - holdStart;
    if (sc.preHold && !preHeld && el >= 150) { preHeld = true; await dpad(p, sc.preHold, true); lines.push(`      d-pad ${sc.preHold} held from +${el} ms of the run`); }
    while (runway.length && el >= runway[0].at) {
      if (runway[0].whenZ != null) { const z = await p.evaluate('(window.__FEL_DEV__.hero() || { position: { z: 0 } }).position.z') as number; if (z > runway[0].whenZ) break; }
      const k = runway.shift()!; await tapBtn(p, k.btn); lines.push(`      runway ${k.btn} at +${el} ms${k.whenZ != null ? ' (z ≤ ' + k.whenZ + ')' : ''}`);
    }
    if (sc.hold != null && el >= sc.hold) break;
    await p.waitForTimeout(30); await launchedYet();
  }
  await runHold(p, false); await stickUp(p, false);
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 2000) await p.waitForTimeout(40);
  if (!launched) { lines.push('FAIL  never launched'); if (sc.preHold) await dpad(p, sc.preHold, false); return lines; }
  const pageNow = await now(p);
  const sinceLaunch = () => Date.now() - (r0 - (pageNow - launchPage));
  const air = [...(sc.air ?? [])].sort((a, b) => a.at - b.at);
  let shotDone = sc.shot == null;
  let nextSlam = 950;
  while (sinceLaunch() < 2600) {
    const el = sinceLaunch();
    if (air.length && el >= air[0].at) { const a = air.shift()!; if (a.dir) { await dpad(p, a.dir, true); await p.waitForTimeout(20); } await tapBtn(p, a.btn); if (a.dir) await dpad(p, a.dir, false); lines.push(`      air ${a.dir ?? (sc.preHold ? sc.preHold + '(held)' : '')}+${a.btn} at +${el} ms`); }
    if (!shotDone && el >= sc.shot! * 1000) { shotDone = true; await p.screenshot({ path: `${OUT}/${SRC}-${sc.name.split(':')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png` }); }
    if (!sc.noSlam && el >= nextSlam && el <= 2300) { await tapBtn(p, 'A', 60); nextSlam = el + 85; }
    await p.waitForTimeout(25);
  }
  if (sc.preHold) await dpad(p, sc.preHold, false);
  // ride out the verdict to the next approach (the miss beat / the reveal) so the banner sequence is complete
  const tEnd0 = Date.now(); while (Date.now() - tEnd0 < 9000) { const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND|RIVAL ROUND/.test(t) && !/SLAM!|CONFER|CARD/.test(t) && Date.now() - tEnd0 > 1500) break; await p.waitForTimeout(120); }
  const tZ = await now(p);
  const ms = (await marks(p)).slice(m0), R = await rows(p, tA, tZ);
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg));
  const airRows = R.filter((r) => r.t > launchPage && r.y > 0.06 && r.t < (ms.find((m) => /HANDS\] land /.test(m.msg))?.t ?? Infinity));
  const clipless = airRows.filter((r) => r.clips.length === 0).length, idleAir = airRows.filter((r) => r.clips.some((c) => /^(idle_stand|run|walk)$/.test(c)) && !r.clips.some((c) => /^dunk_|jumpshot/.test(c))).length;
  say(clipless === 0 && idleAir === 0, `air: ${airRows.length} frames, ${clipless} clip-less, ${idleAir} idle — windows ${ms.filter((m) => /DUNK-WIN/.test(m.msg)).map((m) => m.msg.slice(11)).join('→')}`);
  lines.push(`      clips in the air: ${[...new Set(airRows.flatMap((r) => r.clips))].join(', ')} · apex ${Math.max(0, ...airRows.map((r) => r.y)).toFixed(2)} m`);
  { const resolveT = ms.find((m) => /miss clank|DUNK-WIN\] contact|\[LOB\] LOST|CLIPPED/.test(m.msg))?.t ?? launchPage + 2000;
    const fl = R.filter((r) => r.t > launchPage && r.t <= resolveT); let hs = 0, hAt = 0, hRow: Row | null = null, hPrev: Row | null = null;
    for (let i = 1; i < fl.length; i++) { const st = Math.hypot(fl[i].hx - fl[i - 1].hx, fl[i].hy - fl[i - 1].hy, fl[i].hz - fl[i - 1].hz); if (st > hs) { hs = st; hAt = fl[i].t - launchPage; hRow = fl[i]; hPrev = fl[i - 1]; } }
    const cut = ms.find((m) => /DUNK-CAM/.test(m.msg));
    // the catch beat (clip 0.62 ≈ launch + 0.86 s real): where the ball hand is, root-relative — CATCH_HAND_OFFSET's own measurement
    const cb = fl.reduce((best, r) => Math.abs(r.t - launchPage - 860) < Math.abs(best.t - launchPage - 860) ? r : best, fl[0]);
    if (cb) lines.push(`      catch beat (+${(cb.t - launchPage).toFixed(0)} ms): hand − root (${(cb.hx - cb.x).toFixed(2)}, ${(cb.hy - cb.y).toFixed(2)}, ${(cb.hz - cb.z).toFixed(2)}) · ball − hand (${(cb.bx - cb.hx).toFixed(2)}, ${(cb.by - cb.hy).toFixed(2)}, ${(cb.bz - cb.hz).toFixed(2)}) · root y ${cb.y.toFixed(2)}`);
    say(hs < 0.35, `hand continuity in the flight: max ${hs.toFixed(2)} m/frame at +${hAt.toFixed(0)} ms (rim cut ${cut ? '+' + (cut.t - launchPage).toFixed(0) + ' ms ' + cut.msg.slice(11) : 'none'})${hRow && hPrev ? ` — hand ${hPrev.hy.toFixed(2)} → ${hRow.hy.toFixed(2)}, fore ${hPrev.fy.toFixed(2)} → ${hRow.fy.toFixed(2)}, shoulder ${hPrev.sy.toFixed(2)} → ${hRow.sy.toFixed(2)}, clips ${hRow.clips.join(',')}` : ''}`); }
  const runs = bannerRuns(R.filter((r) => r.t >= tRun)).filter((b) => b.ms > 0);
  lines.push(`      banners: ${runs.map((b) => `${b.text ? `"${b.text}"` : '∅'} ${Math.round(b.ms)}ms`).join(' → ')}`);
  const made = has(/DUNK-WIN\] contact/);
  // runway / air tricks
  if (sc.expectRunway) {
    const id = sc.expectRunway, clip = { doubleup: 'dunk_double_up', kickup: 'dunk_kick_up', cartwheel: 'dunk_cartwheel', selflob: 'dunk_self_lob' }[id];
    const started = ms.find((m) => new RegExp(`runway ${id}$`).test(m.msg)), frames = R.filter((r) => r.clips.includes(clip!)).length;
    say(!!started && frames > 6, `runway ${id}: ${started ? 'fired' : 'NOT fired'}, ${frames} frames on ${clip}`);
    const label = { doubleup: 'DOUBLE-UP', kickup: 'KICK-UP', cartwheel: 'CARTWHEEL', selflob: 'SELF-LOB' }[id]!;
    say(runs.some((b) => b.text === label || b.text.startsWith(label + ' ')), `banner names the runway trick (${label})`);
    if (id !== 'doubleup') { const caught = ms.find((m) => /\[LOB\] CAUGHT/.test(m.msg)), lost = ms.find((m) => /\[LOB\] LOST/.test(m.msg)); say(!!caught, `catch: ${(caught ?? lost)?.msg.slice(6) ?? 'no catch, no loss'}`); }
    say(made ? runs.some((b) => b.text.includes(label) && /DUNK!/.test(b.text)) : runs.some((b) => b.text.includes(label) && /MISSED/.test(b.text)), `${made ? 'the make' : 'the miss'} is judged under the name: ${runs.filter((b) => b.text.includes(label)).map((b) => `"${b.text}"`).join(', ') || 'no named verdict'}`);
  }
  if (sc.expectTrick) {
    const id = sc.expectTrick, clip = { scorpion: 'dunk_scorpion', lostfound: 'dunk_lost_found', hideseek: 'dunk_hide_seek' }[id]!, label = { scorpion: 'SCORPION', lostfound: 'LOST & FOUND', hideseek: 'HIDE & SEEK' }[id]!;
    const fired = ms.find((m) => new RegExp(`air ${id}`).test(m.msg)), frames = R.filter((r) => r.clips.includes(clip)).length;
    say(!!fired && frames > 6, `air ${id}: ${fired ? 'fired ' + fired.msg.slice(fired.msg.indexOf('@')) : 'NOT fired'}, ${frames} frames on ${clip}`);
    say(runs.some((b) => b.text === label + '!' || b.text.startsWith(label)), `banner names the air trick (${label})`);
    say(made ? runs.some((b) => b.text.includes(label) && /DUNK!/.test(b.text)) : runs.some((b) => b.text.includes(label) && /MISSED/.test(b.text)), `${made ? 'the make' : 'the miss'} is judged under the name: ${runs.filter((b) => b.text.includes(label)).map((b) => `"${b.text}"`).join(', ') || 'no named verdict'}`);
    if (id === 'lostfound') { const ho = ms.find((m) => /HANDS\] handoff/.test(m.msg)); say(!!ho, `hand-off frame: ${ho?.msg.slice(8) ?? 'no mark'}`); }
  }
  if (sc.expectRefusal) {
    const press = sc.runway![0]; const pressT = tRun + press.at; const after = runs.filter((b) => b.from >= pressT - 50 && b.from <= pressT + 700 && b.text);
    say(!has(/DUNK-TRICK\] runway/) || sc.prop === 'selflob', `the press did not start a second beat (${ms.filter((m) => /DUNK-TRICK\] runway \w+$/.test(m.msg)).map((m) => m.msg.slice(19)).join(', ') || 'none'})`);
    say(after.length > 0, `a refused press says why within 0.7 s: ${after.map((b) => `"${b.text}"`).join(', ') || 'SILENT'}`);
  }
  // the alley-oop
  if (sc.prop === 'alleyoop') {
    const pre = R.filter((r) => r.t >= tRun && r.t < launchPage);
    const owners = [...new Set(pre.map((r) => r.owner))];
    say(pre.length > 0 && pre.every((r) => r.owner.startsWith('other')), `the passer holds the ball through the run-up (owners: ${owners.join(', ') || 'none'})`);
    const around = R.filter((r) => r.t >= launchPage - 120 && r.t <= launchPage + 120);
    let maxStep = 0; for (let i = 1; i < around.length; i++) maxStep = Math.max(maxStep, Math.hypot(around[i].bx - around[i - 1].bx, around[i].by - around[i - 1].by, around[i].bz - around[i - 1].bz));
    say(maxStep < 0.35, `no teleport at the launch: max ball step ${maxStep.toFixed(2)} m/frame across the takeoff`);
    const thrown = ms.find((m) => /\[LOB\] ALLEY-OOP from/.test(m.msg)), caught = ms.find((m) => /\[LOB\] CAUGHT/.test(m.msg)), lost = ms.find((m) => /\[LOB\] LOST/.test(m.msg));
    say(!!thrown, `toss: ${thrown?.msg.slice(6) ?? 'none'}`);
    say(!!caught, `catch: ${(caught ?? lost)?.msg.slice(6) ?? 'no catch, no loss'}`);
    if (thrown) {
      const live = R.filter((r) => r.t >= thrown.t - 40 && r.t <= (caught?.t ?? tZ) + 200);
      let maxSpd = 0, maxStepL = 0, atT = 0; for (let i = 1; i < live.length; i++) { const st = Math.hypot(live[i].bx - live[i - 1].bx, live[i].by - live[i - 1].by, live[i].bz - live[i - 1].bz); if (st > maxStepL) { maxStepL = st; atT = live[i].t; } maxSpd = Math.max(maxSpd, st / Math.max(0.008, live[i].dt / 1000)); }
      say(maxStepL < 0.35, `hand-off continuity toss → catch → palm: max ${maxStepL.toFixed(2)} m/frame (${maxSpd.toFixed(1)} m/s) at ${caught ? `${(atT - caught.t).toFixed(0)} ms from the catch` : 'no catch'} over ${live.length} frames`);
      const near = live.reduce((m, r) => Math.min(m, Math.hypot(r.bx - r.hx, r.by - r.hy, r.bz - r.hz)), 9);
      lines.push(`      closest ball↔hand ${near.toFixed(2)} m · ball owner after the catch: ${[...new Set(live.filter((r) => caught && r.t > caught.t + 100).map((r) => r.owner))].join(', ')}`);
      if (VERBOSE) for (const r of live.filter((r) => Math.abs(r.t - atT) <= 120)) lines.push(`      ${(r.t - atT).toFixed(0).padStart(5)} ms ball(${r.bx.toFixed(2)},${r.by.toFixed(2)},${r.bz.toFixed(2)}) hand(${r.hx.toFixed(2)},${r.hy.toFixed(2)},${r.hz.toFixed(2)}) fore(${r.fx.toFixed(2)},${r.fy.toFixed(2)},${r.fz.toFixed(2)}) shoulder(${r.sx.toFixed(2)},${r.sy.toFixed(2)},${r.sz.toFixed(2)}) cam(${r.cx.toFixed(1)},${r.cy.toFixed(1)},${r.cz.toFixed(1)}) root(${r.x.toFixed(2)},${r.y.toFixed(2)},${r.z.toFixed(2)}) ${r.parent || '-'} ${r.clips.join(',')}`);
    }
  }
  // the miss banner
  if (sc.miss) {
    const missMark = ms.find((m) => /miss clank|\[LOB\] LOST|CLIPPED/.test(m.msg));
    say(!!missMark, `the miss: ${missMark?.msg ?? 'no miss mark'} (${sc.miss})`);
    if (missMark) {
      const span = R.filter((r) => r.t >= missMark.t && r.t <= tZ);
      const endIdx = span.findIndex((r, i) => i > 10 && r.banner === '' && span[i - 1].banner !== '' && (/JUDGES/.test(span[i - 1].banner) || /HOLD to run|Pick your PROP|FINAL ROUND/.test(r.hint)));
      const beat = endIdx > 0 ? span.slice(0, endIdx) : span;
      const beatRuns = bannerRuns(beat);
      const blankMs = beatRuns.filter((b) => !b.text).reduce((s, b) => s + b.ms, 0), total = beat.reduce((s, r) => s + r.dt, 0);
      say(beatRuns.some((b) => /MISSED/.test(b.text)), `a MISSED banner: ${beatRuns.filter((b) => b.text).map((b) => `"${b.text}" ${Math.round(b.ms)}ms`).join(' → ') || 'none'}`);
      say(blankMs <= Math.max(60, total * 0.04), `no blank: ${Math.round(blankMs)} ms of empty banner in the ${Math.round(total)} ms miss beat`);
      say(!beatRuns.some((b) => MAKE_WORDS.test(b.text)), `no make banner on a miss`);
      const stacked = beat.filter((r) => /MISSED/.test(r.banner) && /SLAM!|CATCH IT|CONFER|CARD/.test(r.hint)).length;
      say(stacked === 0, `no stacked hint under MISSED (${stacked} frames; hints seen: ${[...new Set(beat.map((r) => r.hint))].map((h) => `"${h.slice(0, 40)}"`).join(', ')})`);
      const scoreAt = beat[beat.length - 1]?.score ?? 0, score0 = span[0]?.score ?? 0;
      lines.push(`      score ${score0} → ${scoreAt} across the miss beat`);
    }
  } else lines.push(`      ${made ? 'MAKE (contact)' : 'no contact — ' + (ms.find((m) => /miss clank|CAUGHT THE|LOST/.test(m.msg))?.msg ?? 'miss')}`);
  const warns = ms.filter((m) => /^WARN/.test(m.msg)); if (warns.length) lines.push(`      warns: ${warns.map((w) => w.msg).join(' | ')}`);
  if (VERBOSE) lines.push('      marks: ' + ms.map((m) => `${((m.t - launchPage) / 1000).toFixed(2)}s ${m.msg}`).join(' | '));
  return lines;
}

const results: { name: string; ok: boolean }[] = [];
// a contest is 2 rounds × 2 dunks: four attempts per page (the prop ring costs none), then a fresh boot
const wanted = SCENARIOS.filter((sc) => !SCEN || sc.name.toLowerCase().includes(SCEN.toLowerCase()));
const groups: Scenario[][] = []; let cur: Scenario[] = [], used = 0;
for (const sc of wanted) { const cost = sc.name.startsWith('prop ring') ? 0 : 1; if (used + cost > 4) { groups.push(cur); cur = []; used = 0; } cur.push(sc); used += cost; }
if (cur.length) groups.push(cur);
let allErrors: string[] = [], allFrames: string[] = [];
for (const g of groups) {
  const { p, close, errors, frames } = await boot();
  curProp = 'none'; curStyle = 'power';
  for (const sc of g) {
    console.log(`\n── [${SRC}] ${sc.name}`);
    const lines = await attempt(p, sc);
    for (const l of lines) console.log('  ' + l);
    results.push({ name: sc.name, ok: !lines.some((l) => l.startsWith('FAIL')) });
  }
  allErrors = allErrors.concat(errors); allFrames = allFrames.concat(frames);
  await close();
}
console.log(`\nerrors ${allErrors.length}${allErrors.length ? ': ' + allErrors.slice(0, 5).join(' | ') : ''}`);
console.log(`FEL-FRAME / MISSING CLIP ${allFrames.length}${allFrames.length ? ': ' + allFrames.slice(0, 4).join(' | ') : ''}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} scenarios PASS [${SRC}]`);
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
