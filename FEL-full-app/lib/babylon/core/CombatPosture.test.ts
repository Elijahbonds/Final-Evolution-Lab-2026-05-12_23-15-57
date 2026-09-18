import { describe, expect, it } from 'vitest';
import { combatWindow, combatPose, COMBAT_POSTURE, COMBAT_LEGS, COMBAT_INPUT_IDLE, combatApproach, type CombatPostureInput } from './CombatPosture';

const I = (o: Partial<CombatPostureInput> = {}): CombatPostureInput => ({ ...COMBAT_INPUT_IDLE, engaged: true, ...o });

describe('CombatPosture — the window resolver', () => {
  it('an engaged fighter standing still is in the GUARD, not the idle', () => {
    expect(combatWindow(I())).toBe('guard');
    expect(combatWindow(I({ engaged: false }))).toBe('idle');
  });
  it('circling reads STRAFE, closing reads ADVANCE, giving ground reads RETREAT', () => {
    expect(combatWindow(I({ speed01: 0.8, strafe: 1 }))).toBe('strafe');
    expect(combatWindow(I({ speed01: 0.8, strafe: -1, approach: 1 }))).toBe('strafe');   // sideways wins: the feet are what decide
    expect(combatWindow(I({ speed01: 0.8, strafe: 0, approach: 1 }))).toBe('advance');
    expect(combatWindow(I({ speed01: 0.8, strafe: 0, approach: -1 }))).toBe('retreat');
  });
  it('the floor beats everything — a knocked-down or KO’d body is never re-posed', () => {
    for (const o of [{ down: true }, { out: true }] as Partial<CombatPostureInput>[]) {
      const w = combatWindow(I({ ...o, striking: 'heavy', blocking: true, speed01: 1, celebrating: true }));
      expect(w).toBe('floor');
      expect(COMBAT_POSTURE[w].weight).toBe(0);
      expect(COMBAT_LEGS[w].weight).toBe(0);
    }
  });
  it('a hit beats a swing (the strike is interrupted), and a finisher LAUNCHES', () => {
    expect(combatWindow(I({ striking: 'light', hitBy: 'medium' }))).toBe('react');
    expect(combatWindow(I({ hitBy: 'finisher' }))).toBe('launch');
  });
  it('the priority order: rising → hit → dodge → guard impact → parry → strike → windup → block', () => {
    expect(combatWindow(I({ rising: true, hitBy: 'light' }))).toBe('get_up');
    expect(combatWindow(I({ hitBy: 'light', dodging: true }))).toBe('react');
    expect(combatWindow(I({ dodging: true, guardImpact: true }))).toBe('dodge');
    expect(combatWindow(I({ guardImpact: true, parrying: true }))).toBe('guard_impact');
    expect(combatWindow(I({ parrying: true, striking: 'light' }))).toBe('parry');
    expect(combatWindow(I({ striking: 'finisher', windingUp: true }))).toBe('strike_finisher');
    expect(combatWindow(I({ windingUp: true, blocking: true }))).toBe('windup');
    expect(combatWindow(I({ blocking: true, speed01: 1 }))).toBe('block');
  });
});

describe('CombatPosture — the stances themselves', () => {
  it('the guard and the strafe put the chest ON him and the eyes on him', () => {
    for (const w of ['guard', 'strafe', 'advance'] as const) {
      expect(COMBAT_POSTURE[w].chestAim).toBeGreaterThanOrEqual(0.9);
      expect(COMBAT_POSTURE[w].eyes).toBe(1);
    }
  });
  it('a strike does NOT square the chest — the clip’s own rotation throws the punch', () => {
    for (const w of ['strike_light', 'strike_medium', 'strike_heavy', 'strike_finisher'] as const) {
      expect(COMBAT_POSTURE[w].chestAim).toBeLessThanOrEqual(0.45);
      expect(COMBAT_POSTURE[w].hipYawKeep).toBe(1);   // the hips ARE the strike: nothing is stripped
    }
  });
  it('taking one breaks the chest away and drops the eyes', () => {
    expect(COMBAT_POSTURE.react.chestAim).toBe(0);
    expect(COMBAT_POSTURE.react.eyes).toBe(0);
    expect(COMBAT_POSTURE.react.spine1[0]).toBeGreaterThan(0);   // folding forward, not standing up
  });
  it('the slip keeps the eyes on him (the bullet-time read)', () => {
    expect(COMBAT_POSTURE.dodge.eyes).toBe(1);
  });
  it('every window has a stance and a leg pose, and every weight is in 0..1', () => {
    const windows = Object.keys(COMBAT_POSTURE) as (keyof typeof COMBAT_POSTURE)[];
    for (const w of windows) {
      expect(COMBAT_LEGS[w]).toBeDefined();
      expect(COMBAT_POSTURE[w].weight).toBeGreaterThanOrEqual(0);
      expect(COMBAT_POSTURE[w].weight).toBeLessThanOrEqual(1);
      expect(COMBAT_LEGS[w].weight).toBeGreaterThanOrEqual(0);
      expect(COMBAT_LEGS[w].weight).toBeLessThanOrEqual(1);
      expect(COMBAT_POSTURE[w].chestAim).toBeLessThanOrEqual(1);
    }
    expect(combatPose(I()).pose).toBe(COMBAT_POSTURE.guard);
    expect(combatPose(I()).legs).toBe(COMBAT_LEGS.guard);
  });
  it('combatApproach reads a closing speed with a dead band', () => {
    expect(combatApproach(1.2)).toBe(1);
    expect(combatApproach(-1.2)).toBe(-1);
    expect(combatApproach(0.2)).toBe(0);
  });
});
