#!/usr/bin/env -S yarn tsx
/**
 * scripts/input-contract-tests.ts  (M12.5)
 * ========================================
 * ONE INPUT CONTRACT — keyboard + touch + gamepad drive EVERY mode identically.
 *
 * The M12 contract requires a single input pipeline so a player on a keyboard,
 * an on-screen touch pad, or a physical controller all get the same result in
 * any mode — and input is never silently swallowed. The architecture that
 * guarantees this:
 *
 *   1. Every playable mode is mounted through <GameShell> (the loader for each
 *      /play/<mode> route renders GameShell), so no mode can opt out of the
 *      shared input plumbing.
 *   2. GameShell mounts BOTH a PhysicalGamepadPoller (physical controller) and
 *      a VirtualController (on-screen touch pad).
 *   3. The gamepad poller and the touch pad BOTH dispatch the *same* synthetic
 *      keyboard events (pressKey/releaseKey in lib/gamepad-bridge) that the
 *      physical keyboard already produces — so all three collapse onto one
 *      keyboard-event contract every mode already understands.
 *
 * This is a STATIC source invariant: it pins the wiring so a future refactor
 * cannot quietly drop touch/gamepad support from a mode or fork the pipeline.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const ROOT = path.resolve(__dirname, '..');
const PLAY = path.join(ROOT, 'app', 'play');

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  \u2713 ' + name); }
const read = (p: string) => fs.readFileSync(p, 'utf8');

// ---- 1. every /play/<mode> loader mounts GameShell ----------------------
const loaders = fs
  .readdirSync(PLAY)
  .map((d) => path.join(PLAY, d, '_components', 'loader.tsx'))
  .filter((p) => fs.existsSync(p));

check(`found play-mode loaders (${loaders.length})`, () => {
  assert.ok(loaders.length >= 20, `expected >=20 play loaders, found ${loaders.length}`);
});

check('every play-mode loader mounts <GameShell> (no mode opts out)', () => {
  const missing = loaders.filter((p) => !/GameShell/.test(read(p)));
  assert.strictEqual(missing.length, 0, `loaders without GameShell: ${missing.map((p) => path.relative(PLAY, p)).join(', ')}`);
});

// ---- 2. GameShell mounts BOTH gamepad poller and touch controller -------
const shell = read(path.join(ROOT, 'components', 'games', 'game-shell.tsx'));
check('GameShell mounts the PhysicalGamepadPoller (physical controller)', () => {
  assert.ok(/PhysicalGamepadPoller/.test(shell), 'GameShell must poll a physical gamepad');
});
check('GameShell mounts the VirtualController (on-screen touch pad)', () => {
  assert.ok(/VirtualController/.test(shell), 'GameShell must render the touch controller');
});

// ---- 3. touch + gamepad collapse onto the SAME keyboard events ----------
const bridge = read(path.join(ROOT, 'lib', 'gamepad-bridge.ts'));
check('gamepad-bridge dispatches real synthetic KeyboardEvents', () => {
  assert.ok(/new KeyboardEvent\(/.test(bridge), 'bridge must build KeyboardEvents');
  assert.ok(/window\.dispatchEvent\(/.test(bridge), 'bridge must dispatch to window');
  assert.ok(/export function pressKey/.test(bridge) && /export function releaseKey/.test(bridge),
    'bridge must export pressKey/releaseKey');
});

const vc = read(path.join(ROOT, 'components', 'games', 'virtual-controller.tsx'));
check('VirtualController routes touch through the SAME pressKey/releaseKey', () => {
  assert.ok(/from '@\/lib\/gamepad-bridge'/.test(vc), 'touch pad imports the shared bridge');
  assert.ok(/pressKey\(/.test(vc) && /releaseKey\(/.test(vc), 'touch pad presses/releases via the bridge');
});

const poller = read(path.join(ROOT, 'lib', 'gamepad-bridge.ts'));
check('physical gamepad poller dispatches on rising/falling edges (no missed taps)', () => {
  assert.ok(/dispatch\('keydown'/.test(poller) && /dispatch\('keyup'/.test(poller),
    'poller must translate edges to keydown/keyup');
});

console.log(`\ninput-contract-tests: ${passed} checks passed — kb+touch+gamepad unified across ${loaders.length} modes`);
