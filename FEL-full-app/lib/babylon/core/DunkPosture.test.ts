// DUNK-POSTURE (2026-09-08): the Posture Poses table, the window resolver and the chest-aim math — pure logic the dunk mode
// writes onto the rig after the clips and the spin layer evaluate.
import { describe, it, expect } from 'vitest';
import { POSTURE, TRICK_POSTURE, postureWindow, posturePose, chestAimCorrection, hipYawStrip, easePose, lowPassK, CHEST_AIM_CAP, type PostureInput } from './DunkPosture';
import { DUNK_TRICKS, CUE_BEAT_T, SPIN_RESOLVE_T } from './DunkSystem';
import { EASTBAY_TIMING as T } from '../anim/authored/timing';

const base: PostureInput = { phase: 'cinematic', clipTime: 0, made: null, clipped: false, landed: false, celebrate: false, trick: null };
const at = (o: Partial<PostureInput>): PostureInput => ({ ...base, ...o });

describe('the stance table', () => {
  it('reads like a dunker: the hang is an extension (chest open), the jam and the brace a crunch, the runway keeps some of the loop', () => {
    expect(POSTURE.hang.spine2[0]).toBeLessThan(0);
    expect(POSTURE.rise.spine2[0]).toBeLessThan(0);
    expect(POSTURE.jam.spine2[0]).toBeGreaterThan(0);
    expect(POSTURE.brace.spine2[0]).toBeGreaterThan(POSTURE.jam.spine2[0]);
    expect(POSTURE.land.spine2[0]).toBeGreaterThan(0);
    expect(POSTURE.stance.weight).toBeLessThan(1); expect(POSTURE.load.weight).toBeLessThan(1);
    for (const w of ['plant', 'rise', 'hang', 'extend', 'jam', 'brace'] as const) expect(POSTURE[w].weight, w).toBe(1);
  });
  it('the chest aim is off on the runway (the root faces the run) and full by the extension / the jam; the hip yaw is stripped in the air only', () => {
    expect(POSTURE.stance.chestAim).toBe(0); expect(POSTURE.load.chestAim).toBe(0);
    expect(POSTURE.extend.chestAim).toBe(1); expect(POSTURE.jam.chestAim).toBe(1);
    expect(POSTURE.plant.chestAim).toBeLessThan(POSTURE.rise.chestAim); expect(POSTURE.rise.chestAim).toBeLessThan(POSTURE.hang.chestAim);
    expect(POSTURE.stance.hipYawKeep).toBe(1); expect(POSTURE.land.hipYawKeep).toBe(1);
    expect(POSTURE.hang.hipYawKeep).toBeLessThan(1); expect(POSTURE.extend.hipYawKeep).toBeLessThan(POSTURE.plant.hipYawKeep);
  });
  it('every air trick has a chest / shoulders / head of its own, and the scorpion is the chest-down NO-LOOK (eyes off the rim)', () => {
    for (const t of DUNK_TRICKS) expect(TRICK_POSTURE[t.id], t.id).toBeDefined();
    expect(TRICK_POSTURE.scorpion.spine1![0]).toBeGreaterThan(0);
    expect(TRICK_POSTURE.scorpion.head![0]).toBeGreaterThan(0);   // chin DOWN (DUNK MOTION phase 6: Kilganon watches the floor)
    expect(TRICK_POSTURE.scorpion.eyes).toBe(0);
    expect(TRICK_POSTURE.spin360.spine2![0]).toBeLessThan(0);   // tall through the turn
  });
});

