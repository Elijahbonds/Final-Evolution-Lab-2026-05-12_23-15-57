// Does the body answer what it is DOING?
//
// The posture table already says what a drive looks like. These tests are about the part it cannot express: that
// a hard cut banks, that acceleration pitches you forward and braking sits you back, that a spent body rounds —
// and, just as importantly, that none of it touches a window a clip already owns.

import { describe, it, expect } from 'vitest';
import { HOOPS_POSTURE } from './HoopsPosture';
import {
  SIGNALS_IDLE, MAX_BANK_DEG, HEAD_LEVEL, BANK_FULL_ACCEL, LEAN_FULL_ACCEL,
  dynamicPose, isDynamic, DYNAMIC_WINDOWS, BodyMotion, type BodySignals,
} from './DynamicPosture';

const base = HOOPS_POSTURE.drive;
const sig = (over: Partial<BodySignals> = {}): BodySignals => ({ ...SIGNALS_IDLE, ...over });

describe('THE BANK — the thing hoops posture could not do at all', () => {
  it('every authored hoops stance is pitch-only, which is why this layer exists', () => {
    // if this ever fails, someone started authoring roll into the table and the two owners will fight
    for (const [name, p] of Object.entries(HOOPS_POSTURE)) {
      expect(p.spine1[2], `${name} spine1 roll`).toBe(0);
      expect(p.spine2[2], `${name} spine2 roll`).toBe(0);
    }
  });

  it('a hard cut rolls the chest INTO the turn', () => {
    const right = dynamicPose(base, sig({ lateralAccel: BANK_FULL_ACCEL }));
    expect(right.spine2[2]).toBeGreaterThan(3);
    const left = dynamicPose(base, sig({ lateralAccel: -BANK_FULL_ACCEL }));
    expect(left.spine2[2]).toBeLessThan(-3);
  });

  it('running straight does not bank at all', () => {
    const p = dynamicPose(base, sig({ speed01: 1 }));
    expect(p.spine1[2]).toBe(0);
    expect(p.spine2[2]).toBe(0);
  });

  it('the UPPER back carries more of the bank than the lower — that is what a spine does', () => {
    const p = dynamicPose(base, sig({ lateralAccel: BANK_FULL_ACCEL }));
    expect(Math.abs(p.spine2[2])).toBeGreaterThan(Math.abs(p.spine1[2]));
  });

  it('the HEAD counter-rolls to keep the eyes level', () => {
    const p = dynamicPose(base, sig({ lateralAccel: BANK_FULL_ACCEL }));
    const bank = p.spine1[2] + p.spine2[2];
    expect(Math.sign(p.head[2] - base.head[2])).toBe(-Math.sign(bank));
    // and it gives back most of it, not all — the head is not gimballed
    expect(Math.abs(p.head[2] - base.head[2])).toBeCloseTo(MAX_BANK_DEG * HEAD_LEVEL, 4);
  });

  it('the bank is CAPPED at what a spine can actually do, however violent the cut', () => {
    const p = dynamicPose(base, sig({ lateralAccel: 500 }));
    expect(Math.abs(p.spine1[2] + p.spine2[2])).toBeLessThanOrEqual(MAX_BANK_DEG + 1e-6);
  });

  it('a gentle corner barely leans — the same turn taken slowly should not throw the body over', () => {
    const soft = dynamicPose(base, sig({ lateralAccel: 1 }));
    const hard = dynamicPose(base, sig({ lateralAccel: BANK_FULL_ACCEL }));
    expect(Math.abs(soft.spine2[2])).toBeLessThan(Math.abs(hard.spine2[2]) * 0.25);
  });
});

describe('LEAN — acceleration and braking read on the body', () => {
  it('accelerating pitches the body forward', () => {
    expect(dynamicPose(base, sig({ longAccel: LEAN_FULL_ACCEL })).lean).toBeGreaterThan(base.lean);
  });

  it('braking sits it BACK', () => {
    expect(dynamicPose(base, sig({ longAccel: -LEAN_FULL_ACCEL })).lean).toBeLessThan(base.lean);
  });

  it('braking sits back harder than accelerating leans forward — stopping is the violent one', () => {
    const fwd = dynamicPose(base, sig({ longAccel: LEAN_FULL_ACCEL })).lean - base.lean;
    const back = base.lean - dynamicPose(base, sig({ longAccel: -LEAN_FULL_ACCEL })).lean;
    expect(back).toBeGreaterThan(fwd);
  });

  it('speed alone carries a body further forward than a standstill', () => {
    expect(dynamicPose(base, sig({ speed01: 1 })).lean)
      .toBeGreaterThan(dynamicPose(base, sig({ speed01: 0 })).lean);
  });

  it('THE SAME WINDOW NOW LOOKS DIFFERENT AT DIFFERENT SPEEDS — the whole point', () => {
    // a drive at a walk and a drive at a sprint were byte-identical before this
    const walk = dynamicPose(base, sig({ speed01: 0.2 }));
    const sprint = dynamicPose(base, sig({ speed01: 1, longAccel: 5 }));
    expect(walk.lean).not.toBeCloseTo(sprint.lean, 2);
  });
});

