// IRON-PARADISE-OUT (2026-10-03): Iron Paradise (mode id 'training') is parked — unlisted everywhere a player
// could reach it, with nothing deleted. These tests hold the parking: the central list, every filtered listing,
// the /play/training 307, the PRQ guard, and the story ladder skipping the gymDome zone while the zone after it
// still unlocks. The /train card render is held by lib/train-page-unlisted.test.tsx (it needs auth/db mocks).

import { describe, expect, it } from 'vitest';
import { UNLISTED_MODES, isUnlistedMode, isUnlistedPlayHref, playSlugOf } from './unlisted-modes';
import { MODE_INFO, listedModeEntries, listedModeKeys } from './game-data';
import { MODE_MENU_META, visibleModeEntries } from './mode-menu';
import { FAMILIES, OFF_SHELF, familyOf, shelvedModes } from './nav/families';
import { carouselOrder, isPlayableMode } from './onboarding/firstRun';
import { MODE_ATTRS, MODE_WEIGHTS, computePrqDelta } from './prq';
import { evaluateCampaign, isNodePlayable, visibleStoryZones } from './progression';

describe('the central list', () => {
  it("parks 'training' (Iron Paradise) and nothing else", () => {
    expect(UNLISTED_MODES).toEqual(['training']);
    expect(isUnlistedMode('training')).toBe(true);
    expect(isUnlistedMode('sprint')).toBe(false);
    expect(isUnlistedMode(null)).toBe(false);
    expect(isUnlistedMode(undefined)).toBe(false);
    expect(isUnlistedMode('')).toBe(false);
  });

  it('reads a /play href: /play/training is a parked mode route, other hrefs are not', () => {
    expect(playSlugOf('/play/training')).toBe('training');
    expect(isUnlistedPlayHref('/play/training')).toBe(true);
    expect(isUnlistedPlayHref('/play/sprint')).toBe(false);
    expect(isUnlistedPlayHref('/training')).toBe(false);   // the programming page is not the game
    expect(isUnlistedPlayHref('/kitchens')).toBe(false);
  });
});

describe('nothing is deleted — the rows stay, the listings drop them', () => {
  it('MODE_INFO keeps the Iron Paradise row (stored keys still resolve), but no listing offers it', () => {
    expect(MODE_INFO.training).toMatchObject({ name: 'Iron Paradise', venue: 'Muscle Beach Gym', href: '/play/training' });
    expect(listedModeKeys()).not.toContain('training');
    expect(listedModeEntries().some(([k]) => k === 'training')).toBe(false);
    // a listed mode at the same venue is untouched
    expect(listedModeKeys()).toContain('sprint');
  });

  it('the mode menu keeps the tile copy but never lists the tile', () => {
    expect(MODE_MENU_META.training?.desc).toContain('Iron Paradise');
    expect(visibleModeEntries().some(([k]) => k === 'training')).toBe(false);
  });

  it('the family shelf cannot carry a parked mode', () => {
    expect(shelvedModes()).not.toContain('training');
    expect(familyOf('training')).toBeNull();
    expect(OFF_SHELF.training).toBeTruthy();   // the stated reason stays, so the placement audit still passes
    for (const f of FAMILIES) expect(f.modes).not.toContain('training');
  });

  it('the first-run carousel and the first-game resolver never offer or land on it', () => {
    expect(carouselOrder()).not.toContain('training');
    expect(isPlayableMode('training')).toBe(false);
    expect(carouselOrder()).toContain('dunkContest');   // the shelf itself is intact
  });

  it('the PRQ rows stay but pay nothing new (payout math for every listed mode is untouched)', () => {
    expect(MODE_WEIGHTS.training).toBe(1.0);
    expect(MODE_ATTRS.training).toEqual(['strength', 'endurance']);
    expect(computePrqDelta({ mode: 'training', score: 300, won: true, duration: 90 })).toBe(0);
    // control: a listed mode computes exactly what it did
    expect(computePrqDelta({ mode: 'brainBrawl', score: 240, won: true, duration: 120 })).toBe(0.96);
  });
});

describe('/play/training is a temporary (307) redirect to /train', () => {
  const digest = (fn: () => unknown): string => {
    try { fn(); } catch (e) { return String((e as { digest?: string }).digest ?? e); }
    return 'no redirect';
  };

  it('the page redirects, temporarily, to /train', async () => {
    const { default: TrainingPage } = await import('@/app/play/training/page');
    const d = digest(() => TrainingPage());
    expect(d).toMatch(/^NEXT_REDIRECT;replace;\/train;307;/);
  });

  it('the game and its loader survive untouched on disk', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(existsSync(join(process.cwd(), 'components/games/training-game.tsx'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'app/play/training/_components/loader.tsx'))).toBe(true);
  });
});

describe('the story ladder skips the parked gymDome zone and still progresses past it', () => {
  const input = { completedNodeIds: new Set<string>(), prqOverall: 0, lessonsCompleted: 0 };

  it('gymDome stays authored in story-data but is hidden from the ladder', async () => {
    const { getZoneById } = await import('./story-data');
    expect(getZoneById('gymDome').mode).toBe('training');        // nothing deleted
    expect(visibleStoryZones().some((z) => z.id === 'gymDome')).toBe(false);
    expect(visibleStoryZones().length).toBe(12);                  // 13 authored, one parked
    const status = evaluateCampaign(input);
    expect(status.zones.some((z) => z.id === 'gymDome')).toBe(false);
    expect(status.totalNodes).toBe(48);                           // 52 authored minus gymDome's 4
  });

  it('a gymDome node is not playable and is never the recommendation', () => {
    expect(isNodePlayable('gymDome.r1', input)).toEqual({ playable: false, reason: 'locked' });
    expect(evaluateCampaign(input).nextRecommendedNodeId).toBe('blacktop.r1');
  });

  it('the next zone still unlocks: labHub treats the skipped gymDome requirement as satisfied', () => {
    // tennis (the zone before gymDome) fully cleared, PRQ at labHub's gate — gymDome itself untouched
    const cleared = new Set(['tennis.r1', 'tennis.r2', 'tennis.r3', 'tennis.boss']);
    const status = evaluateCampaign({ completedNodeIds: cleared, prqOverall: 75, lessonsCompleted: 0 });
    const labHub = status.zones.find((z) => z.id === 'labHub')!;
    expect(labHub.unlocked).toBe(true);
    expect(labHub.lockReasons).toEqual([]);
    expect(labHub.unlockLabel).not.toContain('Gym Dome');
    expect(labHub.unlockLabel).toContain('PRQ 75+');
  });

  it('a PRQ under the gate still locks labHub — only the parked-zone requirement is skipped', () => {
    const cleared = new Set(['tennis.r1', 'tennis.r2', 'tennis.r3', 'tennis.boss']);
    const status = evaluateCampaign({ completedNodeIds: cleared, prqOverall: 74, lessonsCompleted: 0 });
    const labHub = status.zones.find((z) => z.id === 'labHub')!;
    expect(labHub.unlocked).toBe(false);
    expect(labHub.lockReasons).toEqual(['prq-gate']);
  });

  it('completion counts the visible ladder, so the parked zone is not a permanent missing slice', () => {
    const everything = new Set<string>();
    for (const z of visibleStoryZones()) {
      for (const n of [...z.rail, z.boss]) everything.add(n.id);
    }
    const status = evaluateCampaign({ completedNodeIds: everything, prqOverall: 100, lessonsCompleted: 99 });
    expect(status.completedNodes).toBe(status.totalNodes);
    expect(status.completionPct).toBe(100);
  });
});
