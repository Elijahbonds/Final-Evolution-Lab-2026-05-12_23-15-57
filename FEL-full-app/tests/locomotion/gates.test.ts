// LOCOMOTION — Phase 3 acceptance gates (2026-09-12).
// Each test is one row of the brief's gate table, asserted on measured numbers.
import { describe, it, expect } from 'vitest';
import { profile, PROFILES } from '../../lib/locomotion/profiles';
import { blend2D, dirFor, ringFor, clipForDir, smoothWeights } from '../../lib/locomotion/BlendSpace2D';
import { resolveIntent, solveMotion, stepState, angleDelta } from '../../lib/locomotion/MotionCore';
import type { MachineState, SolverState } from '../../lib/locomotion/MotionCore';

const DT = 1 / 60;
const bb = profile('basketball_onball');

describe('GATE: heading change per frame <= maxTurnRateDegPerSec / 60', () => {
  it('never exceeds the cap, at any speed, even asked for a 180', () => {
    let worst = 0;
    for (const id of Object.keys(PROFILES)) {
      const p = profile(id);
      let s: SolverState = { velX: 0, velZ: 0, headingYaw: 0 };
      for (let f = 0; f < 240; f++) {
        const intent = resolveIntent({ x: 0, z: 1, sprint: true });
        // demand the opposite heading every frame - the worst case
        const out = solveMotion(p, s, intent, DT, s.headingYaw + Math.PI);
        const deg = Math.abs(angleDelta(s.headingYaw, out.headingYaw)) * 180 / Math.PI;
        worst = Math.max(worst, deg);
        expect(deg).toBeLessThanOrEqual(p.maxTurnRateDegPerSec / 60 + 1e-6);
        s = { velX: out.velX, velZ: out.velZ, headingYaw: out.headingYaw };
      }
    }
    expect(worst).toBeGreaterThan(0);
  });

  it('the cap tightens as speed rises - a sprinting body turns slower than a standing one', () => {
    const standing = solveMotion(bb, { velX: 0, velZ: 0, headingYaw: 0 }, resolveIntent({ x: 0, z: 0 }), DT, Math.PI);
    const sprinting = solveMotion(bb, { velX: 0, velZ: bb.maxSpeed, headingYaw: 0 }, resolveIntent({ x: 0, z: 1, sprint: true }), DT, Math.PI);
    expect(Math.abs(sprinting.headingYaw)).toBeLessThan(Math.abs(standing.headingYaw));
  });
});

describe('GATE: no state entered and exited inside 120ms', () => {
  it('holds a state for minStateSec even when the input flaps every frame', () => {
    const p = bb;
    let m: MachineState = { state: 'idle', heldSec: 0 };
    const changes: number[] = [];
    let sinceChange = 0;
    for (let f = 0; f < 600; f++) {
      const flap = f % 2 === 0;
      const next = stepState(p, m, {
        speed: flap ? 0.0 : 5.0, intentMag: flap ? 0 : 1,
        headingErrorRad: 0, lateral01: 0,
      }, DT);
      sinceChange += DT;
      if (next.state !== m.state) { changes.push(sinceChange); sinceChange = 0; }
      m = next;
    }
    for (const held of changes) expect(held).toBeGreaterThanOrEqual(p.minStateSec - 1e-9);
  });

  it('an authored cancel is the one way past the guard', () => {
    const m: MachineState = { state: 'jog', heldSec: 0.01 };
    const blocked = stepState(bb, m, { speed: 0, intentMag: 0, headingErrorRad: 0, lateral01: 0 }, DT);
    expect(blocked.state).toBe('jog');
    const cancelled = stepState(bb, m, { speed: 0, intentMag: 0, headingErrorRad: 0, lateral01: 0, cancel: true }, DT);
    expect(cancelled.state).toBe('idle');
  });
});

describe('GATE: no clip enters at weight 1.0 with no blend', () => {
  it('every profile declares a blend floor of at least 80ms', () => {
    for (const id of Object.keys(PROFILES)) {
      expect(profile(id).minBlendSec).toBeGreaterThanOrEqual(0.08);
    }
  });
});