describe('the window resolver on the flight clock', () => {
  it('runway: approach = stance, hold-run = load', () => {
    expect(postureWindow(at({ phase: 'approach' }))).toBe('stance');
    expect(postureWindow(at({ phase: 'charge' }))).toBe('load');
    expect(postureWindow(at({ phase: 'other' }))).toBe('stance');
  });
  it('flight: plant → rise at the rise beat → hang at the hang beat → extend at the carry-up', () => {
    expect(postureWindow(at({ clipTime: 0 }))).toBe('plant');
    expect(postureWindow(at({ clipTime: CUE_BEAT_T.rise - 0.01 }))).toBe('plant');
    expect(postureWindow(at({ clipTime: CUE_BEAT_T.rise }))).toBe('rise');
    expect(postureWindow(at({ clipTime: CUE_BEAT_T.hang }))).toBe('hang');
    expect(postureWindow(at({ clipTime: T.carryUp }))).toBe('extend');
    expect(SPIN_RESOLVE_T).toBe(T.carryUp);   // the 360 is rim-facing again exactly where the extend stance (aim 1) begins
    expect(postureWindow(at({ clipTime: T.extend }))).toBe('extend');
  });
  it('resolve: a make jams, a miss braces, a prop clip braces whatever the slam was, feet-down lands (or celebrates)', () => {
    expect(postureWindow(at({ phase: 'resolve', made: true }))).toBe('jam');
    expect(postureWindow(at({ phase: 'resolve', made: false }))).toBe('brace');
    expect(postureWindow(at({ phase: 'resolve', made: true, clipped: true }))).toBe('brace');
    expect(postureWindow(at({ phase: 'cinematic', clipTime: 0.5, clipped: true }))).toBe('brace');
    expect(postureWindow(at({ phase: 'other', landed: true }))).toBe('land');
    expect(postureWindow(at({ phase: 'other', landed: true, celebrate: true }))).toBe('celebrate');
    expect(postureWindow(at({ phase: 'resolve', made: true, landed: true }))).toBe('land');   // feet-down wins over the jam
  });
  it('a trick\'s chest rides the flight windows only while its body plays, never past the resolve', () => {
    const trick = { id: 'scorpion', t0: 0.7, sec: 0.7 };
    expect(posturePose(at({ clipTime: 0.6, trick })).trick).toBeNull();          // not fired yet
    const mid = posturePose(at({ clipTime: 0.9, trick }));
    expect(mid.trick).toBe('scorpion'); expect(mid.window).toBe('hang');
    expect(mid.pose.spine1).toEqual(TRICK_POSTURE.scorpion.spine1);
    expect(mid.pose.hipYawKeep).toBe(POSTURE.hang.hipYawKeep);                    // the window's fields the trick leaves alone
    expect(posturePose(at({ clipTime: 1.2, trick })).trick).toBe('scorpion');    // through the extend
    expect(posturePose(at({ clipTime: 1.45, trick })).trick).toBeNull();         // its body has ended
    expect(posturePose(at({ phase: 'resolve', made: true, clipTime: 1.2, trick })).trick).toBeNull();   // the jam owns the finish
    expect(posturePose(at({ clipTime: 0.9, trick: { id: 'nosuch', t0: 0.7, sec: 1 } })).trick).toBeNull();
  });
});

describe('the rim-locked chest aim', () => {
  it('turns the chest onto the rim by the root\'s error, in the frame\'s own yaw sense', () => {
    expect(chestAimCorrection(0, 0, 0.3, 1)).toBeCloseTo(0.3);
    expect(chestAimCorrection(0, 0, 0.3, -1)).toBeCloseTo(-0.3);
    expect(chestAimCorrection(0.3, 0, 0.3, 1)).toBeCloseTo(0);       // already there
  });
  it('subtracts the 360\'s turn: mid-turn the chest follows the hips, it does not fight back to the rim', () => {
    expect(chestAimCorrection(Math.PI, Math.PI, 0, 1)).toBeCloseTo(0);
    expect(chestAimCorrection(Math.PI - 0.2, Math.PI, 0, 1)).toBeCloseTo(0.2);
  });
  it('strips a clip\'s own hip twist off the chest (the mocap gather at −35°) and is capped at a hip–shoulder separation', () => {
    const twist = -35 * Math.PI / 180;
    expect(chestAimCorrection(twist, 0, 0, 1)).toBeCloseTo(-twist);
    expect(chestAimCorrection(-1.5, 0, 0, 1)).toBeCloseTo(CHEST_AIM_CAP);
    expect(chestAimCorrection(1.5, 0, 0, 1)).toBeCloseTo(-CHEST_AIM_CAP);
    expect(chestAimCorrection(0.1, 0, 3.0, 1)).toBeLessThanOrEqual(CHEST_AIM_CAP);
  });
  it('the hip-yaw strip keeps `keep` of the clip\'s yaw', () => {
    expect(hipYawStrip(0.5, 1)).toBe(-0);
    expect(hipYawStrip(0.5, 0)).toBeCloseTo(-0.5);
    expect(hipYawStrip(0.5, 0.4)).toBeCloseTo(-0.3);
    expect(hipYawStrip(0.5, 2)).toBeCloseTo(0);   // clamped
  });
  it('the ease is a movement, not a pop: a window change reaches its stance smoothly and the gain is frame-rate independent', () => {
    let p = POSTURE.stance;
    const k60 = lowPassK(1 / 60, 0.07), k30 = lowPassK(1 / 30, 0.07);
    expect(1 - (1 - k60) ** 2).toBeCloseTo(k30, 6);   // two 60 Hz steps = one 30 Hz step
    for (let i = 0; i < 3; i++) p = easePose(p, POSTURE.hang, k60);
    expect(p.spine2[0]).toBeGreaterThan(POSTURE.hang.spine2[0]); expect(p.spine2[0]).toBeLessThan(POSTURE.stance.spine2[0]);
    for (let i = 0; i < 60; i++) p = easePose(p, POSTURE.hang, k60);
    expect(p.spine2[0]).toBeCloseTo(POSTURE.hang.spine2[0], 1); expect(p.weight).toBeCloseTo(1, 2);
    expect(lowPassK(0, 0.07)).toBe(0);
  });
});
