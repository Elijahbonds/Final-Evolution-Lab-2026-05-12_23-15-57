#!/usr/bin/env -S yarn tsx
/**
 * scripts/cinematic-tests.ts — M14-P5 Cinematic Event Engine suite.
 * =================================================================
 * Phase 5 adds input-selected DUNK cinematics that play BEFORE the launch. The
 * pure timeline core (lib/cinematic/timeline.ts) samples a camera TRACK and
 * fires one-shot BEATS deterministically; the dunk recipes
 * (lib/cinematic/dunk-cinematics.ts) COMPOSE the camera sweep from the existing
 * rig core — no forked camera code, no new mocap.
 *
 *   A. TRACK SAMPLER: clamps before/after the ends, eases between keys, always
 *      returns a finite frame.
 *   B. PLAYER: beats fire exactly once and in time order; a large dt still fires
 *      every beat it passed; `done` is emitted once at the end; progress is
 *      monotonic and clamped.
 *   C. DUNK RECIPES: every style builds a finite track with a positive duration,
 *      a `gather` beat at the start and a closing `launch` beat that is the LAST
 *      beat; the three styles are distinct.
 *   D. LIVE WIRING (static source invariants): the dunk scene imports the core,
 *      has a `precut` phase, overrides the court camera with the cinematic
 *      frame, and routes the `launch` beat through a shared doLaunch().
 *
 * Run: yarn tsx scripts/cinematic-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  sampleTrack,
  CinematicPlayer,
  type CameraKey,
  type Cinematic,
  type Beat,
} from '@/lib/cinematic/timeline';
import {
  buildDunkCinematic,
  DUNK_CINEMATIC_SPECS,
  DUNK_STYLE_ACTION,
  type DunkStyle,
} from '@/lib/cinematic/dunk-cinematics';
import { type CameraFrame } from '@/lib/camera/rigs';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

const finite3 = (v: { x: number; y: number; z: number }) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const finiteFrame = (f: CameraFrame) => finite3(f.position) && finite3(f.target) && Number.isFinite(f.fov);

function mkFrame(x: number): CameraFrame {
  return { position: { x, y: x, z: x }, target: { x: 0, y: 1, z: 0 }, fov: 40 + x };
}
const TRACK: CameraKey[] = [
  { t: 0, frame: mkFrame(0) },
  { t: 1, frame: mkFrame(10) },
  { t: 2, frame: mkFrame(20) },
];

const STYLES: DunkStyle[] = ['POWER', 'FLASHY', 'SIGNATURE'];
const SUB = { x: 0, y: 1.1, z: 4 };
const RIM = { x: 0, y: 3.05, z: 1.6 };

// ── A. TRACK SAMPLER ────────────────────────────────────────
check('sampleTrack clamps to the first key before the start', () => {
  const f = sampleTrack(TRACK, -5);
  assert.strictEqual(f.position.x, 0);
});

check('sampleTrack clamps to the last key after the end', () => {
  const f = sampleTrack(TRACK, 99);
  assert.strictEqual(f.position.x, 20);
});

check('sampleTrack interpolates monotonically between keys', () => {
  const a = sampleTrack(TRACK, 0.25).position.x;
  const b = sampleTrack(TRACK, 0.75).position.x;
  assert.ok(a > 0 && a < 10, `mid-a out of range: ${a}`);
  assert.ok(b > a && b < 10, `mid-b should exceed a: ${b} vs ${a}`);
});

check('sampleTrack is always finite (incl. empty + single-key + NaN time)', () => {
  assert.ok(finiteFrame(sampleTrack([], 0.5)));
  assert.ok(finiteFrame(sampleTrack([{ t: 0, frame: mkFrame(3) }], 5)));
  assert.ok(finiteFrame(sampleTrack(TRACK, Number.NaN)));
});

// ── B. PLAYER ───────────────────────────────────────────────
function mkCin(duration: number, beats: Beat[]): Cinematic {
  return { id: 'test', duration, track: TRACK, beats };
}

check('every beat fires exactly once across a normal playthrough', () => {
  const p = new CinematicPlayer();
  p.play(mkCin(1.0, [
    { t: 0, id: 'a' },
    { t: 0.5, id: 'b' },
    { t: 1.0, id: 'c' },
  ]));
  const counts: Record<string, number> = {};
  for (let i = 0; i < 200 && p.active; i++) {
    const tick = p.update(1 / 120);
    for (const b of tick.fired) counts[b.id] = (counts[b.id] ?? 0) + 1;
    if (tick.done) break;
  }
  assert.deepStrictEqual(counts, { a: 1, b: 1, c: 1 }, JSON.stringify(counts));
});

check('a single huge dt still fires every beat it passed, in time order', () => {
  const p = new CinematicPlayer();
  p.play(mkCin(1.0, [
    { t: 0, id: 'a' },
    { t: 0.4, id: 'b' },
    { t: 0.9, id: 'c' },
  ]));
  // dt is internally clamped to 0.05, so step to the end and collect.
  const seen: string[] = [];
  for (let i = 0; i < 100 && p.active; i++) {
    const tick = p.update(10);
    for (const b of tick.fired) seen.push(b.id);
    if (tick.done) break;
  }
  assert.deepStrictEqual(seen, ['a', 'b', 'c'], seen.join(','));
});

check('done is emitted exactly once and clears active', () => {
  const p = new CinematicPlayer();
  p.play(mkCin(0.2, [{ t: 0.2, id: 'launch' }]));
  let doneCount = 0;
  for (let i = 0; i < 100; i++) {
    const tick = p.update(1 / 60);
    if (tick.done) doneCount++;
    if (!p.active) break;
  }
  assert.strictEqual(doneCount, 1, `done fired ${doneCount} times`);
  assert.strictEqual(p.active, false);
});

check('the closing launch beat fires on the same tick the timeline completes', () => {
  const p = new CinematicPlayer();
  p.play(mkCin(0.3, [{ t: 0.3, id: 'launch' }]));
  let launchedOnDone = false;
  for (let i = 0; i < 100; i++) {
    const tick = p.update(1 / 60);
    if (tick.fired.some((b) => b.id === 'launch')) launchedOnDone = tick.done;
    if (!p.active) break;
  }
  assert.ok(launchedOnDone, 'launch beat should coincide with done');
});

check('progress is monotonic non-decreasing and clamps to 1', () => {
  const p = new CinematicPlayer();
  p.play(mkCin(0.5, []));
  let prev = -1;
  for (let i = 0; i < 100; i++) {
    const tick = p.update(1 / 60);
    assert.ok(tick.progress >= prev - 1e-9, `progress went backwards: ${tick.progress} < ${prev}`);
    assert.ok(tick.progress <= 1 + 1e-9, `progress exceeded 1: ${tick.progress}`);
    prev = tick.progress;
    if (!p.active) break;
  }
  assert.ok(Math.abs(prev - 1) < 1e-6, `final progress ${prev}`);
});

check('every emitted frame during playback is finite', () => {
  const p = new CinematicPlayer();
  p.play(mkCin(0.6, [{ t: 0.3, id: 'x' }]));
  for (let i = 0; i < 100 && p.active; i++) {
    const tick = p.update(1 / 60);
    assert.ok(finiteFrame(tick.frame), 'non-finite cinematic frame');
    if (tick.done) break;
  }
});

// ── C. DUNK RECIPES ─────────────────────────────────────────
check('every dunk style builds a finite camera track with positive duration', () => {
  for (const style of STYLES) {
    const cin = buildDunkCinematic(style, SUB, RIM);
    assert.ok(cin.duration > 0, `${style} duration must be > 0`);
    assert.ok(cin.track.length >= 2, `${style} needs a real track`);
    for (const k of cin.track) assert.ok(finiteFrame(k.frame), `${style} non-finite key @${k.t}`);
    assert.strictEqual(cin.duration, DUNK_CINEMATIC_SPECS[style].duration);
  }
});

check('every dunk cinematic has a gather beat at the start and a launch beat at the end', () => {
  for (const style of STYLES) {
    const cin = buildDunkCinematic(style, SUB, RIM);
    const gather = cin.beats.find((b) => b.id === 'gather');
    const launch = cin.beats.find((b) => b.id === 'launch');
    assert.ok(gather && gather.t === 0, `${style} gather must sit at t=0`);
    assert.ok(launch, `${style} needs a launch beat`);
    assert.strictEqual(launch!.t, cin.duration, `${style} launch must be at the end`);
    // launch is the LAST beat in time order
    const lastByTime = [...cin.beats].sort((a, b) => a.t - b.t).pop();
    assert.strictEqual(lastByTime!.id, 'launch', `${style} last beat should be launch`);
  }
});

check('the launch beat carries the style airborne action clip', () => {
  for (const style of STYLES) {
    const cin = buildDunkCinematic(style, SUB, RIM);
    const launch = cin.beats.find((b) => b.id === 'launch')!;
    assert.strictEqual(launch.clip, DUNK_STYLE_ACTION[style], `${style} launch clip mismatch`);
  }
});

check('the three dunk styles produce distinct cinematics (duration or sweep)', () => {
  const ids = STYLES.map((s) => buildDunkCinematic(s, SUB, RIM).duration);
  const uniq = new Set(ids);
  assert.strictEqual(uniq.size, STYLES.length, `durations not distinct: ${ids.join(',')}`);
});

check('buildDunkCinematic is deterministic (same inputs -> identical output)', () => {
  const a = buildDunkCinematic('SIGNATURE', SUB, RIM);
  const b = buildDunkCinematic('SIGNATURE', SUB, RIM);
  assert.deepStrictEqual(a, b);
});

// ── D. LIVE WIRING (static source invariants) ───────────────
const DUNK = read('components/games/dunk-game-3d.tsx');

check('dunk scene imports the pure cinematic core', () => {
  assert.ok(/from '@\/lib\/cinematic\/timeline'/.test(DUNK), 'missing timeline import');
  assert.ok(/buildDunkCinematic/.test(DUNK) && /from '@\/lib\/cinematic\/dunk-cinematics'/.test(DUNK), 'missing dunk-cinematics import');
});

check('dunk scene has a precut phase driven by a CinematicPlayer', () => {
  assert.ok(/'precut'/.test(DUNK), 'no precut phase');
  assert.ok(/new CinematicPlayer\(\)/.test(DUNK), 'no CinematicPlayer instance');
  assert.ok(/cine\.current\.update\(/.test(DUNK), 'cinematic player is not advanced');
});

check('the court camera is overridden by the cinematic frame while active', () => {
  assert.ok(/cineFrameRef/.test(DUNK), 'CourtCamera does not take a cinematic frame');
  assert.ok(/cine \? cine :/.test(DUNK), 'cinematic frame does not override the live rig');
});

check('the launch beat routes through a shared doLaunch (physics not forked)', () => {
  assert.ok(/const doLaunch = useCallback/.test(DUNK), 'no shared doLaunch');
  assert.ok(/doLaunch\(pendingPower\.current\)/.test(DUNK), 'launch beat does not call doLaunch');
  // releaseCharge must now start the cinematic instead of jumping immediately.
  assert.ok(/cine\.current\.play\(/.test(DUNK), 'releaseCharge does not start the cinematic');
});

console.log(`\nM14-P5 cinematic: ${passed} checks passed.`);
