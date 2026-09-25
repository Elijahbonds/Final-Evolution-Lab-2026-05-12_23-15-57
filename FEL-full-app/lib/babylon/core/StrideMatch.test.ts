// Do the feet cover the ground the body covers?
//
// The measured problem: a DOWN foot travelled 38% of the body's motion, because the run loop plays at one cadence at
// every speed. These tests are about the rule that fixes it — and about not applying it where it would break timing.

import { basketballClipTable } from '../anim/basketballTree';
import { describe, it, expect } from 'vitest';
import {
  HOOPS_STRIDE, RATE_MIN, RATE_MAX,
  strideRate, strideKindFor, rateFor, StrideRateFilter, combatRateFor, COMBAT_STRIDE,
} from './StrideMatch';

describe('one stride covers the ground the body covers', () => {
  it('at the authored speed the clip plays at its own rate', () => {
    expect(strideRate(HOOPS_STRIDE.run, HOOPS_STRIDE.run)).toBeCloseTo(1, 6);
  });

  it('faster body, faster stride; slower body, slower stride', () => {
    expect(strideRate(HOOPS_STRIDE.run * 1.5, HOOPS_STRIDE.run)).toBeGreaterThan(1);
    expect(strideRate(HOOPS_STRIDE.run * 0.5, HOOPS_STRIDE.run)).toBeLessThan(1);
  });

  it('the rate is PROPORTIONAL to speed — that is what makes the feet match', () => {
    // Double the speed, double the cadence: anything else still skates, just differently. Measured INSIDE the clamp
    // band — 2 m/s against a 4.2 m/s reference is 0.48, which clamps to RATE_MIN, so the pair has to straddle
    // nothing for the proportionality to be visible at all.
    const a = strideRate(3, 4.2), b = strideRate(6, 4.2);
    expect(a).toBeGreaterThan(RATE_MIN);
    expect(b).toBeLessThan(RATE_MAX);
    expect(b / a).toBeCloseTo(2, 4);
  });

  it('it is clamped, because a clip pushed far enough stops reading as running', () => {
    expect(strideRate(99, HOOPS_STRIDE.run)).toBe(RATE_MAX);
    expect(strideRate(0.01, HOOPS_STRIDE.run)).toBe(RATE_MIN);
  });

  it('a stopped body does not freeze mid-stride', () => {
    expect(strideRate(0, HOOPS_STRIDE.run)).toBe(RATE_MIN);
    expect(RATE_MIN).toBeGreaterThan(0);
  });

  it('a defensive shuffle is measured against a SHORTER step than a run', () => {
    expect(HOOPS_STRIDE.slide).toBeLessThan(HOOPS_STRIDE.run);
    // the same body speed therefore drives a slide's cadence harder than a run's, which is correct: a shuffle at
    // 4 m/s is a frantic shuffle
    expect(strideRate(3, HOOPS_STRIDE.slide)).toBeGreaterThan(strideRate(3, HOOPS_STRIDE.run));
  });

  it('garbage in does not produce garbage out', () => {
    expect(strideRate(NaN, 4.2)).toBe(1);
    expect(strideRate(4, 0)).toBe(1);
    expect(strideRate(-4, 4.2)).toBeCloseTo(strideRate(4, 4.2), 6);   // a reversing body still strides
  });
});