describe('EXERTION — a spent body carries itself differently', () => {
  it('it rounds forward and carries the shoulders up', () => {
    const spent = dynamicPose(base, sig({ exertion: 1 }));
    expect(spent.forward).toBeGreaterThan(base.forward);
    expect(spent.shrug).toBeGreaterThan(base.shrug);
  });

  it('and stops staring quite so hard at the rim, without going blind', () => {
    const spent = dynamicPose(base, sig({ exertion: 1 }));
    expect(spent.eyes).toBeLessThan(base.eyes);
    expect(spent.eyes).toBeGreaterThan(0);
  });

  it('a fresh body is untouched by it', () => {
    const fresh = dynamicPose(base, sig({ exertion: 0 }));
    expect(fresh.forward).toBe(base.forward);
    expect(fresh.eyes).toBe(base.eyes);
  });
});

describe('ONE OWNER PER BONE — an ALLOWLIST, so a new beat is never modulated by accident', () => {
  it('the flight windows are returned untouched', () => {
    for (const w of ['rise', 'hang', 'extend', 'jam', 'brace', 'land', 'celebrate'] as const) {
      expect(isDynamic(w)).toBe(false);
      const p = dynamicPose(HOOPS_POSTURE[w], sig({ lateralAccel: 9, longAccel: 8, speed01: 1, exertion: 1 }), w);
      expect(p).toBe(HOOPS_POSTURE[w]);        // the SAME object: nothing was modulated
    }
  });

  it('a stagger and a knockdown are the clip\'s too', () => {
    for (const w of ['stagger', 'floor'] as const) {
      expect(dynamicPose(HOOPS_POSTURE[w], sig({ lateralAccel: 9 }), w)).toBe(HOOPS_POSTURE[w]);
    }
  });

  it('SHOT BEATS are choreography, paced to a meter — the layer stays out of them', () => {
    for (const w of ['gather', 'load', 'release', 'follow', 'fade', 'hook', 'pump'] as const) {
      expect(isDynamic(w), `${w} must not be dynamic`).toBe(false);
      expect(dynamicPose(HOOPS_POSTURE[w], sig({ lateralAccel: 9, longAccel: 8 }), w)).toBe(HOOPS_POSTURE[w]);
    }
  });

  it('an UNKNOWN window is refused rather than modulated — that is what the allowlist buys', () => {
    // a denylist would have modulated this by default, which is how a layer ends up fighting a new clip
    expect(isDynamic('some_beat_added_next_year')).toBe(false);
    expect(dynamicPose(HOOPS_POSTURE.drive, sig({ lateralAccel: 9 }), 'some_beat_added_next_year'))
      .toBe(HOOPS_POSTURE.drive);
  });

  it('locomotion IS modulated, including the dunk runway', () => {
    for (const w of ['run', 'dribble', 'drive', 'defend', 'slide', 'stance']) {
      expect(isDynamic(w), `${w} should be dynamic`).toBe(true);
    }
    expect(DYNAMIC_WINDOWS.size).toBeGreaterThan(5);
  });

  it('airborne stands down even in a grounded window', () => {
    expect(dynamicPose(base, sig({ airborne: true, lateralAccel: 9 }), 'drive')).toBe(base);
  });

  it('it never MUTATES the shared table — every body on the floor reads the same poses', () => {
    const before = JSON.stringify(HOOPS_POSTURE.drive);
    dynamicPose(HOOPS_POSTURE.drive, sig({ lateralAccel: 9, longAccel: 8, exertion: 1 }));
    expect(JSON.stringify(HOOPS_POSTURE.drive)).toBe(before);
  });
});

