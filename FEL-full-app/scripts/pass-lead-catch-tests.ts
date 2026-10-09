#!/usr/bin/env -S npx tsx
// HOOPS-10PHASE-2 phase 6 — passing with LEAD targeting and a catch/receive animation.
//
// Lead targeting and the catch beat are pure-logic-free additions on top of an already-complete passing stack
// (lockTarget = WHICH teammate the stick aims at; choosePassType = chest/bounce/lob + the alley-oop read). Neither
// of those was touched. What was missing: (1) every pass always flew to the target's position AT THROW TIME, so a
// cutter had to break stride or reach back for it — leadPoint() (BallHandling.ts, its own unit tests) now aims
// ahead of a moving target's velocity; (2) giveBallTo() snapped the ball into the hand with no body beat at all —
// a new bball_catch pose clip (authored/basketball.ts, the house buildPoseClip pattern) now plays on the receiver.
// 1v1 has no pass mechanic (confirmed in phase 4) so this phase is 3v3-only, same as call-for-ball.
//
// Run: npx tsx scripts/pass-lead-catch-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const mode = readFileSync(new URL('../lib/babylon/modes/ThreeVThreeMode.ts', import.meta.url), 'utf8');
const ballHandling = readFileSync(new URL('../lib/babylon/core/BallHandling.ts', import.meta.url), 'utf8');
const basketball = readFileSync(new URL('../lib/babylon/anim/authored/basketball.ts', import.meta.url), 'utf8');
const animIndex = readFileSync(new URL('../lib/babylon/anim/authored/index.ts', import.meta.url), 'utf8');

// --- lead targeting: the pure function exists, is exported, and is shared with PassFlight's own speed table ---
ok(/export const PASS_SPEED: Record<PassType, number> = \{ chest: 14, lob: 9, bounce: 10 \};/.test(ballHandling),
  'BallHandling exports the per-type pass speed table (the same numbers PassFlight already threw at)');
ok(/export function leadPoint\(from: Vector3, targetPos: Vector3, targetVel: Vector3, passSpeed: number\): Vector3 \{/.test(ballHandling),
  'BallHandling exports a pure leadPoint(from, targetPos, targetVel, passSpeed) function');
ok(/this\.duration = Math\.max\(0\.14, dist \/ \(PASS_SPEED\[type\] \* speedMult\)\);/.test(ballHandling),
  'PassFlight.start reads the shared PASS_SPEED table instead of its own hardcoded 14/9/10');
ok(!/14 : type === 'lob' \? 9 : 10/.test(ballHandling), 'the old inline 14/9/10 ternary is gone, not duplicated alongside the table');

// --- 3v3 wiring: both throw sites (the teammate pass and the call-for-ball return pass) lead their target ---
ok(mode.includes("leadPoint, PASS_SPEED } from '../core/BallHandling';"), '3v3 imports leadPoint and PASS_SPEED from BallHandling');
ok(/const toMe = leadPoint\(body\.char\.root\.position, me\.char\.root\.position, me\.drib\.vel, PASS_SPEED\.chest\)/.test(mode),
  'call-for-ball leads the return pass with "me"\'s own velocity (the human may be cutting toward the ball)');
ok(/passFlight\.start\(body\.char\.root\.position\.add\(new Vector3\(0, 1\.2, 0\)\), toMe, 'chest', 1\);/.test(mode),
  'call-for-ball throws at the led point, not the bare position it used to');
ok(/const toTarget = type === 'lob'/.test(mode) && /: leadPoint\(ball\.getAbsolutePosition\(\), locked\.pos, mateVel\[locked\.id === 'mate0' \? 0 : 1\], PASS_SPEED\[type\]/.test(mode),
  'the main teammate pass leads chest/bounce throws with the mate\'s tracked velocity');
ok(/type === 'lob'\s*\n\s*\? locked\.pos\.add\(new Vector3\(0, 1\.2, 0\)\)/.test(mode),
  'the lob keeps its OWN target (no double-lead on top of the alley-oop\'s cutting-speed timing read)');
ok(/passFlight\.start\(\s*\n\s*ball\.getAbsolutePosition\(\),\s*\n\s*toTarget,/.test(mode),
  'the main pass throws at the (conditionally led) toTarget, not the bare locked.pos it used to');

// --- lockTarget / choosePassType untouched: leading changes WHERE it aims, never WHICH teammate or WHAT type ---
ok(/const locked = lockTarget\(me\.char\.root\.position, meIntent\.moveX, meIntent\.moveY, targets, foePositions\(\)\);/.test(mode),
  'lockTarget still decides WHICH teammate from the raw stick aim, untouched by leading');
ok(/const type = aimed \? 'chest' : choosePassType\(me\.char\.root\.position, locked\.pos, foePositions\(\), \{ rim: RIM, targetVel: mateVel\[locked\.id === 'mate0' \? 0 : 1\] \}\);/.test(mode),
  'choosePassType still reads the mate\'s RAW current position (locked.pos), not the led point — the corridor/alley-oop read is unchanged');

// --- catch/receive animation: a real clip, registered, and played on the receiver on arrival (not on the lob) ---
ok(/export function buildCatchBall\(scene: Scene, sk: Skeleton\): AnimationGroup \| null \{/.test(basketball),
  'basketball.ts authors a buildCatchBall pose clip (the house buildPoseClip pattern, no external asset)');
ok(/buildPoseClip\(scene, sk, 'bball_catch', 0\.22,/.test(basketball), 'the clip is named bball_catch (auto-scopes to the hoops suite by prefix)');
ok(animIndex.includes("buildCatchBall } from './basketball';") && animIndex.includes("['bball_catch', () => buildCatchBall(scene, skeleton)],"),
  'bball_catch is imported and registered in the authored clip index');
ok(/giveBallTo\(passTargetId\);\s*\n\s*\/\/ HOOPS-10PHASE-2 phase 6: the catch/.test(mode),
  'the catch beat plays right after giveBallTo on arrival, not before (the hand already has the ball when it plays)');
ok(/\(passTargetId === 'me' \? me : mates\[passTargetId === 'mate0' \? 0 : 1\]\)\.tree\.beat\('bball_catch', \{ fadeSec: 0\.05 \}\);/.test(mode),
  'the catch beat plays on whichever body actually received it (me OR the mate), not a fixed one');
{
  const lobIdx = mode.indexOf("if (passType === 'lob') {");
  const lobReturnIdx = mode.indexOf('return;', lobIdx);
  const catchBeatIdx = mode.indexOf("tree.beat('bball_catch'", lobIdx);
  ok(lobIdx > -1 && lobReturnIdx > -1 && catchBeatIdx > lobReturnIdx,
    'the lob branch returns BEFORE the catch beat — the alley-oop goes straight into its finish, by design, with no catch pose in between');
}

// --- 1v1 untouched: it has no pass mechanic at all, confirmed in phase 4; this phase must not add one ---
const oneVOne = readFileSync(new URL('../lib/babylon/modes/OneVOneMode.ts', import.meta.url), 'utf8');
ok(!/leadPoint|bball_catch/.test(oneVOne), '1v1 gets no leadPoint/catch wiring — it has no pass mechanic to lead or catch into');

console.log(`pass-lead-catch: ${checks - fail.length}/${checks} checks passed`);
if (fail.length) { console.error('FAILED:\n' + fail.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
