// DUNK-BODY-MID probe (2026-09-09): the SLAM input contract and the body it buys, on /dev/mode/dunk, graded per rendered
// frame off the live rig. The tip's four Musts, measured — not banners read back.
//
//   M1 CUE FIRES     — a named trick thrown inside its own cue window FIRES, and no refusal banner appears in the flight
//   M1b COMBO        — the owner's dunk: 360 → WINDMILL off a full-speed run, BOTH fired, over the car
//   M2 SLAM EATEN    — the eye's own recipe at 99109f7: the direction is STILL HELD when the slam press lands. The press
//                      must be the SLAM (a make), never a second trick, and the card must not read "<TRICK> — MISSED"
//   M2b EARLY SLAM   — ONE A press inside the buffer, before the window opens: it still makes
//   M3 HANG→CONTACT  — press → CONTACT (ms), one hit-stop, one slam thud, the camera moves on the contact frame, the ball
//                      AT the iron; and no HOVER (no run of airborne frames with the root frozen and no clip on the body)
//   M4 TORSO         — chest on the rim through the trick body and AT CONTACT, and an end pose at feet-down that is not a T
//
// Pre-boot fake DualShock (the pad is the surface the eye plays on).
//   PORT=3056 npx tsx scripts/probes/_dunk-body-mid-probe.mts        (SCEN= filters · OUT_DIR= · VERBOSE=1)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3056', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-body-mid';
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE, SHOTS = !!process.env.SHOTS;
mkdirSync(OUT, { recursive: true });

type Row = { t: number; y: number; z: number; clipTime: number; chest: number; hips: number; spread: number; lhy: number; rhy: number; shy: number;
  clips: string[]; ats: number; camDist: number; ballRim: number; phase: string; ppw: string; banner: string; hint: string };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';
