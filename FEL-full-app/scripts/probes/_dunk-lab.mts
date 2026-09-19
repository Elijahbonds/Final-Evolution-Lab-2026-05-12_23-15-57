// _dunk-lab — one competent dunker, N attempts, and everything the contest said about each one.
//
// THE 10-PHASE DUNK PASS (owner, 2026-09-16) needs an instrument before it needs an opinion. The scorecard capture
// plays a verb a second and tells you whether presses were answered; it cannot tell you whether the WINDMILL you asked
// for fired at the rise, what the judges paid for it, or how much of the flight it spent. This drives the runway the
// way a player who knows the game drives it — hold RUN, call one named dunk on its cue beat, slam when the window
// opens — and records, per attempt:
//
//   called / armed / fired / refused   (the mode's own [DUNK-CUE] and [DUNK-TRICK] lines)
//   the launch                          ([DUNK-LAUNCH] charge, run speed, apex)
//   the slam                            (HUD slamTiming: ON TIME / N ms EARLY · EXECUTION %)
//   the card                            (HUD judgeReveal, five judges, and the total)
//   the body                            (clips on the rig through the flight, via __FEL_QA__ / __FEL_DEV__.anim)
//
// Every phase of the pass is measured with this, before and after, so a change is either visible in these numbers or it
// is decoration.
//
//   BASE=http://127.0.0.1:3096 ATTEMPTS=8 TRICK=all npx tsx scripts/probes/_dunk-lab.mts
//   TRICK=windmill  — call the same dunk every attempt (the A/B rig for one trick's shape)
//   SLAM_OFFSET_MS=-80  — slam early on purpose (the execution curve, measured rather than argued)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 8);
const TAG = process.env.TAG ?? 'lab';
const SLAM_OFFSET_MS = Number(process.env.SLAM_OFFSET_MS ?? 0);
const RUN_MS = Number(process.env.RUN_MS ?? 1500);          // how long RUN is held before the gather line
/** GLASS=1 — DUNK PARKOUR: steer hard into the right-hand glass for the first part of the run (a rebound is expected), then back. */
const GLASS = process.env.GLASS === '1';
/** L1_AT_MS=<ms after RUN> — DUNK PARKOUR: press L1 in the air for the backboard double-launch. L1_AFTER_LAUNCH_MS=<ms> times it
 *  from the launch itself (the rise window is 0.12–0.62 s of flight), which is the reliable knob. */
