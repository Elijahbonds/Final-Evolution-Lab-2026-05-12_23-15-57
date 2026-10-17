// H2c (owner decision 3): the defender's reactions — a look and a small real effect through his mover, the break odds untouched.
import { describe, expect, it } from 'vitest';
import { AiMover, AI_ACCEL, AI_BRAKE } from './AiMovement';
import {
  DEF_REACT, DEF_REACT_RANGE, lungesOn, retreatFrom, shadeToward, lungeFor, standUpOn, reactionWish, stepReaction, reactClip, readBeatMs, READ_BEAT_MAX_MS, type DefReaction,
} from './DefenderReact';

const DT = 1 / 60;
/** The handler at the origin facing +z (yaw 0: his right is +x), the defender `d` m in front of him facing back. */
const geo = (d = 1.5, live = true) => ({ handler: { x: 0, z: 0 }, handlerYaw: 0, defender: { x: 0, z: d }, live });
/** Run a reaction through a real mover from `v0` (m/s) until it ends: the travel along its direction, the hardest frame (m/s²). */
function play(r: DefReaction, v0 = { x: 0, z: 0 }) {
  const m = new AiMover(3.6); m.vel.set(v0.x, 0, v0.z);
  let cur: DefReaction | null = r, along = 0, frames = 0, worst = 0, px = v0.x, pz = v0.z;
  const dir = { ...r.dir };
  while (cur && frames < 120) {
    const st = m.track(DT, reactionWish(cur));
    worst = Math.max(worst, Math.hypot(st.vel.x - px, st.vel.z - pz) / DT); px = st.vel.x; pz = st.vel.z;
    along += (st.vel.x * dir.x + st.vel.z * dir.z) * DT;
    cur = stepReaction(cur, DT, st.vel); frames++;
  }
  return { along, frames, worst, end: { x: m.vel.x, z: m.vel.z } };
}

describe('the defender reacts (H2c)', () => {
  it('the crossing moves (and the feints) pull him; the spin, the hesi and the yoyo do not lunge him', () => {
    for (const m of ['crossover', 'momentum_cross', 'between_legs', 'behind_back', 'double_cross', 'shammgod', 'snatch_back', 'in_and_out', 'slip_slide'] as const) expect(lungesOn(m), m).toBe(true);
    for (const m of ['spin', 'steezo_roll', 'hesi', 'yoyo', 'stepback', 'off_the_head'] as const) expect(lungesOn(m), m).toBe(false);
  });
  it('the jab he bought: a drop step straight back, ~0.3 m given up (the owner\'s number) over its 0.3 s, inside the AI accel / brake caps', () => {
    const r = retreatFrom(geo())!;
    expect(r.kind).toBe('retreat'); expect(r.dir.z).toBeCloseTo(1, 9);   // away from the handler (+z)
    const p = play(r);
    expect(p.along).toBeGreaterThan(DEF_REACT.retreat.dist - 0.05); expect(p.along).toBeLessThan(DEF_REACT.retreat.dist + 0.02);
    expect(p.frames * DT).toBeCloseTo(DEF_REACT.retreat.sec, 1);
    expect(p.worst).toBeLessThanOrEqual(Math.max(AI_ACCEL, AI_BRAKE) + 1e-6);
    expect(reactClip(r)).toBe('bball_def_retreat');
  });
  it('the yoyo: a small shade to the ball\'s side of the handler (his right is +x), no clip of its own (the slide loop plays it)', () => {
    const rr = shadeToward(geo(), 'right')!, rl = shadeToward(geo(), 'left')!;
    expect(rr.dir.x).toBeCloseTo(1, 9); expect(rl.dir.x).toBeCloseTo(-1, 9);
    const p = play(rr); expect(p.along).toBeGreaterThan(DEF_REACT.shade.dist - 0.05); expect(p.along).toBeLessThan(DEF_REACT.shade.dist + 0.02);
    expect(reactClip(rr)).toBeNull();
  });
  it('a crossing that did not break him: one step the WRONG way — the ankle bite\'s own direction for the same side, a smaller step', () => {
    // reactToBreak's bite: right.scale(moveDir === 'right' ? -1 : 1) along the handler's right
    expect(lungeFor(geo(), 'crossover', 'right')!.dir.x).toBeCloseTo(-1, 9);
    expect(lungeFor(geo(), 'crossover', 'left')!.dir.x).toBeCloseTo(1, 9);
    const p = play(lungeFor(geo(), 'crossover', 'left')!);
    expect(p.along).toBeGreaterThan(DEF_REACT.lunge.dist - 0.06); expect(p.along).toBeLessThan(DEF_REACT.lunge.dist + 0.02);
    expect(lungeFor(geo(), 'spin', 'left')).toBeNull();
    expect(reactClip(lungeFor(geo(), 'crossover', 'left')!, 'left')).toBe('bball_def_lunge_left');
  });
  it('a defender already moving the other way still only commits the one step (the reaction aims a distance, not a speed)', () => {
    const p = play(lungeFor(geo(), 'crossover', 'left')!, { x: -2.5, z: 0 });   // sliding hard the right way (−x); the lunge is +x
    expect(p.along).toBeLessThan(DEF_REACT.lunge.dist + 0.02);
    expect(p.worst).toBeLessThanOrEqual(Math.max(AI_ACCEL, AI_BRAKE) + 1e-6);
  });
  it('the hesitation he was closing on: he stands up — the wish is zero for the beat, so a sliding defender plants (it costs him a beat)', () => {
    expect(standUpOn(geo(), 0.5)).toBeNull();   // not closing: no read
    const r = standUpOn(geo(), 1.2)!; expect(r.kind).toBe('standup'); expect(reactionWish(r)).toEqual({ x: 0, z: 0 });
    const p = play(r, { x: 3, z: 0 });
    expect(Math.hypot(p.end.x, p.end.z)).toBeLessThan(0.1);   // 3 m/s to a stop inside the beat at the brake cap
    expect(reactClip(r)).toBe('bball_def_standup');
  });
  it('nothing reads a defender out of range or not live', () => {
    for (const g of [geo(DEF_REACT_RANGE + 0.1), geo(1.5, false)]) {
      expect(retreatFrom(g)).toBeNull(); expect(shadeToward(g, 'right')).toBeNull(); expect(lungeFor(g, 'crossover', 'left')).toBeNull(); expect(standUpOn(g, 2)).toBeNull();
    }
  });
  it('a soft break\'s stumble beats when the ball crosses: the path\'s readAtK from where the move is now, capped; no read = now', () => {
    expect(readBeatMs({ t: 0, duration: 0.42, readAtK: 0.45 })).toBeCloseTo(189, 6);   // the crossover: 0.45 of 0.42 s
    expect(readBeatMs({ t: 0.1, duration: 0.42, readAtK: 0.45 })).toBeCloseTo(89, 6);
    expect(readBeatMs({ t: 0.3, duration: 0.42, readAtK: 0.45 })).toBe(0);              // past it: now
    expect(readBeatMs({ t: 0, duration: 2, readAtK: 0.7 })).toBe(READ_BEAT_MAX_MS);
    expect(readBeatMs({ t: 0, duration: 0.5, readAtK: null })).toBe(0);
    expect(readBeatMs(null)).toBe(0);
  });
});
