// node --experimental-strip-types --import ./tools/ts_resolve.mjs \
//   --import ./tools/fel_batch_alias.mjs tests/ground_guard_test.ts
//
// The test that matters is the first one: drive the OLD behaviour and the NEW
// behaviour with the same inputs and show that one settles and the other never
// does. Asserting "vy is zeroed" would pass on a fix that did not work.

import {
  groundStep, legacyClampOnly, simulateGrounding,
  STUCK_FRAMES, MAX_FALL_SPEED, FAULT_DEPTH,
} from '../lib/babylon/core/groundGuard';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

const ON_FLOOR = { groundY: 0, safeY: 2 };
const start = { y: 0.93, vy: 0, grounded: false, clampedFrames: 0 };  // the spawn height groundSnap logs

// ══ THE REPRODUCTION ═════════════════════════════════════════════════════
{
  // 11 seconds at 60fps — the same window the deployed build was watched for.
  const FRAMES = 660;
  const old = simulateGrounding(legacyClampOnly, start, ON_FLOOR, FRAMES);
  const fixed = simulateGrounding(groundStep, start, ON_FLOOR, FRAMES);

  ok('REPRODUCED: clamp-only never stops clamping', old.clamps > 500, `${old.clamps} clamps`);
  ok('and the deployed build printed 23-25 in 11s, so the shape matches',
    old.clamps > 0 && old.settledAfter === null);
  ok('THE FIX SETTLES', fixed.clamps <= 3, `${fixed.clamps} clamps`);
  ok('and stays settled for the rest of the run', fixed.settledAfter !== null);
  ok('and the actor ends up ON the floor, not under it', Math.abs(fixed.finalY) < 1e-9, `${fixed.finalY}`);
  ok('THE DIFFERENCE IS NOT MARGINAL', old.clamps > fixed.clamps * 100,
    `${old.clamps} vs ${fixed.clamps}`);

  // The measured depth was roughly CONSTANT at about -2, which is the tell
  // that this is one frame of accumulated fall rather than a fall in progress.
  // If the reconstruction is right, the legacy path sits at a fixed depth too.
  let a = { ...start }; const depths: number[] = [];
  for (let i = 0; i < 300; i++) {
    const r = legacyClampOnly(a, ON_FLOOR, 1 / 60);
    a = { y: r.y, vy: r.vy, grounded: r.grounded, clampedFrames: r.clampedFrames };
    if (i > 60) depths.push(r.vy);
  }
  ok('the legacy path accumulates velocity without bound — why it never recovers',
    Math.abs(depths[depths.length - 1]) > Math.abs(depths[0]) * 2);
}

// ══ A REAL FALL STILL WORKS ══════════════════════════════════════════════
{
  // The guard must not weld the actor to the floor. Dropping from height has
  // to fall, land once, and stop — a fix that clamps everything is a fix that
  // removes the jump.
  const high = simulateGrounding(groundStep, { y: 12, vy: 0, grounded: false, clampedFrames: 0 }, ON_FLOOR, 300);
  ok('a genuine fall from 12m still falls and lands', high.clamps >= 1 && high.clamps <= 3);
  ok('and lands exactly on the floor', Math.abs(high.finalY) < 1e-9);
  ok('and does not get re-seated — this is normal, not a fault', high.reseats === 0);

  // And upward motion is untouched, or there is no jump.
  const up = groundStep({ y: 0, vy: 8, grounded: false, clampedFrames: 0 }, ON_FLOOR, 1 / 60);
  ok('an actor moving UP is left alone', up.action === 'none' && up.y > 0 && up.vy > 0);

  // A JUMP FROM REST MUST LEAVE THE GROUND. The resting branch skips gravity
  // entirely, so it has to yield the moment something gives the actor upward
  // velocity — otherwise the fix for falling through the floor becomes a bug
  // where you cannot jump, which is a worse trade.
  const jump = groundStep({ y: 0, vy: 6, grounded: true, clampedFrames: 0 }, ON_FLOOR, 1 / 60);
  ok('A JUMP FROM REST LEAVES THE GROUND', jump.action === 'none' && !jump.grounded && jump.y > 0);
}