type Gate = 'M1' | 'M1b' | 'M2' | 'M2b' | 'M3' | 'M4';
interface Scenario {
  name: string; prop: 'none' | 'car'; rt?: number; hold?: number;
  air?: { at: number; dir?: Dir; btn: Btn; hold?: boolean }[];   // hold: leave the direction DOWN (the eye's failure)
  /** how the SLAM is thrown: 'mash' the probe default, 'once' one press at `slamAt`, 'none' */
  slam?: 'mash' | 'once' | 'none'; slamAt?: number;
  expectMake: boolean; tricks?: number; gates: Gate[];
}
const S: Scenario[] = [
  { name: 'WINDMILL at the rise, direction released, mashed slam (the control)', prop: 'none',
    air: [{ at: 0.34, dir: 'up', btn: 'A' }], tricks: 1, expectMake: true, gates: ['M1', 'M3', 'M4'] },
  { name: "THE EYE'S FLIGHT — windmill at the hang, UP STILL HELD, ONE slam press at clip 0.93", prop: 'none',
    air: [{ at: 0.50, dir: 'up', btn: 'A', hold: true }], slam: 'once', slamAt: 0.93, tricks: 1, expectMake: true, gates: ['M1', 'M2', 'M3', 'M4'] },
  { name: 'ONE early SLAM at clip 0.95, no trick — the buffer alone', prop: 'none',
    slam: 'once', slamAt: 0.95, expectMake: true, gates: ['M2b', 'M3'] },
  { name: "THE OWNER'S DUNK — 360 → WINDMILL over the CAR", prop: 'car',
    air: [{ at: 0.12, dir: 'right', btn: 'B' }, { at: 0.45, dir: 'up', btn: 'A' }], tricks: 2, expectMake: true, gates: ['M1', 'M1b', 'M3', 'M4'] },
  { name: 'WINDMILL deep in its own cue window (up+A at clip 0.95), then the slam', prop: 'none',
    air: [{ at: 0.95, dir: 'up', btn: 'A' }], tricks: 1, expectMake: true, gates: ['M1', 'M3', 'M4'] },
  { name: 'SCORPION at the hang, its direction HELD through the slam', prop: 'none',
    air: [{ at: 0.40, dir: 'right', btn: 'Y', hold: true }], slam: 'once', slamAt: 1.0, tricks: 1, expectMake: true, gates: ['M1', 'M2', 'M4'] },
  { name: 'TOMAHAWK in its window, the slam under the same hold', prop: 'none',
    air: [{ at: 0.80, dir: 'up', btn: 'Y', hold: true }], slam: 'once', slamAt: 1.0, tricks: 1, expectMake: true, gates: ['M1', 'M2', 'M3'] },
  { name: 'NO SLAM at all — the card names the slam, not the trick', prop: 'none',
    air: [{ at: 0.34, dir: 'up', btn: 'A' }], slam: 'none', tricks: 1, expectMake: false, gates: ['M1'] },
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
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector('canvas', { timeout: 120000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const S = window.__bm = { rows: [], marks: [], sign: 0 };
    // A 1.5 s flight cannot be photographed from a polling loop — a screenshot round-trip is longer than the beat. The
    // probe parks the SCENE CLOCK at a named clip second instead (animationTimeScale, which the mode's own clipTime is
    // already gated on for the hang slow-mo), shoots the held frame, and hands the clock back.
    window.__freezeAt = null; window.__frozen = false;
    // the CONTACT / jam beat runs on raw dt, not the animation clock, so parking animationTimeScale cannot hold it —
    // that one stops the render loop outright and hands the engine its own loops back afterwards
    const eng = scene.getEngine();
    window.__freezePhase = null; window.__loops = null;
    window.__thaw = () => {
      scene.animationTimeScale = 1; window.__freezeAt = null; window.__frozen = false; window.__freezePhase = null;
      if (window.__loops) { for (const fn of window.__loops) eng.runRenderLoop(fn); window.__loops = null; }
    };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|DUNK-PP|DUNK-PROP|DUNK-TRICK|DUNK-CUE|DUNK-SLAM|DUNK-CAM|HANDS|JUICE-SOFT|JUICE-SFX)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 200) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|HANDS/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 200) }); ow(...a); };
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    const RIM = { x: 0, y: 3.05, z: -10.28 };
    let heroSeen = null, LA = null, RA = null, LU = null, RU = null, LH = null, RH = null;
    const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
    // the biomech probe's convention, calibrated once against a hero who starts facing the rim: forward = sign · (shoulders × up)
    const bearing = (a, b) => { const sx = b.x - a.x, sz = b.z - a.z; const f = { x: -sz * S.sign, z: sx * S.sign }; return Math.atan2(f.x, f.z); };
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); const f = (re) => d.find((n) => re.test(n.name)) ?? null; LA = f(/^LeftArm/); RA = f(/^RightArm/); LU = f(/^LeftUpLeg/); RU = f(/^RightUpLeg/); LH = f(/^LeftHand/); RH = f(/^RightHand/); }
      if (!LA || !RA) return;
      const fresh = (n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
      h.computeWorldMatrix(true); for (const n of [LA, RA, LU, RU, LH, RH]) if (n) fresh(n);
      const la = LA.getAbsolutePosition(), ra = RA.getAbsolutePosition(), lu = LU ? LU.getAbsolutePosition() : la, ru = RU ? RU.getAbsolutePosition() : ra, lh = LH ? LH.getAbsolutePosition() : la, rh = RH ? RH.getAbsolutePosition() : ra;
      if (!S.sign) { const sx = ra.x - la.x; S.sign = sx < 0 ? 1 : -1; }
      const rimB = Math.atan2(RIM.x - h.position.x, RIM.z - h.position.z);
      const ball = scene.getMeshByName('ball'); let ballRim = -1;
      if (ball) { ball.computeWorldMatrix(true); const bp = ball.getAbsolutePosition(); ballRim = Math.hypot(bp.x - RIM.x, bp.y - RIM.y, bp.z - RIM.z); }
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const pp = dev.dunkPosture ? dev.dunkPosture.get() : { window: '?', phase: '?', clipTime: 0 };
      const cam = scene.activeCamera;
      S.rows.push({ t: performance.now(), y: h.position.y, z: h.position.z, clipTime: pp.clipTime ?? 0,
        chest: wrap(bearing(la, ra) - rimB) * 180 / Math.PI, hips: wrap(bearing(lu, ru) - rimB) * 180 / Math.PI,
        spread: Math.hypot(lh.x - rh.x, lh.y - rh.y, lh.z - rh.z), lhy: lh.y - h.position.y, rhy: rh.y - h.position.y, shy: (la.y + ra.y) / 2 - h.position.y,
        clips, ats: scene.animationTimeScale ?? 1, ballRim,
        // the CONTACT's camera beat: a push-in shortens the lens-to-body distance for a breath (a cut moves it metres)
        camDist: cam ? Math.hypot(cam.position.x - h.position.x, cam.position.y - h.position.y - 1.2, cam.position.z - h.position.z) : 0,
        phase: pp.phase, ppw: pp.window, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? '') });
      if (S.rows.length > 40000) S.rows.splice(0, 10000);
      if (window.__freezeAt != null && !window.__frozen && (pp.clipTime ?? 0) >= window.__freezeAt) { window.__frozen = true; scene.animationTimeScale = 0.0005; }
      const hit = window.__freezePhase === 'contact' ? !!pp.jamContact : (window.__freezePhase && pp.phase === window.__freezePhase);
      if (window.__freezePhase && !window.__frozen && hit) {
        window.__frozen = true; window.__loops = [...(eng._activeRenderLoops ?? [])]; eng.stopRenderLoop();
      }
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors };
}

