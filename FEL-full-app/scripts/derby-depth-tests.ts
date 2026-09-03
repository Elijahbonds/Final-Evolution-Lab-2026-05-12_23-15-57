#!/usr/bin/env -S npx tsx
// Derby depth pass — MLB The Show's hitting is TWO reads, and the camera
// follows the ball like a broadcast.
//
//   PITCH TYPES (the lock's D2, "a later pass" — this is it): fastball /
//   slider / changeup. The slider aims at one spot and BREAKS LATE to
//   another — simulate the mode's own integration and prove the ball arrives
//   where pitchSpec says the PCI must be. The changeup's timing window must
//   divide by ITS speed, not the round-one fastball's.
//   THE CAMERA: after contact the subject is the ball and the director is in
//   follow (a parked swing cam pans too slowly for a pulled fly — measured);
//   at the next pitch it CUTS to the fixed swing spot (easing home spent ~2s
//   with the batter off-frame — measured).
//   THE WALL: a constant 38m from the plate along the whole arc — "did it
//   clear?" needs the wall to mean the same thing everywhere.
//
// Run: npx tsx scripts/derby-depth-tests.ts

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import { pitchSpec, ZONE_HALF } from '../lib/babylon/modes/precisionModes';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. the pitch mix is real and deterministic ─────────────────────────────
{
  const types = Array.from({ length: 10 }, (_, i) => pitchSpec(i + 1).type);
  ok(types[0] === 'fastball' && types[1] === 'fastball', 'the first two pitches are fastballs (you learn the timing)');
  ok(types.includes('slider'), 'sliders exist in the ten');
  ok(types.includes('changeup'), 'changeups exist in the ten');
  ok(JSON.stringify(types) === JSON.stringify(Array.from({ length: 10 }, (_, i) => pitchSpec(i + 1).type)),
    'the mix is deterministic — the driver and the mode read the same pitch');
  ok(pitchSpec(3).arrive.x !== pitchSpec(3).aim.x, 'the slider arrives somewhere other than its aim');
  ok(pitchSpec(5).speed < pitchSpec(4).speed, 'the changeup takes speed off');
  for (let r = 1; r <= 10; r++) {
    const s = pitchSpec(r);
    ok(Math.abs(s.aim.x) <= 0.8 * ZONE_HALF.x + 1e-9, `r${r} aim inside the zone's x reach`);
    ok(s.arrive.y > 0.4 && s.arrive.y < 1.8, `r${r} arrives in the hittable band`);
  }
}

// ── B. the break lands where the spec says ─────────────────────────────────
// Integrate the mode's own flight: launch at the aim point, then lateral
// accel armed for the last 45% of the flight — exactly DerbyMode.pitch/update.
{
  for (const round of [3, 6, 9]) {                 // the slider rounds
    const spec = pitchSpec(round);
    const speed = spec.speed;
    const t = 17.5 / speed;
    const breakA = (2 * spec.breakShift) / Math.pow(0.45 * t, 2);
    // linear flight in x (launch x-vel) + break accel after 55%
    const from = new Vector3(spec.aim.x * 0.4, 1.5, 17.5);
    const vx = (spec.aim.x - from.x) / t;
    let x = from.x, vBreak = 0;
    const DT = 1 / 240;
    for (let tt = 0; tt < t; tt += DT) {
      x += vx * DT;
      if (tt > t * 0.55) { vBreak += breakA * DT; x += vBreak * DT; }
    }
    ok(Math.abs(x - spec.arrive.x) < 0.05,
      `r${round} slider lands at the spec (got ${x.toFixed(2)}, want ${spec.arrive.x.toFixed(2)})`);
    ok(Math.abs(spec.arrive.x - spec.aim.x) >= 0.4, `r${round} the break is a real move (≥0.4m)`);
  }
}

// ── C. source level: timing uses THIS pitch's speed; camera subjects ───────
{
  const src = readFileSync(new URL('../lib/babylon/modes/precisionModes.ts', import.meta.url), 'utf8');
  ok(src.includes('swingQuality(ball.position.z, 0.3, pitchSpeed, 0.3)'),
    'the timing window divides by THIS pitch\'s speed (was hardcoded 14 — a changeup timed on fastball math)');
  ok(src.includes('ctx.heroRef.current = ball'), 'the hit ball becomes the camera subject after contact');
  ok(src.includes("camDirector.mode = 'follow'"), 'the hit ball gets the follow camera');
  ok(src.includes("setFixedBehind(me.root.position, Math.PI, 'swing', true)"), 'the pitch cut SNAPS back to the swing spot');
  ok(src.includes('incoming ? pitchAt : ball.position'), 'during the pitch the camera aims at the zone, not the moving ball');
  ok(src.includes('buildBallparkOutfield'), 'the outfield wall is built');
}

// ── D. the wall is honest ──────────────────────────────────────────────────
// Read the builder's geometry from source: the arc is generated from one R.
{
  const src = readFileSync(new URL('../lib/babylon/modes/aimSwingCore.ts', import.meta.url), 'utf8');
  const rMatch = src.match(/const R = (\d+)/);
  ok(!!rMatch, 'wall radius constant exists');
  ok(/Math\.sin\(rad\) \* R/.test(src) && /Math\.cos\(rad\) \* R/.test(src), 'wall segments sit on the arc (constant distance from the plate)');
  ok(src.includes('foulpole'), 'foul poles exist');
}

if (fail.length) {
  console.error(`derby-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`derby-depth-tests: ${checks} checks green`);
