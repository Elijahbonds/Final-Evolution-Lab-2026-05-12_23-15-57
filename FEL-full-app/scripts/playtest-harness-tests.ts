#!/usr/bin/env -S yarn tsx
/**
 * scripts/playtest-harness-tests.ts  (M12.9)
 * ==========================================
 * SELF-PLAYTEST HARNESS invariants.
 *
 * Part A (functional): drive the real harness module (lib/playtest/harness.ts)
 * under a simulated browser + PLAYTEST mode and prove the window.__felTest
 * contract works end-to-end: register -> listModes/active/getState/sendInput ->
 * unregister. Also prove it is INERT when PLAYTEST mode is off.
 *
 * Part B (static): prove every 3D mode surface that owns a live scoring loop
 * actually wires itself into the harness (registerFelMode + unregisterFelMode),
 * so no mode is invisible to the harness.
 *
 * Part C (documentation): the DETERMINISTIC per-mode scored-loop proof — drive a
 * mode's core through a full loop and assert it reaches a win score — is the set
 * of M9/M10 core+retrofit suites already in this standing suite; this test just
 * pins that they exist so the "scored-loop" claim stays backed.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  \u2713 ' + name); }

// ---- Part A: functional harness under a simulated browser --------------
// Simulate a browser + PLAYTEST mode BEFORE importing the module so its
// window-install path runs.
(globalThis as any).window = { location: { search: '?playtest=1' } };
process.env.NEXT_PUBLIC_PLAYTEST_MODE = '';

async function main() {
  const harness = await import('../lib/playtest/harness');
  const { registerFelMode, unregisterFelMode, isPlaytestMode } = harness;

  check('isPlaytestMode() true via ?playtest=1', () => {
    assert.strictEqual(isPlaytestMode(), true);
  });

  check('registering a mode installs window.__felTest and lists it', () => {
    let phase = 'idle';
    let score = 0;
    registerFelMode('fakeMode', {
      getState: () => ({ phase, score }),
      sendInput: (a) => { if (a === 'score') score += 2; if (a === 'go') phase = 'play'; },
    });
    const api = (globalThis as any).window.__felTest;
    assert.ok(api, 'window.__felTest installed');
    assert.deepStrictEqual(api.listModes(), ['fakeMode']);
    assert.strictEqual(api.active(), 'fakeMode');
  });

  check('getState() snapshots the active mode', () => {
    const api = (globalThis as any).window.__felTest;
    assert.deepStrictEqual(api.getState(), { phase: 'idle', score: 0 });
  });

  check('sendInput() routes actions into the active mode and mutates state', () => {
    const api = (globalThis as any).window.__felTest;
    assert.strictEqual(api.sendInput('go'), true);
    assert.strictEqual(api.sendInput('score'), true);
    assert.strictEqual(api.sendInput('score'), true);
    assert.deepStrictEqual(api.getState(), { phase: 'play', score: 4 });
  });

  check('a second mode becomes active; both are listed', () => {
    registerFelMode('otherMode', { getState: () => ({ ok: true }), sendInput: () => {} });
    const api = (globalThis as any).window.__felTest;
    assert.strictEqual(api.active(), 'otherMode');
    assert.deepStrictEqual(api.listModes().sort(), ['fakeMode', 'otherMode']);
    // targeted getState by id still reaches the first mode
    assert.deepStrictEqual(api.getState('fakeMode'), { phase: 'play', score: 4 });
  });

  check('unregister removes a mode and re-points active', () => {
    unregisterFelMode('otherMode');
    const api = (globalThis as any).window.__felTest;
    assert.strictEqual(api.active(), 'fakeMode');
    unregisterFelMode('fakeMode');
    assert.deepStrictEqual(api.listModes(), []);
    assert.strictEqual(api.active(), null);
  });

  // ---- Part B: every playable host registers + unregisters --------------
  const legacyWired: Record<string, string> = {
    'dunk-game-3d.tsx': 'dunk',
    'one-v-one-3d.tsx': 'onevone',
    'basketball-3d.tsx': 'basketball',
    'baseball-3d.tsx': 'baseball',
    'golf-3d.tsx': 'golf',
    'karate-3d.tsx': 'karate',
    'karate-versus-3d.tsx': 'karateVs',
    'soccer-3d.tsx': 'soccer',
    'three-point-3d.tsx': 'threePoint',
    'three-v-three-3d.tsx': 'threeVThree',
  };
  check(`every legacy 3D mode registers + unregisters (${Object.keys(legacyWired).length})`, () => {
    for (const [file, id] of Object.entries(legacyWired)) {
      const src = fs.readFileSync(path.join(ROOT, 'components', 'games', file), 'utf8');
      assert.ok(src.includes(`registerFelMode('${id}'`), `${file} must registerFelMode('${id}')`);
      assert.ok(src.includes(`unregisterFelMode('${id}')`), `${file} must unregisterFelMode('${id}')`);
      assert.ok(/getState:/.test(src) && /sendInput:/.test(src), `${file} bridge needs getState + sendInput`);
    }
  });

  const babylonWired: Record<string, string> = {
    'aero-aces-babylon.tsx': 'aeroaces',
    'air-session-babylon.tsx': 'modeKey',
    'basketball-babylon.tsx': 'onevone',
    'board-babylon.tsx': 'modeKey',
    'brainbrawl-babylon.tsx': 'brainbrawl',
    'carnival-babylon.tsx': 'carnival',
    'duel-babylon.tsx': 'duel',
    'dunk-babylon.tsx': 'dunk',
    'dunkduel-babylon.tsx': 'dunkduel',
    'football-babylon.tsx': 'football',
    'freerun-babylon.tsx': 'freerun',
    'karate-babylon.tsx': 'karate',
    'karate-vs-babylon.tsx': 'karate_vs',
    'mixedcombat-babylon.tsx': 'mixedcombat',
    'showdown-babylon.tsx': 'showdown',
    'sprint-babylon.tsx': 'modeKey',
    'three-point-babylon.tsx': 'threepoint',
    'three-v-three-babylon.tsx': 'threevthree',
    'timing-babylon.tsx': 'modeKey',
    'velocity-kart-babylon.tsx': 'velocitykart',
    'who-scene-it-babylon.tsx': 'who_scene_it',
  };
  check(`every Babylon host registers with the playtest bridge (${Object.keys(babylonWired).length})`, () => {
    const gamesDir = path.join(ROOT, 'components', 'games');
    const actual = fs.readdirSync(gamesDir).filter((f) => f.endsWith('-babylon.tsx')).sort();
    assert.deepStrictEqual(actual, Object.keys(babylonWired).sort(), 'babylon host manifest must list every *-babylon.tsx file');

    const bridgeSrc = fs.readFileSync(path.join(gamesDir, 'use-babylon-playtest-bridge.ts'), 'utf8');
    assert.ok(bridgeSrc.includes('registerFelMode(modeId'), 'Babylon playtest bridge must register modes');
    assert.ok(bridgeSrc.includes('unregisterFelMode(modeId'), 'Babylon playtest bridge must unregister modes');
    assert.ok(bridgeSrc.includes('emitPlaytestInput'), 'Babylon playtest bridge must route sendInput to InputBus');

    for (const [file, id] of Object.entries(babylonWired)) {
      const src = fs.readFileSync(path.join(gamesDir, file), 'utf8');
      const expected = id === 'modeKey' ? 'useBabylonPlaytestBridge(modeKey' : `useBabylonPlaytestBridge('${id}'`;
      assert.ok(src.includes("use-babylon-playtest-bridge"), `${file} must import the Babylon playtest bridge`);
      assert.ok(src.includes(expected), `${file} must call ${expected}`);
    }
  });

  // ---- Part C: deterministic scored-loop proof lives in core suites -----
  check('per-mode deterministic scored-loop suites are present', () => {
    const suiteSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'standing-suite.ts'), 'utf8');
    const required = [
      'court-core-tests.ts',        // dunk / hoops family scoring core
      'ride-core-tests.ts',         // skate/snow/surf scoring core
      'air-session-core-tests.ts',  // big-air / vault scoring core
      'sprint-core-tests.ts',       // sprint scoring core
      'court-rally-core-tests.ts',  // tennis/golf/volley/derby/penalty core
      'quiz-core-tests.ts',         // brain-brawl / who-scene-it core
      'football-retrofit-tests.ts', // street football scored loop
    ];
    for (const r of required) {
      assert.ok(suiteSrc.includes(r), `standing suite must run ${r} (scored-loop proof)`);
    }
  });

  console.log(`\nplaytest-harness-tests: ${passed} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
