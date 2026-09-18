import { describe, it, expect } from 'vitest';
import {
  DANCE_TRACKS, DEFAULT_TRACK_ID, trackById, cycleTrack, trackFromQuery, gradeFor, bodySpeedFor,
  cueLane, CUE_LOOKAHEAD_SEC, CUE_LINGER_SEC, pickBanner, FAMILY_GLYPH, FAMILY_COLOR,
} from './danceTracks';
import { DANCE_LIBRARY, DancePerformance, generateRoutine, beatDuration } from './DanceCore';
import { kitPattern } from '../audio/KitPulse';

describe('dance tracks (A+ mission #1)', () => {
  it('ships three tracks at three difficulties and three tempos', () => {
    expect(DANCE_TRACKS).toHaveLength(3);
    expect(new Set(DANCE_TRACKS.map((t) => t.difficulty))).toEqual(new Set([1, 2, 3]));
    expect(new Set(DANCE_TRACKS.map((t) => t.bpm)).size).toBe(3);
    // harder = faster, in order
    for (let i = 1; i < DANCE_TRACKS.length; i++) expect(DANCE_TRACKS[i].bpm).toBeGreaterThan(DANCE_TRACKS[i - 1].bpm);
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
    expect(cycleTrack('warmup', -1).id).toBe('battle');
    expect(cycleTrack('battle', 1).id).toBe('warmup');
    expect(cycleTrack('warmup', 1).id).toBe('cypher');
  });

  it('reads ?track= deep links and rejects unknown ids', () => {
    expect(trackFromQuery('?track=battle')?.id).toBe('battle');
    expect(trackFromQuery('?hero=x&track=WARMUP')?.id).toBe('warmup');
    expect(trackFromQuery('?track=nope')).toBeNull();
    expect(trackFromQuery('')).toBeNull();
    expect(trackFromQuery(null)).toBeNull();
  });

  it('pick banner names the track, tempo and pips', () => {
    const s = pickBanner(trackById('battle'));
    expect(s).toContain('BATTLE');
    expect(s).toContain('112 BPM');
    expect(s).toContain('●●●');
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
