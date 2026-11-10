// hoops-p05 (owner 2026-11-10, "the hero's slide: fix it"): the legs keep stepping under a defensive beat, the backpedal capture plays in
// reverse, and the tree drives the pelvis steer with the loop the legs are in. A fake animator, legs layer and steer: what the tree asks.
import { afterEach, describe, expect, it } from 'vitest';
import { BasketballAnimTree, DEFENSE_LEGS_BEAT, type AnimTreeInput } from './basketballTree';
import { MOVE_LEGS_BEAT, legsWeightFor } from './moveLegs';
import { BACKPEDAL_REVERSED_TRAVEL_DEG } from './hipSteer';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

afterEach(() => resetFeelForTests());
const knob = (id: string, v: number) => { setFeelUser(true); setFeelSession(null); setFeelOverride(id, v); };

interface Play { clip: string; opts: { speedRatio?: number; loop?: boolean } }
const rigOf = (captured = true) => {
  const plays: Play[] = []; const scales: [string, number][] = [];
  const animator = { play: (clip: string, opts: Play['opts'] = {}) => { plays.push({ clip, opts }); return null; }, setPlaybackScale: (n: string, s: number) => { scales.push([n, s]); }, clipNames: new Set<string>(captured ? ['bball_mc_run', 'bball_mc_defend_backpedal'] : []) };
  const drives: { loopClip: string | null; speedMps: number; free?: boolean; reverse?: boolean; fadeSec?: number }[] = []; const begins: (string | null)[] = [];
  const legs = { live: false, begin: (c: string | null) => { begins.push(c); }, drive: (d: (typeof drives)[number]) => { drives.push(d); legs.live = !!d.loopClip; }, end: () => { legs.live = false; }, phaseFor: () => undefined };
  const steers: { state: string | null; hold?: boolean; loopDeg?: number; travelOffRad: number | undefined }[] = [];
  const steer = { drive: (d: (typeof steers)[number]) => { steers.push(d); } };
  const tree = new BasketballAnimTree(animator as never);
  tree.attachLegs(legs as never); tree.attachSteer(steer as never);
  return { tree, plays, scales, drives, begins, steers, legs };
};
/** A defender sliding to his left at 2 m/s (under the crossover run's 2.8). */
const slide: AnimTreeInput = { speed01: 0.31, speedMps: 2.0, crossover: false, nearestDefender: Infinity, hasBall: false, shooting: false, dunking: false, driving: false, defending: true, bracing: false, staggered: false, slideDir: 'left', dtSec: 1 / 60, travelOffRad: -Math.PI / 2 };
const retreat: AnimTreeInput = { ...slide, retreat: true, speedMps: 4, speed01: 0.62, travelOffRad: Math.PI };

describe('which beats keep the legs stepping', () => {
  it('the steal reach, the block reach and the hand-up; nothing else, and never a handle move\'s list', () => {
    for (const c of ['bball_steal_reach', 'bball_block_reach', 'bball_hand_up']) { expect(DEFENSE_LEGS_BEAT.test(c), c).toBe(true); expect(MOVE_LEGS_BEAT.test(c), c).toBe(false); }
    for (const c of ['bball_contact_react', 'bball_land_absorb', 'bball_shoot_jumper', 'dunk_launch', 'bball_crossover_left', 'bball_post_up', 'bball_hand_up_left']) expect(DEFENSE_LEGS_BEAT.test(c), c).toBe(false);
  });
});

describe('a defensive beat on a moving body: the loop\'s legs under it', () => {
  it('the reach begins the layer from the slide it cut and drives it free, with the slide\'s loop and the defence fade', () => {
    const R = rigOf();
    R.tree.update(slide);
    expect(R.tree.state).toBe('defend_slide');
    R.tree.beat('bball_steal_reach', { fadeSec: 0.1 });
    R.tree.update(slide);
    expect(R.begins).toEqual(['bball_defend_slide_left']);
    const d = R.drives[R.drives.length - 1];
    expect(d.loopClip).toBe('bball_defend_slide_left'); expect(d.free).toBe(true); expect(d.reverse).toBeUndefined();
    expect(d.fadeSec).toBeGreaterThanOrEqual(0.14);
  });
  it('the held hand-up counts too (a hold, not a beat); any other hold does not', () => {
    const R = rigOf();
    R.tree.update(slide); R.tree.hold('bball_hand_up', { fadeSec: 0.14 }); R.tree.update(slide);
    expect(R.drives[R.drives.length - 1]).toMatchObject({ loopClip: 'bball_defend_slide_left', free: true });
    const Q = rigOf();
    Q.tree.update(slide); Q.tree.hold('bball_post_up'); Q.tree.update(slide);
    expect(Q.drives).toEqual([]);
  });
  it('a reach thrown under a held hand-up carries the stepping legs on (the layer is not re-seeded from a stale loop)', () => {
    const R = rigOf();
    R.tree.update(slide); R.tree.hold('bball_hand_up'); R.tree.update(slide);
    expect(R.begins.length).toBe(1);
    R.tree.beat('bball_steal_reach'); R.tree.update(slide);
    expect(R.begins.length).toBe(1);
    expect(R.drives[R.drives.length - 1].loopClip).toBe('bball_defend_slide_left');
  });
  it('standing still the beat keeps its own legs (the layer\'s weight is 0 under its own LEGS_ON_MPS); in a block jump\'s flight too', () => {
    const R = rigOf();
    R.tree.update(slide); R.tree.beat('bball_block_reach');
    R.tree.update({ ...slide, speed01: 0.05, speedMps: 0.3 });
    expect(R.drives[R.drives.length - 1].speedMps).toBe(0.3);   // the layer is told the body's speed…
    expect(legsWeightFor(0.3)).toBe(0);                          // …and draws none of the loop at it
    R.tree.update({ ...slide, airborne: true });
    expect(R.drives[R.drives.length - 1].loopClip).toBeNull();
    R.tree.update(slide);
    expect(R.drives[R.drives.length - 1].loopClip).toBe('bball_defend_slide_left');
  });
  it('knob hoops.defenseLegsOn 0: the layer is never begun or driven under a defensive beat (the clip\'s standing legs, as before)', () => {
    knob('hoops.defenseLegsOn', 0);
    const R = rigOf();
    R.tree.update(slide); R.tree.beat('bball_steal_reach'); R.tree.update(slide); R.tree.hold('bball_hand_up'); R.tree.update(slide);
    expect(R.begins).toEqual([]); expect(R.drives).toEqual([]);
  });
  it('a handle move\'s beat still drives the layer locked (not free), as before', () => {
    const R = rigOf();
    const jog: AnimTreeInput = { ...slide, defending: false, hasBall: true, speed01: 0.6, speedMps: 3.8, nearestDefender: 3, travelOffRad: undefined };
    R.tree.update(jog); R.tree.beat('bball_crossover_left'); R.tree.update(jog);
    const d = R.drives[R.drives.length - 1];
    expect(d.loopClip).toBe('bball_dribble_jog'); expect(d.free).toBeUndefined();
  });
});

