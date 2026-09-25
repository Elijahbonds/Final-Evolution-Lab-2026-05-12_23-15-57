// reader — the body reader against every fixture's ground truth (movement play, phase 2, 2026-09-24): the tables of
// READER.md, printed as markdown.
//
//   node node_modules/tsx/dist/cli.mjs scripts/body/reader.mts [fixture-dir]
//
// The reader is lib/pose/BodyReader.ts; the grading (the truth's own frame conventions, the stand held before each take,
// the splice and end-of-take exclusions) is lib/pose/grade.ts, the same the tests assert on. A fixture-dir other than
// lib/pose/__fixtures__ (a noise-free or re-seeded rebuild by scripts/body/synth-streams.mts) prints the same tables.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as gradeNs from '../../lib/pose/grade.ts';
import type { PoseFixture } from '../../lib/pose/synth.ts';
import type { BodyEvent } from '../../lib/pose/BodyReader.ts';

// the app's modules load as CommonJS under tsx: the named exports sit on the default
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const { standFrame, readTake, grade, nearFrame } = unwrap(gradeNs);

const dir = process.argv[2] ?? join(process.cwd(), 'lib/pose/__fixtures__');
const load = (n: string) => JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8')) as PoseFixture;
const names = (JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { name: string }[]).map((e) => e.name);
const owner = load('stand_still').frames[70];
const f0 = (x: number | null | undefined, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : x.toFixed(d));
const sgn = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(d)}`);
const cm = (m: number | null | undefined) => (m === null || m === undefined ? '–' : sgn(m * 100, 1));
const footName = (f: string) => (f === 'both' ? 'both' : f === 'left' ? 'L' : f === 'right' ? 'R' : f);

const jumpRows: string[] = [], otherRows: string[] = [], armRows: string[] = [], calRows: string[] = [];
let nJ = 0, nTo = 0, nLa = 0, nAp = 0, nH = 0, nFt = 0, nFalse = 0, sumAbsH = 0, sumH = 0;
for (const name of names) {
  const fx = load(name);
  const st = standFrame(fx, fx.source.kind === 'deepmotion' ? owner : undefined);
  const r = readTake(fx, st.frame);
  const g = grade(fx, r.events, r.calibration);
  const c = g.calibration;
  calRows.push(`| ${name} | ${st.from} | ${c ? `${f0(c.mPerX, 2)} / ${f0(c.mPerY, 2)}` : '–'} | ${c ? f0(c.hipHeightM * 100) : '–'} | ${c ? f0(c.shoulderWidthM * 100) : '–'} | ${c ? f0(c.legLengthM * 100) : '–'} | ${c ? `${f0(c.sway.torsoM * 100, 1)} / ${f0(c.sway.ankleM * 100, 1)}` : '–'} |`);
  g.jumps.forEach((j, k) => {
    nJ++;
    const to = j.takeoff, ld = j.land;
    const feetOk = !!to && to.feet === (j.gt.feet === 1 ? 'one' : 'two') && to.foot === (j.gt.takeoffFoot === 'both' ? 'both' : j.gt.takeoffFoot === 'left' ? 'L' : 'R');
    if (to && Math.abs(j.dTakeoffF!) <= 1) nTo++;
    if (ld && Math.abs(j.dLandF!) <= 1) nLa++;
    if (j.apex && Math.abs(j.dApexF!) <= 1) nAp++;
    if (j.dHeightM !== null && Math.abs(j.dHeightM) <= 0.05) nH++;
    if (feetOk) nFt++;
    if (j.dHeightM !== null) { sumAbsH += Math.abs(j.dHeightM); sumH += j.dHeightM; }
    jumpRows.push(`| ${name} #${k + 1} | ${j.gt.feet === 1 ? `one (${footName(j.gt.takeoffFoot)})` : 'two'} / ${to ? (to.feet === 'one' ? `one (${to.foot})` : 'two') : '–'}${feetOk ? '' : ' ✗'} `
      + `| f${j.gt.takeoff.frame} / ${to ? `f${j.gt.takeoff.frame + j.dTakeoffF!}` : '–'} (${sgn(j.dTakeoffMs)} ms) `
      + `| f${j.gt.apex.frame} / ${j.apex ? `f${j.gt.apex.frame + j.dApexF!}` : '–'} (${sgn(j.dApexMs)} ms) `
      + `| f${j.gt.landing.frame} / ${ld ? `f${j.gt.landing.frame + j.dLandF!}` : '–'} (${sgn(j.dLandMs)} ms) `
      + `| ${f0(j.gt.flightMs)} / ${ld ? f0(ld.flightMs) : '–'} | ${f0(j.gt.heightFlightM * 100, 1)} / ${ld ? f0(ld.heightM * 100, 1) : '–'} (${cm(j.dHeightM)}) `
      + `| ${to ? f0(to.v0, 2) : '–'} | ${to ? `+${f0(to.seen - to.t)}` : '–'} |`);
  });
  nFalse += g.falseJumps.length;
  const ev = (k: BodyEvent['kind']) => g.events.filter((e) => e.kind === k && e.t >= fx.frames[0].t);
  const dips = ev('dip') as Extract<BodyEvent, { kind: 'dip' }>[];
  const pens = ev('penultimate') as Extract<BodyEvent, { kind: 'penultimate' }>[];
  otherRows.push(`| ${name} | ${fx.gt.flights.length} | ${g.falseJumps.length}${g.dangling ? ` (+${g.dangling} still in the air at the end)` : ''} `
    + `| ${g.steps.gt} / ${g.steps.detected} | ${f0(g.steps.cadenceGt, 2)} / ${f0(g.steps.cadence, 2)} `
    + `| ${dips.map((d) => `f${nearFrame(fx.frames, d.t)} ${f0(d.depthM * 100)}`).join(', ') || '–'} `
    + `| ${pens.map((p) => `f${nearFrame(fx.frames, p.t)} ${p.foot} ${f0(p.depthM * 100)} cm ${f0(p.contactMs)} ms`).join(', ') || '–'} |`);
  for (const a of [...g.arms, ...g.kicks]) {
    armRows.push(`| ${name} | ${a.kind} ${a.hand} | f${a.gtFrame} | ${a.dF === null ? 'missed' : `f${a.gtFrame + a.dF} (${sgn(a.dF)})`} | ${f0(a.gtSpeed, 1)} / ${f0(a.speed, 1)} |`);
  }
  for (const e of g.extraArms) armRows.push(`| ${name} | ${e.kind} ${'hand' in e ? e.hand : ''} (no truth) | – | f${nearFrame(fx.frames, e.t)} | – |`);
}

