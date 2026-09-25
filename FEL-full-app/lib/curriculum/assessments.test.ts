import { describe, expect, it } from 'vitest';
import { CURRICULUM, PASS_MARK, allLessons } from './blueprint';
import {
  answerKeyForPresented, bankRefs, gradeModule, lessonQuestions, missingAnswers, moduleQuestions, optionOrder, presentModule,
} from './assessments';

// HOTFIX (2026-09-24): the certification's answer key moved here from blueprint.ts (which ships to the
// browser). These are BEHAVIOURAL: they grade real papers through the same functions the route calls.

const modules = CURRICULUM.tracks.flatMap((t) => t.modules.map((m) => ({ trackKey: t.key, moduleKey: m.key, ref: `${t.key}/${m.key}`, required: m.requiredForCertification })));

/** Walk any value and collect every object key in it. */
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
}

describe('the question bank', () => {
  it('covers every lesson, and holds nothing for a lesson that does not exist', () => {
    const lessonRefs = allLessons().map((l) => l.ref);
    for (const ref of lessonRefs) expect(lessonQuestions(ref).length, ref).toBeGreaterThan(0);
    expect(bankRefs().filter((r) => !lessonRefs.includes(r))).toEqual([]);
  });

  it('every answer indexes a real option, and question keys are unique within a module', () => {
    for (const ref of bankRefs()) for (const q of lessonQuestions(ref)) {
      expect(q.answer, q.key).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.key).toBeLessThan(q.options.length);
    }
    for (const m of modules) {
      const keys = moduleQuestions(m.trackKey, m.moduleKey)!.map((q) => q.key);
      expect(new Set(keys).size, m.ref).toBe(keys.length);
    }
  });

  it('the four mechanism lessons carry at least three questions each (moved from blueprint.test)', () => {
    for (const ref of ['blueprint/m4/absorption', 'blueprint/m4/vertical', 'blueprint/m4/neuromuscular', 'blueprint/m4/breath']) {
      expect(lessonQuestions(ref).length, ref).toBeGreaterThanOrEqual(3);
    }
  });

  it('no clinical language in the mechanism questions either', () => {
    const text = JSON.stringify(moduleQuestions('blueprint', 'm4')).toLowerCase();
    for (const bad of ['diagnos', 'patholog', 'symptom', 'therap', 'patient', 'disorder', 'treat ']) expect(text, bad).not.toContain(bad);
  });
});

