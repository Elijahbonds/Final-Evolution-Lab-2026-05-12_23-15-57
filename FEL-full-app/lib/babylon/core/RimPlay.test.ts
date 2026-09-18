// Does the ball's time on the iron SHOW how the shot went — and never contradict the scoreboard?
//
// The make / miss is decided at the release; the rim play only dramatises it. So the tests ask the questions a
// shooter would: a green swishes clean, a good-window make touches iron but still drops THROUGH the ring, an
// in-and-out leaves toward the shooter, a roll-off travels round the ring first, a way-long miss meets the glass
// before the iron, an airball never touches anything — and the flight always arrives where the play begins.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { planRimPlay, forcedMakeProfile, maybeAirball, sampleRimPlay, rimPlaySuffix, AIRBALL_QUALITY } from './RimPlay';
import { forcedMissProfile, RIM_RADIUS, BALL_RADIUS, SWISH_WINDOW, AIRBALL_DISTANCE } from './RimPhysics';
import { ShotArc } from './BasketballCore';

const RIM = new Vector3(0, 3.05, -0.6);
const TO_SHOOTER = new Vector3(0, 0, 1);   // the shooter stands at +z
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
const radialOf = (p: Vector3) => Math.hypot(p.x - RIM.x, p.z - RIM.z);

describe('the make on the iron', () => {
  it('a green (dead centre) is a swish: no dwell, no touch, the flight arrives at the ring centre', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: 0.01, lateralError: 0.0, descentSpeed: 5 }, true, seq(0.5));
    expect(play.kind).toBe('swish');
    expect(play.touches).toHaveLength(0);
    expect(play.duration).toBe(0);
    expect(play.arrive.equalsWithEpsilon(RIM, 1e-6)).toBe(true);
    expect(rimPlaySuffix(play)).toBe('');
  });

  it('a make that touches iron still ends THROUGH the ring: inside the cylinder and under the lip', () => {
    for (const [d, l, r] of [[0.09, 0.0, 0.2], [0.09, 0.0, 0.9], [-0.09, 0.0, 0.2], [-0.09, 0.0, 0.9], [0.0, 0.1, 0.2], [0.0, -0.1, 0.9]]) {
      const play = planRimPlay(RIM, TO_SHOOTER, { depthError: d, lateralError: l, descentSpeed: 6 }, true, seq(r));
      expect(play.made).toBe(true);
      expect(play.kind).not.toBe('swish');
      expect(play.touches.length).toBeGreaterThan(0);
      const last = play.keys[play.keys.length - 1].p;
      expect(radialOf(last)).toBeLessThan(RIM_RADIUS - BALL_RADIUS + 1e-6);
      expect(last.y).toBeLessThan(RIM.y);
      // and never leaves the ring while it decides
      for (const k of play.keys) expect(radialOf(k.p)).toBeLessThanOrEqual(RIM_RADIUS + BALL_RADIUS);
      expect(play.label.length).toBeGreaterThan(0);
    }
  });

  it('a long make rattles or comes in off the back iron; a lateral one rolls', () => {
    expect(['rattle_in', 'back_iron_in']).toContain(planRimPlay(RIM, TO_SHOOTER, { depthError: 0.09, lateralError: 0.01, descentSpeed: 6 }, true, seq(0.1)).kind);
    expect(['rattle_in', 'back_iron_in']).toContain(planRimPlay(RIM, TO_SHOOTER, { depthError: 0.09, lateralError: 0.01, descentSpeed: 6 }, true, seq(0.9)).kind);
    expect(['roll_around_in', 'roll_in']).toContain(planRimPlay(RIM, TO_SHOOTER, { depthError: 0.01, lateralError: 0.09, descentSpeed: 6 }, true, seq(0.1)).kind);
  });

  it('forcedMakeProfile keeps every make inside the soft window, and a perfect one inside the swish', () => {
    for (let i = 0; i < 40; i++) {
      const r = seq(i / 40, 1 - i / 40);
      const p = forcedMakeProfile(0.2, { short: 0.8, lateral: 0.7 }, r);
      expect(Math.hypot(p.depthError, p.lateralError)).toBeLessThanOrEqual(SWISH_WINDOW * 1.15 + 1e-9);
    }
    const perfect = forcedMakeProfile(0.95, {}, seq(0.9));
    expect(Math.hypot(perfect.depthError, perfect.lateralError)).toBeLessThan(SWISH_WINDOW * 0.55);
  });
});

