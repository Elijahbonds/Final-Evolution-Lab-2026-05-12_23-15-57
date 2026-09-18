/**
 * scripts/babylon-anim-coverage-tests.ts
 * ======================================
 * ANTI-REGRESSION for the M22–M27 Babylon animation system.
 *
 * The T-pose shipped THREE times because a requested clip silently resolved to
 * null: the registry asked for ~60 named clips, elijah-hero.glb bakes only 9,
 * and the missing 51 fell through to a bind-pose. The Babylon fix guarantees
 * EVERY requested clip resolves — either it is authored at runtime against the
 * live skeleton, or it aliases to one of the baked clips. This suite proves
 * that guarantee purely (no GPU/scene needed) so the regression can never
 * silently return: a missing clip fails the build.
 *
 * Run: yarn tsx scripts/babylon-anim-coverage-tests.ts
 */

import assert from 'node:assert';
import { CLIP_ALIASES, FALLBACK_CLIP } from '../lib/babylon/anim/clipAliases';
import { resolveClip } from '../lib/babylon/anim/clipResolver';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// The exact clips baked into public/models/elijah-hero.glb (verified from the
// GLB binary + its .json sidecar). This is the ground-truth asset set.
const BAKED = new Set<string>([
  'guard', 'high_kick', 'hook', 'jab', 'jumpshot',
  'roundhouse', 'run', 'uppercut', 'walk',
]);

// Clips authored at runtime by registerAuthoredClips() — these register under
// their REGISTRY name against the live skeleton, so they are always available.
const AUTHORED = new Set<string>([
  'idle_stand', 'strafe_left', 'strafe_right', 'jump_up', 'jump_land',
  'dunk_charge_gather', 'dunk_launch', 'dunk_360_eastbay', 'dunk_score_hang',
  'dunk_land_crouch', 'football_juke_left', 'football_juke_right',
  'football_spin_move', 'football_tackled_fall', 'karate_hit_react',
  'karate_knockdown',
]);

// What a spawned character actually exposes: baked GLB groups + authored clips.
const AVAILABLE = new Set<string>([...BAKED, ...AUTHORED]);

// Every clip the shipped Babylon modes request (grepped from lib/babylon/modes/*).
const REQUESTED: string[] = [
  // dunk (the proof gate)
  'idle_stand', 'run_forward', 'dunk_charge_gather', 'dunk_launch',
  'dunk_360_scoop', 'dunk_360_eastbay', 'dunk_score_hang', 'jump_land',
  'dunk_land_crouch', 'bball_score_celebrate',
  // karate endless
  'karate_idle_stance', 'karate_block', 'karate_hit_react', 'karate_knockdown',
  'karate_kick_roundhouse', 'karate_punch_light', 'karate_punch_heavy',
  // football
  'football_sprint_return', 'football_tackled_fall', 'football_touchdown_spike',
  'football_juke_left', 'football_juke_right', 'football_spin_move',
  'football_stiff_arm', 'walk_forward', 'jump_up',
  // board family
  'skate_idle_cruise', 'skate_kickflip', 'skate_heelflip', 'snow_grab',
  // timing family
  'baseball_bat_stance', 'baseball_swing_full', 'bball_defend_stance',
  'golf_address_idle', 'golf_swing_full', 'soccer_kick_shoot',
];

/** Coverage predicate: true iff the clip resolves WITHOUT hitting the fallback. */
function isCovered(name: string): boolean {
  if (AVAILABLE.has(name)) return true;               // exact (authored or baked)
  const alias = CLIP_ALIASES[name];
  return !!alias && AVAILABLE.has(alias[0]);          // alias to a real clip
}

check('every alias target exists in the baked GLB', () => {
  for (const [name, [target]] of Object.entries(CLIP_ALIASES)) {
    assert.ok(
      BAKED.has(target),
      `alias "${name}" points to "${target}" which is NOT a baked clip`,
    );
  }
});

