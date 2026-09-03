#!/usr/bin/env -S npx tsx
// 1v1 depth pass — the 2K verbs, checked headless.
//
// Three things a 2K player notices in the first minute, and the rules they
// must obey:
//
//   HESI — pulling the stick BACK while attacking is a hesitation, not a
//     crossover. It plants you dead (your momentum is the price) and arms a
//     short explode-out window. A hard DIAGONAL snap is still the explosive
//     crossover. Before this split, a pull-back fired the crossover burst —
//     and could break ankles while retreating away from the basket.
//   STEAL IS A READ — the rival's drive weaves (sin curve); the ball is
//     exposed mid-weave and protected at the gather. A poke has a real
//     window. It used to be Math.random() < 0.5: beaten by entropy.
//   SHOT FEEDBACK IS LEGIBLE — the release banner names the quality and the
//     contest. (Mode-level; asserted here at the source level the same way
//     basketball-rules-tests asserts rims.)
//
// Run: npx tsx scripts/onevone-depth-tests.ts

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import {
  DribbleController, driveBallExposure, STEAL_EXPOSURE_MIN,
} from '../lib/babylon/core/BasketballCore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const DT = 1 / 60;

/** Drive a controller through a stick script; return the per-frame results. */
function run(d: DribbleController, frames: [number, number][], sprint = false) {
  return frames.map(([x, y]) => d.update(DT, x, y, sprint));
}

// ── A. the HESI is a pull-back TAP, on the move or from triple-threat ─────
{
  const d = new DribbleController();
  d.setFacing(Math.PI);   // the mode spawns you facing the rim
  // attack the rim (stick up = -z world) for a second to build real speed
  run(d, Array(60).fill([0, 1]));
  const preHesiSpeed = d.vel.length();
  ok(preHesiSpeed > 3, `attacking run builds speed (got ${preHesiSpeed.toFixed(2)} m/s)`);

  // pull BACK for a beat, then release — the hesi fires on the release
  run(d, Array(3).fill([0, -1]));
  const [rel] = run(d, [[0, 0]]);
  ok(rel.hesitation === true, 'releasing a pull-back tap fires the hesitation');
  ok(rel.crossover === false, 'the hesi is NOT a crossover');
  ok(d.vel.length() < preHesiSpeed * 0.25, `the hesi plants you dead — momentum is the cost (${d.vel.length().toFixed(2)} m/s after)`);

  // cooldown: an immediate second tap must not re-fire
  run(d, Array(3).fill([0, -1]));
  const [again] = run(d, [[0, 0]]);
  ok(again.hesitation === false, 'hesi has a cooldown — no machine-gun pullbacks');
}

// ── A2. triple-threat and retreat ─────────────────────────────────────────
{
  // from a STANDSTILL (no prior direction at all): the tap still fires —
  // the canonical triple-threat hesi a reversal-detector cannot see.
  // (setFacing mirrors the mode: the hero spawns facing the rim, yaw π.)
  const tt = new DribbleController();
  tt.setFacing(Math.PI);
  run(tt, Array(3).fill([0, -1]));
  const [fire] = run(tt, [[0, 0]]);
  ok(fire.hesitation === true, 'triple-threat pull-back tap fires from a standstill');

  // but HOLDING backward is a retreat dribble, not a move
  const retreat = new DribbleController();
  retreat.setFacing(Math.PI);
  run(retreat, Array(60).fill([0, 1]));
  run(retreat, Array(30).fill([0, -1]));      // held half a second
  const [none] = run(retreat, [[0, 0]]);
  ok(none.hesitation === false, 'holding the pull-back is a retreat, not a hesi');
}

