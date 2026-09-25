// HOOPS MOTION 2b — CMU at true fps (2026-09-25). Four things this pins:
//   1. THE TABLE: sources.mts reads a mis-stamped CMU subject (75, 88, 141, 143 — captured at 60 Hz, headers say 120) at its
//      true rate and every other file at its header's. Measured by scripts/mocap/fps-check.mts (gravity over real flights,
//      run cadence); subject 78, which the plan listed as 60, measured 120 and stays at its header.
//   2. THE PINS: the seven non-hoops clips built from those subjects (or sharing a hoops window) keep the played duration
//      their own passes tuned, TO THE MILLISECOND, until the combat / boards / football motion passes re-cut them. The
//      windows moved to true seconds (the same frames), the durations did not.
//   3. THE HOOPS LOOPS play their cut window in real time; the hoops one-shots keep the beat their modes are timed on.
//   4. HOOPS_STRIDE_CAPTURE: every stride-matched state paces against the measured speed of the clip it really plays on a
//      hoops rig (scripts/mocap/clip-strides.mts prints CLIP_SPEED and says MATCH), and a state that plays an AUTHORED clip
//      keeps the authored reference.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOCAP_OPPONENT_CLIPS } from './mocapOpponents';
import { MOCAP_STYLE_CLIPS } from './mocapStyles';
import { HOOPS_STRIDE, HOOPS_STRIDE_CAPTURE, RATE_MAX, RATE_MIN, rateFor, strideKindFor } from '../../core/StrideMatch';
import { basketballClipTable } from '../basketballTree';
import { variantFor } from '../opponentMotion';
import { scopeAllows, scopeForMode } from '../clipScope';

interface Manifest { clips: { name: string; file: string; from: number; to: number; duration?: number; loop?: boolean; pin?: string; smoothSec?: number }[] }
const opponents = JSON.parse(readFileSync('scripts/mocap/opponent-clips.json', 'utf8')) as Manifest;
const styles = JSON.parse(readFileSync('scripts/mocap/style-clips.json', 'utf8')) as Manifest;
const entry = (name: string) => opponents.clips.find((c) => c.name === name) ?? styles.clips.find((c) => c.name === name);
const built = (name: string) => MOCAP_OPPONENT_CLIPS.find((c) => c.name === name) ?? MOCAP_STYLE_CLIPS.find((c) => c.name === name);
const windowOf = (c: { source: string }) => { const m = /(\d+\.\d+)–(\d+\.\d+)s/.exec(c.source)!; return { from: +m[1], to: +m[2] }; };
const HEADER_FPS = 1 / 0.00833333;   // every cgspeed file's Frame Time

describe('the true-fps table (scripts/mocap/sources.mts)', () => {
  it('names exactly the four 60-fps subjects, and 78 is not one of them', async () => {
    const { CMU_TRUE_FPS, cmuSubjectOf, trueFps } = await import('../../../../scripts/mocap/sources.mts');
    expect(Object.keys(CMU_TRUE_FPS).sort()).toEqual(['141', '143', '75', '88']);
    for (const s of Object.values(CMU_TRUE_FPS)) expect(s).toBe(60);
    expect(cmuSubjectOf('/x/fel-mocap-sources/cmu/78/78_12.bvh')).toBe('78');
    expect(cmuSubjectOf('cmu/141/141_24.bvh')).toBe('141');
    expect(cmuSubjectOf('deepmotion/IMG_8593.bvh')).toBeNull();
    // the header's own rate, halved: a window in true seconds (twice its header seconds) cuts the frames it cut before
    expect(trueFps('cmu/141/141_24.bvh', 'cmu', HEADER_FPS)).toBeCloseTo(HEADER_FPS / 2, 9);
    expect(trueFps('cmu/78/78_12.bvh', 'cmu', HEADER_FPS)).toBe(HEADER_FPS);
    expect(trueFps('cmu/06/06_15.bvh', 'cmu', HEADER_FPS)).toBe(HEADER_FPS);
    expect(trueFps('deepmotion/My_Movie_18.bvh', 'deepmotion', 60)).toBe(60);   // a DeepMotion header is trusted
  });
});

