// baseline — the movement-play BASELINE (phase 1, 2026-09-24): every synthetic stream replayed through TODAY's body
// mapper (lib/input/poseControl.ts, driven the way lib/input/poseSource.ts drives it), and the event sequence read
// through the first modes' input handling. lib/pose/baseline.ts holds the replay and the mode reads; this prints them.
//
//   node node_modules/tsx/dist/cli.mjs scripts/body/baseline.mts [--out <file>]
//
// Default out: ~/Claude/outbox/finish-release/movementplay/p1-baseline/BASELINE.md (outside the repo). Numbers only: no
// camera, no server, deterministic (the fixtures and the scripted ducks are seeded). Every figure in the report is
// computed here — rerun it after phase 3 and the same tables show the new mapper.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import * as bNs from '../../lib/pose/baseline.ts';
import * as pcNs from '../../lib/input/poseControl.ts';
import type { PoseFixture, GtJump } from '../../lib/pose/synth.ts';
import type { Replay, Emitted, ReplayOptions } from '../../lib/pose/baseline.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const B = unwrap(bNs);
const { T: THRESH, readBody } = unwrap(pcNs);

const FIX = join(process.cwd(), 'lib/pose/__fixtures__');
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : join(homedir(), 'Claude/outbox/finish-release/movementplay/p1-baseline/BASELINE.md');

const names: string[] = JSON.parse(readFileSync(join(FIX, 'index.json'), 'utf8')).map((f: { name: string }) => f.name);
const fixtures = new Map<string, PoseFixture>(names.map((n) => [n, JSON.parse(readFileSync(join(FIX, `${n}.json`), 'utf8')) as PoseFixture]));

// THE STAND. A take with an upright moment is calibrated on it. A take that never stands still uses its own tallest
// feet-down frame (a ready stance) — unless it is the owner's and his hips never reach his standing height in it (a
// run-up on bent knees): then it borrows his stand from stand_still, same body and camera, the card and then the move.
const still = fixtures.get('stand_still')!, ownerStandAt = B.uprightFrame(still), ownerStand = still.frames[ownerStandAt];
const ownerHipM = still.gt.perFrame.hipH[ownerStandAt];
const standOf = (n: string): { opt: ReplayOptions; label: string } => {
  const fx = fixtures.get(n)!, s = B.standFor(fx);
  if (s.upright) return { opt: { calibration: 'stand' }, label: `own, frame ${s.frame}` };
  const { contact, hipH } = fx.gt.perFrame;
  const tallest = Math.max(...hipH.filter((_, i) => contact[i][0] && contact[i][1]));
  if (fx.source.kind === 'deepmotion' && tallest < ownerHipM) return { opt: { calibration: 'stand', stand: ownerStand }, label: `the owner's (stand_still ${ownerStandAt}); the take never stands up` };
  return { opt: { calibration: 'stand' }, label: `own ready stance, frame ${s.frame}` };
};
const stand = new Map<string, Replay>(names.map((n) => [n, B.replay(fixtures.get(n)!, standOf(n).opt)]));
const shipped = new Map<string, Replay>(names.map((n) => [n, B.replay(fixtures.get(n)!, { calibration: 'asShipped' })]));

// ── formatting ───────────────────────────────────────────────────────────────────────────────────────────────────
const fin = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const sgn = (v: number | null | undefined, unit = '') => { if (!fin(v)) return '–'; const r = Math.round(v) || 0; return `${r >= 0 ? '+' : '−'}${Math.abs(r)}${unit}`; };
const f2 = (v: number | null | undefined) => (!fin(v) ? '–' : v < 0 ? `−${Math.abs(v).toFixed(2)}` : v.toFixed(2));
const pct = (v: number) => `${Math.round(v * 100)} %`;
const span = (v: number[], unit = '') => (!v.length ? '–' : Math.min(...v) === Math.max(...v) ? sgn(v[0], unit) : `${sgn(Math.min(...v))} … ${sgn(Math.max(...v), unit)}`);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const md: string[] = [];
/** Carried from §1 to the claims: the makes, and what they have in common (written from the data, not assumed). */
let madeSummary = { n: 0, list: '', accidental: false, lead: '', how: '' };
/** Carried from §1: menu presses the body made in the dunk approach, by kind. */
const approachMenus = new Map<string, number>();
/** Carried from §1: the attempts where R2 never rose, with why. */
let noRunTakes: string[] = [];
/** Carried from §1: attempts whose jump A the modes drop as the take-off's own (HOTFIX 2026-09-24), and of those, how many had no slam left. */
let echoSummary = { n: 0, attempts: 0, noSlam: 0, afterMs: [] as number[] };
/** Carried from §2: A (the 3v3 pass) against the real release, ms. */
let passVsRelease: number[] = [];
/** Carried from §3: what the punches pressed (stand calibration). */
let punchSummary = { punches: 0, asB: 0, asL1: 0, silent: [] as string[], kickR1: 0 };
const say = (...s: string[]) => md.push(...s, '');
const key: string[] = [];

// ── ground truth helpers ─────────────────────────────────────────────────────────────────────────────────────────
const biggest = (fx: PoseFixture) => fx.gt.jumps.reduce<GtJump | null>((b, j) => (!b || j.hipRiseM > b.hipRiseM ? j : b), null);
/** The jump an app-time instant leads into: the first whose landing is still ahead of it. */
const jumpAfter = (fx: PoseFixture, at: number) => fx.gt.jumps.find((j) => j.landing.t + 100 > at) ?? fx.gt.jumps[fx.gt.jumps.length - 1] ?? null;
/** The GT jump a camera frame (capture ms) belongs to: from 300 ms before its take-off to its landing. */
const jumpOfT = (fx: PoseFixture, t: number) => fx.gt.jumps.find((j) => t >= j.takeoff.t - 300 && t <= j.landing.t) ?? null;
const strikeIn = (fx: PoseFixture, j: GtJump) => fx.gt.wrist.find((w) => w.kind === 'strike' && w.at.t >= j.apex.t - 250 && w.at.t <= j.landing.t + 100) ?? null;
const releaseIn = (fx: PoseFixture, j: GtJump) => fx.gt.wrist.filter((w) => w.kind === 'release' && w.at.t >= j.takeoff.t - 100 && w.at.t <= j.apex.t + 50).pop() ?? null;
const jumpLabel = (fx: PoseFixture, j: GtJump | null) => (j ? `#${fx.gt.jumps.indexOf(j) + 1} (${j.feet === 2 ? '2-ft' : '1-ft'}, ${Math.round(j.hipRiseM * 100)} cm)` : '–');
const toInput = (f: PoseFixture['frames'][number]) => B.toPoseInput(f);

