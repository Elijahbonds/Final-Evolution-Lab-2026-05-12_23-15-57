// Proof for the Babylon air-session port (gymnastics vault + snowboard big air).
//
// Both modes are the SAME AirSessionCore wearing different skins, so what has to
// be proved is that the port preserves the core's behaviour: cadence taps build
// speed, the run launches at the skin's own launchZ, a mid-air tap adds rotation,
// and the landing is graded. None of the tuned constants are re-stated here —
// they are read from the skins, so this test cannot drift from them.
//
// Headless because the browser pane throttles to ~3.4s frames, and this skin
// uses positive runDrag: the drag between two throttled taps wipes all speed, so
// a run-up simply cannot be performed there.

import { makeVaultSession, VAULT_TUNING } from '../lib/feel/cores/vault-skin';
import { makeBigAirSession, BIG_AIR_TUNING } from '../lib/feel/cores/big-air-skin';
import type { AirSessionCore } from '../lib/feel/cores/air-session-core';
import type { TrickGrade } from '../lib/feel';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const DT = 1 / 60;

/** Pump alternating strides at the skin's own target cadence until `sec` elapses. */
function runUp(core: AirSessionCore, sec: number, cadenceMs: number): void {
  let acc = 0;
  let side: 'L' | 'R' = 'L';
  for (let t = 0; t < sec; t += DT) {
    acc += DT * 1000;
    if (acc >= cadenceMs && core.state.phase === 'Run') {
      core.runTap(side);
      side = side === 'L' ? 'R' : 'L';
      acc = 0;
    }
    core.step(DT, DT);
    if (core.state.phase !== 'Run') return;
  }
}

for (const [name, make, tuning] of [
  ['vault', makeVaultSession, VAULT_TUNING],
  ['bigair', makeBigAirSession, BIG_AIR_TUNING],
] as const) {
  const landings: TrickGrade[] = [];
  const core = make(undefined, { onLanding: (g: TrickGrade) => { landings.push(g); } });

  // ── A. starts in Run, stationary ─────────────────────────────────────────
  ok(core.state.phase === 'Run', `A-${name} starts in Run`);
  ok(core.state.speed === 0, `A-${name} starts stationary`);

  // ── B. cadence builds speed ──────────────────────────────────────────────
  const cadence = (tuning as { cadenceTargetMs?: number }).cadenceTargetMs ?? 250;
  core.runTap('L');
  core.step(DT, DT);
  ok(core.state.speed > 0, `B-${name} a stride produces speed`);

  // ── C. the run launches ──────────────────────────────────────────────────
  runUp(core, 12, cadence);
  ok(core.state.phase !== 'Run', `C-${name} the run-up eventually launches (phase ${core.state.phase})`);
  ok(core.state.pos.z <= tuning.launchZ + 0.001,
    `C-${name} launch happens at the skin's launchZ (${core.state.pos.z.toFixed(2)} <= ${tuning.launchZ})`);

  // ── D. mid-air trick adds rotation ───────────────────────────────────────
  if (core.state.phase === 'Air') {
    const before = core.state.spinTurns;
    core.trick();
    ok(core.state.spinTurns > before, `D-${name} a mid-air tap adds rotation`);
    core.stick();
  }

  // ── E. it lands and is graded ────────────────────────────────────────────
  for (let i = 0; i < 3000 && core.state.phase === 'Air'; i++) core.step(DT, DT);
  ok(core.state.phase !== 'Air', `E-${name} the jump terminates rather than hanging`);
  ok(landings.length >= 1, `E-${name} the landing was graded (got ${landings.length})`);
  if (landings.length) {
    ok(['stuck', 'clean', 'sketchy', 'crash'].includes(landings[0]),
      `E-${name} grade is one of the four (${landings[0]})`);
  }

  // ── F. the core owns its own bookkeeping ─────────────────────────────────
  // The Babylon mode mirrors these rather than re-deriving them, so they must
  // actually be maintained.
  ok(typeof core.state.score === 'number', `F-${name} core tracks score`);
  ok(typeof core.state.attempt === 'number', `F-${name} core tracks attempt`);
  ok(typeof core.state.finished === 'boolean', `F-${name} core tracks finished`);
  ok(core.state.attemptsPerRound >= 1, `F-${name} attemptsPerRound is sane`);
  // pos is a real 3D vector — this is what the Babylon athlete is driven from.
  ok(typeof core.state.pos.x === 'number' && typeof core.state.pos.y === 'number'
    && typeof core.state.pos.z === 'number', `F-${name} pos is 3D`);
}

if (fail.length) {
  console.error(`air-session-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`air-session-tests: ${checks} checks green — vault + big air on the shared core`);
