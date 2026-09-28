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
// MIRROR-COACH P1 (2026-09-25): the synthetic frame below used to put the subject's LEFT shoulder, hip, knee and
// ankle on the image's LEFT — a mirrored subject. The Mirror's stream is not mirrored (lib/pose/landmarks.ts:9-10,
// mediapipe-adapter.ts:184-187), and on the mirrored fixture the backwards knee check (`lk.x > la.x`) passed. The frame
// now faces the camera the way the app's stream does, knees move IN and OUT on both legs, and the knee is checked in
// both directions. The 3-D version of this, filmed through the app's virtual webcam, is
// lib/babylon/nexus/neuro-mirror/rules/squat-audit.test.ts.
//
// Run: npx tsx scripts/mirror-coach-tests.ts

import { readFileSync } from 'node:fs';
import { SquatAudit, type SquatFault } from '../lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CueEngine, FAULT_PRIORITY, VALGUS_CUE_VERIFIED, type FaultId } from '../lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { POSE_IDX, type PoseFrame, type PoseLandmark } from '../lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── synthetic squat frames ──────────────────────────────────────────────────
interface SquatPose {
  hipY?: number; hipX?: number;       // hip midpoint (y-down image space)
  kneeInL?: number; kneeInR?: number; // knee offset toward the MIDLINE (image units); negative = pushed out
  ankleLift?: number;                 // ankle rise above the floor line
  shoulderX?: number;                 // shoulder midpoint x
}
/** Facing the camera, NOT mirrored: the subject's LEFT side is on the image's RIGHT (+x). */
function squatFrame(t: number, o: SquatPose = {}): PoseFrame {
  const lms: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  const hipX = o.hipX ?? 0.5, hipY = o.hipY ?? 0.5;
  const shX = o.shoulderX ?? 0.5;
  const set = (i: number, x: number, y: number) => { lms[i] = { x, y, z: 0, visibility: 0.95 }; };
  set(POSE_IDX.leftShoulder, shX + 0.12, 0.3); set(POSE_IDX.rightShoulder, shX - 0.12, 0.3);
  set(POSE_IDX.leftHip, hipX + 0.07, hipY); set(POSE_IDX.rightHip, hipX - 0.07, hipY);
  const kneeY = 0.7, ankleY = 0.9 - (o.ankleLift ?? 0);
  // inward is toward the midline: −x for the left leg (on the right of the image), +x for the right leg
  set(25, hipX + 0.07 - (o.kneeInL ?? 0), kneeY); set(26, hipX - 0.07 + (o.kneeInR ?? 0), kneeY);
  set(27, hipX + 0.07, ankleY); set(28, hipX - 0.07, ankleY);
  set(POSE_IDX.leftWrist, 0.7, 0.5); set(POSE_IDX.rightWrist, 0.3, 0.5);
  set(POSE_IDX.leftElbow, 0.65, 0.4); set(POSE_IDX.rightElbow, 0.35, 0.4);
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

  // the fixture faces the camera the way the app's stream does (left side on the image's right)
  const f0 = squatFrame(0);
  ok(f0.landmarks[POSE_IDX.leftShoulder].x > f0.landmarks[POSE_IDX.rightShoulder].x, 'fixture is not mirrored: left shoulder on the image right');

  // knee valgus, both legs, both directions
  const fresh = () => { const a = new SquatAudit(); calibrate(a); return a; };
  ok(runSquat(fresh(), { kneeInL: 0.09 }).includes('kneeValgus'), 'LEFT knee caving in → kneeValgus');
  ok(runSquat(fresh(), { kneeInR: 0.09 }).includes('kneeValgus'), 'RIGHT knee caving in → kneeValgus');
  ok(runSquat(fresh(), { kneeInL: 0.09, kneeInR: 0.09 }).includes('kneeValgus'), 'both knees caving in → kneeValgus');
  ok(!runSquat(fresh(), { kneeInL: -0.09 }).includes('kneeValgus'), 'LEFT knee pushed OUT → no kneeValgus (the old rule flagged this)');
  ok(!runSquat(fresh(), { kneeInR: -0.09 }).includes('kneeValgus'), 'RIGHT knee pushed OUT → no kneeValgus (the old rule flagged this)');
  ok(!runSquat(fresh(), { kneeInL: -0.09, kneeInR: -0.09 }).includes('kneeValgus'), 'both knees pushed OUT → no kneeValgus');
  // and per side: the caving leg reads inward, the other does not
  {
    const a = fresh();
    let t = 700, worstL = -Infinity, worstR = -Infinity;
    for (let i = 0; i < 12; i++) {
      t += 33;
      const r = a.evaluate(squatFrame(t, { kneeInL: 0.09, hipY: 0.5 + (i / 12) * 0.24 }));
      if (r.valgusBySide && r.phase !== 'standing') { worstL = Math.max(worstL, r.valgusBySide.left); worstR = Math.max(worstR, r.valgusBySide.right); }
    }
    ok(worstL > 0.35 && worstR < 0.35, `per side: left reads inward, right does not (L ${worstL.toFixed(2)} R ${worstR.toFixed(2)})`);
  }

  const heels = new SquatAudit(); calibrate(heels);
  ok(runSquat(heels, { ankleLift: 0.04 }).includes('heelRise'), 'heels lifting on the descent → heelRise');

  const shift = new SquatAudit(); calibrate(shift);
  ok(runSquat(shift, { hipX: 0.56 }).includes('lateralShift'), 'hips off the line → lateralShift');

  // armFall is read from the shoulder midpoint's x: a SIDEWAYS drift (a front camera cannot see forward)
  const arms = new SquatAudit(); calibrate(arms);
  ok(runSquat(arms, { shoulderX: 0.62 }).includes('armFall'), 'shoulders drifting sideways at depth → armFall');

  // visibility gate: a frame without a body reports absent, never a fault
  const blind = new SquatAudit();
  const r = blind.evaluate({ landmarks: [], timestampMs: 0, present: false });
  ok(!r.present && r.faults.length === 0, 'no body → no faults (never fabricated)');
}

