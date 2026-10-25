// EXERCISE-LIBRARY (2026-10-25): the demo data the follow-up lanes render — clip keys by pattern, the rig's coverage,
// the anatomy keys, and the camera review chosen from tags (never from an English name).
import { describe, expect, it } from 'vitest';
import { CLIP_KEYS, CLIP_COVERAGE, avatarClip, clipCoverage, muscleMap, reviewMovementOf } from './demo';
import { loadLibraryFiles } from './files';
import { MUSCLES } from './vocab';

const ALL = loadLibraryFiles();

describe('clip keys', () => {
  it('every entry has a clip key, and only the rig\'s real clips are played', () => {
    expect(ALL.every((e) => (CLIP_KEYS as readonly string[]).includes(e.demo.clipKey))).toBe(true);
    expect(new Set(Object.values(CLIP_COVERAGE).filter(Boolean))).toEqual(new Set(['idle_stand', 'jump_up', 'run_forward']));
    expect(avatarClip('squat')).toBeNull();
    expect(avatarClip('hop')).toBe('jump_up');
    const { covered, missing } = clipCoverage();
    expect(covered.length + missing.length).toBe(CLIP_KEYS.length);
  });
});

describe('muscle map', () => {
  it('maps to anatomy keys from the fixed list, primary first, no repeats', () => {
    const keys = new Set(MUSCLES.map((m) => m.anatomyKey));
    for (const e of ALL) {
      const m = muscleMap(e);
      expect([...m.primary, ...m.secondary].every((k) => keys.has(k))).toBe(true);
      expect(m.secondary.some((k) => m.primary.includes(k))).toBe(false);
    }
  });
});

describe('camera review by pattern, not by name', () => {
  it('reads the tags', () => {
    expect(reviewMovementOf({ pattern: 'squat', family: 'squat', laterality: 'bilateral' })).toBe('squat');
    expect(reviewMovementOf({ pattern: 'squat', family: 'single-leg-squat', laterality: 'unilateral' })).toBeNull();
    expect(reviewMovementOf({ pattern: 'lunge', family: 'split-squat', laterality: 'unilateral' })).toBe('lunge');
    expect(reviewMovementOf({ pattern: 'hinge', family: 'hinge-pattern', laterality: 'bilateral' })).toBe('hinge');
    expect(reviewMovementOf({ pattern: 'push', family: 'push-up', laterality: 'bilateral' })).toBe('pushup');
    expect(reviewMovementOf({ pattern: 'push', family: 'bench-press', laterality: 'bilateral' })).toBeNull();
  });
  it('a renamed entry keeps its review (the name plays no part)', () => {
    const e = ALL.find((x) => x.id === 'goblet-squat')!;
    expect(reviewMovementOf({ ...e, name: 'Zzz' } as typeof e)).toBe(reviewMovementOf(e));
  });
});
