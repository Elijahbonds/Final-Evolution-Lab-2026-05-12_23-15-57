// MIRROR-COACH P2 review (2026-09-26) — one squat = one rep NEAR THE CAMERA OR FAR FROM IT, and a shallow squatter is
// told once and then counted. Node, the Mirror's own pipeline in the harness's order (PoseFrameGate → SquatAudit →
// stepSquatSession) over a synthetic guided set (lib/pose/synth.ts, default jitter: the breath standing, then 11 squats
// of 2.8 s), every frame scaled about the frame's centre (a step back from the phone, or closer). Reports, per scale and
// over 10 seeds: the physical squat on which the review opened (11 is right), the reps counted, the "sit deeper"
// prompts, and the deepest hipDrop a standing body reached (jitter).
//   default squat (0.42 m) — the review must open on squat 11 at every scale (before the fix: 7-10 at 0.8, 3-5 at 0.6);
//   drop 0.12 m (a quarter squat) — one prompt, then every squat counted and marked shallow (before: 0 reps, silence);
//   drop 0.08 m (a knee bob) — nothing counted, nothing said.
// Synthetic bodies; the pipeline is the app's. The same cases are held by lib/mirror/repeatedFrames.test.ts.
//
// Run: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-reps-scale-p2r.ts [outJson]
import { writeFileSync } from 'node:fs';
import { synthesize, type Joints } from '../../lib/pose/synth';
import { PoseFrameGate } from '../../lib/babylon/nexus/neuro-mirror/render/pose-frame-gate';
import { SquatAudit } from '../../lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import type { PoseFrame } from '../../lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { squatJoints, toMirrorFrame } from '../../lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat';
import { BREATH_CYCLES, BREATH_CYCLE_MS, initialSquatSession, stepSquatSession } from '../../lib/mirror/squatStage';

const LEAD_S = (BREATH_CYCLES * BREATH_CYCLE_MS) / 1000 + 1.5, SQUAT_S = 2.8, REPS = 11;
function guidedSet(seed: number, scale: number, drop?: number): PoseFrame[] {
  const frames: Joints[] = [];
  const stand = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) frames.push(squatJoints(0, { drop })); };
  stand(LEAD_S);
  for (let r = 0; r < REPS; r++) {
    for (let i = 0; i < 21; i++) frames.push(squatJoints((i + 1) / 21, { drop }));
    for (let i = 0; i < 12; i++) frames.push(squatJoints(1, { drop }));
    for (let i = 0; i < 21; i++) frames.push(squatJoints(1 - (i + 1) / 21, { drop }));
    stand(1);
  }
  stand(1);
  return synthesize({ fps: 30, frames }, { seed }).frames.map(toMirrorFrame)
    .map((f) => ({ ...f, landmarks: f.landmarks.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * scale, y: 0.5 + (l.y - 0.5) * scale })) }));
}
function run(frames: PoseFrame[]) {
  const gate = new PoseFrameGate(), audit = new SquatAudit();
  let state = initialSquatSession();
  let reviewOn: number | null = null, reps = 0, prompts = 0, standingMaxDrop = 0;
  for (const cam of frames) {
    if (!gate.admit(cam)) continue;
    const r = audit.evaluate(cam);
    const t = cam.timestampMs / 1000 - LEAD_S;
    if (r.present && r.hipDrop !== undefined && (t < 0 || (t % SQUAT_S) > 1.9)) standingMaxDrop = Math.max(standingMaxDrop, r.hipDrop);
    const step = stepSquatSession(state, { nowMs: cam.timestampMs, phase: r.phase, present: r.present, faults: r.faults, square: r.square, hipDrop: r.hipDrop });
    state = step.state;
    if (step.repCounted) reps++;
    if (step.deeperPrompt) prompts++;
    if (step.stageChanged && state.stage === 'review' && reviewOn === null) reviewOn = Math.ceil(t / SQUAT_S);
  }
  return { reviewOn, reps, prompts, stage: state.stage, shallowFound: state.findings.includes('shallow'), standingMaxDrop };
}

const out: Record<string, Record<string, unknown>> = {};
for (const [label, drop] of [['full squat (0.42 m)', undefined], ['quarter squat (0.12 m)', 0.12], ['knee bob (0.08 m)', 0.08]] as const) {
  out[label] = {};
  for (const scale of [0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.4]) {
    const runs = Array.from({ length: 10 }, (_, i) => run(guidedSet(i + 1, scale, drop)));
    out[label][`scale ${scale}`] = {
      reviewOpenedOnSquat: runs.map((x) => x.reviewOn), reps: runs.map((x) => x.reps), deeperPrompts: runs.map((x) => x.prompts),
      stages: [...new Set(runs.map((x) => x.stage))], shallowInFindings: runs.every((x) => x.shallowFound),
      standingMaxHipDrop: Math.max(...runs.map((x) => x.standingMaxDrop)),
    };
    console.log(label, scale, JSON.stringify(out[label][`scale ${scale}`]));
  }
}
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({ date: new Date().toISOString(), seeds: 10, squats: REPS, note: 'reviewOpenedOnSquat: the physical squat (1-11) on which the guided squat opened its review; 11 is right for the full squat. A quarter squat prompts once (not counted), so its 11 squats count 10 and the set is still in the work stage.', results: out }, null, 2)}\n`);
