// hoops-sound (phase 11a): the dribble is heard ONCE per bounce — on the game's own bounce curve (Dribble.dribbleAtPushed, the hoops
// carry's), at 30, 60 and 144 fps and with a ragged frame clock — never on a held, carried or set-down ball, and never twice for one
// contact (the re-arm, and the same ball placed by two carries).
import { describe, expect, it } from 'vitest';
import { HOOPS_DRIBBLE, PUSHED_FLOOR_PHASE, dribbleAtPushed } from '../anim/Dribble';
import {
  BOUNCE_LEVEL_MAX, BOUNCE_LEVEL_MIN, BOUNCE_REF_MPS, DRIBBLE_SOUND_AI_K, DRIBBLE_SOUND_VOL, FloorContact, REARM_M,
  bounceVolume, claimDribbleRole, panFor,
} from './dribbleSound';

/** Drive a detector with the hoops dribble at `hz` for `sec`, frames from `dtAt(i)`. Returns contact frames' phases and speeds. */
function dribble(hz: number, sec: number, dtAt: (i: number) => number, heightScale = 1) {
  const fc = new FloorContact(); const hits: { phase: number; speed: number; t: number }[] = [];
  let phase = 0.1, t = 0, crossings = 0, prevPh = phase;
  for (let i = 0; t < sec; i++) {
    const dt = dtAt(i); t += dt;
    phase = (phase + dt * hz) % 1;
    if ((prevPh < PUSHED_FLOOR_PHASE && phase >= PUSHED_FLOOR_PHASE) || (prevPh > phase && phase >= PUSHED_FLOOR_PHASE)) crossings++;
    prevPh = phase;
    const s = dribbleAtPushed(phase, HOOPS_DRIBBLE, heightScale);
    const v = fc.step(s.ballY - HOOPS_DRIBBLE.ballR, dt);
    if (v > 0) hits.push({ phase, speed: v, t });
  }
  return { hits, crossings, count: fc.count };
}

describe('FloorContact on the hoops dribble', () => {
  for (const fps of [30, 60, 144]) {
    for (const hz of [HOOPS_DRIBBLE.hzIdle, HOOPS_DRIBBLE.hzFast]) {
      it(`${fps} fps, ${hz} bounces/s: one contact per floor crossing, on (or one frame after) the floor`, () => {
        const r = dribble(hz, 12, () => 1 / fps);
        expect(r.hits.length).toBe(r.crossings);
        expect(r.count).toBe(r.hits.length);
        expect(r.hits.length).toBeGreaterThanOrEqual(Math.floor(12 * hz) - 1);
        const frame = hz / fps;   // one frame, in phase
        for (const h of r.hits) {
          const after = (h.phase - PUSHED_FLOOR_PHASE + 1) % 1, before = (PUSHED_FLOOR_PHASE - h.phase + 1) % 1;
          expect(Math.min(after, before)).toBeLessThanOrEqual(frame + 1e-9);   // within a frame of the contact
          expect(h.speed).toBeGreaterThan(2);                                  // the pushed bounce is fastest at the floor
        }
      });
    }
  }
  it('a ragged frame clock (12–40 ms frames) still gives exactly one per bounce', () => {
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const r = dribble(2.0, 20, () => 0.012 + rnd() * 0.028);
    expect(r.hits.length).toBe(r.crossings);
    // and consecutive contacts are a bounce apart, never a double
    for (let i = 1; i < r.hits.length; i++) expect(r.hits[i].t - r.hits[i - 1].t).toBeGreaterThan(0.35);
  });
  it('a low, hard dribble (the crossover\'s stroke, 0.5 of the height) is one per bounce too', () => {
    const r = dribble(2.0, 10, () => 1 / 60, 0.5);
    expect(r.hits.length).toBe(r.crossings);
  });
  it('the speed sets the level: the full stroke at 2 Hz plays near the reference, the low stroke quieter', () => {
    const full = dribble(2.0, 6, () => 1 / 60).hits.map((h) => h.speed);
    const low = dribble(2.0, 6, () => 1 / 60, 0.5).hits.map((h) => h.speed);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(full) / BOUNCE_REF_MPS).toBeGreaterThan(0.75);
    expect(mean(full) / BOUNCE_REF_MPS).toBeLessThan(1.3);
    expect(mean(low)).toBeLessThan(mean(full));
  });
});

