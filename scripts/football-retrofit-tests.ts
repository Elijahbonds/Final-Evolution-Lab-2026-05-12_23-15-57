/**
 * scripts/football-retrofit-tests.ts
 * ==================================
 * M10 Row A verification harness — Street Football (SYNTH APPROXIMATION).
 *
 * Street Football is the ONE lineup surface with NO donor JS and NO prior
 * playable component (it existed only as anim clips, an anim FSM flow, a story
 * zone, and a camera rig). Per the M10 firewall this synth does NOT fork a
 * core: FootballRun (lib/feel/football/football-core.ts) COMPOSES a CourtCore
 * (Court/free-3D archetype — LocomotionController + shared variable-gravity
 * jump-as-hurdle) and layers an ORIGINAL deterministic abstracted-tackler +
 * juke/spin/stiff-arm evade system on top. No shared core/skin is edited.
 *
 * Proves, by driving the headless core at a fixed 60Hz:
 *   1. Deterministic tackler field — same seed => identical defender layout;
 *      different seeds differ.
 *   2. LIVE tackles — a naive straight sprint with NO evades gets tackled short
 *      of the end zone (the defenders are real, not decoration).
 *   3. Juke rotation breaks 80yd for a TD — an autopilot that steers off the
 *      nearest defender and jukes on contact reaches the end zone (the lineup
 *      spec signature moment).
 *   4. Scoring — a touchdown run banks the TD bonus + per-yard + per-evade
 *      points; a run that is tackled banks less and never gets the TD bonus.
 *   5. Reuse (no fork) — the hurdle is the SHARED Court jump: mid-hurdle
 *      airborne frames clear a ground defender the runner would otherwise hit.
 *
 * Run: yarn tsx scripts/football-retrofit-tests.ts
 * Wired into scripts/standing-suite.ts.
 */

import assert from 'node:assert';
import { FootballRun, type FootballRun as FR } from '../lib/feel/football/football-core';
import { FOOTBALL_TUNING } from '../lib/feel/football/football-constants';

const DT = 1 / 60;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** String-widen the phase so build-mode tsc can't narrow it across a step(). */
function phaseOf(r: FR): string {
  return r.phase as string;
}

/**
 * Autopilot: steer off the nearest upcoming defender, jocking to the open side,
 * and juke the instant one is about to make contact. Proves the mechanics allow
 * an 80yd TD run vs live tackles.
 */
function autopilotRun(seed: number): FootballRun {
  const run = new FootballRun({ seed });
  const t = FOOTBALL_TUNING;
  for (let i = 0; i < 4000; i++) {
    if (run.state.finished) break;
    const yd = run.state.yards;
    // Nearest un-cleared defender ahead of the runner.
    let nearest: { yd: number; x: number } | null = null;
    for (const tk of run.tacklers) {
      if (tk.cleared) continue;
      if (tk.yd < yd - 1) continue;
      if (!nearest || tk.yd < nearest.yd) nearest = { yd: tk.yd, x: tk.x };
    }
    let steer = 0;
    if (nearest) {
      const gap = nearest.yd - yd; // yards ahead
      const lat = run.state.pos.x - nearest.x; // +ve => runner right of defender
      // Aim for a lane offset to whichever side the runner already leans.
      const side = lat >= 0 ? 1 : -1;
      const targetX = nearest.x + side * (t.tackleRadius + 1.2);
      steer = Math.max(-1, Math.min(1, (targetX - run.state.pos.x) * 0.8));
      // On the doorstep, fire a juke to the open side for evade i-frames.
      if (gap <= 3.2 && Math.abs(lat) <= t.tackleRadius + 0.6) {
        run.juke(side >= 0 ? 'R' : 'L');
      }
    }
    run.step(DT, { steerX: steer });
  }
  return run;
}

