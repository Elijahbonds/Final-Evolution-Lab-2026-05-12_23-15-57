// PIPELINES (owner, 2026-10-06): approved music cards with a chart are Dance songs, approved dance cards are routines,
// the equipped routine is MY ROUTINE — credited on the pick banner, and the shipped list untouched without them.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MY_ROUTINE_ID, closestSong, communityCreditLine, communityDanceSong, communityDanceTracks, communityStepsFor, loopRoutine,
  setCommunityDance,
} from './communityDance';
import { DANCE_TRACKS, allTracks, pickBanner, stepsFor, trackById } from '../core/danceTracks';
import type { DanceSongEntry, RoutineEntry } from '@/lib/pipelines/community';
import { setEquippedRoutine } from '@/lib/modes/dance/active-routine';

const chart = Array.from({ length: 6 }, (_, i) => ({ clipId: 'dance_wave_arm', beat: i * 2, holdBeats: 1, mirrored: false }));
const song: DanceSongEntry = {
  id: 'card:s1', cardId: 's1', title: 'Night Moves', creator: { name: 'ADA', href: '/card/ada' }, url: 'https://x/m.mp3', mime: 'audio/mpeg',
  durationSec: 60, gainDb: -2, bpm: 104, bars: 26, chart: [...chart, { clipId: 'dance_not_a_clip', beat: 20, holdBeats: 1, mirrored: false }],
};
const routine: RoutineEntry = {
  cardId: 'r1', title: 'Wave Combo', creator: { name: 'BEA', href: null }, bpm: 97,
  steps: [{ clipId: 'dance_toprock_basic', beat: 0, holdBeats: 2, mirrored: false }, { clipId: 'dance_wave_arm', beat: 2, holdBeats: 2, mirrored: true }],
};

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
  };
});
afterEach(() => { setCommunityDance([], []); delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('the pick screen', () => {
  it('without community cards (or an equipped routine) it is exactly the shipped list', () => {
    setCommunityDance([], []);
    expect(allTracks()).toBe(DANCE_TRACKS);
  });
  it('community songs and routines follow the shipped songs, credited on the banner', () => {
    setCommunityDance([song], [routine]);
    const ids = allTracks().map((t) => t.id);
    expect(ids.slice(0, DANCE_TRACKS.length)).toEqual(DANCE_TRACKS.map((t) => t.id));
    expect(ids.slice(DANCE_TRACKS.length)).toEqual(['card:s1', 'routine:r1']);
    expect(pickBanner(trackById('card:s1'))).toMatch(/NIGHT MOVES.*104 BPM.*by ADA$/);
    expect(pickBanner(trackById('routine:r1'))).toMatch(/by BEA$/);
    expect(pickBanner(trackById('cypher'))).not.toMatch(/by /);
  });
  it('a community song dances its OWN chart (unknown clips dropped) and is the song DanceMode bands', () => {
    setCommunityDance([song], []);
    const steps = stepsFor(trackById('card:s1'))!;
    expect(steps).toHaveLength(6);
    expect(steps.every((s) => s.clipId === 'dance_wave_arm')).toBe(true);
    expect(communityDanceSong('card:s1')?.url).toBe('https://x/m.mp3');
    expect(communityDanceSong('cypher')).toBe(null);
  });
  it('a routine is perf.setRoutine(card.sequence), looped bar by bar over the nearest house song', () => {
    setCommunityDance([], [routine]);
    const t = trackById('routine:r1');
    expect(t.song?.id).toBe(closestSong(97).id);
    const steps = stepsFor(t)!;
    expect(steps.slice(0, 2)).toEqual(routine.steps);
    expect(steps[2]).toEqual({ ...routine.steps[0], beat: 4 });
    expect(steps.every((s) => s.beat < t.bars * 4)).toBe(true);
  });
  it('the equipped routine is MY ROUTINE; the default celebration is not', () => {
    setCommunityDance([], []);
    expect(communityDanceTracks().map((t) => t.id)).toEqual([]);
    setEquippedRoutine({ steps: routine.steps, bpm: 120 });
    expect(allTracks().map((t) => t.id)).toContain(MY_ROUTINE_ID);
    expect(stepsFor(trackById(MY_ROUTINE_ID))?.[1]).toEqual(routine.steps[1]);
    expect(communityCreditLine(MY_ROUTINE_ID)).toMatch(/your routine/);
  });
  it('a shipped track is untouched by the hooks', () => {
    setCommunityDance([song], [routine]);
    expect(communityStepsFor(trackById('cypher'))).toBe(null);
    expect(stepsFor(trackById('cypher'))!.length).toBeGreaterThan(10);
  });
});

describe('loopRoutine', () => {
  it('repeats on bar boundaries and stops at the song\'s end', () => {
    const l = loopRoutine([{ clipId: 'dance_trans_spin', beat: 1, holdBeats: 1, mirrored: false }], 12);
    expect(l.map((s) => s.beat)).toEqual([0, 4, 8]);
    expect(loopRoutine([{ clipId: 'dance_nope', beat: 0, holdBeats: 1, mirrored: false }], 16)).toEqual([]);
  });
});
