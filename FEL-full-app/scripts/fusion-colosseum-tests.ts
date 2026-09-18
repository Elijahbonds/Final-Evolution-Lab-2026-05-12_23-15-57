#!/usr/bin/env -S npx tsx
/**
 * scripts/fusion-colosseum-tests.ts — Story Phase 5 proof (headless).
 *   A. Fusion: offspring stats live between parents; movelist is the
 *      deduped union resolved AT fusion time (clip+hitbox data travel).
 *   B. Evolution branch reads training history (dominant stat picks line).
 *   C. Colosseum: companion combat runs through FightCore's FighterState/
 *      resolveStrike; stamina gates moves; power stat scales damage.
 *
 * Run: npx tsx scripts/fusion-colosseum-tests.ts
 */
import assert from 'node:assert';
import { SPECIES, Companion } from '../lib/babylon/core/EvolutionGarden';
import { fuse, evolutionBranch, makeFighter, companionStrike, COMPANION_MOVES } from '../lib/babylon/core/FusionColosseum';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. fusion');
ok('offspring inherits stats + the union movelist, resolved now', () => {
  const a = new Companion(SPECIES[0]); a.stats.speed = 70;
  const b = new Companion(SPECIES[1]); b.stats.speed = 90;
  const f = fuse(a, b, () => 0.5);
  assert.ok(f.stats.speed > 70 && f.stats.speed <= 90, `speed inherits up (${f.stats.speed})`);
  const ids = f.moves.map((m) => m.id);
  assert.ok(ids.includes('bite') && ids.includes('talonrake'), 'both parents move pools');
  for (const m of f.moves) assert.ok(m.clip && m.atk.startupMs > 0, 'clip + hitbox resolved at fusion');
  assert.ok(f.dominantSpecies.length > 0);
});

console.log('\nB. evolution branch');
ok('dominant training stat picks the branch line', () => {
  const c = new Companion(SPECIES[0]);
  c.stats.power = 90;
  assert.ok(/War/.test(evolutionBranch(c)));
  c.stats.power = 10; c.stats.agility = 90;
  assert.ok(/Swift/.test(evolutionBranch(c)));
});

console.log('\nC. colosseum combat (FightCore stack)');
ok('moves cost stamina, resolve through FightCore, power scales damage', () => {
  const strong = new Companion(SPECIES[0]); strong.stats.power = 90;
  const weak = new Companion(SPECIES[0]); weak.stats.power = 10;
  const fa = makeFighter(strong), fb = makeFighter(weak), target = makeFighter(new Companion(SPECIES[1]));
  const bite = COMPANION_MOVES.cinderpup[0];
  const r1 = companionStrike(fa, target, bite, 1.2, 1000);
  assert.ok(/HIT/.test(r1), r1);
  const hpAfterStrong = target.state.hp;
  const target2 = makeFighter(new Companion(SPECIES[1]));
  companionStrike(fb, target2, bite, 1.2, 1000);
  assert.ok(hpAfterStrong < 100 - bite.atk.dmg, 'power stat added damage');
  assert.ok(target2.state.hp > hpAfterStrong, 'weaker hits softer');
  fa.stamina = 0;
  assert.equal(companionStrike(fa, target, bite, 1.2, 2000), 'EXHAUSTED');
});

console.log(`\n${pass} checks green`);
