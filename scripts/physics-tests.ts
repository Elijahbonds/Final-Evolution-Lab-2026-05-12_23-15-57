#!/usr/bin/env -S yarn tsx
/**
 * scripts/physics-tests.ts — M14-P9 Lighting floor & collision hardening suite.
 * ============================================================================
 * Phase 9 fixes the spec §2 "lighting floor" regression (football defenders
 * render BLACK because their material-less GLBs fall back to three's default
 * fully-metallic material) and hardens 1-D collision so a fast ball cannot
 * tunnel through / stick to a wall. Both live behind PURE cores so this suite
 * verifies them headlessly and the live components stay thin consumers.
 *
 *   A. LIGHTING FLOOR: needsLightingFloor flags ONLY the render-black default-
 *      metal case; well-authored + textured + env-mapped materials are left
 *      alone; patch values are the tuned floor and deterministic.
 *   B. SWEPT COLLISION: crossedThreshold catches large-step crossings both
 *      ways; reflect1D keeps a body inside its bounds, flips velocity once,
 *      folds overshoot back, never sticks, and is finite/terminating even at
 *      extreme speeds.
 *   C. LIVE WIRING: <Avatar> consumes the material-floor core; the tennis
 *      scene reflects its ball through reflect1D; both cores are import-pure
 *      (no three / react / DOM).
 *
 * Run: yarn tsx scripts/physics-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  needsLightingFloor, lightingFloorPatch,
  FLOOR_METALNESS, FLOOR_ROUGHNESS, FLOOR_EMISSIVE,
  type MaterialProbe,
} from '@/lib/render/material-floor';
import { crossedThreshold, timeOfCrossing, reflect1D } from '@/lib/physics/swept';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

const defaultMetal: MaterialProbe = { isPhysical: true, metalness: 1, roughness: 1, hasColorMap: false, hasEnvMap: false };

// ── A. LIGHTING FLOOR ────────────────────────────
console.log('\nA. lighting floor');

check('the render-black default-metal material is flagged (the defender bug)', () => {
  assert.equal(needsLightingFloor(defaultMetal), true);
});

check('a well-authored hero-style material is NOT touched', () => {
  const authored: MaterialProbe = { isPhysical: true, metalness: 0.1, roughness: 0.55, hasColorMap: true, hasEnvMap: false };
  assert.equal(needsLightingFloor(authored), false);
});

check('a textured default-metal material is left alone (texture already reads)', () => {
  assert.equal(needsLightingFloor({ ...defaultMetal, hasColorMap: true }), false);
});

check('an env-mapped fully-metal material is left alone (reflections read)', () => {
  assert.equal(needsLightingFloor({ ...defaultMetal, hasEnvMap: true }), false);
});

check('a non-PBR (unlit/basic) material is never floored by this rule', () => {
  assert.equal(needsLightingFloor({ ...defaultMetal, isPhysical: false }), false);
});

check('a partially-metal material below threshold is not flagged', () => {
  assert.equal(needsLightingFloor({ ...defaultMetal, metalness: 0.5 }), false);
  assert.equal(needsLightingFloor({ ...defaultMetal, roughness: 0.5 }), false);
});

check('the patch is the tuned matte floor and never leaves the surface black', () => {
  const p = lightingFloorPatch();
  assert.equal(p.metalness, FLOOR_METALNESS);
  assert.equal(p.roughness, FLOOR_ROUGHNESS);
  assert.equal(p.emissiveScale, FLOOR_EMISSIVE);
  assert.ok(p.metalness < 0.6, 'floored metalness must be matte enough to catch light');
  assert.ok(p.emissiveScale > 0, 'emissive floor must be > 0 so nothing is pure black');
});

check('the patch is deterministic', () => {
  assert.deepEqual(lightingFloorPatch(), lightingFloorPatch());
});

// ── B. SWEPT COLLISION ─────────────────────────
console.log('\nB. swept collision');

check('crossedThreshold catches a big forward step (no thin-band miss)', () => {
  assert.equal(crossedThreshold(0, 100, 30), true);   // blew far past 30
  assert.equal(crossedThreshold(0, 100, 5000), false); // never reached
});

check('crossedThreshold catches a crossing in either direction and exact landing', () => {
  assert.equal(crossedThreshold(100, 0, 30), true);
  assert.equal(crossedThreshold(10, 30, 30), true);  // lands exactly on it
  assert.equal(crossedThreshold(31, 40, 30), false); // both above
});

check('timeOfCrossing returns the clamped fraction along the step', () => {
  assert.equal(timeOfCrossing(0, 100, 50), 0.5);
  assert.equal(timeOfCrossing(0, 100, 200), 1); // clamped
  assert.equal(timeOfCrossing(5, 5, 5), 0);     // no motion
});

check('reflect1D keeps a slow body inside bounds unchanged when no wall hit', () => {
  const r = reflect1D(100, 50, 0.016, 30, 500);
  assert.ok(!r.bounced);
  assert.ok(r.pos > 100 && r.pos < 500);
  assert.equal(r.vel, 50);
});

check('reflect1D bounces a body off the near wall and flips velocity once', () => {
  const r = reflect1D(35, -600, 0.05, 30, 500); // would land at 5, past min 30
  assert.ok(r.bounced);
  assert.ok(r.pos >= 30 && r.pos <= 500, 'stays inside bounds');
  assert.ok(r.vel > 0, 'velocity flipped away from the wall');
});

check('reflect1D never lets an extreme-speed body escape the interval (no tunneling)', () => {
  for (const v of [1e4, -1e4, 5e5, -5e5]) {
    const r = reflect1D(250, v, 0.05, 30, 500);
    assert.ok(r.pos >= 30 && r.pos <= 500, `pos ${r.pos} escaped for v=${v}`);
    assert.ok(Number.isFinite(r.pos) && Number.isFinite(r.vel));
  }
});

check('reflect1D does not double-flip / stick against a wall across frames', () => {
  // A ball sitting just outside min moving further out must end up inside and
  // moving inward — and on the NEXT step it must NOT reverse again.
  let pos = 28, vel = -40;
  let r = reflect1D(pos, vel, 0.05, 30, 500); pos = r.pos; vel = r.vel;
  assert.ok(vel > 0 && pos >= 30);
  const r2 = reflect1D(pos, vel, 0.05, 30, 500);
  assert.ok(!r2.bounced, 'must not bounce again once heading back inside');
});

check('reflect1D is a no-op passthrough for degenerate bounds', () => {
  const r = reflect1D(10, 5, 0.1, 30, 30); // zero span
  assert.ok(Number.isFinite(r.pos));
  assert.equal(r.bounced, false);
});

// ── C. LIVE WIRING ────────────────────────────
console.log('\nC. live wiring');

check('the material-floor core is import-pure (no three / react / DOM)', () => {
  const src = read('lib/render/material-floor.ts');
  assert.ok(!/from ['"]three/.test(src), 'must not import three');
  assert.ok(!/from ['"]react/.test(src), 'must not import react');
  assert.ok(!/from ['"]@react-three/.test(src), 'must not import r3f');
});

check('the swept core is import-pure (no three / react / DOM)', () => {
  const src = read('lib/physics/swept.ts');
  assert.ok(!/from ['"]three/.test(src), 'must not import three');
  assert.ok(!/from ['"]react/.test(src), 'must not import react');
});

check('<Avatar> consumes the lighting-floor core (thin skin, no forked logic)', () => {
  const src = read('components/three/avatar.tsx');
  assert.ok(/from '@\/lib\/render\/material-floor'/.test(src), 'Avatar imports the core');
  assert.ok(/needsLightingFloor\(/.test(src), 'Avatar calls needsLightingFloor');
  assert.ok(/lightingFloorPatch\(/.test(src), 'Avatar applies lightingFloorPatch');
});

check('the tennis scene reflects its ball through the swept core', () => {
  const src = read('components/games/tennis-game.tsx');
  assert.ok(/from '@\/lib\/physics\/swept'/.test(src), 'tennis imports the swept core');
  assert.ok(/reflect1D\(/.test(src), 'tennis calls reflect1D on the ball');
});

check('football defenders are skinned Avatars with jersey tints (visible + lit)', () => {
  const src = read('components/games/football-3d.tsx');
  assert.ok(/FootballDefenders/.test(src));
  assert.ok(/<Avatar/.test(src), 'defenders render through the (now-floored) Avatar');
  assert.ok(/DEF_TINTS/.test(src), 'defenders carry jersey tints');
});

console.log(`\n\u2705 physics-tests: ${passed} checks passed`);
