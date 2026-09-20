import { describe, expect, it } from 'vitest';
import { DEFAULT_REWARD_RULES, REASON } from '../wallet/reward-rules';
import {
  CHAPTERS, CHAPTER_AUDIENCE, CHAPTER_SHARDS, COURSE_BONUS_SHARDS, DRILLS, PASS_MARK, PLAYBOOK,
  chapterByNumber, chapterProgress, chapterReward, courseProgress, isChapterComplete, lessonId, passed, slugify,
} from './course';

describe('the imported book', () => {
  it('is all ten chapters, in order, each with a title and a thesis', () => {
    expect(CHAPTERS).toHaveLength(10);
    expect(CHAPTERS.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const c of CHAPTERS) {
      expect(c.title.length, `chapter ${c.number}`).toBeGreaterThan(3);
      expect(c.thesis.length, `chapter ${c.number}`).toBeGreaterThan(20);
    }
  });

  it('kept the book’s own numbers, which are coaching instructions and not decoration', () => {
    // If the import ever starts paraphrasing, this is what catches it: these are angles somebody sets their body
    // to. Chapter 6 teaches a ~90 degree knee at the bottom of the dip and on the plant.
    const six = chapterByNumber(6)!;
    const text = JSON.stringify(six);
    expect(text).toMatch(/85 to 90 degrees|90 degrees/);
    expect(six.title).toMatch(/Jumping and Landing/i);
  });

  it('names its source, so the course can say where it came from', () => {
    expect(PLAYBOOK.source).toMatch(/Playbook/i);
    expect(PLAYBOOK.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives every chapter lessons', () => {
    for (const c of CHAPTERS) expect(c.lessons.length, `chapter ${c.number}`).toBeGreaterThan(2);
  });

  it('never leaves a lesson called TRAINER’S NOTE standing on its own', () => {
    // The book sets those as callouts on the thing above them; a lesson with that title would be a parser leak.
    for (const c of CHAPTERS) for (const l of c.lessons) expect(l.title).not.toMatch(/^TRAINER/i);
  });

  it('folds trainer’s notes onto a lesson instead of dropping them', () => {
    const withNotes = CHAPTERS.flatMap((c) => c.lessons).filter((l) => l.note);
    expect(withNotes.length).toBeGreaterThan(5);
  });

  it('NEVER SHIPS A LESSON WITH NOTHING IN IT', () => {
    // The import is a heuristic over an unstyled manuscript, so the real risk is a section heading becoming a
    // lesson with no body — somebody taps it, reads a title, and learns nothing. Every lesson must carry at
    // least a couple of sentences between its purpose, its steps and the book's own words.
    const thin = CHAPTERS.flatMap((c) => c.lessons.map((l) => ({ c, l })))
      .filter(({ l }) => {
        const words = [l.purpose, ...l.prose, ...l.steps].join(' ').split(/\s+/).filter(Boolean).length;
        return words < 25;
      })
      .map(({ c, l }) => `ch${c.number}: ${l.title}`);
    expect(thin, 'lessons with almost no content').toEqual([]);
  });

  it('gives every chapter a recap', () => {
    // "What to Remember" closes most chapters; a chapter without one is a parse worth knowing about.
    const withRecap = CHAPTERS.filter((c) => c.remember.length > 0);
    expect(withRecap.length).toBeGreaterThanOrEqual(8);
  });
});

describe('lesson keys', () => {
  it('strips the numbering so a key survives the book being re-ordered', () => {
    expect(slugify('Drill 1: The Countermovement Geometry Check (60 seconds)')).toBe('the-countermovement-geometry-check');
    expect(slugify('Movement 2 — The Split Squat')).toBe('the-split-squat');
  });

  it('is url-safe and bounded', () => {
    for (const c of CHAPTERS) for (const l of c.lessons) {
      expect(l.key).toMatch(/^[a-z0-9-]+$/);
      expect(l.key.length).toBeLessThanOrEqual(48);
    }
  });

  it('is unique within a chapter, because progress is addressed by it', () => {
    for (const c of CHAPTERS) {
      const keys = c.lessons.map((l) => l.key);
      expect(new Set(keys).size, `chapter ${c.number}`).toBe(keys.length);
    }
  });

  it('addresses progress by chapter AND key, since two chapters may teach the same-named thing', () => {
    expect(lessonId(6, 'the-split-squat')).not.toBe(lessonId(8, 'the-split-squat'));
  });
});

describe('the drills, which are also the exercise library', () => {
  it('found a real set of them', () => {
    expect(DRILLS.length).toBeGreaterThan(15);
  });

  it('never lists one with nothing to teach', () => {
    // Steps, a stated purpose, or the book's own explanation — any of the three is content. None of them is a
    // heading the parser over-claimed.
    for (const d of DRILLS) {
      expect(d.steps.length > 0 || d.purpose.length > 0 || d.prose.length > 0, d.title).toBe(true);
    }
  });

  it('keeps the Oscillatory Pogo Progression, which the book calls its core jump tool', () => {
    // It carries its dosage in sub-sections rather than steps, so an earlier filter dropped it entirely — the
    // most important drill in the book, and the film named after it had nothing to attach to.
    expect(DRILLS.some((d) => /pogo/i.test(d.title)), 'no pogo drill in the library').toBe(true);
  });

  it('keys them uniquely across the whole book, so a film file maps to exactly one drill', () => {
    const keys = DRILLS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps each drill attached to the chapter that teaches it', () => {
    for (const d of DRILLS) expect(CHAPTERS.some((c) => c.number === d.chapter)).toBe(true);
  });
});

describe('who each chapter is for', () => {
  it('tags all ten', () => {
    for (const c of CHAPTERS) expect(c.audience.length, `chapter ${c.number}`).toBeGreaterThan(0);
  });

  it('gives the parent chapter to parents', () => {
    expect(chapterByNumber(10)!.audience).toContain('parent');
    expect(chapterByNumber(10)!.title).toMatch(/Parent/i);
  });

  it('gives the movement screen to whoever runs it on somebody else', () => {
    expect(CHAPTER_AUDIENCE[3]).toEqual(expect.arrayContaining(['coach', 'parent']));
  });

  it('covers every audience somewhere, so no one is offered an empty course', () => {
    const all = new Set(CHAPTERS.flatMap((c) => c.audience));
    expect([...all].sort()).toEqual(['athlete', 'coach', 'parent']);
  });
});

describe('progress', () => {
  const ch = CHAPTERS[0];
  const allOfIt = new Set(ch.lessons.map((l) => lessonId(ch.number, l.key)));

  it('is nothing at the start', () => {
    expect(chapterProgress(ch, new Set()).pct).toBe(0);
    expect(isChapterComplete(ch, new Set())).toBe(false);
  });

  it('is everything at the end', () => {
    expect(chapterProgress(ch, allOfIt).pct).toBe(100);
    expect(isChapterComplete(ch, allOfIt)).toBe(true);
  });

  it('ignores a lesson id from another chapter', () => {
    const wrong = new Set(ch.lessons.map((l) => lessonId(99, l.key)));
    expect(chapterProgress(ch, wrong).done).toBe(0);
  });

  it('rolls up across the book', () => {
    expect(courseProgress(new Set()).pct).toBe(0);
    const everything = new Set(CHAPTERS.flatMap((c) => c.lessons.map((l) => lessonId(c.number, l.key))));
    expect(courseProgress(everything).pct).toBe(100);
    expect(courseProgress(everything).total).toBe(CHAPTERS.reduce((n, c) => n + c.lessons.length, 0));
  });
});

describe('what finishing is worth', () => {
  it('pays the chapter rate the first time', () => {
    expect(chapterReward(1, new Set())).toBe(CHAPTER_SHARDS);
  });

  it('PAYS NOTHING FOR A CHAPTER ALREADY PAID', () => {
    // The wallet is idempotent on its own key; this is the second lock, so a replayed completion cannot mint.
    expect(chapterReward(1, new Set([1]))).toBe(0);
  });

  it('adds the bonus only on the last chapter of the book', () => {
    const nine = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(chapterReward(10, nine)).toBe(CHAPTER_SHARDS + COURSE_BONUS_SHARDS);
    expect(chapterReward(5, new Set([1, 2]))).toBe(CHAPTER_SHARDS);
  });
});

describe('the quiz bar', () => {
  it('matches the Credential model’s own default', () => {
    expect(PASS_MARK).toBe(80);
  });

  it('passes at the mark and not below it', () => {
    expect(passed(80)).toBe(true);
    expect(passed(79.6)).toBe(true); // rounds to 80
    expect(passed(79)).toBe(false);
    expect(passed(-5)).toBe(false);
    expect(passed(1000)).toBe(true);
  });
});

describe('the payout the server actually makes', () => {
  it('prices a chapter from a rule, in shards, and the rule agrees with the course', () => {
    // Two places name this number: the reward rule (which the wallet reads) and CHAPTER_SHARDS (which the UI
    // shows). If they drift, the app promises one amount and pays another.
    const rule = DEFAULT_REWARD_RULES[REASON.EDU_CHAPTER_COMPLETE];
    expect(rule, 'no rule for EDU_CHAPTER_COMPLETE').toBeDefined();
    expect(rule.currency).toBe('shards');
    expect(rule.active).toBe(true);
    expect(rule.baseAmount).toBe(CHAPTER_SHARDS);
    expect(rule.minGrant).toBe(CHAPTER_SHARDS);
    expect(rule.maxGrant).toBe(CHAPTER_SHARDS);
  });
});