/** Steer straight onto the nearest defender's lateral line and NEVER evade. */
function chargeIntoDefender(seed: number): FootballRun {
  const run = new FootballRun({ seed });
  for (let i = 0; i < 4000; i++) {
    if (run.state.finished) break;
    // Lock onto whichever un-cleared defender is next downfield.
    let nearest: { yd: number; x: number } | null = null;
    for (const tk of run.tacklers) {
      if (tk.cleared) continue;
      if (!nearest || tk.yd < nearest.yd) nearest = { yd: tk.yd, x: tk.x };
    }
    const steer = nearest
      ? Math.max(-1, Math.min(1, (nearest.x - run.state.pos.x) * 0.8))
      : 0;
    run.step(DT, { steerX: steer }); // no juke/spin/stiffArm ever
  }
  return run;
}

/**
 * Charge onto the FIRST defender's lateral line and juke the instant contact is
 * imminent — converting a would-be tackle into an evade. Returns the run after
 * that first defender is resolved.
 */
function chargeButJukeFirst(seed: number): FootballRun {
  const run = new FootballRun({ seed });
  // Target the most in-path defender (smallest lateral offset) so a natural
  // straight run actually contacts it — then juke on its line.
  const first = run.tacklers.reduce((a, b) => (Math.abs(a.x) <= Math.abs(b.x) ? a : b));
  const t = FOOTBALL_TUNING;
  for (let i = 0; i < 4000; i++) {
    if (run.state.finished) break;
    if (first.cleared) break;
    const gap = first.yd - run.state.yards;
    const lat = Math.abs(run.state.pos.x - first.x);
    const steer = Math.max(-1, Math.min(1, (first.x - run.state.pos.x) * 0.8));
    // Buffer a juke one beat before contact, while still on the defender's line.
    if (gap <= t.evadeReach && gap > 0 && lat <= t.tackleRadius) {
      run.juke(run.state.pos.x >= first.x ? 'R' : 'L');
    }
    run.step(DT, { steerX: steer });
  }
  return run;
}

console.log('football-retrofit-tests: Street Football synth on Court/free-3D locomotion\n');

// 1. Deterministic tackler field ------------------------------------------
check('same seed => identical tackler field; different seeds differ', () => {
  const a = new FootballRun({ seed: 42 });
  const b = new FootballRun({ seed: 42 });
  const c = new FootballRun({ seed: 99 });
  assert.strictEqual(a.tacklers.length, FOOTBALL_TUNING.tacklerCount, 'tackler count matches tuning');
  for (let i = 0; i < a.tacklers.length; i++) {
    assert.strictEqual(a.tacklers[i].yd, b.tacklers[i].yd, 'same seed same yd');
    assert.strictEqual(a.tacklers[i].x, b.tacklers[i].x, 'same seed same x');
  }
  const same = a.tacklers.every((tk, i) => tk.x === c.tacklers[i].x);
  assert.ok(!same, 'different seed produces a different lateral layout');
  // Field spans from first to last tackler yard, all inside the lane.
  assert.ok(a.tacklers[0].yd >= FOOTBALL_TUNING.firstTacklerYd - 1e-9, 'first defender at firstTacklerYd');
  assert.ok(
    a.tacklers[a.tacklers.length - 1].yd <= FOOTBALL_TUNING.lastTacklerYd + 1e-9,
    'last defender within lastTacklerYd',
  );
  for (const tk of a.tacklers) {
    assert.ok(Math.abs(tk.x) <= FOOTBALL_TUNING.laneHalfWidth, 'defender inside the lane');
  }
});

// 2. LIVE tackles: a naive straight sprint gets stopped short ---------------
check('naive straight sprint (no evades) is tackled short of the end zone', () => {
  const run = chargeIntoDefender(7);
  assert.ok(run.state.finished, 'run resolves');
  assert.strictEqual(run.state.tackled, true, 'the runner is tackled');
  assert.strictEqual(run.state.touchdown, false, 'no touchdown on a naive run');
  assert.strictEqual(phaseOf(run), 'Tackled', 'ends in the Tackled phase');
  assert.ok(run.state.yards < FOOTBALL_TUNING.fieldLengthYd, 'stopped short of 80yd');
});

