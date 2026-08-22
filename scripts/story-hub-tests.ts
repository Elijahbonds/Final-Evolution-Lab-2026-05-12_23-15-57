#!/usr/bin/env -S npx tsx
/**
 * scripts/story-hub-tests.ts — Story Phase 1 proof (headless).
 *   A. Sectors are real zones with sane bounds + spawns inside them.
 *   B. Gates trigger on proximity; flight-sealed gates report sealed
 *      without flight and open with it; every gate's modeId exists in the
 *      MODES registry (the shim handoff is real).
 *   C. Quest manifest: validates good quests, rejects bad gate/sector refs.
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { SECTORS, WORLD_GATES, GateSystem, validateQuestManifest, type QuestDef } from '../lib/babylon/core/StoryHub';
import { MODES } from '../lib/babylon/modes/registry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. sectors');
ok('every sector has sane bounds and a spawn inside them', () => {
  for (const s of SECTORS) {
    assert.ok(s.bounds.x1 > s.bounds.x0 && s.bounds.z1 > s.bounds.z0);
    assert.ok(s.spawn.x >= s.bounds.x0 && s.spawn.x <= s.bounds.x1 && s.spawn.z >= s.bounds.z0 && s.spawn.z <= s.bounds.z1, s.id);
  }
});

console.log('\nB. world gates');
ok('proximity triggers; sealed gates respect the flight flag', () => {
  const gs = new GateSystem(WORLD_GATES);
  const gate = WORLD_GATES[0];
  const at = gs.gateAt(gate.pos.clone(), { flight: false, rivalTier2: false });
  assert.ok(at && !at.sealed, 'open gate triggers');
  const sky = WORLD_GATES.find((g) => g.requires === 'flight')!;
  assert.ok(gs.gateAt(sky.pos.clone(), { flight: false, rivalTier2: false })!.sealed, 'sealed without flight');
  assert.ok(!gs.gateAt(sky.pos.clone(), { flight: true, rivalTier2: false })!.sealed, 'opens with flight');
  assert.equal(gs.gateAt(new Vector3(999, 0, 999), { flight: true, rivalTier2: true }), null);
});
ok('every gate hands off to a real mode in the registry', () => {
  for (const g of WORLD_GATES) assert.ok(MODES[g.modeId], `gate ${g.id} -> missing mode "${g.modeId}"`);
});

console.log('\nC. quest manifest schema');
ok('good manifests pass; dangling refs fail', () => {
  const good: QuestDef[] = [
    { id: 'q1', label: 'First Dunk', sectorId: 'blacktop', gateId: 'gate_dunk', beatId: 'b1', goal: { type: 'playMode', modeId: 'dunk' } },
    { id: 'q2', label: 'Dojo Night', sectorId: 'dojo', beatId: 'b2', goal: { type: 'winMode', modeId: 'duel', count: 1 } },
  ];
  assert.deepEqual(validateQuestManifest(good), []);
  const bad: QuestDef[] = [
    { id: 'q3', label: 'Bad', sectorId: 'nowhere', gateId: 'gate_nope', beatId: 'b3', goal: { type: 'playMode' } },
    { id: 'q1', label: 'Dupe', sectorId: 'blacktop', beatId: 'b4', goal: { type: 'playMode' } },
  ];
  const errs = validateQuestManifest([...good, ...bad]);
  assert.ok(errs.some((e) => e.includes('unknown gate')));
  assert.ok(errs.some((e) => e.includes('unknown sector')));
});

console.log(`\n${pass} checks green`);
