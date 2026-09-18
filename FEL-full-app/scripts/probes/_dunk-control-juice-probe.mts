// DUNK-CONTROL-JUICE probe (2026-09-08): the dev dunk contest on the keyboard, one scenario per attempt, graded per
// rendered frame — anim windows (no clip-less / idle frame in the air), the car / barrier / crate clear or clip off the
// sampled mesh, the self-lob / kick-up / cartwheel toss / alley-oop catch, the eastbay + lost-and-found hand-off frame
// (ball travel continuity), the double-up hop, and the named air tricks' bodies.
//   PORT=3024 npx tsx scripts/probes/_dunk-control-juice-probe.mts            (all groups)
//   PORT=3024 GROUP=2 npx tsx scripts/probes/_dunk-control-juice-probe.mts    (one group of four attempts)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const PORT = process.env.PORT ?? '3024', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-control-juice';
// DUEL=1: the pass-and-play mirror (/dev/mode/dunkduel) — X cycles none → car → barrier → crate (a ring of 4), no lobs / tricks
const DUEL = !!process.env.DUEL, ROUTE = DUEL ? '/dev/mode/dunkduel' : '/dev/mode/dunk', RING = DUEL ? 4 : 6;
mkdirSync(OUT, { recursive: true });
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

type Row = { t: number; dt: number; y: number; z: number; x: number; clips: string[]; bx: number; by: number; bz: number; hx: number; hy: number; hz: number; lx: number; ly: number; lz: number; feet: number; ats: number; parent: string };
type Mark = { t: number; msg: string };
interface Scenario { name: string; prop: number; style?: number; hold?: number; run?: number; runway?: { at: number; key: string }[]; air?: { at: number; dir?: string; key: string }[]; shot?: number; slam?: boolean }
// X cycles the prop: none → alley-oop → self-lob → car → barrier → crate; B cycles the style: power → flashy → sig
const GROUPS: Scenario[][] = [
  [
    { name: 'plain SIG make (eastbay hand-off)', prop: 0, style: 2, slam: true },
    { name: 'CAR full run (hold from the start line)', prop: 3, run: 0, slam: true, shot: 1.0 },
    { name: 'SELF-LOB prop (auto toss)', prop: 2, slam: true, shot: 0.9 },
    { name: 'KICK-UP (B on the run)', prop: 0, runway: [{ at: 250, key: 'k' }], slam: true },
  ],
  [
    { name: 'CARTWHEEL (X on the run)', prop: 0, runway: [{ at: 200, key: 'l' }], slam: true, shot: -0.45 },
    { name: 'DOUBLE-UP (A late on the run)', prop: 0, run: 300, runway: [{ at: 470, key: 'j' }], slam: true },
    { name: 'SCORPION (right + Y in the air)', prop: 0, air: [{ at: 480, dir: 'ArrowRight', key: 'i' }], slam: true, shot: 0.75 },
    { name: 'LOST & FOUND (left + B in the air)', prop: 0, air: [{ at: 430, dir: 'ArrowLeft', key: 'k' }], slam: true, shot: 0.85 },
  ],
  [
    { name: 'BARRIER', prop: 4, run: 500, slam: true },
    { name: 'CRATE', prop: 5, run: 200, slam: true, shot: 0.8 },
    { name: 'CAR weak jump (short hold)', prop: 3, run: 0, hold: 220, slam: true },
    { name: 'ALLEY-OOP (passer toss)', prop: 1, slam: true, shot: 0.7 },
  ],
  [
    { name: 'SELF-LOB by hand (Y on the run)', prop: 0, runway: [{ at: 200, key: 'i' }], slam: true },
    { name: 'DOUBLE-UP over the CAR', prop: 3, run: 0, runway: [{ at: 800, key: 'j' }], slam: true },
    { name: 'WINDMILL (up + A) — existing trick on a real body', prop: 0, air: [{ at: 450, dir: 'ArrowUp', key: 'j' }], slam: true },
    { name: '360 (right + B) — existing trick on a real body', prop: 0, air: [{ at: 450, dir: 'ArrowRight', key: 'k' }], slam: true },
  ],
  [
    { name: 'HIDE & SEEK (left + A in the air)', prop: 0, air: [{ at: 430, dir: 'ArrowLeft', key: 'j' }], slam: true, shot: 0.8 },
    { name: 'TOMAHAWK → EASTBAY combo (up + Y, down + Y)', prop: 0, air: [{ at: 400, dir: 'ArrowUp', key: 'i' }, { at: 640, dir: 'ArrowDown', key: 'i' }], slam: true },
    { name: 'CRATE weak jump (short hold)', prop: 5, run: 200, hold: 160, slam: true },
    { name: 'SELF-LOB standing (Y before the run)', prop: 0, runway: [{ at: -1, key: 'i' }], slam: true },
  ],
];

