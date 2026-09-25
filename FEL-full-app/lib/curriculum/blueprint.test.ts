import { describe, expect, it } from 'vitest';
import { allLessons, lessonByRef, requiredModules } from './blueprint';
import { TRACKS } from '../game-data';

describe('the Blueprint curriculum', () => {
  it('has a body for every lesson in the mode tracks', () => {
    for (const t of TRACKS) for (const m of t.modules) for (const l of m.lessons) {
      expect(lessonByRef(`${t.key}/${m.key}/${l.key}`), `${t.key}/${m.key}/${l.key}`).toBeDefined();
    }
  });
  it('every lesson has prose, key points and a drill on a real mode key', () => {
    for (const l of allLessons()) {
      expect(l.body.length, l.ref).toBeGreaterThan(0);
      expect(l.keyPoints.length, l.ref).toBeGreaterThan(0);
      expect(l.drill.modeKey, l.ref).toMatch(/^[a-z_]+$/);
    }
  });
  // HOTFIX (2026-09-24): the question/answer/grading checks that lived here moved with the answer key to
  // lib/curriculum/assessments.test.ts. This module ships to the browser, so what it must prove now is the
  // opposite: that it carries no assessment at all.
  it('no lesson carries an assessment — this module is in the client bundle', () => {
    for (const l of allLessons()) expect(l as unknown as Record<string, unknown>, l.ref).not.toHaveProperty('assessment');
  });
  it('certification requires the three Blueprint modules', () => {
    expect(requiredModules()).toEqual(['blueprint/m1', 'blueprint/m2', 'blueprint/m3']);
  });
});

// ── THE 12-LESSON ACADEMY (2026-09-13) ──────────────────────────────────────
//
// The Coaching brief calls for a 12-module Academy; the Blueprint shipped with EIGHT athlete lessons (one
// per PRQ attribute, m1 + m2). Module 4 adds the four mechanism lessons the brief names. These tests hold
// the count and — more importantly — hold the two things that could quietly break work people already own.

import { CURRICULUM as C12, allLessons as all12, requiredModules as req12 } from './blueprint';

describe('the Academy is twelve athlete lessons', () => {
  const blueprint = C12.tracks.find((t) => t.key === 'blueprint')!;
  const athleteModules = blueprint.modules.filter((m) => m.key !== 'm3');   // m3 is the facilitator track

  it('eight pillars plus four mechanisms', () => {
    const lessons = athleteModules.flatMap((m) => m.lessons);
    expect(lessons).toHaveLength(12);
  });

  it('the four new ones are the topics the brief names', () => {
    const m4 = blueprint.modules.find((m) => m.key === 'm4')!;
    expect(m4.lessons.map((l) => l.ref)).toEqual([
      'blueprint/m4/absorption',
      'blueprint/m4/vertical',
      'blueprint/m4/neuromuscular',
      'blueprint/m4/breath',
    ]);
  });

  it('EXISTING LESSON REFS ARE UNCHANGED — credentials and progress are keyed on them', () => {
    // inserting the new module as "m3" and pushing Facilitating to m4 would have orphaned every credential
    // already earned. These eleven refs must survive every future edit to this file.
    const refs = all12().map((l) => l.ref);
    for (const ref of [
      'blueprint/m1/strength', 'blueprint/m1/power', 'blueprint/m1/speed', 'blueprint/m1/endurance',
      'blueprint/m2/agility', 'blueprint/m2/flexibility', 'blueprint/m2/recovery', 'blueprint/m2/mental',
      'blueprint/m3/intake', 'blueprint/m3/session', 'blueprint/m3/replication',
    ]) {
      expect(refs, ref).toContain(ref);
    }
  });

  it('FACILITATOR CERTIFICATION IS UNAFFECTED — m4 is not required for it', () => {
    // somebody certified against the previous curriculum version stays certified
    expect(req12()).not.toContain('blueprint/m4');
    expect(req12()).toEqual(['blueprint/m1', 'blueprint/m2', 'blueprint/m3']);
  });

  it('every new lesson is real teaching, not a title', () => {
    const m4 = C12.tracks.find((t) => t.key === 'blueprint')!.modules.find((m) => m.key === 'm4')!;
    for (const l of m4.lessons) {
      expect(l.body.length, l.ref).toBeGreaterThanOrEqual(3);
      expect(l.body.join(' ').length, l.ref).toBeGreaterThan(600);
      expect(l.keyPoints.length, l.ref).toBeGreaterThanOrEqual(3);
      expect(l.drill.modeKey, l.ref).toBeTruthy();
    }
    // (the three-questions-per-lesson floor and "grades like any other" moved to assessments.test.ts)
  });

  it('no clinical language in the new lessons', () => {
    const m4 = C12.tracks.find((t) => t.key === 'blueprint')!.modules.find((m) => m.key === 'm4')!;
    const text = JSON.stringify(m4).toLowerCase();
    for (const bad of ['diagnos', 'patholog', 'symptom', 'therap', 'patient', 'disorder', 'treat ']) {
      expect(text, bad).not.toContain(bad);
    }
  });
});
