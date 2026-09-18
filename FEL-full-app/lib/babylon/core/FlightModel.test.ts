// Does it fly like a plane, and does flying it WELL mean something?
//
// The three rules the model exists to make true: speed comes from the throttle AND from diving; lift comes
// from speed, so it can stall; a turn costs speed and is sharper banked than yawed. If all three hold, energy
// management is the skill — which is what makes an arcade flyer worth playing.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  AERO_TRAINER, NEUTRAL_INPUT, spawnFlight, stepFlight, noseOf, authority, levelOut, clampFlight,
  type FlightInput, type FlightState,
} from './FlightModel';

const F = AERO_TRAINER;
const input = (over: Partial<FlightInput> = {}): FlightInput => ({ ...NEUTRAL_INPUT, ...over });
/** Fly for `sec` with one input, 60 Hz. */
const fly = (s: FlightState, i: FlightInput, sec: number) => {
  for (let t = 0; t < sec * 60; t++) stepFlight(s, i, 1 / 60, F);
  return s;
};

describe('it flies', () => {
  it('full throttle and level settles near cruise, not at zero and not forever faster', () => {
    const s = fly(spawnFlight(new Vector3(0, 100, 0)), input({ throttle: 1 }), 20);
    expect(s.speed).toBeGreaterThan(F.cruise * 0.7);
    expect(s.speed).toBeLessThan(F.vMax);
  });

  it('it travels along the nose', () => {
    const s = spawnFlight(new Vector3(0, 100, 0), 0);
    fly(s, input(), 1);
    expect(s.pos.z).toBeGreaterThan(10);        // heading 0 is +z
    expect(Math.abs(s.pos.x)).toBeLessThan(1);
  });

  it('speed never goes negative and never exceeds the airframe limit', () => {
    const dive = fly(spawnFlight(new Vector3(0, 4000, 0)), input({ pitch: -1, throttle: 1, boost: true }), 60);
    expect(dive.speed).toBeLessThanOrEqual(F.vMax);
    const idle = fly(spawnFlight(new Vector3(0, 100, 0)), input({ throttle: 0 }), 30);
    expect(idle.speed).toBeGreaterThanOrEqual(0);
  });
});

describe('RULE 1 — a dive is a decision: diving buys speed, climbing spends it', () => {
  it('nose down accelerates past what level flight reaches on the same throttle', () => {
    const level = fly(spawnFlight(new Vector3(0, 2000, 0)), input({ throttle: 0.7 }), 8);
    const dive = fly(spawnFlight(new Vector3(0, 2000, 0)), input({ throttle: 0.7, pitch: -1 }), 8);
    expect(dive.speed).toBeGreaterThan(level.speed);
  });

  it('climbing costs speed', () => {
    const level = fly(spawnFlight(new Vector3(0, 200, 0)), input({ throttle: 0.7 }), 6);
    const climb = fly(spawnFlight(new Vector3(0, 200, 0)), input({ throttle: 0.7, pitch: 1 }), 6);
    expect(climb.speed).toBeLessThan(level.speed);
  });

  it('a dive with the throttle SHUT still gains speed — from below its glide speed', () => {
    // Terminal velocity on a dead engine is where gravity balances drag: sqrt(9.81 / 0.0054) = 42.6 m/s.
    // A dive that STARTS above that correctly slows down, so this has to begin slow or it tests nothing.
    const s = spawnFlight(new Vector3(0, 3000, 0));
    s.speed = 26;
    fly(s, input({ throttle: 0, pitch: -1 }), 4);
    expect(s.speed).toBeGreaterThan(26);
  });

  it('and a dive trades height for it', () => {
    const s = spawnFlight(new Vector3(0, 3000, 0));
    fly(s, input({ throttle: 0.7, pitch: -1 }), 4);
    expect(s.pos.y).toBeLessThan(3000);
  });
});