const results: { name: string; lines: string[]; ok: boolean }[] = [];
async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[]; frames: string[] }> {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = []; const frames: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const S = window.__smp = { rows: [], marks: [] };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|LOB|DUNK-PROP|DUNK-TRICK|HANDS|JUICE-SOFT|FEL-DUNK)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 140) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 140) }); ow(...a); };
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    let hand = null, lhand = null, feetL = null, feetR = null, heroSeen = null;
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); hand = d.find((n) => /^RightHand/.test(n.name)) ?? null; lhand = d.find((n) => /^LeftHand/.test(n.name)) ?? null; feetL = d.find((n) => /^LeftFoot/.test(n.name)) ?? null; feetR = d.find((n) => /^RightFoot/.test(n.name)) ?? null; }
      const ball = scene.getMeshByName('ball') || scene.getMeshByName('duel_ball');
      const bp = ball ? ball.getAbsolutePosition() : null, hp = hand ? hand.getAbsolutePosition() : null, lp = lhand ? lhand.getAbsolutePosition() : null;
      const fy = Math.min(feetL ? feetL.getAbsolutePosition().y : 9, feetR ? feetR.getAbsolutePosition().y : 9);
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      S.rows.push({ t: performance.now(), dt: scene.getEngine().getDeltaTime(), x: h.position.x, y: h.position.y, z: h.position.z, clips, bx: bp ? bp.x : 0, by: bp ? bp.y : 0, bz: bp ? bp.z : 0, hx: hp ? hp.x : 0, hy: hp ? hp.y : 0, hz: hp ? hp.z : 0, lx: lp ? lp.x : 0, ly: lp ? lp.y : 0, lz: lp ? lp.z : 0, feet: fy, ats: scene.animationTimeScale ?? 1, parent: ball && ball.parent ? ball.parent.name : '' });
      if (S.rows.length > 20000) S.rows.splice(0, 5000);
    });
  })()`);
  await p.keyboard.press('j');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors, frames };
}
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const rows = async (p: Page, a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const hint = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;

async function waitApproach(p: Page, ms = 25000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const text = await hint(p);
    if (/HOLD to run|Pick your PROP|FINAL ROUND/.test(text) && !/SLAM!|CONFER|CARD/.test(text)) return true;
    if (/CONTEST|result/.test(text) && !/· playing/.test(text)) return false;
    await p.waitForTimeout(150);
  }
  return false;
}

let curProp = 0, curStyle = 0;   // the prop / style persist between attempts (X and B cycle rings of 6 / 3)
async function attempt(p: Page, sc: Scenario, shotName: string): Promise<string[]> {
  const lines: string[] = [];
  const ok = await waitApproach(p);
  if (!ok) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  const m0 = (await marks(p)).length, tA = await now(p);
  if (DUEL) { curProp = 0; curStyle = 0; }   // the duel resets the prop and the style on every hand-off
  const propPresses = (sc.prop - curProp + RING) % RING, stylePresses = ((sc.style ?? 0) - curStyle + 3) % 3;
  for (let i = 0; i < propPresses; i++) { await p.keyboard.press('l'); await p.waitForTimeout(120); }
  for (let i = 0; i < stylePresses; i++) { await p.keyboard.press('k'); await p.waitForTimeout(120); }
  curProp = sc.prop; curStyle = sc.style ?? 0;
  await p.waitForTimeout(propPresses ? 1100 : 200);   // the obstacle mesh loads
  for (const k of sc.runway ?? []) if (k.at < 0) { await p.keyboard.press(k.key); lines.push(`      standing key ${k.key} before the run`); await p.waitForTimeout(150); }
  if ((sc.run ?? 700) > 0) { await p.keyboard.down('w'); await p.waitForTimeout(sc.run ?? 700); await p.keyboard.up('w'); }
  await p.keyboard.down(' ');
  const holdStart = Date.now();
  const runway = [...(sc.runway ?? [])].filter((k) => k.at >= 0).sort((a, b) => a.at - b.at);
  let launched = false; let launchPage = 0;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  // the hold: runway keys at their offsets; the launch fires at the takeoff line (or a short hold releases early)
  while (!launched && Date.now() - holdStart < 2600) {
    const el = Date.now() - holdStart;
    while (runway.length && el >= runway[0].at) { const k = runway.shift()!; await p.keyboard.press(k.key); lines.push(`      runway key ${k.key} at +${el} ms`); }
    if (sc.hold != null && el >= sc.hold) break;
    await p.waitForTimeout(30); await launchedYet();
  }
  await p.keyboard.up(' ');
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 1800) await p.waitForTimeout(40);
  if (!launched) { lines.push('FAIL  never launched'); return lines; }
  const pageNow = await now(p);
  const sinceLaunch = () => Date.now() - (r0 - (pageNow - launchPage));
  // air tricks: hold a direction, tap the button
  const air = [...(sc.air ?? [])].sort((a, b) => a.at - b.at);
  let shotDone = sc.shot == null;
  if (sc.shot != null && sc.shot < 0) { await p.waitForTimeout(0); }
  const slamFrom = 950, slamTo = 2300; let nextSlam = slamFrom;
  while (sinceLaunch() < 2600) {
    const el = sinceLaunch();
    if (air.length && el >= air[0].at) { const a = air.shift()!; if (a.dir) await p.keyboard.down(a.dir); await p.keyboard.press(a.key); if (a.dir) { await p.waitForTimeout(40); await p.keyboard.up(a.dir); } lines.push(`      air ${a.dir ?? ''}+${a.key} at +${el} ms`); }
    if (!shotDone && el >= Math.abs(sc.shot!) * 1000) { shotDone = true; await p.screenshot({ path: `${OUT}/${shotName}.png` }); }
    if (sc.slam && el >= nextSlam && el <= slamTo) { await p.keyboard.press('j'); nextSlam = el + 85; }
    await p.waitForTimeout(25);
  }
  const tZ = await now(p);
  const ms = (await marks(p)).slice(m0);
  const R = await rows(p, tA, tZ);
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg));
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  // anim windows: every airborne frame has a dunk-family clip, never idle / run
  const landMark = ms.find((m) => /HANDS\] land /.test(m.msg));   // a dunker who came down ON the car stands at its roof height in the idle — that is the land, not the air
  const airRows = R.filter((r) => r.t > launchPage && r.y > 0.06 && (!landMark || r.t < landMark.t));
  const clipless = airRows.filter((r) => r.clips.length === 0).length;
  const idleAir = airRows.filter((r) => r.clips.some((c) => /^(idle_stand|run|guard|walk)$/.test(c)) && !r.clips.some((c) => /^dunk_|jumpshot/.test(c))).length;
  say(clipless === 0 && idleAir === 0, `anim windows: ${airRows.length} airborne frames, ${clipless} without a clip, ${idleAir} in idle/run — windows ${ms.filter((m) => /DUNK-WIN/.test(m.msg)).map((m) => m.msg.slice(11)).join('→')}`);
  const apex = Math.max(0, ...airRows.map((r) => r.y));
  lines.push(`      apex ${apex.toFixed(2)} m, launch z ${R.find((r) => r.t >= launchPage)?.z.toFixed(2)}`);
  const clipsSeen = [...new Set(airRows.flatMap((r) => r.clips))];
  lines.push(`      clips in the air: ${clipsSeen.join(', ')}`);
  if (DUEL ? sc.prop >= 1 : sc.prop >= 3) {
    const spawn = [...ms].reverse().find((m) => /DUNK-PROP\] (CAR|BARRIER|CRATE) (mesh|BOX)/.test(m.msg));   // the last spawn: cycling past the car loads it too
    say(!!spawn && /mesh/.test(spawn.msg), `obstacle mesh: ${spawn?.msg.slice(12) ?? 'no spawn mark'}`);
    const cleared = ms.find((m) => /CLEARED/.test(m.msg)), clipped = ms.find((m) => /CLIPPED/.test(m.msg));
    const weak = sc.hold != null;
    say(weak ? !!clipped : !!cleared, `${weak ? 'a weak jump clips' : 'a good jump clears'}: ${(cleared ?? clipped)?.msg.slice(12) ?? 'neither mark'}`);
    const over = ms.find((m) => /over (CAR|BARRIER|CRATE)/.test(m.msg)); if (over) lines.push(`      ${over.msg.slice(12)}`);
  }
  const lobThrown = ms.find((m) => /^\[LOB\] .* from/.test(m.msg));
  if (!DUEL && (sc.prop === 1 || sc.prop === 2 || sc.runway?.some((k) => k.key !== 'j'))) {
    say(!!lobThrown, `toss: ${lobThrown?.msg.slice(6) ?? 'none'}`);
    const caught = ms.find((m) => /\[LOB\] CAUGHT/.test(m.msg)), lost = ms.find((m) => /\[LOB\] LOST/.test(m.msg));
    say(!!caught, `catch: ${(caught ?? lost)?.msg.slice(6) ?? 'no catch, no loss'}`);
    // the ball never teleports: max per-frame travel while the lob is live (the catch frame is the parent swap)
    if (lobThrown) {
      const live = R.filter((r) => r.t >= lobThrown.t && (!caught || r.t <= caught.t - 20));
      let maxSpd = 0, maxStep = 0; for (let i = 1; i < live.length; i++) { const st = Math.hypot(live[i].bx - live[i - 1].bx, live[i].by - live[i - 1].by, live[i].bz - live[i - 1].bz); maxStep = Math.max(maxStep, st); maxSpd = Math.max(maxSpd, st / Math.max(0.008, live[i].dt / 1000)); }
      say(maxSpd < 20, `ball continuity in flight: max ${maxSpd.toFixed(1)} m/s (${maxStep.toFixed(2)} m in one frame) over ${live.length} frames — a lob never teleports`);
      const near = live.reduce((m, r) => Math.min(m, Math.hypot(r.bx - r.hx, r.by - r.hy, r.bz - r.hz)), 9);
      lines.push(`      closest ball↔hand ${near.toFixed(2)} m`);
    }
  }
  for (const k of sc.runway ?? []) {
    const id = k.key === 'j' ? 'doubleup' : k.key === 'k' ? 'kickup' : k.key === 'l' ? 'cartwheel' : 'selflob';
    const started = ms.find((m) => new RegExp(`runway ${id}$`).test(m.msg)), done = ms.find((m) => new RegExp(`runway ${id} done`).test(m.msg));
    const clip = { doubleup: 'dunk_double_up', kickup: 'dunk_kick_up', cartwheel: 'dunk_cartwheel', selflob: 'dunk_self_lob' }[id];
    const frames = R.filter((r) => r.clips.includes(clip)).length;
    say(!!started && frames > 6, `runway ${id}: ${started ? 'started' : 'NOT started'}, ${done ? 'ended' : 'no end mark'}, ${frames} frames on ${clip}`);
    if (id === 'doubleup' && started) say(!!ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg) && m.t > started.t), 'double-up: the takeoff followed the hop');
  }
  for (const a of sc.air ?? []) {
    const id = a.dir === 'ArrowRight' && a.key === 'i' ? 'scorpion' : a.dir === 'ArrowLeft' && a.key === 'k' ? 'lostfound' : a.dir === 'ArrowLeft' && a.key === 'j' ? 'hideseek' : a.dir === 'ArrowUp' && a.key === 'j' ? 'windmill' : a.dir === 'ArrowRight' && a.key === 'k' ? 'spin360' : a.dir === 'ArrowUp' && a.key === 'i' ? 'tomahawk' : a.dir === 'ArrowDown' && a.key === 'i' ? 'eastbay' : a.key;
    const clip = { scorpion: 'dunk_scorpion', lostfound: 'dunk_lost_found', hideseek: 'dunk_hide_seek', windmill: 'dunk_finish_windmill', spin360: 'dunk_360_spin', tomahawk: 'dunk_finish_tomahawk', eastbay: 'dunk_360_eastbay' }[id as string] ?? '?';
    const fired = ms.find((m) => new RegExp(`air ${id}`).test(m.msg));
    const frames = R.filter((r) => r.clips.includes(clip)).length;
    say(!!fired && frames > 6, `air ${id}: ${fired ? 'fired ' + fired.msg.slice(fired.msg.indexOf('@')) : 'NOT fired'}, ${frames} frames on ${clip}`);
  }
  if (sc.style === 2 || sc.air?.some((a) => a.dir === 'ArrowLeft' && a.key === 'k')) {
    const ho = ms.find((m) => /HANDS\] handoff/.test(m.msg));
    say(!!ho, `hand-off frame: ${ho?.msg.slice(8) ?? 'no mark'}`);
    if (ho) {
      const win = R.filter((r) => r.t >= ho.t - 160 && r.t <= ho.t + 160);
      let maxSpd = 0, maxStep = 0; for (let i = 1; i < win.length; i++) { const st = Math.hypot(win[i].bx - win[i - 1].bx, win[i].by - win[i - 1].by, win[i].bz - win[i - 1].bz); maxStep = Math.max(maxStep, st); maxSpd = Math.max(maxSpd, st / Math.max(0.008, win[i].dt / 1000)); }
      const parents = [...new Set(win.map((r) => r.parent))];
      say(maxSpd < 12, `hand-off continuity: max ${maxSpd.toFixed(1)} m/s (${maxStep.toFixed(2)} m in one frame) across the transfer (${parents.join(' → ')})`);
    }
  }
  if (sc.slam && !(sc.hold != null) && !lobThrown) {
    const contact = has(/DUNK-WIN\] contact/);
    lines.push(`      ${contact ? 'MAKE (contact)' : 'no contact — ' + (ms.find((m) => /miss clank|CAUGHT THE|LOST/.test(m.msg))?.msg ?? 'miss')}`);
  } else if (lobThrown) lines.push(`      ${has(/DUNK-WIN\] contact/) ? 'MAKE (contact)' : 'no contact'}`);
  const warns = ms.filter((m) => /^WARN/.test(m.msg)); if (warns.length) lines.push(`      warns: ${warns.map((w) => w.msg).join(' | ')}`);
  if (process.env.VERBOSE) {
    lines.push('      marks: ' + ms.map((m) => `${((m.t - launchPage) / 1000).toFixed(2)}s ${m.msg}`).join(' | '));
    for (const r of R.filter((r, i) => r.t < launchPage + 100 && i % 6 === 0)) lines.push(`      pre ${((r.t - launchPage) / 1000).toFixed(2)}s z ${r.z.toFixed(2)} y ${r.y.toFixed(2)} ${r.clips.join(',')}`);
    const lb = ms.find((m) => /^\[LOB\] .* from/.test(m.msg));
    if (lb) for (const r of R.filter((r) => r.t >= lb.t - 60 && r.t <= lb.t + 1400)) lines.push(`      lob ${((r.t - lb.t)).toFixed(0).padStart(5)} ms dt ${r.dt.toFixed(0)} ball(${r.bx.toFixed(2)},${r.by.toFixed(2)},${r.bz.toFixed(2)}) hand(${r.hx.toFixed(2)},${r.hy.toFixed(2)},${r.hz.toFixed(2)}) ${r.parent || '-'} ats ${r.ats} y ${r.y.toFixed(2)}`);
    const ho = ms.find((m) => /HANDS\] handoff/.test(m.msg));
    if (ho) for (const r of R.filter((r) => r.t >= ho.t - 200 && r.t <= ho.t + 200)) lines.push(`      ${((r.t - ho.t)).toFixed(0).padStart(5)} ms ball(${r.bx.toFixed(2)},${r.by.toFixed(2)},${r.bz.toFixed(2)}) R(${r.hx.toFixed(2)},${r.hy.toFixed(2)},${r.hz.toFixed(2)}) L(${r.lx.toFixed(2)},${r.ly.toFixed(2)},${r.lz.toFixed(2)}) ${r.parent} ats ${r.ats}`);
  }
  return lines;
}

const DUEL_GROUPS: Scenario[][] = [[
  { name: 'DUEL P1 CAR full run (POWER — the SIG eastbay leaves its trail leg hanging and clips the roof)', prop: 1, run: 0, slam: true, shot: 1.0 },
  { name: 'DUEL P2 CRATE (hold from the start line)', prop: 3, run: 0, slam: true },
  { name: 'DUEL P1 CAR weak jump (short hold)', prop: 1, run: 0, hold: 220, slam: true },
  { name: 'DUEL P2 plain SIG (eastbay hand-off)', prop: 0, style: 2, slam: true },
]];
if (DUEL) { GROUPS.length = 0; GROUPS.push(...DUEL_GROUPS); }
const only = process.env.GROUP ? [Number(process.env.GROUP) - 1] : GROUPS.map((_, i) => i);
const SCEN = process.env.SCEN ?? '';
let allErrors: string[] = [], allFrames: string[] = [];
for (const gi of only) {
  const { p, close, errors, frames } = await boot();
  curProp = 0; curStyle = 0;   // DUNK-SOFTS-NAMED: a fresh page starts at NO PROP / POWER (the ring carried over between boots and group 4's car never armed)
  for (const sc of GROUPS[gi]) {
    if (SCEN && !sc.name.toLowerCase().includes(SCEN.toLowerCase())) continue;
    console.log(`\n── ${sc.name}`);
    const lines = await attempt(p, sc, `g${gi + 1}-${sc.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    for (const l of lines) console.log('  ' + l);
    results.push({ name: sc.name, lines, ok: !lines.some((l) => l.startsWith('FAIL')) });
  }
  allErrors = allErrors.concat(errors); allFrames = allFrames.concat(frames);
  await close();
}
console.log(`\nerrors ${allErrors.length}${allErrors.length ? ': ' + allErrors.slice(0, 5).join(' | ') : ''}`);
console.log(`FEL-FRAME / MISSING CLIP ${allFrames.length}${allFrames.length ? ': ' + allFrames.slice(0, 4).join(' | ') : ''}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} scenarios PASS`);
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