// ── B. the coach's discipline ───────────────────────────────────────────────
// MIRROR-COACH P2 (2026-09-26): the knee cue is ON (owner decision #19, verified on synthetic geometry only, behind the
// audit's squareness gate — squat-audit.ts squareOn). Switched off, the engine still says nothing about the knee.
{
  ok(VALGUS_CUE_VERIFIED === true, 'the knee cue is on (VALGUS_CUE_VERIFIED=true, synthetic proof)');
  const prod = new CueEngine();
  ok(prod.decide(1000, ['kneeValgus'])?.fault === 'kneeValgus', 'production engine: the knee is cued');
  const off = new CueEngine({ valgusVerified: false });
  ok(off.decide(1000, ['kneeValgus']) === null, 'switched off: no knee cue');
  ok(new CueEngine({ valgusVerified: false }).decide(1000, ['kneeValgus', 'heelRise'])?.fault === 'heelRise', 'switched off: the next fault still gets the voice');

  const ce = new CueEngine({ valgusVerified: true });
  const first = ce.decide(1000, ['kneeValgus']);
  ok(first?.level === 'cue' && first.fault === 'kneeValgus', 'a fresh fault earns the base cue');
  ok(ce.decide(2000, ['kneeValgus']) === null, 'hold-down: no second cue inside 6s');
  // priority: the knee outranks the arms
  const ce2 = new CueEngine({ valgusVerified: true });
  ok(ce2.decide(1000, ['armFall', 'kneeValgus'])?.fault === 'kneeValgus', 'the knee is cued before the arms');
  ok(FAULT_PRIORITY[0] === 'kneeValgus', 'priority order starts at the knee');
  // persistence escalates
  const ce3 = new CueEngine();
  ce3.decide(1000, ['heelRise']);
  const later = ce3.decide(1000 + 7000 + 12000, ['heelRise']); // held down, then repeat window
  ok(later !== null && (later.level === 'escalate' || later.level === 'regress'), `a surviving fault escalates (got ${later?.level})`);
  // correction confirmed once, then silence
  const ce4 = new CueEngine({ valgusVerified: true });
  ce4.decide(1000, ['kneeValgus']);
  ce4.decide(8000, []);                       // fault clears
  const confirm = ce4.decide(8000 + 4500, []); // clear long enough → confirm
  ok(confirm?.level === 'confirm', 'a cleared fault earns "There it is. Own it."');
  ok(ce4.decide(8000 + 4500 + 7000, []) === null, 'then the coach shuts up');
}

