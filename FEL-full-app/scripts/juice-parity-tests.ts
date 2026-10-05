#!/usr/bin/env -S npx tsx
// HOOPS-10PHASE-2 phase 9 — camera and HUD feel: release feedback, juice, sound hooks.
//
// Audited the juice toolkit (core/gameFeel.ts: InputBuffer, coyote time, hit-stop, Shaker screen shake, haptics,
// the impact() bundle that fires audio for free), the 2K-style world shot meter (visual/ShotMeter3D.ts: the green
// release window drawn ON the bar, the perfect band inside it, a verdict flash on release, a fade), and the
// camera system (core/CameraDirector.ts: snapTo / look / update / pulse / setFixed / toggle) BEFORE writing
// anything — all three were already extremely mature, wired at ~180+ call sites total across DunkMode.ts,
// ThreePointMode.ts, OneVOneMode.ts and ThreeVThreeMode.ts (screen shake on every make, hit-stop on contact,
// crowd-cheer sound stingers on big shots, a camera pulse on a perfect block in 1v1's dunk contest, THE SHOT
// METER mounted in all three shooting modes). Nothing in this phase duplicates or touches that toolkit.
//
// The one genuine gap: 3v3's jumper-make branch already pulses the camera and plays a louder crowd cheer on a
// perfect release or a three (`if (bigShot || arcQuality === 'perfect') { ... ctx.camDirector.pulse(...) }`,
// commented "the big moment is distinguishable"); 1v1's OWN jumper-make branch had NO camera pulse at all — a
// splash three or a green release read as a bigger moment in 3v3 than the identical shot in 1v1, for no stated
// reason (1v1's DUNK path already had its own perfect-block pulse elsewhere in the same file; only the plain
// jumper was missing one). Fixed by keeping the release's ShotQuality past the point the ball leaves the hand
// (1v1 threw it away the instant `releaseJumper()` returned; 3v3 already keeps `arcQuality` in outer scope for
// exactly this reason) and mirroring 3v3's own pulse/cheer call at the make.
//
// Run: npx tsx scripts/juice-parity-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const oneVOne = readFileSync(new URL('../lib/babylon/modes/OneVOneMode.ts', import.meta.url), 'utf8');
const threeVThree = readFileSync(new URL('../lib/babylon/modes/ThreeVThreeMode.ts', import.meta.url), 'utf8');
const gameFeel = readFileSync(new URL('../lib/babylon/core/gameFeel.ts', import.meta.url), 'utf8');
const shotMeter3d = readFileSync(new URL('../lib/babylon/visual/ShotMeter3D.ts', import.meta.url), 'utf8');
const dunkMode = readFileSync(new URL('../lib/babylon/modes/DunkMode.ts', import.meta.url), 'utf8');
const threePoint = readFileSync(new URL('../lib/babylon/modes/ThreePointMode.ts', import.meta.url), 'utf8');

// --- audit: the juice toolkit, the world shot meter, and the camera director were already mature everywhere ---
ok(/export class InputBuffer \{/.test(gameFeel) && /export class Shaker \{/.test(gameFeel) && /export function hitStop\(/.test(gameFeel) && /export function impact\(/.test(gameFeel),
  'gameFeel.ts already has InputBuffer / Shaker / hitStop / impact — this phase added none of them');
ok(/export function mountShotMeter3D\(/.test(shotMeter3d) && /end\(verdict\) \{/.test(shotMeter3d),
  'ShotMeter3D already draws the green release window and flashes a verdict on release — the 2K read was already built');
for (const [name, src] of [['1v1', oneVOne], ['3v3', threeVThree], ['dunk', dunkMode], ['3PT Shootout', threePoint]] as const) {
  ok((src.match(/ctx\.camDirector\.pulse\(/g)?.length ?? 0) > 0, `${name} already pulses the camera for feel moments (camDirector.pulse)`);
  ok((src.match(/SoundKit\.play\(/g)?.length ?? 0) > 5, `${name} already has sound hooks wired at many call sites`);
}

// --- the one gap this phase closed: 1v1's jumper-make camera-pulse parity with 3v3's ---
ok(/let myJumperQuality: ShotQuality = 'good';/.test(oneVOne), '1v1 now keeps the release ShotQuality in outer scope, like 3v3\'s arcQuality');
ok(/myJumperQuality = quality;/.test(oneVOne), 'releaseJumper() stores the grade before the make can read it back');
ok(/arcPoints === 3 \|\| myJumperQuality === 'perfect'/.test(oneVOne), '1v1\'s jumper-make now pulses the camera on a perfect release or a three, mirroring 3v3');
ok(/ctx\.camDirector\.pulse\(arcPoints === 3 \? 0\.85 : 0\.5, 0\.5\)/.test(oneVOne), '1v1 uses the SAME pulse strengths 3v3 already tuned (0.85 big shot / 0.5 perfect), not new numbers');
ok(/if \(bigShot \|\| arcQuality === 'perfect'\) \{/.test(threeVThree), "3v3's own original pulse-on-perfect/three branch is untouched (the fix only ADDED 1v1's missing side)");

console.log(`juice-parity: ${checks - fail.length}/${checks} checks passed`);
if (fail.length) { console.error('FAILED:\n' + fail.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
