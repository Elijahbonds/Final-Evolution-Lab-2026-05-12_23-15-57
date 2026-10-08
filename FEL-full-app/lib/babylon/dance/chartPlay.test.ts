// IMPROVE (2026-10-06): the Cypher's play options (chartPlay.ts) — levels (#11), groove taps (#10), MATCH buttons (#12)
// and freeze holds (#13). The real shipped charts (danceTracks.stepsForSong) are the fixtures, and pressTarget is held
// to a live DancePerformance's own choice.
import { describe, expect, it } from 'vitest';
import { DancePerformance, DANCE_LIBRARY, MISS_AFTER, beatDuration, type DanceStep } from '../core/DanceCore';
import { stepsForSong } from '../core/danceTracks';
import { KEY_SPACE_DOWN } from '../core/StartWake';
import { FEL_SONGS } from './felSongs';
import {
  CLIP_BY_ID, categoryOf, chartForLevel, cycleLevel, parseLevel, EASY_MIN_START_GAP_BEATS, grooveBeats, grooveTap,
  firstGrooveFrom, GROOVE_CLEAR_BEATS, FAMILY_BUTTON, buttonForStep, matchPress, pressTarget, tapSource, isReleaseOf,
  judgeRelease, RELEASE_CLEAN_SEC, RELEASE_WINDOW_SEC, comparedRun,
} from './chartPlay';

const MIN_CLIP = Math.min(...DANCE_LIBRARY.map((c) => c.beats));
const charts = FEL_SONGS.map((s) => ({ id: s.id, steps: stepsForSong(s) }));
const noOverlap = (steps: DanceStep[]): boolean => steps.every((s, i) => i === 0 || steps[i - 1].beat + steps[i - 1].holdBeats <= s.beat);
const step = (beat: number, clipId = 'dance_toprock_basic'): DanceStep => ({ clipId, beat, holdBeats: CLIP_BY_ID.get(clipId)!.beats, mirrored: false });

describe('#18 CLIP_BY_ID', () => {
  it('answers every DANCE_LIBRARY clip, as find() did', () => {
    for (const c of DANCE_LIBRARY) expect(CLIP_BY_ID.get(c.id)).toBe(c);
    expect(categoryOf(step(0, 'dance_freeze_baby'))).toBe('freeze');
    expect(categoryOf({ ...step(0), clipId: 'nope' })).toBeNull();
  });
});

