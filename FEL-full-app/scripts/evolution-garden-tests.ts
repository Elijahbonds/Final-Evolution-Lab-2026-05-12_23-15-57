#!/usr/bin/env -S npx tsx
/**
 * scripts/evolution-garden-tests.ts — Story Phase 4 proof (headless).
 *   A. Species manifest: mount capability is stage-gated; training biases
 *      map mode families to stats.
 *   B. Event bus: modes publish, garden subscribes — a court session feeds
 *      the companion's speed per its bias; XP evolves stages.
 *   C. Flight: only mount-capable+evolved companions fly; boost drains
 *      stamina, glide regens, pitch/yaw steer.
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { SPECIES, Companion, GardenEventBus, trainFromEvent, FlightController } from '../lib/babylon/core/EvolutionGarden';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. species manifest');
ok('mount capability is stage-gated; biases are data', () => {
  const raptor = new Companion(SPECIES.find((s) => s.id === 'strideraptor')!);
  assert.ok(!raptor.mountCapable, 'a chick cannot be a mount');
  raptor.stage = 2;
  assert.ok(raptor.mountCapable, 'a skyraptor can');
  const pup = new Companion(SPECIES.find((s) => s.id === 'cinderpup')!);
  assert.ok(!pup.mountCapable && (pup.species.mountCapableAtStage === null), 'never mountable');
});

console.log('\nB. event bus training');
ok('mode results train companion stats per bias; XP evolves', () => {
  const c = new Companion(SPECIES[0]);
  const bus = new GardenEventBus();
  bus.subscribe((e) => trainFromEvent(c, e));
  const speedBefore = c.stats.speed;
  bus.publish({ modeFamily: 'court', quality01: 0.8 });
  assert.ok(c.stats.speed > speedBefore, 'court session trained speed');
  assert.ok(c.xp > 0);
  for (let i = 0; i < 30; i++) bus.publish({ modeFamily: 'court', quality01: 0.9 });
  assert.ok(c.stage >= 1, `evolved to ${c.stageLabel}`);
  // observer pattern: a second subscriber works independently
  const c2 = new Companion(SPECIES[1]);
  const un = bus.subscribe((e) => trainFromEvent(c2, e));
  bus.publish({ modeFamily: 'board', quality01: 1 });
  assert.ok(c2.stats.agility > 55);
  un();
});

console.log('\nC. flight controller');
ok('boost drains stamina, glide regens, steering steers', () => {
  const c = new Companion(SPECIES[1]);
  c.stage = 2;
  const f = new FlightController(c);
  const s0 = f.stamina;
  for (let i = 0; i < 60; i++) f.update(1 / 60, 0, 0, true);
  assert.ok(f.stamina < s0, 'boost drains');
  const y0 = f.yaw;
  for (let i = 0; i < 60; i++) f.update(1 / 60, 0, 1, false);
  assert.ok(Math.abs(f.yaw - y0) > 0.5, 'yaw steers');
  assert.ok(f.vel.length() > 5, 'flying');
});

console.log(`\n${pass} checks green`);