// ── B. the crossover still bursts ──────────────────────────────────────────
{
  const d = new DribbleController();
  d.setFacing(Math.PI);   // the mode spawns you facing the rim
  // attack diagonally left, then snap diagonally right — keeps rim-ward
  // component, which is what separates a crossover from a pull-back
  run(d, Array(60).fill([-1, 0.3]));
  const pre = d.vel.length();
  const [snap] = run(d, [[1, 0.3]]);
  ok(snap.crossover === true, 'hard diagonal snap is still the crossover');
  ok(snap.hesitation === false, 'crossover is NOT a hesitation');
  ok(d.vel.length() > pre, `crossover keeps the burst (${d.vel.length().toFixed(2)} > ${pre.toFixed(2)})`);
}

// ── C. the explode-out is the payoff ───────────────────────────────────────
// Control: stop by going neutral, then push again. Hesi path must beat it —
// otherwise the move costs momentum and buys nothing.
{
  const hesi = new DribbleController();
  hesi.setFacing(Math.PI);
  run(hesi, Array(60).fill([0, 1]));
  run(hesi, Array(3).fill([0, -1]));          // the pullback tap
  run(hesi, Array(6).fill([0, 0]));           // release + a beat (the read)
  run(hesi, [[0, 1]]);                        // explode
  const hesiSpeed = hesi.vel.length();

  const ctrl = new DribbleController();
  ctrl.setFacing(Math.PI);
  run(ctrl, Array(60).fill([0, 1]));
  run(ctrl, Array(10).fill([0, 0]));          // plain stop, same total beat
  run(ctrl, [[0, 1]]);
  const ctrlSpeed = ctrl.vel.length();

  ok(hesiSpeed > ctrlSpeed * 2, `explode-out beats a plain stop-and-go (${hesiSpeed.toFixed(2)} vs ${ctrlSpeed.toFixed(2)} m/s)`);

  // and a HELD pullback stick must not explode you toward your own half
  const hold = new DribbleController();
  hold.setFacing(Math.PI);
  run(hold, Array(60).fill([0, 1]));
  run(hold, Array(30).fill([0, -1]));         // held past the tap window
  run(hold, [[0, 0]]);
  ok(hold.vel.z <= 0.01, 'a held pull-back (retreat) never fires the boost');
}

// ── D. the steal window is real ────────────────────────────────────────────
// The rival drive weaves at sin(t*2.1) with amplitude decaying to the gather.
// Exposure must peak mid-weave and vanish at the gather.
{
  const DRIVE = 2.2;                          // DEFENSE_DRIVE_SEC in OneVOneMode
  let peak = 0;
  for (let t = 0; t <= DRIVE; t += DT) peak = Math.max(peak, driveBallExposure(t, DRIVE));
  ok(peak >= STEAL_EXPOSURE_MIN, `a real poke window exists (peak exposure ${peak.toFixed(2)})`);
  ok(driveBallExposure(DRIVE, DRIVE) < STEAL_EXPOSURE_MIN, 'the gather is protected — no free late steals');

  // the window is a meaningful slice of the drive, not a frame
  let live = 0;
  for (let t = 0; t <= DRIVE; t += DT) if (driveBallExposure(t, DRIVE) >= STEAL_EXPOSURE_MIN) live += DT;
  ok(live > 0.5 && live < DRIVE * 0.8, `poke window is a human-scale slice of the drive (${live.toFixed(2)}s of ${DRIVE}s)`);
}

// ── E. source level: the dice are gone, the feedback names the why ─────────
{
  const src = readFileSync(new URL('../lib/babylon/modes/OneVOneMode.ts', import.meta.url), 'utf8');
  ok(src.includes('driveBallExposure'), 'steal reads ball exposure, not Math.random()');
  ok(!/intent\.steal[^\n]*Math\.random/.test(src), 'no dice roll on the steal path');
  for (const word of ['GREEN!', 'EARLY', 'LATE', 'CONTESTED', 'WIDE OPEN']) {
    ok(src.includes(`\`${word}`) || src.includes(`'${word}`) || src.includes(word), `release feedback can say "${word}"`);
  }
  ok(src.includes('drib.hesitation'), 'the hesi is wired into the mode, not just the controller');
}

// ── report ─────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`onevone-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`onevone-depth-tests: ${checks} checks green`);
