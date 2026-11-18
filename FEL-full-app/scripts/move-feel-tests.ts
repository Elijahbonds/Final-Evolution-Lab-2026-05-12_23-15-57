#!/usr/bin/env tsx
/**
 * Keep the measured movement-feel protections in the discovered CI suite.
 *
 * The probe itself is deterministic and uses the same feel() defaults a play
 * session uses. This wrapper makes the owner-approved 2026-11-17 movement
 * defaults fail fast if the stick response, gear blend, cut/kick smoothing, or
 * one-frame speed-jump bars regress.
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const requireFromHere = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const TSX = requireFromHere.resolve('tsx/cli');
const STICK_FEEL = path.join('scripts', 'probes', 'move-feel', 'stick-feel.mts');

function runStick(env: Record<string, string>): string {
  return execFileSync(process.execPath, [TSX, STICK_FEEL], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', ...env },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function fail(message: string): never {
  throw new Error(`move-feel-tests: ${message}`);
}

function assertBar(name: string, actual: number, ok: boolean, bar: string) {
  if (!Number.isFinite(actual)) fail(`${name} was ${actual}, expected a finite number`);
  if (!ok) fail(`${name} was ${actual}, bar ${bar}`);
}

function rowNumber(rows: Record<string, unknown>, key: string): number {
  const value = rows[key];
  if (typeof value !== 'number') fail(`${key} missing from stick-feel JSON`);
  return value;
}

const selftest = runStick({ SELFTEST: '1' });
const okLines = selftest.split('\n').filter((line) => /\bOK$/.test(line)).length;
if (okLines !== 3 || /\bBAD\b/.test(selftest)) {
  fail(`stick-feel SELFTEST did not prove the closed-form turn control:\n${selftest}`);
}

const rows = JSON.parse(runStick({ JSON: '1' })) as Record<string, unknown>;
const speedStep = rowNumber(rows, 'speedAtMag0.46') - rowNumber(rows, 'speedAtMag0.44');

assertBar('onsetFrames', rowNumber(rows, 'onsetFrames'), rowNumber(rows, 'onsetFrames') <= 3, '<= 3 frames');
assertBar('jog90ms', rowNumber(rows, 'jog90ms'), rowNumber(rows, 'jog90ms') <= 250, '<= 250 ms');
assertBar('stop_jog_ms', rowNumber(rows, 'stop_jog_ms'), rowNumber(rows, 'stop_jog_ms') <= 150, '<= 150 ms');
assertBar('stop_sprint_ms', rowNumber(rows, 'stop_sprint_ms'), rowNumber(rows, 'stop_sprint_ms') <= 233, '<= 233 ms');
assertBar('gear walk/jog step', speedStep, speedStep <= 0.1, '<= 0.1 m/s from 0.44 to 0.46 stick');
assertBar('turn90_jog_degS_first100ms', rowNumber(rows, 'turn90_jog_degS_first100ms'), rowNumber(rows, 'turn90_jog_degS_first100ms') >= 330, '>= 330 deg/s');
assertBar('turn90_jog_within10_ms', rowNumber(rows, 'turn90_jog_within10_ms'), rowNumber(rows, 'turn90_jog_within10_ms') <= 250, '<= 250 ms');
assertBar('turn90_sprint_within10_ms', rowNumber(rows, 'turn90_sprint_within10_ms'), rowNumber(rows, 'turn90_sprint_within10_ms') <= 320, '<= 320 ms');
assertBar('turn90_sprint_maxDecel', rowNumber(rows, 'turn90_sprint_maxDecel'), rowNumber(rows, 'turn90_sprint_maxDecel') <= 18, '<= 18 m/s^2');
assertBar('kickMaxAccel', rowNumber(rows, 'kickMaxAccel'), rowNumber(rows, 'kickMaxAccel') <= 24, '<= 24 m/s^2');
assertBar('speedJumpMaxMps', rowNumber(rows, 'speedJumpMaxMps'), rowNumber(rows, 'speedJumpMaxMps') <= 0.95, '<= 0.95 m/s');

console.log('move-feel-tests: stick-feel selftest and shipped movement bars PASS');
