// Reads the Mirror's landmark fixtures from disk — node only (tests and probes), never imported by the app
// (MIRROR-COACH P1 baseline, 2026-09-25).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MirrorFixture } from './index';

/** Where the files live. Tests and probes run from the app root (FEL-full-app), so the path is taken from there. */
export const FIXTURE_DIR = resolve(process.cwd(), 'lib/mirror/fixtures');

export function fixturePath(name: string, dir = FIXTURE_DIR): string {
  return resolve(dir, `${name}.json`);
}

export function readFixture(name: string, dir = FIXTURE_DIR): MirrorFixture {
  const fx = JSON.parse(readFileSync(fixturePath(name, dir), 'utf8')) as MirrorFixture;
  if (fx.format !== 'fel-mirror-fixture/1') throw new Error(`[fixtures] ${name}: unknown format ${String(fx.format)}`);
  return fx;
}

/** The recorded baseline (what the real code said about every fixture when it was last recorded). */
export const BASELINE_PATH = resolve(FIXTURE_DIR, 'baseline.json');
