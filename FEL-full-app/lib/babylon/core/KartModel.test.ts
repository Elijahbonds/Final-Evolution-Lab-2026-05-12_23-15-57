// Is the drift the FAST way round, or just what happens when you lose it?
//
// That single question separates a kart game from a driving game, so it is what these tests ask. A kart that
// is quickest when driven tidily is not a kart game, however good the scenery.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  KART_STARTER, KART_NEUTRAL, DRIFT_SLIP, MAX_SLIP,
  spawnKart, stepKart, travelOf, kartNose, driftQuality, kartHitWall,
  type KartInput, type KartState,
} from './KartModel';

const K = KART_STARTER;
const input = (over: Partial<KartInput> = {}): KartInput => ({ ...KART_NEUTRAL, ...over });
const drive = (s: KartState, i: KartInput, sec: number, onTrack = true) => {
  for (let t = 0; t < sec * 60; t++) stepKart(s, i, 1 / 60, onTrack, K);
  return s;
};

describe('it drives', () => {
  it('throttle accelerates toward a top speed it does not exceed', () => {
    const s = drive(spawnKart(new Vector3(0, 0, 0)), input({ throttle: 1 }), 12);
    expect(s.speed).toBeGreaterThan(K.vMax * 0.8);
    expect(s.speed).toBeLessThanOrEqual(K.vMax);
  });

  it('the brake stops it, and it never goes backwards', () => {
    const s = drive(spawnKart(new Vector3(0, 0, 0)), input({ throttle: 1 }), 6);
    drive(s, input({ brake: 1 }), 4);
    expect(s.speed).toBe(0);
  });

  it('it travels where it points when it is not sliding', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1 }), 3);
    expect(s.slip).toBe(0);
    expect(s.pos.z).toBeGreaterThan(5);
    expect(Math.abs(s.pos.x)).toBeLessThan(0.001);
  });

  it('a standing kart cannot steer — the wheels have nothing to work against', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    stepKart(s, input({ steer: 1 }), 1 / 60, true, K);
    expect(s.heading).toBeCloseTo(0, 6);
  });
});

describe('RULE 1 — grip versus slip is a real angle, not a steering multiplier', () => {
  it('a hard corner at speed breaks the rear loose', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1 }), 6);
    drive(s, input({ throttle: 1, steer: 1 }), 1.2);
    expect(Math.abs(s.slip)).toBeGreaterThan(DRIFT_SLIP);
  });

  it('a gentle corner does NOT — tidy driving stays tidy', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 0.4 }), 3);
    drive(s, input({ throttle: 0.4, steer: 0.22 }), 1.5);
    expect(Math.abs(s.slip)).toBeLessThan(DRIFT_SLIP);
  });

  it('while sliding, the kart travels at an angle to its NOSE', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1 }), 6);
    drive(s, input({ throttle: 1, steer: 1, drift: true }), 0.8);
    const dot = Vector3.Dot(travelOf(s), kartNose(s));
    expect(Math.abs(s.slip)).toBeGreaterThan(0.1);
    expect(dot).toBeLessThan(0.995);          // genuinely not the same direction
  });

  it('the slide straightens out when you stop asking for the corner', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1 }), 6);
    drive(s, input({ throttle: 1, steer: 1, drift: true }), 1);
    const slid = Math.abs(s.slip);
    drive(s, input({ throttle: 1 }), 1.5);
    expect(Math.abs(s.slip)).toBeLessThan(slid * 0.5);
  });

  it('slip never exceeds its clamp — a kart spins, it does not drive backwards', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1 }), 6);
    drive(s, input({ throttle: 1, steer: 1, drift: true }), 8);
    expect(Math.abs(s.slip)).toBeLessThanOrEqual(MAX_SLIP + 1e-9);
  });

  it('the handbrake breaks traction ON PURPOSE, earlier than grip alone would', () => {
    const natural = spawnKart(new Vector3(0, 0, 0), 0);
    drive(natural, input({ throttle: 0.7 }), 4);
    drive(natural, input({ throttle: 0.7, steer: 0.5 }), 0.6);
    const handbrake = spawnKart(new Vector3(0, 0, 0), 0);
    drive(handbrake, input({ throttle: 0.7 }), 4);
    drive(handbrake, input({ throttle: 0.7, steer: 0.5, drift: true }), 0.6);
    expect(Math.abs(handbrake.slip)).toBeGreaterThan(Math.abs(natural.slip));
  });
});

