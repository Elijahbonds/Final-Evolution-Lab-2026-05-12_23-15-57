// DanceExport + MusicTiers — the Music Mode mission (2026-09-13).
//
// The export's whole claim is that the chart HITS WHAT YOU WROTE, so most of these are that claim stated in
// different ways: put a kick on the 1 and the dancer's weight lands on the 1. The rest guard the mission's
// hard constraints — determinism (a re-export must not be a different routine), no licensed content by
// construction, and no clock inside a pure module.

import { describe, it, expect } from 'vitest';
import {
  roleOf, grooveOf, density, difficultyFor, routineFromGroove, exportSongToDance, exportedTrackId, seedFrom,
  GRID_DANCE_BARS, danceSongAtTier, saveExportedTrack, readExportedTrack,
} from './DanceExport';
import { installFakeWebAudio } from './fakeWebAudio';
import { shownRowIds } from './MusicTiers';
import {
  TIERS, MUSIC_TIERS, NO_PROGRESS, tierFor, tierDef, unlocked, nextUnlock, isRealPattern, advance,
  CHAIN_AT_PATTERNS, STUDIO_AT_CHAIN, type MusicProgress,
} from './MusicTiers';
import type { TrackState } from './AudioEngine';

const STEPS = 16;
const track = (sampleId: string, on: number[], extra: Partial<TrackState> = {}): TrackState => ({
  sampleId, volume: 1, muted: false, pan: 0,
  pattern: Array.from({ length: STEPS }, (_, i) => on.includes(i)),
  ...extra,
});
/** A song of `n` identical bars built from one pattern set. */
const song = (tracks: TrackState[], bars = 1, id = 'test') => ({
  id, name: 'Test', bpm: 96, steps: STEPS,
  sections: [{ id: 's1', name: 'verse', tracks }],
  chain: [{ sectionId: 's1', bars }],
});

describe('a drum knows what it is', () => {
  it('reads the role off the sample id', () => {
    expect(roleOf('kick_808')).toBe('kick');
    expect(roleOf('BD_deep')).toBe('kick');
    expect(roleOf('snare_tight')).toBe('snare');
    expect(roleOf('clap')).toBe('snare');
    expect(roleOf('hat_closed')).toBe('hat');
    expect(roleOf('shaker')).toBe('hat');
  });

  it('an unrecognised sample is ORNAMENT, never a downbeat', () => {
    // the safe default: a chart that drops the dancer's weight on a sound nobody hears as a downbeat is
    // worse than one that treats it as decoration
    expect(roleOf('mystery_thing')).toBe('other');
    expect(roleOf('')).toBe('other');
  });
});

describe('THE CHART HITS WHAT YOU WROTE', () => {
  it('a kick on the 1 and the 3 puts hits on beats 0 and 2', () => {
    const hits = grooveOf([[track('kick', [0, 8])]], STEPS);
    expect(hits.map((h) => h.beat)).toEqual([0, 2]);
    expect(hits.every((h) => h.role === 'kick')).toBe(true);
  });

  it('a four-on-the-floor is four beats, in order', () => {
    const hits = grooveOf([[track('kick', [0, 4, 8, 12])]], STEPS);
    expect(hits.map((h) => h.beat)).toEqual([0, 1, 2, 3]);
  });

  it('hits stack: a kick and a clap together weigh more than either alone, and the KICK wins the role', () => {
    const hits = grooveOf([[track('kick', [0]), track('clap', [0])]], STEPS);
    expect(hits).toHaveLength(1);
    expect(hits[0].weight).toBe(2);
    expect(hits[0].role).toBe('kick');       // the chart follows the body, and the body follows the kick
  });

  it('a MUTED track is not danced to — it is a thing the player chose not to hear', () => {
    expect(grooveOf([[track('kick', [0, 4, 8, 12], { muted: true })]], STEPS)).toEqual([]);
    expect(grooveOf([[track('kick', [0], { volume: 0 })]], STEPS)).toEqual([]);
  });

  it('bar two is four beats after bar one', () => {
    const hits = grooveOf([[track('kick', [0])], [track('kick', [0])]], STEPS);
    expect(hits.map((h) => h.beat)).toEqual([0, 4]);
  });

  it('a sixteenth lands on a quarter beat, not a whole one', () => {
    expect(grooveOf([[track('hat', [1])]], STEPS)[0].beat).toBeCloseTo(0.25, 6);
  });
});