// ── C. wiring ───────────────────────────────────────────────────────────────
{
  const h = readFileSync(new URL('../app/play/mirror/_components/mirror-harness.tsx', import.meta.url), 'utf8');
  // Matched on the pattern title map rather than one literal tuple, and case-insensitively on the stage copy:
  // the guided flow is the contract, the exact shouting is not.
  ok(/squat:\s*'Corrective Squat'/.test(h), 'the picker offers the guided corrective squat');
  ok(h.includes("patternRef.current === 'squat'"), 'the squat pattern runs its own analysis');
  ok(h.includes("analysis: patternRef.current === 'squat' ? 'squat' : 'zones'"), 'the compositor is routed by pattern');
  ok(h.includes('cueEngineRef.current.decide('), 'measured faults feed the cue engine');
  ok(h.includes('speak(evt.text)'), 'cues are voiced (on-device speechSynthesis)');
  ok(/breathe first/i.test(h), 'the session breathes before it moves (the Blueprint)');
  ok(h.includes('fel-breath'), 'the pacer animates the breath cadence');
  // The negative checks read the CODE, not the comments that explain what was removed.
  const code = h.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // MIRROR-COACH P1 (2026-09-25): there is no band, and an unverified knee read is never painted as a correction
  ok(!/MY BAND|band pulls/i.test(code), 'no overlay claims a band');
  ok(h.includes('paintSkeleton(pose, p, paintableFaults(was, cueableFaults(squat.faults)))'), 'the knee overlay only paints a CUEABLE knee fault');
  ok(/VALGUS_CUE_VERIFIED && faults\.includes\('kneeValgus'\)/.test(h), 'the knee overlay is behind VALGUS_CUE_VERIFIED');
  // MIRROR-COACH P1 review (2026-09-25): "Recording" on a live camera page reads as the video being recorded, and
  // nothing is — the row says the knee is MEASURED, and no knee copy the athlete sees says "record".
  ok(h.includes("'Measured · not judged yet'"), 'the knee check row says it is measured, not judged');
  ok(!/record/i.test((code.match(/!judged \? '[^']*'/) ?? [''])[0]), 'the knee check row never says "record"');
  ok(/Knee tracking is measured but not judged yet/.test(h) && !/Knee tracking is recorded/.test(code), 'the review says measured, not recorded');
  // "held" is measured on the last reps, not inferred from the cue log (lib/mirror/squatStage.ts squatReviewVerdict)
  ok(h.includes('squatReviewVerdict(squatWorkReps, cueLog'), 'the review\'s verdict comes from the reps');
  ok(!/The correction held by the end of the set/.test(code), 'no "the correction held" line inferred from the cue levels');
  ok(h.includes("!seen ? (live ? 'Not in view' : 'Waiting for the camera')"), 'no check row says "stable" without a body in view');
  // the stage transition is a pure step, applied once per frame — never counted inside a React updater
  ok(h.includes('stepSquatSession(squatSessionRef.current'), 'the squat stage steps through the pure stepSquatSession');
  ok(!/setSquatStage\(\(/.test(code), 'no setSquatStage((…) => …) updater (it counted reps and fired cues as side effects)');
  // the screen: the runner follows the picker, the post carries the variant that ran, and nothing ungraded is scored
  ok(h.includes('new ScreenRunner(screenIdRef.current)'), 'the screen runner is built from the picker\'s CURRENT value');
  ok(h.includes('submitScreen(runner.results, runner.screen)'), 'the screen posts the variant the runner ran');
  ok(!/provisional/.test(code), 'an ungraded screen is not sent as provisional (that earned a retry prompt)');
  ok(h.includes('screenSummary.graded ?') && h.includes('{NOT_GRADED_LINE}'), 'an ungraded screen shows the not-graded line, not a score');
  // P1 review: the ungraded branch showed ONLY that line, so "it could not be saved" was never seen (every screen is ungraded)
  ok(/\{NOT_GRADED_LINE\}<\/p>\s*\{screenMessage && screenMessage !== NOT_GRADED_LINE/.test(h), 'an ungraded screen still says when it could not be saved');
  ok(h.includes('{screenSummary.headline}'), 'a graded screen shows its headline (a partial one says it is not clear)');
  ok(h.includes('if (!res.ok) { setScreenMessage(SCREEN_NOT_SAVED); return; }'), 'a refused screen post says it was not saved');
  ok(!/Weight stays centered|Heels lifting \(dorsiflexion limit\)/.test(code), 'one spelling (centred), and no cause the camera cannot see');
  ok(h.includes('label="Movement flags"') && !h.includes('label="Red flags"'), 'movement faults are "Movement flags", not "Red flags"');
  ok(/>Review\.?</i.test(h) || /squatStage === 'review'/.test(h), 'the session ends in a review, not a stopwatch');
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