describe('#11 chartForLevel', () => {
  it('NORMAL is the chart as authored', () => {
    for (const c of charts) expect(chartForLevel(c.steps, 'normal')).toEqual(c.steps);
  });
  it('EASY: fewer steps, no two starts closer than the gap (a freeze excepted), every freeze kept', () => {
    for (const c of charts) {
      const easy = chartForLevel(c.steps, 'easy');
      expect(easy.length).toBeLessThan(c.steps.length);
      expect(easy.length).toBeGreaterThan(0);
      expect(noOverlap(easy)).toBe(true);
      for (let i = 1; i < easy.length; i++) {
        if (categoryOf(easy[i]) !== 'freeze') expect(easy[i].beat - easy[i - 1].beat).toBeGreaterThanOrEqual(EASY_MIN_START_GAP_BEATS);
      }
      expect(easy.filter((s) => categoryOf(s) === 'freeze').length).toBe(c.steps.filter((s) => categoryOf(s) === 'freeze').length);
    }
  });
  it('HARD: more steps, never overlapping, never denser than one per shortest clip (danceCeiling\'s bound), same families', () => {
    for (const c of charts) {
      const hard = chartForLevel(c.steps, 'hard');
      expect(hard.length).toBeGreaterThan(c.steps.length);
      expect(noOverlap(hard)).toBe(true);
      for (let i = 1; i < hard.length; i++) expect(hard[i].beat - hard[i - 1].beat).toBeGreaterThanOrEqual(MIN_CLIP);
      const fams = (s: DanceStep[]) => new Set(s.map(categoryOf));
      expect([...fams(hard)].every((f) => fams(c.steps).has(f))).toBe(true);
      const last = (s: DanceStep[]) => s[s.length - 1];
      expect(last(hard).beat + last(hard).holdBeats).toBeLessThanOrEqual(last(c.steps).beat + last(c.steps).holdBeats);
    }
  });
  it('HARD leaves a freeze alone on its break (nothing is added after it)', () => {
    for (const c of charts) {
      const hard = chartForLevel(c.steps, 'hard');
      c.steps.forEach((s, i) => {
        if (categoryOf(s) !== 'freeze' || !c.steps[i + 1]) return;
        const next = c.steps[i + 1].beat;
        expect(hard.filter((h) => h.beat > s.beat && h.beat < next)).toEqual([]);
      });
    }
  });
  it('a compared run (Arena, async challenge, challenge link) is always the authored chart', () => {
    expect(comparedRun('?arena=m_1')).toBe(true);
    expect(comparedRun('?track=cypher&mp=AB12')).toBe(true);
    expect(comparedRun('?c=xyz')).toBe(true);
    expect(comparedRun('?track=cypher&camera=still')).toBe(false);
    expect(comparedRun('')).toBe(false);
  });
  it('cycles and parses', () => {
    expect(cycleLevel('normal', 1)).toBe('hard');
    expect(cycleLevel('hard', 1)).toBe('easy');
    expect(cycleLevel('easy', -1)).toBe('hard');
    expect(parseLevel('easy')).toBe('easy');
    expect(parseLevel(null)).toBe('normal');
    expect(parseLevel('expert')).toBe('normal');
  });
});

describe('#10 groove beats', () => {
  it('only whole beats at least GROOVE_CLEAR_BEATS from every step start', () => {
    const steps = [step(0), step(8), step(11, 'dance_wave_arm')];
    expect(grooveBeats(steps)).toEqual([2, 3, 4, 5, 6]);   // 9 and 10 are too close to 11, and the chart ends at 13
  });
  it('appear in the sparse sections of the real charts and never within reach of a step', () => {
    for (const c of charts) {
      const g = grooveBeats(c.steps);
      expect(g.length).toBeGreaterThan(0);
      for (const b of g) for (const s of c.steps) expect(Math.abs(s.beat - b)).toBeGreaterThanOrEqual(GROOVE_CLEAR_BEATS);
    }
  });
  it('HARD fills the gaps, so it leaves fewer groove beats than NORMAL', () => {
    for (const c of charts) expect(grooveBeats(chartForLevel(c.steps, 'hard')).length).toBeLessThan(grooveBeats(c.steps).length);
  });
  it('a tap takes the nearest open groove beat inside its window, once', () => {
    const beats = [2, 3, 4];
    const taken = new Set<number>();
    expect(grooveTap(beats, 3.05, 0.1, taken)).toBe(3);
    taken.add(3);
    expect(grooveTap(beats, 2.98, 0.1, taken)).toBeNull();   // beat 3 is taken
    expect(grooveTap(beats, 2.5, 0.1, taken)).toBeNull();   // off the beat
    expect(grooveTap(beats, 6, 0.1, taken)).toBeNull();     // not a groove beat
    expect(grooveTap(beats, 4.08, 0.1, taken)).toBe(4);
  });
  it('firstGrooveFrom is a lower bound', () => {
    expect(firstGrooveFrom([2, 3, 4, 9], 3.5)).toBe(2);
    expect(firstGrooveFrom([2, 3, 4, 9], 0)).toBe(0);
    expect(firstGrooveFrom([2, 3, 4, 9], 10)).toBe(4);
  });
});