describe('the song decides its own difficulty', () => {
  it('four kicks is easy; every sixteenth is hard', () => {
    const sparse = grooveOf([[track('kick', [0, 4, 8, 12])]], STEPS);
    const dense = grooveOf([[track('hat', Array.from({ length: 16 }, (_, i) => i))]], STEPS);
    expect(difficultyFor(density(sparse, 4))).toBe(1);
    expect(difficultyFor(density(dense, 4))).toBe(3);
  });

  it('density is a fraction whatever the song does', () => {
    expect(density([], 4)).toBe(0);
    expect(density(grooveOf([[track('hat', Array.from({ length: 16 }, (_, i) => i))]], STEPS), 4)).toBeLessThanOrEqual(1);
    expect(density(grooveOf([[track('kick', [0])]], STEPS), 0)).toBe(0);   // no beats, no crash
  });
});

describe('a routine the body can actually perform', () => {
  it('NEVER starts a move before the last one finishes', () => {
    const hits = grooveOf([[track('kick', Array.from({ length: 16 }, (_, i) => i))]], STEPS);
    const steps = routineFromGroove(hits, 16, 3, 7);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].beat, 'a move started mid-move').toBeGreaterThanOrEqual(steps[i - 1].beat + steps[i - 1].holdBeats);
    }
  });

  it('never runs past the end of the song', () => {
    const hits = grooveOf([[track('kick', [0, 4, 8, 12])]], STEPS);
    const steps = routineFromGroove(hits, 4, 2, 3);
    for (const s of steps) expect(s.beat + s.holdBeats).toBeLessThanOrEqual(4);
  });

  it('difficulty 1 never asks for a difficulty-3 move', () => {
    const hits = grooveOf([[track('kick', [0, 4, 8, 12])]], STEPS);
    const steps = routineFromGroove(hits, 16, 1, 5);
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) expect(['dance_freeze_baby', 'dance_power_windmill']).not.toContain(s.clipId);
  });

  it('a kick gets weight-bearing moves, a hat gets ornament', () => {
    const kick = routineFromGroove([{ beat: 0, role: 'kick', weight: 1 }], 16, 3, 11);
    const hat = routineFromGroove([{ beat: 0, role: 'hat', weight: 1 }], 16, 3, 11);
    expect(['dance_footwork_six', 'dance_power_windmill', 'dance_freeze_baby', 'dance_bounce_two_step', 'dance_bounce_shoulder'])
      .toContain(kick[0].clipId);
    expect(['dance_wave_arm', 'dance_trans_spin', 'dance_bounce_two_step', 'dance_bounce_shoulder'])
      .toContain(hat[0].clipId);
  });

  it('an empty groove is an empty routine, not a crash', () => {
    expect(routineFromGroove([], 16, 2, 1)).toEqual([]);
    expect(routineFromGroove([{ beat: 0, role: 'kick', weight: 1 }], 0, 2, 1)).toEqual([]);
  });
});

describe('THE EXPORT IS DETERMINISTIC', () => {
  // "play my song" pressed twice must be the same routine both times — the same reason the shipped tracks
  // are seeded rather than rolled
  it('the same song exports the same chart every time', () => {
    const a = exportSongToDance(song([track('kick', [0, 8]), track('hat', [2, 6, 10, 14])], 4, 'mine'));
    const b = exportSongToDance(song([track('kick', [0, 8]), track('hat', [2, 6, 10, 14])], 4, 'mine'));
    expect(a).toEqual(b);
  });

  it('a different song is a different chart', () => {
    const a = exportSongToDance(song([track('kick', [0, 8])], 4, 'one'));
    const b = exportSongToDance(song([track('kick', [0, 8])], 4, 'two'));
    expect(a!.track.seed).not.toBe(b!.track.seed);
  });

  it('ids are stable, safe and collapse to something when the name is junk', () => {
    expect(exportedTrackId('My Song!')).toBe(exportedTrackId('MySong'));
    expect(exportedTrackId('!!!')).toBe('song_untitled');
    expect(seedFrom('x')).toBe(seedFrom('x'));
  });
});

