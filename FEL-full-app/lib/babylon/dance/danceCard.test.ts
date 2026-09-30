// MUSIC-SUITE P9 (2026-09-29), dance cards playable — a published dance card as a Cypher track (dance/danceCard.ts): parsed,
// press steps only, looped to a real run, its own tempo, on the pick list after the songs, free play only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DancePerformance, isBodyStep, accuracyOf } from '../core/DanceCore';
import {
  cardBpm, cardIdFromQuery, cardPlayFrom, cardRoutine, cardTrack, CARD_BPM_DEFAULT, CARD_MAX_STEPS, CARD_MIN_BARS,
  DANCE_CARD_PLAY_KEY, isCardTrackId, loopCardRoutine, readCardTrack, writeCardPlay,
} from './danceCard';
import { allTracks, cycleTrack, DANCE_TRACKS, stepsFor } from '../core/danceTracks';
import { houseSongSteps, houseSongFor } from './houseSong';
import { validateArtPayload } from '@/lib/creator/creative-card-types';

/** What the builder publishes (components/creator/modes/dance-mode.tsx): steps back to back, each its clip's length. */
const BUILT = [
  { clipId: 'dance_toprock_basic', beat: 0, holdBeats: 4, mirrored: false },
  { clipId: 'dance_pop_moonwalk', beat: 4, holdBeats: 4, mirrored: true },
  { clipId: 'dance_freeze_side', beat: 8, holdBeats: 4, mirrored: false },
];

function stubStorage(): Map<string, string> {
  const m = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } });
  return m;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('a card\'s routine is parsed, never trusted', () => {
  it('press steps only: known moves, the move\'s own length, mirrored as a boolean, nothing else rides in', () => {
    const r = cardRoutine([{ ...BUILT[0], move: 'jump', holdSec: 9, pressHoldBeats: 3, pressFree: true, holdBeats: 99, mirrored: 'yes' }, BUILT[1]])!;
    expect(r).toEqual([
      { clipId: 'dance_toprock_basic', beat: 0, holdBeats: 4, mirrored: false },
      { clipId: 'dance_pop_moonwalk', beat: 4, holdBeats: 4, mirrored: true },
    ]);
    for (const s of r) expect(isBodyStep(s)).toBe(false);
  });
  it('drops unknown moves, bad beats and a second move on the same beat; sorts; starts the routine on beat 0', () => {
    const r = cardRoutine([
      { clipId: 'dance_pop_robot', beat: 10, holdBeats: 4, mirrored: false },
      { clipId: 'dance_pop_locking', beat: 12 }, { clipId: 'dance_trans_spin', beat: NaN }, { clipId: 'dance_trans_spin', beat: -2 },
      { clipId: 'dance_trans_spin', beat: 6 }, { clipId: 'dance_wave_arm', beat: 6 }, null, 'x', { beat: 3 },
    ])!;
    expect(r.map((s) => [s.clipId, s.beat])).toEqual([['dance_trans_spin', 0], ['dance_pop_robot', 4]]);
    expect(cardRoutine([{ clipId: 'nope', beat: 0 }])).toBeNull();
    expect(cardRoutine('nope')).toBeNull();
    expect(cardRoutine([])).toBeNull();
  });
});

describe('the routine becomes a run', () => {
  it('repeats on bar lines until it covers CARD_MIN_BARS bars', () => {
    const { steps, bars } = loopCardRoutine(cardRoutine(BUILT)!);
    // one pass is 3 bars (the side freeze starts on beat 8 and is 4 beats long), so 6 passes: 18 bars, never under 16
    expect(bars).toBe(18);
    expect(bars).toBeGreaterThanOrEqual(CARD_MIN_BARS);
    expect(steps).toHaveLength(18);
    expect(steps[3]).toMatchObject({ clipId: 'dance_toprock_basic', beat: 12 });
    for (let i = 1; i < steps.length; i++) expect(steps[i].beat).toBeGreaterThan(steps[i - 1].beat);
  });
  it('never more than CARD_MAX_STEPS steps', () => {
    const long = Array.from({ length: 64 }, (_, i) => ({ clipId: 'dance_trans_spin', beat: i * 2, holdBeats: 2, mirrored: false }));
    expect(loopCardRoutine(cardRoutine(long)!).steps.length).toBeLessThanOrEqual(CARD_MAX_STEPS);
  });
  it('a card track: its id, its own tempo in the builder\'s range, a chart a perfect player clears at 100 %', () => {
    const got = cardTrack({ id: 'c1', title: 'Friday Night Routine', bpm: 104, sequence: BUILT })!;
    expect(got.track).toMatchObject({ id: 'card:c1', name: 'FRIDAY NIGHT ROUTINE', bpm: 104, difficulty: 3 });
    expect(got.track.song).toBeUndefined();              // no song: the FEL synth band plays under it, free play
    expect(isCardTrackId(got.track.id)).toBe(true);
    const p = new DancePerformance(got.track.bpm);
    p.setRoutine(got.steps); p.start(1);
    const spb = 60 / got.track.bpm;
    for (const s of got.steps) { const t = 1 + s.beat * spb; p.update(t); p.hit(t); }
    p.update(1 + (got.steps[got.steps.length - 1].beat + 8) * spb);
    expect(accuracyOf(p.result().counts)).toBe(1);
    expect(cardBpm(undefined)).toBe(CARD_BPM_DEFAULT);
    expect(cardBpm(400)).toBe(CARD_BPM_DEFAULT);
    expect(cardBpm(88.4)).toBe(88);
  });
});

