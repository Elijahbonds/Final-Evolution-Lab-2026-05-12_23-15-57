// _dunk-look — what the dunk LOOKS like, and what it costs, at each beat of one attempt.
//
// The 10-phase physics/aesthetics/visuals pass (owner, 2026-09-16) has a gate the scoring pass did not: hold 60 fps at
// the 10th percentile. Effects are the easiest thing in a game to add and the easiest to lie about — a burst that looks
// right in a still can cost eight frames at the exact moment the player is asked to press a button. So this probe is
// the pair of numbers every phase has to move in the right direction together:
//
//   THE LOOK   a frame at each named beat (approach · takeoff · hang · contact · land · replay · verdict), taken by
//              tapping the mode's own [DUNK-WIN] / [JUICE] console beats in the page rather than guessing at delays.
//   THE COST   per-frame dt sampled in the page for the whole attempt, reported as fps p50/p10/p1 AND split by beat,
//              plus active meshes, particle systems and live particles at the peak.
//
// Screenshots cost 100–250 ms each, which would corrupt the frame record, so the two runs are separate by default:
//   COST=1 npx tsx scripts/probes/_dunk-look.mts     — no screenshots, the fps record is honest
//   SHOTS=1 …                                        — frames at the beats, fps ignored
//   BASE / TRICK / OBSTACLE / SLAM_WHEN as the lab (this drives one attempt the same way).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const TAG = process.env.TAG ?? 'look';
const TRICK = process.env.TRICK ?? 'windmill';
const OBSTACLE = process.env.OBSTACLE ?? '';
const SHOTS = process.env.SHOTS === '1';
const DOMSNAP = process.env.DOMSNAP === '1';
const domSnaps: unknown[] = [];
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 2);
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/dunk`;
fs.mkdirSync(OUT, { recursive: true });

const AIR: Record<string, { dir: string; btn: number }> = {
  windmill: { dir: 'up', btn: 0 }, tomahawk: { dir: 'up', btn: 3 }, spin360: { dir: 'right', btn: 1 },
  scorpion: { dir: 'right', btn: 3 }, cradle: { dir: 'right', btn: 0 }, eastbay: { dir: 'down', btn: 3 },
  betweenlegs: { dir: 'down', btn: 1 }, clutch: { dir: 'down', btn: 0 }, lostfound: { dir: 'left', btn: 1 },
  hideseek: { dir: 'left', btn: 0 },
};
const trick = AIR[TRICK];
if (!trick) throw new Error(`no such trick: ${TRICK} (have ${Object.keys(AIR).join(', ')})`);
const OBSTACLE_RING = ['car', 'barrier', 'crate', 'tetris', 'ladder', 'bike', 'bikeroll', 'skate', 'skateroll', 'row3', 'row5', 'wall'];

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/\[DUNK|\[JUICE|\[LOB|\[RIM|\[HANDS/.test(t)) log.push(`${Date.now()} ${t.slice(0, 200)}`); });

{ // login
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
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

// THE BEAT TAP + THE FRAME RECORDER, both in the page.
//
// The beat tap wraps console.info: the mode already announces every beat it cares about ([DUNK-WIN] takeoff/hang/
// contact/land, [JUICE-LOOK] punch, [HANDS] rim hang), so the probe reads the mode's own truth instead of a stopwatch.
await page.evaluate(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.dispatchEvent(new Event('gamepadconnected'));

  window.__BEAT = ''; window.__BEATS = [];
  const info = console.info.bind(console);
  console.info = (...args) => {
    const s = String(args[0] ?? '');
    let b = '';
    const win = s.match(/\\[DUNK-WIN\\] (\\w+)/); if (win) b = win[1];
    else if (s.indexOf('[JUICE-LOOK] punch') === 0) b = 'punch';
    else if (s.indexOf('[DUNK-LAUNCH]') === 0) b = 'launch';
    if (b) { window.__BEAT = b; window.__BEATS.push({ t: Date.now(), beat: b, frame: window.__FRAMES ? window.__FRAMES.length : 0 }); }
    info(...args);
  };

  // THE FRAME RECORDER. dt per frame off the engine, tagged with the beat that was current when it was drawn, so a
  // drop can be attributed to the thing that caused it instead of averaged into a number nobody can act on.
  window.__FRAMES = [];
  window.__startFrames = () => {
    const q = window.__FEL_QA__; const scene = q && q.scene ? q.scene() : null;
    if (!scene) { window.__FRAMES_ERR = 'no scene'; return false; }
    const eng = scene.getEngine();
    scene.onAfterRenderObservable.add(() => {
      const ps = scene.particleSystems || [];
      let live = 0; for (const p of ps) { try { live += p.getActiveCount ? p.getActiveCount() : 0; } catch {} }
      window.__FRAMES.push({
        dt: eng.getDeltaTime(), beat: window.__BEAT,
        meshes: scene.getActiveMeshes ? scene.getActiveMeshes().length : -1,
        systems: ps.length, particles: live,
      });
    });
    return true;
  };
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };
  // why a slam did or did not land: every distinct (hint, slamPulse) the contest published
  window.__HINTS = []; let lastHint = '';
  setInterval(() => {
    const h = window.__hudNow();
    const s = (h.hint || '') + '|' + (h.slamPulse ? 'PULSE' : '');
    if (s !== lastHint) { lastHint = s; window.__HINTS.push({ t: Date.now(), hint: h.hint, pulse: !!h.slamPulse }); }
  }, 40);
  window.__slamAt = null; window.__ARM = [];
  window.__armSlam = (when, offsetMs) => {
    window.__slamAt = null;
    window.__ARM.push({ t: Date.now(), ev: 'armed', when: when });
    const t0 = performance.now();
    let ticks = 0;
    const tick = () => {
      ticks++;
      if (performance.now() - t0 > 4000) { window.__ARM.push({ t: Date.now(), ev: 'timeout', ticks: ticks, lastHint: window.__hudNow().hint }); return; }
      const h = window.__hudNow();
      const ready = when === 'beat' ? h.hint === 'NOW!' : !!h.slamPulse;
      if (!ready) { requestAnimationFrame(tick); return; }
      const b = window.__PAD.buttons[0];
      b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now();
      window.__slamAt = Date.now();
      window.__ARM.push({ t: Date.now(), ev: 'fired', ticks: ticks });
      setTimeout(() => { b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); }, 60);
    };
    requestAnimationFrame(tick);
  };
})()`);
const startBtn = page.locator('text=/^(TAP TO START|START|PLAY)$/').first();
if (await startBtn.count()) await startBtn.first().click().catch(() => {});
await page.waitForTimeout(1500);
const framesOn = await page.evaluate('window.__startFrames()');
if (!framesOn) console.log('! frame recorder did not attach:', await page.evaluate('window.__FRAMES_ERR'));