const L1_AT_MS = process.env.L1_AT_MS ? Number(process.env.L1_AT_MS) : 0;
const L1_AFTER_LAUNCH_MS = process.env.L1_AFTER_LAUNCH_MS ? Number(process.env.L1_AFTER_LAUNCH_MS) : 0;
/** R1_AFTER_LAUNCH_MS=<ms> — THE SKY TIER: press R1 in the air to tap off the blimp / rocket / … over the lane (needs height: GLASS=1 and/or L1). */
const R1_AFTER_LAUNCH_MS = process.env.R1_AFTER_LAUNCH_MS ? Number(process.env.R1_AFTER_LAUNCH_MS) : 0;
/** SLAM_HOLD_MS=<ms> — hold the slam through the contact (a hang); SWING=1 pushes the stick during the hold (the RIM SWING). */
const SLAM_HOLD_MS = Number(process.env.SLAM_HOLD_MS ?? 60);
const SWING = process.env.SWING === '1';
/** 'cue' = press the instant the read lifts (answering the prompt) · 'beat' = press on the window's own tell (NOW!). */
const SLAM_WHEN = (process.env.SLAM_WHEN ?? 'beat') as 'cue' | 'beat';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/dunk`;
fs.mkdirSync(OUT, { recursive: true });

/** The air vocabulary, as a player physically throws it: hold a direction, tap a button. */
const AIR: { id: string; dir: string; btn: number }[] = [
  { id: 'windmill', dir: 'up', btn: 0 }, { id: 'tomahawk', dir: 'up', btn: 3 },
  { id: 'spin360', dir: 'right', btn: 1 }, { id: 'scorpion', dir: 'right', btn: 3 }, { id: 'cradle', dir: 'right', btn: 0 },
  { id: 'eastbay', dir: 'down', btn: 3 }, { id: 'betweenlegs', dir: 'down', btn: 1 }, { id: 'clutch', dir: 'down', btn: 0 },
  { id: 'lostfound', dir: 'left', btn: 1 }, { id: 'hideseek', dir: 'left', btn: 0 },
  // the chain pieces (2026-09-16) — X is button 2, and it reads in the air now
  { id: 'behindback', dir: 'left', btn: 3 }, { id: 'fakeback', dir: 'left', btn: 2 }, { id: 'doubleeastbay', dir: 'down', btn: 2 },
];
// TRICK=windmill · TRICK=all · TRICK=windmill+spin360 (a COMBO: both calls in one flight, the second on the hang)
const spec = process.env.TRICK ?? 'all';
const combo = spec.includes('+') ? spec.split('+').map((id) => AIR.find((t) => t.id === id.trim())!) : null;
if (combo?.some((t) => !t)) throw new Error(`no such trick in ${spec} (have ${AIR.map((t) => t.id).join(', ')})`);
const want = combo ? [combo[0]] : spec !== 'all' ? AIR.filter((t) => t.id === spec) : AIR;
if (!want.length) throw new Error(`no such trick: ${spec} (have ${AIR.map((t) => t.id).join(', ')})`);
/** The second call of a combo lands on the HANG beat — the mode arms an early press and fires it there. */
const COMBO_GAP_MS = Number(process.env.COMBO_GAP_MS ?? 340);
/**
 * A RUNWAY trick: a bare face button while RUN is held. Y self-lob · B kick-up · X back handspring · A double-up ·
 * B with UP HELD = the backflip (owner's move, 2026-09-16), the one runway trick that takes a direction.
 */
const RUNWAY: Record<string, { btn: number; dir?: string }> = {
  selflob: { btn: 3 }, kickup: { btn: 1 }, cartwheel: { btn: 2 }, doubleup: { btn: 0 }, backflip: { btn: 1, dir: 'up' },
};
const RUNWAY_TRICK = process.env.RUNWAY ?? '';
if (RUNWAY_TRICK && !(RUNWAY_TRICK in RUNWAY)) throw new Error(`no such runway trick: ${RUNWAY_TRICK} (have ${Object.keys(RUNWAY).join(', ')})`);
/** How long into the hold-run the runway trick is thrown (the double-up wants the last stretch before the line). */
const RUNWAY_AT_MS = Number(process.env.RUNWAY_AT_MS ?? 700);
/** The PROP ring: d-pad DOWN in the approach cycles the obstacle (car → barrier → crate → THE TETRIS). OBSTACLE=tetris. */
const OBSTACLE_RING = ['car', 'barrier', 'crate', 'tetris', 'ladder', 'bike', 'bikeroll', 'skate', 'skateroll', 'row3', 'row5', 'wall'];
const OBSTACLE = process.env.OBSTACLE ?? '';
/** OOP=oopcorner — the prop ring is stepped with X (alley-oop → off the glass → bounce → OFF THE BILLBOARD). */
const OOP_RING = ['alleyoop', 'oopglass', 'oopbounce', 'oopcorner']; const OOP = process.env.OOP ?? '';
/** STYLE=flashy|sig — B in the approach cycles POWER -> FLASHY -> SIGNATURE, and the style called buys air (a triple needs it). */
const STYLE_RING = ['power', 'flashy', 'sig'];
const STYLE = process.env.STYLE ?? '';
if (STYLE && !STYLE_RING.includes(STYLE)) throw new Error(`no such style: ${STYLE} (have ${STYLE_RING.join(', ')})`);
/** SHOT_AT_MS=900 — a frame of the RUNWAY itself (what the dunker is about to jump over), not just the verdict. */
const SHOT_AT_MS = Number(process.env.SHOT_AT_MS ?? 0);
/** SHOTS_MS=1400,1600,1800 — frames at these ms after RUN is held (the approach, the gather, the takeoff), named by offset. */
const SHOTS_MS = (process.env.SHOTS_MS ?? '').split(',').map((x) => Number(x.trim())).filter((x) => x > 0);
/** TRACE=1 — the hero's root z / y and the top clip EVERY FRAME through the attempt, printed 1.2 s around the launch (the run's
 *  speed into the line, the plant, the first air frames: a hitch or a gather in the air is a number, not an opinion). */
const TRACE = process.env.TRACE === '1';
if (OBSTACLE && !OBSTACLE_RING.includes(OBSTACLE)) throw new Error(`no such obstacle: ${OBSTACLE} (have ${OBSTACLE_RING.join(', ')})`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/\[DUNK-SKY\]|\[DUNK|\[LOB|\[RIM|\[JUDGE|\[HANDS\] (rim hang|hang release|contact:)/.test(t)) log.push(`${Date.now()} ${t.slice(0, 180)}`); });
// the dev overlay's '1 error' badge, named: every console error and page error the run produced (printed at the end)
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message ?? e).slice(0, 200)} :: ${String((e as Error).stack ?? '').split('\n').slice(1, 4).join(' < ').slice(0, 400)}`));