// 3. Juke rotation breaks 80yd for a TD (signature moment) ------------------
check('juke autopilot breaks 80yd for a touchdown across multiple seeds', () => {
  let tds = 0;
  const seeds = [1, 2, 3, 4, 5, 8, 13, 21];
  for (const seed of seeds) {
    const run = autopilotRun(seed);
    if (run.state.touchdown) tds++;
  }
  assert.ok(tds >= 6, `most seeds score a TD (got ${tds}/${seeds.length})`);
  // And at least one concrete run reaches the end zone in the Touchdown phase.
  const one = autopilotRun(1);
  assert.strictEqual(one.state.touchdown, true, 'seed 1 scores');
  assert.strictEqual(phaseOf(one), 'Touchdown', 'ends in the Touchdown phase');
  assert.ok(one.state.yards >= FOOTBALL_TUNING.fieldLengthYd - 1e-6, 'reached the end zone (80yd)');

  // A juke on the defender's line converts a would-be tackle into an evade.
  const juked = chargeButJukeFirst(7);
  assert.ok(juked.state.tacklersEvaded >= 1, 'the juke evaded the defender');
  assert.ok(!juked.state.tackled, 'the juke prevented the tackle');
});

// 4. Scoring: TD banks the bonus; a tackle banks less -----------------------
check('touchdown scoring banks TD bonus + yards + evades; tackle banks less', () => {
  const td = autopilotRun(1);
  const t = FOOTBALL_TUNING;
  const expected =
    Math.round(td.state.yards) * t.pointsPerYard +
    td.state.tacklersEvaded * t.pointsPerEvade +
    t.touchdownBonus;
  assert.strictEqual(td.state.score, expected, 'TD score matches the scoring formula');
  assert.ok(td.state.score > t.touchdownBonus, 'TD score exceeds the flat TD bonus');

  const tackled = chargeIntoDefender(7);
  assert.ok(tackled.state.tackled, 'the charge run is tackled');
  assert.ok(!tackled.state.touchdown, 'tackled run has no TD');
  assert.ok(tackled.state.score < t.touchdownBonus, 'tackled run never gets the TD bonus');
});

// 5. Reuse (no fork): the hurdle is the shared Court jump -------------------
check('hurdle uses the shared Court jump — airborne frames clear a ground defender', () => {
  // Place the runner just before a defender dead-ahead, then hurdle it.
  const run = new FootballRun({ seed: 7 });
  // Target the most in-path defender so a straight run genuinely meets it, then
  // HURDLE it (the shared Court/free-3D jump) instead of juking.
  const first = run.tacklers.reduce((a, b) => (Math.abs(a.x) <= Math.abs(b.x) ? a : b));
  let hurdled = false;
  let sawAirborne = false;
  let clearedByAir = false;
  for (let i = 0; i < 4000; i++) {
    if (run.state.finished) break;
    const gap = first.yd - run.state.yards;
    const steer = Math.max(-1, Math.min(1, (first.x - run.state.pos.x) * 0.8));
    // Launch the hurdle a touch before contact so the airborne frames line up
    // with crossing the defender's yard line.
    if (!hurdled && gap <= 4.0 && gap > 2.5) {
      run.hurdle();
      hurdled = true;
    }
    run.step(DT, { steerX: steer });
    if (run.court.state.airborne && run.state.pos.y > 0.15) sawAirborne = true;
    if (hurdled && first.cleared && !run.state.tackled) {
      clearedByAir = run.state.tacklersEvaded > 0;
      break;
    }
  }
  assert.ok(hurdled, 'a hurdle (shared Court jump) was issued');
  assert.ok(sawAirborne, 'the shared CourtCore jump drove real airborne frames');
  assert.strictEqual(clearedByAir, true, 'the hurdle cleared the ground defender without a tackle');
});

console.log(`\nfootball-retrofit-tests: ${passed} checks passed ✅`);
