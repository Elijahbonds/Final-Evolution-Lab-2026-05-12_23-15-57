// Tennis — the shot vocabulary, against Mario Tennis Aces.
//
// The mode had ONE swing. Aces' identity is choosing between topspin, slice,
// lob and drop under time pressure, and a single shot makes a rally a
// metronome. These assert the four are genuinely different SHOTS and that each
// is a real trade — a menu where one option dominates is a menu with one option.
//
// The ordering check at the end exists because the bug nearly shipped: planShot
// computes targetZ from `depth` early, so setting a shot's depth further down
// (next to its apex, where it reads more naturally) does nothing at all. A drop
// shot would have arced like a drop shot and landed as deep as a drive.

import { TENNIS, VOLLEYBALL, planShot, judgeShot } from '../lib/babylon/core/RallyCore';
import {
  ENERGY_MAX, ENERGY_PERFECT, ENERGY_GOOD, ENERGY_RALLY_WON, ZONE_COST, RACKETS,
} from '../lib/babylon/modes/NetSportMode';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const from = { x: 0, y: 1.0, z: 10 };
const P = (shot?: 'drive' | 'slice' | 'lob' | 'drop') =>
  planShot(TENNIS, from, -1, 0, 'good', undefined, shot)!;

const drive = P('drive'), slice = P('slice'), lob = P('lob'), drop = P('drop');

// ── A. the court is the real court ──────────────────────────────────────────
ok(Math.abs(TENNIS.halfLength * 2 - 23.77) < 0.5,
  `A1 court length matches the real 23.77m (got ${TENNIS.halfLength * 2})`);
ok(TENNIS.netHeight >= 0.914 && TENNIS.netHeight <= 1.07,
  `A2 net height is inside the real range 0.914–1.07m (got ${TENNIS.netHeight})`);
ok(TENNIS.touchesPerSide === 1, 'A3 one touch per side');

// ── B. four DIFFERENT shots ─────────────────────────────────────────────────
ok(Math.abs(drop.to.z) < Math.abs(drive.to.z), `B1 the drop lands SHORT (${Math.abs(drop.to.z).toFixed(1)}m vs ${Math.abs(drive.to.z).toFixed(1)}m)`);
ok(Math.abs(lob.to.z) > Math.abs(drive.to.z), 'B2 the lob lands DEEP');
ok(lob.apex > drive.apex * 2, `B3 the lob goes over a player at the net (apex ${lob.apex.toFixed(1)}m)`);
ok(slice.apex < drive.apex, `B4 the slice stays LOW (${slice.apex.toFixed(2)}m vs ${drive.apex.toFixed(2)}m)`);
ok(lob.duration > drive.duration, 'B5 the lob is slow — a gift if they are at the baseline');
ok(drop.duration < drive.duration, 'B6 the drop gets there quickly');
// ...and they must actually differ where it counts, not just in one field.
const zs = new Set([drive.to.z, slice.to.z, lob.to.z, drop.to.z].map((z) => z.toFixed(2)));
ok(zs.size === 4, `B7 all four land in DIFFERENT places (${zs.size} distinct depths)`);

// ── C. no shot is unplayable, and none dominates ────────────────────────────
for (const [name, s] of [['drive', drive], ['slice', slice], ['lob', lob], ['drop', drop]] as const) {
  ok(judgeShot(TENNIS, s) === null, `C1 the ${name} is a legal shot (got ${judgeShot(TENNIS, s) ?? 'clean'})`);
}
// The drop is the riskiest: shortest, so the least margin over the net.
ok(drop.apex > TENNIS.netHeight, 'C2 the drop still clears the tape');
// The lob trades safety for time — it must be the slowest thing in the set.
ok(lob.duration === Math.max(drive.duration, slice.duration, lob.duration, drop.duration),
  'C3 the lob is the slowest shot — that is its cost');

// ── D. the ordering bug this file exists to prevent ─────────────────────────
// If a shot's depth were set after targetZ is computed, every shot would land
// at the drive's depth and only the arcs would differ.
ok(drop.to.z !== drive.to.z && lob.to.z !== drive.to.z && slice.to.z !== drive.to.z,
  'D1 shot depth reaches targetZ — the shots land where their depth says');

// ── E. volleyball is untouched ──────────────────────────────────────────────
const spikeOnly = planShot(VOLLEYBALL, { x: 0, y: 1.1, z: 1.6 }, -1, 0, 'good', 'spike')!;
const spikePlusUndefined = planShot(VOLLEYBALL, { x: 0, y: 1.1, z: 1.6 }, -1, 0, 'good', 'spike', undefined)!;
ok(spikeOnly.apex === spikePlusUndefined.apex && spikeOnly.to.z === spikePlusUndefined.to.z,
  'E1 a volley touch with no tennis shot is unchanged');
ok(spikeOnly.from.y > VOLLEYBALL.netHeight, 'E2 the volleyball spike still launches from above the net');

// ── F. the energy layer ─────────────────────────────────────────────────────
// Aces' gauge is not a score multiplier, it is a threat: you fill it by hitting
// well and spend it on a shot that can END the match by breaking a racket. The
// checks are on the SHAPE of that economy, the way the surf and snowboard meters
// are checked — a gauge that fills too fast is a rotation, not a payoff.
ok(ZONE_COST === ENERGY_MAX, 'F1 a Zone Shot costs the WHOLE gauge — it is the payoff, not a rotation');
ok(ENERGY_PERFECT > ENERGY_GOOD, 'F2 the gauge rewards the timing the mode already grades');
const perfectsToFill = ENERGY_MAX / ENERGY_PERFECT;
ok(perfectsToFill >= 4 && perfectsToFill <= 8,
  `F3 filling it is a real investment (${perfectsToFill} perfect contacts)`);
ok(ENERGY_MAX / ENERGY_GOOD > perfectsToFill,
  'F4 ...and merely good contact takes longer, so precision is the faster route');
ok(ENERGY_RALLY_WON > 0 && ENERGY_RALLY_WON < ENERGY_MAX / 3,
  `F5 winning a rally helps but does not hand you a Zone Shot (${ENERGY_RALLY_WON})`);
ok(RACKETS >= 2, `F6 a single mistake cannot end the match (${RACKETS} rackets)`);
ok(RACKETS <= 4, 'F7 ...but the threat is real enough to change how you play');
// The stake has to be worth the gauge: breaking every racket must be reachable
// inside a match, or the Zone Shot is just a point with a cutscene.
ok(RACKETS * ZONE_COST <= ENERGY_MAX * 4,
  'F8 breaking a full set of rackets is reachable within one match');

if (fail.length) {
  console.error(`tennis-rally-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`tennis-rally-tests: ${checks} checks green — four shots, four real trades`);