{ // login
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // the form must be HYDRATED before it is filled (measured: a fresh /login compile took the click as a native GET /login? and the
  // session never existed — every attempt then ran on the login page)
  await lp.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}); await lp.waitForTimeout(800);
  if (/\/login/.test(lp.url())) {
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await lp.click('button[type="submit"]');
    const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300);
  }
  await lp.close();
}

await page.goto(`${BASE}/play/dunk?agent=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
{ const t = Date.now(); while (Date.now() - t < 180000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'playing') break; await page.waitForTimeout(400); } }

// the pad, plus a HUD tap that records every distinct readout the contest publishes
await page.evaluate(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.dispatchEvent(new Event('gamepadconnected'));
  // P4: the BODY through the flight — the top clip on the rig at 20 Hz, so "does a TOMAHAWK look like a TOMAHAWK" is a
  // measurement and not an opinion. Production publishes __FEL_DEV__.anim (SHARED-ANIM-BUS).
  window.__CLIPS = [];
  // TRACE: every rendered frame — root z / y, the top clip and its weight (the gather / launch read)
  window.__TRACE = [];
  (function () {
    const q = window.__FEL_QA__; const s = q && q.scene && q.scene(); if (!s) return;
    s.onAfterRenderObservable.add(() => {
      try {
        const h = q.hero && q.hero(); if (!h) return; let r = h; while (r.parent) r = r.parent;
        const d = window.__FEL_DEV__; const a = d && d.anim ? d.anim() : null; const pl = a && a.hero && a.hero.playing ? a.hero.playing.slice().sort((x, y) => y.weight - x.weight)[0] : null;
        const p = r.getAbsolutePosition();
        window.__TRACE.push({ t: Date.now(), x: +p.x.toFixed(2), y: +p.y.toFixed(3), z: +p.z.toFixed(3), clip: pl ? pl.clip : '', w: pl ? +pl.weight.toFixed(2) : 0 });
        if (window.__TRACE.length > 6000) window.__TRACE.shift();
      } catch (e) {}
    });
  })();
  setInterval(() => {
    const d = window.__FEL_DEV__; const r = d && d.anim ? d.anim() : null; const h = r && r.hero;
    if (!h || !h.playing || !h.playing.length) return;
    const top = h.playing.slice().sort((a, b) => b.weight - a.weight)[0];
    const last = window.__CLIPS[window.__CLIPS.length - 1];
    // P6: the HEIGHT the clip is playing at. "idle_stand" is a fine clip and a disaster two metres off the floor.
    let y = null;
    try { const q = window.__FEL_QA__; const h = q && q.hero && q.hero(); if (h) { let r = h; while (r.parent) r = r.parent; y = +r.getAbsolutePosition().y.toFixed(2); } } catch {}
    if (!last || last.clip !== top.clip) window.__CLIPS.push({ t: Date.now(), clip: top.clip, y });
    else if (y !== null && (last.yMax === undefined || y > last.yMax)) last.yMax = y;
  }, 50);
  // BALL WATCH (2026-09-18, owner: "fix the ball disappearing glitch when attempting certain dunks"): the ball's world
  // position, parent, visibility and whether the active camera can see it, at 20 Hz — a frame where it is invisible, NaN,
  // under the floor, far from the dunker while parented, or off camera while live is the glitch, measured per trick.
  window.__BALL = [];
  setInterval(() => {
    try {
      const q = window.__FEL_QA__; const s = q && q.scene && q.scene(); if (!s) return;
      // THE contest ball: the sphere carrying the palm-mirror metadata (a venue rack has meshes named 'ball' too — the first one
      // measured 'invisible' on every sample). It is an invisible physics sphere; the Meshy leather rides it as a child.
      const b = s.meshes.find((m) => m.name === 'ball' && m.metadata && m.metadata.felPalmMirrorLeft); if (!b) { window.__BALL.push({ t: Date.now(), missing: true }); return; }
      const skin = b.getChildMeshes().filter((c) => c.isEnabled() && c.isVisible && c.visibility > 0.5);
      const p = b.getAbsolutePosition();
      const h = q.hero && q.hero(); let hp = null; if (h) { let r = h; while (r.parent) r = r.parent; hp = r.getAbsolutePosition(); }
      const cam = s.activeCamera;
      window.__BALL.push({ t: Date.now(), x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), vis: skin.length > 0 || !!(b.isVisible && b.isEnabled()), parent: b.parent ? b.parent.name : null,
        far: hp ? +Math.hypot(p.x - hp.x, p.y - hp.y, p.z - hp.z).toFixed(2) : null, fr: cam ? cam.isInFrustum(b) : null, nan: !isFinite(p.x + p.y + p.z), sc: +b.scaling.x.toFixed(2) });
    } catch (e) {}
  }, 50);
  // THE SLAM IS PRESSED IN THE PAGE, not over the bridge. A poll from node costs 30-50 ms a round trip, which is a
  // third of the window: the same scripted player scored a perfect windmill on one attempt and clanked on the next.
  // __armSlam(when, offsetMs) watches the HUD every frame and presses A itself, recording the moment it did.
  //   when 'cue'  — the instant the read lifts (what a player answering the prompt does)
  //   when 'beat' — the window's own tell (hint NOW!), i.e. a player who has learned the beat
  window.__slamAt = null;
  window.__armSlam = (when, offsetMs) => {
    window.__slamAt = null;
    const t0 = performance.now();
    const tick = () => {
      if (performance.now() - t0 > 4000) return;
      const h = window.__hudNow();
      const ready = when === 'beat' ? h.hint === 'NOW!' : !!h.slamPulse;
      if (!ready) { requestAnimationFrame(tick); return; }
      const fire = () => {
        const b = window.__PAD.buttons[0];
        b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now();
        window.__slamAt = Date.now();
        if (window.__SWING) { const H = window.__SLAM_HOLD_MS; setTimeout(() => { window.__PAD.axes[0] = 1; }, H - 420); setTimeout(() => { window.__PAD.axes[0] = -1; }, H - 200); setTimeout(() => { window.__PAD.axes[0] = 0; }, H + 40); }   // the pushes land in the HANG (the contact is ~1.0 s after the press)
        setTimeout(() => { b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); }, window.__SLAM_HOLD_MS || 60);
      };
      if (offsetMs > 0) setTimeout(fire, offsetMs); else fire();
    };
    requestAnimationFrame(tick);
  };
  window.__HUD = []; let last = '';
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };
  setInterval(() => {
    const h = window.__hudNow();
    const s = JSON.stringify([h.banner, h.slamTiming, h.breakdown, h.score, h.judgeReveal, h.slamPulse, h.hint]);
    if (s !== last) { last = s; window.__HUD.push({ t: Date.now(), banner: h.banner, slamTiming: h.slamTiming, breakdown: h.breakdown, score: h.score, cards: h.judgeReveal, pulse: !!h.slamPulse, hint: h.hint }); }
  }, 50);
})()`);
const start = page.locator('text=/^(TAP TO START|START|PLAY)$/').first();
if (await start.count()) await start.first().click().catch(() => {});
await page.waitForTimeout(1200);

