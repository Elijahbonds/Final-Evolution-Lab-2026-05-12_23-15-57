// course — the Playbook as something you can be taught, not just read.
//
// The education that existed taught GAME MECHANICS: the charge bar, hang-time gravity, QTE windows. Useful, but
// it is not what this product claims to be about. This is the other thing — human movement, from the owner's own
// book, with the drills the book prescribes and the measurement the app can already do.
//
// The content is imported, never retyped: scripts/education/import-playbook.ts parses the manuscript into
// playbook.data.json, and everything here is derived from that. A revision to the book is re-run, not a rewrite.
// It matters for a movement book specifically — "knee at roughly 85 to 90 degrees" is an instruction somebody
// follows with their body, and a paraphrase is where a wrong number gets in.

import raw from './playbook.data.json';

export type SectionKind = 'concept' | 'drill' | 'note' | 'summary';

export interface RawSection { title: string; kind: SectionKind; purpose: string; prose: string[]; steps: string[] }
export interface RawChapter { number: number; title: string; subtitle: string; thesis: string; sections: RawSection[] }

export const PLAYBOOK = raw as unknown as { source: string; importedAt: string; chapters: RawChapter[] };

/** Who a chapter is written for. One track for everybody (owner's call) — the tags say who will care most. */
export type Audience = 'athlete' | 'parent' | 'coach';

/**
 * Assigned from what each chapter actually does, not spread evenly. Chapter 10 is literally "The Parent's Cheat
 * Sheet"; chapter 3 is a screen a coach or parent RUNS ON somebody else; chapter 9 is the athlete's own recovery.
 */
export const CHAPTER_AUDIENCE: Record<number, Audience[]> = {
  1: ['athlete', 'coach'],
  2: ['athlete', 'coach'],
  3: ['coach', 'parent'],
  4: ['athlete', 'coach'],
  5: ['athlete', 'coach'],
  6: ['athlete', 'coach', 'parent'],
  7: ['athlete', 'coach'],
  8: ['athlete', 'coach'],
  9: ['athlete', 'parent'],
  10: ['parent', 'coach'],
};

export interface Lesson {
  key: string;
  title: string;
  kind: SectionKind;
  /** The drill's own statement of what it is for. */
  purpose: string;
  /** The book's teaching, in its own words. */
  prose: string[];
  /** What you actually do, in order. */
  steps: string[];
  /** A trainer's note that belongs to this lesson rather than standing alone. */
  note?: string;
}

export interface Chapter {
  number: number;
  title: string;
  subtitle: string;
  thesis: string;
  audience: Audience[];
  lessons: Lesson[];
  /** The chapter's own recap, which the book writes as "What to Remember". */
  remember: string[];
}