check('fallback clip is itself a real baked clip', () => {
  assert.ok(BAKED.has(FALLBACK_CLIP[0]), `fallback "${FALLBACK_CLIP[0]}" missing from GLB`);
});

check('EVERY requested clip is covered (no silent T-pose)', () => {
  const uncovered = REQUESTED.filter((c) => !isCovered(c));
  assert.strictEqual(
    uncovered.length, 0,
    `uncovered clips would T-pose: [${uncovered.join(', ')}]`,
  );
});

check('resolveClip never returns an empty clip for requested names', () => {
  for (const name of REQUESTED) {
    const r = resolveClip(name, AVAILABLE);
    assert.ok(r.clip && r.clip.length > 0, `resolveClip("${name}") returned empty`);
    assert.ok(AVAILABLE.has(r.clip), `resolveClip("${name}") -> "${r.clip}" not in available set`);
  }
});

check('rollout wave 1 (karate + football) clips all resolve — no T-pose when flipped on', () => {
  // These are the exact clips KarateEndlessMode + FootballMode drive at runtime.
  // Flipping either mode onto Babylon (ENABLED_BABYLON_MODES) must never expose
  // a bind-pose strike/evade, so every one is asserted covered here.
  const WAVE1 = [
    'karate_idle_stance', 'karate_block', 'karate_hit_react', 'karate_knockdown',
    'karate_kick_roundhouse', 'karate_punch_light', 'karate_punch_heavy',
    'football_sprint_return', 'football_tackled_fall', 'football_touchdown_spike',
    'football_juke_left', 'football_juke_right', 'football_spin_move',
    'football_stiff_arm', 'walk_forward', 'jump_up',
  ];
  const uncovered = WAVE1.filter((c) => !isCovered(c));
  assert.strictEqual(uncovered.length, 0, `wave-1 clips would T-pose: [${uncovered.join(', ')}]`);
});

check('rollout wave 2 (board family) clips all resolve — no T-pose when flipped on', () => {
  // Every clip the shared BoardRunMode drives for skate / snowboard / surf.
  // Flipping the board family onto Babylon must never expose a bind-pose ride,
  // trick, jump, land or yeti-knockdown, so each is asserted covered here.
  const WAVE2 = [
    'skate_idle_cruise', 'jump_up', 'jump_land',
    'skate_kickflip', 'skate_heelflip', 'snow_grab',
    'football_tackled_fall',
  ];
  const uncovered = WAVE2.filter((c) => !isCovered(c));
  assert.strictEqual(uncovered.length, 0, `wave-2 clips would T-pose: [${uncovered.join(', ')}]`);
});

check('rollout wave 3 (timing family) clips all resolve — no T-pose when flipped on', () => {
  // Every clip the shared makeTimingSportMode drives for tennis / derby /
  // penalty / golf (idle + swing per TENNIS/DERBY/PENALTY/GOLF config).
  // Flipping the timing family onto Babylon must never expose a bind-pose
  // stance or swing, so each is asserted covered here.
  const WAVE3 = [
    'bball_defend_stance', 'baseball_swing_full',   // tennis
    'baseball_bat_stance',                          // derby (swing shared)
    'idle_stand', 'soccer_kick_shoot',              // penalty
    'golf_address_idle', 'golf_swing_full',         // golf
  ];
  const uncovered = WAVE3.filter((c) => !isCovered(c));
  assert.strictEqual(uncovered.length, 0, `wave-3 clips would T-pose: [${uncovered.join(', ')}]`);
});

check('authored clips take precedence over aliases (exact match wins)', () => {
  // dunk_360_eastbay is BOTH authored and aliased; exact authored must win.
  const r = resolveClip('dunk_360_eastbay', AVAILABLE);
  assert.strictEqual(r.exact, true, 'authored eastbay should resolve exact');
  assert.strictEqual(r.clip, 'dunk_360_eastbay');
});

console.log(`\n✅ Babylon anim coverage: ${passed} checks green`);