const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
const stickUp = (p: Page, on: boolean) => padSet(p, `p.axes[1] = ${on ? -1 : 0}`);
const runHold = (p: Page, on: boolean, v = 1) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`);
const btn = (p: Page, b: Btn, on: boolean) => padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`);
async function tapBtn(p: Page, b: Btn, ms = 80): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
const dpad = (p: Page, d: Dir, on: boolean) => padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`);
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__bm.marks') as Promise<Mark[]>;
const allRows = async (p: Page): Promise<Row[]> => p.evaluate('window.__bm.rows') as Promise<Row[]>;
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;
const hudProp = async (p: Page): Promise<string> => p.evaluate(`(() => { try { return JSON.parse(document.querySelector('pre').textContent).prop || ''; } catch { return ''; } })()`) as Promise<string>;
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2);

async function waitApproach(p: Page, ms = 30000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await text(p);
    if (/HOLD to run|Pick your PROP|FINAL ROUND/.test(t) && !/SLAM!|CONFER|CARD|RIVAL ROUND/.test(t)) return true;
    await p.waitForTimeout(120);
  }
  return false;
}
let curProp: 'none' | 'car' = 'none';
async function setProp(p: Page, want: 'none' | 'car', lines: string[]): Promise<void> {
  if (want === 'none') { await dpad(p, 'up', true); await p.waitForTimeout(90); await dpad(p, 'up', false); }
  else if (curProp !== 'car') { await dpad(p, 'down', true); await p.waitForTimeout(90); await dpad(p, 'down', false); }
  curProp = want;
  await p.waitForTimeout(want === 'none' ? 250 : 1300);
  const shown = await hudProp(p);
  if (shown !== (want === 'none' ? 'NO PROP' : 'CAR')) lines.push(`FAIL  prop ${want} → HUD "${shown}"`);
}
/** The banner text over a span, as the runs the eye would have read. */
function bannerRuns(rows: Row[]): { text: string; ms: number }[] {
  const out: { text: string; ms: number }[] = [];
  for (const r of rows) { const last = out[out.length - 1]; if (last && last.text === r.banner) last.ms = r.t - (last as unknown as { t0: number }).t0; else out.push(Object.assign({ text: r.banner, ms: 0 }, { t0: r.t })); }
  return out;
}

/** The flight's own clock (clip seconds) off the live mode — the surface every beat in this file is keyed to. The hang
 *  slow-mo runs the clip at 0.4x for 400 ms, so a beat driven on wall-clock ms lands somewhere different every run. */
const clipNow = async (p: Page): Promise<number> => p.evaluate(`(() => { const r = window.__bm.rows; return r.length ? r[r.length - 1].clipTime : 0; })()`) as Promise<number>;

/** A frame for the EYE: the harness overlays hidden, and — when `at` is given — the scene clock parked on that clip
 *  second first, so the picture is the beat it names and not wherever a 400 ms screenshot round-trip landed. */
async function eyeShot(p: Page, path: string, at?: number | string): Promise<void> {
  if (at != null) {
    await p.evaluate(typeof at === 'string' ? `window.__freezePhase = ${JSON.stringify(at)}` : `window.__freezeAt = ${at}`);
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) { if (await p.evaluate('window.__frozen')) break; await p.waitForTimeout(12); }
  }
  // hide every overlay that is not the canvas or one of its ancestors — the dev harness's JSON dump, its perf panel and
  // its START button all sit on top of the picture the eye is being asked to read
  await p.evaluate(`(() => {
    const c = document.querySelector('canvas'); if (!c) return;
    window.__hid = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el === c || el.contains(c) || c.contains(el)) continue;
      const pos = getComputedStyle(el).position;
      if ((pos === 'fixed' || pos === 'absolute') && el.getBoundingClientRect().width > 0) { window.__hid.push(el); el.style.visibility = 'hidden'; }
    }
  })()`).catch(() => {});
  await p.screenshot({ path });
  await p.evaluate(`(() => { for (const el of (window.__hid ?? [])) el.style.visibility = ''; window.__hid = []; })()`).catch(() => {});
  if (at != null) await p.evaluate('window.__thaw && window.__thaw()');
}

async function attempt(p: Page, sc: Scenario, idx: number): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  const m0 = (await marks(p)).length, tA = await now(p);
  await setProp(p, sc.prop, lines);
  const slug = `${idx}-${sc.name.split(/[ (—,]/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  await stickUp(p, true);
  await p.waitForTimeout(250);
  await runHold(p, true, sc.rt ?? 1);
  const holdStart = Date.now();
  let launched = false, launchPage = 0;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  while (!launched && Date.now() - holdStart < 3200) { if (sc.hold != null && Date.now() - holdStart >= sc.hold) break; await p.waitForTimeout(30); await launchedYet(); }
  await runHold(p, false); await stickUp(p, false);
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 2000) await p.waitForTimeout(40);
  if (!launched) { lines.push('FAIL  never launched'); return lines; }

  // ── the flight is driven on CLIP seconds: every press below lands on the beat it names ──
  const air = [...(sc.air ?? [])].sort((a, b) => a.at - b.at);
  const stillHeld: Dir[] = [];
  const mode = sc.slam ?? 'mash';
  let slamPressedAt = -1, mashes = 0;
  const shot = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 2600) {
    const ct = await clipNow(p);
    if (air.length && ct >= air[0].at) {
      const a = air.shift()!;
      if (a.dir) { await dpad(p, a.dir, true); await p.waitForTimeout(18); }
      await tapBtn(p, a.btn, 60);
      if (a.dir) { if (a.hold) stillHeld.push(a.dir); else await dpad(p, a.dir, false); }
      lines.push(`      air ${a.dir ?? ''}${a.hold ? ' (HELD)' : ''}+${a.btn} at clip ${f2(ct)}`);
      continue;
    }
    // the EYE frames, parked on the flight's own clock (SHOTS=1 only — the freeze perturbs the run it photographs)
    if (SHOTS) for (const [key, at] of [['trick', (sc.air?.[0]?.at ?? 0.35) + 0.14], ['hang', 0.85], ['carry', 1.12]] as [string, number][]) {
      if (!shot.has(key) && ct >= at - 0.06) { shot.add(key); await eyeShot(p, `${OUT}/${slug}-${key}.png`, at); }
    }
    if (mode === 'once' && slamPressedAt < 0 && ct >= (sc.slamAt ?? 0.95)) { slamPressedAt = ct; await tapBtn(p, 'A', 60); lines.push(`      SLAM (one press) at clip ${f2(ct)}`); }
    else if (mode === 'mash' && ct >= (sc.slamAt ?? 0.95) && mashes < 12) { if (slamPressedAt < 0) slamPressedAt = ct; mashes++; await tapBtn(p, 'A', 50); }
    const st = await p.evaluate(`(() => { const r = window.__bm.rows; return r.length ? r[r.length - 1].phase : ''; })()`);
    // the JAM is a resolve-phase pose, not a clip second — the buffered slam resolves the flight at the window's edge
    // the CONTACT frame itself: the ball on the iron, the jam pose. The freeze is ARMED here and never waited on — the
    // slam press has to keep flowing or there is no contact to photograph; the shot is taken once the engine has parked.
    if (SHOTS && !shot.has('armContact') && ct >= 0.9) { shot.add('armContact'); await p.evaluate(`window.__freezePhase = 'contact'`); }
    if (SHOTS && shot.has('armContact') && !shot.has('contact') && await p.evaluate('window.__frozen')) { shot.add('contact'); await eyeShot(p, `${OUT}/${slug}-contact.png`); await p.evaluate('window.__thaw && window.__thaw()'); }
    if (st !== 'cinematic' && st !== 'resolve' && st !== 'charge' && st !== 'approach' && !air.length) break;
    if (st === 'resolve' && (!SHOTS || shot.has('contact') || !shot.has('armContact')) && !air.length) break;
    await p.waitForTimeout(14);
  }
  for (const d of stillHeld) await dpad(p, d, false);
  await p.waitForTimeout(250);
  await eyeShot(p, `${OUT}/${slug}-end.png`);
  const tEnd0 = Date.now();
  while (Date.now() - tEnd0 < 14000) { const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND|RIVAL ROUND/.test(t) && !/SLAM!|CONFER|CARD/.test(t) && Date.now() - tEnd0 > 1500) break; await p.waitForTimeout(140); }
  const tZ = await now(p);

  const ms = (await marks(p)).slice(m0);
  const R = (await allRows(p)).filter((r) => r.t >= tA && r.t <= tZ);
  const mark = (re: RegExp) => ms.find((m) => re.test(m.msg));
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg));
  const tricks = ms.filter((m) => /DUNK-TRICK\] air/.test(m.msg));
  const refusals = ms.filter((m) => /DUNK-CUE\] refused|DUNK-CUE\] late/.test(m.msg));
  const contactM = mark(/DUNK-WIN\] contact/), ironM = mark(/HANDS\] iron contact/), landM = mark(/HANDS\] land /);
  const made = !!contactM;
  const runs = bannerRuns(R.filter((r) => r.t >= launchPage)).filter((b) => b.ms > 0);
  const bannerText = runs.map((b) => b.text).join(' | ');
  const flight = R.filter((r) => r.t >= launchPage && r.t <= (contactM?.t ?? launchPage + 1900));
  const missLine = /[^|]*— MISSED[^|·]*/.exec(bannerText)?.[0]?.trim() ?? '';
  lines.push(`      ${made ? 'MAKE' : 'MISS'} · tricks ${tricks.map((m) => /air (\w+) @([\d.]+)/.exec(m.msg)?.slice(1).join('@') ?? '?').join(' + ') || 'none'} · refusals ${refusals.length}`);

  const want = (g: Gate) => sc.gates.includes(g);

  // ── M1: every cue thrown inside its window fired, and nothing was refused ──
  if (want('M1')) {
    say(tricks.length === (sc.tricks ?? 1) && refusals.length === 0,
      `M1 cues: ${tricks.length}/${sc.tricks ?? 1} fired, ${refusals.length} refused${refusals.length ? ` (${refusals.map((m) => m.msg.slice(11, 62)).join(' | ')})` : ''}`);
    say(!/NOT ENOUGH AIR|TOO LATE FOR|TWO TRICKS/.test(bannerText), `M1 no refusal banner in the flight: ${/NOT ENOUGH AIR|TOO LATE FOR|TWO TRICKS/.exec(bannerText)?.[0] ?? 'clean'}`);
  }
  if (want('M1b')) say(tricks.length === 2 && /COMBO/.test(bannerText), `M1b combo: ${tricks.length} tricks, ${/COMBO[^|]*/.exec(bannerText)?.[0]?.trim() ?? 'NO COMBO LINE'}`);
  // ── M2: a direction still held did not eat the SLAM ──
  if (want('M2')) {
    const ate = refusals.length > 0;
    say(made && !ate, `M2 the slam under a HELD direction: ${made ? 'MAKE' : 'MISS'} · pressed at clip ${f2(slamPressedAt)} · eaten as a trick: ${ate ? 'YES — ' + refusals[0].msg.slice(11, 62) : 'no'}`);
    say(has(/DUNK-SLAM\] /), `M2 the press reached the slam: ${mark(/DUNK-SLAM\] /)?.msg.slice(12, 90) ?? 'NEVER — it went somewhere else'}`);
    // the "spent" rule only has anything to say when the HELD direction maps to an A trick (up = windmill, left = hide & seek);
    // a held RIGHT + A is not a trick at all, so the press was never the recognizer's to eat
    const aDir = (sc.air ?? []).some((a) => a.hold && (a.dir === 'up' || a.dir === 'left'));
    if (aDir) say(has(/direction is spent/), `M2 the stale direction was read as the slam: ${has(/direction is spent/) ? 'yes' : 'the recognizer still owned it'}`);
    else lines.push(`      (the held ${(sc.air ?? []).find((a) => a.hold)?.dir ?? '—'} has no A trick — the press was never the recognizer's to take)`);
  }
  if (want('M2b')) say(made, `M2b one press at clip ${f2(slamPressedAt)} → ${made ? 'MAKE' : 'MISS'}${mark(/buffered press/) ? ` · ${mark(/buffered press/)!.msg.slice(12, 95)}` : ''}`);
  // the miss card, when there is one, names WHAT missed — never the trick that landed
  if (missLine) say(/OFF THE IRON|NO SLAM|CAUGHT THE|LOST THE|OVER THE GLASS/.test(missLine), `card names the failure, not the trick: "${missLine}"`);
  // ── M3: the hang → CONTACT punch, and no hover ──
  if (want('M3')) {
    if (!made) say(false, `M3 no CONTACT — the flight missed${missLine ? ` ("${missLine}")` : ''}`);
    else {
      const ironMs = /(\d+) ms into the jam/.exec(ironM?.msg ?? '')?.[1];
      const dRim = /ball ([\d.]+) m from the rim/.exec(ironM?.msg ?? '')?.[1];
      say(!!ironMs && Number(ironMs) <= 280 && !!dRim && Number(dRim) <= 0.42, `M3 CONTACT ${ironMs ?? '?'} ms after the press, ball ${dRim ?? '?'} m from the rim centre`);
      const hs = R.filter((r) => Math.abs(r.t - contactM!.t) < 260 && r.ats <= 0.05).length;
      const thuds = ms.filter((m) => /JUICE-SFX\] impact slam/.test(m.msg)).length;
      say(hs > 0 && thuds === 1, `M3 punch: ${hs} hit-stop frame(s) across the contact, ${thuds} slam thud`);
      // the camera BEAT: a push-in shortens the lens-to-body distance for a breath (a cut is metres and is excluded)
      const pre = R.filter((r) => r.t > contactM!.t - 200 && r.t <= contactM!.t), post = R.filter((r) => r.t > contactM!.t && r.t < contactM!.t + 240);
      const base = pre.length ? pre[pre.length - 1].camDist : 0;
      const dip = post.length ? base - Math.min(...post.map((r) => r.camDist)) : 0;
      say(dip > 0.03 && dip < 4, `M3 the camera pushes in on the iron: ${f2(dip)} m of dip off ${f2(base)} m`);
      // HOVER: airborne, the root frozen (< 2 mm a frame) and NOTHING driving the body
      const airRows = R.filter((r) => r.t > launchPage && r.t < (landM?.t ?? tZ) && r.y > 0.06);
      let hover = 0, runHover = 0;
      for (let i = 1; i < airRows.length; i++) { const frozen = Math.abs(airRows[i].y - airRows[i - 1].y) < 0.002 && airRows[i].clips.length === 0; runHover = frozen ? runHover + 1 : 0; hover = Math.max(hover, runHover); }
      say(hover <= 3, `M3 no hover: longest run of frozen clip-less airborne frames ${hover} of ${airRows.length}`);
    }
  }
  // ── M4: the torso through the trick, at the contact, and the end pose ──
  if (want('M4')) {
    const trickT = tricks[0] ? tricks[0].t : launchPage;
    const body = flight.filter((r) => r.t >= trickT);
    const spinScen = tricks.some((m) => /spin360/.test(m.msg));
    const worst = body.reduce((w, r) => Math.abs(r.chest) > Math.abs(w) ? r.chest : w, 0);
    let maxStep = 0; for (let i = 1; i < body.length; i++) maxStep = Math.max(maxStep, Math.abs(((body[i].chest - body[i - 1].chest + 540) % 360) - 180));
    say((spinScen ? true : Math.abs(worst) <= 70) && maxStep < 60, `M4 chest through the trick body: worst ${f0(worst)}°${spinScen ? ' (a 360 turns through)' : ''}, max step ${f0(maxStep)}°/frame over ${body.length} frames`);
    const at = contactM ? R.reduce((b, r) => Math.abs(r.t - contactM.t) < Math.abs(b.t - contactM.t) ? r : b, R[0]) : null;
    if (at) say(Math.abs(at.chest) <= 45, `M4 chest ON THE RIM at CONTACT: ${f0(at.chest)}° (hips ${f0(at.hips)}°, window ${at.ppw})`);
    const endWin = R.filter((r) => landM && r.t >= landM.t - 150 && r.t <= landM.t);
    const tFrames = endWin.filter((r) => r.spread >= 0.95 && Math.abs(r.lhy - r.shy) < 0.22 && Math.abs(r.rhy - r.shy) < 0.22).length;
    say(!!landM && tFrames === 0, `M4 end pose: ${landM ? landM.msg.slice(8, 40) : 'NO LAND'} · ${tFrames} T frame(s) in the last 150 ms`);
  }
  lines.push(`      banners: ${runs.map((b) => `${b.text ? `"${b.text}"` : '∅'} ${Math.round(b.ms)}ms`).join(' → ').slice(0, 700)}`);
  lines.push(`      marks: ${ms.filter((m) => !/DUNK-WIN\] run|DUNK-PP/.test(m.msg)).map((m) => `+${f0(m.t - launchPage)} ${m.msg.replace(/^\[[A-Z-]+\] /, '')}`).join(' · ').slice(0, 900)}`);
  if (VERBOSE) { const step = Math.max(1, Math.floor(flight.length / 30)); for (let i = 0; i < flight.length; i += step) { const r = flight[i]; lines.push(`        clip ${f2(r.clipTime)} y ${f2(r.y)} chest ${f0(r.chest)} ats ${f2(r.ats)} cam ${f2(r.camDist)} ${r.ppw} ${r.clips.join(',')}`); } }
  return lines;
}