describe('RULE 2 — THE DRIFT IS THE ACCELERATOR', () => {
  it('a clean drift banks boost', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1 }), 6);
    expect(s.boost).toBe(0);
    drive(s, input({ throttle: 1, steer: 1, drift: true }), 1.5);
    expect(s.drifting).toBe(true);
    expect(s.boost).toBeGreaterThan(0.2);
  });

  it('driving tidily banks NOTHING — this is why you drift', () => {
    const s = drive(spawnKart(new Vector3(0, 0, 0), 0), input({ throttle: 1 }), 10);
    expect(s.boost).toBe(0);
  });

  it('a STATIONARY handbrake spin prints no boost — the first thing anyone tries', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ steer: 1, drift: true, throttle: 0 }), 6);
    expect(s.boost).toBe(0);
  });

  it('firing the boost empties the bank and makes it faster than its own top speed', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1 }), 6);
    drive(s, input({ throttle: 1, steer: 1, drift: true }), 2);
    const banked = s.boost;
    expect(banked).toBeGreaterThan(0.3);
    drive(s, input({ throttle: 1, fire: true }), 0.5);
    expect(s.boost).toBe(0);
    expect(s.boosting).toBeGreaterThan(0);
    expect(s.speed).toBeGreaterThan(K.vMax);      // past the normal ceiling, which is the point
  });

  it('the boost runs out', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1 }), 6);
    drive(s, input({ throttle: 1, steer: 1, drift: true }), 2);
    drive(s, input({ throttle: 1, fire: true }), 4);
    expect(s.boosting).toBe(0);
    expect(s.speed).toBeLessThanOrEqual(K.vMax);
  });

  it('an empty bank cannot be fired', () => {
    const s = drive(spawnKart(new Vector3(0, 0, 0), 0), input({ throttle: 1 }), 5);
    drive(s, input({ throttle: 1, fire: true }), 0.5);
    expect(s.boosting).toBe(0);
  });

  it('A DRIFTED LAP BEATS A TIDY ONE — the whole genre in one assertion', () => {
    // A REAL LAP, timed. The first version of this compared displacement from the origin after a fixed number
    // of seconds, which is not a lap at all: a drifting kart ends up pointing somewhere else, so the measure
    // rewarded going straight. This drives an actual square circuit — steer until each 90 degree corner is
    // made, then run a 40 m straight — and reports the TIME. If drifting is not faster round that, the model
    // is wrong, which is the point of measuring it this way.
    const DT = 1 / 60, CAP = 90 * 60;
    const diff = (a: number, b: number) => {
      let d = a - b;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    const lapTime = (useDrift: boolean): number => {
      const s = spawnKart(new Vector3(0, 0, 0), 0);
      let frames = 0;
      drive(s, input({ throttle: 1 }), 2.5);         // the same rolling start for both
      frames += 2.5 * 60;
      for (let corner = 0; corner < 4; corner++) {
        const target = (corner + 1) * (Math.PI / 2);
        // turn in until the nose has come round
        while (frames < CAP && Math.abs(diff(target, s.heading)) > 0.12) {
          stepKart(s, input({ throttle: 1, steer: 1, drift: useDrift }), DT, true, K);
          frames++;
        }
        // then the straight, spending whatever the corner earned
        const from = s.pos.clone();
        while (frames < CAP && Vector3.Distance(s.pos, from) < 40) {
          stepKart(s, input({ throttle: 1, fire: useDrift }), DT, true, K);
          frames++;
        }
      }
      return frames / 60;
    };
    const drifted = lapTime(true), tidy = lapTime(false);
    console.log(`lap: drifted ${drifted.toFixed(2)}s vs tidy ${tidy.toFixed(2)}s`);
    expect(drifted).toBeLessThan(tidy);
  });

  it('drift quality rises with the angle, for a HUD ring or sparks', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    s.slip = DRIFT_SLIP;
    const low = driftQuality(s);
    s.slip = MAX_SLIP;
    expect(driftQuality(s)).toBeGreaterThan(low);
    expect(driftQuality(s)).toBeLessThanOrEqual(1);
  });
});

describe('RULE 3 — the racing line is worth finding', () => {
  it('off the track it is slower', () => {
    const on = drive(spawnKart(new Vector3(0, 0, 0)), input({ throttle: 1 }), 10, true);
    const off = drive(spawnKart(new Vector3(0, 0, 0)), input({ throttle: 1 }), 10, false);
    expect(off.speed).toBeLessThan(on.speed * 0.7);
  });

  it('and it loses grip there too, so a corner on the dirt slides more', () => {
    const mk = (onTrack: boolean) => {
      const s = spawnKart(new Vector3(0, 0, 0), 0);
      drive(s, input({ throttle: 1 }), 6, true);      // same entry speed for both
      // a GENTLE steer: at 0.6 both saturated at MAX_SLIP and the comparison was 0.946 vs 0.946
      drive(s, input({ throttle: 0.5, steer: 0.25 }), 0.6, onTrack);
      return Math.abs(s.slip);
    };
    expect(mk(false)).toBeGreaterThan(mk(true));
  });
});

describe('nothing produces a NaN, and a wall hurts', () => {
  it('thirty seconds of random input stays finite', () => {
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const s = spawnKart(new Vector3(0, 0, 0));
    for (let i = 0; i < 1800; i++) {
      stepKart(s, { steer: rnd() * 2 - 1, throttle: rnd(), brake: rnd() > 0.8 ? 1 : 0, drift: rnd() > 0.6, fire: rnd() > 0.9 }, 1 / 60, rnd() > 0.3, K);
    }
    for (const v of [s.pos.x, s.pos.z, s.speed, s.slip, s.heading, s.boost, s.boosting]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(Math.abs(s.slip)).toBeLessThanOrEqual(MAX_SLIP + 1e-9);
  });

  it('hitting a wall costs most of the speed and straightens the slide', () => {
    const s = spawnKart(new Vector3(0, 0, 0), 0);
    drive(s, input({ throttle: 1, steer: 1, drift: true }), 6);
    const before = s.speed;
    const lost = kartHitWall(s);
    expect(lost).toBeGreaterThan(0);
    expect(s.speed).toBeLessThan(before * 0.5);
    expect(s.slip).toBe(0);
  });
});