const press = async (i: number, ms = 70) => {
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now(); })()`);
  await page.waitForTimeout(ms);
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); })()`);
};
const DPAD: Record<string, number> = { up: 12, down: 13, left: 14, right: 15 };
const hold = async (i: number, on: boolean) => page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = ${on}; b.value = ${on ? 1 : 0}; window.__PAD.timestamp = Date.now(); })()`);
const trigger = async (v: number) => page.evaluate(`(() => { const b = window.__PAD.buttons[7]; b.pressed = ${v > 0.5}; b.value = ${v}; window.__PAD.timestamp = Date.now(); })()`);
const hud = async () => page.evaluate('window.__hudNow()') as Promise<Record<string, unknown>>;

interface BallWatch { samples: number; missing: number; nan: number; invisible: number; under: number; far: number; offCam: number; byPhase: Record<string, number>; firstAt?: string; worst?: string }
interface Attempt { n: number; trick: string; launch?: string; cue: string[]; slamTiming?: string; breakdown?: string; judgeWhy?: string; cards?: unknown; total?: number; banners: string[]; clips?: string[]; ball?: BallWatch; note?: string }
const attempts: Attempt[] = [];
let logMark = 0;

for (let n = 0; n < ATTEMPTS; n++) {
  const trick = want[n % want.length];
  const mark = Date.now();
  const a: Attempt = { n: n + 1, trick: trick.id, cue: [], banners: [] };

  for (let i = 0; i < STYLE_RING.indexOf(STYLE) + 1 && STYLE; i++) { await press(1, 60); await page.waitForTimeout(120); }   // B cycles the style on the runway
  // THE PROP RING: d-pad DOWN in the approach steps through the obstacles, so the lab can put a car — or two people
  // stacked on each other's shoulders — between the dunker and the rim.
  for (let i = 0; OBSTACLE && i <= OBSTACLE_RING.indexOf(OBSTACLE); i++) {
    await hold(DPAD.down, true); await page.waitForTimeout(70); await hold(DPAD.down, false); await page.waitForTimeout(140);
  }
  if (OOP) { const h1 = await hud(); console.log(`  before the oop ring: ${JSON.stringify({ phase: h1.phase, hint: String(h1.hint ?? '').slice(0, 60), prop: h1.prop, attempt: h1.attempt })}`); }
  // X steps the whole prop ring on the PRESS (none → alley-oop → off the glass → bounce → OFF THE BILLBOARD → …); the pad d-pad's
  // release pick never landed from the fake pad (measured: NO PROP after four rights in the approach)
  // X steps the WHOLE prop ring every attempt: press until the HUD reads the label (four presses a run walked on to the car)
  const OOP_LABEL: Record<string, string> = { alleyoop: 'ALLEY-OOP', oopglass: 'OOP OFF THE GLASS', oopbounce: 'BOUNCE OOP', oopcorner: 'OOP OFF THE BILLBOARD' };
  for (let i = 0; OOP && i < 24; i++) { const h0 = await hud(); if (String(h0.prop) === OOP_LABEL[OOP]) break; await press(2, 60); await page.waitForTimeout(160); }
  if (OOP) { await page.waitForTimeout(2600); const h0 = await hud(); console.log(`  oop ring → prop ${String(h0.prop ?? '?')} (the passer needs ~2 s to spawn before the run)`); }

  // RUN: the hold drives the runway; the launch fires at the gather line
  // DUNK PARKOUR: the glass is hit on the APPROACH (the stick alone, before RUN is held): a hold-run's carve toward the rim
  // wins against a full stick, so the carve into the glass has to come first, then the run
  if (GLASS) {
    await page.evaluate('(() => { window.__PAD.axes[0] = 0.85; window.__PAD.axes[1] = -1; })()');   // at the right front corner: the hoopbus
    await page.waitForTimeout(1400);
    await page.evaluate('(() => { window.__PAD.axes[0] = -0.35; window.__PAD.axes[1] = -1; })()');
    await page.waitForTimeout(150);
  }
  await trigger(1);
  const runT0 = Date.now();
  let launched = false;
  let glassPhase = 0, l1Done = !L1_AT_MS;
  let threwRunway = !RUNWAY_TRICK;
  let shotRunway = false;
  const shotsDone = new Set<number>();
  while (Date.now() - runT0 < RUN_MS + 2500) {
    if (glassPhase === 1 && Date.now() - runT0 > 300) { glassPhase = 0; await page.evaluate('(() => { window.__PAD.axes[0] = 0; })()'); }
    if (!l1Done && Date.now() - runT0 >= L1_AT_MS) { l1Done = true; await press(4, 60); }
    // a RUNWAY trick is a bare face button under the hold — the stick steers, so there is no direction to hold
    if (!threwRunway && Date.now() - runT0 >= RUNWAY_AT_MS) {
      threwRunway = true;
      const rw = RUNWAY[RUNWAY_TRICK];
      if (rw.dir) { await hold(DPAD[rw.dir], true); await page.waitForTimeout(80); }
      await press(rw.btn, 60);
      if (rw.dir) { await page.waitForTimeout(60); await hold(DPAD[rw.dir], false); }
      a.trick = `${RUNWAY_TRICK}+${a.trick}`;
    }
    for (let si = 0; si < SHOTS_MS.length; si++) {
      if (shotsDone.has(si) || Date.now() - runT0 < SHOTS_MS[si]) continue;
      shotsDone.add(si);
      await page.screenshot({ path: `${OUT}/${TAG}-a${a.n}-${SHOTS_MS[si]}ms.png` });
    }
    if (SHOT_AT_MS > 0 && !shotRunway && Date.now() - runT0 >= SHOT_AT_MS) {
      shotRunway = true;
      await page.screenshot({ path: `${OUT}/${TAG}-runway${a.n}.png` });   // the run-up itself: is the thing you are jumping over actually there
    }
    const fresh = log.slice(logMark);
    if (fresh.some((l) => /\[DUNK-LAUNCH\]/.test(l))) { launched = true; break; }
    await page.waitForTimeout(30);
  }
  if (!launched) { await trigger(0); await page.waitForTimeout(400); }   // release: jump from here
  const airT0 = Date.now();
  if (L1_AFTER_LAUNCH_MS) { void (async () => { await page.waitForTimeout(L1_AFTER_LAUNCH_MS); await press(4, 60); })(); }   // DUNK PARKOUR: the double-launch, timed from the launch
  if (R1_AFTER_LAUNCH_MS) { void (async () => { await page.waitForTimeout(R1_AFTER_LAUNCH_MS); await press(5, 60); })(); }   // THE SKY TIER: the tap, timed from the launch
  // the burst continues into the air (offsets are still from RUN)
  const burstRest = SHOTS_MS.map((ms, si) => ({ ms, si })).filter(({ si }) => !shotsDone.has(si));
  const burstTimer = burstRest.length ? (async () => { for (const { ms, si } of burstRest) { const wait = runT0 + ms - Date.now(); if (wait > 0) await page.waitForTimeout(wait); shotsDone.add(si); await page.screenshot({ path: `${OUT}/${TAG}-a${a.n}-${ms}ms.png` }).catch(() => {}); } })() : null;
  await trigger(0);

  // THE CALL: the direction goes down first (a player holds it), the button follows — the mode arms an early press and
  // fires it on the trick's own cue beat, so this does not have to be frame-perfect.
  await hold(DPAD[trick.dir], true);
  await page.waitForTimeout(90);
  await press(trick.btn, 60);
  await page.waitForTimeout(60);
  await hold(DPAD[trick.dir], false);
  if (combo) {
    // THE REST OF THE CHAIN. A real run-up buys two tricks and a maximum one buys three (DunkFlight.trickCapacity);
    // the cue table decides when each may fire, and the mode arms a press thrown before its beat. This used to fire
    // only combo[1], so a three-piece like 360+eastbay+scorpion could never be driven at all.
    a.trick = combo.map((t) => t.id).join('+');
    for (const b of combo.slice(1)) {
      await page.waitForTimeout(COMBO_GAP_MS);
      await hold(DPAD[b.dir], true);
      await page.waitForTimeout(90);
      await press(b.btn, 60);
      await page.waitForTimeout(60);
      await hold(DPAD[b.dir], false);
    }
  }

  // THE SLAM: armed in the page so the press lands on the frame it means to.
  await page.evaluate(`window.__SLAM_HOLD_MS = ${SLAM_HOLD_MS}; window.__SWING = ${SWING}; window.__armSlam(${JSON.stringify(SLAM_WHEN)}, ${SLAM_OFFSET_MS})`);
  let slammed = false;
  while (Date.now() - airT0 < 4000) {
    if (await page.evaluate('window.__slamAt !== null')) { slammed = true; break; }
    await page.waitForTimeout(40);
  }
  if (!slammed) a.note = 'the slam read never lifted';

  // the aftermath: replay, the judges' reveal, the total
  await page.waitForTimeout(9000);
  const rows = await page.evaluate('window.__HUD') as { t: number; banner?: string; slamTiming?: string; breakdown?: string; score?: number; cards?: unknown; hint?: string }[];
  const mine = rows.filter((r) => r.t >= mark);
  a.banners = [...new Set(mine.map((r) => r.banner).filter((b): b is string => !!b))];
  a.slamTiming = mine.map((r) => r.slamTiming).filter(Boolean).pop() ?? '';
  a.breakdown = mine.map((r) => r.breakdown).filter(Boolean).pop() ?? '';
a.judgeWhy = mine.map((r) => r.judgeWhy).filter(Boolean).pop() ?? '';
  const cards = mine.map((r) => r.cards).filter((c) => Array.isArray(c) && (c as unknown[]).length) as unknown[][];
  a.cards = cards.pop() ?? null;
  a.total = mine.map((r) => r.score).filter((s): s is number => typeof s === 'number').pop();
  const clipRows = await page.evaluate('window.__CLIPS') as { t: number; clip: string }[];
  a.clips = clipRows.filter((c) => c.t >= mark).map((c) => `${c.clip}@${c.y ?? '?'}`);
  // BALL WATCH: the anomalies in this attempt's window, with the first one's moment (ms after the mark) and what it was
  {
    const rows = (await page.evaluate('window.__BALL') as { t: number; missing?: boolean; x?: number; y?: number; z?: number; vis?: boolean; parent?: string | null; far?: number | null; fr?: boolean | null; nan?: boolean; sc?: number }[]).filter((r) => r.t >= mark);
    const w: BallWatch = { samples: rows.length, missing: 0, nan: 0, invisible: 0, under: 0, far: 0, offCam: 0, byPhase: {} };
    // the contest's phase at each sample ([DUNK-PHASE] lines carry a ms stamp): a loose ball off camera in RESOLVE is the net exit
    // flying off (expected); in APPROACH / CHARGE / CINEMATIC it is the glitch
    const phases = log.map((l) => { const m = /^(\d+) \[DUNK-PHASE\] (\w+)/.exec(l); return m ? { t: +m[1], p: m[2] } : null; }).filter((x): x is { t: number; p: string } => !!x);
    const phaseAt = (t: number) => { let p = 'start'; for (const x of phases) { if (x.t <= t) p = x.p; else break; } return p; };
    let offRun = 0;
    for (const r of rows) {
      const bad: string[] = [];
      if (r.missing) { w.missing++; bad.push('missing'); }
      if (r.nan) { w.nan++; bad.push('NaN'); }
      if (r.vis === false) { w.invisible++; bad.push('invisible'); }
      if (typeof r.y === 'number' && r.y < -0.3) { w.under++; bad.push(`under y ${r.y}`); }
      if (r.parent && typeof r.far === 'number' && r.far > 2.6) { w.far++; bad.push(`parented to ${r.parent} but ${r.far} m from the dunker`); }
      if (r.fr === false && typeof r.y === 'number' && r.y > 0.3) { offRun++; if (offRun >= 6) { w.offCam++; bad.push(`off camera at (${r.x}, ${r.y}, ${r.z})`); } } else offRun = 0;
      if (bad.length) { const ph = phaseAt(r.t); w.byPhase[ph] = (w.byPhase[ph] ?? 0) + 1; if (!w.firstAt) { w.firstAt = `+${r.t - mark} ms (${ph})`; w.worst = bad.join(', ') + (r.parent ? ` [in ${r.parent}]` : ' [loose]'); } }
    }
    a.ball = w;
  }
  if (burstTimer) await burstTimer;
  const fresh = log.slice(logMark); logMark = log.length;
  a.launch = fresh.find((l) => /\[DUNK-LAUNCH\]/.test(l))?.replace(/^\d+ /, '');
  if (TRACE) {
    // the launch moment = the [DUNK-LAUNCH] line's stamp; print −0.7 s … +0.6 s around it every 2nd frame
    const lm = /^(\d+) \[DUNK-LAUNCH\]/.exec(fresh.find((l) => /\[DUNK-LAUNCH\]/.test(l)) ?? '');
    const rows = (await page.evaluate('window.__TRACE') as { t: number; x: number; y: number; z: number; clip: string; w: number }[]).filter((r) => r.t >= mark);
    if (lm && rows.length) {
      const t0 = +lm[1];
      const win = rows.filter((r) => r.t >= t0 - 700 && r.t <= t0 + 600);
      console.log(`   trace (launch at 0): t(ms)  z  dz/dt(m/s)  y  clip`);
      for (let i = 0; i < win.length; i += 2) {
        const r = win[i], pr = win[Math.max(0, i - 2)]; const dt = (r.t - pr.t) / 1000; const v = dt > 0 ? -(r.z - pr.z) / dt : 0;
        console.log(`     ${String(r.t - t0).padStart(5)}  ${r.z.toFixed(2).padStart(6)}  ${v.toFixed(1).padStart(5)}  ${r.y.toFixed(2).padStart(5)}  ${r.clip}${r.w < 0.99 ? ' (' + r.w + ')' : ''}`);
      }
    }
  }
  a.cue = fresh.filter((l) => /\[DUNK-(CUE|TRICK|SLAM|WIN|RUNWAY|LOB)\]/.test(l)).map((l) => l.replace(/^\d+ /, ''));
  attempts.push(a);
  console.log(`#${a.n} ${a.trick.padEnd(12)} ${(a.slamTiming || '—').padEnd(38)} ${(a.breakdown || '').slice(0, 40).padEnd(42)} ${(a.clips ?? []).slice(0, 4).join(' → ')}`);
  if (a.ball) { const w = a.ball; const bad = w.missing + w.nan + w.invisible + w.under + w.far + w.offCam; console.log(`   ball: ${w.samples} samples${bad ? ` · missing ${w.missing} NaN ${w.nan} invisible ${w.invisible} under ${w.under} far ${w.far} offCam ${w.offCam} · by phase ${JSON.stringify(w.byPhase)} · first ${w.firstAt}: ${w.worst}` : ' · never lost'}`); }
  if (n < 3) await page.screenshot({ path: `${OUT}/${TAG}-attempt${a.n}-${a.trick}.png` });
}

if (errors.length) { console.log(`console errors (${errors.length}):`); for (const e of [...new Set(errors)].slice(0, 8)) console.log('  ', e); }
const out = { tag: TAG, base: BASE, slamWhen: SLAM_WHEN, slamOffsetMs: SLAM_OFFSET_MS, attempts, errors: [...new Set(errors)].slice(0, 20), log: log.slice(-200) };
fs.writeFileSync(`${OUT}/dunk-lab-${TAG}.json`, JSON.stringify(out, null, 1));
await browser.close();
const fired = attempts.filter((a) => a.cue.some((l) => /\[DUNK-TRICK\] air/.test(l))).length;
const onTime = attempts.filter((a) => /ON TIME/.test(a.slamTiming ?? '')).length;
console.log(`\n${attempts.length} attempts · ${fired} tricks fired · ${onTime} slams on time · ${OUT}/dunk-lab-${TAG}.json`);