const press = async (i: number, ms = 70) => {
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now(); })()`);
  await page.waitForTimeout(ms);
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); })()`);
};
const DPAD: Record<string, number> = { up: 12, down: 13, left: 14, right: 15 };
const hold = async (i: number, on: boolean) => page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = ${on}; b.value = ${on ? 1 : 0}; window.__PAD.timestamp = Date.now(); })()`);
const trigger = async (v: number) => page.evaluate(`(() => { const b = window.__PAD.buttons[7]; b.pressed = ${v > 0.5}; b.value = ${v}; window.__PAD.timestamp = Date.now(); })()`);

/** Screenshot the first frame of each beat as it arrives — the mode says when, so this is not a stopwatch. */
async function watchBeats(untilMs: number, tag: string, want: string[]): Promise<void> {
  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < untilMs) {
    const b = await page.evaluate('window.__BEAT') as string;
    if (b && want.includes(b) && !seen.has(b)) {
      seen.add(b);
      // WHAT IS ON TOP OF THE PICTURE. A washed-out frame is either the render or something painted over it, and the
      // two have nothing in common as a fix — so ask the DOM what is actually stacked at the centre of the screen.
      if (DOMSNAP) domSnaps.push({ beat: b, stack: await page.evaluate(`(() => document.elementsFromPoint(640, 400).slice(0, 8).map((e) => {
        const c = getComputedStyle(e); const r = e.getBoundingClientRect();
        return { tag: e.tagName, cls: (e.className && e.className.baseVal !== undefined ? e.className.baseVal : String(e.className || '')).slice(0, 80), bg: c.backgroundColor, op: c.opacity, filter: c.filter, mix: c.mixBlendMode, w: Math.round(r.width), h: Math.round(r.height) };
      }))()`) });
      if (SHOTS) await page.screenshot({ path: `${OUT}/${TAG}-${tag}-${b}.png` });
    }
    await page.waitForTimeout(SHOTS ? 25 : 60);
  }
}

for (let n = 0; n < ATTEMPTS; n++) {
  for (let i = 0; OBSTACLE && i <= OBSTACLE_RING.indexOf(OBSTACLE); i++) {
    await hold(DPAD.down, true); await page.waitForTimeout(70); await hold(DPAD.down, false); await page.waitForTimeout(140);
  }
  if (SHOTS && n === 0) await page.screenshot({ path: `${OUT}/${TAG}-a${n + 1}-approach.png` });
  // THE STALE BEAT TRAP (measured, 2026-09-16): the mode logs [DUNK-WIN] takeoff while it is setting itself up, long
  // before anyone has run at anything. Breaking on whatever __BEAT happens to hold meant releasing RUN on frame one,
  // then arming the slam after the flight had already resolved — four seconds of ticks that never saw NOW!, and a probe
  // that quietly reported "miss air (no press)" as if the game had done it. Clear the beat, then wait for the LAUNCH.
  await page.evaluate("window.__BEAT = ''");
  await trigger(1);
  const runT0 = Date.now();
  while (Date.now() - runT0 < 5000) {
    if (await page.evaluate("window.__BEAT === 'launch'")) break;
    await page.waitForTimeout(25);
  }
  await trigger(0);
  await hold(DPAD[trick.dir], true); await page.waitForTimeout(90); await press(trick.btn, 60);
  await page.waitForTimeout(60); await hold(DPAD[trick.dir], false);
  await page.evaluate("window.__armSlam('beat', 0)");
  if (n === 0) await watchBeats(3200, `a${n + 1}`, ['takeoff', 'hang', 'contact', 'punch', 'land']);
  else await page.waitForTimeout(3200);
  if (SHOTS && n === 0) { await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/${TAG}-a${n + 1}-replay.png` }); }
  await page.waitForTimeout(SHOTS ? 6000 : 7500);
  if (SHOTS && n === 0) await page.screenshot({ path: `${OUT}/${TAG}-a${n + 1}-verdict.png` });
}