// camera geometry: image units → metres at the player's distance
const syn = still.settings.synth, cam = syn.camera;
const fxN = 0.5 / Math.tan((cam.hfovDeg * Math.PI) / 360);   // focal length in image widths
const ownerSw = stand.get('stand_still')!.cal!.shoulderW;
const ownerSwM = (ownerSw * cam.distance) / fxN;
/** A threshold in poseControl's shoulder widths, as metres of hip travel: the rise is in image HEIGHTS, the ruler in WIDTHS. */
const vertCm = (sw: number) => Math.round(sw * ownerSwM * (cam.height / cam.width) * 1000) / 10;
/** An image-height difference at the player's distance, in cm. */
const imgYcm = (dy: number) => (dy * cam.distance * (cam.height / cam.width)) / fxN * 100;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const tip = (() => { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
say(
  '# Movement play, phase 1: the baseline',
  `Today's body mapper replayed against the synthetic streams, 2026-09-24, lane \`wt-finish-release/FEL-full-app\` @ \`${tip}\` (working tree).`,
  'Measurement only: `lib/input/poseControl.ts` and every mode are unchanged.',
);
say(
  '## How it was measured',
  `- **Streams:** the ${names.length} fixtures in \`lib/pose/__fixtures__\`. They are ${syn.fps} fps, ${cam.width}×${cam.height}, ${cam.hfovDeg}° wide, with the camera ${cam.distance} m out at ${cam.heightM} m, noise, ${pct(syn.dropRate)} dropped frames, ${pct(syn.missRate)} missed detections and ${syn.latencyMs} ± ${syn.latencyJitterMs} ms of latency. Combat also gets three scripted ducks (10, 20 and 30 cm of hip drop) built on the synthesizer's rest body, because no capture has one.`,
  `- **The mapper is driven the way \`poseSource.ts\` drives it.** A ${B.RAF_HZ} Hz rAF loop sees the newest frame to have arrived. ${B.CALIBRATION_FRAMES} good ticks go to calibration, and the last tick's frame becomes the neutral. After that, \`read()\` runs on every tick with the image landmarks \`{x, y, visibility}\`.`,
  '- **Calibration, two ways:**',
  `  - **stand** (the primary numbers): the player obeys the card. A standing frame is held for 0.5 s before the take plays. It is the take's own upright moment when it has one, and otherwise its tallest frame with both feet down (a ready stance). One owner take never rises to his standing height, so it borrows his stand from \`stand_still\` (same body, same camera).`,
  '  - **as shipped**: no stand. The take\'s first 12 good ticks are used, which is what happens when a player moves as soon as the camera starts.',
  '- **Times** are app-clock ms: when the mode receives the event, minus the ground-truth instant. The ground truth is on the capture clock, so these times include the camera and inference latency, the rAF wait (≤ 17 ms) and the gate\'s own lag. "Capture" columns use the triggering frame\'s capture time instead.',
  '- **Mode reads** model each mode\'s `onInput` and clocks, with anchors, and take their constants from the pure modules (`lib/pose/baseline.ts`). The modes themselves were not run. The dunk is modelled as the player\'s turn, no prop, POWER style, TV factor 1 and Venice (no sky tier).',
  `- **Units.** poseControl measures in shoulder widths (sw) on the image\'s x axis, but its heights are on the y axis. At 4:3 that makes every vertical gate ¾ of its nominal size. For the owner at this camera (sw ${ownerSw.toFixed(3)} of the width ≈ ${Math.round(ownerSwM * 100)} cm):`,
  `  - \`jumpOn\` ${THRESH.jumpOn} sw ≈ **${vertCm(THRESH.jumpOn)} cm** of hip rise`,
  `  - \`squatStart\` ${THRESH.squatStart} sw ≈ **${vertCm(THRESH.squatStart)} cm** of hip drop (R2 starts)`,
  `  - R2 reaches 0.35 (Focus, turbo) at ${vertCm(THRESH.squatStart + 0.35 * (THRESH.squatFull - THRESH.squatStart))} cm`,
  `  - \`leanDead\` ${THRESH.leanDead} sw ≈ ${vertCm(THRESH.leanDead)} cm`,
);

// ── §0 the mapper on its own ─────────────────────────────────────────────────────────────────────────────────────
interface JumpStat { jumps: number; a: number; matched: number; missed: number; inFlight: number; stride: number; ground: number; lat: number[]; latCap: number[]; latFrames: number[] }
function jumpStats(fx: PoseFixture, r: Replay): JumpStat {
  const as = r.events.filter((x) => x.frame >= 0 && B.isPress(x, 'A'));
  const s: JumpStat = { jumps: fx.gt.jumps.length, a: as.length, matched: 0, missed: 0, inFlight: 0, stride: 0, ground: 0, lat: [], latCap: [], latFrames: [] };
  const used = new Set<Emitted>();
  for (const j of fx.gt.jumps) {
    const a = as.find((x) => !used.has(x) && x.t >= j.takeoff.t - 300 && x.t <= j.landing.t);
    if (!a) { s.missed++; continue; }
    used.add(a); s.matched++;
    s.lat.push(a.at - j.takeoff.t); s.latCap.push(a.t - j.takeoff.t); s.latFrames.push(a.frame - j.takeoff.frame);
  }
  for (const a of as) {
    if (used.has(a)) continue;
    if (fx.gt.jumps.some((j) => a.t >= j.takeoff.t && a.t <= j.landing.t)) s.inFlight++;
    else if (fx.gt.flights.some((j) => a.t >= j.takeoff.t - 100 && a.t <= j.landing.t + 100)) s.stride++;
    else s.ground++;
  }
  return s;
}
/** Frames with a body the mapper refuses (edge-on or a torso point below visibility 0.5), and how many are mid-jump. */
function dropped(fx: PoseFixture): { lost: number; inJump: number } {
  let lost = 0, inJump = 0;
  fx.frames.forEach((f, i) => {
    if (!f.present || readBody(toInput(f))) return;
    lost++;
    if (fx.gt.jumps.some((j) => i >= j.takeoff.frame && i < j.landing.frame)) inJump++;
  });
  return { lost, inJump };
}
{
  const rows: (string | number)[][] = [];
  let lat: number[] = [], cap: number[] = [], frames: number[] = [];
  const runStand = jumpStats(fixtures.get('run_in_place')!, stand.get('run_in_place')!), runShip = jumpStats(fixtures.get('run_in_place')!, shipped.get('run_in_place')!);
  for (const n of names) {
    const fx = fixtures.get(n)!, s = jumpStats(fx, stand.get(n)!), sh = jumpStats(fx, shipped.get(n)!), d = dropped(fx);
    lat = lat.concat(s.lat); cap = cap.concat(s.latCap); frames = frames.concat(s.latFrames);
    rows.push([n, s.jumps, fx.gt.flights.length, s.a, s.matched, s.missed, `${s.inFlight} / ${s.stride} / ${s.ground}`, span(s.lat, ' ms'), span(s.latFrames), `${d.lost} (${d.inJump})`, `${sh.a} / ${sh.a - sh.matched}`]);
  }
  const lostOneFoot = dropped(fixtures.get('dunk_elijah_one_foot')!);
  const near = frames.filter((f) => Math.abs(f) <= 2).length, late = lat.filter((_, i) => Math.abs(frames[i]) > 2);
  say('## 0. The mapper on its own',
    '### The jump gesture (A) as a take-off detector',
    'An A press matches a jump when its frame was captured between 300 ms before the take-off and the landing. Unmatched presses are split three ways. "In a flight" means a second press inside one jump, when the body left the frame and came back. "Stride" means a running stride. "Ground" means a hip rise with the feet down. "Flights" counts the times both feet left the floor without it being a jump. "Body dropped" counts frames with a body that `readBody` refuses, with the number inside a jump in brackets.',
    table(['fixture', 'jumps', 'flights', 'A presses', 'matched', 'missed', 'extra A: in a flight / stride / ground', 'A vs take-off (app ms)', 'A vs take-off (frames)', 'body dropped (in a jump)', 'as shipped: A / extra'], rows),
    `- **Timing.** A matched A arrives **${sgn(median(lat), ' ms')}** after the real take-off: the median on the app clock, where the camera and inference latency is most of it. On the capture clock it is ${sgn(median(cap), ' ms')}. The ${vertCm(THRESH.jumpOn)} cm hip gate fires within ±2 frames of the take-off frame for ${near} of ${frames.length} jumps.${late.length ? ` The exception is the one-foot dunk (${span(late, ' ms')}): it takes off edge-on to the camera, the body is dropped, and A only comes when it turns back.` : ''}`,
    `- **Running in place:** ${runStand.a} A with a stand calibration, and **${runShip.a} A in ${Math.round((fixtures.get('run_in_place')!.frames.at(-1)!.t) / 100) / 10} s as shipped** (calibrated mid-stride). The phase 2 gate is none.`,
    `- **The body is dropped mid-jump.** The one-foot dunk turns edge-on in the air: ${lostOneFoot.inJump} of its jump frames have a shoulder width ≤ 0.02 or a hidden torso point. \`readBody\` returns null, \`release()\` lets go of A mid-flight, and it is pressed again when the body comes back (map hoops §4.5).`,
  );
  key.push(`**The jump gesture (A)** reaches the bus a median ${sgn(median(lat), ' ms')} after the real take-off (${sgn(median(cap), ' ms')} on the capture clock); ${near} of ${frames.length} jumps are caught within ±2 frames. Running in place fires ${runStand.a} false A with a stand calibration and ${runShip.a} as shipped.`);
}
{
  const rows: (string | number)[][] = [];
  const restY: number[] = [], shares: number[] = [];
  let minY = Infinity;
  for (const n of names) {
    const r = stand.get(n)!, rest = B.restStick(r), st = B.stickYStats(r);
    if (rest) restY.push(rest.y);
    minY = Math.min(minY, st.min); shares.push(st.shareAtLevel);
    const xs = r.events.filter((x) => x.frame >= 0 && x.e.t === 'stick').map((x) => (x.e.t === 'stick' ? x.e.x : 0));
    rows.push([n, rest ? `(${f2(rest.x)}, ${f2(rest.y)})` : '–', pct(st.shareAtLevel), `${f2(st.min)} … ${f2(st.max)}`, xs.length ? `${f2(Math.min(...xs))} … ${f2(Math.max(...xs))}` : '0']);
  }
  say('### The L stick at rest',
    table(['fixture', 'rest stick (x, y) on the stand', 'share of the take at y ≥ 0.99', 'y range', 'x range'], rows),
    `- **Standing still reads as full back stick, y = ${f2(restY[0])}, in ${restY.filter((y) => y >= 0.99).length} of ${restY.length} takes.** The stick y is never below **${f2(minY)}** in any take, so the forward half of the stick is unreachable.`,
    '- The cause is in `poseControl.ts:218`: `y = −ramp(−drop, 0.18, 0.85) + ramp(drop, 0.18, 0.14)`. The second ramp runs backwards (0.18 down to 0.14), so it is 1 for any drop of 0.14 sw or less.',
    '  - Standing, the stick reads y = 1.',
    '  - Squatting 0.14–0.18 sw brings it down to 0.',
    '  - Rising only brings it down from 1 toward 0.',
  );
  key.push(`**The resting stick is (0.00, +1.00), full back, in ${restY.filter((y) => y >= 0.99).length}/${restY.length} takes.** y is never below ${f2(minY)}, so forward is unreachable, and it sits at y ≥ 0.99 for ${pct(Math.min(...shares))}–${pct(Math.max(...shares))} of each take.`);
}
{
  const rows: (string | number)[][] = [];
  const bad: string[] = [];
  for (const n of names) {
    const a = stand.get(n)!, s = shipped.get(n)!;
    const hip = a.cal && s.cal ? -imgYcm(s.cal.hipY - a.cal.hipY) : NaN;
    const ruler = a.cal && s.cal ? s.cal.shoulderW / a.cal.shoulderW - 1 : NaN;
    if (Math.abs(ruler) >= 0.3 || Math.abs(hip) >= 5) bad.push(`${n} (ruler ${sgn(ruler * 100, ' %')}, hips ${sgn(hip, ' cm')})`);
    rows.push([n, standOf(n).label, f2(a.cal?.shoulderW), s.calFrame, f2(s.cal?.shoulderW), sgn(hip, ' cm'), sgn(ruler * 100, ' %')]);
  }
  say('### Calibration',
    `The shipped calibration is one frame. It is taken ${B.CALIBRATION_FRAMES} rAF ticks (about 6 camera frames, ~200 ms) after the body first appears, with no stillness check and no floor line.`,
    table(['fixture', 'stand', 'stand sw', 'as shipped: frame', 'as shipped: sw', 'as shipped: hips vs the stand', 'as shipped: ruler error'], rows),
    `- In ${bad.length} of ${names.length} takes the shipped neutral is off by ≥ 30 % of the ruler or ≥ 5 cm of hip: ${bad.join('; ')}. Every threshold moves with the ruler, so a take that starts edge-on or mid-stride shrinks all of its gates.`,
  );
}

// ── §1 the dunk ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  const dunkNames = ['dunk_elijah_two_foot', 'dunk_elijah_one_foot', 'dunk_approach_two_foot', 'jump_two_foot_high', 'jump_one_foot_runup', 'jump_two_foot_low', 'jumpshot', 'jumpshot_dribble', 'run_in_place'];
  const rows: (string | number)[][] = [], shippedRows: (string | number)[][] = [];
  const agg = { attempts: 0, made: [] as string[], tooEarly: [] as number[], clips: [] as number[], launchCap: [] as number[], feetDown: 0, rLaunch: 0, openVsLand: [] as number[], taps: 0, noRun: [] as string[], makes: [] as { take: string; leadMs: number; verdict: string; taps: number }[], echoes: [] as number[], echoNoSlam: 0 };
  for (const n of dunkNames) {
    const fx = fixtures.get(n)!;
    for (const [label, r] of [['stand', stand.get(n)!], ['as shipped', shipped.get(n)!]] as const) {
      const d = B.dunkRead(r.events);
      // the dunk takes are judged against THE dunk (the biggest jump); a take of several jumps against the one the launch leads into
      const j = n.startsWith('dunk_') ? biggest(fx) : d.launch !== null ? jumpAfter(fx, d.launch) : fx.gt.jumps[0] ?? null;
      const zero = j ? j.takeoff.t : r.takeAt;
      const rel = (a: number | null | undefined) => (fin(a) ? a - zero : null);
      const aFrom = d.slam ? jumpOfT(fx, d.slam.t) : null;
      const strike = j ? strikeIn(fx, j) : null;
      const verdict = d.verdict === 'too early' ? `refused TOO EARLY — ${d.tooEarlyMs} ms`
        : d.verdict === 'no launch' ? 'no run' : d.verdict === 'no slam' ? (d.echo ? 'no slam: its only A was the take-off\'s' : 'no A in the flight') : `${d.verdict}, execution ${f2(d.execution)}`;
      const result = d.made ? '**MADE**' : d.verdict === 'no launch' ? '– (no attempt)' : `miss: ${d.missWhy === 'IRON' ? 'iron' : d.missWhy}`;
      const launchTxt = `${sgn(rel(d.launch))}${d.launchBy === 'the line (est.)' ? ' (the line, est.)' : ''}`;
      if (label === 'stand') {
        rows.push([n, j ? jumpLabel(fx, j) : '– (ms into the take)', sgn(rel(d.run)), f2(d.chargePeak), launchTxt, sgn(rel(d.launchT)),
          d.echo ? `${sgn(rel(d.echo.at))} (${d.echo.afterLaunchMs} ms after the launch)` : '–',
          d.slam ? (aFrom ? `${sgn(rel(d.slam.at))} (jump ${jumpLabel(fx, aFrom).split(' ')[0]})` : `${sgn(rel(d.slam.at))} (no jump)`) : '–',
          j && d.slam ? sgn(d.slam.at - j.apex.t) : '–', strike && d.slam ? sgn(d.slam.at - strike.at.t) : '–', f2(d.slam?.clip),
          j && d.windowOpen !== null ? sgn(d.windowOpen - j.landing.t) : '–', d.styleTaps, verdict, result]);
      } else shippedRows.push([n, launchTxt, sgn(rel(d.launchT)), d.echo ? sgn(rel(d.echo.at)) : '–', sgn(rel(d.slam?.at)), f2(d.slam?.clip), verdict, result]);
      if (label === 'stand') for (const nt of d.notes) {
        const m = /^(B: STYLE|X: PROP|Y: SELF-LOB|L1: CALL)/.exec(nt.what);
        if (m && (d.launch === null || nt.at < d.launch)) approachMenus.set(m[1], (approachMenus.get(m[1]) ?? 0) + 1);
      }
      if (d.verdict === 'no launch') {
        // why no run: the neutral taken low (nothing dips below it), or dips that never reach squatStart
        const a = stand.get(n)!.cal, c = r.cal, low = a && c && label !== 'stand' ? -imgYcm(c.hipY - a.hipY) : 0;
        agg.noRun.push(`${n} (${label}: ${low <= -5 ? `the neutral was taken ${Math.round(-low)} cm low` : `its dips stay under ${vertCm(THRESH.squatStart)} cm`})`);
        continue;
      }
      agg.attempts++;
      if (d.echo) { agg.echoes.push(d.echo.afterLaunchMs); if (!d.slam) agg.echoNoSlam++; }
      if (d.made) { agg.made.push(`${n} (${label})`); agg.makes.push({ take: `${n} (${label})`, leadMs: j ? j.takeoff.t - d.launchT : NaN, verdict: d.verdict, taps: d.styleTaps }); }
      else if (d.slam) agg.clips.push(d.slam.clip);
      if (d.tooEarlyMs !== null) agg.tooEarly.push(d.tooEarlyMs);
      if (d.styleTaps > 0) agg.taps++;
      if (d.launchBy === 'R2 released' && j) { agg.rLaunch++; agg.launchCap.push(d.launchT - j.takeoff.t); if (d.launchT < j.takeoff.t) agg.feetDown++; }
      if (j && d.windowOpen !== null && !d.made) agg.openVsLand.push(d.windowOpen - j.landing.t);
    }
  }
  const w0 = B.slamWindow(0);
  say('## 1. Dunk contest (DunkMode)',
    '**How the mode reads the body** (`DunkMode.ts`):',
    '- **The run:** R2 > 0.02 in the approach starts it (`:1435`, `beginRun :2984`).',
    '- **The launch:** R2 back to exactly 0 during the run launches (`:1439`, `launchDunk :2479`). An R2 held for about 0.9 s or more would reach the line and launch there (est.).',
    `- **The take-off's own A is not the slam** (HOTFIX 2026-09-24, \`core/slamPress\` TakeoffEcho). The A that launched, or one inside ${B.TAKEOFF_ECHO_MS} ms of the launch, is dropped as the take-off's. After a launch at the line, the first A inside ${B.LATE_JUMP_MS} ms is dropped as the jump pressed late. The keyboard's Space release is tagged by InputBus and dropped until the SLAM read is up. The body's R2 → 0 and its jump A are one jump, so the same rule applies to it.`,
    `- **The slam:** the first A in the flight that is left is the slam, committed (\`SlamLatch\` in \`core/slamPress\`: \`bufferSlam\`, the in-window press).`,
    `  - The window is ${f2(w0.openAt)}–${f2(w0.closeAt)} on the flight clock.`,
    `  - A press from ${f2(w0.openAt - w0.holdSec)} is held and fires when the window opens.`,
    '  - Anything earlier is refused "TOO EARLY — n ms BEFORE THE WINDOW" (`:1860`), and the attempt resolves as "THREW IT AT THE IRON TOO EARLY" (`:2594`).',
    `- **The flight clock** runs 1:1 to the rise, 0.4× for 400 ms, then 1:1 again. The window opens ${Math.round(B.realAt(w0.openAt) * 1000)} ms and closes ${Math.round(B.realAt(w0.closeAt) * 1000)} ms after the launch.`,
    '- **Other buttons in the air:**',
    '  - B after the rise is a style tap: the window shrinks 25 %.',
    '  - L1 is the backboard double-launch (flight clock 0.12–0.62) or the backboard swing (0.62–0.95). The swing is also a style tap.',
    '  - R1 is refused on Venice.',
    '',
    '**Stand calibration.** The dunk takes are measured against the dunk jump, and the others against the jump the launch leads into. Times are ms from that jump\'s take-off; negative means the feet are still down.',
    '- **Launch frame** is the capture time of the frame that launched.',
    `- **Take-off A** is an A the mode drops as the take-off's own (inside ${B.TAKEOFF_ECHO_MS} ms of the launch, or ${B.LATE_JUMP_MS} ms after a launch at the line).`,
    '- **A** is the first A in the flight the mode takes as the slam, labelled with the jump its frame belongs to.',
    table(['fixture', 'reference jump', 'run', 'charge', 'launch (app)', 'launch frame (capture)', 'take-off A (app, dropped)', 'A (app)', 'A vs apex', 'A vs strike', 'A flight clock', 'window opens vs landing', 'style taps', 'verdict', 'result'], rows),
    '**As shipped** (calibrated on the take\'s first frames):',
    table(['fixture', 'launch (app)', 'launch frame (capture)', 'take-off A (app, dropped)', 'A (app)', 'A flight clock', 'verdict', 'result'], shippedRows),
  );
  const madeTakes = [...new Set(agg.made.map((m) => m.split(' ')[0]))];
  noRunTakes = agg.noRun;
  // a make is an accident when its flight launched well before the real take-off (an approach bounce or dip)
  const leads = agg.makes.map((m) => m.leadMs).filter(fin), secs = (ms: number) => `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
  const lead = !leads.length ? '' : Math.min(...leads) === Math.max(...leads) ? secs(leads[0]) : `${secs(Math.min(...leads))}–${secs(Math.max(...leads))}`;
  const how = agg.makes.map((m) => `${m.take}: ${m.verdict === 'buffered' ? 'the early buffer' : 'in the window'}, ${m.taps} style tap${m.taps === 1 ? '' : 's'}`).join('; ');
  madeSummary = { n: agg.made.length, list: agg.made.join(', '), accidental: leads.length === agg.makes.length && leads.every((v) => v > 300), lead, how };
  const after = agg.launchCap.filter((v) => v >= 0);
  echoSummary = { n: agg.echoes.length, attempts: agg.attempts, noSlam: agg.echoNoSlam, afterMs: agg.echoes };
  const clipSpan = agg.clips.length ? `${f2(Math.min(...agg.clips))}–${f2(Math.max(...agg.clips))}` : '–';
  const earlySpan = agg.tooEarly.length ? `${Math.min(...agg.tooEarly)}–${Math.max(...agg.tooEarly)}` : '–';
  say(`- **${agg.attempts} attempts reached the flight** across ${dunkNames.length} takes and the two calibrations, and **${agg.made.length} were made**${madeTakes.length ? ` (${madeTakes.length === 1 ? 'one take' : `${madeTakes.length} takes`}: ${agg.made.join(', ')})` : ''}.${madeSummary.accidental ? ' Every make is an accident:' : ''}`,
    ...(madeSummary.accidental ? [
      `  - An approach bounce or dip launched the flight ${lead} before the real take-off.`,
      `  - The real jump's A then happened to land where the mode takes it (${how}).`,
      '  - So the avatar dunked before the player jumped.',
    ] : []),
    `- **Every other attempt missed.**${agg.echoes.length ? ` In ${agg.echoes.length} of them the jump's own A came ${span(agg.echoes, ' ms')} after the launch, inside the take-off echo, and was dropped (HOTFIX 2026-09-24); ${agg.echoNoSlam} of those had no A left to slam with.` : ''} The first A the mode took came at flight clock ${clipSpan}, against a window that opens at ${f2(w0.openAt)} (held from ${f2(w0.openAt - w0.holdSec)}). It was refused TOO EARLY by ${earlySpan} ms.`,
    `- **The launch.** Of the ${agg.rLaunch} launches that came from releasing R2, **${agg.feetDown} were triggered by a frame captured before the take-off**, with the feet still down; the range is ${span(agg.launchCap, ' ms')} on the capture clock. ${after.length ? `The other ${after.length} came ${span(after, ' ms')} after it${Math.max(...after) <= 34 ? ', within a frame' : ''}.` : ''}`,
    `- **The window** opens ${span(agg.openVsLand, ' ms')} from the real landing on the missed attempts. It is after the landing in ${agg.openVsLand.filter((v) => v > 0).length} of ${agg.openVsLand.length}; the rest had launched on an approach bounce, long before the jump.`,
    `- **Style taps.** In ${agg.taps} of ${agg.attempts} attempts a raised right hand (B) or an arm out (L1) in the air counts as a style tap, which shrinks the window.`,
    approachMenus.size ? `- **The approach menus change by accident** (stand calibration, before the launch): ${[...approachMenus].map(([k, v]) => `${k} ×${v}`).join(', ')}. A raised hand or arms out cycle the style or the prop, throw the self-lob, or cycle the call.` : '',
    agg.noRun.length ? `- **No run at all** in ${agg.noRun.join('; ')}. R2 never rises, so every A lands in the approach and is refused "SLAM AT THE TOP OF THE JUMP".` : '',
  );
  key.push(`**Dunk:** ${agg.attempts} attempts reached the flight, and ${agg.made.length} were made. ${madeTakes.length ? `The makes (${agg.made.join(', ')}) ${madeSummary.accidental ? `are all accidents: the flight launched on an approach bounce or dip ${lead} before the real take-off` : 'are in §1'}. ` : ''}Every other attempt missed. ${agg.feetDown} of ${agg.rLaunch} launches were triggered by a frame with the feet still down (capture ${span(agg.launchCap, ' ms')} from the take-off). ${agg.echoes.length ? `In ${agg.echoes.length} attempts the jump's own A was inside the take-off echo and dropped (${agg.echoNoSlam} left no slam at all). ` : ''}The first A the mode took landed at flight clock ${clipSpan} against a window that opens at ${f2(w0.openAt)}, so it was refused TOO EARLY by ${earlySpan} ms. The window opened after the real landing in ${agg.openVsLand.filter((v) => v > 0).length} of the ${agg.openVsLand.length} misses (up to ${sgn(Math.max(...agg.openVsLand), ' ms')}).`);

  // the duel
  const drows: (string | number)[][] = [];
  const duelHits: string[] = [];
  for (const n of dunkNames) {
    const fx = fixtures.get(n)!, r = stand.get(n)!, d = B.duelRead(r.events);
    const j = n.startsWith('dunk_') ? biggest(fx) : d.launch !== null ? jumpAfter(fx, d.launch) : null;
    const hitAt = d.presses.findIndex((p) => p.kind === 'clean' || p.kind === 'early');
    if (d.hit && j && d.launch !== null) duelHits.push(`${n}: press ${hitAt + 1} of the flight, ${sgn(d.presses[hitAt].at - j.takeoff.t, ' ms')} from the take-off, in a flight launched ${sgn(d.launch - j.takeoff.t, ' ms')} from it`);
    drows.push([n, j && d.launch !== null ? sgn(d.launch - j.takeoff.t) : '–', d.presses.map((p) => `${f2(p.clip)} ${p.kind}`).join(', ') || '–', d.launch === null ? '– (no run)' : d.hit ? `**hit** ${f2(d.accuracy)}` : d.tooEarlyMs !== null ? `miss (TOO EARLY — ${d.tooEarlyMs} ms)` : 'miss']);
  }
  say('### Dunk Duel (DunkDuelMode)',
    `The run and launch work the same way, and A on the run takes off as in the contest (HOTFIX 2026-09-24: the duel's hint said "tap jump" and A never jumped; \`DunkDuelMode.ts:671-693\`). The flight's A first passes the take-off echo (the A that launched, one inside ${B.TAKEOFF_ECHO_MS} ms of the launch, the jump pressed late after the line, or the keyboard Space's own before the grace, is dropped: "echo"), then goes to ONE \`FirstPress\` (HOTFIX 2026-09-24): the window is ${f2(w0.openAt)}–${f2(w0.closeAt)}, with grace back to ${f2(B.DUEL_EARLIEST_CLIP)}. The first press is the verdict; one too early for the grace waits and is refused TOO EARLY when the window opens, and every A after the first is spent. Stand calibration:`,
    table(['fixture', 'launch vs take-off', 'A presses in the flight (flight clock, verdict)', 'result'], drows),
    duelHits.length ? `- **The duel scores ${duelHits.length} hit${duelHits.length === 1 ? '' : 's'}:**` : '- **The duel scores no hits.** The late re-presses that used to score after a too-early first A are spent now: the first press decides.',
    ...duelHits.map((h) => `  - ${h}.`),
  );
}

