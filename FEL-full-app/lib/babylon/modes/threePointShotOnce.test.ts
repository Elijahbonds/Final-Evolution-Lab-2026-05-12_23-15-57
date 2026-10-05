// HOOPS-10PHASE-2 phase 1 (2026-10-03): the 3PT shootout fired TWO shots from ONE press.
//
// Root cause (measured, not guessed — HOOPS-RESEARCH-NOTE.md, binding): the shot EVENT was already single
// (S.fired guards it); the double was in the ANIMATION SEQUENCE and in the INPUT EDGE:
//   1. the press played the jumpshot capture from frame 0 — its own dip/load — while the shooter was already
//      HELD in the pull-up gather's loaded pose: two arm-raises for one shot (set, rise, release, follow-through
//      is the one-motion read);
//   2. a press delivered twice (a touch control's pointerdown AND click, a double-registered listener) could fire
//      again once the ball advanced re-armed S.fired — no edge latch stood in front of fire().
//
// The fix: an edge-triggered ShotLatch (spends on the press edge, re-arms only on the release edge) and the jumper
// entered at its rise (from01 = CAPTURE_RISE_START_01), with releaseIn measured from the rise, not from frame 0.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ShotLatch, releaseDelaySec } from './ThreePointMode';
import { CAPTURE_RISE_START_01, riseStartOf, CAPTURE_RELEASE_01 } from '../anim/opponentMotion';
import type { CharacterAnimator } from '../anim/CharacterAnimator';

const mode = readFileSync('lib/babylon/modes/ThreePointMode.ts', 'utf8');

/** A rig stand-in: only what variantFor reads. */
const rig = (clips: string[]): CharacterAnimator => ({ clipNames: new Set(clips) }) as unknown as CharacterAnimator;

describe('ShotLatch — one press = one shot (the regression: this FAILS if one input can produce two shots)', () => {
  it('a press acts exactly once until the release edge re-arms it', () => {
    const latch = new ShotLatch();
    expect(latch.press()).toBe(true);          // the press fires
    expect(latch.press()).toBe(false);         // its duplicate delivery (pointerdown+click) does not
    expect(latch.press()).toBe(false);         // …however many times it is repeated
    latch.release();                           // the finger comes off
    expect(latch.press()).toBe(true);          // the next press is a new shot
    expect(latch.press()).toBe(false);
  });

  it('a release without a press is a no-op; a held button never re-fires across balls', () => {
    const latch = new ShotLatch();
    latch.release();                           // stray release edge
    expect(latch.press()).toBe(true);          // ball 1
    // the button stays HELD through the flight and the next ball's arrival: no new edge, no auto-shot
    expect(latch.press()).toBe(false);
    latch.release();
    expect(latch.press()).toBe(true);          // ball 2 takes a fresh press
  });
});

describe('the mode wires every shoot press and release through the latch', () => {
  it('onInput spends the latch on the press edge and re-arms it on the release edge', () => {
    expect(mode).toMatch(/if \(!e\.pressed\) \{ shotLatch\.release\(\); return; \}/);
    expect(mode).toMatch(/if \(!shotLatch\.press\(\)\) return;/);
    expect(mode).toMatch(/const shotLatch = new ShotLatch\(\)/);
  });
});

describe('the shot reads as ONE motion — set, rise, release, follow-through (no duplicate arm-raise)', () => {
  it('the jumper enters at its rise: the capture’s own load is the set the shooter already holds', () => {
    // the rig WITH the capture: the dip (2.45–2.6 of the 2.45–3.62 window) is skipped
    expect(riseStartOf(rig(['bball_mc_jumpshot']), 'jumpshot', 0)).toBeCloseTo(0.13, 2);
    expect(CAPTURE_RISE_START_01.bball_mc_jumpshot).toBeGreaterThan(0);
    expect(CAPTURE_RISE_START_01.bball_mc_jumpshot).toBeLessThan(CAPTURE_RELEASE_01.bball_mc_jumpshot!);
    // the rig with only the authored clip: unchanged — its load is its own
    expect(riseStartOf(rig(['jumpshot']), 'jumpshot', 0)).toBe(0);
  });

  it('the ball leaves the hand at the release frame measured FROM THE RISE, not from frame 0', () => {
    // capture: (0.75 − 0.13) · 0.9 s / 1.5 ≈ 0.372 s — before the fix it was 0.45 s, 0.08 s of replayed load
    expect(releaseDelaySec(0.75, 0.13, 0.9, 1.5)).toBeCloseTo(0.372, 3);
    expect(releaseDelaySec(0.45, 0, 0.9, 1.5)).toBeCloseTo(0.27, 3);   // authored fallback: as it was
    expect(releaseDelaySec(0.5, 0.5, 1, 1)).toBe(0);                   // degenerate: never negative
  });

  it('fire() plays the jumpshot once, from the rise, and logs the one-press sequence', () => {
    const fires = mode.slice(mode.indexOf('function fire('), mode.indexOf('function micShotCall'));
    expect(fires.match(/beats\?\.beat\('jumpshot'/g)).toHaveLength(1);           // one rise per press
    expect(fires).toMatch(/from01: rise01/);
    expect(fires).toMatch(/releaseIn = releaseDelaySec\(release01, rise01/);
    expect(fires).toMatch(/\[3PT-SHOT\] one press/);
    // the follow-through still chains exactly once, at the release frame
    const flight = mode.slice(mode.indexOf("S.phase === 'flight'"));
    expect(flight.match(/beats\?\.beat\(ftClip/g)).toHaveLength(1);
  });
});