console.log(`## Jumps (${nJ}): take-off ±1 frame ${nTo}/${nJ}, landing ±1 ${nLa}/${nJ}, apex ±1 ${nAp}/${nJ}, height ±5 cm ${nH}/${nJ} (mean |error| ${f0((sumAbsH / nJ) * 100, 1)} cm, mean ${cm(sumH / nJ)} cm), one/two feet ${nFt}/${nJ}, false jumps ${nFalse}\n`);
console.log('Truth / detected. Frames by the truth\'s own rule (take-off and landing: the first frame at or after the instant; apex: the nearest), ms = detected − true instant. Height: g·t²/8 of the flight. v0: the take-off speed the hips showed (m/s); told: how long after the take-off the reader said so.\n');
console.log('| jump | feet | take-off | apex | landing | flight ms | height cm | v0 | told (ms) |');
console.log('|---|---|---|---|---|---|---|---|---|');
jumpRows.forEach((r) => console.log(r));
console.log('\n## Not jumps, steps, dips, penultimates\n');
console.log('| fixture | true non-jump flights | false jumps | steps true / read | cadence /s true / read | dips (frame, cm below the stand) | penultimate (frame, foot, depth, contact) |');
console.log('|---|---|---|---|---|---|---|');
otherRows.forEach((r) => console.log(r));
console.log('\n## Arm events and kicks\n');
console.log('| fixture | event | truth | read (frames off) | speed m/s true / read |');
console.log('|---|---|---|---|---|');
armRows.forEach((r) => console.log(r));
console.log('\n## Calibration (the stand held before each take)\n');
console.log('| fixture | stood on | m per image x / y | hip height cm | shoulders cm | leg cm | sway cm torso / ankle |');
console.log('|---|---|---|---|---|---|---|');
calRows.forEach((r) => console.log(r));