// ── §2 hoops ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const rows3: (string | number)[][] = [], rows1: (string | number)[][] = [], facts: string[] = [];
  const agg = { squares: 0, pumps: 0, yAt: [] as number[], yTakes: [] as string[], aVsRelease: [] as number[], turboOn: [] as number[], turboOff: [] as number[] };
  for (const n of ['jumpshot', 'jumpshot_dribble']) {
    const fx = fixtures.get(n)!, j = fx.gt.jumps[0], rel = (a: number) => a - j.takeoff.t;
    const release = releaseIn(fx, j);
    facts.push(`- **${n}:** take-off at ${Math.round(j.takeoff.t)} ms (capture), apex ${sgn(j.apex.t - j.takeoff.t)} ms, landing ${sgn(j.landing.t - j.takeoff.t)} ms, the release of the shooting hand ${release ? `${sgn(release.at.t - j.takeoff.t)} ms (${release.hand})` : '–'}.`);
    for (const [label, r] of [['stand', stand.get(n)!], ['as shipped', shipped.get(n)!]] as const) {
      const s = B.shotRead(r.events, r.takeAt), t3 = s.threePt;
      rows3.push([`${n} (${label})`, t3 ? t3.btn : '–', t3 ? sgn(rel(t3.at)) : '–', t3 && release ? sgn(t3.at - release.at.t) : '–', t3 ? f2(t3.charge) : '–', t3 ? pct(t3.pMake) : '–']);
      const iv = (v: [number, number][]) => v.map(([a, b]) => `${sgn(rel(a))} … ${fin(b) ? sgn(rel(b)) : 'end'}`).join(', ') || '–';
      rows1.push([`${n} (${label})`, iv(s.turbo), s.square.map((q) => `${sgn(rel(q.down))}, held ${Math.round(q.heldMs)} ms → ${q.read}`).join('; ') || '**never**',
        s.pass.map((a) => sgn(rel(a))).join(', ') || '–', s.block.map((a) => sgn(rel(a))).join(', ') || '–', s.screen.map((a) => sgn(rel(a))).join(', ') || '–', iv(s.brace), iv(s.glass)]);
      if (label === 'stand') {
        agg.squares += s.square.length; agg.pumps += s.square.filter((q) => q.read === 'pump fake').length;
        const y = s.block.find((a) => Math.abs(rel(a)) < 400); if (fin(y)) { agg.yAt.push(rel(y)); agg.yTakes.push(n); }
        const a = s.pass.find((p) => rel(p) > -100); if (fin(a) && release) agg.aVsRelease.push(a - release.at.t);
        const tb = s.turbo.find(([on, off]) => rel(on) < 0 && (!fin(off) || rel(off) > -150)); if (tb) { agg.turboOn.push(rel(tb[0])); agg.turboOff.push(rel(tb[1])); }
      }
    }
  }
  const band = (f: number) => Math.round(f * B.BAR_PERIOD_SEC * 1000);
  say('## 2. Hoops shooting',
    'Two real jump shots: CMU 124_05, and 06_15 off the dribble. Times are ms from the take-off.',
    ...facts,
    '',
    '### 3PT (ThreePointMode)',
    `The first of A, B or X fires the shot (\`ThreePointMode.ts:911\`). It is graded by where a ${Math.round(B.BAR_PERIOD_SEC * 1000)} ms sawtooth bar sits at the press, and each rack starts the bar at a random phase. So the make chance is just the bands' share of the bar: perfect ±${band(B.THREE_PT_BANDS.perfect)} ms, good ±${band(B.THREE_PT_BANDS.good)} ms.`,
    table(['stream', 'fires on', 'at', 'vs the real release', 'R2 charge', 'expected make'], rows3),
    '### 1v1 / 3v3 (LocalInputSource, `PlayerSlot.ts:118-199`)',
    `What each input does:`,
    `- R2 > ${B.TURBO_LEVEL} is the turbo.`,
    `- X held and released is the shot. A release under ${B.PUMP_MAX_MS} ms is a pump fake; the green on an open set jumper is ${B.SET_JUMPER_GREEN.atMs} ± ${B.SET_JUMPER_GREEN.goodMs} ms.`,
    '- A is the 3v3 pass.',
    '- Y is the block. On offence it is refused: "BLOCK IS FOR DEFENSE".',
    '- B is the screen call, L1 the brace or post-up, and R1 glass.',
    table(['stream', 'turbo (R2 > 0.35)', 'Square (the shot)', 'A = pass', 'Y = block', 'B = screen', 'L1 = brace', 'R1 = glass'], rows1),
    '- **The resting stick is y = +1**, which the court reads as `moveY = −1`: a full back-pedal from the moment the controller goes live.',
    '- Until the first trigger event, the stick\'s magnitude also counts as the sprint (`PlayerSlot.ts:201`), so the player sprints backwards until they first dip.',
  );
  passVsRelease = agg.aVsRelease;
  key.push(`**Hoops:** a real jump shot never holds Square (X), so the shot never starts in 1v1/3v3. ${agg.squares ? `The only X presses were ${agg.squares} dribble-hand taps, all pump fakes. ` : ''}The set point fires Y (both hands up) in ${agg.yTakes.join(', ') || 'neither take'} (${span(agg.yAt, ' ms')} from the take-off), which offence refuses as "BLOCK IS FOR DEFENSE". The dip holds the turbo from ${span(agg.turboOn)} to ${span(agg.turboOff, ' ms')}. The jump sends A, the 3v3 PASS, ${span(agg.aVsRelease, ' ms')} from the real release. In 3PT, whichever of A, B or X comes first fires against a random-phase bar, for about 25 % expected make whatever the body does.`);
}

