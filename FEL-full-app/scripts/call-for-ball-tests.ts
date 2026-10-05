#!/usr/bin/env -S npx tsx
// CALL FOR THE BALL (Elijah item 2, Oct 3 2026 9:35 PM PT) — 2K-style: off the ball, the existing PASS
// button calls for it instead of throwing it. ThreeVThreeMode.ts is one giant closure (load/onInput/
// update/dispose share private state that is never exported), so — matching this repo's own precedent
// for testing that file (scripts/threevthree-depth-tests.ts section C) — the mode-internal wiring is
// checked at the SOURCE level: the behaviour this feature promises is grep'd for by name, not guessed at.
// What CAN run for real (PassFlight, the modeVerbs config, the HUD value type) runs for real below it.
//
// Run: npx tsx scripts/call-for-ball-tests.ts

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import { PassFlight } from '../lib/babylon/core/BallHandling';
import { MODE_VERBS } from '../lib/babylon/ui/modeVerbs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. ThreeVThreeMode: the call is wired on the SAME press as the pass ────
{
  const src = readFileSync(new URL('../lib/babylon/modes/ThreeVThreeMode.ts', import.meta.url), 'utf8');
  ok(/function callForBall/.test(src), 'a callForBall handler exists');
  ok(/carrierId === 'mate0' \|\| carrierId === 'mate1'[^)]*\) *&& *!ended\)\s*\{\s*\/\/[^\n]*\n\s*callForBall\(ctx\)/.test(src),
    'pressing A (the pass button) while a mate carries calls callForBall, not the throw path');
  // busy: mid-shot, stunned/trapped, or down — the call is heard either way, the throw only fires when free
  ok(/const busy = mateShooting \|\| body\.stunSec > 0 \|\| body\.floored/.test(src),
    'busy reads mid-shot (mateShooting), stunned/trapped (stunSec) and down (floored)');
  ok(/if \(busy\) \{[^}]*return;\s*\}/.test(src), 'a busy mate answers the call but does not throw it — the AI flow stands');
  ok(src.includes("ctx.juice.callout('BALL!'"), 'a BALL! callout fires either way — the press is never silent');
  ok(/passTargetId = 'me'/.test(src), "the mate's pass targets 'me' (passTargetId's widened type)");
  ok(/lastPasserWasMe = false;\s*\/\/ the mate threw this one/.test(src), 'no stray assist credit from a call-for-ball catch');
  ok(/const toMe = leadPoint\(body\.char\.root\.position, me\.char\.root\.position, me\.drib\.vel, PASS_SPEED\.chest\)/.test(src) &&
     /passFlight\.start\(body\.char\.root\.position\.add\(new Vector3\(0, 1\.2, 0\)\), toMe, 'chest', 1\);/.test(src),
    'the ball actually flies mate → hero (PassFlight, same system a human throw uses — now led toward "me" via leadPoint, HOOPS-10PHASE-2 phase 6)');
  ok(/if \(!\(carrierId === 'mate0' \|\| carrierId === 'mate1'\) \|\| passFlight\.active\) return;/.test(src),
    'a call with no mate carrying, or a pass already in flight, is a no-op (one pass at a time)');
  ok(/ctx\.setHud\(\{ onBall: iAmCarrier \}\);/.test(src), 'the HUD publishes onBall every frame for the touch pad to read');
}

// ── B. phone pad: PASS retitles to BALL! only off the ball ─────────────────
{
  const cfg = MODE_VERBS.threevthree;
  const passSlot = cfg.buttons[0];   // A, B, X, Y order
  ok(passSlot.label === 'PASS', "3v3's A slot is PASS on the ball (unchanged — this feature retitles, doesn't rebind)");
  ok(passSlot.emit !== null && passSlot.emit.t === 'button' && (passSlot.emit as { btn: string }).btn === 'A',
    'PASS still emits button A — the call-for-ball reuses the identical input, not a new one');

  const src = readFileSync(new URL('../components/games/three-v-three-babylon.tsx', import.meta.url), 'utf8');
  ok(/overrides=\{hud\.onBall === false \? \{ A: \{ label: 'BALL!'/.test(src),
    "the host component swaps the A slot's label to BALL! exactly when onBall reads false");

  const overlaySrc = readFileSync(new URL('../lib/babylon/ui/TouchOverlay.tsx', import.meta.url), 'utf8');
  ok(/overrides\?: Partial<Record<'A' \| 'B' \| 'X' \| 'Y', Partial<VerbButton>>>/.test(overlaySrc),
    'TouchOverlay accepts a per-slot label/color override without touching emit/hold');
}

// ── C. a mate-initiated pass flies and is caught exactly like a human one ──
// (PassFlight itself does not know or care who threw it — proving it completes mate→hero confirms the
// 'me' target this feature introduces is mechanically identical to every mate→mate pass already shipped.)
{
  const DT = 1 / 60;
  const mate = new Vector3(-3, 1.2, 5);
  const hero = new Vector3(0, 1.2, 6);
  const flight = new PassFlight();
  flight.start(mate, hero, 'chest');
  let ticks = 0; let caught = false;
  const ball = mate.clone();
  while (ticks < 240 && !caught) { caught = flight.step(DT, ball); ticks++; }
  ok(caught, `a mate→hero chest pass completes (caught after ${ticks} ticks)`);
  ok(Vector3.Distance(ball, hero) < 0.05, `the ball lands at the hero's hands (off by ${Vector3.Distance(ball, hero).toFixed(3)}m)`);
}

// ── D. 3PT Shootout: no rebounder/passer exists, so no call-back is added there ──
{
  const src = readFileSync(new URL('../lib/babylon/modes/ThreePointMode.ts', import.meta.url), 'utf8');
  ok(!/rebounder|rebound er/i.test(src), '3PT Shootout has no rebounder concept to hook a call-for-ball into (confirms the brief\'s skip note)');
}

// ── report ─────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`call-for-ball-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`call-for-ball-tests: ${checks} checks green`);
