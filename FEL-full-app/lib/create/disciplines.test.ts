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
  it('the live lines are the ones this branch wires: Story reads, signature moves, shared scene packs', () => {
    const live = ALL_GUIDES.flatMap((g) => g.showsUp.filter((s) => s.live).map((s) => `${g.id}: ${s.where}`));
    expect(live).toEqual([
      'sport: Signature moves on your athlete card',
      'scene: A Spot the Scene pack you can share as a link',
      'writing: Community reads on the Story page',
    ]);
  });
});
