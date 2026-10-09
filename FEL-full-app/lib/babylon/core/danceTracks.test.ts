import { describe, it, expect } from 'vitest';
import {
  DANCE_TRACKS, DEFAULT_TRACK_ID, trackById, cycleTrack, trackFromQuery, gradeFor, bodySpeedFor,
  cueLane, CUE_LOOKAHEAD_SEC, CUE_LINGER_SEC, pickBanner, FAMILY_GLYPH, FAMILY_COLOR, stepsForSong, stepsFor,
  earnableStemsAtBar,
} from './danceTracks';
import { DANCE_LIBRARY, DancePerformance, generateRoutine, beatDuration } from './DanceCore';
import { kitPattern } from '../audio/KitPulse';
import { FEL_SONGS, secPerBar } from '../dance/felSongs';
import { CATEGORY_STEM } from '../audio/StemBand';

describe('dance tracks (A+ mission #1)', () => {
  // MUSIC-SUITE P7 (2026-09-29): the three procedurally-random charts are now the six FEL house songs
  // (lib/babylon/dance/felSongs.ts) — felSongs.test.ts holds the song data itself to the shipped map.json files;
  // this only checks danceTracks.ts's OWN mapping from a song to a DanceTrack.
  it('ships one track per FEL song: six tracks at six tempos, each song\'s OWN 1..6 difficulty unique', () => {
    expect(DANCE_TRACKS).toHaveLength(6);
    expect(DANCE_TRACKS.every((t) => t.song)).toBe(true);
    // A song's real difficulty is song.difficulty (1..6, unique) — DanceTrack.difficulty itself stays the frozen
    // 1..3 field the pre-P9 fixture and generateRoutine's legacy callers need (danceTracks.ts's own comment on it).
    expect(new Set(DANCE_TRACKS.map((t) => t.song!.difficulty))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(DANCE_TRACKS.every((t) => t.difficulty >= 1 && t.difficulty <= 3)).toBe(true);
    expect(new Set(DANCE_TRACKS.map((t) => t.bpm)).size).toBe(6);
    // harder = faster, in order (SONGS-REPORT.md's own order: warmup, cypher, goldenhour, battle, canals, evolution)
    expect(DANCE_TRACKS.map((t) => t.id)).toEqual(['warmup', 'cypher', 'goldenhour', 'battle', 'canals', 'evolution']);
    for (let i = 1; i < DANCE_TRACKS.length; i++) {
      expect(DANCE_TRACKS[i].bpm).toBeGreaterThan(DANCE_TRACKS[i - 1].bpm);
      expect(DANCE_TRACKS[i].song!.difficulty).toBeGreaterThan(DANCE_TRACKS[i - 1].song!.difficulty);
    }
  });

  it('each track generates a repeatable, non-empty routine from its seed', () => {
    for (const t of DANCE_TRACKS) {
      const a = generateRoutine({ bars: t.bars, difficulty: t.difficulty, seed: t.seed });
      const b = generateRoutine({ bars: t.bars, difficulty: t.difficulty, seed: t.seed });
      expect(a.length).toBeGreaterThan(4);
      expect(a).toEqual(b);
      const maxDiff = Math.max(...a.map((s) => DANCE_LIBRARY.find((c) => c.id === s.clipId)!.difficulty));
      expect(maxDiff).toBeLessThanOrEqual(t.difficulty);
    }
  });

  it('trackById falls back to the default; cycle wraps both ways', () => {
    expect(trackById('nope').id).toBe(DEFAULT_TRACK_ID);
    expect(trackById(undefined).id).toBe(DEFAULT_TRACK_ID);
    expect(cycleTrack('warmup', -1).id).toBe('evolution');   // wraps to the LAST (hardest) of the six
    expect(cycleTrack('evolution', 1).id).toBe('warmup');
    expect(cycleTrack('warmup', 1).id).toBe('cypher');
  });

  it('reads ?track= deep links and rejects unknown ids', () => {
    expect(trackFromQuery('?track=battle')?.id).toBe('battle');
    expect(trackFromQuery('?hero=x&track=WARMUP')?.id).toBe('warmup');
    expect(trackFromQuery('?track=goldenhour')?.id).toBe('goldenhour');
    expect(trackFromQuery('?track=nope')).toBeNull();
    expect(trackFromQuery('')).toBeNull();
    expect(trackFromQuery(null)).toBeNull();
  });

  it('pick banner names the track (its song title), tempo and pips out of six', () => {
    const s = pickBanner(trackById('battle'));
    expect(s).toContain('BREAKWATER');   // battle's song title (SONGS-REPORT.md)
    expect(s).toContain('112 BPM');
    expect(s).toContain('●●●●○○');       // difficulty 4 of 6
  });

  it('grade bands match the star bands of DanceCore', () => {
    expect(gradeFor(0.96)).toBe('S');
    expect(gradeFor(0.95)).toBe('S');
    expect(gradeFor(0.9)).toBe('A');
    expect(gradeFor(0.75)).toBe('B');
    expect(gradeFor(0.5)).toBe('C');
    expect(gradeFor(0.2)).toBe('D');
    // stars from DanceCore for the same accuracies
    const stars = (acc: number) => acc >= 0.95 ? 5 : acc >= 0.85 ? 4 : acc >= 0.7 ? 3 : acc >= 0.5 ? 2 : acc > 0 ? 1 : 0;
    const map: Record<number, string> = { 5: 'S', 4: 'A', 3: 'B', 2: 'C' };
    for (const acc of [0.99, 0.9, 0.8, 0.6]) expect(gradeFor(acc)).toBe(map[stars(acc)]);
  });

  it('body speed: clean full-out, GOOD drags, MISS replaces the move', () => {
    expect(bodySpeedFor('PERFECT')).toBe(1);
    expect(bodySpeedFor('GREAT')).toBeLessThan(1);
    expect(bodySpeedFor('GOOD')).toBeLessThan(bodySpeedFor('GREAT'));
    expect(bodySpeedFor('MISS')).toBe(0);
  });

  it('cue lane: sorted by time, windowed to lookahead, lingers briefly after the beat', () => {
    const step = (clipId: string, mirrored = false) => ({ clipId, beat: 0, holdBeats: 4, mirrored });
    const now = 100;
    const lane = cueLane([
      { time: now + 3.0, step: step('dance_toprock_basic') },       // beyond lookahead
      { time: now + 1.0, step: step('dance_wave_arm', true) },
      { time: now + 0.1, step: step('dance_footwork_six') },
      { time: now - 0.1, step: step('dance_freeze_baby') },          // just passed, lingers
      { time: now - 1.0, step: step('dance_power_windmill') },       // gone
    ], now);
    expect(lane.map((c) => c.glyph)).toEqual(['FZ', 'FW', 'WV']);
    expect(lane[0].in).toBeCloseTo(-0.1, 3);
    expect(lane[2].mirrored).toBe(true);
    expect(lane[2].color).toBe(FAMILY_COLOR.wave);
    expect(lane.every((c) => c.in <= CUE_LOOKAHEAD_SEC && c.in >= -CUE_LINGER_SEC)).toBe(true);
    expect(Object.keys(FAMILY_GLYPH)).toHaveLength(7);
  });

  it('cue lane reads straight off a running performance (upcoming steps)', () => {
    const t = trackById('cypher');
    const perf = new DancePerformance(t.bpm);
    perf.setRoutine(generateRoutine({ bars: t.bars, difficulty: t.difficulty, seed: t.seed }));
    perf.start(10);
    perf.update(10.01);
    const up = perf.upcoming(10.01, 4);
    expect(up.length).toBeGreaterThan(1);
    expect(up.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < up.length; i++) expect(up[i].time).toBeGreaterThan(up[i - 1].time);
    const lane = cueLane(up, 10.01, beatDuration(t.bpm) * 4);
    expect(lane.length).toBeGreaterThan(0);
    expect(lane[0].in).toBeGreaterThanOrEqual(-CUE_LINGER_SEC);
  });
});

// MUSIC-SUITE P7 (2026-09-29): stepsForSong — press steps authored from a song's own section map.
describe('stepsForSong (the six FEL songs)', () => {
  const clipById = new Map(DANCE_LIBRARY.map((c) => [c.id, c]));

  it('is deterministic: the same song always yields byte-identical steps', () => {
    for (const song of FEL_SONGS) expect(stepsForSong(song)).toEqual(stepsForSong(song));
  });

  it('never overlaps a step: each one starts at or after the previous one\'s beat + holdBeats', () => {
    for (const song of FEL_SONGS) {
      const steps = stepsForSong(song);
      expect(steps.length).toBeGreaterThan(0);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i].beat).toBeGreaterThanOrEqual(steps[i - 1].beat + steps[i - 1].holdBeats - 1e-9);
      }
      // every step sits inside the song (its clip finishes at or before the last bar)
      const last = steps[steps.length - 1];
      expect(last.beat + last.holdBeats).toBeLessThanOrEqual(song.bars * 4 + 1e-9);
    }
  });

  it('a freeze step lands on every breakBar whose section actually plays horns', () => {
    for (const song of FEL_SONGS) {
      const steps = stepsForSong(song);
      const freezeBeats = new Set(steps.filter((s) => clipById.get(s.clipId)?.category === 'freeze').map((s) => s.beat));
      for (const bar of song.breakBars) {
        const section = song.sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars)!;
        if (section.stems.includes('horns')) expect(freezeBeats.has((bar - 1) * 4), `${song.id} bar ${bar}`).toBe(true);
      }
    }
  });

  it('every stem a song ever lists gets earned somewhere — no instrument in the band is unreachable', () => {
    for (const song of FEL_SONGS) {
      const steps = stepsForSong(song);
      const earnedFamilies = new Set(steps.map((s) => clipById.get(s.clipId)?.category));
      const listedStems = new Set(song.sections.flatMap((s) => s.stems).filter((s) => s !== 'bed'));
      for (const stem of listedStems) {
        const family = (Object.entries(CATEGORY_STEM) as [string, string][]).find(([, v]) => v.toLowerCase() === stem)?.[0];
        expect(family && earnedFamilies.has(family as never), `${song.id}: ${stem}`).toBeTruthy();
      }
    }
  });

  it('denser in the hooks than in the intro (the section energy really drives the rate)', () => {
    for (const song of FEL_SONGS) {
      const steps = stepsForSong(song);
      const intro = song.sections[0];
      const hook = song.sections.find((s) => s.name === 'hook')!;
      const stepsIn = (sec: typeof intro): number => steps.filter((s) => s.beat >= (sec.startBar - 1) * 4 && s.beat < (sec.startBar - 1 + sec.bars) * 4).length;
      const introRate = stepsIn(intro) / intro.bars;
      const hookRate = stepsIn(hook) / hook.bars;
      expect(hookRate, song.id).toBeGreaterThan(introRate);
    }
  });

  it('stepsFor(track) answers stepsForSong for every shipped track (no exported track present in node)', () => {
    for (const t of DANCE_TRACKS) expect(stepsFor(t)).toEqual(stepsForSong(t.song!));
  });

  it('earnableStemsAtBar reads the section a bar falls in, minus bed', () => {
    const cypher = FEL_SONGS.find((s) => s.id === 'cypher')!;
    expect(earnableStemsAtBar(cypher, 1)).not.toContain('bed');
    expect(earnableStemsAtBar(cypher, 21)).toEqual(cypher.sections.find((s) => s.name === 'break')!.stems.filter((s) => s !== 'bed'));
  });

  it('every song runs its own tempo: totalBeats × beatDuration lands within a bar of durationSec', () => {
    for (const song of FEL_SONGS) {
      const steps = stepsForSong(song);
      const last = steps[steps.length - 1];
      const totalBeats = last.beat + last.holdBeats;
      expect(totalBeats * beatDuration(song.bpm)).toBeLessThanOrEqual(song.durationSec + secPerBar(song));
    }
  });
});

describe('kit pulse patterns', () => {
  it('every voice sits on a 16th inside the bar, denser with difficulty', () => {
    const ids = ['warmup', 'cypher', 'battle'];
    const density = ids.map((id) => {
      const p = kitPattern(id);
      for (const v of [p.kick, p.clap, p.hat, p.openhat]) {
        for (const i of v) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(16); expect(Number.isInteger(i)).toBe(true); }
      }
      expect(p.kick).toContain(0);           // the one is always a kick
      return p.kick.length + p.clap.length + p.hat.length + p.openhat.length;
    });
    expect(density[0]).toBeLessThan(density[1]);
    expect(density[1]).toBeLessThan(density[2]);
    expect(kitPattern('unknown')).toEqual(kitPattern('cypher'));
  });
});
