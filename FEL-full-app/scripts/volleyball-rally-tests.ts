// Volleyball — the three-touch sequence, against Nintendo Switch Sports.
//
// Two defects give this file its shape:
//
//  1. The three-touch limit was INOPERATIVE. Every human swing called
//     rally.cross(), and cross() zeroes the touch counter, so `touches` never
//     exceeded 1. A mode configured with touchesPerSide 3 played exactly like
//     one configured with 1, and the "TOO MANY TOUCHES" fault could not fire.
//  2. Even had it fired, bump, set and spike were the same generic hit. In the
//     benchmark the SEQUENCE is the game -- bump to control, set to place,
//     spike to win -- and three identical touches have the rule without the
//     sport.
//
// The geometry check at the end is the one that cost the most: a set lands the
// ball AT the net, so a ground-launched spike is only a quarter of the way
// along its arc when it reaches the tape and clips it. Every attack from a good
// set hit the net and the opponent conceded 4-0 on nothing else.

import {
  VOLLEYBALL, TENNIS, planShot, judgeShot, volleyTouchFor, volleyCrosses, RallyState,
} from '../lib/babylon/core/RallyCore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. the sequence ─────────────────────────────────────────────────────────
ok(volleyTouchFor(1, 3) === 'bump', 'A1 first touch is the bump');
ok(volleyTouchFor(2, 3) === 'set', 'A2 second touch is the set');
ok(volleyTouchFor(3, 3) === 'spike', 'A3 third touch is the attack');
ok(!volleyCrosses('bump') && !volleyCrosses('set'), 'A4 bump and set stay on your own side');
ok(volleyCrosses('spike'), 'A5 only the attack crosses the net');
// Tennis is one touch, and that touch must cross — the same helper serves both.
ok(volleyTouchFor(1, 1) === 'spike' && volleyCrosses('spike'), 'A6 a one-touch sport crosses immediately');

// ── B. the limit actually fires ─────────────────────────────────────────────
// It could not before: cross() was called on every touch and zeroes the count.
const r = new RallyState(VOLLEYBALL);
r.serve(0);
ok(r.touch() === 'ok', 'B1 first touch is legal');
ok(r.touch() === 'ok', 'B2 second touch is legal');
ok(r.touch() === 'ok', 'B3 third touch is legal');
ok(r.touch() === 'fault', 'B4 the FOURTH touch is a fault — the rule can now fire at all');
r.cross();
ok(r.touch() === 'ok', 'B5 crossing resets the allowance for the other side');

// ── C. the three touches are three different SHOTS ──────────────────────────
const from = { x: 0, y: 1.1, z: 4 };
const bump = planShot(VOLLEYBALL, from, 1, 0, 'good', 'bump')!;
const set = planShot(VOLLEYBALL, from, 1, 0, 'good', 'set')!;
const spike = planShot(VOLLEYBALL, { x: 0, y: 1.1, z: 1.6 }, -1, 0, 'good', 'spike')!;

ok(bump.to.z > 0 && set.to.z > 0, 'C1 bump and set land on your OWN side');
ok(spike.to.z < 0, 'C2 the spike lands in THEIRS');
ok(set.apex > bump.apex, `C3 the set is the highest ball in the sport (${set.apex} > ${bump.apex})`);
ok(set.duration > bump.duration, 'C4 ...and the slowest, to buy the attacker time');
ok(Math.abs(set.to.z) < Math.abs(bump.to.z), 'C5 the set is placed AT the net, the bump digs into mid-court');
ok(spike.duration < bump.duration && spike.duration < set.duration,
  `C6 the spike is the fastest ball (${spike.duration.toFixed(2)}s)`);

// ── D. THE GEOMETRY. A spike is hit from above the net. ─────────────────────
ok(spike.from.y > VOLLEYBALL.netHeight,
  `D1 the attack is struck from ABOVE the tape (${spike.from.y.toFixed(2)}m vs a ${VOLLEYBALL.netHeight}m net)`);
ok(bump.from.y === from.y && set.from.y === from.y, 'D2 ...and only the attack is; bump and set are played off the floor');
// The case that actually broke: a spike taken from a good set, right at the net.
// Across the whole court, not just from the net: a back-court attack has a
// longer flight, so the tape falls EARLIER in it, which is the case that broke.
for (const z of [0.8, 1.6, 2.4, 3.2, 4.5, 6]) {
  const s = planShot(VOLLEYBALL, { x: 0, y: 1.1, z }, -1, 0, 'good', 'spike')!;
  ok(judgeShot(VOLLEYBALL, s) !== 'net',
    `D3 a spike from a set at z=${z} clears a ${VOLLEYBALL.netHeight}m net (got ${judgeShot(VOLLEYBALL, s) ?? 'clean'})`);
}

// ── E. tennis is untouched ──────────────────────────────────────────────────
// Passing no touch must reproduce the original shot exactly, or this change
// silently reshapes a mode that was already signed off.
const plain = planShot(TENNIS, from, -1, 0.3, 'good')!;
const plainAgain = planShot(TENNIS, from, -1, 0.3, 'good', undefined)!;
ok(plain.apex === plainAgain.apex && plain.duration === plainAgain.duration,
  'E1 omitting the touch is identical to passing undefined');
ok(plain.from.y === from.y, 'E2 a tennis shot is NOT launched from above the net');
ok(plain.apex > TENNIS.netHeight, 'E3 ...and still clears its own net');

if (fail.length) {
  console.error(`volleyball-rally-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`volleyball-rally-tests: ${checks} checks green — bump, set and spike are three different shots`);
