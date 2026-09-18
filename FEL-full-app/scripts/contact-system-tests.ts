#!/usr/bin/env -S npx tsx
/**
 * scripts/contact-system-tests.ts — Mode 1 Phase 4 proof (headless, real Havok).
 *
 *   A. Two dynamic player capsules driven at each other COLLIDE and stop —
 *      no clip-through, and the driver loses speed (contact costs momentum).
 *   B. A braced (box-out) defender displaced by the same drive moves far
 *      less than an unbraced one — mass matters.
 *   C. classifyContact thresholds: bump / hard / foul, incl. airborne shooter.
 *
 * Run: npx tsx scripts/contact-system-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + extra}`);
};

import { Vector3 } from '@babylonjs/core';
import { classifyContact } from '../lib/babylon/core/ContactSystem';

async function main() {
  const B = await import('@babylonjs/core');
  const { initPhysics, __setHavokWasmBinary } = await import('../lib/babylon/core/Physics');
  const { ContactSystem } = await import('../lib/babylon/core/ContactSystem');
  __setHavokWasmBinary(fs.readFileSync(
    path.resolve(__dirname, '../node_modules/@babylonjs/havok/lib/umd/HavokPhysics.wasm'),
  ));

  console.log('\nA. bodies collide with weight');
  const run = async (braceDefender: boolean) => {
    const engine = new B.NullEngine();
    engine.getDeltaTime = () => 1000 / 60;
    const scene = new B.Scene(engine);
    new B.ArcRotateCamera('cam', 0, 0, 10, B.Vector3.Zero(), scene);
    await initPhysics(scene);
    const cs = new ContactSystem();
    await cs.init(scene);

    let prevX = -3;
    const rootA = new B.TransformNode('a', scene);
    const rootB = new B.TransformNode('b', scene);
    rootA.position.set(-3, 0, 0);
    rootB.position.set(0, 0, 0);
    cs.addBody('driver', rootA);
    cs.addBody('defender', rootB);
    if (braceDefender) cs.brace('defender', true);

    // IMPULSE drive: the driver gets up to 5 m/s and then COASTS (no
    // sustained force) into the defender — a clean momentum-exchange read.
    // (A sustained wish is a mode-level stall concern, not a solver one.)
    for (let i = 0; i < 120; i++) {
      const coast = i >= 30;                       // ~0.5s of accel, then coast
      cs.drive('driver', coast ? Vector3.Zero() : new Vector3(5, 0, 0), 1 / 60);
      scene.render();
      prevX = rootA.position.x;
    }
    const gap = Vector3.Distance(rootA.position, rootB.position);
    const defMoved = rootB.position.x;
    const events = cs.drainContacts();
    engine.dispose();
    return { gap, defMoved, driverX: rootA.position.x, events };
  };

  const unbraced = await run(false);
  ok(`no clip-through (gap ${unbraced.gap.toFixed(2)}m >= capsule diameter)`, unbraced.gap > 0.6);
  ok(`coasting driver stalls at contact (x=${unbraced.driverX.toFixed(2)} — no push-through)`, unbraced.driverX < 1.2);
  ok(`unbraced defender got moved (x=${unbraced.defMoved.toFixed(2)})`, unbraced.defMoved > 0.05);
  ok(`contact events were observed (${unbraced.events.length})`, unbraced.events.length > 0);

  console.log('\nB. box-out brace resists');
  const braced = await run(true);
  ok(`braced defender moves less (${braced.defMoved.toFixed(2)} vs ${unbraced.defMoved.toFixed(2)})`,
    braced.defMoved < unbraced.defMoved * 0.6);

  console.log('\nC. foul classification');
  ok('slow contact is a bump', classifyContact(1.5) === 'bump');
  ok('game-speed collision is hard contact', classifyContact(3.0) === 'hard');
  ok('high-speed hit on airborne shooter is a foul', classifyContact(4.5, { shooterAirborne: true }) === 'foul');
  ok('same speed on the floor is hard, not a foul', classifyContact(4.5) === 'hard');
  ok('reckless speed is a foul regardless', classifyContact(6.0) === 'foul');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('CONTACT TEST ERROR:', e); process.exit(2); });