/** URL-safe and stable across re-imports, so progress and video files survive a revision of the book. */
export function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/\(.*?\)/g, ' ')          // "(60 seconds)" is dosage, not identity
    .replace(/^(drill|movement|protocol|check|joint|phase|step|red flag|section)\s*\d*\s*[—:-]?\s*/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Build the course. A TRAINER'S NOTE has no title of its own and always follows the thing it comments on, so it
 * is folded into the lesson above rather than left as a lesson called "TRAINER'S NOTE" — the book sets them as
 * callouts and so should the course. "What to Remember" becomes the chapter recap for the same reason.
 */
export function buildChapters(): Chapter[] {
  return PLAYBOOK.chapters.map((c) => {
    const lessons: Lesson[] = [];
    let remember: string[] = [];

    for (const s of c.sections) {
      if (s.kind === 'summary') { remember = [...s.prose, ...s.steps]; continue; }
      if (s.kind === 'note') {
        const prev = lessons[lessons.length - 1];
        const text = s.prose.join(' ').trim();
        if (prev && text) prev.note = prev.note ? `${prev.note} ${text}` : text;
        continue;
      }
      const key = slugify(s.title);
      if (!key || lessons.some((l) => l.key === key)) continue; // a duplicate key would collide in progress
      lessons.push({ key, title: s.title, kind: s.kind, purpose: s.purpose, prose: s.prose, steps: s.steps });
    }

    return {
      number: c.number,
      title: c.title,
      subtitle: c.subtitle,
      thesis: c.thesis,
      audience: CHAPTER_AUDIENCE[c.number] ?? ['athlete'],
      lessons,
      remember,
    };
  });
}

export const CHAPTERS: Chapter[] = buildChapters();

export function chapterByNumber(n: number): Chapter | null {
  return CHAPTERS.find((c) => c.number === n) ?? null;
}

/** Every drill in the book, which is also the exercise library the films attach to. */
export interface Drill { key: string; title: string; chapter: number; purpose: string; steps: string[]; prose: string[] }

export function allDrills(): Drill[] {
  const out: Drill[] = [];
  for (const c of CHAPTERS) {
    for (const l of c.lessons) {
      if (l.kind !== 'drill') continue;
      // A "drill" with nothing at all is a heading the parser over-claimed. But steps are not the only content:
      // the Oscillatory Pogo Progression is called the core jump tool of the Playbook and carries its reps in
      // sub-sections (Weeks 1-2 bilateral, Weeks 3-4 unilateral), so requiring steps dropped the single most
      // important drill in the book — and with it, the film named after it.
      if (!l.steps.length && !l.purpose && !l.prose.length) continue;
      if (out.some((d) => d.key === l.key)) continue;
      out.push({ key: l.key, title: l.title, chapter: c.number, purpose: l.purpose, steps: l.steps, prose: l.prose });
    }
  }
  return out;
}

export const DRILLS: Drill[] = allDrills();

// ── Progress, and what finishing is worth ────────────────────────────────────────────────────────────────────

/** Lesson keys are unique WITHIN a chapter, so progress is addressed by both. */
export function lessonId(chapter: number, lessonKey: string): string {
  return `${chapter}:${lessonKey}`;
}

export function chapterProgress(chapter: Chapter, done: ReadonlySet<string>): { done: number; total: number; pct: number } {
  const total = chapter.lessons.length;
  const n = chapter.lessons.filter((l) => done.has(lessonId(chapter.number, l.key))).length;
  return { done: n, total, pct: total ? Math.round((n / total) * 100) : 0 };
}

export function isChapterComplete(chapter: Chapter, done: ReadonlySet<string>): boolean {
  return chapter.lessons.length > 0 && chapterProgress(chapter, done).done === chapter.lessons.length;
}

export function courseProgress(done: ReadonlySet<string>): { done: number; total: number; pct: number } {
  const total = CHAPTERS.reduce((n, c) => n + c.lessons.length, 0);
  const n = CHAPTERS.reduce((acc, c) => acc + chapterProgress(c, done).done, 0);
  return { done: n, total, pct: total ? Math.round((n / total) * 100) : 0 };
}

/** Shards for finishing a chapter. Server-granted like every other reward; this is only the table. */
export const CHAPTER_SHARDS = 15;
/** Finishing the whole book is worth more than the sum of its chapters, because finishing is the hard part. */
export const COURSE_BONUS_SHARDS = 50;

/** The quiz bar, matching the Credential model's existing default. */
export const PASS_MARK = 80;

export function passed(score0to100: number): boolean {
  return Math.max(0, Math.min(100, Math.round(score0to100))) >= PASS_MARK;
}

/**
 * What a completed chapter pays. Idempotence is the WALLET's job (lib/wallet spend/earn is keyed), not this
 * function's — it only says the amount, so a replayed request cannot mint a second payout.
 */
export function chapterReward(chapterNumber: number, alreadyPaid: ReadonlySet<number>): number {
  if (alreadyPaid.has(chapterNumber)) return 0;
  const last = alreadyPaid.size + 1 === CHAPTERS.length;
  return CHAPTER_SHARDS + (last ? COURSE_BONUS_SHARDS : 0);
}