describe('ONLY locomotion is rate-scaled', () => {
  it('running states are', () => {
    for (const s of ['run', 'crossover']) expect(strideKindFor(s)).toBe('run');
    // HOOPS MOTION 2b (2026-09-25): the dribbling sprint is its own capture (78_06) with its own stride
    for (const s of ['drive', 'sprint_dribble']) expect(strideKindFor(s)).toBe('sprint');
  });

  it('the sprint falls back to the run reference on a table without one (the authored set)', () => {
    expect(rateFor('drive', HOOPS_STRIDE.run, HOOPS_STRIDE)).toBeCloseTo(1, 5);
    expect(rateFor('sprint_dribble', 5, { run: 4, slide: 2, sprint: 5 })).toBeCloseTo(1, 5);
  });

  it('a per-state reference is read before its kind\'s (HOOPS MOTION 2b: the clip a state plays sets its pace)', () => {
    const ref = { run: 4, slide: 2, byState: { defend_backpedal: 3, closeout: 3.6 } };
    expect(rateFor('defend_backpedal', 3, ref)).toBeCloseTo(1, 6);
    expect(rateFor('defend_slide', 2, ref)).toBeCloseTo(1, 6);        // no entry: the kind's
    expect(rateFor('closeout', 3.6, ref)).toBeCloseTo(1, 6);
    expect(rateFor('shot_release', 3, ref)).toBeNull();               // a per-state number never makes a non-locomotion state paced
  });

  it('the defensive slides are, against their own reference', () => {
    for (const s of ['defend_slide', 'defend_slide_right']) expect(strideKindFor(s)).toBe('slide');
  });

  it('EVERY looping state that walks is matched — the list fell behind the tree once (HOOPS-DEPTH S7)', () => {
    // defend_backpedal / closeout / the hard slides / the carry slides were added to the tree after this allowlist and
    // played at a fixed rate: every planted-foot skate in a live 1v1 was on a defence clip
    for (const s of ['defend_slide_hard', 'defend_slide_hard_right', 'defend_backpedal', 'carry_slide', 'carry_slide_right', 'carry_back']) expect(strideKindFor(s), s).toBe('slide');
    expect(strideKindFor('closeout')).toBe('run');
    const STANDS_STILL = new Set(['idle_dribble', 'protect', 'gather', 'shot_release', 'defend_idle', 'box_out', 'watch', 'floor']);
    for (const [state, c] of Object.entries(basketballClipTable())) {
      if (!c.loop || STANDS_STILL.has(state)) continue;
      expect(strideKindFor(state), `${state} loops and walks but is not stride-matched`).not.toBe('none');
    }
  });

  it('A SHOT IS NOT — rate-scaling it would move the meter\'s own timing', () => {
    for (const s of ['shot_release', 'layup', 'dunk']) {
      expect(strideKindFor(s)).toBe('none');
      expect(rateFor(s, 6)).toBeNull();
    }
  });

  it('a knockdown is not — a body would fall at the wrong speed', () => {
    for (const s of ['floor', 'contact_stagger']) expect(rateFor(s, 6)).toBeNull();
  });

  it('an unknown state is refused, not scaled by default', () => {
    expect(rateFor('some_state_added_next_year', 6)).toBeNull();
  });

  it('rateFor returns a real rate for a locomotion state', () => {
    const r = rateFor('drive', HOOPS_STRIDE.run);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(1, 5);
  });
});

describe('the rate is smoothed, or the stride stutters', () => {
  it('it eases toward the target rather than jumping', () => {
    const f = new StrideRateFilter();
    const first = f.step(1.8, 1 / 60);
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(1.8);
  });

  it('and gets there', () => {
    const f = new StrideRateFilter();
    for (let i = 0; i < 60; i++) f.step(1.8, 1 / 60);
    expect(f.value).toBeCloseTo(1.8, 2);
  });

  it('a state change ADOPTS the rate instead of sliding to it', () => {
    const f = new StrideRateFilter();
    f.set(1.5);
    expect(f.value).toBe(1.5);
  });

  it('a zero dt does not move it or divide by anything', () => {
    const f = new StrideRateFilter();
    f.set(1.2);
    f.step(1.8, 0);
    expect(f.value).toBe(1.2);
  });

  it('the smoothed rate stays inside the clamps it was fed', () => {
    const f = new StrideRateFilter();
    for (let i = 0; i < 300; i++) {
      const r = f.step(strideRate(i % 2 ? 99 : 0, HOOPS_STRIDE.run), 1 / 60);
      expect(r).toBeGreaterThanOrEqual(RATE_MIN - 1e-6);
      expect(r).toBeLessThanOrEqual(RATE_MAX + 1e-6);
    }
  });
});

describe('the arithmetic that makes a foot stop skating', () => {
  it('matching the rate makes stride distance equal body distance', () => {
    // a clip authored at `ref` covers `ref * dt` of ground per second of clip time; played at `rate` it covers
    // `ref * rate`. Matched, that equals the body's speed — which is the definition of not skating.
    for (const speed of [1, 2.5, 4.2, 6, 7.5]) {
      const rate = strideRate(speed, HOOPS_STRIDE.run);
      const covered = HOOPS_STRIDE.run * rate;
      if (rate > RATE_MIN && rate < RATE_MAX) expect(covered).toBeCloseTo(speed, 4);
    }
  });

  it('and outside the clamps the MISMATCH is what the foot planter has to absorb', () => {
    const speed = 20;                                    // far past what the clip can stretch to
    const covered = HOOPS_STRIDE.run * strideRate(speed, HOOPS_STRIDE.run);
    expect(covered).toBeLessThan(speed);                 // a residue remains, by design
  });
});

