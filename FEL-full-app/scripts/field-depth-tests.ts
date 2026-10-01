#!/usr/bin/env -S npx tsx
/**
 * FIELD-DEPTH W4 — match length, camera, and env guards for the seven field modes.
 *
 * Run: npx tsx scripts/field-depth-tests.ts
 */

import { readFileSync } from 'node:fs';
import { FIELD_DEPTH, FIELD_DEPTH_TARGET_SEC } from '../lib/field-depth';
import { BIG_AIR_TUNING } from '../lib/feel/cores/big-air-constants';
import { OUTS_CAP } from '../lib/babylon/core/derbyHud';
import { BREAK } from '../lib/babylon/core/Breakaway';
import { REGULATION_KICKS } from '../lib/babylon/core/ShootoutCore';
import { makeBigAirSession } from '../lib/feel/cores/big-air-skin';
import { TennisScore, VolleyScore } from '../lib/babylon/core/RallyCore';
import { MIN_SAFE_DISTANCE } from '../lib/babylon/core/CameraStandoff';
import { FOLLOW_PRESETS } from '../lib/babylon/core/CameraDirector';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const src = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const pin = (rel: string, re: RegExp): number => {
  const m = src(rel).match(re);
  if (!m) throw new Error(`${rel} no longer matches ${re}`);
  return Number(m[1]);
};

// ── A. structure constants wired in live modes ───────────────────────────────
{
  ok(pin('lib/babylon/modes/FootballRushMode.ts', /const DRIVES = (\d+);/) === FIELD_DEPTH.footballDrives,
    `football drives ${FIELD_DEPTH.footballDrives}`);
  ok(BIG_AIR_TUNING.attemptsPerRound === FIELD_DEPTH.bigAirAttempts,
    `big-air attempts ${FIELD_DEPTH.bigAirAttempts}`);
  ok(pin('lib/babylon/modes/precisionModes.ts', /const TOTAL = (\d+);\s*\/\/ FIELD-DEPTH W4: twenty pitches/) === FIELD_DEPTH.derbyPitches,
    `derby pitches ${FIELD_DEPTH.derbyPitches}`);
  ok(OUTS_CAP === FIELD_DEPTH.derbyOutsCap, `derby outs cap ${FIELD_DEPTH.derbyOutsCap}`);
  ok(BREAK.clockSec === FIELD_DEPTH.breakawayClockSec, `breakaway clock ${FIELD_DEPTH.breakawayClockSec}s`);
  ok(pin('lib/babylon/modes/precisionModes.ts', /const TOTAL = (\d+);\s*\/\/ FIELD-DEPTH W4: matches GOLF_PAR/) === FIELD_DEPTH.golfHoles,
    `golf holes ${FIELD_DEPTH.golfHoles}`);
  ok(src('lib/babylon/modes/NetSportMode.ts').includes(`new TennisScore(${FIELD_DEPTH.tennisGames})`),
    `tennis first to ${FIELD_DEPTH.tennisGames} games`);
}

// ── B. scripted normal run length (core / rules simulation) ────────────────────
const DT = 1 / 60;

function stepBigAirAttempts(n: number): number {
  let sec = 0;
  for (let a = 0; a < n; a++) {
    const c = makeBigAirSession();
    while (c.state.phase === 'Run' && sec < 120) { c.step(DT); sec += DT; }
    while (c.state.phase === 'Air' && sec < 120) { c.step(DT); sec += DT; }
    while (c.state.phase === 'Land' && sec < 120) { c.step(DT); sec += DT; }
  }
  return sec;
}

