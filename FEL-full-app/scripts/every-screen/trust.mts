// scripts/every-screen/trust.mts — EVERY-SCREEN P4 (2026-11-11): "Numbers you can trust". For each tool that shows a
// measured number, how far it lands from the truth and how much the same performance read again moves, measured by
// the code a phone runs, on the fixtures the repository holds — and written to lib/results/trust.json, which every
// result card, the jump check's result and My progress read for their "how sure" line (lib/results/trust.ts).
//
//   jump      RECORDED: the owner's and CMU's motion-captured jumps (lib/pose/__fixtures__, each jump's true height from
//             its 3-D flight), filmed through the app's camera model and read by the live jump check's reader (T5,
//             lib/assess/graders/t5-cmj.ts). Repeats: each take read again from five different start frames, so the
//             standing calibration and every frame boundary move — the spread is what a re-read of the same jump does.
//   quick screen SYNTHETIC (no recorded take of its four moves with a key exists yet): the live Quick Screen flow on
//             lib/screen-easy/sim.ts's clean mover, eight seeds: the same colour each time, the angles' spread.
//   mirror screen RECORDED: the Mirror's landmark fixtures (lib/mirror/fixtures: clean stands, single-leg, seated rotation,
//             each with its key from the 3-D joints) through the real screen runner, ten times with the camera's noise
//             and frame jitter at ten seeds. The score's spread across those ten, and every flag the key does not hold.
//   sprint    SYNTHETIC (no recorded sprint exists yet): scripts/sprint-accuracy.ts's stick-figure sprinters at 60 fps.
//   bar speed SYNTHETIC (no recorded set exists yet): lib/vbt/bench.ts's generated bar paths, back squat at the plate,
//             60 fps (the T1 bench of lib/vbt/bench.test.ts).
//
// A SYNTHETIC entry says so on screen: it bounds the maths and the camera model, not a real phone.
//
//   npx tsx scripts/every-screen/trust.mts            → prints the table, writes lib/results/trust.json
//   npx tsx scripts/every-screen/trust.mts --check    → exits 1 if trust.json differs from a fresh measurement
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (p: string): Promise<any> => { const m = await import(p); return { ...(m.default ?? {}), ...m }; };
const { gradeT5 } = await load('@/lib/assess/graders/t5-cmj');
const { calibrateFront } = await load('@/lib/assess/calibration');
const { filmFixture } = await load('@/lib/mirror/fixtures/build');
const { adapterFromPose } = await load('@/lib/mirror/fixtures/index');
const { runScreen, stationFixture } = await load('@/lib/mirror/fixtures/measure');
const { simulateFullScreen } = await load('@/lib/screen-easy/sim');
const { filmSet } = await load('@/lib/vbt/bench');
const { LIFTS } = await load('@/lib/vbt/lifts');
const { readSet } = await load('@/lib/vbt/reps');
const { trackOf } = await load('@/lib/vbt/track');

const ROOT = process.cwd();
const OUT = join(ROOT, 'lib/results/trust.json');
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

// ── jump: the live jump check's reader on the recorded takes ─────────────────────────────────────────────────────
/** The standing two-foot takes (the jump check's protocol: stand, dip, jump, land). The run-up and the dunks are other
 *  readers' (the approach jump) and are not mixed in. */
const JUMP_TAKES = ['jump_two_foot_low', 'jump_two_foot_high'];
/** Repeats: the same take with a second, independent draw of the pose model's own jitter (lib/pose/synth.ts
 *  DEFAULT_NOISE: 0.002 of the picture's width on the face and torso, 0.004 on the limbs) — the recording already carries
 *  one draw, so this is a cautious "filmed again". Seed 0 is the take as recorded. */
