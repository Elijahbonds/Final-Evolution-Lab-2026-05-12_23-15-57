#!/usr/bin/env -S npx tsx
// Mirror Coach checks — the guided corrective session (the owner's Playbook,
// coached live): SquatAudit measures the book's four faults, CueEngine speaks
// with a coach's discipline.
//
//   A. SQUAT AUDIT (pure, synthetic pose): valgus measured on the descent,
//      heel rise while descending, lateral shift, depth — and a clean squat
//      reports clean.
//   B. CUE ENGINE (pure): one cue at a time, persistence escalates, a cleared
//      fault earns ONE confirmation then silence, priority = the knee first.
//   C. WIRING: the harness runs the guided flow (breathe → check → work →
//      review) with the book's voice; the compositor routes the squat
//      analysis; the RNT band paints when valgus faults.
//
// Run: npx tsx scripts/mirror-coach-tests.ts

import { readFileSync } from 'node:fs';
import { SquatAudit, type SquatFault } from '../lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CueEngine, FAULT_PRIORITY, type FaultId } from '../lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { POSE_IDX, type PoseFrame, type PoseLandmark } from '../lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── synthetic squat frames ──────────────────────────────────────────────────
interface SquatPose {
  hipY?: number; hipX?: number;       // hip midpoint (y-down image space)
  kneeInL?: number; kneeInR?: number; // knee-inside-ankle offset (image units)
  ankleLift?: number;                 // ankle rise above the floor line
  shoulderX?: number;                 // shoulder midpoint x
}
function squatFrame(t: number, o: SquatPose = {}): PoseFrame {
  const lms: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  const hipX = o.hipX ?? 0.5, hipY = o.hipY ?? 0.5;
  const shX = o.shoulderX ?? 0.5;
  const set = (i: number, x: number, y: number) => { lms[i] = { x, y, z: 0, visibility: 0.95 }; };
  set(POSE_IDX.leftShoulder, shX - 0.12, 0.3); set(POSE_IDX.rightShoulder, shX + 0.12, 0.3);
  set(POSE_IDX.leftHip, hipX - 0.07, hipY); set(POSE_IDX.rightHip, hipX + 0.07, hipY);
  const kneeY = 0.7, ankleY = 0.9 - (o.ankleLift ?? 0);
  set(25, hipX - 0.07 + (o.kneeInL ?? 0), kneeY); set(26, hipX + 0.07 - (o.kneeInR ?? 0), kneeY);
  set(27, hipX - 0.07, ankleY); set(28, hipX + 0.07, ankleY);
  set(POSE_IDX.leftWrist, 0.3, 0.5); set(POSE_IDX.rightWrist, 0.7, 0.5);
  set(POSE_IDX.leftElbow, 0.35, 0.4); set(POSE_IDX.rightElbow, 0.65, 0.4);
  return { landmarks: lms, timestampMs: t, present: true };
}

/** Stand (calibrate), then run one squat: descend, bottom, rise, stand. */
function runSquat(audit: SquatAudit, fault: SquatPose, t0 = 700): SquatFault[] {
  const seen = new Set<SquatFault>();
  let t = t0;
  const down = 12;
  for (let i = 0; i < down; i++) { t += 33; const r = audit.evaluate(squatFrame(t, { ...fault, hipY: 0.5 + (i / down) * 0.24 })); r.faults.forEach((f) => seen.add(f)); }
  for (let i = 0; i < 4; i++) { t += 33; const r = audit.evaluate(squatFrame(t, { ...fault, hipY: 0.74 })); r.faults.forEach((f) => seen.add(f)); }
  for (let i = 0; i < down; i++) { t += 33; const r = audit.evaluate(squatFrame(t, { ...fault, hipY: 0.74 - (i / down) * 0.24 })); r.faults.forEach((f) => seen.add(f)); }
  t += 33; audit.evaluate(squatFrame(t, {}));
  return [...seen];
}

