#!/usr/bin/env -S yarn tsx
/**
 * scripts/combat-tests.ts — M14-P8 1v1 Duel (Soul-Calibur-style) suite.
 * =====================================================================
 * Phase 8 turns the 1v1 fighter into a class-based weapon duel driven by a
 * PURE core (lib/combat/duel-core) with COSMETIC-ONLY weapon skins
 * (lib/combat/weapons). This suite proves:
 *
 *   A. ATTACK RESOLUTION: resolveAttack honours range, perfect-parry,
 *      lateral side-step vs linear verticals, tracking horizontals/kicks,
 *      guard chip, guard-break threshold and clean-hit damage per class.
 *   B. 8-WAY MOVEMENT: DIR8 unit vectors, vectorToDir8 snapping and
 *      classifyMotion (advancing / retreating / lateral / still).
 *   C. EQUAL FOOTING: the attack table is NOT keyed by character and
 *      resolveAttack has no character/entitlement input — two players fight
 *      on identical math regardless of weapon skin.
 *   D. WEAPONS ARE COSMETIC: every skin's keys ⊆ COSMETIC_KEYS and no skin
 *      value is numeric (structurally impossible to carry a stat advantage).
 *   E. INPUT SCHEME: karateVersus exposes the 4-button A/B/X/Y layout
 *      (slash / heavy / kick / guard-hold) + left/right steps.
 *   F. LIVE WIRING: the versus scene imports the cores and routes attacks
 *      through resolveAttack (both the player's swing and the AI's swing).
 *
 * Run: yarn tsx scripts/combat-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  resolveAttack, ATTACK_TABLE, GUARD_BREAK_THRESHOLD,
  DIR8_VECTORS, DIR8_ORDER, vectorToDir8, classifyMotion,
  type AttackClass, type Dir8,
} from '@/lib/combat/duel-core';
import {
  WEAPON_SKINS, DEFAULT_WEAPON, COSMETIC_KEYS, weaponForCharacter,
  type WeaponSkin,
} from '@/lib/combat/weapons';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// ── A. ATTACK RESOLUTION ─────────────────────────────────────
console.log('\nA. attack resolution');

check('an attack beyond its reach whiffs (0 dmg) for every class', () => {
  (['horizontal', 'vertical', 'kick'] as AttackClass[]).forEach((cls) => {
    const reach = ATTACK_TABLE[cls].reach;
    const r = resolveAttack({ attack: cls, guard: 'none', defenderMotion: 'still', spacing: reach + 0.5, guardMeter: 0 });
    assert.equal(r.outcome, 'whiff', `${cls} should whiff out of range`);
    assert.equal(r.damage, 0);
  });
});

check('a clean in-range hit deals exactly the class damage', () => {
  (['horizontal', 'vertical', 'kick'] as AttackClass[]).forEach((cls) => {
    const p = ATTACK_TABLE[cls];
    const r = resolveAttack({ attack: cls, guard: 'none', defenderMotion: 'still', spacing: p.reach - 0.1, guardMeter: 0 });
    assert.equal(r.outcome, 'hit', `${cls} should land`);
    assert.equal(r.damage, p.damage, `${cls} damage mismatch`);
    assert.equal(r.hitStunMs, p.hitStunMs);
  });
});

check('a perfect guard negates any attack (0 dmg, meter reset)', () => {
  (['horizontal', 'vertical', 'kick'] as AttackClass[]).forEach((cls) => {
    const r = resolveAttack({ attack: cls, guard: 'perfect', defenderMotion: 'still', spacing: 0.5, guardMeter: 30 });
    assert.equal(r.outcome, 'perfectBlocked');
    assert.equal(r.damage, 0);
    assert.equal(r.guardMeter, 0);
  });
});

check('a LINEAR vertical is side-stepped by a lateral, non-guarding defender', () => {
  const r = resolveAttack({ attack: 'vertical', guard: 'none', defenderMotion: 'lateral', spacing: 1.0, guardMeter: 0 });
  assert.equal(r.outcome, 'sidestepped');
  assert.equal(r.damage, 0);
  assert.equal(ATTACK_TABLE.vertical.tracksLateral, false);
});

check('TRACKING horizontal and kick CATCH a lateral side-step (still hit)', () => {
  (['horizontal', 'kick'] as AttackClass[]).forEach((cls) => {
    assert.equal(ATTACK_TABLE[cls].tracksLateral, true, `${cls} must track`);
    const r = resolveAttack({ attack: cls, guard: 'none', defenderMotion: 'lateral', spacing: 1.0, guardMeter: 0 });
    assert.equal(r.outcome, 'hit', `${cls} should track the step`);
    assert.equal(r.damage, ATTACK_TABLE[cls].damage);
  });
});

check('a GUARDING (planted) defender blocks a vertical instead of side-stepping', () => {
  // guard beats the sidestep branch: a guarding foe plants and eats chip.
  const r = resolveAttack({ attack: 'vertical', guard: 'guarding', defenderMotion: 'lateral', spacing: 1.0, guardMeter: 0 });
  assert.equal(r.outcome, 'blocked');
  assert.ok(r.damage > 0 && r.damage < ATTACK_TABLE.vertical.damage, 'block should chip, not full');
});

check('blocking chips small damage and RAISES the guard meter', () => {
  const r = resolveAttack({ attack: 'horizontal', guard: 'guarding', defenderMotion: 'still', spacing: 1.0, guardMeter: 0 });
  assert.equal(r.outcome, 'blocked');
  assert.ok(r.damage < ATTACK_TABLE.horizontal.damage, 'chip must be < clean damage');
  assert.equal(r.guardMeter, ATTACK_TABLE.horizontal.guardDamage, 'meter should rise by guardDamage');
  assert.equal(r.guardBroke, false);
});

check('enough accumulated chip BREAKS the guard — full damage, meter resets', () => {
  // start the meter just below the break threshold so one more block overflows.
  const start = GUARD_BREAK_THRESHOLD - 1;
  const r = resolveAttack({ attack: 'horizontal', guard: 'guarding', defenderMotion: 'still', spacing: 1.0, guardMeter: start });
  assert.equal(r.outcome, 'guardBreak');
  assert.equal(r.damage, ATTACK_TABLE.horizontal.damage, 'guard break lands FULL damage');
  assert.equal(r.guardMeter, 0, 'meter resets on break');
  assert.equal(r.guardBroke, true);
});

check('resolveAttack is deterministic (pure, no RNG)', () => {
  const ctx = { attack: 'kick' as AttackClass, guard: 'guarding' as const, defenderMotion: 'still' as const, spacing: 1.2, guardMeter: 5 };
  const a = resolveAttack(ctx);
  const b = resolveAttack(ctx);
  assert.deepEqual(a, b);
});

// ── B. 8-WAY MOVEMENT ──────────────────────────────────────
console.log('\nB. 8-way movement');

check('DIR8_VECTORS has all 8 compass dirs, each a unit vector', () => {
  const keys = Object.keys(DIR8_VECTORS) as Dir8[];
  assert.equal(keys.length, 8);
  keys.forEach((k) => {
    const v = DIR8_VECTORS[k];
    const len = Math.hypot(v.x, v.z);
    assert.ok(Math.abs(len - 1) < 1e-9, `${k} not unit length: ${len}`);
  });
  assert.equal(DIR8_ORDER.length, 8);
});

check('vectorToDir8 snaps cardinal & diagonal inputs correctly', () => {
  assert.equal(vectorToDir8(1, 0), 'E');
  assert.equal(vectorToDir8(0, 1), 'N');
  assert.equal(vectorToDir8(-1, 0), 'W');
  assert.equal(vectorToDir8(0, -1), 'S');
  assert.equal(vectorToDir8(1, 1), 'NE');
  assert.equal(vectorToDir8(-1, -1), 'SW');
  assert.equal(vectorToDir8(0, 0), null);
});

check('classifyMotion labels advance / retreat / lateral / still vs facing', () => {
  // facing +Z (north). Moving +Z = advancing, -Z = retreating, +X = lateral.
  assert.equal(classifyMotion(0, 1, 0, 1), 'advancing');
  assert.equal(classifyMotion(0, -1, 0, 1), 'retreating');
  assert.equal(classifyMotion(1, 0, 0, 1), 'lateral');
  assert.equal(classifyMotion(0, 0, 0, 1), 'still');
});

// ── C. EQUAL FOOTING ─────────────────────────────────────
console.log('\nC. equal footing (no pay-to-win)');

check('the attack table is keyed by CLASS, never by character', () => {
  const keys = Object.keys(ATTACK_TABLE).sort();
  assert.deepEqual(keys, ['horizontal', 'kick', 'vertical']);
});

check('resolveAttack signature carries no character / entitlement field', () => {
  const src = read('lib/combat/duel-core.ts');
  // The AttackContext interface must not leak an identity/pay field.
  const ctxBlock = src.slice(src.indexOf('interface AttackContext'), src.indexOf('interface AttackResult'));
  ['characterId', 'character', 'tier', 'entitlement', 'premium', 'level', 'multiplier'].forEach((banned) => {
    assert.ok(!new RegExp(`\\b${banned}\\b`).test(ctxBlock), `AttackContext must not reference ${banned}`);
  });
});

// ── D. WEAPONS ARE COSMETIC ────────────────────────────────
console.log('\nD. weapons are cosmetic');

function assertSkinCosmetic(skin: WeaponSkin, label: string) {
  Object.keys(skin).forEach((k) => {
    assert.ok((COSMETIC_KEYS as readonly string[]).includes(k), `${label}: key "${k}" is not in the cosmetic allowlist`);
  });
  Object.entries(skin).forEach(([k, v]) => {
    assert.equal(typeof v, 'string', `${label}: value for "${k}" must be a string (no numeric stats)`);
    assert.ok(!Number.isFinite(Number(v)) || v.startsWith('#'), `${label}: "${k}" looks numeric`);
  });
}

check('every weapon skin exposes ONLY cosmetic string keys (no stats)', () => {
  assertSkinCosmetic(DEFAULT_WEAPON, 'DEFAULT_WEAPON');
  Object.entries(WEAPON_SKINS).forEach(([id, skin]) => assertSkinCosmetic(skin, id));
});

check('signature skins exist for elijah/rival/sensei with distinct looks', () => {
  ['elijah', 'rival', 'sensei'].forEach((c) => assert.ok(WEAPON_SKINS[c], `missing skin for ${c}`));
  const meshes = new Set(Object.values(WEAPON_SKINS).map((s) => s.meshKind));
  assert.ok(meshes.size >= 2, 'skins should vary the mesh silhouette');
});

check('weaponForCharacter falls back to the default for unknown ids', () => {
  assert.equal(weaponForCharacter('elijah').id, WEAPON_SKINS.elijah.id);
  assert.equal(weaponForCharacter('nobody').id, DEFAULT_WEAPON.id);
  assert.equal(weaponForCharacter(null).id, DEFAULT_WEAPON.id);
});

check('duel-core and weapons are PURE (no three / react / DOM imports)', () => {
  ['lib/combat/duel-core.ts', 'lib/combat/weapons.ts'].forEach((f) => {
    const src = read(f);
    assert.ok(!/from ['"]three['"]/.test(src), `${f} must not import three`);
    assert.ok(!/from ['"]react['"]/.test(src), `${f} must not import react`);
    assert.ok(!/from ['"]@react-three/.test(src), `${f} must not import r3f`);
  });
});

// ── E. INPUT SCHEME ──────────────────────────────────────
console.log('\nE. input scheme (4-button Soul-Calibur layout)');

check('karateVersus exposes A/B/X/Y = slash/heavy/kick/guard + L/R steps', () => {
  const src = read('lib/input-schemes.ts');
  const block = src.slice(src.indexOf('karateVersus:'), src.indexOf('tennis:'));
  assert.ok(/dir:\s*\{\s*left:\s*'a',\s*right:\s*'d'\s*\}/.test(block), 'left/right steps on a/d');
  assert.ok(/pos:\s*'a'[^}]*key:\s*'j'/.test(block), 'A must be slash on key j');
  assert.ok(/pos:\s*'b'[^}]*key:\s*'k'/.test(block), 'B must be heavy on key k');
  assert.ok(/pos:\s*'x'[^}]*key:\s*'u'/.test(block), 'X must be kick on key u');
  assert.ok(/pos:\s*'y'[^}]*key:\s*'l'[^}]*hold:\s*true/.test(block), 'Y must be guard hold on key l');
});

// ── F. LIVE WIRING ───────────────────────────────────────
console.log('\nF. live wiring (versus scene routes through the cores)');

check('karate-versus-3d imports the duel core and weapon registry', () => {
  const src = read('components/games/karate-versus-3d.tsx');
  assert.ok(/from '@\/lib\/combat\/duel-core'/.test(src), 'must import duel-core');
  assert.ok(/from '@\/lib\/combat\/weapons'/.test(src), 'must import weapons');
  assert.ok(/weaponForCharacter\('elijah'\)/.test(src), 'must resolve the player weapon');
});

check('both the player attack and the AI swing resolve through resolveAttack', () => {
  const src = read('components/games/karate-versus-3d.tsx');
  const calls = src.match(/resolveAttack\(/g) ?? [];
  assert.ok(calls.length >= 2, `expected >=2 resolveAttack calls, found ${calls.length}`);
  assert.ok(/doAttack\('horizontal'\)/.test(src), 'A/slash routes to doAttack(horizontal)');
  assert.ok(/doAttack\('vertical'\)/.test(src), 'B/heavy routes to doAttack(vertical)');
  assert.ok(/doAttack\('kick'\)/.test(src), 'X routes to doAttack(kick)');
  assert.ok(/GUARD BROKEN/.test(src), 'guard-break outcome is surfaced to the player');
});

console.log(`\nM14-P8 combat suite: ${passed} checks passed.`);
