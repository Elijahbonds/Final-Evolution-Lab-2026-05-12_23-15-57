// MIRROR-COACH P1 (2026-09-25) — the knee read, noise-free and under landmark jitter, on the app's virtual webcam.
//
// The number behind VALGUS_CUE_VERIFIED=false (rules/cue-engine.ts): a straight-tracking squat, filmed through
// lib/pose/synth.ts with its DEFAULT noise (image limb σ 0.004, torso σ 0.002), over 50 seeds — how often does the
// per-frame kneeValgus fault fire on knees that never moved in? And, for contrast, how the replaced `lk.x > la.x` rule
// read the same geometry. Synthetic: it says what the geometry and the jitter model do, not what a phone camera does.
//
// Run: node node_modules/tsx/dist/cli.mjs scripts/probes/_mirror-valgus-jitter-p1.ts
import { SquatAudit } from '../../lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { filmSquat, CLEAN, type SquatShape } from '../../lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat';
import type { PoseFrame } from '../../lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

function read(frames: PoseFrame[]) {
  const audit = new SquatAudit();
  let flaggedFrames = 0, nonStanding = 0, worstL = -Infinity, worstR = -Infinity, legacyMax = 0;
  for (const f of frames) {
    const r = audit.evaluate(f);
    if (f.present && f.landmarks.length) {
      const L = f.landmarks, hipHalf = Math.max(1e-3, Math.abs(L[23].x - L[24].x) / 2);
      legacyMax = Math.max(legacyMax, Math.max(0, L[25].x - L[27].x, L[28].x - L[26].x) / hipHalf);   // the replaced rule
    }
    if (r.present && r.phase !== 'standing' && r.valgusBySide) {
      nonStanding++;
      worstL = Math.max(worstL, r.valgusBySide.left); worstR = Math.max(worstR, r.valgusBySide.right);
      if (r.faults.includes('kneeValgus')) flaggedFrames++;
    }
  }
  return { flaggedFrames, nonStanding, worstL: +worstL.toFixed(2), worstR: +worstR.toFixed(2), legacyMax: +legacyMax.toFixed(2) };
}

const shapes: [string, SquatShape][] = [
  ['both knees 6 cm IN', { shiftL: -0.06, shiftR: -0.06 }],
  ['both knees 5 cm OUT', { shiftL: 0.05, shiftR: 0.05 }],
  ['straight', {}],
  ['left knee 6 cm IN only', { shiftL: -0.06 }],
  ['right knee 6 cm IN only', { shiftR: -0.06 }],
];
console.log('noise-free (warn threshold 0.35 hip half-widths):');
for (const [name, shape] of shapes) console.log(`  ${name.padEnd(24)} ${JSON.stringify(read(filmSquat(shape, CLEAN)))}`);

const N = 50;
let squatsFlagged = 0, frames = 0, flagged = 0, caught = 0;
for (let seed = 1; seed <= N; seed++) {
  const r = read(filmSquat({}, { seed }));
  if (r.flaggedFrames > 0) squatsFlagged++;
  flagged += r.flaggedFrames; frames += r.nonStanding;
  if (read(filmSquat({ shiftL: -0.06, shiftR: -0.06 }, { seed })).flaggedFrames > 0) caught++;
}
console.log(`default synth noise, ${N} seeds:`);
console.log(`  straight squat: ${squatsFlagged}/${N} squats had >= 1 kneeValgus frame; ${flagged}/${frames} non-standing frames flagged`);
console.log(`  knees 6 cm in:  flagged in ${caught}/${N}`);
