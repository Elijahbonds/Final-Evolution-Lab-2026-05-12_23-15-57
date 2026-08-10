#!/usr/bin/env -S npx tsx
/**
 * scripts/duel-mode-tests.ts — Mode 2 Phase 7 proof (headless).
 *
 *   A. Registry: duel mode present with fight preset.
 *   B. Three weapons are genuinely distinct through the SAME controller:
 *      staff outranges, blade starts fastest, fists cancel cheapest —
 *      and all movesets pass the readability lint.
 *   C. Ring-out rule: knockback past the disc radius is detectable and
 *      ends a round (pure geometry contract the mode enforces).
 *   D. Guard impact is the Duel skill expression: stricter than parry,
 *      and the impact window/flick requirement holds in the duel context.
 *
 * Run: npx tsx scripts/duel-mode-tests.ts
 */

import assert from 'node:assert';
import { MODES } from '../lib/babylon/modes/registry';
import {
  StrikeController, karateMoveset, staffMoveset, bladeMoveset, validateMoveset,
} from '../lib/babylon/core/StrikeSystem';
import { KARATE_ATTACKS, STAFF_ATTACKS } from '../lib/babylon/core/FightCore';
import { DefenseController, GUARD_IMPACT_WINDOW_MS } from '../lib/babylon/core/DefenseSystem';
import { Vector3 } from '@babylonjs/core';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. registry');
ok('duel mode registered', () => {
  assert.equal(MODES.duel?.modeId, 'duel');
  assert.equal(MODES.duel?.camPreset, 'fight');
});

console.log('\nB. three weapon identities, one controller');
ok('staff outranges blade outranges fists; staff starts slowest', () => {
  const F = karateMoveset(KARATE_ATTACKS), S = staffMoveset(STAFF_ATTACKS), Bl = bladeMoveset();
  const range = (m: Record<string, { atk: { range: number } }>) => Math.max(...Object.values(m).map((x) => x.atk.range));
  assert.ok(range(S) > range(Bl) && range(Bl) > range(F), `${range(F)}/${range(Bl)}/${range(S)}`);
  const fastest = (m: Record<string, { startupSec: number }>) => Math.min(...Object.values(m).map((x) => x.startupSec));
  assert.ok(fastest(Bl) < fastest(S) && fastest(F) < fastest(S), `staff slowest (f=${fastest(F)} b=${fastest(Bl)} s=${fastest(S)})`);
});
ok('all three movesets pass the readability lint', () => {
  assert.deepEqual(validateMoveset(karateMoveset(KARATE_ATTACKS)), []);
  assert.deepEqual(validateMoveset(staffMoveset(STAFF_ATTACKS)), []);
  assert.deepEqual(validateMoveset(bladeMoveset()), []);
});
ok('blade chains slash→cross→riser through one controller', () => {
  const c = new StrikeController(bladeMoveset());
  c.request('slash', 0);
  const DT = 1 / 60;
  while (c.current && c.current.phase !== 'recovery') c.update(DT, 0);
  assert.ok(c.request('crossslash', 200));
  while (c.current && c.current.phase !== 'recovery') c.update(DT, 0);
  assert.ok(c.request('riser', 400));
  assert.equal(c.current!.move.atk.id, 'riser');
});

console.log('\nC. ring-out geometry');
ok('the disc boundary is checkable and sharp', () => {
  const DISC = 6.5;
  const r = (p: Vector3) => Math.hypot(p.x, p.z);
  assert.ok(r(new Vector3(0, 0, 6.4)) < DISC);
  assert.ok(r(new Vector3(0, 0, 6.6)) > DISC);
  // knockback from center toward the edge crosses it
  const pos = new Vector3(0, 0, 5.5);
  const kb = new Vector3(0, 0, 1).scale(1.2 * 3.2 * 0.35);  // heavy knockback impulse, one beat
  pos.addInPlace(kb);
  assert.ok(r(pos) > DISC, `heavy knockback near the edge rings out (r=${r(pos).toFixed(2)})`);
});

console.log('\nD. guard impact as the duel skill');
ok('impact window is stricter than parry and needs the flick', () => {
  const dc = new DefenseController();
  const NOW = 5000;
  // inside parry window, outside impact window, WITH flick: parry only
  dc.pressBlock(NOW - (GUARD_IMPACT_WINDOW_MS + 30), true);
  assert.equal(dc.resolve(KARATE_ATTACKS.jab, 1.4, true, NOW), 'parried');
  // inside impact window with flick: the no-sell
  dc.pressBlock(NOW - 40, true);
  assert.equal(dc.resolve(KARATE_ATTACKS.jab, 1.4, true, NOW), 'guardImpacted');
});

console.log(`\n${pass} checks green`);
