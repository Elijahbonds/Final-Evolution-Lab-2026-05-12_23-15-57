// HOOPS-GAMEPLAY H2 (2026-10-16): THE MOVE REEL — every H2 move recorded from the running game, the same seed, the same scripted pad,
// the same camera, so a BEFORE tree (origin/lane/finish-release) and an AFTER tree (lane/hoops-h2*) line up clip for clip.
//
//   BASE=http://127.0.0.1:3363 OUT=~/Claude/outbox/hoops-gameplay/h2/reel/after LABEL='AFTER h2a' npx tsx scripts/probes/_hoops-h2-reel.mts
//   env: BASE · OUT · LABEL · SEED (1016) · SCEN (all | comma ids) · MODES (1v1,3v3) · QS (extra query, e.g. &handle=100)
//        CHROMIUM_EXE (default: the installed Chrome — MediaRecorder needs a real codec build)
//
// HOW: playwright-core, ONE page per mode, /dev/mode/<key>?<QS> (no ?agent=1: the agent slot replaces the local input). The pad is a fake
// DualShock in getGamepads() slot 0 — the player's own input path, through the real StickHandleReader. Each scenario: the dev seam's
// offense() (a fresh possession, the ball in my hands), a settle, then the pad script (the left stick camera-relative, the right stick
// flicked in the 2K map's directions RELATIVE TO THE BALL HAND, read off the seam's carry()), recorded through the page's caption canvas.
// Measured per scenario from the game itself: what the stick became and what the move rendered (the mode's own [1V1-STICK] /
// [1V1-HANDLE] lines), the ball's hand before / after (the seam's carry()), the hero's travel through the move, the defender's distance
// at the flick. assumption: frame timing varies run to run, so two runs line up in set-up and inputs, not frame for frame.
//
// It reads the modes' seams and log lines only — no constant the phase changes — so the same script runs on the before tree.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { initScript, LIB } from './_hoops-h2-reel-page.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3363';
const OUT = (process.env.OUT ?? `${process.env.HOME}/Claude/outbox/hoops-gameplay/h2/reel/after`).replace(/^~/, process.env.HOME ?? '');
const LABEL = process.env.LABEL ?? 'AFTER h2';
const SEED = Number(process.env.SEED ?? 1016);
const QS = process.env.QS ?? '';
const ONLY = (process.env.SCEN ?? 'all').split(',').map((x) => x.trim());
const MODES = (process.env.MODES ?? '1v1,3v3').split(',').map((x) => x.trim());
/** ZOOM: the move view's crop round the hero (2.6 default; 1 = the plain play-camera frame). DPR: the page's device scale (the crop's sharpness). */
const ZOOM = Number(process.env.ZOOM ?? 2.6), DPR = Number(process.env.DPR ?? 2);
/** STRIP: frames of the move view every STRIP_MS from the flick (a 2×5 sheet, `<id>-strip.png`), to read a move at a glance. */
const STRIP_N = Number(process.env.STRIP_N ?? 10), STRIP_MS = Number(process.env.STRIP_MS ?? 70);
/** RETRY: tries per scenario (a strip before the move lands throws it again); SETTLE_MS: the wait after the fresh possession. */
const RETRY = Number(process.env.RETRY ?? 3), SETTLE_MS = Number(process.env.SETTLE_MS ?? 1400);
const EXE = process.env.CHROMIUM_EXE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });
const MEAS = path.join(OUT, 'measurements.json');
const meas: Record<string, unknown> = fs.existsSync(MEAS) ? JSON.parse(fs.readFileSync(MEAS, 'utf8')) : {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const say = (m: string) => console.log(`[h2-reel ${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
/** The mode lines kept per scenario (LOG_RE=all: every [1V1-…] / [3V3-…] line). */
const LOG_RE = process.env.LOG_RE === 'all' ? '(1V1|3V3)-' : '(1V1|3V3)-(STICK|HANDLE|THREAT|MOVE|REF|DEF)';
const want = (id: string): boolean => ONLY.includes('all') || ONLY.includes(id);

/** One step of a pad script: ms after the previous step, then what the pad does. Right-stick flicks are in the 2K map's words, read
 *  against the ball hand at that moment: toward / away / up / down / upAway / upToward / downAway / downToward. */
type Step =
  | { at: number; ls: 'foe' | 'away' | 'none' | 'across' | 'foeR' | 'foeL' | 'side' | 'backSide'; mag?: number; tap?: number }
  | { at: number; rot: 1 | -1; ms?: number }
  | { at: number; l1: boolean }
  | { at: number; rs: 'toward' | 'away' | 'up' | 'down' | 'upAway' | 'upToward' | 'downAway' | 'downToward'; hold?: number }
  | { at: number; r2: boolean }
  | { at: number; mark: string }
  | { at: number; still: string };
/** `landed`: the log line that says the move happened (default: any -STICK / -HANDLE line after the flick; the jab and the pivot log
 *  under -THREAT / -MOVE). */
/** `luck`: the 1v1 dev seam's forced roll for the take (0.99 = no AI chance lands: the rookie rival strips a set jab ~0.24 s in, which
 *  cuts the clip; it also means the jab is never bought). Cleared after the take. */
/** `stripDelay`: ms from the mark to the strip's first frame. The jab is a 120 ms TAP read on its first frame (triple threat at ≤ 0.22 of
 *  top speed) and on its length (≤ 0.2 s): the strip's toDataURL stalls the frame it lands in, which ate the jab 20 times in 23 takes
 *  while the same tap with no recording landed 6 / 6 on both trees. `stripMs`: this scenario's strip spacing (the spin's 0.6 s turn and
 *  its step-out outrun the default 10 × 70 ms). */
interface Scen { id: string; title: string; modes: ('1v1' | '3v3')[]; steps: Step[]; tail: number; landed?: string; luck?: number; stripDelay?: number; stripMs?: number }
const JOG = 0.55, RUN = 0.85;
const SCENS: Scen[] = [
  { id: 'cross', title: 'crossover (R stick up-away) at a jog', modes: ['1v1', '3v3'], tail: 1300,
    steps: [{ at: 0, ls: 'foe', mag: JOG }, { at: 650, mark: 'flick' }, { at: 0, rs: 'upAway' }, { at: 250, still: 'move' }] },
  { id: 'momentum', title: 'momentum cross (R2 + up-away) at a run', modes: ['1v1'], tail: 1300,
    steps: [{ at: 0, ls: 'foe', mag: RUN }, { at: 0, r2: true }, { at: 600, mark: 'flick' }, { at: 0, rs: 'upAway' }, { at: 250, still: 'move' }, { at: 500, r2: false }] },
  { id: 'between', title: 'between the legs (R stick away)', modes: ['1v1', '3v3'], tail: 1300,
    steps: [{ at: 0, ls: 'foe', mag: 0.4 }, { at: 650, mark: 'flick' }, { at: 0, rs: 'away' }, { at: 250, still: 'move' }] },
  { id: 'behind', title: 'behind the back (R stick down-away) at a jog', modes: ['1v1', '3v3'], tail: 1300,
    steps: [{ at: 0, ls: 'foe', mag: 0.7 }, { at: 700, mark: 'flick' }, { at: 0, rs: 'downAway' }, { at: 250, still: 'move' }] },
  { id: 'slide', title: 'BTB slide (down-away thrown SET, with space)', modes: ['1v1', '3v3'], tail: 1500,
    steps: [{ at: 0, ls: 'away', mag: 0.6 }, { at: 600, ls: 'none' }, { at: 550, mark: 'flick' }, { at: 0, rs: 'downAway' }, { at: 250, still: 'move' }] },
  { id: 'inout', title: 'in-and-out (R stick up)', modes: ['1v1', '3v3'], tail: 1200,
    steps: [{ at: 0, ls: 'foe', mag: 0.5 }, { at: 650, mark: 'flick' }, { at: 0, rs: 'up' }, { at: 200, still: 'move' }] },
  { id: 'hesi', title: 'hesitation (R stick toward)', modes: ['1v1', '3v3'], tail: 1300,
    steps: [{ at: 0, ls: 'foe', mag: 0.6 }, { at: 650, mark: 'flick' }, { at: 0, rs: 'toward' }, { at: 250, still: 'move' }] },
  { id: 'sizeup', title: 'size-ups x3 (R stick up-toward, standing)', modes: ['1v1'], tail: 900,
    steps: [{ at: 0, ls: 'none' }, { at: 400, mark: 'flick' }, { at: 0, rs: 'upToward' }, { at: 300, still: 'move' }, { at: 400, rs: 'upToward' }, { at: 700, rs: 'upToward' }] },
  { id: 'pausin', title: "PAUSIN' (R stick held toward ~1.4 s, then let go)", modes: ['1v1'], tail: 900,
    steps: [{ at: 0, ls: 'foe', mag: 0.5 }, { at: 600, ls: 'none' }, { at: 0, mark: 'flick' }, { at: 0, rs: 'toward', hold: 1400 }, { at: 500, still: 'move' }] },
  { id: 'double', title: 'cross, then a left-stick reversal at pace (the read deep in a chain: the double cross)', modes: ['1v1'], tail: 1300,
    steps: [{ at: 0, ls: 'foeR', mag: RUN }, { at: 600, mark: 'flick' }, { at: 0, rs: 'upAway' }, { at: 260, ls: 'foeL', mag: RUN }, { at: 200, still: 'move' }] },
  { id: 'dblbehind', title: 'double behind-the-back (behind, then behind again inside the chain window)', modes: ['1v1', '3v3'], tail: 1300,
    steps: [{ at: 0, ls: 'foe', mag: 0.7 }, { at: 700, mark: 'flick' }, { at: 0, rs: 'downAway' }, { at: 300, rs: 'downAway' }, { at: 150, still: 'move' }] },
  { id: 'betbehind', title: 'between-the-legs into behind-the-back (two flicks inside the window)', modes: ['1v1', '3v3'], tail: 1300,
    steps: [{ at: 0, ls: 'foe', mag: 0.6 }, { at: 700, mark: 'flick' }, { at: 0, rs: 'away' }, { at: 300, rs: 'downAway' }, { at: 150, still: 'move' }] },
  // H2b: the spin (its sweep stops at the step-out), the pivots (v2: real speed, no baked yaw), the jab (its own clip), PAUSIN' and the
  // size-up in 3v3 too
  { id: 'spin', title: 'spin (R stick rolled round the ring) at a jog', modes: ['1v1', '3v3'], tail: 1500, stripDelay: 200, stripMs: 110,
    steps: [{ at: 0, ls: 'foe', mag: 0.6 }, { at: 650, mark: 'flick' }, { at: 0, rot: 1, ms: 240 }, { at: 300, still: 'move' }] },
  { id: 'pivot', title: 'front pivot (L1 held, the left stick swung across)', modes: ['1v1', '3v3'], tail: 1100, landed: 'front pivot',
    steps: [{ at: 0, ls: 'none' }, { at: 900, l1: true }, { at: 250, mark: 'flick' }, { at: 0, ls: 'side', mag: 0.9 }, { at: 250, still: 'move' }, { at: 350, ls: 'none' }, { at: 150, l1: false }] },
  { id: 'revpivot', title: 'reverse pivot (L1 held, the left stick swung across and back)', modes: ['1v1'], tail: 1100, landed: 'reverse pivot',
    steps: [{ at: 0, ls: 'none' }, { at: 900, l1: true }, { at: 250, mark: 'flick' }, { at: 0, ls: 'backSide', mag: 0.9 }, { at: 250, still: 'move' }, { at: 350, ls: 'none' }, { at: 150, l1: false }] },
  { id: 'jab', title: 'jab (a left-stick TAP at him from triple threat)', modes: ['1v1', '3v3'], tail: 1100, landed: '-THREAT\\] jab #', luck: 0.99, stripDelay: 160,
    steps: [{ at: 0, ls: 'none' }, { at: 150, mark: 'flick' }, { at: 0, ls: 'foe', mag: 0.9, tap: 120 }, { at: 200, still: 'move' }] },
  { id: 'pausin3', title: "PAUSIN' (R stick held toward ~1.4 s, then let go)", modes: ['3v3'], tail: 900,
    steps: [{ at: 0, ls: 'foe', mag: 0.5 }, { at: 600, ls: 'none' }, { at: 0, mark: 'flick' }, { at: 0, rs: 'toward', hold: 1400 }, { at: 500, still: 'move' }] },
  { id: 'sizeup3', title: 'size-ups x3 (R stick up-toward, standing)', modes: ['3v3'], tail: 900,
    steps: [{ at: 0, ls: 'none' }, { at: 400, mark: 'flick' }, { at: 0, rs: 'upToward' }, { at: 300, still: 'move' }, { at: 400, rs: 'upToward' }, { at: 700, rs: 'upToward' }] },
  { id: 'lcross', title: 'left-stick reversal at a jog (the crossover the LS throws)', modes: ['1v1', '3v3'], tail: 1300,
    steps: [{ at: 0, ls: 'foeR', mag: 0.7 }, { at: 700, mark: 'flick' }, { at: 0, ls: 'foeL', mag: 0.7 }, { at: 250, still: 'move' }] },
];

/** The 2K map's directions in stick axes with the ball in the RIGHT hand (x right +, y down +), mirrored for the left. */
const RS: Record<string, [number, number]> = { toward: [1, 0], away: [-1, 0], up: [0, -1], down: [0, 1], upAway: [-0.75, -0.75], upToward: [0.75, -0.75], downAway: [-0.75, 0.75], downToward: [0.75, 0.75] };

async function seam(page: Page, mode: '1v1' | '3v3'): Promise<boolean> {
  return page.evaluate((m) => { const md = (window as any).__FEL_DEV__?.scene?.metadata; return !!(m === '1v1' ? md?.onevone : md?.threevthree); }, mode);
}
async function runMode(mode: '1v1' | '3v3'): Promise<void> {
  const key = mode === '1v1' ? 'onevone' : 'threevthree';
  const browser = await chromium.launch({ executablePath: EXE, headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,820', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.addInitScript(initScript(SEED));
  const url = `${BASE}/dev/mode/${key}?${QS.replace(/^&/, '')}`;
  say(`${mode}: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  for (let i = 0; i < 240 && !(await seam(page, mode).catch(() => false)); i++) await sleep(500);
  if (!(await seam(page, mode))) { say(`${mode}: no dev seam — skipped`); await browser.close(); return; }
  say(`${mode}: ${await page.evaluate(LIB)}`);
  await page.evaluate((z) => { (window as any).__R.zoom = z; }, ZOOM);
  await page.evaluate(() => { (window as any).__R.tap(0, 80); });   // the first input hands the intro's frame to the play camera
  await sleep(2500);
  const tree = await page.evaluate(() => (window as any).__FEL_DEV__ ? 'ok' : 'no');
  for (const sc of SCENS) {
    if (!sc.modes.includes(mode) || !want(sc.id)) continue;
    const id = `${mode}-${sc.id}`;
    // a take a strip or a steal ruined before the move landed is thrown again (RETRY times): the reel is about the move
    let out: any = null, size = 0, flickAt = -1, t0 = 0;
    for (let attempt = 1; attempt <= RETRY; attempt++) {
      await page.evaluate(({ m, L }) => {
        const md = (window as any).__FEL_DEV__.scene.metadata; const S = m === '1v1' ? md.onevone : md.threevthree; const R = (window as any).__R;
        R.neutral(); S.offense(); if (typeof S.luck === 'function') S.luck(L);
      }, { m: mode, L: sc.luck ?? null });
      // the ball in my hands, the carry live (a rival's shot or loose ball still in the air can outlive one reset: ask again)
      for (let i = 0; i < 90; i++) {
        const ok = await page.evaluate((m) => { const md = (window as any).__FEL_DEV__.scene.metadata; const S = m === '1v1' ? md.onevone : md.threevthree; const c = S.carry(); return c.mine && c.active && (m !== '1v1' || S.possession() === 'mine'); }, mode);
        if (ok) break;
        if (i % 30 === 29) await page.evaluate((m) => { const md = (window as any).__FEL_DEV__.scene.metadata; (m === '1v1' ? md.onevone : md.threevthree).offense(); }, mode);
        await sleep(100);
      }
      await sleep(SETTLE_MS);
      await page.evaluate(({ label, title }) => { const R = (window as any).__R; R.label = label; R.scen = title; R.note = ''; R.sub = ''; R.recStart(); }, { label: LABEL, title: `${mode} · ${sc.title}` });
      t0 = await page.evaluate(() => performance.now());
      // the sampler: the ball's hand, the hero's root, the nearest defender
      await page.evaluate((m) => {
        const R = (window as any).__R; const md = (window as any).__FEL_DEV__.scene.metadata; const S = m === '1v1' ? md.onevone : md.threevthree;
        R.rows = []; R.sampling = true;
        R.sample = (now: number) => { const h = R.hero(); const p = h ? R.pos(h) : { x: 0, y: 0, z: 0 }; const fr = m === '1v1' ? S.foeRoot : S.nearestFoeRoot(); const f = fr ? R.pos(R.top(fr)) : null; const c = S.carry(); return { t: now, x: p.x, z: p.z, hand: c.hand, foe: f ? Math.hypot(f.x - p.x, f.z - p.z) : -1 }; };
      }, mode);
      flickAt = -1;
      for (const st of sc.steps) {
        if (st.at) await sleep(st.at);
        if ('ls' in st) await page.evaluate(({ m, ls, mag, tap }) => {
          const R = (window as any).__R; const md = (window as any).__FEL_DEV__.scene.metadata; const S = m === '1v1' ? md.onevone : md.threevthree;
          const h = R.hero(); const fr = m === '1v1' ? S.foeRoot : S.nearestFoeRoot(); if (!h || !fr || ls === 'none') { R.steer(0, 0, 0); return; }
          const p = R.pos(h), f = R.pos(R.top(fr)); let dx = f.x - p.x, dz = f.z - p.z;
          const n = Math.hypot(dx, dz) || 1; const b0 = R.basis();
        if (ls === 'foeR' || ls === 'foeL') { const sx = ls === 'foeR' ? 2 : -2; dx = dx / n + b0.r.x * sx; dz = dz / n + b0.r.z * sx; }   // toward him, mostly sideways: a reversal of the two reads dot −0.6 (the controller's < −0.4)
        else if (ls === 'side' || ls === 'backSide') { const h0 = R.hero(); const yaw = h0 ? h0.rotation.y : 0; const rx = Math.cos(yaw), rz = -Math.sin(yaw);   // the body's right
          dx = rx; dz = rz; if (ls === 'backSide') { dx -= Math.sin(yaw) * 0.8; dz -= Math.cos(yaw) * 0.8; } }   // across and BACK: the reverse pivot's read
        else if (ls === 'away') { dx = -dx; dz = -dz; } else if (ls === 'across') { const ax = (window as any).__PAD.axes[0]; const b = R.basis(); const sx = ax >= 0 ? -1 : 1; dx = b.r.x * sx + dx * 0.3; dz = b.r.z * sx + dz * 0.3; }
          R.steer(dx, dz, mag ?? 0.5); if (tap) R.lsTap(tap);
        }, { m: mode, ls: st.ls, mag: st.mag, tap: st.tap ?? 0 });
        else if ('rot' in st) await page.evaluate(({ m, sign, ms }) => {
          const R = (window as any).__R; const md = (window as any).__FEL_DEV__.scene.metadata; const S = m === '1v1' ? md.onevone : md.threevthree;
          const right = (S.carry().hand || 'Right') !== 'Left'; R.roll(right ? sign : -sign, ms, 220, right ? Math.PI : 0);   // from the off side, round over the top
        }, { m: mode, sign: st.rot, ms: st.ms ?? 240 });
        else if ('l1' in st) await page.evaluate((on) => (window as any).__R.btn(4, on), st.l1);
        else if ('rs' in st) await page.evaluate(({ m, dir, hold, RSm }) => {
          const R = (window as any).__R; const md = (window as any).__FEL_DEV__.scene.metadata; const S = m === '1v1' ? md.onevone : md.threevthree;
          const right = (S.carry().hand || 'Right') !== 'Left'; const [x, y] = RSm[dir]; const vx = right ? x : -x;
          if (hold) { R.rs(vx, y); setTimeout(() => R.rs(0, 0), hold); } else R.flick(vx, y, 90);
        }, { m: mode, dir: st.rs, hold: st.hold ?? 0, RSm: RS });
        else if ('r2' in st) await page.evaluate((on) => (window as any).__R.btn(7, on), st.r2);
        else if ('mark' in st) {
        flickAt = await page.evaluate(() => performance.now());
        // the strip: STRIP_N frames of the move view, STRIP_MS apart, from the flick (in-page timers, so node's latency is not in it)
        await page.evaluate(({ n, ms, d0 }) => { const R = (window as any).__R; R.strip = []; for (let i = 0; i < n; i++) setTimeout(() => { R.strip.push(R.comp.toDataURL('image/jpeg', 0.85)); }, d0 + i * ms); }, { n: STRIP_N, ms: sc.stripMs ?? STRIP_MS, d0: sc.stripDelay ?? 0 });
      }
        else if ('still' in st) await page.evaluate((n) => (window as any).__R.still(n), `${id}-${st.still}`);
      }
      await sleep(sc.tail);
      await page.evaluate((m) => { const R = (window as any).__R; R.neutral(); const md = (window as any).__FEL_DEV__.scene.metadata; const S = m === '1v1' ? md.onevone : md.threevthree; if (typeof S.luck === 'function') S.luck(null); }, mode);
      size = await page.evaluate(() => (window as any).__R.recStop());
      out = await page.evaluate(({ t0, flickAt, logRe }) => {
        const R = (window as any).__R; R.sampling = false;
        const rows = R.rows as { t: number; x: number; z: number; hand: string; foe: number }[];
        const at = (t: number) => rows.reduce((b, r) => (Math.abs(r.t - t) < Math.abs(b.t - t) ? r : b), rows[0]);
        const pre = flickAt > 0 ? rows.filter((r) => r.t < flickAt) : []; const f = pre.length ? pre[pre.length - 1] : flickAt > 0 ? at(flickAt) : null, e = rows[rows.length - 1];
        const after = flickAt > 0 ? rows.filter((r) => r.t >= flickAt && r.t <= flickAt + 900) : [];
        let travel = 0; for (let i = 1; i < after.length; i++) travel += Math.hypot(after[i].x - after[i - 1].x, after[i].z - after[i - 1].z);
        const hands = [...new Set(after.map((r) => r.hand))];
        // H2b, G7 (plan §4.8 — "root ≤ 0.5 m/s for ≥ 150 ms, then ≥ 3 m/s within 300 ms"): the root's speed over a 60 ms window, the
        // longest stretch at ≤ 0.5 m/s inside 900 ms of the flick, and the ms from that stretch's end to the first ≥ 3 m/s
        const spd: { t: number; v: number }[] = [];
        for (let i = 1, j = 0; i < after.length; i++) { while (j < i - 1 && after[i].t - after[j + 1].t >= 60) j++; const dt = (after[i].t - after[j].t) / 1000; if (dt > 0.03) spd.push({ t: after[i].t, v: Math.hypot(after[i].x - after[j].x, after[i].z - after[j].z) / dt }); }
        let hang = { ms: 0, end: -1 }, run0 = -1;
        for (const p of spd) { if (p.v <= 0.5) { if (run0 < 0) run0 = p.t; if (p.t - run0 > hang.ms) hang = { ms: p.t - run0, end: p.t }; } else run0 = -1; }
        const go = hang.end > 0 ? spd.find((p) => p.t > hang.end && p.v >= 3.0) : undefined;
        const g7 = { hangMs: Math.round(hang.ms), explodeMs: go ? Math.round(go.t - hang.end) : -1, minV: spd.length ? +Math.min(...spd.map((p) => p.v)).toFixed(2) : -1 };
        const stills = R.stills; R.stills = {}; const strip = R.strip ?? []; R.strip = [];
        return { b64: R.b64 as string, dur: R.recDur as number, log: R.logSince(t0, logRe).map((l: { t: number; m: string }) => `+${Math.round(l.t - t0)}ms ${l.m}`),
          handAtFlick: f?.hand ?? '', handEnd: e?.hand ?? '', handsAfter: hands, foeAtFlick: f ? +f.foe.toFixed(2) : -1, travel09: +travel.toFixed(2), g7, stills, strip, err: R.err };
      }, { t0, flickAt, logRe: LOG_RE });
      const fRel = flickAt > 0 ? flickAt - t0 : 0; const msOf = (l: string) => Number(/^\+(\d+)ms/.exec(l)?.[1] ?? 0);
      const landedRe = new RegExp(sc.landed ?? '-(STICK|HANDLE)\\]');
      const moved = out.log.some((l: string) => landedRe.test(l) && msOf(l) >= fRel - 20);
      const ruined = out.log.some((l: string) => /STRIP|STOLEN|stolen|steal by|lost it/i.test(l) && msOf(l) <= fRel + 500);   // a strip inside the move's half-second; one after it is the game
      if (moved && !ruined) break;
      say(`${id}: attempt ${attempt} ${!moved ? 'the move never landed' : 'a strip / steal inside the move'} — again`);
    }
    fs.writeFileSync(path.join(OUT, `${id}.webm`), Buffer.from(out.b64, 'base64'));
    for (const [n, d] of Object.entries(out.stills as Record<string, string>)) fs.writeFileSync(path.join(OUT, `${n}.png`), Buffer.from(d.split(',')[1], 'base64'));
    if (out.strip?.length) {
      const W = 384, H = 240, cols = 5, rows = Math.ceil(out.strip.length / cols);
      const tiles = await Promise.all(out.strip.map((d: string) => sharp(Buffer.from(d.split(',')[1], 'base64')).resize(W, H).toBuffer()));
      await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#0b0d12' } })
        .composite(tiles.map((b: Buffer, i: number) => ({ input: b, left: (i % cols) * W, top: Math.floor(i / cols) * H }))).png().toFile(path.join(OUT, `${id}-strip.png`));
    }
    const { b64: _b, stills: _s, strip: _st, ...rest } = out;
    meas[id] = { ...rest, bytes: size, title: sc.title, label: LABEL };
    fs.writeFileSync(MEAS, JSON.stringify({ ...meas, _meta: { label: LABEL, seed: SEED, base: BASE, qs: QS, updated: new Date().toISOString(), tree } }, null, 1));
    say(`${id}: ${(size / 1024).toFixed(0)} KB ${out.dur?.toFixed(1)} s · hand ${out.handAtFlick}→${out.handEnd} · foe ${out.foeAtFlick} m · travel ${out.travel09} m · G7 hang ${out.g7.hangMs} ms → 3 m/s in ${out.g7.explodeMs} ms`);
    for (const l of out.log.slice(0, Number(process.env.LOG_N ?? 8))) say(`   ${l}`);
  }
  await browser.close();
}

for (const m of MODES) await runMode(m as '1v1' | '3v3');
say(`done → ${OUT}`);