describe('the miss on the iron', () => {
  it('an in-and-out goes IN (arrives inside the ring) and leaves toward the shooter, touching twice', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: -0.14, lateralError: 0.02, descentSpeed: 5 }, false, seq(0.5, 0.1));
    expect(play.kind).toBe('in_and_out');
    expect(play.made).toBe(false);
    expect(radialOf(play.arrive)).toBeLessThan(RIM_RADIUS - BALL_RADIUS);
    expect(play.exitVel.z).toBeGreaterThan(0.5);
    expect(play.exitVel.y).toBeGreaterThan(0);
    expect(play.touches).toHaveLength(2);
    expect(play.keys[play.keys.length - 1].p.z).toBeGreaterThan(RIM.z + RIM_RADIUS);   // out over the front lip
  });

  it('a roll-off travels round the ring before it leaves — and leaves outward', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: 0.02, lateralError: 0.16, descentSpeed: 5 }, false, seq(0.5, 0.1));
    expect(play.kind).toBe('roll_off');
    expect(play.keys.length).toBeGreaterThanOrEqual(5);
    // the first key is on the right side, the last well round the ring
    const first = play.keys[0].p, last = play.keys[play.keys.length - 1].p;
    const a0 = Math.atan2(first.x - RIM.x, first.z - RIM.z), a1 = Math.atan2(last.x - RIM.x, last.z - RIM.z);
    let sweep = Math.abs(a1 - a0); if (sweep > Math.PI) sweep = 2 * Math.PI - sweep;
    expect(sweep).toBeGreaterThan(Math.PI * 0.6);
    const out = new Vector3(last.x - RIM.x, 0, last.z - RIM.z).normalize();
    expect(Vector3.Dot(new Vector3(play.exitVel.x, 0, play.exitVel.z).normalize(), out)).toBeGreaterThan(0.2);
    expect(play.duration).toBeGreaterThan(0.4);
  });

  it('a way-long miss meets the GLASS first, then the iron, and comes back toward the shooter', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: 0.4, lateralError: 0.05, descentSpeed: 7 }, false, seq(0.1));
    expect(play.kind).toBe('glass_out');
    expect(play.touches[0].on).toBe('glass');
    expect(play.touches[1].on).toBe('iron');
    expect(play.arrive.z).toBeLessThan(RIM.z - RIM_RADIUS);   // behind the ring
    expect(play.exitVel.z).toBeGreaterThan(0);
  });

  it('long and flat kicks HIGH off the back iron, no dwell', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: 0.2, lateralError: 0.0, descentSpeed: 8 }, false, seq(0.1));
    expect(play.kind).toBe('back_iron_high');
    expect(play.duration).toBe(0);
    expect(play.exitVel.y).toBeGreaterThan(5);
    expect(play.exitVel.z).toBeLessThan(0);   // runs away
  });

  it('a plain short miss arrives ON the front lip and comes back at the shooter — the flight ends where it hits', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: -0.3, lateralError: 0.0, descentSpeed: 6 }, false, seq(0.9));
    expect(play.kind).toBe('front_iron');
    expect(play.arrive.z).toBeCloseTo(RIM.z + RIM_RADIUS, 3);
    expect(play.exitVel.z).toBeGreaterThan(0.5);
    expect(play.touches).toHaveLength(1);
  });

  it('an airball never touches anything and the flight ends SHORT of the ring, still falling', () => {
    const p = maybeAirball(forcedMissProfile(0.1, { short: 0.5 }, seq(0.5)), 0.1, seq(0.0));
    expect(Math.hypot(p.depthError, p.lateralError)).toBeGreaterThanOrEqual(AIRBALL_DISTANCE);
    const play = planRimPlay(RIM, TO_SHOOTER, p, false, seq(0.5));
    expect(play.kind).toBe('airball');
    expect(play.touches).toHaveLength(0);
    expect(play.arrive.z).toBeGreaterThan(RIM.z + RIM_RADIUS + BALL_RADIUS);
    expect(play.exitVel.y).toBeLessThan(0);
    // and a decent shot never airballs
    const fine = maybeAirball(forcedMissProfile(AIRBALL_QUALITY + 0.1, {}, seq(0.5)), AIRBALL_QUALITY + 0.1, seq(0.0));
    expect(Math.hypot(fine.depthError, fine.lateralError)).toBeLessThan(AIRBALL_DISTANCE);
  });

  it('mirrors with the shooter: from the other side of the floor, short still comes back to THEM', () => {
    const play = planRimPlay(RIM, new Vector3(0, 0, -1), { depthError: -0.3, lateralError: 0.0, descentSpeed: 6 }, false, seq(0.9));
    expect(play.arrive.z).toBeCloseTo(RIM.z - RIM_RADIUS, 3);
    expect(play.exitVel.z).toBeLessThan(-0.5);
  });
});