describe('RULE 2 — lift comes from speed, so it can STALL and it can recover', () => {
  /** Fly until the wing stops flying, or give up. Returns the state the moment it stalled. */
  const flyToStall = (i: FlightInput, maxSec = 20) => {
    const s = spawnFlight(new Vector3(0, 2500, 0));
    for (let t = 0; t < maxSec * 60; t++) { stepFlight(s, i, 1 / 60, F); if (s.stalled) return { s, stalled: true }; }
    return { s, stalled: false };
  };

  it('throttle shut and nose up DOES stall', () => {
    // Asserted as "it reaches a stall", not "it is stalled at t=12": holding the nose up on a dead engine
    // physically produces a stall CYCLE — stall, nose drops, speed returns, climb, stall again — so sampling
    // one instant twelve seconds in is a coin flip on where in the cycle you happen to look.
    const { stalled, s } = flyToStall(input({ throttle: 0, pitch: 1 }));
    expect(stalled).toBe(true);
    expect(s.speed).toBeLessThan(F.vStall);
  });

  it('a stalled aircraft cannot hold its nose up — it drops on its own', () => {
    const { s, stalled } = flyToStall(input({ throttle: 0, pitch: 1 }));
    expect(stalled).toBe(true);
    const pitchAtStall = s.pitch;
    // still hauling back on the stick, and the nose still falls
    for (let i = 0; i < 20; i++) stepFlight(s, input({ throttle: 0, pitch: 1 }), 1 / 60, F);
    expect(s.pitch).toBeLessThan(pitchAtStall);
  });

  it('a stall LOSES height', () => {
    // Measured over three seconds, not one: at the INSTANT of the stall the nose is still up, so the aircraft
    // briefly keeps climbing along it (it gained 8 m in the first second) before the nose falls. The claim is
    // that a stall costs height, and it does — just not on the first frame of it.
    const { s } = flyToStall(input({ throttle: 0, pitch: 1 }));
    const y = s.pos.y;
    for (let i = 0; i < 180; i++) stepFlight(s, input({ throttle: 0, pitch: 0 }), 1 / 60, F);
    expect(s.pos.y).toBeLessThan(y);
  });

  it('it is RECOVERABLE: point down, build speed, fly again', () => {
    const { s, stalled } = flyToStall(input({ throttle: 0, pitch: 1 }));
    expect(stalled).toBe(true);
    fly(s, input({ throttle: 1, pitch: -1 }), 6);
    expect(s.stalled).toBe(false);
    expect(s.speed).toBeGreaterThan(F.vStall * 1.3);   // clear of the hysteresis, genuinely flying again
  });

  it('the stall LATCHES — it does not flicker off the instant speed nudges back', () => {
    const { s, stalled } = flyToStall(input({ throttle: 0, pitch: 1 }));
    expect(stalled).toBe(true);
    // nudge the speed to just above the stall speed but below the recovery threshold
    s.speed = F.vStall * 1.05;
    stepFlight(s, input({ throttle: 0.3, pitch: 0 }), 1 / 60, F);
    expect(s.stalled).toBe(true);
  });

  it('a slow aircraft has almost no pitch authority, and a fast one has full', () => {
    const slow = { ...spawnFlight(new Vector3(0, 100, 0)), speed: 5 };
    const fast = { ...spawnFlight(new Vector3(0, 100, 0)), speed: F.cruise };
    expect(authority(slow, F)).toBeLessThan(0.2);
    expect(authority(fast, F)).toBeCloseTo(1, 2);
  });

  it('ROLL still works when stalled — the stall must be flyable, not a death sentence', () => {
    const { s } = flyToStall(input({ throttle: 0, pitch: 1 }));
    const before = s.roll;
    stepFlight(s, input({ throttle: 0, roll: 1 }), 1 / 60, F);
    expect(s.roll).toBeGreaterThan(before);
  });
});

