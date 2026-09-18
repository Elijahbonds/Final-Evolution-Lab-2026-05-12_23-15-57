#!/usr/bin/env -S npx tsx
// The camera's box must be the court's box.
//
// mountVenue hands CameraDirector a footprint to clamp the camera inside. That
// footprint was computed from `ground.size` alone — which was the whole story
// while every ground was centred on the origin, and became wrong the moment
// half-court venues offset theirs to sit around the half actually played.
//
// 3v3's ground is 18x20 offset +7.8, spanning z -2.2..17.8. The bounds still
// said z -10..10, so the camera was pinned at z 8.8 (10 minus the margin) while
// asking to sit at 17.8. Pinned 2.8m behind the hero while holding the preset's
// full height is a ~60 degree pitch against a preset declaring 28, and the hero
// dropped out of frame. Two numbers describing one rectangle, never compared.

import { venueBounds } from '../lib/babylon/core/NexusVenue';
import { VENUE_SPECS } from '../lib/babylon/nexus/venueSpecs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

for (const [id, spec] of Object.entries(VENUE_SPECS)) {
  const [w, d] = spec.ground.size;
  const [ox, oz] = spec.ground.offset ?? [0, 0];
  const b = venueBounds(spec);

  // The bounds ARE the ground rectangle — same centre, same extent.
  ok(near(b.minX, ox - w / 2) && near(b.maxX, ox + w / 2),
    `${id}: camera bounds match the ground in X`);
  ok(near(b.minZ, oz - d / 2) && near(b.maxZ, oz + d / 2),
    `${id}: camera bounds match the ground in Z (offset ${oz})`);
  ok(near((b.minZ + b.maxZ) / 2, oz),
    `${id}: the bounds are CENTRED on the ground's offset, not on the origin — ` +
    'the bug was bounds that stayed at the origin while the court moved');
}

// And specifically the two half-court venues that carry an offset, checked
// against numbers written out by hand rather than re-derived from the formula.
const three = venueBounds(VENUE_SPECS.basketball_3v3);
ok(near(three.minZ, -2.2) && near(three.maxZ, 17.8),
  `basketball_3v3 spans z -2.2..17.8 (got ${three.minZ}..${three.maxZ})`);
const h2h = venueBounds(VENUE_SPECS.basketball_h2h);
ok(near(h2h.minZ, -1.9) && near(h2h.maxZ, 17.1),
  `basketball_h2h spans z -1.9..17.1 (got ${h2h.minZ}..${h2h.maxZ})`);

// Both are half-court games whose play area runs to z 14.5-15. The camera sits
// BEHIND the player, so the box has to reach past that or it pins the camera.
for (const [id, playTo] of [['basketball_3v3', 15], ['basketball_h2h', 14.5]] as const) {
  const b = venueBounds(VENUE_SPECS[id]);
  ok(b.maxZ > playTo + 1.2,
    `${id}: the camera box reaches past the end of play (${b.maxZ} > ${playTo} + margin) — ` +
    'otherwise the camera is clamped in front of where the player can stand');
}

if (fail.length) {
  console.error(`venue-bounds-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`venue-bounds-tests: ${checks} checks green — the camera's box is the court's box`);