describe('ShotArc with a rim play', () => {
  it('flies to the play\'s arrival, dwells for its duration following the keys, queues the touches, then resolves', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: 0.09, lateralError: 0.01, descentSpeed: 8 }, true, seq(0.1));   // a rattle
    expect(play.kind).toBe('rattle_in');
    const arc = new ShotArc();
    const ball = new Vector3(0, 2.2, 5);
    arc.start(ball.clone(), RIM, true, 'jumper', 0, null, play);
    let res: string = 'flying'; let steps = 0; const seen: string[] = [];
    while (res === 'flying' && steps++ < 400) {
      res = arc.step(1 / 60, ball);
      for (const t of arc.takeTouches()) seen.push(t.on);
      if (steps === 200) break;
    }
    // it landed on the iron: the first touch fired the frame the flight arrived
    expect(seen.length).toBeGreaterThanOrEqual(1);
    // after the flight + the dwell, the ball is through the ring
    expect(res).toBe('made');
    expect(ball.y).toBeLessThan(RIM.y);
    expect(radialOf(ball)).toBeLessThan(RIM_RADIUS);
    expect(seen).toEqual(play.touches.map((t) => t.on));
    expect(arc.takeTouches()).toHaveLength(0);
  });

  it('a miss with no dwell resolves the frame it arrives, at the contact', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: -0.3, lateralError: 0.0, descentSpeed: 6 }, false, seq(0.9));
    const arc = new ShotArc();
    const ball = new Vector3(0, 2.2, 5);
    arc.start(ball.clone(), RIM, false, 'jumper', 0, null, play);
    let res: string = 'flying'; let steps = 0;
    while (res === 'flying' && steps++ < 400) res = arc.step(1 / 60, ball);
    expect(res).toBe('missed');
    expect(ball.equalsWithEpsilon(play.arrive, 1e-6)).toBe(true);
    expect(arc.takeTouches()).toHaveLength(1);
  });

  it('sampleRimPlay bows a leg by its lift and ends on the last key', () => {
    const play = planRimPlay(RIM, TO_SHOOTER, { depthError: -0.09, lateralError: 0.0, descentSpeed: 8 }, true, seq(0.1));
    const out = new Vector3();
    const k0 = play.keys[0], k1 = play.keys[1];
    sampleRimPlay(play, (k0.t + k1.t) / 2, out);
    expect(out.y).toBeGreaterThan((k0.p.y + k1.p.y) / 2 + k0.lift * 0.99);
    sampleRimPlay(play, 99, out);
    expect(out.equalsWithEpsilon(play.keys[play.keys.length - 1].p, 1e-9)).toBe(true);
  });
});