describe('the exported track is a real DanceTrack', () => {
  it('carries tempo, bars and a difficulty the song earned', () => {
    const out = exportSongToDance(song([track('kick', [0, 4, 8, 12])], 8, 'groove'))!;
    expect(out.track.bpm).toBe(96);
    expect(out.track.bars).toBe(8);
    expect(out.track.difficulty).toBe(1);
    expect(out.track.name).toBe('TEST');
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.summary.hits).toBe(32);            // four kicks a bar over eight bars
    expect(out.summary.beats).toBe(32);
  });

  it('SILENCE IS NOT A TRACK, and neither is an empty arrangement', () => {
    expect(exportSongToDance(song([track('kick', [])], 4, 'silent'))).toBeNull();
    expect(exportSongToDance({ ...song([track('kick', [0])]), chain: [] })).toBeNull();
  });

  it('nothing in the export references audio — no sample, no melody, no third-party content', () => {
    const out = exportSongToDance(song([track('kick', [0, 8]), track('snare', [4, 12])], 2, 'clean'))!;
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/\.(mp3|wav|ogg|m4a)/i);
    expect(json).not.toMatch(/http/i);
    // the chart is step ids and beat numbers, and that is all it can ever be
    for (const s of out.steps) expect(s.clipId).toMatch(/^dance_/);
  });
});

describe('THE GRID TIER', () => {
  it('a new player meets the grid, not a DAW', () => {
    const t = tierDef(NO_PROGRESS);
    expect(t.id).toBe('grid');
    expect(t.arrangement).toBe(false);
    expect(t.takes).toBe(false);
    expect(t.mixdown).toBe(false);
    expect(t.tracks).toBe(4);
    expect(t.steps).toBe(16);
  });

  it('the dance export is open AT THE GRID — one bar of drums is already a chart', () => {
    expect(TIERS.grid.danceExport).toBe(true);
    expect(unlocked(NO_PROGRESS, 'danceExport')).toBe(true);
  });

  it('one real pattern opens the chain; two chained sections open the studio', () => {
    let p: MusicProgress = { ...NO_PROGRESS };
    expect(tierFor(p)).toBe('grid');
    for (let i = 0; i < CHAIN_AT_PATTERNS; i++) p = advance(p, 'pattern');
    expect(tierFor(p)).toBe('chain');
    expect(unlocked(p, 'arrangement')).toBe(true);
    expect(unlocked(p, 'mixdown')).toBe(false);
    for (let i = 0; i < STUDIO_AT_CHAIN; i++) { p = advance(p, 'section'); p = advance(p, 'chain'); }
    expect(tierFor(p)).toBe('studio');
    expect(unlocked(p, 'takes')).toBe(true);
    expect(unlocked(p, 'mixdown')).toBe(true);
  });

  it('SILENCE IS NOT A PATTERN', () => {
    expect(isRealPattern([{ pattern: [false, false, false] }])).toBe(false);
    expect(isRealPattern([{ pattern: [false, true], muted: true }])).toBe(false);
    expect(isRealPattern([{ pattern: [false, true] }])).toBe(true);
  });

  it('progress only ever goes UP — a tier you reached is a tier you keep', () => {
    let p = advance(advance(NO_PROGRESS, 'pattern'), 'pattern');
    p = advance(p, 'section');
    expect(p.patternsMade).toBe(2);
    expect(tierFor(p)).not.toBe('grid');
  });

  it('the room can SAY what opens next, and says nothing at the top', () => {
    expect(nextUnlock(NO_PROGRESS)!.tier).toBe('chain');
    expect(nextUnlock(NO_PROGRESS)!.needs).toMatch(/pattern/i);
    const mid = advance(NO_PROGRESS, 'pattern');
    expect(nextUnlock(mid)!.tier).toBe('studio');
    let top: MusicProgress = mid;
    for (let i = 0; i < STUDIO_AT_CHAIN; i++) { top = advance(top, 'section'); top = advance(top, 'chain'); }
    expect(nextUnlock(top)).toBeNull();          // there is no fourth tier and we do not pretend there is
  });

  it('every tier is named, described and reachable', () => {
    expect(MUSIC_TIERS).toEqual(['grid', 'chain', 'studio']);
    for (const id of MUSIC_TIERS) {
      expect(TIERS[id].name.length).toBeGreaterThan(2);
      expect(TIERS[id].blurb.length).toBeGreaterThan(10);
    }
    // each tier is a superset of the one below: a ladder, not a set of modes
    expect(TIERS.studio.tracks).toBeGreaterThan(TIERS.chain.tracks);
    expect(TIERS.chain.tracks).toBeGreaterThan(TIERS.grid.tracks);
  });
});

