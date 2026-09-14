// A TRAIT STEPPED DOWN OFF ITS FIRST TIER IS UNEQUIPPED, NOT TIER −1 (2026-09-14).
//
// The generic editor renders three kinds of row through one component, so the per-kind edge cases have to
// live somewhere testable rather than inside a React handler. These are those edge cases: the trait ladder
// bottoming out into "unequipped", the rated stepper refusing to walk past a PRQ ceiling, and the slot
// cycle holding at its ends instead of wrapping (a slot that wraps means holding ▶ silently returns you to
// NONE, which is how a player loses their jump shot without noticing).

import { describe, it, expect } from 'vitest';
import { step, canStep, displayValue, rowCeiling } from './rowState';
import type { RatedRow, TraitRow, SlotRow } from '../schema/types';

const rated: RatedRow = { kind: 'rated', id: 'speed', label: 'Speed', section: 'attributes', tab: 'Athleticism', min: 0, max: 99, prqAxis: 'speed', glossary: 'x' };
const skill: RatedRow = { ...rated, id: 'threePoint', prqAxis: null };
const trait: TraitRow = { kind: 'trait', id: 't', label: 'T', section: 'traits', tab: 'Defense', tiers: ['BRONZE', 'SILVER', 'GOLD'], cost: [1, 3, 6], requires: null, tierText: ['a', 'b', 'c'], hook: 'h', glossary: 'x' };
const slot: SlotRow = { kind: 'slot', id: 's', label: 'S', section: 'mechanics', tab: 'Jump Shot', options: ['Coil', 'Whip'], allowNone: true, requires: null, glossary: 'x' };

describe('rowState — rated rows', () => {
  it('steps within the range and stops at the PRQ ceiling', () => {
    const axes = { speed: 40 };
    const cap = rowCeiling(rated, axes)!;
    let v = 0;
    for (let i = 0; i < 300; i++) v = step(rated, v, 1, axes) as number;
    expect(v).toBe(cap);
    expect(canStep(rated, cap, 1, axes)).toBe(false);
  });

  it('never steps below the minimum', () => {
    let v = 0;
    for (let i = 0; i < 10; i++) v = step(rated, v, -1, null) as number;
    expect(v).toBe(rated.min);
  });

  it('lets a skill row reach the maximum whatever the body measured', () => {
    let v = 0;
    for (let i = 0; i < 300; i++) v = step(skill, v, 1, { speed: 1 }) as number;
    expect(v).toBe(99);
    expect(rowCeiling(skill, { speed: 1 })).toBe(99);
  });

  it('recovers from a missing or nonsense value instead of producing NaN', () => {
    expect(step(rated, undefined as never, 1, null)).toBe(1);
    expect(step(rated, NaN, 1, null)).toBe(1);
    expect(displayValue(rated, NaN)).toBe('0');
  });
});

describe('rowState — traits', () => {
  // THE CASE THE FILE EXISTS FOR.
  it('unequips when stepped down off the first tier, rather than going to −1', () => {
    expect(step(trait, 0, -1, null)).toBeNull();
    expect(displayValue(trait, null)).toBe('UNEQUIPPED');
  });

  it('climbs the ladder and holds at the top', () => {
    expect(step(trait, null, 1, null)).toBe(0);
    expect(step(trait, 0, 1, null)).toBe(1);
    expect(step(trait, 2, 1, null)).toBe(2);
    expect(canStep(trait, 2, 1, null)).toBe(false);
  });

  it('names the tier it is on', () => {
    expect(displayValue(trait, 0)).toBe('BRONZE');
    expect(displayValue(trait, 2)).toBe('GOLD');
    expect(displayValue(trait, 9)).toBe('UNEQUIPPED');   // out of range reads as off, never as a crash
  });
});

describe('rowState — slots', () => {
  // A slot that wraps means holding ▶ silently returns you to NONE.
  it('holds at both ends instead of wrapping', () => {
    expect(step(slot, null, -1, null)).toBeNull();
    let v = step(slot, null, 1, null);
    v = step(slot, v, 1, null);
    expect(v).toBe('Whip');
    expect(step(slot, v, 1, null)).toBe('Whip');
  });

  it('offers NONE only when the slot allows it', () => {
    const required: SlotRow = { ...slot, allowNone: false };
    expect(step(required, 'Coil', -1, null)).toBe('Coil');   // cannot step off into nothing
    expect(displayValue(required, null)).toBe('NONE');       // but an absent value still reads
  });

  it('starts from the first option when the current value is unknown', () => {
    expect(step(slot, 'NotAnOption' as string, 1, null)).toBe('Coil');
  });
});