describe('combat strides, and the backwards-step trap', () => {
  it('the guard step and the shuffles are rate-matched', () => {
    expect(combatRateFor('walk', COMBAT_STRIDE.walk)).toBeCloseTo(1, 5);
    expect(combatRateFor('strafe_left', COMBAT_STRIDE.strafe)).toBeCloseTo(1, 5);
    expect(combatRateFor('strafe_right', COMBAT_STRIDE.strafe)).toBeCloseTo(1, 5);
    expect(combatRateFor('dash', COMBAT_STRIDE.dash)).toBeCloseTo(1, 5);
  });

  it('A RETREAT KEEPS ITS NEGATIVE SIGN — the trap this function exists for', () => {
    // walk_back is the guard step at speedRatio −1: the same cadence played BACKWARDS, because a fighter giving ground
    // steps back rather than walking forward away from you. Returning a positive rate would make a retreating fighter
    // walk FORWARD while travelling backwards — worse than the skate it is fixing.
    const r = combatRateFor('walk_back', 2.5, -1);
    expect(r).not.toBeNull();
    expect(r as number).toBeLessThan(0);
  });

  it('and its MAGNITUDE still matches the speed, inside the band', () => {
    // A guard step's reference is 0.6 m/s, so the linear band is roughly 0.33..1.11 m/s. Picked inside it: at 3.5 and
    // 1.2 BOTH saturate at RATE_MAX and the magnitudes are equal, which is the combat residue, not a bug.
    const fast = combatRateFor('walk_back', 1.0, -1) as number;
    const slow = combatRateFor('walk_back', 0.5, -1) as number;
    expect(Math.abs(fast)).toBeGreaterThan(Math.abs(slow));
    expect(fast).toBeLessThan(0);
    expect(slow).toBeLessThan(0);
  });

  it('COMBAT SATURATES at real fighting speeds — the residue is a budget, not a wiring bug', () => {
    // A fighter's root moves ~3 m/s while a guard step strides ~0.6; covering that needs a rate near 5 and RATE_MAX is
    // 1.85, deliberately, because a stance clip played five times over reads as a fast-forward rather than a fighter.
    expect(Math.abs(combatRateFor('walk', 3.0) as number)).toBe(RATE_MAX);
    expect(Math.abs(combatRateFor('strafe_left', 3.0) as number)).toBe(RATE_MAX);
  });

  it('a forward loop with no authored ratio stays positive', () => {
    expect(combatRateFor('walk', 2.5) as number).toBeGreaterThan(0);
  });

  it('a shuffle is measured against a SHORTER step than a guard step, and a dash a longer one', () => {
    expect(COMBAT_STRIDE.strafe).toBeLessThan(COMBAT_STRIDE.walk);
    expect(COMBAT_STRIDE.dash).toBeGreaterThan(COMBAT_STRIDE.walk);
  });

  it('strikes, blocks, reactions and the floor are refused', () => {
    for (const s of ['strike_light', 'strike_heavy', 'strike_finisher', 'block_hold', 'parry',
      'react', 'knockdown', 'floor', 'get_up', 'dodge', 'idle']) {
      expect(combatRateFor(s, 3), `${s} must not be rate-matched`).toBeNull();
    }
  });

  it('an unknown combat state is refused, not scaled by default', () => {
    expect(combatRateFor('some_state_added_next_year', 3)).toBeNull();
  });
});