// MUSIC-SUITE P3 (2026-09-25): the ladder opens the dance export AT THE GRID, but the button lived in the song panel (which
// mounts at the CHAIN) and exported only a chain — so the grid tier never had it. danceSongAtTier decides the song per tier.
describe('THE DANCE EXPORT AT THE TIER THE LADDER NAMES', () => {
  const grid = [track('kick', [0, 8]), track('snare', [4, 12]), track('lead', [2, 6, 10, 14])];
  const heard = (def: { tracks: number }) => { const ids = shownRowIds(def); return (t: TrackState) => ids.has(t.sampleId); };
  const chainSong = { chain: [{ sectionId: 's1', bars: 2 }], sections: [{ id: 's1', name: 'verse', tracks: grid }] };

  it('AT THE GRID (no arrangement, no chain) the grid itself goes to the dance floor, looped', () => {
    const t = TIERS.grid;
    const s = danceSongAtTier({ danceExport: t.danceExport, arrangement: t.arrangement, chain: [], sections: [], grid, heard: heard(t) })!;
    expect(s.from).toBe('grid');
    const out = exportSongToDance({ id: 'prj_1', name: 'Beat', bpm: 96, steps: STEPS, ...s })!;
    expect(out).not.toBeNull();
    expect(out.track.bars).toBe(GRID_DANCE_BARS);
    expect(out.summary.hits).toBe(4 * GRID_DANCE_BARS);           // kick + snare only: lead is not drawn at the grid
  });

  it('with the arrangement open and a chain built, the chain goes — and a hidden row is still left out', () => {
    const t = TIERS.chain;
    const s = danceSongAtTier({ danceExport: t.danceExport, arrangement: t.arrangement, ...chainSong, grid: [], heard: heard(t) })!;
    expect(s.from).toBe('chain');
    expect(exportSongToDance({ id: 'prj_1', name: 'Beat', bpm: 96, steps: STEPS, ...s })!.summary).toMatchObject({ bars: 2, hits: 8 });
    const studio = danceSongAtTier({ danceExport: true, arrangement: true, ...chainSong, grid: [], heard: heard(TIERS.studio) })!;
    expect(exportSongToDance({ id: 'prj_1', name: 'Beat', bpm: 96, steps: STEPS, ...studio })!.summary.hits).toBe(16);   // lead joins at 8 rows
  });

  it('with the arrangement open but no chain yet, the grid still goes (the button is never a dead end)', () => {
    const t = TIERS.chain;
    expect(danceSongAtTier({ danceExport: true, arrangement: t.arrangement, chain: [], sections: [], grid, heard: heard(t) })!.from).toBe('grid');
  });

  it('a tier without the export gets nothing; the same project exports the same chart every time', () => {
    expect(danceSongAtTier({ danceExport: false, arrangement: true, ...chainSong, grid, heard: () => true })).toBeNull();
    const s = danceSongAtTier({ danceExport: true, arrangement: false, chain: [], sections: [], grid, heard: heard(TIERS.grid) })!;
    const a = exportSongToDance({ id: 'prj_same', name: 'A', bpm: 96, steps: STEPS, ...s });
    const b = exportSongToDance({ id: 'prj_same', name: 'A', bpm: 96, steps: STEPS, ...s });
    expect(a).toEqual(b);
  });
});

// MUSIC-SUITE P3 FIX PASS (2026-09-25): SEND TO THE DANCE FLOOR said "sent" when the write failed — saveExportedTrack
// swallowed every setItem failure. It says whether the export was kept now, and the room says the failure.
describe('the dance export says whether it was kept', () => {
  const kick = (): TrackState[] => [{ sampleId: 'kick', pattern: Array.from({ length: STEPS }, (_, i) => i % 4 === 0), volume: 0.8, muted: false, pan: 0 }];
  it('true when kept (and the Cypher reads it back); false when the storage refuses it — never a silent success', () => {
    const out = exportSongToDance({ id: 'prj_d', name: 'Kept', bpm: 100, steps: STEPS, chain: [{ sectionId: 'a', bars: 2 }], sections: [{ id: 'a', name: 'a', tracks: kick() }] })!;
    expect(out).toBeTruthy();
    const roomy = installFakeWebAudio();
    try {
      expect(saveExportedTrack(out)).toBe(true);
      expect(readExportedTrack()?.track.id).toBe(out.track.id);
    } finally { roomy.uninstall(); }
    const full = installFakeWebAudio({ quotaChars: 10 });
    try {
      expect(saveExportedTrack(out)).toBe(false);
      expect(readExportedTrack()).toBeNull();
    } finally { full.uninstall(); }
  });
});