const frames = await page.evaluate('window.__FRAMES') as { dt: number; beat: string; meshes: number; systems: number; particles: number }[];
const beats = await page.evaluate('window.__BEATS') as { t: number; beat: string; frame: number }[];
const fpsOf = (rows: typeof frames) => {
  const f = rows.map((r) => 1000 / Math.max(1, r.dt)).sort((a, b) => a - b);
  if (!f.length) return null;
  const at = (p: number) => +f[Math.min(f.length - 1, Math.floor(f.length * p))].toFixed(1);
  return { n: f.length, p1: at(0.01), p10: at(0.10), p50: at(0.5), worstMs: +Math.max(...rows.map((r) => r.dt)).toFixed(1) };
};
const byBeat: Record<string, unknown> = {};
for (const b of [...new Set(frames.map((f) => f.beat))]) byBeat[b || '(none)'] = fpsOf(frames.filter((f) => f.beat === b));
const peak = frames.reduce((a, f) => (f.particles > a.particles ? f : a), frames[0] ?? { particles: 0, systems: 0, meshes: 0, dt: 0, beat: '' });
const out = {
  tag: TAG, base: BASE, trick: TRICK, obstacle: OBSTACLE, shots: SHOTS,
  overall: fpsOf(frames), byBeat,
  peakParticles: { particles: peak.particles, systems: peak.systems, meshes: peak.meshes, beat: peak.beat },
  meshesMax: Math.max(0, ...frames.map((f) => f.meshes)),
  systemsMax: Math.max(0, ...frames.map((f) => f.systems)),
  beats: beats.map((b) => b.beat),
  domSnaps,
  hints: await page.evaluate('window.__HINTS'),
  slamAt: await page.evaluate('window.__slamAt'),
  arm: await page.evaluate('window.__ARM'),
  juice: log.filter((l) => /\[JUICE|\[HANDS\] rim|\[RIM/.test(l)).slice(-40).map((l) => l.replace(/^\d+ /, '')),
  log: log.slice(-120),
};
fs.writeFileSync(`${OUT}/dunk-look-${TAG}.json`, JSON.stringify(out, null, 1));
console.log(`${TAG} · overall`, JSON.stringify(out.overall));
for (const [b, v] of Object.entries(byBeat)) console.log(`  ${b.padEnd(10)} ${JSON.stringify(v)}`);
console.log(`  peak particles ${peak.particles} across ${out.systemsMax} systems · active meshes max ${out.meshesMax}`);
console.log(`  → ${OUT}/dunk-look-${TAG}.json`);
await browser.close();