// ── §3 combat ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const fx = fixtures.get('punch_kick')!;
  const rows: (string | number)[][] = [];
  const acts = [...fx.gt.wrist.filter((w) => w.kind === 'punch').map((w) => ({ what: `${w.hand} punch`, at: w.at.t, punch: true })),
    ...fx.gt.kicks.map((k) => ({ what: `${k.side} kick`, at: k.at.t, punch: false }))].sort((a, b) => a.at - b.at);
  const agg = { punches: 0, asB: 0, asA: 0, asL1: 0, kickR1: 0 };
  for (const a of acts) {
    for (const [label, r] of [['stand', stand.get('punch_kick')!], ['as shipped', shipped.get('punch_kick')!]] as const) {
      const ar = B.actRead(r.events, a.at);
      const verbs = (m: 'vs' | 'hundred' | 'showdown') => ar.presses.map((p) => B.COMBAT_VERBS[p.btn][m]).join(' + ') || '–';
      rows.push([`${a.what} at ${Math.round(a.at)} ms (${label})`, ar.presses.map((p) => `${p.btn} ${sgn(p.dt)}`).join(', ') || 'nothing', ar.heldAt.join(', ') || '–',
        ar.xReleases.map((h) => `${Math.round(h)} ms (${h < 180 ? 'dash' : 'guard'})`).join(', ') || '–', verbs('vs'), verbs('hundred'), verbs('showdown'), ar.focus ? 'yes' : 'no']);
      if (label !== 'stand') continue;
      const btns = ar.presses.map((p) => p.btn);
      if (a.punch) {
        agg.punches++; if (btns.includes('B')) agg.asB++; if (btns.includes('A')) agg.asA++; if (btns.includes('L1')) agg.asL1++;
        if (!btns.length) punchSummary.silent.push(`the ${a.what}${ar.heldAt.length ? ` (${ar.heldAt.join(', ')} already held)` : ''}`);
      }
      else if (btns.includes('R1')) agg.kickR1++;
    }
  }
  const drows: (string | number)[][] = [];
  const duck: { cm: number; spans: number; heldMs: number }[] = [];
  for (const d of [0.1, 0.2, 0.3]) {
    const { fx: dfx, downAt, bottomAt } = B.duckFixture(d);
    const r = B.replay(dfx, { calibration: 'stand' });
    const ar = B.actRead(r.events, bottomAt, 300, 700);
    const focus = B.triggerAbove(r.events, B.FOCUS_LEVEL).filter(([a]) => a >= downAt - 100);
    const heldMs = focus.reduce((s, [a, b]) => s + ((fin(b) ? b : a) - a), 0);
    duck.push({ cm: Math.round(d * 100), spans: focus.length, heldMs });
    drows.push([`${Math.round(d * 100)} cm`, f2(ar.triggerPeak), focus.length, `${Math.round(heldMs)} ms`, focus.length ? sgn(focus[0][0] - downAt, ' ms') : '–', ar.presses.map((p) => p.btn).join(', ') || 'none']);
  }
  say('## 3. Combat',
    `One capture, CMU 141_14 "Punch and Kick": 3 punches and 1 kick. Each act is read from 150 ms before its ground-truth peak to 300 ms after. "Held" lists buttons already down when the act began. R2 > ${B.FOCUS_LEVEL} is Matrix Focus in every mode. Where the verbs come from:`,
    '- VS / Mixed: `KarateVSMode.ts:678-725` and `MixedCombatMode.ts:727-831`',
    '- The Hundred: `KarateEndlessMode.ts:1571-1610`',
    '- Showdown: `ShowdownMode.ts:426-483`',
    '',
    table(['act', 'bus events (ms vs the peak)', 'held', 'X released', 'VS / Mixed', 'the Hundred', 'Showdown', 'Focus'], rows),
    '- **The guard is read as raised hands.** Fists at the chin put the wrists above the shoulders, so the guard holds B (right) or X (left) through the exchange.',
    '### A duck',
    'Scripted on the rest body: the hips drop over 0.2 s, hold for 0.3 s and rise over 0.2 s.',
    table(['hip drop', 'R2 peak', 'Focus spans', 'Focus held', 'Focus on (vs the start of the drop)', 'buttons'], drows),
  );
  Object.assign(punchSummary, { punches: agg.punches, asB: agg.asB, asL1: agg.asL1, kickR1: agg.kickR1 });
  const d10 = duck[0], d20 = duck[1];
  key.push(`**Combat:** ${agg.asB} of ${agg.punches} real punches press B (a right hand up at head height), which is a KICK in VS, Mixed and Showdown. ${agg.asL1} presses L1 (arm out), which is a roll, a jump or grab, or a chakra dash, and ${agg.asA} press A (the jab). The guard holds X or B through the exchange. ${agg.kickR1 ? 'The kick presses R1: a jump, a chi burst or a substitution.' : ''} A ${d10.cm} cm duck turns Matrix Focus on and off ${d10.spans} times; a ${d20.cm} cm duck holds it for ${Math.round(d20.heldMs)} ms.`);
}