const REPEATS = Array.from({ length: 11 }, (_, i) => i);
const TORSO = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 24]);
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r: () => number) { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
type Frame = { t: number; present: boolean; image: { x: number; y: number; z: number; v: number }[] };
function refilm(frames: Frame[], seed: number): Frame[] {
  if (!seed) return frames;
  const r = rng(seed * 7919);
  return frames.map((f) => (!f.present ? f : { ...f, image: f.image.map((l, i) => { const s = TORSO.has(i) ? 0.002 : 0.004; return { ...l, x: l.x + gauss(r) * s, y: l.y + gauss(r) * s * (4 / 3) }; }) }));
}
interface JumpRead { take: string; jump: number; truthCm: number; readCm: number }
const jumpReads: JumpRead[] = [];
let jumpsInTakes = 0;
for (const take of JUMP_TAKES) {
  const fx = JSON.parse(readFileSync(join(ROOT, 'lib/pose/__fixtures__', `${take}.json`), 'utf8'));
  jumpsInTakes += fx.gt.jumps.length;
  for (const seed of REPEATS) {
    const frames = refilm(fx.frames, seed);
    const first = fx.gt.jumps[0].takeoff.t;
    // the takes start mid-dip: the floor lines come from the frames before the first take-off, with a loose sway (as the
    // grader's own test reads them, lib/assess/graders/t5-cmj.test.ts)
    const cal = calibrateFront(frames.filter((f: { t: number }) => f.t < first - 150), 4 / 3, Math.min(900, first - 250), 0.3);
    if (!cal.ok) continue;
    const r = gradeT5(frames, { calibration: { aspect: 4 / 3, front: cal.value, side: null }, aspect: 4 / 3 });
    fx.gt.jumps.forEach((g: { takeoff: { t: number }; heightFlightM: number }, i: number) => {
      const j = r.t5.jumps.find((x: { valid: boolean; takeoffT: number }) => x.valid && Math.abs(x.takeoffT - g.takeoff.t) < 150);
      if (j) jumpReads.push({ take, jump: i, truthCm: g.heightFlightM * 100, readCm: j.heightCm });
    });
  }
}
const jumpErr = jumpReads.map((x) => x.readCm - x.truthCm);
const jumpKeys = [...new Set(jumpReads.map((x) => `${x.take}#${x.jump}`))];
const jumpRepeat = Math.sqrt(mean(jumpKeys.map((k) => { const v = jumpReads.filter((x) => `${x.take}#${x.jump}` === k).map((x) => x.readCm); return v.length > 1 ? sd(v) ** 2 : 0; })));
const jump = {
  basis: 'recorded', unit: 'cm',
  method: 'Phone camera, facing you, hands on hips: the height from the time in the air',
  fixtures: JUMP_TAKES, jumpsInTakes, jumpsRead: jumpKeys.length, reads: jumpReads.length,
  meanMiss: r1(mean(jumpErr.map(Math.abs))), bias: r1(mean(jumpErr)), repeatSpread: r1(jumpRepeat),
};

// ── screen: the movement screen on the recorded landmark fixtures ──────────────────────────────────────────────
const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
const scores: number[] = [];
let runs = 0, completed = 0, falseFlags = 0, readChecks = 0, totalChecks = 0;
const cache = new Map<string, unknown>();
for (const seed of SEEDS) {
  const frameFor = (st: { id: string; view: string }) => {
    const name = stationFixture(st);
    const key = `${name}@${seed}`;
    if (!cache.has(key)) cache.set(key, adapterFromPose(filmFixture(name, { seed, frameJitterMs: 4 })));
    return { fixture: name, frames: cache.get(key) as unknown[] };
  };
  const rec = runScreen('full', frameFor);
  runs++;
  if (rec.completed) completed++;
  const s = rec.onComplete.summary;
  if (s.score != null) scores.push(s.score);
  falseFlags += s.movementFlags ?? 0;
  readChecks += s.readCount ?? 0; totalChecks += s.totalCount ?? 0;
}
const mirrorScreen = {
  basis: 'recorded', unit: 'points',
  method: 'Phone camera, four short holds: each check read from your joints against its own line',
  fixtures: ['stand_front', 'stand_side', 'stand_back', 'single_leg_left', 'single_leg_right', 'seated_rotation_front'],
  runs, completed, scoreMean: scores.length ? r1(mean(scores)) : null, repeatSpread: scores.length > 1 ? r1(sd(scores)) : 0,
  flagsNotInTheKey: falseFlags, checksRead: readChecks, checksTotal: totalChecks,
};

// ── the Quick Screen (Train → Screen my movement): the live flow on its computer-made mover ─────────────────────
// No recorded take of the four Quick Screen moves with a key exists yet, so this is SYNTHETIC (lib/screen-easy/sim.ts:
// the live runner, a mover with clean form, the realistic camera's jitter and 1 % missed frames, eight seeds). What it
// measures: how often the same clean mover gets the same colour on each check, the spread of each check's measured angle
// or distance, and how many checks the clean mover failed.
const QS_SEEDS = Array.from({ length: 8 }, (_, i) => i + 1);
const bands = new Map<string, number[]>();
const values = new Map<string, number[]>();
let qsRuns = 0, qsDone = 0, qsFailed = 0, qsChecks = 0;
const flowS: number[] = [];
for (const seed of QS_SEEDS) {
  const r = simulateFullScreen({ seed, fps: 30, noise: true, dropRate: 0.01 });
  qsRuns++;
  if (!r.done || !r.result) continue;
  qsDone++;
  if (r.numberMs != null) flowS.push(r.numberMs / 1000);
  for (const t of r.result.tests) for (const [side, sd0] of Object.entries(t.sides ?? {}) as [string, { score03?: number; metrics?: { id: string; unit: string; value: number | null }[] }][]) {
    if (sd0?.score03 == null) continue;
    const k = `${t.id}:${side}`;
    bands.set(k, [...(bands.get(k) ?? []), sd0.score03]);
    qsChecks++; if (sd0.score03 < 3) qsFailed++;
    for (const m of sd0.metrics ?? []) if (typeof m.value === 'number' && m.unit === '°') values.set(`${k}:${m.id}`, [...(values.get(`${k}:${m.id}`) ?? []), m.value]);
  }
}
let same = 0, all = 0;
for (const v of bands.values()) { const mode = [...new Set(v)].sort((a, b) => v.filter((x) => x === b).length - v.filter((x) => x === a).length)[0]; same += v.filter((x) => x === mode).length; all += v.length; }
const angleSpreads = [...values.values()].filter((v) => v.length > 1).map(sd).sort((a, b) => a - b);
const quickScreen = {
  basis: 'synthetic', unit: 'colour',
  method: 'Phone camera, four short moves: each check read from your joints against its own line',
  fixtures: ['lib/screen-easy/sim.ts: a clean mover, realistic camera, 8 seeds'],
  runs: qsRuns, completed: qsDone, checks: qsChecks, sameColourPct: all ? Math.round((same / all) * 100) : null,
  angleSpreadDeg: angleSpreads.length ? r1(angleSpreads[Math.floor(angleSpreads.length / 2)]) : null,
  cleanMoverFailed: qsFailed,
  /** the plan's gate: the movement screen under 3 minutes — camera on to the result, this mover's own pace (the sim's MOVE_S) */
  cameraToResultMeanS: flowS.length ? Math.round(mean(flowS)) : null, cameraToResultMaxS: flowS.length ? Math.round(Math.max(...flowS)) : null,
};

// ── sprint: the synthetic bench ────────────────────────────────────────────────────────────────────────────────
const sprintOut = JSON.parse(execFileSync(join(ROOT, 'node_modules/.bin/tsx'), ['scripts/sprint-accuracy.ts'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 }));
const g = sprintOut['gate40yd@60'], fly = sprintOut['flying10@60'];
const sprint = {
  basis: 'synthetic', unit: 's',
  method: 'Phone camera at the line: the moment your body crosses it, timed between frames',
  fixtures: ['scripts/sprint-accuracy.ts: 40 yd and flying 10 m at 60 fps'],
  runs: (g?.n ?? 0) + (fly?.n ?? 0), meanMiss: r3(((g?.meanAbsMs ?? 0) * (g?.n ?? 0) + (fly?.meanAbsMs ?? 0) * (fly?.n ?? 0)) / 1000 / Math.max(1, (g?.n ?? 0) + (fly?.n ?? 0))),
  p95Miss: r3(Math.max(g?.p95Ms ?? 0, fly?.p95Ms ?? 0) / 1000), insideItsOwnPm: Math.min(g?.insidePct ?? 0, fly?.insidePct ?? 0),
};

// ── bar speed: the synthetic bench ─────────────────────────────────────────────────────────────────────────────
const SPEEDS = [0.95, 0.8, 0.7, 0.6, 0.45, 0.32];
const vErr: number[] = []; let vTruth = 0, vMatched = 0;
const vRepeat: number[] = [];
for (let seed = 1; seed <= 10; seed++) {
  const reps = SPEEDS.map((v) => ({ romM: 0.5, concMs: (0.5 / v) * 1000, stick: seed % 3 === 0 ? 0.3 : 0 }));
  const f = filmSet(LIFTS.back_squat, { reps }, { fps: 60, seed, plate: true });
  const tr = trackOf(LIFTS.back_squat, f.frames, f.aspect, f.heightM);
  if (!tr.ok) continue;
  const r = readSet(LIFTS.back_squat, tr.track);
  vTruth += f.truth.length;
  for (const t of f.truth) {
    const m = r.reps.find((x: { counted: boolean; startT: number; endT: number }) => x.counted && Math.abs((x.startT + x.endT) / 2 - (t.startT + t.endT) / 2) < 300);
    if (!m) continue;
    vMatched++; vErr.push(m.mcv - t.mcv);
  }
}
// repeat: the same set (one seed's bar path) filmed with ten other camera seeds
{
  const reps = SPEEDS.map((v) => ({ romM: 0.5, concMs: (0.5 / v) * 1000 }));
  const byRep: number[][] = SPEEDS.map(() => []);
  for (let seed = 11; seed <= 20; seed++) {
    const f = filmSet(LIFTS.back_squat, { reps }, { fps: 60, seed, plate: true });
    const tr = trackOf(LIFTS.back_squat, f.frames, f.aspect, f.heightM);
    if (!tr.ok) continue;
    const r = readSet(LIFTS.back_squat, tr.track);
    f.truth.forEach((t: { startT: number; endT: number }, i: number) => {
      const m = r.reps.find((x: { counted: boolean; startT: number; endT: number }) => x.counted && Math.abs((x.startT + x.endT) / 2 - (t.startT + t.endT) / 2) < 300);
      if (m) byRep[i].push(m.mcv);
    });
  }
  for (const v of byRep) if (v.length > 1) vRepeat.push(sd(v) ** 2);
}
const vbt = {
  basis: 'synthetic', unit: 'm/s',
  method: 'Phone camera side-on, tracking the plate: the bar\'s mean speed up',
  fixtures: ['lib/vbt/bench.ts: back squat at the plate, 60 fps, six speeds × 10 seeds'],
  reps: vMatched, repsInSets: vTruth, meanMiss: r3(mean(vErr.map(Math.abs))), bias: r3(mean(vErr)), repeatSpread: r3(Math.sqrt(mean(vRepeat))),
};

const trust = { measuredBy: 'scripts/every-screen/trust.mts', jump, quickScreen, mirrorScreen, sprint, vbt };
const text = JSON.stringify(trust, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const was = readFileSync(OUT, 'utf8');
  if (was !== text) { console.log('lib/results/trust.json is stale: run scripts/every-screen/trust.mts'); process.exit(1); }
  console.log('trust.json matches a fresh measurement');
} else {
  writeFileSync(OUT, text);
  writeFileSync(join(ROOT, 'docs/every-screen/TRUST.md'), [
    '# Numbers you can trust: what each measured number was checked on',
    '',
    'Written by `scripts/every-screen/trust.mts` (it runs the code a phone runs; re-run it when a reader changes). Every result card, the jump check, the two screens and My progress show these as one line under the number (`lib/results/trust.ts`).',
    '',
    '| Tool | Checked on | What it found | What the screen says |',
    '|---|---|---|---|',
    `| Jump (the jump check, the jump tests, readiness) | RECORDED: ${jump.jumpsRead} of ${jump.jumpsInTakes} motion-captured jumps (${JUMP_TAKES.join(', ')}), each read ${REPEATS.length} times | mean miss ${jump.meanMiss} cm, bias ${jump.bias} cm; the same jump read again moves ${jump.repeatSpread} cm | ± (mean miss) on recorded jumps; ± (repeat spread) |`,
    `| The Mirror's movement screen | RECORDED: its landmark fixtures, ${mirrorScreen.runs} reads with the camera's noise | score ${mirrorScreen.scoreMean} every time (± ${mirrorScreen.repeatSpread}), ${mirrorScreen.flagsNotInTheKey} flags the key does not hold | ± points; no flag the recording lacks |`,
    `| The Quick Screen (Screen my movement) | SYNTHETIC: a clean computer-made mover, ${quickScreen.runs} screens | same colour ${quickScreen.sameColourPct} % of the time; angles ± ${quickScreen.angleSpreadDeg}°; the clean mover failed ${quickScreen.cleanMoverFailed} of ${quickScreen.checks} checks; camera to result ${quickScreen.cameraToResultMeanS} s | same colour %; computer-made, no recorded screen yet |`,
    `| Sprint | SYNTHETIC: ${sprint.runs} computer-made runs at 60 fps | mean miss ${sprint.meanMiss} s, 95 % within ${sprint.p95Miss} s; the truth inside the run's own ± ${sprint.insideItsOwnPm} % of the time | ± s; no recorded run yet |`,
    `| Bar speed | SYNTHETIC: ${vbt.reps} computer-made reps | mean miss ${vbt.meanMiss} m/s (bias ${vbt.bias}); the same set read again moves ${vbt.repeatSpread} m/s | ± m/s; no recorded set yet |`,
    '| Approach jump, bounce score (RSI), drop jump | not measured here | — | "Not yet measured on recorded ...: treat it as a camera estimate." |',
    '',
    'Gaps for the owner: there is no recorded sprint, bar-speed set, approach jump or Quick Screen take with a known answer in the repository, so those lines say "computer-made" or "not yet measured". A recorded fixture for each (a phone video plus its timing gates, plate or force plate) would turn them into recorded measurements with no change to the screens.',
    '',
  ].join('\n'));
  console.log(text);
}
void r2;
