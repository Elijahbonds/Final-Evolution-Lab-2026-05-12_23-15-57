// What traversal looks like (lane A1): every clip the movement view can ask for is a REAL clip (a missing one renders
// bind pose), its suite is one A4's scope must allow, and the tilt / sparks / boom / streak decisions are what the
// views apply.
import { describe, expect, it } from 'vitest';
import { REAL_CLIPS, isResolvable } from '@/lib/babylon/anim/clipRegistry';
import { suiteOfClip } from '@/lib/babylon/anim/clipScope';
import { MOVEMENT_STATES, type MovementState } from '../contracts';
import type { MovementTelemetry } from './index';
import {
  BOOM_SEC, CRUISE_BODY_PITCH, MOVEMENT_CLIP_SUITES, SPIN_BALL_RATE, boomProgress, movementClipFor, poseTiltFor,
  sparkTierFor, streakFracFor,
} from './look';

const tele = (over: Partial<MovementTelemetry> = {}): MovementTelemetry => ({
  id: 'p', state: 'ground', speed: 0, speed01: 0, flowTier: 0, flow01: 0, spinning: false, skidding: false,
  airDashing: false, homingTargetId: null, homingChain: 0,
  rail: { lean: 0, needle: 0, turn: 0, tricking: false, trickChain: 0, switching: false },
  flight: { mode: 'free', bank: 0, pitch: 0, glide: false, dashing: false, boomAtSec: null, reserve01: 1 },
  mountStamina01: null, jumpedAt: -Infinity, landedAt: -Infinity, ...over,
});

describe('look: clips', () => {
  it('every state, in every variant, asks only for a real clip from an allowed suite', () => {
    const variants: Partial<MovementTelemetry>[] = [
      {}, { speed: 2 }, { speed: 9 }, { speed: 14 }, { landedAt: 0 }, { jumpedAt: 0 }, { spinning: true },
      { airDashing: true, spinning: true },
      { rail: { lean: 1, needle: 0, turn: 0.1, tricking: true, trickChain: 1, switching: false } },
      { rail: { lean: 0, needle: 0, turn: 0, tricking: false, trickChain: 0, switching: true } },
      { flight: { mode: 'cruise', bank: 0.5, pitch: 0, glide: false, dashing: false, boomAtSec: null, reserve01: 1 } },
    ];
    const seen = new Set<string>();
    for (const state of MOVEMENT_STATES as readonly MovementState[]) {
      for (const v of variants) for (const stateSec of [0, 2]) {
        const c = movementClipFor({ state, stateSec }, tele(v), 0.05);
        seen.add(c.clip);
        expect(REAL_CLIPS.has(c.clip) || isResolvable(c.clip), c.clip).toBe(true);
        expect(['core', ...MOVEMENT_CLIP_SUITES]).toContain(suiteOfClip(c.clip));
        expect(c.speedRatio).toBeGreaterThan(0);
      }
    }
    expect(seen).toEqual(new Set([
      'idle_stand', 'walk', 'run', 'jump_land', 'jump_up', 'freerun_tuck', 'freerun_air_hold', 'board_grind',
      'prop_bike_rider', 'karate_hit_react', 'karate_knockdown', 'karate_floor_hold',
    ]));
  });

  it('the run clip speeds up with the run (and clamps), the spin jump is the tucked ball', () => {
    expect(movementClipFor({ state: 'ground', stateSec: 1 }, tele({ speed: 9.6 }), 5).speedRatio).toBeCloseTo(2);
    expect(movementClipFor({ state: 'ground', stateSec: 1 }, tele({ speed: 30 }), 5).speedRatio).toBe(2.4);
    expect(movementClipFor({ state: 'air', stateSec: 0.2 }, tele({ spinning: true }), 5).clip).toBe('freerun_tuck');
    expect(movementClipFor({ state: 'ko', stateSec: 2 }, tele(), 5).clip).toBe('karate_floor_hold');
  });
});

describe('look: tilt, sparks, boom, streaks', () => {
  it('the ball spins, the rail leans, cruise lies flat and banks', () => {
    expect(poseTiltFor({ state: 'air' }, tele({ spinning: true })).spinRate).toBe(SPIN_BALL_RATE);
    expect(poseTiltFor({ state: 'grind' }, tele({ rail: { lean: 1, needle: 0, turn: 0, tricking: false, trickChain: 0, switching: false } })).roll).toBeGreaterThan(0);
    const c = poseTiltFor({ state: 'flight' }, tele({ flight: { mode: 'cruise', bank: 0.8, pitch: 0, glide: false, dashing: false, boomAtSec: null, reserve01: 1 } }));
    expect(c.pitch).toBeCloseTo(CRUISE_BODY_PITCH); expect(c.roll).toBeCloseTo(0.8);
    expect(poseTiltFor({ state: 'ground' }, tele({ speed: 14 }))).toEqual({ pitch: 0, roll: 0, spinRate: 0 });
  });

  it('sparks only on a rail, hotter with speed and against the curve', () => {
    const r = (lean: number, turn: number) => ({ lean, needle: 0, turn, tricking: false, trickChain: 0, switching: false });
    expect(sparkTierFor('ground', tele({ speed01: 1 }))).toBe(0);
    expect(sparkTierFor('grind', tele({ speed01: 0.2, rail: r(0, 0) }))).toBe(1);
    expect(sparkTierFor('grind', tele({ speed01: 0.5, rail: r(0, 0) }))).toBe(2);
    expect(sparkTierFor('grind', tele({ speed01: 0.5, rail: r(-1, 0.1) }))).toBe(3);
    expect(sparkTierFor('grind', tele({ speed01: 0.9, rail: r(0, 0) }))).toBe(3);
  });

  it('the boom ring lives BOOM_SEC from the boom; streaks read cruise, a fast rail and a fast run', () => {
    const t = tele({ flight: { mode: 'cruise', bank: 0, pitch: 0, glide: false, dashing: false, boomAtSec: 10, reserve01: 1 } });
    expect(boomProgress(t, 9.9)).toBeNull();
    expect(boomProgress(t, 10 + BOOM_SEC / 2)).toBeCloseTo(0.5);
    expect(boomProgress(t, 10 + BOOM_SEC + 0.01)).toBeNull();
    expect(streakFracFor('flight', t)).toBeGreaterThanOrEqual(0.8);
    expect(streakFracFor('riding', t)).toBe(0);
    expect(streakFracFor('ground', tele({ speed01: 0.9 }))).toBeCloseTo(0.9);
  });
});
