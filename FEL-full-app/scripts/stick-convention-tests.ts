#!/usr/bin/env -S npx tsx
// Stick-space vs intent-space — the two halves that never agreed.
//
// HARDWARE reports up as NEGATIVE y. The Gamepad API's axes[1] is -1 pushed up,
// InputBus maps W to -1 to match, and the touch stick derives y from a screen
// delta so up is negative there too. All three agree with each other.
//
// The MOVEMENT layer means the opposite. CourtMovement documents
// "+Y = up-stick = forward/away from camera = -Z on court" and implements it as
// wantDir = (moveX, 0, -moveY). Every world-direction caller feeds it that way:
// CombatMovement passes -wish.z, the basketball AI brains return -dir.z,
// lockTarget aims with -aimY.
//
// Nothing bridged the two, so a HUMAN pressing forward walked backwards while
// every AI on the same court moved correctly — and it was invisible because
// each half was internally consistent. LocalInputSource is the seam, and this
// asserts the seam holds.

import { Vector3 } from '@babylonjs/core';
import { LocalInputSource } from '../lib/babylon/core/PlayerSlot';
import { CourtMovement, DEFAULT_MOVEMENT } from '../lib/babylon/core/CourtMovement';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. the adapter flips the sign ──────────────────────────────────────────
const src = new LocalInputSource();
src.feed({ t: 'stick', side: 'L', x: 0, y: -1 });        // stick UP (hardware)
ok(src.poll().moveY > 0.99,
  'A1 stick UP (hardware y = -1) becomes intent moveY = +1, which is what ' +
  'CourtMovement documents as up-stick');

src.feed({ t: 'stick', side: 'L', x: 0, y: 1 });         // stick DOWN
ok(src.poll().moveY < -0.99, 'A2 stick DOWN becomes intent moveY = -1');

src.feed({ t: 'stick', side: 'L', x: 1, y: 0 });
ok(Math.abs(src.poll().moveX - 1) < 1e-6, 'A3 X is untouched — only Y disagreed');

// ── B. forward is FORWARD on the court ─────────────────────────────────────
// The whole point: pressing up must move the player away from the camera, which
// is -Z. Driven through the real movement model, not a reimplementation of it.
const move = new CourtMovement(DEFAULT_MOVEMENT);
const s2 = new LocalInputSource();
s2.feed({ t: 'stick', side: 'L', x: 0, y: -1 });          // hold UP
const intent = s2.poll();
for (let i = 0; i < 30; i++) move.update(1 / 60, intent.moveX, intent.moveY, false);
ok(move.vel.z < -0.5,
  `B1 holding UP moves the player toward -Z, away from the camera (vel.z ${move.vel.z.toFixed(2)}). ` +
  'This is the bug that made "press forward" walk you away from the basket.');

const back = new CourtMovement(DEFAULT_MOVEMENT);
const s3 = new LocalInputSource();
s3.feed({ t: 'stick', side: 'L', x: 0, y: 1 });           // hold DOWN
const i3 = s3.poll();
for (let i = 0; i < 30; i++) back.update(1 / 60, i3.moveX, i3.moveY, false);
ok(back.vel.z > 0.5, `B2 holding DOWN moves toward +Z (vel.z ${back.vel.z.toFixed(2)})`);

// ── C. world-direction callers still round-trip ────────────────────────────
// CombatMovement and the AI brains convert a world direction into intent-space
// as moveY = -dir.z. That convention must survive untouched — it is the half
// that was always right, and "fixing" CourtMovement instead would have broken
// every one of them.
const wish = new Vector3(0, 0, -1);                        // want to go -Z
const ai = new CourtMovement(DEFAULT_MOVEMENT);
for (let i = 0; i < 30; i++) ai.update(1 / 60, wish.x, -wish.z, false);
ok(ai.vel.z < -0.5,
  `C1 a world-direction caller asking for -Z still gets -Z (vel.z ${ai.vel.z.toFixed(2)})`);

// ── D. a human and an AI asking for the same thing agree ───────────────────
// The actual symptom: on one court, the AI moved correctly and the human did
// the opposite. Same requested direction, same resulting velocity.
ok(Math.sign(move.vel.z) === Math.sign(ai.vel.z),
  'D1 a human pressing forward and an AI steering forward move the SAME way — ' +
  'they did not, and that is what shipped');

if (fail.length) {
  console.error(`stick-convention-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`stick-convention-tests: ${checks} checks green — hardware and movement agree on forward`);
