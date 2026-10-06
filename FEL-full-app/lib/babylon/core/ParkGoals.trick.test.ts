// IMPROVE (2026-10-06, skate item 16) — goals for the new verbs, keyed on the plaza's REAL feature labels.
import { describe, expect, it } from 'vitest';
import { GoalTracker, SKATE_GOALS, trickMatches } from './ParkGoals';
import { plazaLips, plazaWalls } from '../modes/skatePlaza';
import { LIP_TRICKS } from './WallRide';
import { SKATE_VENUES } from '../nexus/boardVenues';

const trickGoals = SKATE_GOALS.filter((g) => g.kind === 'trick');
const plant = SKATE_GOALS.find((g) => g.id === 'trick_wallplant_street')!;
const blunt = SKATE_GOALS.find((g) => g.id === 'trick_blunt_pyramid')!;

describe('trick goals', () => {
  it('exist, and name tricks the mode actually reports', () => {
    expect(trickGoals.length).toBeGreaterThanOrEqual(2);
    expect(blunt.trickId).toBe(LIP_TRICKS.right.id);
    expect(plant.trickId).toBe('wallplant');
  });

  it.each(SKATE_VENUES.map((v) => [v.id, v.bound] as const))('on %s every trick goal names a feature that exists', (_id, bound) => {
    const labels = [...plazaWalls(bound).map((w) => w.label), ...plazaLips(bound).map((l) => l.label)];
    for (const g of trickGoals) {
      const wheres = typeof g.where === 'string' ? [g.where] : g.where ?? [];
      for (const w of wheres) expect(labels.some((l) => l.startsWith(w)), `${g.id}: ${w}`).toBe(true);
    }
  });

  it('WALLPLANT THE STREET WALL takes the street wall\'s two faces and not the big wall on the fence', () => {
    const walls = plazaWalls(56);
    const street = walls.filter((w) => /wallride \((north|south) face\)/.test(w.label));
    expect(street.length).toBe(2);
    for (const w of street) expect(trickMatches(plant, { trickId: 'wallplant', where: w.label }), w.label).toBe(true);
    expect(trickMatches(plant, { trickId: 'wallplant', where: 'the wallride' })).toBe(false);          // the leaned one
    expect(trickMatches(plant, { trickId: 'wallplant', where: 'the north fence' })).toBe(false);
    expect(trickMatches(plant, { trickId: 'wallride', where: street[0].label })).toBe(false);          // a ride is not a plant
  });

  it('BLUNT TO FAKIE ON THE PYRAMID falls to a blunt on any ridge of it, and nothing else', () => {
    const t = new GoalTracker(SKATE_GOALS);
    expect(t.report({ type: 'trick', trickId: 'rock_fakie', where: 'the pyramid (up the south bank)' })).toEqual([]);
    expect(t.report({ type: 'trick', trickId: 'blunt_fakie', where: 'the spine (north bank)' })).toEqual([]);
    const pyramidLips = plazaLips(56).filter((l) => l.label.startsWith('the pyramid'));
    expect(pyramidLips.length).toBe(4);
    expect(t.report({ type: 'trick', trickId: 'blunt_fakie', where: pyramidLips[2].label }).map((g) => g.id)).toEqual(['trick_blunt_pyramid']);
    expect(t.report({ type: 'trick', trickId: 'blunt_fakie', where: pyramidLips[0].label })).toEqual([]);   // done once
  });

  it('a trick event never ticks another kind of goal', () => {
    const t = new GoalTracker(SKATE_GOALS);
    t.report({ type: 'trick', trickId: 'wallplant', where: 'the wallride (north face)' });
    expect(t.goals.filter((g) => g.done).map((g) => g.id)).toEqual(['trick_wallplant_street']);
  });
});
