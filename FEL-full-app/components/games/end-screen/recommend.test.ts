// END SCREEN — "Next: <mode>": the playlist, the story, the daily Signature attempt, then a mode not played today.
import { describe, it, expect } from 'vitest';
import { recommendNext, shelfOrderAfter, NOT_A_NUDGE } from './recommend';
import { carnivalStopHref, carnivalStopLabel, type CarnivalRunState } from '@/lib/carnival-run';
import { getNodeById, getZoneById } from '@/lib/story-data';
import { MODE_INFO } from '@/lib/game-data';
import { isUnlistedMode } from '@/lib/unlisted-modes';
import { FAMILIES, familyOf } from '@/lib/nav/families';

const T = new Date(2026, 9, 6, 20, 0).getTime();
const base = { mode: 'threePoint', playedToday: new Set(['threePoint']), signaturePlayedToday: true, nowMs: T };

describe('1. a playlist in progress', () => {
  it('the Court Carnival\'s next stop, by its own label and route', () => {
    const run = { lineup: ['carnival', 'soccer', 'golf'], index: 1, results: [] } as unknown as CarnivalRunState;
    const p = recommendNext({ ...base, carnivalRun: run })!;
    expect(p).toMatchObject({ kind: 'carnival', title: carnivalStopLabel('soccer' as never), href: carnivalStopHref('soccer' as never) });
    expect(p.reason).toContain('stop 2 of 3');
  });
  it('the last stop played: the night\'s results', () => {
    const run = { lineup: ['carnival', 'soccer'], index: 2, results: [] } as unknown as CarnivalRunState;
    expect(recommendNext({ ...base, carnivalRun: run })).toMatchObject({ kind: 'carnival-results', href: '/play/carnival/recap' });
  });
});

describe('2. the story', () => {
  const zone = getZoneById(getNodeById('golfGreen.r1')!.zoneId);
  it('a completed rail node: the next node on the rail, launched straight into its mode', () => {
    const p = recommendNext({ ...base, storyNodeId: zone.rail[0].id, storyCompleted: true })!;
    expect(p).toMatchObject({ kind: 'story-node', title: zone.rail[1].title, href: `/play/${zone.rail[1].mode}?story=${encodeURIComponent(zone.rail[1].id)}` });
  });
  it('the third rail node: the boss is next', () => {
    const p = recommendNext({ ...base, storyNodeId: zone.rail[2].id, storyCompleted: true })!;
    expect(p.title).toBe(zone.boss.title);
    expect(p.reason).toContain('boss');
  });
  it('the boss fell: the map (a new zone may be open); a node that did not complete: the map, never the next node', () => {
    expect(recommendNext({ ...base, storyNodeId: zone.boss.id, storyCompleted: true })).toMatchObject({ kind: 'story-map', href: '/story' });
    expect(recommendNext({ ...base, storyNodeId: zone.rail[0].id, storyCompleted: false })).toMatchObject({ kind: 'story-map', href: '/story' });
  });
});

describe('3. the daily Signature attempt', () => {
  it('offered when this device has not played one today, and this run was not one', () => {
    const p = recommendNext({ ...base, signaturePlayedToday: false })!;
    expect(p).toMatchObject({ kind: 'signature', href: '/signature' });
    expect(p.modeKey).not.toBe('threePoint');   // not the mode just played
    expect(p.detail).toMatch(/beat \d+/);
  });
  it('not offered after a Signature run, or once played today', () => {
    expect(recommendNext({ ...base, signaturePlayedToday: false, signatureRun: true })!.kind).not.toBe('signature');
    expect(recommendNext({ ...base, signaturePlayedToday: true })!.kind).not.toBe('signature');
  });
});

describe('4/5. the shelf', () => {
  it('a mode not played today, from this mode\'s own shelf first', () => {
    const p = recommendNext(base)!;
    expect(p.kind).toBe('fresh');
    expect(familyOf(p.modeKey!)?.id).toBe('hoops');
    expect(p.href).toBe(MODE_INFO[p.modeKey!].href);
  });
  it('skips what was played today, then moves to the next shelf', () => {
    const hoops = FAMILIES.find((f) => f.id === 'hoops')!.modes;
    const p = recommendNext({ ...base, playedToday: new Set(hoops) })!;
    expect(p.kind).toBe('fresh');
    expect(familyOf(p.modeKey!)?.id).not.toBe('hoops');
  });
  it('everything played today: still a next mode, said as "up next"', () => {
    const all = new Set(FAMILIES.flatMap((f) => f.modes));
    const p = recommendNext({ ...base, playedToday: all })!;
    expect(p.kind).toBe('shelf');
    expect(p.modeKey).not.toBe('threePoint');
  });
  it('never offers the mode just played, a parked mode, an off-shelf surface or a camera room', () => {
    for (const mode of Object.keys(MODE_INFO)) {
      for (const m of shelfOrderAfter(mode)) {
        expect(m).not.toBe(mode);
        expect(isUnlistedMode(m)).toBe(false);
        expect(NOT_A_NUDGE.has(m)).toBe(false);
        expect(familyOf(m)).not.toBeNull();
      }
    }
  });
});
