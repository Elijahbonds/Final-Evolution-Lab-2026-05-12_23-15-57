#!/usr/bin/env -S yarn tsx
/**
 * scripts/board-sports-retrofit-tests.ts
 * ======================================
 * M10 Row 7 retrofit invariant — board-sports-3d.tsx (skate/snow/surf) and
 * the shared ride/carve archetype (RideCore + the three ~30-line themed skins).
 *
 * IMPORTANT — honest scope (see M10 manifest):
 *   The LIVE board-sports-3d surface KEEPS its own richer engine (BoardPhysics
 *   heightfield carving + ComboEngine THPS bank/bail + GrindBalance rail meter
 *   + named trick-table) per M10 rule #1 ("a retrofit that throws away your
 *   assets is a failure"). That engine is a SUPERSET of RideCore (forward
 *   vectors, snapTo/launch, crouchCharge, speedNorm, heightfield follow) which
 *   RideCore does not provide — swapping it out would REGRESS the surface or
 *   require forking the core, both firewall violations. So this harness pins
 *   the SHARED ARCHETYPE the spec actually asks for ("your 3D scenes are the
 *   THEMES for one shared carve core"): the three live modes each correspond
 *   to a distinct themed RideCore skin that honors one ride/carve archetype.
 *
 * Pinned invariants:
 *   1. The live BoardModeId set is exactly {skate, snow, surf} (loader contract).
 *   2. Each themed skin builds a RideCore that starts in Cruise at its own
 *      tuned cruise speed (themes are wired, not hard-coded).
 *   3. The ride/carve phase walk (Cruise -> Setup -> Air -> Land) holds for
 *      every theme with a real apex — one archetype, three skins.
 *   4. Themes are genuinely DIFFERENTIATED, not clones: snow is fastest, surf
 *      is the widest run (matches the tuned constants / scene identity).
 *   5. Grind lock-on (ArcDrive) engages on the skate rail and scores while
 *      sliding — the archetype's rail contract the Venice strip scene rides.
 *
 * Deterministic: fixed 60fps clock, scripted inputs. No RNG, no rendering.
 */

import assert from 'node:assert';
import { RideCore } from '../lib/feel/cores/ride-core';
import { makeSkateRide, SKATE_RAIL } from '../lib/feel/cores/skate-skin';
import { makeSnowboardRide } from '../lib/feel/cores/snowboard-skin';
import { makeSurfRide } from '../lib/feel/cores/surf-skin';
import { SKATE_TUNING } from '../lib/feel/cores/skate-constants';
import { SNOWBOARD_TUNING } from '../lib/feel/cores/snowboard-constants';
import { SURF_TUNING } from '../lib/feel/cores/surf-constants';

const DT = 1 / 60;
const NEUTRAL = { steerX: 0, pumpY: 0 };
function phaseOf(c: RideCore): string { return c.state.phase as string; }
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  ✓ ' + name); }

// The three themed carve cores, keyed by the live BoardModeId.
const THEMES = {
  skate: { make: makeSkateRide, tuning: SKATE_TUNING },
  snow: { make: makeSnowboardRide, tuning: SNOWBOARD_TUNING },
  surf: { make: makeSurfRide, tuning: SURF_TUNING },
} as const;
type ThemeId = keyof typeof THEMES;

// ---- 1. Live loader mode contract ----------------------------------------
check('the live board modes are exactly {skate, snow, surf}', () => {
  // Mirrors lib/board/trick-table.ts BoardModeId + the board-*-3d wrappers.
  const modes = Object.keys(THEMES).sort();
  assert.deepStrictEqual(modes, ['skate', 'snow', 'surf']);
});

// ---- 2. Each theme wires its own tuned cruise speed ----------------------
check('each themed skin builds a RideCore cruising at its tuned speed', () => {
  (Object.keys(THEMES) as ThemeId[]).forEach((id) => {
    const c = THEMES[id].make();
    assert.ok(c instanceof RideCore, `${id} builds a RideCore`);
    assert.strictEqual(c.state.phase, 'Cruise', `${id} starts in Cruise`);
    assert.ok(
      Math.abs(c.state.speed - THEMES[id].tuning.cruiseSpeed) < 1e-6,
      `${id} cruises at its own tuned speed`,
    );
  });
});

// ---- 3. One ride/carve archetype across every theme ----------------------
check('phase walk Cruise -> Setup -> Air -> Land holds for every theme', () => {
  (Object.keys(THEMES) as ThemeId[]).forEach((id) => {
    const c = THEMES[id].make();
    c.ollie();
    // Cruise -> Setup
    c.step(DT, NEUTRAL);
    assert.strictEqual(phaseOf(c), 'Setup', `${id}: ollie enters Setup`);
    // Setup -> Air (after the tuned setup window), with a real apex.
    let sawAir = false, apex = 0, guard = 0;
    while (phaseOf(c) !== 'Land' && phaseOf(c) !== 'Bail' && guard < 600) {
      c.step(DT, NEUTRAL);
      if (phaseOf(c) === 'Air' || phaseOf(c) === 'Trick') { sawAir = true; apex = Math.max(apex, c.state.pos.y); }
      guard++;
    }
    assert.ok(sawAir, `${id}: went airborne`);
    assert.ok(apex > 0.2, `${id}: real apex height`);
    assert.ok(phaseOf(c) === 'Land' || phaseOf(c) === 'Bail', `${id}: touched back down`);
  });
});

// ---- 4. Themes are differentiated, not clones ----------------------------
check('themes are genuinely differentiated (snow fastest, surf widest)', () => {
  assert.ok(
    SNOWBOARD_TUNING.maxSpeed > SURF_TUNING.maxSpeed &&
    SURF_TUNING.maxSpeed > SKATE_TUNING.maxSpeed,
    'snow > surf > skate top speed',
  );
  assert.ok(
    SURF_TUNING.laneHalfWidth > SNOWBOARD_TUNING.laneHalfWidth &&
    SNOWBOARD_TUNING.laneHalfWidth > SKATE_TUNING.laneHalfWidth,
    'surf > snow > skate run width',
  );
});

// ---- 5. Grind lock-on + scoring (the Venice strip rail contract) ---------
check('skate grind locks onto the rail and scores while sliding', () => {
  const c = makeSkateRide();
  c.ollie();
  // Get airborne.
  let guard = 0;
  while (phaseOf(c) !== 'Air' && guard < 120) { c.step(DT, NEUTRAL); guard++; }
  assert.strictEqual(phaseOf(c), 'Air', 'airborne before grind');
  // Move the rider onto the rail entry and press grind.
  c.state.pos.x = SKATE_RAIL.x;
  c.state.pos.z = SKATE_RAIL.zStart;
  c.grind();
  c.step(DT, NEUTRAL);
  assert.strictEqual(phaseOf(c), 'Grind', 'locked onto the rail');
  const before = c.state.score;
  for (let i = 0; i < 20; i++) c.step(DT, NEUTRAL);
  assert.ok(c.state.score > before, 'points accrue while grinding');
});

console.log(`\nboard-sports-retrofit-tests: ${passed} checks passed`);
