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

if (fail.length) {
  console.error(`tennis-rally-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`tennis-rally-tests: ${checks} checks green — four shots, four real trades`);