(async () => {
  const picked = S.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const groups: Scenario[][] = []; for (let i = 0; i < picked.length; i += 4) groups.push(picked.slice(i, i + 4));   // a contest is FOUR attempts; each group gets a fresh boot
  const out: string[] = [`DUNK-BODY-MID probe · pad · port ${PORT} · ${new Date().toISOString()}`];
  let allErrors: string[] = [];
  for (const [gi, group] of groups.entries()) {
    const { p, close, errors } = await boot();
    curProp = 'none';
    for (const [k, sc] of group.entries()) {
      const idx = gi * 4 + k;
      out.push('', `## ${idx + 1}. ${sc.name}`);
      try { out.push(...await attempt(p, sc, idx + 1)); } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 220)}`); }
      console.log(out.slice(-16).join('\n'));
    }
    allErrors = allErrors.concat(errors);
    await close();
  }
  out.push('', `console errors: ${allErrors.length}${allErrors.length ? '\n  ' + [...new Set(allErrors)].slice(0, 8).join('\n  ') : ''}`);
  const pass = out.filter((l) => l.startsWith('PASS')).length, fail = out.filter((l) => l.startsWith('FAIL')).length;
  out.push('', `TOTAL PASS ${pass} · FAIL ${fail}`);
  writeFileSync(`${OUT}/report.txt`, out.join('\n'));
  console.log(`\nconsole errors: ${allErrors.length}\n\nTOTAL PASS ${pass} · FAIL ${fail}`);
})();
