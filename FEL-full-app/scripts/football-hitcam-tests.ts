#!/usr/bin/env -S npx tsx
/**
 * scripts/football-hitcam-tests.ts — the hit-cam is wired to the mode that SHIPS.
 *
 * lib/feel/football-cam.ts was written and unit-tested (football-cam-tests) and then wired
 * into components/games/football-3d.tsx only — the three.js fallback. Football has served
 * from Babylon since rollout wave 1 (flags.ts football: true), so the cut had not fired for
 * a player in a long time. A tested module in a dead path is the most expensive kind of
 * dead code: it looks done on every dashboard.
 *
 * So this asserts the WIRING, not the maths — football-cam-tests already owns the maths.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { STACK_MIN, CONVERGE_RADIUS_YD, countConverging } from '../lib/feel/football-cam';

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

check('the SHIPPING football mode drives the hit-cam', () => {
  // whichever mode the registry serves for `football` is the one that must use it
  const registry = read('lib/babylon/modes/registry.ts');
  const m = registry.match(/football:\s*([A-Za-z0-9_]+)\s*,/);
  assert.ok(m, 'registry maps a mode for football');
  const modeName = m![1];
  const src = read(`lib/babylon/modes/${modeName}.ts`);
  assert.ok(/from '.*feel\/football-cam'/.test(src), `${modeName} imports the hit-cam module`);
  assert.ok(/updateBroadcastCut\(/.test(src), `${modeName} advances the cut each frame`);
  assert.ok(/camDirector\.broadcast\s*=/.test(src), `${modeName} drives the camera with it`);
});

check('football is actually served from that path', () => {
  const flags = read('components/three/flags.ts');
  assert.ok(/football:\s*true/.test(flags), 'football is on the Babylon path (else this wiring is the dead one)');
});

check('the camera director exposes the broadcast blend', () => {
  const cam = read('lib/babylon/core/CameraDirector.ts');
  assert.ok(/public broadcast = 0/.test(cam), 'broadcast blend exists');
  assert.ok(!/const cfg = this\.cfg;/.test(cam), 'every follow read goes through the blended config');
});

check('a stack of defenders converging is what fires it', () => {
  const runner = { x: 0, z: -10 };
  const ahead = (n: number) => Array.from({ length: n }, (_, i) => ({ yd: 12 + i * 0.5, x: i * 0.4, cleared: false }));
  assert.ok(countConverging(ahead(STACK_MIN), runner) >= STACK_MIN, 'a stack converges');
  // a trucked defender is on the floor and converging on nothing
  const downed = ahead(STACK_MIN).map((d) => ({ ...d, cleared: true }));
  assert.equal(countConverging(downed, runner), 0, 'downed defenders do not stack');
  // and the radius is respected
  assert.equal(countConverging([{ yd: 10 + CONVERGE_RADIUS_YD * 3, x: 0, cleared: false }], runner), 0, 'far defenders excluded');
});

check('a new drive starts with a clean camera', () => {
  const src = read('lib/babylon/modes/FootballRushMode.ts');
  const drive = src.slice(src.indexOf('function newDrive'), src.indexOf('function newDrive') + 1400);
  assert.ok(/hitCut\.active = false/.test(drive), 'newDrive clears a held cut');
  assert.ok(/hitCut\.cooldown = 0/.test(drive), 'and drains the cooldown, so the first hit of a drive can cut');
});

console.log(`\n✅ football-hitcam-tests: ${passed} checks green — the cut fires in the mode players load`);