describe('what a browser is shown', () => {
  it('has no answer field anywhere — only key, prompt, options', () => {
    for (const m of modules) {
      const paper = presentModule(m.trackKey, m.moduleKey)!;
      const keys = keysDeep(paper.questions);
      expect([...keys].sort(), m.ref).toEqual(['key', 'options', 'prompt']);
    }
  });

  it('shows every authored option exactly once (a reorder, never an edit)', () => {
    for (const m of modules) {
      const paper = presentModule(m.trackKey, m.moduleKey)!;
      const authored = moduleQuestions(m.trackKey, m.moduleKey)!;
      paper.questions.forEach((shown, i) => {
        expect(shown.key).toBe(authored[i].key);
        expect(shown.prompt).toBe(authored[i].prompt);
        expect([...shown.options].sort()).toEqual([...authored[i].options].sort());
        expect(optionOrder(m.ref, authored[i]).slice().sort()).toEqual(authored[i].options.map((_, j) => j));
      });
    }
  });

  it('is deterministic, so the GET and the POST that answers it agree', () => {
    for (const m of modules) {
      expect(presentModule(m.trackKey, m.moduleKey)).toEqual(presentModule(m.trackKey, m.moduleKey));
    }
    const ids = modules.map((m) => presentModule(m.trackKey, m.moduleKey)!.presentationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the correct option no longer sits in one slot — every answer was authored at index 1', () => {
    for (const m of modules.filter((x) => x.required)) {
      const key = Object.values(answerKeyForPresented(m.trackKey, m.moduleKey)!);
      const counts = [0, 0, 0, 0];
      key.forEach((p) => counts[p]++);
      // no single slot holds half the answers, and at least three slots are used
      expect(Math.max(...counts), `${m.ref} ${counts}`).toBeLessThan(key.length / 2);
      expect(counts.filter((c) => c > 0).length, `${m.ref} ${counts}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('unknown modules have no paper', () => {
    expect(presentModule('blueprint', 'nope')).toBeNull();
    expect(presentModule('nope', 'm1')).toBeNull();
  });
});

describe('grading (by the position the facilitator saw)', () => {
  it('the right positions score 100 and pass, on every module', () => {
    for (const m of modules) {
      const r = gradeModule(m.trackKey, m.moduleKey, answerKeyForPresented(m.trackKey, m.moduleKey)!)!;
      expect(r, m.ref).toMatchObject({ score: 100, passed: true, correct: r.total });
      expect(r.graded.every((g) => g.correct)).toBe(true);
    }
  });

  it('THE OLD EXPLOIT FAILS: picking the second option everywhere passes no module', () => {
    for (const m of modules) {
      const allB = Object.fromEntries(moduleQuestions(m.trackKey, m.moduleKey)!.map((q) => [q.key, 1]));
      const r = gradeModule(m.trackKey, m.moduleKey, allB)!;
      expect(r.passed, `${m.ref} scored ${r.score}`).toBe(false);
    }
  });

  it('and no fixed slot passes a required module', () => {
    for (const m of modules.filter((x) => x.required)) for (const slot of [0, 1, 2, 3]) {
      const same = Object.fromEntries(moduleQuestions(m.trackKey, m.moduleKey)!.map((q) => [q.key, slot]));
      expect(gradeModule(m.trackKey, m.moduleKey, same)!.passed, `${m.ref} slot ${slot}`).toBe(false);
    }
  });

  it('scores at the 80% mark: one wrong in ten passes, three wrong does not', () => {
    const key = answerKeyForPresented('blueprint', 'm1')!;
    const qs = Object.keys(key);
    expect(qs).toHaveLength(10);
    const wrong = (n: number) => Object.fromEntries(qs.map((k, i) => [k, i < n ? (key[k] + 1) % 4 : key[k]]));
    expect(gradeModule('blueprint', 'm1', wrong(1))).toMatchObject({ score: 90, passed: true, correct: 9, total: 10 });
    expect(gradeModule('blueprint', 'm1', wrong(2))).toMatchObject({ score: 80, passed: true, correct: 8 });
    expect(gradeModule('blueprint', 'm1', wrong(3))).toMatchObject({ score: 70, passed: false, correct: 7 });
    expect(PASS_MARK).toBe(80);
  });

  it('stores `chosen` as the AUTHORED index, so new Credential rows mean what the old ones meant', () => {
    const key = answerKeyForPresented('blueprint', 'm3')!;
    const r = gradeModule('blueprint', 'm3', key)!;
    for (const g of r.graded) {
      const q = moduleQuestions('blueprint', 'm3')!.find((x) => x.key === g.questionKey)!;
      expect(g.chosen).toBe(q.answer);
    }
  });

  it('a missing or out-of-range answer is wrong, never an error, and is counted as missing', () => {
    const key = answerKeyForPresented('blueprint', 'm2')!;
    const [first, second, third] = Object.keys(key);
    const partial: Record<string, number> = { ...key };
    delete partial[first];
    partial[second] = 7;
    partial[third] = -1;
    const r = gradeModule('blueprint', 'm2', partial)!;
    expect(r.graded.filter((g) => !g.correct).map((g) => g.questionKey).sort()).toEqual([first, second, third].sort());
    expect(r.graded.find((g) => g.questionKey === first)!.chosen).toBe(-1);
    expect(missingAnswers('blueprint', 'm2', partial)).toBe(3);
    expect(missingAnswers('blueprint', 'm2', key)).toBe(0);
    expect(missingAnswers('blueprint', 'm2', {})).toBe(Object.keys(key).length);
  });

  it('an unknown module does not grade', () => {
    expect(gradeModule('blueprint', 'nope', {})).toBeNull();
    expect(answerKeyForPresented('nope', 'm1')).toBeNull();
  });
});