describe('the seven TEMP speed pins play the duration they did before the fps fix, to the millisecond', () => {
  // the played durations and header-second windows at a37a90ce (before 2b), from the generated modules of that commit
  const PINS: Record<string, { duration: number; file: string; headerWindow: [number, number]; sixty: boolean }> = {
    football_mc_run:      { duration: 0.6,  file: 'cmu/78/78_12.bvh',   headerWindow: [0.10, 0.75], sixty: false },   // 78 is 120: the pin holds only the duration
    karate_mc_uppercut:   { duration: 0.5,  file: 'cmu/141/141_24.bvh', headerWindow: [0.61, 1.13], sixty: true },
    trick_jump_spin_kick: { duration: 0.8,  file: 'cmu/88/88_06.bvh',   headerWindow: [0.15, 1.35], sixty: true },
    trick_cartwheel:      { duration: 0.8,  file: 'cmu/88/88_07.bvh',   headerWindow: [0.00, 1.20], sixty: true },
    cap_escape:           { duration: 0.85, file: 'cmu/88/88_08.bvh',   headerWindow: [0.70, 2.10], sixty: true },
    pk_backflip:          { duration: 0.85, file: 'cmu/88/88_01.bvh',   headerWindow: [0.05, 1.15], sixty: true },
    pk_360_jump:          { duration: 0.95, file: 'cmu/75/75_09.bvh',   headerWindow: [0.05, 1.80], sixty: true },
  };
  for (const [name, pin] of Object.entries(PINS)) {
    it(`${name}: ${pin.duration} s, marked TEMP, on the same frames`, () => {
      const e = entry(name)!, b = built(name)!;
      expect(e.file).toBe(pin.file);
      expect(e.pin, 'the manifest says why the duration is held').toMatch(/^TEMP/);
      expect(e.duration).toBe(pin.duration);
      expect(Math.round(b.duration * 1000)).toBe(Math.round(pin.duration * 1000));
      // a 60-fps window is in true seconds now: twice its header seconds, so floor/ceil × the rate cut the same frames
      const k = pin.sixty ? 2 : 1, w = windowOf(b);
      expect(w.from).toBeCloseTo(pin.headerWindow[0] * k, 2);
      expect(w.to).toBeCloseTo(pin.headerWindow[1] * k, 2);
      const rate = HEADER_FPS / k;   // the window the module cut (a loop's is the refined one, not the manifest's)
      expect(Math.floor(w.from * rate)).toBe(Math.floor(pin.headerWindow[0] * HEADER_FPS));
      expect(Math.ceil(w.to * rate)).toBe(Math.ceil(pin.headerWindow[1] * HEADER_FPS));
      // and the retarget's 35 ms smoothing, read at the header's 120 before, keeps its width in frames (70 ms of true time)
      if (pin.sixty) expect(e.smoothSec).toBe(0.07); else expect(e.smoothSec).toBeUndefined();
    });
  }
  it('nothing else carries a pin', () => {
    const pinned = [...opponents.clips, ...styles.clips].filter((c) => c.pin).map((c) => c.name).sort();
    expect(pinned).toEqual(Object.keys(PINS).sort());
  });
});

describe('the hoops captures: loops at real speed, one-shots on their beat', () => {
  const LOOPS = ['bball_mc_run', 'bball_mc_dribble_run', 'bball_mc_drive', 'bball_mc_defend_slide_right', 'bball_mc_defend_slide_left', 'bball_mc_defend_backpedal',
    'bball_mc_defend_slide_hard_right', 'bball_mc_defend_slide_hard_left', 'bball_mc_dribble_walk', 'bball_mc_dribble_jog', 'bball_mc_dribble_idle', 'bball_mc_defend_stance'];
  it.each(LOOPS)('%s: no `duration` in the manifest, played span = cut span (0.9–1.15× real at rate 1)', (name) => {
    const e = entry(name)!, b = built(name)!;
    expect(e.loop).toBe(true);
    expect(e.duration).toBeUndefined();
    const w = windowOf(b);
    const ratio = (w.to - w.from) / b.duration;
    expect(ratio, `${name}: real ${(w.to - w.from).toFixed(2)} s played ${b.duration} s`).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.15);
  });
  it('the loops are every looping hoops capture', () => {
    expect(opponents.clips.filter((c) => c.name.startsWith('bball_mc_') && c.loop).map((c) => c.name).sort()).toEqual([...LOOPS].sort());
  });
  it('every other hoops clip is a beat its mode is timed on (a duration it keeps until its phase re-cuts it)', () => {
    for (const e of opponents.clips.filter((c) => c.name.startsWith('bball_mc_') && !LOOPS.includes(c.name))) {
      expect(e.loop, e.name).toBeFalsy();
      expect(e.duration, e.name).toBeGreaterThan(0);
    }
  });
});

