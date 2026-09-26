// MIRROR-COACH P2 (2026-09-26) — the knee read's squareness gate, measured on the app's virtual webcam.
//
// The numbers behind squat-audit.ts squareOn and the switch-on of the knee cue (cue-engine.ts VALGUS_CUE_VERIFIED):
// a squat filmed through lib/pose/synth.ts with its DEFAULT landmark jitter, 20 seeds per row, turned 0–20° off square,
// straight or caving, through the real SquatAudit and a VERIFIED CueEngine fed the way the harness feeds it (only
// faulting frames reach decide()). Plus the reads the gate was chosen between: framing.ts's side-width (the depth-free
// read the brief suggested) and the windowed depth order of the shoulder and hip lines (what the gate uses).
// Synthetic: it says what the geometry and the jitter model do, not what a phone camera does.
//
// Run: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-square-gate-p2.ts [outJson]
import { writeFileSync } from 'node:fs';
import { SQUAT_THRESHOLDS, SquatAudit, torsoTurnSample, yawFromSamples, type SquatThresholds } from '../../lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CueEngine } from '../../lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { filmSquat, type SquatShape } from '../../lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat';
import { sideWidth } from '../../lib/mirror/framing';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const r2 = (x: number) => Math.round(x * 100) / 100;
const stat = (a: number[]) => {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  const sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
  return { mean: r2(m), sd: r2(sd), min: r2(Math.min(...a)), max: r2(Math.max(...a)), n: a.length };
};

/** One squat through the audit and a verified engine: did the audit flag the knee, and did the coach say it? */
function run(shape: SquatShape, seed: number, t: SquatThresholds = SQUAT_THRESHOLDS) {
  const audit = new SquatAudit(t);
  const ce = new CueEngine({ valgusVerified: true });
  let flagged = 0, kneeCues = 0, notSquare = 0, readFrames = 0, lateral = 0;
  const yaws: number[] = [];
  for (const f of filmSquat(shape, { seed })) {
    const r = audit.evaluate(f);
    if (r.present && r.phase !== 'standing' && r.square !== undefined) {
      readFrames++;
      if (!r.square) notSquare++;
      if (r.yawDeg !== undefined) yaws.push(r.yawDeg);
    }
    if (r.faults.includes('kneeValgus')) flagged++;
    if (r.faults.includes('lateralShift')) lateral++;
    if (r.faults.length && ce.decide(f.timestampMs, r.faults)?.fault === 'kneeValgus') kneeCues++;
  }
  return { flagged, kneeCues, notSquare, readFrames, yaws, lateral };
}

const out: Record<string, unknown> = { date: new Date().toISOString(), seeds: SEEDS.length, thresholds: { squareMaxYawDeg: SQUAT_THRESHOLDS.squareMaxYawDeg, squareWindowFrames: SQUAT_THRESHOLDS.squareWindowFrames, squareMinWidth: SQUAT_THRESHOLDS.squareMinWidth, valgusPersistFrames: SQUAT_THRESHOLDS.valgusPersistFrames } };

// 1. the reads the gate was chosen between, on a straight squat
const reads: Record<string, unknown> = {};
for (const turnDeg of [0, 3, 5, 8, 10, 20]) {
  const width: number[] = [], perFrameShoulder: number[] = [], perFrameHip: number[] = [], window20: number[] = [];
  for (const seed of SEEDS) {
    const win: { dz: number; dx: number }[] = [];
    for (const f of filmSquat({ turnDeg }, { seed })) {
      if (!f.present) continue;
      const L = f.landmarks;
      const w = sideWidth(f); if (w != null) width.push(w);
      perFrameShoulder.push(yawFromSamples([torsoTurnSample(L[11], L[12], { x: 0, y: 0 }, { x: 0, y: 0 })]));
      perFrameHip.push(yawFromSamples([torsoTurnSample({ x: 0, y: 0 }, { x: 0, y: 0 }, L[23], L[24])]));
      win.push(torsoTurnSample(L[11], L[12], L[23], L[24]));
      if (win.length > 20) win.shift();
      if (win.length === 20) window20.push(yawFromSamples(win));
    }
  }
  reads[`${turnDeg}deg`] = { sideWidth: stat(width), perFrameShoulderYawDeg: stat(perFrameShoulder), perFrameHipYawDeg: stat(perFrameHip), window20YawDeg: stat(window20) };
}
out.reads = reads;

// 2. the gate: straight squats off square, and knees that really cave, square on
const rows: Record<string, unknown> = {};
const shapes: [string, SquatShape][] = [
  ['straight 0°', {}], ['straight 3°', { turnDeg: 3 }], ['straight 4°', { turnDeg: 4 }], ['straight 5°', { turnDeg: 5 }],
  ['straight 6°', { turnDeg: 6 }], ['straight 8°', { turnDeg: 8 }], ['straight -8°', { turnDeg: -8 }], ['straight 10°', { turnDeg: 10 }],
  ['straight 20°', { turnDeg: 20 }],
  ['both knees 6 cm in, square', { shiftL: -0.06, shiftR: -0.06 }], ['left knee 6 cm in, square', { shiftL: -0.06 }],
  ['right knee 6 cm in, square', { shiftR: -0.06 }], ['both knees 5 cm out, square', { shiftL: 0.05, shiftR: 0.05 }],
  ['both knees 6 cm in, 8° off', { shiftL: -0.06, shiftR: -0.06, turnDeg: 8 }],
  ['upper body 10 cm sideways, square', { sideways: 0.1 }],
];
const ungated: SquatThresholds = { ...SQUAT_THRESHOLDS, squareMaxYawDeg: 90, squareMinWidth: 0 };
for (const [name, shape] of shapes) {
  let flaggedSquats = 0, cuedSquats = 0, ungatedFlagged = 0, notSquare = 0, readFrames = 0, lateralSquats = 0;
  const yaws: number[] = [];
  for (const seed of SEEDS) {
    const r = run(shape, seed);
    if (r.flagged) flaggedSquats++;
    if (r.kneeCues) cuedSquats++;
    if (r.lateral) lateralSquats++;
    notSquare += r.notSquare; readFrames += r.readFrames; yaws.push(...r.yaws);
    if (run(shape, seed, ungated).flagged) ungatedFlagged++;
  }
  // lateralShift is NOT behind the gate (the brief gated the knee); recorded so the next phase has the number
  rows[name] = { flaggedSquats, kneeCuedSquats: cuedSquats, flaggedWithoutTheGate: ungatedFlagged, notSquareFrames: `${notSquare}/${readFrames}`, yawDeg: stat(yaws), lateralShiftFlaggedSquats: lateralSquats };
  console.log(`${name.padEnd(30)} knee cued ${String(cuedSquats).padStart(2)}/20 · flagged ${String(flaggedSquats).padStart(2)}/20 (without the gate ${String(ungatedFlagged).padStart(2)}/20) · lateralShift ${String(lateralSquats).padStart(2)}/20 · not square ${notSquare}/${readFrames} frames · yaw ${JSON.stringify(stat(yaws))}`);
}
out.gate = rows;
console.log(JSON.stringify(reads, null, 1));
if (process.argv[2]) { writeFileSync(process.argv[2], `${JSON.stringify(out, null, 2)}\n`); console.log(`wrote ${process.argv[2]}`); }