describe('DRIBBLE GEARS (2026-09-17)', () => {
  it('the walk, the jog and the sprint dribble loops pace against their own references', async () => {
    const m = await import('./StrideMatch');
    expect(m.strideKindFor('walk_dribble')).toBe('walk');
    expect(m.strideKindFor('speed_dribble')).toBe('jog');
    expect(m.strideKindFor('sprint_dribble')).toBe('sprint');
    expect(m.rateFor('walk_dribble', 1.6)!).toBeCloseTo(Math.min(m.RATE_MAX, 1.6 / 0.72), 6);
    expect(m.rateFor('speed_dribble', 4.2)!).toBeCloseTo(4.2 / 2.8, 6);
  });

  it('HOOPS MOTION 2b: the captured walk no longer clamps at the walking gear (1.6 m/s); the authored one still does', async () => {
    const m = await import('./StrideMatch');
    expect(m.rateFor('walk_dribble', 1.6, m.HOOPS_STRIDE_CAPTURE)!).toBeLessThan(m.RATE_MAX);
    expect(m.rateFor('walk_dribble', 1.6, m.HOOPS_STRIDE)).toBe(m.RATE_MAX);
    expect(m.strideRef(true).sprint).toBe(m.HOOPS_STRIDE_CAPTURE.sprint);
    expect(m.strideRef(true).byState).toBe(m.HOOPS_STRIDE_CAPTURE.byState);
    expect(m.strideRef(false).sprint).toBeUndefined();
    expect(m.strideRef(false).byState).toBeUndefined();
  });
});

describe('HOOPS MOTION 2b review: the sweep knob and the right slide\'s ceiling', () => {
  it('?strideRun= paces EVERY run and sprint state, ?strideSlide= every slide state — the per-state numbers of that kind stand aside', async () => {
    const m = await import('./StrideMatch');
    const cap = m.HOOPS_STRIDE_CAPTURE;
    const run = m.withStrideOverride(cap, { run: 4.8 });
    for (const s of ['run', 'crossover', 'drive', 'sprint_dribble', 'closeout']) expect(m.rateFor(s, 4.8, run)!, s).toBeCloseTo(1, 6);
    for (const s of ['defend_slide_right', 'defend_backpedal', 'walk_dribble', 'speed_dribble']) expect(m.rateFor(s, 3, run), s).toBe(m.rateFor(s, 3, cap));
    const slide = m.withStrideOverride(cap, { slide: 2.4 });
    for (const s of ['defend_slide', 'defend_slide_right', 'defend_slide_hard', 'defend_slide_hard_right', 'defend_backpedal', 'carry_slide', 'carry_slide_right', 'carry_back']) {
      expect(m.rateFor(s, 2.4, slide)!, s).toBeCloseTo(1, 6);
      expect(m.rateFor(s, 9, slide), `${s}: the sweep drops the kind's own ceilings too`).toBe(m.RATE_MAX);
    }
    for (const s of ['drive', 'closeout', 'speed_dribble']) expect(m.rateFor(s, 3, slide), s).toBe(m.rateFor(s, 3, cap));
    // on the authored table the knobs do what they always did
    const authored = m.withStrideOverride(m.HOOPS_STRIDE, { run: 4.2, slide: 2.2 });
    expect(authored).toEqual({ ...m.HOOPS_STRIDE, run: 4.2, sprint: 4.2, slide: 2.2, byState: undefined, rateMaxByState: undefined });
  });

  it('no knob, no copy: strideRef hands back the table itself', async () => {
    const m = await import('./StrideMatch');
    expect(m.withStrideOverride(m.HOOPS_STRIDE_CAPTURE, {})).toBe(m.HOOPS_STRIDE_CAPTURE);
    expect(m.strideRef(true)).toBe(m.HOOPS_STRIDE_CAPTURE);
    expect(m.strideRef(false)).toBe(m.HOOPS_STRIDE);
  });

  it('a state\'s own ceiling is read before RATE_MAX, and only for that state', async () => {
    const m = await import('./StrideMatch');
    const ref = { run: 4, slide: 2, byState: { defend_slide_right: 1.7 }, rateMaxByState: { defend_slide_right: 2.34 } };
    expect(m.rateFor('defend_slide_right', 3.6, ref)!).toBeCloseTo(3.6 / 1.7, 6);   // 2.12: above RATE_MAX, inside its own ceiling
    expect(m.rateFor('defend_slide_right', 9, ref)).toBe(2.34);
    expect(m.rateFor('defend_slide', 9, ref)).toBe(m.RATE_MAX);
    expect(m.rateFor('defend_slide_right', 0.2, ref)).toBe(m.RATE_MIN);
    expect(m.strideRate(9, 1)).toBe(m.RATE_MAX);                                       // the two-argument form is unchanged
  });
});