// ══ THE GROUND QUERY ITSELF FAILING ══════════════════════════════════════
{
  // The screenshots showed a camera following an actor through an empty void.
  // That is the raycast missing, and clamping to a floor you cannot find is
  // precisely how you get there.
  const lost = groundStep({ y: -2, vy: -6, grounded: false, clampedFrames: 3 }, { groundY: null, safeY: 5 }, 1 / 60);
  ok('a missed ground query RE-SEATS rather than clamping to an imaginary floor',
    lost.action === 'reseated' && lost.y === 5 && lost.vy === 0);
  ok('and says why, so the log is diagnostic rather than a count',
    (lost.reason ?? '').includes('collision mesh'));

  // And a ground query that keeps needing correction is not survivable either.
  // Something outside the guard keeps putting the actor deep under the floor —
  // a broken collision mesh, a teleport, a physics step fighting this one. The
  // honest response is to stop pretending the clamp is working.
  let a = { y: 0, vy: 0, grounded: false, clampedFrames: 0 };
  let reseated = false; let frames = 0;
  for (let i = 0; i < STUCK_FRAMES + 4 && !reseated; i++) {
    const r = groundStep({ ...a, y: -4, vy: -8, grounded: false }, ON_FLOOR, 1 / 60);
    a = { y: r.y, vy: r.vy, grounded: r.grounded, clampedFrames: r.clampedFrames };
    reseated = r.action === 'reseated'; frames++;
  }
  ok('repeated FAULT-depth correction eventually gives up instead of clamping forever', reseated);
  ok('and it takes STUCK_FRAMES to do so, not one bad frame', frames >= STUCK_FRAMES,
    `gave up after ${frames}`);
  ok('A NORMAL LANDING IS NEVER MISTAKEN FOR A FAULT', (() => {
    // The whole risk of the fault counter: re-seating someone who just landed.
    const land = simulateGrounding(groundStep, { y: 3, vy: 0, grounded: false, clampedFrames: 0 }, ON_FLOOR, 200);
    return land.reseats === 0;
  })());
}

// ══ TUNNELLING ═══════════════════════════════════════════════════════════
{
  // Without a terminal velocity a long fall moves further per frame than the
  // floor is thick, and the actor passes straight through — which is a second,
  // independent route to the same void.
  // 400m at a 30m/s terminal velocity is 13.3s — 800 frames. The first run of
  // this test used 600 and failed because the actor was still falling, which
  // is the test being wrong rather than the code.
  let a = { y: 400, vy: 0, grounded: false, clampedFrames: 0 };
  for (let i = 0; i < 1200; i++) {
    const r = groundStep(a, ON_FLOOR, 1 / 60);
    a = { y: r.y, vy: r.vy, grounded: r.grounded, clampedFrames: r.clampedFrames };
  }
  ok('terminal velocity is enforced on a long fall', Math.abs(a.vy) <= MAX_FALL_SPEED);
  ok('and the actor is resting, not still falling', a.grounded);
  ok('and a 400m fall still ends on the floor', Math.abs(a.y) < 1e-9, `${a.y}`);
  ok('the cap is below one frame of the thinnest plausible floor',
    (MAX_FALL_SPEED / 60) < 0.6, `${(MAX_FALL_SPEED / 60).toFixed(3)}m per frame`);
}

// ══ FRAME RATE INDEPENDENCE ══════════════════════════════════════════════
{
  // The container this was measured in renders at ~3fps. A guard that behaves
  // differently at 3fps than at 60fps would make every future measurement from
  // here untrustworthy, including the ones that found this bug.
  const at60 = simulateGrounding(groundStep, { y: 5, vy: 0, grounded: false, clampedFrames: 0 }, ON_FLOOR, 600, 1 / 60);
  const at20 = simulateGrounding(groundStep, { y: 5, vy: 0, grounded: false, clampedFrames: 0 }, ON_FLOOR, 200, 1 / 20);
  const at3 = simulateGrounding(groundStep, { y: 5, vy: 0, grounded: false, clampedFrames: 0 }, ON_FLOOR, 30, 1 / 3);
  ok('settles at 60fps', Math.abs(at60.finalY) < 1e-9);
  ok('settles at 20fps', Math.abs(at20.finalY) < 1e-9);
  ok('settles at 3fps — the rate this bug was FOUND at', Math.abs(at3.finalY) < 1e-9);
  ok('and none of them get re-seated, because none of them are stuck',
    at60.reseats === 0 && at20.reseats === 0 && at3.reseats === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