describe('the backpedal plays in reverse on a rig that carries the capture', () => {
  it('the loop starts with a negative ratio and its stride rate keeps the sign; its legs under a beat run backward', () => {
    const R = rigOf();
    R.tree.update(retreat);
    const p = R.plays[R.plays.length - 1];
    expect(p.clip).toBe('bball_defend_backpedal'); expect(p.opts.speedRatio).toBeLessThan(0);
    expect(Math.abs(p.opts.speedRatio as number)).toBeCloseTo(4 / 3.31, 2);   // the capture's own stride reference, unchanged
    expect(R.scales[R.scales.length - 1][1]).toBeLessThan(0);
    R.tree.beat('bball_steal_reach'); R.tree.update(retreat);
    expect(R.drives[R.drives.length - 1]).toMatchObject({ loopClip: 'bball_defend_backpedal', reverse: true });
  });
  it('knob hoops.backpedalReverseOn 0, or a rig without the capture: forward, as before', () => {
    const Q = rigOf(false);
    Q.tree.update(retreat);
    expect(Q.plays[Q.plays.length - 1].opts.speedRatio).toBeGreaterThan(0);
    knob('hoops.backpedalReverseOn', 0);
    const R = rigOf();
    R.tree.update(retreat);
    expect(R.plays[R.plays.length - 1].opts.speedRatio).toBeGreaterThan(0);
    expect(R.scales[R.scales.length - 1][1]).toBeGreaterThan(0);
  });
  it('every other loop is untouched: a slide and a run start with a positive ratio', () => {
    const R = rigOf();
    R.tree.update(slide);
    expect(R.plays[R.plays.length - 1].opts.speedRatio).toBeGreaterThan(0);
  });
});

describe('the tree drives the pelvis steer with the loop the legs are in', () => {
  it('on defence: the running loop and the mode\'s travel; the reversed backpedal brings its own travel', () => {
    const R = rigOf();
    R.tree.update(slide); R.tree.update(slide);
    expect(R.steers[R.steers.length - 1]).toMatchObject({ state: 'defend_slide', travelOffRad: -Math.PI / 2 });
    const Q = rigOf();
    Q.tree.update(retreat); Q.tree.update(retreat);
    expect(Q.steers[Q.steers.length - 1]).toMatchObject({ state: 'defend_backpedal', loopDeg: BACKPEDAL_REVERSED_TRAVEL_DEG });
  });
  it('with the ball, in the air, and under a beat that keeps its own legs: no loop, so no turn', () => {
    const R = rigOf();
    R.tree.update({ ...slide, defending: false, hasBall: true }); R.tree.update({ ...slide, defending: false, hasBall: true });
    expect(R.steers[R.steers.length - 1].state).toBeNull();
    R.tree.update(slide); R.tree.update({ ...slide, airborne: true });
    expect(R.steers[R.steers.length - 1].state).toBeNull();
    const Q = rigOf();
    Q.tree.update(slide); Q.tree.beat('bball_contact_react'); Q.tree.update(slide);
    expect(Q.steers[Q.steers.length - 1].state).toBeNull();
    expect(Q.steers[Q.steers.length - 1].hold).toBe(true);   // …and the turn HOLDS under it (unwound, it dragged the planted foot: hipSteer)
    expect(R.steers[R.steers.length - 1].hold).toBe(false);   // in the air it is not held: off the floor the turn eases out
  });
  it('under a defensive beat: the legs layer\'s loop', () => {
    const R = rigOf();
    R.tree.update(slide); R.tree.beat('bball_steal_reach'); R.tree.update(slide); R.tree.update(slide);
    expect(R.steers[R.steers.length - 1].state).toBe('defend_slide');
  });
});
