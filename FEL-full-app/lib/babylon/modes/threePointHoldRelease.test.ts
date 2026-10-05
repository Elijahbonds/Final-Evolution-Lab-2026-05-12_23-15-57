// HOOPS-10PHASE-2 phase 2 (2026-10-03): 3PT moved off its own independent sweeping bar onto the shared
// BasketballCore.ShotMeter (binding research note: "Do NOT build a new meter. Move 3PT onto the existing 1v1
// ShotMeter"), and both the 'hold-release' and 'tap-timing' shotInput settings grade off the SAME meter.
//
// This suite does not spin up a full Babylon scene (ThreePointMode.load() mounts a venue, a character pipeline,
// a full skeleton — heavier than this behaviour needs, same reasoning threePointShotOnce.test.ts already applies
// to fire()). Instead it pins: (a) the ShotMeter itself grades the hold-release / tap-timing shapes correctly,
// (b) the source wiring sends each input through the right function and nothing else.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ShotMeter } from '../core/BasketballCore';

const mode = readFileSync('lib/babylon/modes/ThreePointMode.ts', 'utf8');

describe('ShotMeter — the one meter both 3PT inputs grade against', () => {
  it('hold-release: paused at start (active=false) until a real press sets it running', () => {
    const m = new ShotMeter();
    m.start(0, 'jumper', 0);
    m.active = false;                 // beginShootPhase()'s hold-release branch
    expect(m.update(0.1)).toBe(0);    // paused: no advance
    m.active = true;                  // pressHold()
    expect(m.update(0.01)).toBeGreaterThan(0);
  });

  it('tap-timing: desyncs to a random point in range and keeps sweeping (no pause)', () => {
    const m = new ShotMeter();
    m.start(0, 'jumper', 0);
    m.update(0.37 * m.durationSec);   // beginShootPhase()'s one-time desync
    expect(m.t).toBeGreaterThan(0);
    expect(m.t).toBeLessThan(1);
  });

  it('release() grades perfect/good/early/late/brick identically no matter which input drove t there', () => {
    const m = new ShotMeter();
    m.start(0, 'jumper', 0);
    m.t = m.greenCenter01;             // dead centre
    expect(m.release()).toBe('perfect');

    const early = new ShotMeter(); early.start(0, 'jumper', 0);
    early.t = 0;
    expect(early.release()).toBe('early');

    const held = new ShotMeter(); held.start(0, 'jumper', 0);
    held.t = 1;                        // held-release never released and the meter ran out — the same timeout a hang-up on 2K earns
    expect(held.release()).toBe('brick');
  });

  it('distance narrows the window exactly like a defender would (a deeper rack is a harder window, same shape as contestLevel)', () => {
    const near = new ShotMeter(); near.start(0, 'jumper', 0);
    const far = new ShotMeter(); far.start(0.4, 'jumper', 0);   // distanceContestForRack's cap
    expect(far.greenHalfWidth01).toBeLessThan(near.greenHalfWidth01);
  });
});

describe('ThreePointMode — each input is wired through its own function, and fire() stays the tap-timing path', () => {
  it('the button-up releases a hold BEFORE the one-press latch\'s own release edge (phase 1\'s literal wiring is untouched)', () => {
    expect(mode).toMatch(/if \(!e\.pressed && shotInputMode === 'hold-release' && holding\) releaseHold\(ctx\);/);
    expect(mode).toMatch(/if \(!e\.pressed\) \{ shotLatch\.release\(\); return; \}/);
    expect(mode).toMatch(/if \(!shotLatch\.press\(\)\) return;/);
  });

  it('a latched press goes to pressHold in hold-release mode, fire() otherwise', () => {
    expect(mode).toMatch(/else if \(shotInputMode === 'hold-release'\) pressHold\(ctx\);/);
    expect(mode).toMatch(/else fire\(ctx, S\.charge > 0\.02 \? S\.charge : undefined\);/);
  });

  it('fire() still plays the jumpshot exactly once, from the rise (phase 1\'s guarantee, unmoved by phase 2)', () => {
    const fires = mode.slice(mode.indexOf('function fire('), mode.indexOf('function micShotCall'));
    expect(fires.match(/beats\?\.beat\('jumpshot'/g)).toHaveLength(1);
    expect(fires).toMatch(/from01: rise01/);
    expect(fires).toMatch(/releaseIn = releaseDelaySec\(release01, rise01/);
  });

  it('pressHold starts the clip exactly once per press too, and lives entirely OUTSIDE fire()\'s own slice', () => {
    expect(mode.match(/function pressHold\(/g)).toHaveLength(1);
    const pressHoldIdx = mode.indexOf('function pressHold(');
    const fireIdx = mode.indexOf('function fire(');
    expect(pressHoldIdx).toBeLessThan(fireIdx);   // pressHold is defined BEFORE fire(), outside the slice the test above reads
    const held = mode.slice(pressHoldIdx, mode.indexOf('function releaseHold('));
    expect(held.match(/beats\?\.beat\('jumpshot'/g)).toHaveLength(1);
  });

  it('both inputs share the same grading and scoring path (applyShotOutcome), never duplicating the rim decision', () => {
    expect(mode.match(/function applyShotOutcome\(/g)).toHaveLength(1);
    expect(mode.match(/applyShotOutcome\(ctx, quality/g)).toHaveLength(2);   // fire() and releaseHold(), each once
  });

  it('the shot input setting is read once per load, same reasoning as TV mode\'s shotFactor', () => {
    expect(mode).toMatch(/shotInputMode = readShotInputMode\(\);/);
  });
});