// ── §4 boards and racing ─────────────────────────────────────────────────────────────────────────────────────────
{
  const rest = B.restStick(stand.get('stand_still')!)!;
  const shuffle = stand.get('shuffle_lateral')!, xs = shuffle.events.filter((x) => x.frame >= 0 && x.e.t === 'stick').map((x) => (x.e.t === 'stick' ? x.e.x : 0));
  const low = jumpStats(fixtures.get('jump_two_foot_low')!, stand.get('jump_two_foot_low')!);
  say('## 4. Boards and racing',
    `The resting stick is **(${f2(rest.x)}, ${f2(rest.y)})** on every take (§0). This is what each mode does with it while the player stands still:`,
    table(['mode', 'reads L stick y as', 'standing still gives', 'anchor'], [
      ['Skateboard', 'drive = −y. Above 0.3 it auto-pushes; below −0.3 it brakes at 7 m/s²', 'drive −1: it **brakes forever**, and auto-push can never fire (y is never below 0)', '`SkateRunMode.ts:508`, `BoardMovement.ts:230,242`'],
      ['Skateboard tricks', 'the held direction (`heldTrickDir`)', 'every trick reads as **down**', '`BoardTricks.ts:254-257`'],
      ['Snowboard, Kart', 'trick direction only', 'every trick reads as **down**', '`SnowboardSlalomMode.ts:256`, `VelocityKartMode.ts:1028`'],
      ['Surf', 'y > 0.2 climbs the face', 'relTarget −2.4 × pace: **climbs the face forever**', '`SurfBreakMode.ts:456`'],
      ['Aero Aces', 'climb = y', '**full climb**, pitch target +0.55 rad', '`AeroAcesMode.ts:399`'],
      ['Free Run', '`stickWorldLatched(x, y)`, i.e. −forward × y', '**sprints at the camera** at \\|stick\\| × 6.4 m/s', '`FreeRunMode.ts:597,740`, `CameraDirector.ts:371-375`'],
      ['Sprint, Big Air run-up', 'alternating d-pad L/R', 'unplayable: the body never sends the d-pad', 'MAP boards §0.4'],
    ]),
    `- **The lean works on x.** The lateral shuffle drives stick x across ${f2(Math.min(...xs))} … ${f2(Math.max(...xs))}. Its y still sits at 1 for ${pct(B.stickYStats(shuffle).shareAtLevel)} of the take.`,
    `- **A hop is A** (${sgn(median(low.lat), ' ms')} after the take-off on the low jumps). That is an ollie in skate, a jump in snow, **an item fired** in the kart (\`VelocityKartMode.ts:1037\`) and in aero, and a vault or jump in Free Run.`,
    `- **A squat is R2.** That is the skate crouch, the snow tuck, the **throttle** in the kart and in aero, and a Free Run sprint above 0.5.`,
  );
  key.push('**Boards and racing:** standing still, the skater brakes forever, the plane climbs forever, the surfer climbs the face forever and the Free Runner sprints at the camera at 6.4 m/s. Every board and kart trick reads as "down". The kart and the plane only throttle while the player squats.');
}