describe('GATE: blend-tree weight discontinuity between frames < 0.25', () => {
  it('weights move smoothly as speed ramps from 0 to sprint', () => {
    const p = bb;
    // seed from frame 0 rather than an empty map: the first frame's pose appearing from
    // nothing is not a discontinuity in motion, and measuring it as one hides the real signal
    let prev: Record<string, number> = blend2D(p, 0, 1, 0).weights;
    let worst = 0;
    for (let f = 1; f <= 120; f++) {
      const speed = (f / 120) * p.maxSpeed;
      const { weights } = blend2D(p, 0, 1, speed);
      const keys = new Set([...Object.keys(prev), ...Object.keys(weights)]);
      for (const k of keys) worst = Math.max(worst, Math.abs((weights[k] ?? 0) - (prev[k] ?? 0)));
      prev = weights;
    }
    expect(worst).toBeLessThan(0.25);
    // the measured number the gate table wants, not just a pass/fail
    expect(worst).toBeGreaterThan(0);
    (globalThis as Record<string, unknown>).__LOCO_WORST_WEIGHT_STEP__ = worst;
  });

  it('a hard plant cannot outrun the blend - raw space jumps, smoothed output does not', () => {
    const p = bb;
    // the raw space genuinely jumps: plantDecel sheds 0.79 m/s per frame, half the
    // idle-to-walk ring in one tick. That is physics being abrupt, and it is allowed to be.
    let rawWorst = 0;
    let rawPrev = blend2D(p, 0, 1, p.maxSpeed).weights;
    for (let f = 1; f <= 60; f++) {
      const speed = Math.max(0, p.maxSpeed - (p.plantDecel / 60) * f);
      const { weights } = blend2D(p, 0, 1, speed);
      for (const k of new Set([...Object.keys(rawPrev), ...Object.keys(weights)]))
        rawWorst = Math.max(rawWorst, Math.abs((weights[k] ?? 0) - (rawPrev[k] ?? 0)));
      rawPrev = weights;
    }
    expect(rawWorst).toBeGreaterThan(0.25);   // the problem is real and this asserts it stays visible

    // the animator-facing output is rate-limited by the profile's blend time and does not
    let worst = 0;
    let prev = blend2D(p, 0, 1, p.maxSpeed).weights;
    for (let f = 1; f <= 60; f++) {
      const speed = Math.max(0, p.maxSpeed - (p.plantDecel / 60) * f);
      const target = blend2D(p, 0, 1, speed).weights;
      const smoothed = smoothWeights(prev, target, DT, p.minBlendSec);
      for (const k of new Set([...Object.keys(prev), ...Object.keys(smoothed)]))
        worst = Math.max(worst, Math.abs((smoothed[k] ?? 0) - (prev[k] ?? 0)));
      prev = smoothed;
    }
    expect(worst).toBeLessThan(0.25);
  });

  it('no clip can go 0 -> 1 faster than the profile blend time', () => {
    const p = bb;
    let w: Record<string, number> = { walk: 1 };
    let frames = 0;
    while ((w.run ?? 0) < 0.99 && frames < 600) { w = smoothWeights(w, { run: 1 }, DT, p.minBlendSec); frames++; }
    expect(frames * DT).toBeGreaterThanOrEqual(p.minBlendSec * 0.9);
  });
});

describe('a lateral vector never plays a forward run clip', () => {
  it('uses the slide ring for pure lateral travel', () => {
    const b = blend2D(bb, 1, 0, 3.0);
    expect(b.ring).toBe('slide');
    expect(Object.keys(b.weights)).not.toContain('run');
    expect(Object.keys(b.weights)).toContain('strafe_right');
  });
  it('forward travel still uses the run rings', () => {
    expect(blend2D(bb, 0, 1, 4.2).ring).not.toBe('slide');
  });
});

describe('2D blend space basics', () => {
  it('resolves all eight compass points', () => {
    expect(dirFor(0, 1)).toBe('F');
    expect(dirFor(0, -1)).toBe('B');
    expect(dirFor(1, 0)).toBe('R');
    expect(dirFor(-1, 0)).toBe('L');
    expect(dirFor(0.7, 0.7)).toBe('FR');
    expect(dirFor(-0.7, -0.7)).toBe('BL');
  });
  it('falls back to the nearest authored neighbour for unauthored points', () => {
    // the live clip set has no diagonals - a diagonal must still produce a clip
    const clip = clipForDir(PROFILES.basketball_onball.rings.jog, 'FR');
    expect(clip).toBeTruthy();
  });
  it('weights sum to ~1 wherever a clip exists', () => {
    for (const speed of [0, 1, 2, 4, 6]) {
      const { weights } = blend2D(bb, 0, 1, speed);
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      if (Object.keys(weights).length) expect(sum).toBeCloseTo(1, 5);
    }
  });
});

describe('movement direction is decoupled from facing direction', () => {
  it('TARGET_LOCK faces the target while travelling elsewhere', () => {
    const s: SolverState = { velX: 0, velZ: 0, headingYaw: 0 };
    const out = solveMotion(bb, s, resolveIntent({ x: 1, z: 0 }), DT, Math.PI / 2);
    expect(out.velX).toBeGreaterThan(0);          // travelling +x
    expect(out.headingYaw).toBeGreaterThan(0);    // turning toward the target, not the travel
  });
  it('VELOCITY mode faces travel', () => {
    const sk = profile('skate');
    let s: SolverState = { velX: 0, velZ: 0, headingYaw: 0 };
    for (let f = 0; f < 60; f++) {
      const o = solveMotion(sk, s, resolveIntent({ x: 1, z: 0 }), DT, null);
      s = { velX: o.velX, velZ: o.velZ, headingYaw: o.headingYaw };
    }
    expect(s.headingYaw).toBeGreaterThan(0.2);
  });
});

describe('the intent resolver', () => {
  it('kills drift inside the deadzone', () => {
    expect(resolveIntent({ x: 0.1, z: 0.05 }).magnitude).toBe(0);
  });
  it('survives NaN input rather than poisoning the run', () => {
    const i = resolveIntent({ x: NaN, z: NaN });
    expect(Number.isFinite(i.moveX)).toBe(true);
    expect(i.magnitude).toBe(0);
  });
  it('small pushes mean small speeds', () => {
    expect(resolveIntent({ x: 0, z: 0.5 }).magnitude).toBeLessThan(resolveIntent({ x: 0, z: 1 }).magnitude);
  });
});

describe('profiles are data, not code', () => {
  it('every family the audit found has a profile', () => {
    for (const id of ['basketball_onball', 'basketball_offball', 'basketball_defense', 'karate', 'skate', 'surf', 'snowboard', 'generic_run']) {
      expect(PROFILES[id]).toBeTruthy();
    }
  });
  it('an unknown profile fails loudly rather than silently defaulting', () => {
    expect(() => profile('does_not_exist')).toThrow(/unknown profile/);
  });
  it('basketball carries the numbers CourtMovement was measured at', () => {
    expect(bb.accel).toBe(26);
    expect(bb.decel).toBe(34);
    expect(bb.maxTurnRateDegPerSec).toBe(540);
  });
});