describe('FloorContact: what is not a bounce', () => {
  it('a held ball, a ball carried at chest height and a ball set down slowly make no sound', () => {
    const fc = new FloorContact();
    for (let i = 0; i < 120; i++) expect(fc.step(0.9, 1 / 60)).toBe(0);
    for (let i = 0; i < 120; i++) expect(fc.step(1.0 + Math.sin(i / 10) * 0.05, 1 / 60)).toBe(0);
    let h = 0.5; for (let i = 0; i < 300; i++) { h = Math.max(0, h - 0.2 / 60); expect(fc.step(h, 1 / 60)).toBe(0); }
  });
  it('one contact, then nothing until the ball has risen past the re-arm height (a ball that chatters on the floor is one sound)', () => {
    const fc = new FloorContact();
    const ys = [0.6, 0.4, 0.2, 0.02];
    const got = ys.map((y) => fc.step(y, 1 / 60));
    expect(got.filter((v) => v > 0)).toHaveLength(1);
    // chatter under the re-arm height: down-up-down near the floor
    for (const y of [0.08, 0.15, 0.05, 0.01, 0.1, 0.0]) expect(fc.step(y, 1 / 60)).toBe(0);
    // up past REARM_M and back down: the next bounce counts
    for (const y of [0.1, REARM_M + 0.05, 0.4, 0.2, 0.05]) fc.step(y, 1 / 60);
    expect(fc.count).toBe(2);
  });
  it('a ball slowed in the air (a hand or a move meeting it 13 cm up) is not a contact; the floor four frames later is (1v1 rig, frames 190-196)', () => {
    const fc = new FloorContact(); const r = 0.12;
    const ys = [0.47, 0.38, 0.29, 0.25, 0.21, 0.18, 0.14, 0.14, 0.17, 0.20, 0.23];
    const hits = ys.map((y) => fc.step(y - r, 1 / 60));
    expect(hits.findIndex((v) => v > 0)).toBe(6);   // frame 195: the ball 2 cm off the floor, not frame 192 at 13 cm
    expect(hits.filter((v) => v > 0)).toHaveLength(1);
  });
  it('reset() forgets the ball: no speed is read across the gap (a carry that stopped drawing it)', () => {
    const fc = new FloorContact();
    fc.step(0.9, 1 / 60);
    fc.reset();
    expect(fc.step(0.0, 1 / 60)).toBe(0);   // a ball that is suddenly low is not a 54 m/s slam
    expect(fc.step(0.0, 0)).toBe(0);         // a zero dt is no frame
  });
});

describe('who hears what', () => {
  it('the first hoops carry on a scene is the player\'s, every later one an AI handler\'s, unless named', () => {
    const a = {}, b = {};
    expect(claimDribbleRole(a)).toBe('player');
    expect(claimDribbleRole(a)).toBe('ai');
    expect(claimDribbleRole(a)).toBe('ai');
    expect(claimDribbleRole(b, 'ai')).toBe('ai');
    expect(claimDribbleRole(b)).toBe('ai');            // the named one still took the first slot
    expect(claimDribbleRole({}, 'off')).toBe('off');
  });
  it('the level follows the bounce speed inside its band; an AI handler plays at its share; off is silent', () => {
    expect(bounceVolume(BOUNCE_REF_MPS, 'player')).toBeCloseTo(DRIBBLE_SOUND_VOL, 12);
    expect(bounceVolume(BOUNCE_REF_MPS, 'ai')).toBeCloseTo(DRIBBLE_SOUND_VOL * DRIBBLE_SOUND_AI_K, 12);
    expect(bounceVolume(0.1, 'player')).toBeCloseTo(DRIBBLE_SOUND_VOL * BOUNCE_LEVEL_MIN, 12);
    expect(bounceVolume(40, 'player')).toBeCloseTo(DRIBBLE_SOUND_VOL * BOUNCE_LEVEL_MAX, 12);
    expect(bounceVolume(BOUNCE_REF_MPS, 'off')).toBe(0);
    expect(bounceVolume(BOUNCE_REF_MPS, 'loose')).toBeCloseTo(DRIBBLE_SOUND_VOL, 12);   // a rebound or a gather's last bounce
    expect(bounceVolume(0, 'player')).toBe(0);
  });
  it('the pan is gentle and capped', () => {
    expect(panFor(0, 6)).toBe(0);
    expect(panFor(1, 6)).toBeCloseTo(0.2, 12);
    expect(panFor(50, 6)).toBe(0.7);
    expect(panFor(-50, 6)).toBe(-0.7);
    expect(panFor(Number.NaN, 6)).toBe(0);
  });
});