{
  const bigAirSec = stepBigAirAttempts(FIELD_DEPTH.bigAirAttempts);
  ok(bigAirSec >= FIELD_DEPTH_TARGET_SEC.bigAir,
    `big-air ${FIELD_DEPTH.bigAirAttempts} attempts ≥ ${FIELD_DEPTH_TARGET_SEC.bigAir}s (got ${bigAirSec.toFixed(1)}s)`);

  const t = new TennisScore(FIELD_DEPTH.tennisGames);
  let games = 0;
  while (games < FIELD_DEPTH.tennisGames) {
    let r: string = 'point';
    while (r !== 'game' && r !== 'match') r = t.award(0);
    if (r === 'game' || r === 'match') games++;
  }
  ok(games === FIELD_DEPTH.tennisGames, `tennis match ends at ${FIELD_DEPTH.tennisGames} games`);

  const v = new VolleyScore(FIELD_DEPTH.volleyballPoints);
  let pts = 0;
  while (pts < FIELD_DEPTH.volleyballPoints) {
    const r = v.award(0);
    if (r === 'set') break;
    pts = v.points[0];
  }
  ok(pts >= FIELD_DEPTH.volleyballPoints - 1, 'volleyball set reaches target band');

  const soccerKicks = REGULATION_KICKS * 2;
  const soccerSec = soccerKicks * (FIELD_DEPTH.breakawayClockSec + 2.5);
  ok(soccerSec >= FIELD_DEPTH_TARGET_SEC.soccer,
    `soccer shootout model ≥ ${FIELD_DEPTH_TARGET_SEC.soccer}s (${soccerSec.toFixed(0)}s)`);

  const derbySec = FIELD_DEPTH.derbyPitches * 2.8;
  ok(derbySec >= FIELD_DEPTH_TARGET_SEC.baseball,
    `baseball derby model ≥ ${FIELD_DEPTH_TARGET_SEC.baseball}s (${derbySec.toFixed(0)}s)`);

  const footballSec = FIELD_DEPTH.footballDrives * 9;
  ok(footballSec >= FIELD_DEPTH_TARGET_SEC.football,
    `football drive model ≥ ${FIELD_DEPTH_TARGET_SEC.football}s (${footballSec}s)`);

  const golfSec = FIELD_DEPTH.golfHoles * 18;
  ok(golfSec >= FIELD_DEPTH_TARGET_SEC.golf,
    `golf hole model ≥ ${FIELD_DEPTH_TARGET_SEC.golf}s (${golfSec}s)`);
}

// ── C. WA-24 football camera ────────────────────────────────────────────────
{
  const rush = src('lib/babylon/modes/FootballRushMode.ts');
  ok(rush.includes("camPreset: 'gridiron'"), 'football uses gridiron preset (not runner)');
  ok(FOLLOW_PRESETS.gridiron.distance >= MIN_SAFE_DISTANCE + 4,
    `gridiron distance ${FOLLOW_PRESETS.gridiron.distance}m clears standoff`);
}

// ── D. WA-7 big-air camera + trees ───────────────────────────────────────────
{
  const air = src('lib/babylon/modes/AirSessionMode.ts');
  ok(air.includes('buildBigAirSlope'), 'big-air uses buildBigAirSlope (no venueBox walls)');
  ok(air.includes("setPreset('board')") && air.includes('setAir('),
    'big-air air phase uses board preset + setAir');
  ok(src('lib/babylon/visual/VenueKit.ts').includes('buildBigAirSlope'),
    'VenueKit.buildBigAirSlope exists');
}

// ── E. WA-17 soccer / baseball env ───────────────────────────────────────────
{
  const kit = src('lib/babylon/visual/VenueKit.ts');
  ok(kit.includes("preset === 'pitch'") && kit.includes('paintBleachers(CROWD), paintBleachers(CROWD)'),
    'pitch walls use bleachers only (no smeared cliff cones)');
  const derby = src('lib/babylon/modes/precisionModes.ts');
  ok(!derby.includes('CreateDisc(`park_target_'), 'derby park has no floating target orbs');
  ok(derby.includes('buildBallparkOutfield'), 'derby keeps clean outfield wall');
}

if (fail.length) {
  console.error(`field-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`field-depth-tests: ${checks} checks green`);
