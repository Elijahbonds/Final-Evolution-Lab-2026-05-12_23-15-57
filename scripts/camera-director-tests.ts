#!/usr/bin/env -S yarn tsx
/**
 * scripts/camera-director-tests.ts — M14-P4 Camera Rig / Director suite.
 * =======================================================================
 * Phase 4 unifies camera control behind a single DIRECTOR layer built ON TOP
 * of the pre-existing pure rig core (lib/camera/rigs.ts) — it enriches, it does
 * NOT fork. It also lights up the P3 right-stick by feeding a pure ORBIT model
 * that the shared FollowCamera consumes.
 *
 *   A. PROFILES: the four canonical profiles (follow/orbit/broadcast/cinematic)
 *      map to real rig framings; every mode resolves to a profile.
 *   B. ORBIT MODEL: applyLookInput accumulates yaw/pitch under input, clamps to
 *      the tuned limits, and eases back to CENTER when idle (regression-safe).
 *   C. ORBIT GEOMETRY: orbitOffset is identity at {0,0}, preserves planar radius
 *      under pure yaw, is always finite; directCamera returns computeCamera
 *      exactly when un-orbited and a finite, re-framed pose when orbited.
 *   D. LIVE WIRING (static source invariants): the shared FollowCamera consumes
 *      the orbit model + LOOK_KEYS, and the three free-roam board scenes opt in
 *      via enableLook. The board schemes declare `look` so the right stick is
 *      no longer dormant.
 *
 * Run: yarn tsx scripts/camera-director-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  RIGS,
  computeCamera,
  directCamera,
  applyLookInput,
  orbitOffset,
  profileForMode,
  PROFILE_RIG,
  MODE_PROFILE,
  ORBIT_LIMIT_YAW,
  ORBIT_LIMIT_PITCH_UP,
  ORBIT_LIMIT_PITCH_DOWN,
  type CameraProfile,
  type OrbitState,
  type Subject,
} from '@/lib/camera/rigs';
import { SCHEMES, LOOK_KEYS } from '@/lib/input-schemes';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

const SUBJECT: Subject = { pos: { x: 2, y: 0, z: -3 }, facing: 0.7, speed01: 0.4 };
const finite3 = (v: { x: number; y: number; z: number }) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

// ── A. PROFILES ─────────────────────────────────────────────
const PROFILES: CameraProfile[] = ['follow', 'orbit', 'broadcast', 'cinematic'];

check('every canonical profile maps to a real rig framing', () => {
  for (const p of PROFILES) {
    const kind = PROFILE_RIG[p];
    assert.ok(RIGS[kind], `profile ${p} -> unknown rig ${kind}`);
  }
});

check('profileForMode returns a valid profile for known + unknown modes', () => {
  for (const mode of Object.keys(MODE_PROFILE)) {
    assert.ok(PROFILES.includes(profileForMode(mode)), `bad profile for ${mode}`);
  }
  // Unknown mode falls back to follow (never throws / never undefined).
  assert.strictEqual(profileForMode('___not_a_mode___'), 'follow');
});

check('the free-roam board modes use the orbit (right-stick) profile', () => {
  assert.strictEqual(profileForMode('skateboarding'), 'orbit');
  assert.strictEqual(profileForMode('snowboarding'), 'orbit');
  assert.strictEqual(profileForMode('surfing'), 'orbit');
});

// ── B. ORBIT MODEL ─────────────────────────────────────────
const ZERO: OrbitState = { yaw: 0, pitch: 0 };

check('applyLookInput accumulates yaw right / pitch up under held input', () => {
  let o = ZERO;
  for (let i = 0; i < 10; i++) o = applyLookInput(o, { right: true, up: true }, 1 / 60);
  assert.ok(o.yaw > 0, 'yaw should swing positive holding right');
  assert.ok(o.pitch > 0, 'pitch should rise holding up');
});

check('applyLookInput clamps yaw + pitch to the tuned limits', () => {
  let o = ZERO;
  for (let i = 0; i < 600; i++) o = applyLookInput(o, { right: true, up: true }, 1 / 30);
  assert.ok(o.yaw <= ORBIT_LIMIT_YAW + 1e-6, 'yaw over limit');
  assert.ok(o.pitch <= ORBIT_LIMIT_PITCH_UP + 1e-6, 'pitch over up-limit');
  let d = ZERO;
  for (let i = 0; i < 600; i++) d = applyLookInput(d, { left: true, down: true }, 1 / 30);
  assert.ok(d.yaw >= -ORBIT_LIMIT_YAW - 1e-6, 'yaw under -limit');
  assert.ok(d.pitch >= ORBIT_LIMIT_PITCH_DOWN - 1e-6, 'pitch under down-limit');
});

check('applyLookInput eases back to CENTER when input is released (no drift)', () => {
  let o: OrbitState = { yaw: 0.9, pitch: 0.3 };
  for (let i = 0; i < 600; i++) o = applyLookInput(o, {}, 1 / 30);
  assert.ok(Math.abs(o.yaw) < 1e-6, `yaw did not recenter: ${o.yaw}`);
  assert.ok(Math.abs(o.pitch) < 1e-6, `pitch did not recenter: ${o.pitch}`);
});

check('applyLookInput never overshoots center when recentering', () => {
  // A tiny residual with a huge dt must land exactly on 0, not flip sign.
  const o = applyLookInput({ yaw: 0.0001, pitch: -0.0001 }, {}, 0.05);
  assert.strictEqual(o.yaw, 0);
  assert.strictEqual(o.pitch, 0);
});

check('applyLookInput is NaN-safe', () => {
  const o = applyLookInput({ yaw: NaN, pitch: NaN }, { right: true }, 1 / 60);
  assert.ok(Number.isFinite(o.yaw) && Number.isFinite(o.pitch));
});

// ── C. ORBIT GEOMETRY ──────────────────────────────────────
const OFF = { x: 3, y: 3, z: 8 };

check('orbitOffset is the identity at {0,0}', () => {
  const r = orbitOffset(OFF, ZERO);
  assert.deepStrictEqual(r, OFF);
});

check('orbitOffset preserves the horizontal radius under pure yaw', () => {
  const r0 = Math.hypot(OFF.x, OFF.z);
  const r = orbitOffset(OFF, { yaw: 0.8, pitch: 0 });
  const r1 = Math.hypot(r.x, r.z);
  assert.ok(Math.abs(r0 - r1) < 1e-6, `radius changed ${r0} -> ${r1}`);
  assert.ok(r.y === OFF.y, 'pure yaw must not change height');
});

check('orbitOffset stays finite across the full swing range', () => {
  for (let y = -ORBIT_LIMIT_YAW; y <= ORBIT_LIMIT_YAW; y += 0.2) {
    for (let p = ORBIT_LIMIT_PITCH_DOWN; p <= ORBIT_LIMIT_PITCH_UP; p += 0.1) {
      assert.ok(finite3(orbitOffset(OFF, { yaw: y, pitch: p })));
    }
  }
});

check('directCamera == computeCamera exactly when un-orbited', () => {
  const a = directCamera(SUBJECT, RIGS.follow, { t: 1.2 });
  const b = computeCamera(SUBJECT, RIGS.follow, 1.2);
  assert.deepStrictEqual(a, b);
});

check('directCamera re-frames (moves the camera) but keeps the look target + finite', () => {
  const base = computeCamera(SUBJECT, RIGS.follow, 0);
  const orbited = directCamera(SUBJECT, RIGS.follow, { orbit: { yaw: 0.9, pitch: 0.2 } });
  assert.ok(finite3(orbited.position) && finite3(orbited.target));
  // Target (what we look at) is unchanged; only the camera position swings.
  assert.deepStrictEqual(orbited.target, base.target);
  const moved =
    Math.abs(orbited.position.x - base.position.x) +
    Math.abs(orbited.position.z - base.position.z);
  assert.ok(moved > 0.01, 'orbit should move the camera');
});

// ── D. LIVE WIRING (static source invariants) ───────────────────────
const followCam = read('components/three/follow-camera.tsx');

check('shared FollowCamera consumes the orbit model + LOOK_KEYS (single source)', () => {
  assert.ok(/from '@\/lib\/camera\/rigs'/.test(followCam), 'FollowCamera must import the rig core');
  assert.ok(/applyLookInput/.test(followCam) && /orbitOffset/.test(followCam), 'must use orbit model');
  assert.ok(/LOOK_KEYS/.test(followCam), 'must listen for the shared LOOK_KEYS');
  assert.ok(/enableLook/.test(followCam), 'must expose the opt-in enableLook prop');
});

check('the three free-roam board scenes opt into right-stick look', () => {
  for (const f of ['skateboard-3d', 'snowboard-3d', 'surf-3d']) {
    const src = read(`components/games/${f}.tsx`);
    assert.ok(/enableLook/.test(src), `${f} must pass enableLook to FollowCamera`);
  }
});

check('board schemes declare `look` so the right stick is no longer dormant', () => {
  for (const mode of ['skateboarding', 'snowboarding', 'surfing']) {
    const s = SCHEMES[mode];
    assert.ok(s.look, `${mode} scheme must declare look`);
    assert.strictEqual(s.look!.left, LOOK_KEYS.left);
    assert.strictEqual(s.look!.right, LOOK_KEYS.right);
  }
});

check('LOOK_KEYS do not collide with any board scheme gameplay key', () => {
  const lookVals = new Set(Object.values(LOOK_KEYS));
  for (const mode of ['skateboarding', 'snowboarding', 'surfing']) {
    const s = SCHEMES[mode];
    const gameplay: string[] = [];
    for (const b of s.buttons) gameplay.push(b.key);
    for (const t of s.triggers ?? []) gameplay.push(t.key);
    if (s.dir) for (const k of Object.values(s.dir)) if (k) gameplay.push(k);
    for (const g of gameplay) assert.ok(!lookVals.has(g), `look key collides with ${g} in ${mode}`);
  }
});

console.log(`\n\u2705 camera-director-tests: ${passed} checks passed`);