describe('the motion tracker turns a velocity stream into those signals', () => {
  /** Feed a constant velocity for a while so the filter settles. */
  const settle = (m: BodyMotion, vx: number, vz: number, heading: number, sec = 1) => {
    for (let i = 0; i < sec * 60; i++) m.update(vx, vz, heading, 1 / 60);
  };

  it('steady speed reads as NO acceleration', () => {
    const m = new BodyMotion();
    settle(m, 0, 6, 0);
    const s = m.signals(1, 0, false);
    expect(Math.abs(s.longAccel)).toBeLessThan(0.2);
    expect(Math.abs(s.lateralAccel)).toBeLessThan(0.2);
  });

  it('speeding up in the facing direction reads as FORWARD acceleration, not lateral', () => {
    const m = new BodyMotion();
    settle(m, 0, 2, 0, 0.3);
    for (let i = 0; i < 30; i++) m.update(0, 2 + i * 0.25, 0, 1 / 60);   // heading 0 is +z
    const s = m.signals(1, 0, false);
    expect(s.longAccel).toBeGreaterThan(1);
    expect(Math.abs(s.lateralAccel)).toBeLessThan(1);
  });

  it('turning reads as LATERAL acceleration, resolved in the body frame', () => {
    const m = new BodyMotion();
    settle(m, 0, 6, 0, 0.3);
    for (let i = 0; i < 30; i++) m.update(i * 0.3, 6, 0, 1 / 60);        // drifting to +x while facing +z
    const s = m.signals(1, 0, false);
    expect(s.lateralAccel).toBeGreaterThan(1);
  });

  it('the SAME world acceleration reads differently depending on which way the body faces', () => {
    // this is why the tracker needs the heading: a world-space number says nothing about braking vs turning
    const a = new BodyMotion(); settle(a, 0, 4, 0, 0.3);
    for (let i = 0; i < 30; i++) a.update(0, 4 + i * 0.3, 0, 1 / 60);
    const b = new BodyMotion(); settle(b, 0, 4, Math.PI / 2, 0.3);
    for (let i = 0; i < 30; i++) b.update(0, 4 + i * 0.3, Math.PI / 2, 1 / 60);
    expect(a.signals(1, 0, false).longAccel).toBeGreaterThan(1);
    expect(Math.abs(b.signals(1, 0, false).longAccel)).toBeLessThan(1);
  });

  it('it SMOOTHS — one jittery frame is attenuated, not passed through', () => {
    const m = new BodyMotion();
    settle(m, 0, 6, 0);
    const jump = 40;                             // one absurd frame: 40 m/s of sideways velocity appears
    m.update(jump, 6, 0, 1 / 60);
    const rawSpike = jump / (1 / 60);            // what an unfiltered differentiator would have reported
    const got = Math.abs(m.signals(1, 0, false).lateralAccel);
    // the honest claim is ATTENUATION against the raw spike, not a number I picked: the filter passes ~14%
    expect(got).toBeLessThan(rawSpike * 0.25);
    // and what the player SEES is clamped anyway, which is the guarantee that actually matters
    const p = dynamicPose(base, m.signals(1, 0, false));
    expect(Math.abs(p.spine1[2] + p.spine2[2])).toBeLessThanOrEqual(MAX_BANK_DEG + 1e-6);
  });

  it('and it RECOVERS from the spike rather than holding the chest over', () => {
    const m = new BodyMotion();
    settle(m, 0, 6, 0);
    m.update(40, 6, 0, 1 / 60);
    settle(m, 0, 6, 0, 0.8);                     // back to steady flight
    expect(Math.abs(m.signals(1, 0, false).lateralAccel)).toBeLessThan(1);
  });

  it('a TELEPORT does not read as an enormous acceleration', () => {
    // resetPositions / a check-up moves a body metres in one frame
    const m = new BodyMotion();
    settle(m, 0, 6, 0);
    m.reset();
    m.update(0, 0, 0, 1 / 60);
    const s = m.signals(0, 0, false);
    expect(s.longAccel).toBe(0);
    expect(s.lateralAccel).toBe(0);
  });

  it('a zero or negative dt is ignored rather than dividing by it', () => {
    const m = new BodyMotion();
    settle(m, 0, 6, 0);
    m.update(99, 99, 0, 0);
    const s = m.signals(1, 0, false);
    expect(Number.isFinite(s.longAccel)).toBe(true);
    expect(Number.isFinite(s.lateralAccel)).toBe(true);
  });

  it('two minutes of random motion never produces a NaN or an uncapped bank', () => {
    let seed = 5;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const m = new BodyMotion();
    for (let i = 0; i < 7200; i++) {
      m.update((rnd() - 0.5) * 14, (rnd() - 0.5) * 14, rnd() * Math.PI * 2, 1 / 60);
      const p = dynamicPose(base, m.signals(rnd(), rnd(), false));
      expect(Number.isFinite(p.lean)).toBe(true);
      expect(Math.abs(p.spine1[2] + p.spine2[2])).toBeLessThanOrEqual(MAX_BANK_DEG + 1e-6);
    }
  });
});
