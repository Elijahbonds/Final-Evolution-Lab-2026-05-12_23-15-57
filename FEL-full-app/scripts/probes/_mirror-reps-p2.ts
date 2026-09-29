// MIRROR-COACH P2 (2026-09-26) — one squat = one rep, measured in node over 20 jittered takes of a real 11-rep guided set.
//
// The Mirror's own pipeline, in the harness's order (PoseFrameGate → SquatAudit → stepSquatSession), over a synthetic
// guided squat (lib/pose/synth.ts, default jitter: 37.5 s standing through the breath, then 11 squats of 2.8 s). Reports
// on which physical squat the review opened (the right answer is the 11th):
//   · P2 as served, each camera frame handed over once, twice (60 Hz display on 30 fps) and four times (120 Hz);
//   · the pre-P2 rep rule (any return to standing; hipDrop left out) fed once — the camera-jitter hole;
//   · the pre-P2 rule with each frame re-read as a fresh frame 1 ms later — the repeated-frame hole as P1 saw it live.
// Synthetic bodies; the pipeline is the app's.
//
// Run: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-reps-p2.ts [outJson]
import { writeFileSync } from 'node:fs';
import { synthesize, type Joints } from '../../lib/pose/synth';
import { PoseFrameGate } from '../../lib/babylon/nexus/neuro-mirror/render/pose-frame-gate';
import { SquatAudit } from '../../lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import type { PoseFrame } from '../../lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { squatJoints, toMirrorFrame } from '../../lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat';
import { BREATH_CYCLES, BREATH_CYCLE_MS, initialSquatSession, stepSquatSession } from '../../lib/mirror/squatStage';

const LEAD_S = (BREATH_CYCLES * BREATH_CYCLE_MS) / 1000 + 1.5, SQUAT_S = 2.8, REPS = 11;
function guidedSet(seed: number): PoseFrame[] {
  const frames: Joints[] = [];
  const stand = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) frames.push(squatJoints(0)); };
  stand(LEAD_S);
  for (let r = 0; r < REPS; r++) {
    for (let i = 0; i < 21; i++) frames.push(squatJoints((i + 1) / 21));
    for (let i = 0; i < 12; i++) frames.push(squatJoints(1));
    for (let i = 0; i < 21; i++) frames.push(squatJoints(1 - (i + 1) / 21));
    stand(1);
  }
  stand(1);
  return synthesize({ fps: 30, frames }, { seed }).frames.map(toMirrorFrame);
}
function reviewOnSquat(frames: PoseFrame[], copies: number, preP2: boolean): number | null {
  const gate = new PoseFrameGate(), audit = new SquatAudit();
  let state = initialSquatSession();
  for (const cam of frames) for (let c = 0; c < copies; c++) {
    if (!gate.admit(cam)) continue;
    const r = audit.evaluate(cam);
    const step = stepSquatSession(state, { nowMs: cam.timestampMs, phase: r.phase, present: r.present, faults: r.faults, square: r.square, hipDrop: preP2 ? undefined : r.hipDrop });
    state = step.state;
    if (step.stageChanged && state.stage === 'review') return Math.ceil((cam.timestampMs / 1000 - LEAD_S) / SQUAT_S);
  }
  return null;
}

const rows: Record<string, (number | null)[]> = { p2Once: [], p2Twice: [], p2Four: [], preP2Once: [], preP2Stutter: [] };
for (let seed = 1; seed <= 20; seed++) {
  const f = guidedSet(seed);
  rows.p2Once.push(reviewOnSquat(f, 1, false));
  rows.p2Twice.push(reviewOnSquat(f, 2, false));
  rows.p2Four.push(reviewOnSquat(f, 4, false));
  rows.preP2Once.push(reviewOnSquat(f, 1, true));
  rows.preP2Stutter.push(reviewOnSquat(f.flatMap((x) => [x, { ...x, timestampMs: x.timestampMs + 1 }]), 1, true));
}
const summary = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { reviewOpenedOnSquat: v, all11: v.every((x) => x === REPS) }]));
console.log(JSON.stringify(summary, null, 1));
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({ date: new Date().toISOString(), seeds: 20, reps: REPS, note: 'the physical squat (1-11) on which the guided squat opened its review; 11 is right', ...summary }, null, 2)}\n`);
