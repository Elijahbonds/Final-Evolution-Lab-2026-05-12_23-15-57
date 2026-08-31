#!/usr/bin/env -S npx tsx
// Hoop alignment — the ball must fly to the basket the player can SEE.
//
// Every basketball mode carried its own rim constant, and every venue placed
// its own hoop prop, and nothing ever compared the two. All three modes were
// wrong, in the same way, for the same reason:
//
//   Dunk   rim (0, 3.05, -0.6)   venue hoop at z -11    -> ~9.7m apart
//   1v1    RIM (0, 3.05, -0.6)   venue hoops at z ±12.5 -> nearest BEHIND the player
//   3v3    RIM (0, 3.05, -0.6)   venue hoops at z ±13.5 -> nearest BEHIND the player
//
// 1v1 is the Master Design Bible's "validated reference / gold standard — full
// pass complete". It was shooting at a rim eleven metres from its own hoop.
//
// Nothing errored, and nothing could: each half was internally consistent, they
// simply described different baskets. That is the whole reason this file exists
// — the failure mode is two independent numbers that are never diffed.

import { DUNK_CONFIG } from '../lib/babylon/modes/modeConfigs';
import { RIM as RIM_3V3 } from '../lib/babylon/modes/ThreeVThreeMode';
import { RIM as RIM_1V1 } from '../lib/babylon/modes/OneVOneMode';
import { VENUE_SPECS } from '../lib/babylon/nexus/venueSpecs';
import { HOOP_RIM_OFFSET } from '../lib/babylon/nexus/NexusWebScene';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

/** Every hoop prop in a venue, as the WORLD position of its rim. */
function rimsOf(venueId: string): { x: number; y: number; z: number }[] {
  const spec = VENUE_SPECS[venueId];
  if (!spec) return [];
  return spec.props
    .filter((p) => p.kind === 'hoop')
    .map((p) => {
      const s = p.scale ?? 1;
      // A hoop prop with no rotation faces +z, which is where the play is.
      return {
        x: p.position[0],
        y: p.position[1] + HOOP_RIM_OFFSET.y * s,
        z: p.position[2] + HOOP_RIM_OFFSET.z * s,
      };
    });
}

const near = (a: number, b: number, tol = 0.06): boolean => Math.abs(a - b) <= tol;

const CASES: { mode: string; venue: string; rim: { x: number; y: number; z: number } }[] = [
  { mode: 'dunk', venue: 'basketball_dunk', rim: { x: 0, y: DUNK_CONFIG.rimHeight, z: DUNK_CONFIG.rimZ } },
  { mode: 'threevthree', venue: 'basketball_3v3', rim: { x: RIM_3V3.x, y: RIM_3V3.y, z: RIM_3V3.z } },
  { mode: 'onevone', venue: 'basketball_h2h', rim: { x: RIM_1V1.x, y: RIM_1V1.y, z: RIM_1V1.z } },
];

// ── A. regulation ──────────────────────────────────────────────────────────
// A basketball rim is ten feet. This was built at 2.70 — about 8'10" — so every
// basketball mode in the game was shooting at a rim nearly a foot low. L1 of the
// World-Population Protocol says dimensions are checked against the real sport.
ok(near(HOOP_RIM_OFFSET.y, 3.05, 0.001),
  `A1 the hoop is regulation 3.05m (got ${HOOP_RIM_OFFSET.y})`);

// ── B. every mode shoots at a hoop that exists ─────────────────────────────
for (const c of CASES) {
  const rims = rimsOf(c.venue);
  ok(rims.length > 0, `B-${c.mode}: venue "${c.venue}" has a hoop at all`);

  const hit = rims.find((r) => near(r.x, c.rim.x, 0.3) && near(r.y, c.rim.y) && near(r.z, c.rim.z, 0.3));
  const closest = rims
    .map((r) => Math.hypot(r.x - c.rim.x, r.y - c.rim.y, r.z - c.rim.z))
    .sort((a, b) => a - b)[0];
  ok(!!hit,
    `B-${c.mode}: the mode's rim (${c.rim.x}, ${c.rim.y}, ${c.rim.z}) lands on a real hoop in ` +
    `"${c.venue}" — nearest is ${closest?.toFixed(2)}m away. The ball must go where the ` +
    'player can see the basket.');

  ok(near(c.rim.y, 3.05, 0.06), `B-${c.mode}: shoots at a regulation-height rim`);
}

// ── C. half-court modes get ONE basket ─────────────────────────────────────
// 1v1 and 3v3 are half-court streetball: first to 21, one hoop. Two baskets is
// a full-court game and puts a second, wrong target on screen.
for (const v of ['basketball_h2h', 'basketball_3v3']) {
  ok(rimsOf(v).length === 1, `C-${v}: a half-court game has exactly one basket (got ${rimsOf(v).length})`);
}

if (fail.length) {
  console.error(`hoop-alignment-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`hoop-alignment-tests: ${checks} checks green — every rim is on a real, regulation hoop`);
