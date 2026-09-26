// MIRROR-COACH P2 live proof (2026-09-26) — why the knee cue went quiet on the live jittered square knees-in squat.
//
// The live proof on :3131 (painfree/p2/proof/mirror) heard the coach say "Heels heavy…" four times — and never the knee —
// on a synth squat whose knees cave 6 cm square-on (heels flat: the synth never lifts them). This runs the Mirror's own
// pipeline in the harness's order (PoseFrameGate → SquatAudit → stepSquatSession → CueEngine.decide on faulting work
// frames only, VALGUS_CUE_VERIFIED as served), 20 jittered seeds, two ways:
//   · guided — standing through the breath, then 11 squats (a person following the prompts);
//   · looped — the live probe's player: the one 3.2 s squat looped from the first frame, so the audit's standing
//     calibration (the 20th pose frame) lands wherever the loop is.
// Counts, per shape, how many sets cued the knee, how many cued the heel, and the heelRise frames. Synthetic bodies.
//
// Run: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-heel-cue-p2proof.ts [outJson]
import { writeFileSync } from 'node:fs';
import { synthesize, type Joints } from '../../lib/pose/synth';
import { PoseFrameGate } from '../../lib/babylon/nexus/neuro-mirror/render/pose-frame-gate';
import { SquatAudit } from '../../lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CueEngine } from '../../lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import type { PoseFrame } from '../../lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { filmSquat, squatJoints, toMirrorFrame, type SquatShape } from '../../lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat';
import { BREATH_CYCLES, BREATH_CYCLE_MS, initialSquatSession, stepSquatSession } from '../../lib/mirror/squatStage';

const LEAD_S = (BREATH_CYCLES * BREATH_CYCLE_MS) / 1000 + 1.5;
function guided(shape: SquatShape, seed: number): PoseFrame[] {
  const frames: Joints[] = [];
  const stand = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) frames.push(squatJoints(0, shape)); };
  stand(LEAD_S);
  for (let r = 0; r < 11; r++) {
    for (let i = 0; i < 21; i++) frames.push(squatJoints((i + 1) / 21, shape));
    for (let i = 0; i < 12; i++) frames.push(squatJoints(1, shape));
    for (let i = 0; i < 21; i++) frames.push(squatJoints(1 - (i + 1) / 21, shape));
    stand(1);
  }
  stand(1);
  return synthesize({ fps: 30, frames }, { seed }).frames.map(toMirrorFrame);
}
function looped(shape: SquatShape, seed: number): PoseFrame[] {
  const one = filmSquat(shape, { seed } as never);
  const dur = one[one.length - 1].timestampMs + 1000 / 30;
  const out: PoseFrame[] = [];
  for (let k = 0; k < 30; k++) for (const f of one) out.push({ ...f, timestampMs: f.timestampMs + k * dur });
  return out;
}
function run(frames: PoseFrame[]) {
  const gate = new PoseFrameGate(), audit = new SquatAudit(), ce = new CueEngine();
  let state = initialSquatSession();
  const cues: string[] = [];
  let heelFrames = 0, kneeFrames = 0;
  for (const cam of frames) {
    if (!gate.admit(cam)) continue;
    const r = audit.evaluate(cam);
    if (state.stage === 'work' && r.faults.includes('heelRise')) heelFrames++;
    if (state.stage === 'work' && r.faults.includes('kneeValgus')) kneeFrames++;
    const step = stepSquatSession(state, { nowMs: cam.timestampMs, phase: r.phase, present: r.present, faults: r.faults, square: r.square, hipDrop: r.hipDrop });
    state = step.state;
    if (step.cueFaults) { const e = ce.decide(cam.timestampMs, step.cueFaults); if (e) cues.push(e.fault); }
    if (state.stage === 'review') break;
  }
  return { cues, heelFrames, kneeFrames, stage: state.stage };
}
const SHAPES: Record<string, SquatShape> = {
  'both knees 6 cm in, square': { shiftL: -0.06, shiftR: -0.06 },
  'straight, square': {},
  'straight, 8° off square': { turnDeg: 8 },
};
const out: Record<string, unknown> = {};
for (const [how, film] of [['guided', guided], ['looped', looped]] as const) {
  for (const [name, shape] of Object.entries(SHAPES)) {
    const rows = Array.from({ length: 20 }, (_, i) => run(film(shape, i + 1)));
    const key = `${how} · ${name}`;
    out[key] = {
      setsReachingReview: rows.filter((r) => r.stage === 'review').length,
      setsCueingKnee: rows.filter((r) => r.cues.includes('kneeValgus')).length,
      setsCueingHeel: rows.filter((r) => r.cues.includes('heelRise')).length,
      setsWithHeelRiseFrames: rows.filter((r) => r.heelFrames > 0).length,
      heelRiseFramesPerSet: rows.map((r) => r.heelFrames),
      firstCuePerSet: rows.map((r) => r.cues[0] ?? null),
      seed3: rows[2],
    };
    console.log(key, JSON.stringify({ knee: (out[key] as any).setsCueingKnee, heel: (out[key] as any).setsCueingHeel, heelFrameSets: (out[key] as any).setsWithHeelRiseFrames, seed3: rows[2].cues })); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({ date: new Date().toISOString(), seeds: 20, ...out }, null, 2)}\n`);