describe('#12 MATCH buttons', () => {
  it('every family has a face button and the freeze is alone on Y', () => {
    for (const c of DANCE_LIBRARY) expect(['A', 'B', 'X', 'Y']).toContain(FAMILY_BUTTON[c.category]);
    expect(Object.entries(FAMILY_BUTTON).filter(([, b]) => b === 'Y').map(([f]) => f)).toEqual(['freeze']);
    expect(buttonForStep(step(0, 'dance_power_windmill'))).toBe('B');
  });
  it('a face button is itself; the one-button taps (R trigger, SPACE) are A; SPACE\'s key-up A is nothing', () => {
    expect(matchPress({ t: 'button', btn: 'X', pressed: true }, false)).toBe('X');
    expect(matchPress({ t: 'button', btn: 'Y', pressed: false }, false)).toBeNull();
    expect(matchPress({ t: 'trigger', side: 'R', value: 0.9 }, true)).toBe('A');
    expect(matchPress({ t: 'button', btn: 'A', pressed: true, src: 'space' }, false)).toBeNull();
  });
  it('pressTarget picks the same step DancePerformance.hit judges', () => {
    const bpm = 120, bd = beatDuration(bpm);
    const steps = [step(0, 'dance_wave_arm'), step(2, 'dance_trans_spin'), step(4, 'dance_freeze_baby'), step(6, 'dance_wave_arm')];
    // press times around each step: early, on, late, and between steps (a wild tap)
    const offsets = [-0.19, -0.1, -0.02, 0, 0.03, 0.12, 0.19, 0.3, 0.6];
    for (const s of steps) {
      for (const off of offsets) {
        const perf = new DancePerformance(bpm);
        perf.setRoutine(steps);
        perf.start(0);
        const t = s.beat * bd + off;
        perf.update(t - 0.001);   // the frame before the press
        const target = pressTarget(perf.upcoming(t, 8), t);
        let judged: DanceStep | undefined;
        perf.onJudged = (_l, _p, _c, st) => { judged = st; };
        perf.hit(t);
        expect(target?.step ?? undefined, `step ${s.beat} offset ${off}`).toBe(judged);
      }
    }
  });
  it('nothing in reach is a wild tap', () => {
    expect(pressTarget([{ time: 5, step: step(10) }], 4, MISS_AFTER)).toBeNull();
  });
});

describe('#13 freeze holds', () => {
  it('knows a tap\'s source and only that source\'s release', () => {
    const space = tapSource({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN })!;
    expect(space).toBe('space');
    expect(isReleaseOf(space, { t: 'button', btn: 'A', pressed: true, src: 'space' })).toBe(true);
    expect(isReleaseOf(space, { t: 'trigger', side: 'R', value: 0 })).toBe(false);
    const pad = tapSource({ t: 'trigger', side: 'R', value: 0.9 })!;
    expect(isReleaseOf(pad, { t: 'trigger', side: 'R', value: 0.6 })).toBe(false);
    expect(isReleaseOf(pad, { t: 'trigger', side: 'R', value: 0.1 })).toBe(true);
    expect(isReleaseOf(pad, { t: 'trigger', side: 'L', value: 0 })).toBe(false);
    const a = tapSource({ t: 'button', btn: 'A', pressed: true })!;
    expect(isReleaseOf(a, { t: 'button', btn: 'A', pressed: false })).toBe(true);
    expect(isReleaseOf(a, { t: 'button', btn: 'B', pressed: false })).toBe(false);
    expect(isReleaseOf(a, { t: 'trigger', side: 'R', value: 0 })).toBe(false);   // a pad's idle trigger is not A's release
  });
  it('judges the release against the freeze\'s last beat', () => {
    expect(judgeRelease(0).call).toBe('CLEAN');
    expect(judgeRelease(-RELEASE_CLEAN_SEC).call).toBe('CLEAN');
    expect(judgeRelease(RELEASE_WINDOW_SEC).call).toBe('HELD');
    expect(judgeRelease(-0.5)).toEqual({ call: 'EARLY', style: 0 });
    expect(judgeRelease(0.5)).toEqual({ call: 'LATE', style: 0 });
    expect(judgeRelease(0).style).toBeGreaterThan(judgeRelease(0.15).style);
  });
});