describe('RULE 3 — you turn by BANKING, and a turn costs speed', () => {
  it('rolling then holding turns the heading', () => {
    const s = spawnFlight(new Vector3(0, 500, 0), 0);
    fly(s, input({ roll: 1 }), 0.5);
    const h0 = s.heading;
    fly(s, input({ roll: 0 }), 1);
    expect(Math.abs(s.heading - h0)).toBeGreaterThan(0.2);
  });

  it('a BANKED turn is much sharper than the rudder alone', () => {
    const banked = spawnFlight(new Vector3(0, 500, 0), 0);
    fly(banked, input({ roll: 1 }), 1.5);
    const flat = spawnFlight(new Vector3(0, 500, 0), 0);
    fly(flat, input({ yaw: 1 }), 1.5);
    expect(Math.abs(banked.heading)).toBeGreaterThan(Math.abs(flat.heading) * 2);
  });

  it('turning bleeds speed — energy is the currency', () => {
    const straight = fly(spawnFlight(new Vector3(0, 500, 0)), input(), 6);
    const turning = fly(spawnFlight(new Vector3(0, 500, 0)), input({ roll: 1 }), 6);
    expect(turning.speed).toBeLessThan(straight.speed);
  });

  it('heading stays wrapped, so a long turn never runs off the number line', () => {
    const s = spawnFlight(new Vector3(0, 500, 0), 0);
    fly(s, input({ roll: 1, throttle: 1 }), 40);
    expect(s.heading).toBeGreaterThanOrEqual(-Math.PI - 1e-6);
    expect(s.heading).toBeLessThanOrEqual(Math.PI + 1e-6);
  });

  it('the aircraft levels out when the stick is released', () => {
    const s = spawnFlight(new Vector3(0, 500, 0));
    fly(s, input({ roll: 1 }), 0.6);
    const banked = Math.abs(s.roll);
    for (let i = 0; i < 120; i++) levelOut(s, 1 / 60);
    expect(Math.abs(s.roll)).toBeLessThan(banked * 0.4);
  });
});

describe('nothing produces a NaN, at any input, ever', () => {
  it('forty seconds of random stick stays finite', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const s = spawnFlight(new Vector3(0, 800, 0));
    for (let i = 0; i < 2400; i++) {
      stepFlight(s, { pitch: rnd() * 2 - 1, roll: rnd() * 2 - 1, yaw: rnd() * 2 - 1, throttle: rnd(), boost: rnd() > 0.5 }, 1 / 60, F);
      clampFlight(s, 2, 3000, 1200);
    }
    for (const v of [s.pos.x, s.pos.y, s.pos.z, s.speed, s.pitch, s.roll, s.heading]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('a huge dt does not teleport it out of the world', () => {
    const s = spawnFlight(new Vector3(0, 800, 0));
    stepFlight(s, input({ throttle: 1, pitch: -1 }), 1, F);
    expect(Number.isFinite(s.pos.y)).toBe(true);
    expect(s.speed).toBeLessThanOrEqual(F.vMax);
  });

  it('the nose vector is always unit length', () => {
    const s = spawnFlight(new Vector3(0, 500, 0));
    for (const p of [-1.5, -0.5, 0, 0.5, 1.5]) { s.pitch = p; expect(noseOf(s).length()).toBeCloseTo(1, 6); }
  });
});

describe('the world has edges', () => {
  it('the floor stops it and reads as a crash', () => {
    const s = spawnFlight(new Vector3(0, 1, 0));
    s.pitch = -1;
    expect(clampFlight(s, 2, 3000, 500)).toBe(true);
    expect(s.pos.y).toBe(2);
  });

  it('the ceiling stops it without reading as a crash', () => {
    const s = spawnFlight(new Vector3(0, 4000, 0));
    s.pitch = 1;
    expect(clampFlight(s, 2, 3000, 500)).toBe(false);
    expect(s.pos.y).toBe(3000);
  });

  it('the walls hold it inside the map', () => {
    const s = spawnFlight(new Vector3(900, 500, -900));
    expect(clampFlight(s, 2, 3000, 500)).toBe(true);
    expect(Math.abs(s.pos.x)).toBe(500);
    expect(Math.abs(s.pos.z)).toBe(500);
  });
});
