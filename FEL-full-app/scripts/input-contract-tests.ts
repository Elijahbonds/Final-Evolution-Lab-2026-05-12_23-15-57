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
const relPlay = (p: string) => path.relative(PLAY, p);

const SHELL_EXEMPT_ROUTES: Record<string, string> = {
  calibrate: 'timing calibration utility; it does not record a play session',
  'map-preview': 'auth-gated map preview, not a playable mode',
  mirror: 'Train-owned pose screen; mirror-coach owns its camera/session contract',
};

const LOADER_BYPASS_ROUTES: Record<string, string> = {
  // Prove It is the real-life camera contest. The Babylon loader stays available for /dev/mode/dunkduel, while
  // /play/dunkduel deliberately mounts the on-device pose tracker and pays only the played floor server-side.
  dunkduel: 'IRL Prove It route mounts its camera tracker instead of the legacy Babylon loader',
  // IRON-PARADISE-OUT: /play/training is a temporary redirect to /train. The loader file stays; the page does not mount it.
  training: 'Iron Paradise is parked; /play/training redirects to /train and does not mount its loader',
};

function routeUsesLoader(route: string): boolean {
  const routeDir = path.join(PLAY, route);
  const candidates = [path.join(routeDir, 'page.tsx')];
  const componentsDir = path.join(routeDir, '_components');
  if (fs.existsSync(componentsDir)) {
    for (const name of fs.readdirSync(componentsDir)) {
      if (name.endsWith('.tsx') && name !== 'loader.tsx') candidates.push(path.join(componentsDir, name));
    }
  }
  return candidates.some((file) => {
    if (!fs.existsSync(file)) return false;
    return /from ['"]\.\/(?:_components\/)?loader['"]/.test(read(file));
  });
}

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
  assert.strictEqual(missing.length, 0, `loaders without GameShell: ${missing.map(relPlay).join(', ')}`);
});

const routeDirs = fs
  .readdirSync(PLAY, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(PLAY, d.name, 'page.tsx')))
  .map((d) => d.name)
  .sort();

check('every top-level play route has a GameShell loader or an explicit reviewed exemption', () => {
  const withoutLoader = routeDirs.filter((route) => {
    if (route in SHELL_EXEMPT_ROUTES) return false;
    return !fs.existsSync(path.join(PLAY, route, '_components', 'loader.tsx'));
  });
  assert.strictEqual(
    withoutLoader.length,
    0,
    `routes without loader or exemption: ${withoutLoader.join(', ')}`,
  );
  for (const [route, reason] of Object.entries(SHELL_EXEMPT_ROUTES)) {
    assert.ok(routeDirs.includes(route), `loader exemption is stale; route gone: ${route}`);
    assert.ok(reason.length > 20, `loader exemption needs a real reason: ${route}`);
  }
});

check('every route with a loader actually imports it, unless the bypass is explicit', () => {
  const bypassed = loaders
    .map((loader) => path.basename(path.dirname(path.dirname(loader))))
    .filter((route) => {
      if (route in LOADER_BYPASS_ROUTES) return false;
      return !routeUsesLoader(route);
    });
  assert.strictEqual(
    bypassed.length,
    0,
    `routes with dead loaders or direct mounts: ${bypassed.join(', ')}`,
  );
  for (const [route, reason] of Object.entries(LOADER_BYPASS_ROUTES)) {
    assert.ok(fs.existsSync(path.join(PLAY, route, 'page.tsx')), `loader bypass is stale; route gone: ${route}`);
    assert.ok(reason.length > 20, `loader bypass needs a real reason: ${route}`);
  }
});

// ---- 2. GameShell mounts BOTH gamepad poller and touch controller -------
const shell = read(path.join(ROOT, 'components', 'games', 'game-shell.tsx'));
check('GameShell mounts the PhysicalGamepadPoller (physical controller)', () => {
  assert.ok(/PhysicalGamepadPoller/.test(shell), 'GameShell must poll a physical gamepad');
});
check('GameShell mounts the VirtualController (on-screen touch pad)', () => {
  assert.ok(/VirtualController/.test(shell), 'GameShell must render the touch controller');
});
check('Babylon-owned input suppresses the legacy touch deck', () => {
  assert.ok(/const babylonOwnsInput = isBabylon\(mode\) \|\| !!ownControls/.test(shell), 'GameShell must compute one input owner for Babylon hosts');
  assert.ok(/!babylonOwnsInput && !streamOn && <VirtualController/.test(shell), 'VirtualController must be gated on babylonOwnsInput, not only ownControls');
});
check('offline profile state is an error card, not error plus spinner', () => {
  assert.ok(/!\s*unreachable \? \(/.test(shell), 'GameShell loading spinner must be suppressed when the server is unreachable');
});
check('signed-in challenge links are settled from the finished GameShell run', () => {
  assert.ok(/searchParams\.get\('c'\)/.test(shell), 'GameShell must read /play/<mode>?c=<code>');
  assert.ok(/\/api\/challenge\/\$\{encodeURIComponent\(challengeCode\)\}\/attempt/.test(shell), 'GameShell must post the finished score to the challenge attempt endpoint');
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