// ── A. the audit measures the book's four faults ────────────────────────────
{
  const calibrate = (a: SquatAudit) => { for (let i = 0; i < 22; i++) a.evaluate(squatFrame(i * 33, {})); };

  const clean = new SquatAudit(); calibrate(clean);
  ok(runSquat(clean, {}).length === 0, 'a clean squat reports no faults');

  const valgus = new SquatAudit(); calibrate(valgus);
  ok(runSquat(valgus, { kneeInL: 0.09 }).includes('kneeValgus'), 'knees inside the ankle line → kneeValgus');

  const heels = new SquatAudit(); calibrate(heels);
  ok(runSquat(heels, { ankleLift: 0.04 }).includes('heelRise'), 'heels lifting on the descent → heelRise');

  const shift = new SquatAudit(); calibrate(shift);
  ok(runSquat(shift, { hipX: 0.56 }).includes('lateralShift'), 'hips off the line → lateralShift');

  const arms = new SquatAudit(); calibrate(arms);
  ok(runSquat(arms, { shoulderX: 0.62 }).includes('armFall'), 'shoulders forward at depth → armFall');

  // visibility gate: a frame without a body reports absent, never a fault
  const blind = new SquatAudit();
  const r = blind.evaluate({ landmarks: [], timestampMs: 0, present: false });
  ok(!r.present && r.faults.length === 0, 'no body → no faults (never fabricated)');
}

// ── B. the coach's discipline ───────────────────────────────────────────────
{
  const ce = new CueEngine();
  const first = ce.decide(1000, ['kneeValgus']);
  ok(first?.level === 'cue' && first.fault === 'kneeValgus', 'a fresh fault earns the base cue');
  ok(ce.decide(2000, ['kneeValgus']) === null, 'hold-down: no second cue inside 6s');
  // priority: the knee outranks the arms
  const ce2 = new CueEngine();
  ok(ce2.decide(1000, ['armFall', 'kneeValgus'])?.fault === 'kneeValgus', 'the knee is cued before the arms');
  ok(FAULT_PRIORITY[0] === 'kneeValgus', 'priority order starts at the knee (the fuse)');
  // persistence escalates
  const ce3 = new CueEngine();
  ce3.decide(1000, ['heelRise']);
  const later = ce3.decide(1000 + 7000 + 12000, ['heelRise']); // held down, then repeat window
  ok(later !== null && (later.level === 'escalate' || later.level === 'regress'), `a surviving fault escalates (got ${later?.level})`);
  // correction confirmed once, then silence
  const ce4 = new CueEngine();
  ce4.decide(1000, ['kneeValgus']);
  ce4.decide(8000, []);                       // fault clears
  const confirm = ce4.decide(8000 + 4500, []); // clear long enough → confirm
  ok(confirm?.level === 'confirm', 'a cleared fault earns "There it is. Own it."');
  ok(ce4.decide(8000 + 4500 + 7000, []) === null, 'then the coach shuts up');
}

// ── C. wiring ───────────────────────────────────────────────────────────────
{
  const h = readFileSync(new URL('../app/play/mirror/_components/mirror-harness.tsx', import.meta.url), 'utf8');
  ok(h.includes("['squat', 'Corrective Squat — guided']"), 'the picker offers the guided corrective squat');
  ok(h.includes("patternRef.current === 'squat'"), 'the squat pattern runs its own analysis');
  ok(h.includes("analysis: patternRef.current === 'squat' ? 'squat' : 'zones'"), 'the compositor is routed by pattern');
  ok(h.includes('cueEngineRef.current.decide('), 'measured faults feed the cue engine');
  ok(h.includes('speak(evt.text)'), 'cues are voiced (on-device speechSynthesis)');
  ok(h.includes('BREATHE FIRST'), 'the session breathes before it moves (the Blueprint)');
  ok(h.includes('breath-pacer'), 'the pacer animates the breath cadence');
  ok(h.includes('MY BAND PULLS IN — YOU PUSH OUT'), 'the RNT perturbation is visible when valgus faults');
  ok(h.includes('REVIEW'), 'the session ends in a review, not a stopwatch');
  const comp = readFileSync(new URL('../lib/babylon/nexus/neuro-mirror/render/overlay-compositor.ts', import.meta.url), 'utf8');
  ok(comp.includes("opts.analysis === 'squat'"), 'the compositor runs SquatAudit when asked');
  ok(comp.includes('pose: frame, squat'), 'squat results ride the frame payload');
}

if (fail.length) {
  console.error(`mirror-coach-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`mirror-coach-tests: ${checks} checks green`);
