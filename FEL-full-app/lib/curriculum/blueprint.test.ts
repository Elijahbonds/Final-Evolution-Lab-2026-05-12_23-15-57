import { describe, expect, it } from 'vitest';
import { CURRICULUM, PASS_MARK, allLessons, gradeModule, lessonByRef, requiredModules } from './blueprint';
import { TRACKS } from '../game-data';

describe('the Blueprint curriculum', () => {
  it('has a body for every lesson in the mode tracks', () => {
    for (const t of TRACKS) for (const m of t.modules) for (const l of m.lessons) {
      expect(lessonByRef(`${t.key}/${m.key}/${l.key}`), `${t.key}/${m.key}/${l.key}`).toBeDefined();
    }
  });
  it('every lesson has prose, key points, a drill on a real mode key and at least one question with a valid answer', () => {
    for (const l of allLessons()) {
      expect(l.body.length, l.ref).toBeGreaterThan(0);
      expect(l.keyPoints.length, l.ref).toBeGreaterThan(0);
      expect(l.drill.modeKey, l.ref).toMatch(/^[a-z_]+$/);
      expect(l.assessment.length, l.ref).toBeGreaterThan(0);
      for (const q of l.assessment) { expect(q.answer).toBeGreaterThanOrEqual(0); expect(q.answer).toBeLessThan(q.options.length); }
    }
  });
  it('question keys are unique within a module', () => {
    for (const t of CURRICULUM.tracks) for (const m of t.modules) {
      const keys = m.lessons.flatMap((l) => l.assessment.map((q) => q.key));
      expect(new Set(keys).size, `${t.key}/${m.key}`).toBe(keys.length);
    }
  });
  it('certification requires the three Blueprint modules', () => {
    expect(requiredModules()).toEqual(['blueprint/m1', 'blueprint/m2', 'blueprint/m3']);
  });
  it('grades a module at the 80% pass mark', () => {
    const mod = CURRICULUM.tracks[0].modules[0];
    const qs = mod.lessons.flatMap((l) => l.assessment);
    const perfect = Object.fromEntries(qs.map((q) => [q.key, q.answer]));
    expect(gradeModule('blueprint', 'm1', perfect)).toMatchObject({ score: 100, passed: true });
    const wrongOne = { ...perfect, [qs[0].key]: (qs[0].answer + 1) % qs[0].options.length };
    const r = gradeModule('blueprint', 'm1', wrongOne);
    expect(r.score).toBe(Math.round(((qs.length - 1) / qs.length) * 100));
    expect(r.passed).toBe(r.score >= PASS_MARK);
    expect(gradeModule('blueprint', 'nope', {})).toEqual({ score: 0, passed: false, graded: [] });
  });
});
