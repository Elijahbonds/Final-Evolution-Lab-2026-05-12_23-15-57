import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import bank from './chapterCheck.data.json';
import { buildCheckBank } from './quizDrafts';
import { CHAPTERS, PASS_MARK } from './course';
import {
  CHECK_MIN_QUESTIONS, checkIsDraft, checkLive, checkQuestions, draftsOn, gradeCheck, liveChecks, payPathFor,
  publicQuestions, shuffledOptions,
} from './chapterCheck';

// EDU-LINKS (2026-10-07), owner decision 6: "Playbook chapter shards: quiz at 80%." The check asks the owner's drafts,
// ships none of them unapproved, and is graded here on the server.
const ON = { drafts: true };
const OFF = { drafts: false };
const key = (chapter: number) => Object.fromEntries(
  checkQuestions(chapter, ON).map((q) => [q.id, q.options[q.answer]]),
);
const wrongFor = (q: { options: string[]; answer: number }) => q.options[(q.answer + 1) % 4];

describe('the question bank', () => {
  it('IS THE DOC: chapterCheck.data.json matches docs/PLAYBOOK-QUIZ-DRAFTS.md (re-run scripts/education/build-chapter-check.ts)', () => {
    expect(bank).toEqual(buildCheckBank(readFileSync('docs/PLAYBOOK-QUIZ-DRAFTS.md', 'utf8')));
  });

  it('every chapter of the book has enough drafts for a check', () => {
    for (const c of CHAPTERS) expect(checkQuestions(c.number, ON).length, `chapter ${c.number}`).toBeGreaterThanOrEqual(CHECK_MIN_QUESTIONS);
  });
});

describe('NO UNAPPROVED DRAFT SHIPS', () => {
  it('without the draft flag, a check asks only approved or edited questions', () => {
    for (const c of CHAPTERS) for (const q of checkQuestions(c.number, OFF)) expect(['approved', 'edited'], q.id).toContain(q.status);
  });

  it('today (no draft approved) no check is live without the flag, so the lesson route keeps paying as before', () => {
    // The day the owner approves a chapter's drafts this changes on purpose: update the expectation with the approval.
    expect(liveChecks(OFF)).toEqual([]);
    for (const c of CHAPTERS) expect(payPathFor(c.number, OFF)).toBe('finish');
  });

  it('with the flag, every chapter has a check, it says DRAFT, and the check is where its shards come from', () => {
    expect(liveChecks(ON)).toEqual(CHAPTERS.map((c) => c.number));
    for (const c of CHAPTERS) {
      expect(checkIsDraft(c.number, ON)).toBe(true);
      expect(payPathFor(c.number, ON)).toBe('check');
      expect(publicQuestions(c.number, ON).every((q) => q.draft)).toBe(true);
    }
  });

  it('the flag is on only for the words lib/flags.ts treats as on', () => {
    for (const v of ['1', 'true', 'TRUE', ' on ', 'yes']) expect(draftsOn({ PLAYBOOK_CHECK_DRAFTS: v }), v).toBe(true);
    for (const v of [undefined, '', '0', 'false', 'off', 'no', 'please']) expect(draftsOn({ PLAYBOOK_CHECK_DRAFTS: v }), String(v)).toBe(false);
  });
});

describe('what the client is given', () => {
  it('no answer and no book line — only the question and its four options', () => {
    for (const c of CHAPTERS) for (const q of publicQuestions(c.number, ON)) {
      expect(Object.keys(q).sort()).toEqual(['draft', 'id', 'options', 'question']);
      expect(q.options).toHaveLength(4);
    }
  });

  it('the options are shuffled stably, so the right answer is not always where the drafts put it (mostly B)', () => {
    const qs = CHAPTERS.flatMap((c) => checkQuestions(c.number, ON));
    const slots = qs.map((q) => shuffledOptions(q).indexOf(q.options[q.answer]));
    const counts = [0, 1, 2, 3].map((i) => slots.filter((s) => s === i).length);
    for (const n of counts) expect(n).toBeGreaterThan(qs.length / 10);
    for (const q of qs) {
      expect(shuffledOptions(q)).toEqual(shuffledOptions(q));
      expect([...shuffledOptions(q)].sort()).toEqual([...q.options].sort());
    }
  });
});

describe('the grade, on the server', () => {
  it('every answer right is 100% and passes', () => {
    const g = gradeCheck(6, key(6), ON)!;
    expect(g).toMatchObject({ score: 100, passed: true, correct: g.total });
  });

  it('PASSES AT 80% AND NOT BELOW IT', () => {
    const qs = checkQuestions(6, ON);   // ten questions
    expect(qs).toHaveLength(10);
    const answers = key(6);
    answers[qs[0].id] = wrongFor(qs[0]);
    answers[qs[1].id] = wrongFor(qs[1]);
    expect(gradeCheck(6, answers, ON)).toMatchObject({ score: 80, passed: true, correct: 8 });
    answers[qs[2].id] = wrongFor(qs[2]);
    expect(gradeCheck(6, answers, ON)).toMatchObject({ score: 70, passed: false, correct: 7 });
    expect(PASS_MARK).toBe(80);
  });

  it('a short chapter needs every answer: 3 of 4 is 75%, a fail', () => {
    const qs = checkQuestions(1, ON);
    expect(qs).toHaveLength(4);
    const answers = key(1);
    answers[qs[3].id] = wrongFor(qs[3]);
    expect(gradeCheck(1, answers, ON)).toMatchObject({ score: 75, passed: false });
  });

  it('an unanswered question is wrong, and every question of the check counts', () => {
    const answers = key(6);
    const ids = Object.keys(answers);
    delete answers[ids[0]];
    delete answers[ids[1]];
    delete answers[ids[2]];
    expect(gradeCheck(6, answers, ON)).toMatchObject({ score: 70, passed: false, total: 10 });
    expect(gradeCheck(6, {}, ON)).toMatchObject({ score: 0, passed: false });
  });

  it('nothing the request says about itself is believed', () => {
    // a claimed score, an answer that is not one of the options, ids from another chapter, the wrong shape
    expect(gradeCheck(6, { score: 100, passed: true }, ON)).toMatchObject({ score: 0, passed: false });
    const answers = key(6);
    const first = Object.keys(answers)[0];
    answers[first] = 'all of the above';
    expect(gradeCheck(6, { ...answers, ...key(7) }, ON)).toMatchObject({ score: 90, passed: true, total: 10 });
    expect(gradeCheck(6, [answers], ON)).toMatchObject({ score: 0 });
    expect(gradeCheck(6, 'B', ON)).toMatchObject({ score: 0 });
    expect(gradeCheck(6, null, ON)).toMatchObject({ score: 0 });
  });

  it('per question it says right or wrong, never which option was right', () => {
    const g = gradeCheck(6, {}, ON)!;
    expect(g.results.every((r) => Object.keys(r).sort().join() === 'correct,id')).toBe(true);
  });

  it('a chapter with no live check grades nothing', () => {
    expect(gradeCheck(6, key(6), OFF)).toBeNull();
    expect(gradeCheck(99, {}, ON)).toBeNull();
  });
});

describe('THE ANSWER KEY STAYS ON THE SERVER', () => {
  it('no client component imports the check module or its data', () => {
    const clientFiles = [
      'components/education/chapter-check.tsx', 'components/education/chapter-reader.tsx', 'components/education/chapter-list.tsx',
      'components/education/playbook-card-links.tsx', 'components/education/camera-link.tsx',
    ];
    for (const f of clientFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/chapterCheck(\.data)?['"]/);
      expect(src, f).not.toMatch(/quizDrafts['"]/);
    }
  });
});
