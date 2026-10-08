// CREATE HUB: every tile says where the work shows up, music leads, and nothing claims a consumer that is not wired.
import { describe, expect, it } from 'vitest';
import { ALL_GUIDES, HUB_ORDER, guideFor } from './disciplines';
import { DISCIPLINES } from '@/lib/creator/creative-card-types';

describe('the Create tiles', () => {
  it('all nine disciplines, once each, music first', () => {
    expect([...HUB_ORDER].sort()).toEqual([...DISCIPLINES].sort());
    expect(HUB_ORDER[0]).toBe('music');
    expect(ALL_GUIDES.map((g) => g.id)).toEqual([...HUB_ORDER]);
  });
  it('every tile has a make line and at least one place it shows up', () => {
    for (const g of ALL_GUIDES) {
      expect(g.make.length).toBeGreaterThan(10);
      expect(g.showsUp.length).toBeGreaterThan(0);
      expect(g.label).toBe(guideFor(g.id).label);
    }
  });
  // test changed (lane/pipelines, 2026-10-06): each consumer lane/pipelines wires flips its line to live here, because
  // "nothing claims a consumer that is not wired" is exactly what this pins.
  it('the live lines are the ones this branch wires', () => {
    const live = ALL_GUIDES.flatMap((g) => g.showsUp.filter((s) => s.live).map((s) => `${g.id}: ${s.where}`));
    expect(live).toEqual([
      'music: The Dance floor, with its chart',
      'sport: Signature moves on your athlete card',
      'art: Board decks in board runs (Apply from My Creations)',
      'art: Centre court on the hoops courts',
      'dance: The Dance floor routine pick',
      'acting: MC callouts at the moment you picked',
      'scene: A Spot the Scene pack you can share as a link',
      'scene: The pack picker in Spot the Scene, credited',
      'cooking: Community recipes on the Fuel floor',
      'writing: Community reads on the Story page',
    ]);
  });
});