describe('on the device and in the room', () => {
  it('DANCE IT puts the card on the device; the pick list gains it LAST; stepsFor plays it; the songs are untouched', () => {
    const store = stubStorage();
    expect(allTracks()).toBe(DANCE_TRACKS);
    const play = cardPlayFrom({ id: 'c9', title: 'Mine', art: { kind: 'dance', sequence: BUILT, bpm: 90 } })!;
    expect(writeCardPlay(play)).toBe(true);
    expect(JSON.parse(store.get(DANCE_CARD_PLAY_KEY)!)).toMatchObject({ id: 'c9', bpm: 90 });
    const all = allTracks();
    expect(all.slice(0, DANCE_TRACKS.length)).toEqual([...DANCE_TRACKS]);
    expect(all[all.length - 1]).toMatchObject({ id: 'card:c9', bpm: 90 });
    expect(stepsFor(all[all.length - 1])).toEqual(readCardTrack()!.steps);
    expect(cycleTrack(DANCE_TRACKS[DANCE_TRACKS.length - 1].id, 1).id).toBe('card:c9');
    for (const t of DANCE_TRACKS) expect(stepsFor(t)?.some((s) => isCardTrackId(s.clipId))).toBe(false);
  });
  it('a broken slot is no card (the pick list is as it was)', () => {
    const store = stubStorage();
    store.set(DANCE_CARD_PLAY_KEY, '{nope');
    expect(readCardTrack()).toBeNull();
    store.set(DANCE_CARD_PLAY_KEY, JSON.stringify({ id: 'x', title: 't', sequence: [{ clipId: 'nope', beat: 0 }] }));
    expect(readCardTrack()).toBeNull();
    expect(allTracks()).toBe(DANCE_TRACKS);
  });
  it('FREE PLAY ONLY: an Arena run dances its house song, never the card on the device', () => {
    stubStorage();
    writeCardPlay({ id: 'c9', title: 'Mine', bpm: 90, sequence: BUILT });
    const house = houseSongSteps(houseSongFor('match-1'));
    expect(house.some((s) => s.clipId === 'dance_pop_moonwalk' && s.beat === 4 && s.mirrored)).toBe(false);
    expect(house.length).toBeGreaterThan(40);
  });
  it('?card=<id> names the card track to focus', () => {
    expect(cardIdFromQuery('?card=abc%20d')).toBe('card:abc d');
    expect(cardIdFromQuery('?track=battle&card=z1')).toBe('card:z1');
    expect(cardIdFromQuery('?track=battle')).toBeNull();
    expect(cardIdFromQuery(null)).toBeNull();
  });
  it('a card only of dance kind plays', () => {
    expect(cardPlayFrom({ id: 'a', title: 't', art: { kind: 'art' } })).toBeNull();
    expect(cardPlayFrom({ id: 'a', title: 't', art: { kind: 'dance', sequence: BUILT } })!.bpm).toBe(CARD_BPM_DEFAULT);   // a card from before the BPM rode along
  });
});

describe('the card keeps its tempo from the builder (the publish path dropped it)', () => {
  it('the validator takes a dance card with or without a bpm, and refuses a nonsense one', () => {
    expect(validateArtPayload({ kind: 'dance', choreographyId: 'x', sequence: BUILT, bpm: 104 })).toEqual({ ok: true });
    expect(validateArtPayload({ kind: 'dance', choreographyId: 'x', sequence: BUILT })).toEqual({ ok: true });
    expect(validateArtPayload({ kind: 'dance', choreographyId: 'x', sequence: BUILT, bpm: 'fast' })).toEqual({ ok: false, error: 'dance: bpm 40–300' });
    expect(validateArtPayload({ kind: 'dance', choreographyId: 'x', sequence: BUILT, bpm: 900 })).toEqual({ ok: false, error: 'dance: bpm 40–300' });
    expect(validateArtPayload({ kind: 'dance', choreographyId: 'x', sequence: [] })).toEqual({ ok: false, error: 'dance: 1–64 steps' });
  });
});