describe('HOOPS_STRIDE_CAPTURE: each state paces against the clip it plays (scripts/mocap/clip-strides.mts, 2026-09-25)', () => {
  // the ground speed each captured loop covers at rate 1 (hips travel per real second over its cut window, reference leg)
  const CLIP_SPEED: Record<string, number> = {
    bball_mc_run: 4.69, bball_mc_dribble_run: 4.57, bball_mc_drive: 4.57, bball_mc_dribble_jog: 3.87, bball_mc_dribble_walk: 0.97,
    bball_mc_defend_slide_left: 2.4, bball_mc_defend_slide_right: 1.7, bball_mc_defend_slide_hard_left: 2.69, bball_mc_defend_slide_hard_right: 2.69,
    bball_mc_defend_backpedal: 3.31,
  };
  // a hoops rig (the 1v1 scope) owns the captures the scope allows and the tree's own clips
  const hoops = scopeForMode('onevone');
  const table = basketballClipTable();
  const owned = new Set([...MOCAP_OPPONENT_CLIPS.map((c) => c.name).filter((n) => scopeAllows(hoops, n)), ...Object.values(table).map((c) => c.clip)]);
  const strideStates = Object.entries(table).filter(([s, c]) => c.loop && strideKindFor(s) !== 'none');

  it.each(strideStates.map(([s]) => s))('%s: rate 1 exactly when the body moves at its clip\'s own speed', (state) => {
    const plays = variantFor(table[state as keyof typeof table].clip, owned);
    if (plays.startsWith('bball_mc_')) {
      expect(CLIP_SPEED[plays], `${state} plays ${plays}, which has no measured speed`).toBeDefined();
      expect(rateFor(state, CLIP_SPEED[plays], HOOPS_STRIDE_CAPTURE)!, `${state} → ${plays}`).toBeCloseTo(1, 6);
    } else {
      // an authored clip on a captured rig paces exactly as it does on an authored one
      for (const v of [1.5, 3, 4.5]) expect(rateFor(state, v, HOOPS_STRIDE_CAPTURE), `${state} → ${plays} (authored)`).toBe(rateFor(state, v, HOOPS_STRIDE));
    }
  });
  it('the sprint is its own reference (drive, sprint_dribble), and at the tree\'s gears every captured loop paces inside the clamp', () => {
    expect(strideKindFor('drive')).toBe('sprint');
    expect(strideKindFor('sprint_dribble')).toBe('sprint');
    // the gears (basketballTree DRIBBLE GEARS): walk 1.6 / jog 4.2 / sprint 6.4 m/s; the AI runs 3.6–4.2
    for (const [state, speed] of [['walk_dribble', 1.6], ['speed_dribble', 4.2], ['sprint_dribble', 6.4], ['drive', 6.4], ['run', 6.4], ['run', 3.6]] as const) {
      const r = rateFor(state, speed, HOOPS_STRIDE_CAPTURE)!;
      expect(r, `${state} at ${speed} m/s`).toBeGreaterThan(RATE_MIN);
      expect(r, `${state} at ${speed} m/s`).toBeLessThan(RATE_MAX);
    }
  });
  it('every stride-matched DEFENCE state keeps up with the owner\'s 4.2 m/s defender inside its ceiling, but the right slide, which keeps a37a90ce\'s', () => {
    // the ground a state's feet cover at its rate ceiling, against a37a90ce's: before 2b each captured slide loop was squeezed by a
    // hand-set `duration` (real/played below) and paced against 2.0, so its ceiling was clip speed × real/played × RATE_MAX
    const A37_REAL_OVER_PLAYED: Record<string, number> = {
      bball_mc_defend_slide_left: 0.683 / 0.5, bball_mc_defend_slide_right: 0.633 / 0.5, bball_mc_defend_slide_hard_left: 0.6 / 0.6,
      bball_mc_defend_slide_hard_right: 0.6 / 0.6, bball_mc_defend_backpedal: 0.625 / 0.7,
    };
    const DEFENCE = ['defend_slide', 'defend_slide_right', 'defend_slide_hard', 'defend_slide_hard_right', 'defend_backpedal', 'closeout'] as const;
    for (const state of DEFENCE) {
      const plays = variantFor(table[state].clip, owned);
      const captured = plays.startsWith('bball_mc_');
      const clipSpeed = captured ? CLIP_SPEED[plays] : HOOPS_STRIDE.run;   // the closeout plays the authored sprint on every rig
      const ceiling = clipSpeed * (HOOPS_STRIDE_CAPTURE.rateMaxByState?.[state] ?? RATE_MAX);
      const before = clipSpeed * (captured ? A37_REAL_OVER_PLAYED[plays] : 1) * RATE_MAX;
      expect(ceiling, `${state} → ${plays}: ${ceiling.toFixed(2)} m/s, ${before.toFixed(2)} at a37a90ce`).toBeGreaterThanOrEqual(Math.min(before, 4.2) - 0.01);
      if (state === 'defend_slide_right') {
        expect(ceiling).toBeCloseTo(before, 1);                                  // 3.98 m/s: a37a90ce's ceiling, not 4.2 (phase 5)
        expect(rateFor(state, 4.2, HOOPS_STRIDE_CAPTURE)).toBe(HOOPS_STRIDE_CAPTURE.rateMaxByState!.defend_slide_right);
      } else {
        expect(rateFor(state, 4.2, HOOPS_STRIDE_CAPTURE)!, `${state} at 4.2 m/s`).toBeLessThan(RATE_MAX);
      }
    }
  });
  it('the authored table is untouched (no sprint, no per-state numbers): an authored rig paces as it did', () => {
    expect(HOOPS_STRIDE).toEqual({ run: 3.6, slide: 2.0, walk: 0.72, jog: 2.8 });
  });
});