// ── §5 the map's claims ──────────────────────────────────────────────────────────────────────────────────────────
say('## 5. The map\'s claims against the numbers',
  '### Confirmed',
  `- **Dunk (map dunk §0.1).** The dip turns R2 on and starts the run. Rising out of it sends R2 to 0 and launches, with the feet down or within a frame of the take-off. The hips then cross \`jumpOn\` and send A into the flight. Inside ${B.TAKEOFF_ECHO_MS} ms of the launch that A is the take-off's own and the modes drop it (${echoSummary.n} of ${echoSummary.attempts} attempts; ${echoSummary.noSlam} of them then had no slam at all); later, it is buffered and refused TOO EARLY, and any later A is ignored because the first press decides. **Every attempt launched by the jump\'s own dip missed** (§1).`,
  '- **Dunk style taps (map dunk §0.1).** A raised right hand in the air is a style tap that shrinks the window. Arms out (L1) are a new case: they fire the backboard double-launch, or the backboard swing, which is another style tap.',
  '- **Dunk flight (map dunk §0.2).** The game\'s flight outlasts the body: the window opens after the real landing, so the body cannot react to NOW!.',
  `- **Hoops (map hoops §4.1, §4.3, §4.4).** The dip holds the turbo. The jump is A, the 3v3 pass, and it fires ${span(passVsRelease, ' ms')} from the real release. 3PT fires on whichever of A/B/X comes first, against a random-phase bar.`,
  '- **Hoops edge-on (map hoops §4.5, the plan).** An edge-on body is dropped and everything is released: the one-foot dunk lets go of A in the air (§0).',
  '- **Combat (map combat §4).** A raised right hand is the kick, a real punch never presses the jab, and a duck turns Matrix Focus on.',
  '- **Boards (map boards §0.1).** Standing still is full back stick, and y never goes below 0.',
  '- **Calibration (map pose §5).** It is one frame, taken about 200 ms after the body appears, with no stillness check.',
  '### Refuted or refined',
  '- **Hoops §4.2, "a real shot releases at the set point (X)": refuted on these streams.** Both hands rise together at the set point, and that is Y (the block). Square is never held, so **the shot never starts** in 1v1/3v3. X shows up only as dribble-hand taps, and those are pump fakes.',
  `- **The jump gate is about ${vertCm(THRESH.jumpOn)} cm of hip rise, not about 6 cm** (map boards §0.5, pose §3). The ruler and the rise are in different image units.`,
  !madeSummary.n ? '- **"Every body dunk misses" (the plan): confirmed** on every take and both calibrations.'
    : madeSummary.accidental ? `- **"Every body dunk misses" (the plan): almost.** The only makes (${madeSummary.list}) are accidents. The flight launched on an approach bounce or dip ${madeSummary.lead} before the real take-off, and the jump's A then fell where the mode takes it (${madeSummary.how}). The avatar dunked before the player jumped. That is not the dunk working.`
    : `- **"Every body dunk misses" (the plan): refuted.** Made: ${madeSummary.list} (${madeSummary.how}); see §1.`,
  '- **Combat, "raising and dropping the left hand inside 0.18 s dashes": not seen.** The left guard stays up far longer than 0.18 s, so it reads as the guard, not a dash.',
  `- **Combat, "a real punch reads as arm out → R1": refined.** ${punchSummary.asL1 ? `${punchSummary.asL1} of ${punchSummary.punches} punches reach \`reachOn\` (L1)` : `No punch reaches \`reachOn\` (L1, the wrist ${THRESH.reachOn} sw out from its shoulder)`}; ${punchSummary.asB} read as a raised hand (B)${punchSummary.silent.length ? `, and ${punchSummary.silent.join(' and ')} presses nothing` : ''}.${punchSummary.kickR1 ? ' R1 comes from the arm swinging out on the kick.' : ''}`,
  '### New',
  ...(noRunTakes.length ? [`- **A neutral taken low starts no dunk at all**: ${noRunTakes.join('; ')}. Nothing dips ${vertCm(THRESH.squatStart)} cm below it, so R2 never rises and every A is refused "SLAM AT THE TOP OF THE JUMP".`] : []),
  '- **Running in place starts the dunk run on the first bounce that dips far enough, and launches as it comes up**, with no jump at all (run_in_place).',
  '- **The approach menus change by accident** (§1): a raised hand or arms out cycle STYLE (B) or PROP (X), throw the SELF-LOB (Y), or cycle the CALL (L1).',
  '- **The Dunk Duel judged every A in the flight, not only the first**, so a late re-press could score: the owner\'s two-foot dunk "hit" on a re-press after the landing, when the body came back into view. **Fixed in code, not yet seen in a browser (HOTFIX 2026-09-24):** one `FirstPress`, the first press decides, as in the contest (§1, Dunk Duel). Proven on the pure cores and the real InputBus in unit tests; the live /dev/mode dunkduel check has not been run.',
  '- **Pad-path bug**: A on the run launched (`DunkMode.ts:1312`), and the same event then reached `airButton` (`:1360`), which buffered it as the slam at flight clock 0, refused TOO EARLY. The keyboard had the same bug from its Space release (R 0 launches, then an A). **Fixed in code, not yet seen in a browser (HOTFIX 2026-09-24):** `core/slamPress` TakeoffEcho drops the take-off\'s own A in both dunk modes. Proven on the pure cores and the real InputBus in unit tests; the live /dev/mode dunk and dunkduel checks (keyboard and pad) have not been run.',
);
say('## 6. Limits of this baseline',
  '- **The mode reads are models of `onInput` and the flight clock, not the running modes.** Frame quantisation, the gather stride, props and the harness are not modelled. The auto-launch at the line uses an estimated 0.9 s floor; only the rows marked "the line" reached it.',
  '- **Fixture limits**, from the fixture build:',
  '  - The DeepMotion dunks are 0.75–1.0 m jumps, bigger than a living room allows. At the default camera the head and hands leave the top of the frame at the apex.',
  '  - The one-foot dunk is edge-on to the camera through its flight and faces away after landing.',
  '  - The jump shots start edge-on.',
  '  - No capture has a duck (it is scripted), a sustained straight run, a lean or a wing pose.',
  '- **The owner\'s takes come from separate DeepMotion solves**, which place his hips a few centimetres apart. That is the same size as the mapper\'s 3.6–4.1 cm gates. The borrowed stand (see §0, Calibration) inherits the difference.',
);
say('## Reproduce',
  '```',
  'PATH=/opt/homebrew/Cellar/node/26.8.2/bin:$PATH node node_modules/tsx/dist/cli.mjs scripts/body/baseline.mts',
  'PATH=/opt/homebrew/Cellar/node/26.8.2/bin:$PATH node node_modules/vitest/vitest.mjs run lib/pose/baseline.test.ts',
  '```',
  'The files:',
  '- `lib/pose/baseline.ts`: the replay and the mode reads.',
  '- `scripts/body/baseline.mts`: this report.',
  '- `lib/pose/baseline.test.ts`: the two KNOWN-BAD facts, pinned for phase 3 to flip.',
);

// the key numbers go first, after the title block
md.splice(md.indexOf('## How it was measured'), 0, '## Key numbers', ...key.map((k) => `- ${k}`), '');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'));
console.log(key.map((k) => `- ${k}`).join('\n'));
console.error(`\n[baseline] wrote ${OUT}`);
