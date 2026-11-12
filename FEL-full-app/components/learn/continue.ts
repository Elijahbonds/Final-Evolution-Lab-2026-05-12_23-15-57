// continue — where Learn's one primary button goes (PLAT-P04, 2026-10-27). Pure, so every case is tested.
//
//   1. the lesson you were last in (this device's place-marker, components/education/last-lesson.ts);
//   2. signed in, no marker: the first lesson the course's own progress says you have not done;
//   3. a guest who has used the feed on this device: back into the feed (its progress lives on the device);
//   4. nobody yet: chapter 1, lesson 1.
// One tap from Learn in every case. The words are draft copy for the owner (OWN-24); the titles are the book's.

import { CHAPTERS, lessonId } from '@/lib/education/course';
import type { LastLesson } from '@/components/education/last-lesson';

export const LEARN_FEED_PATH = '/learn/feed';

export function lessonHref(chapter: number, lesson: string): string {
  return `/education/playbook/${chapter}?lesson=${encodeURIComponent(lesson)}`;
}

export interface ContinueTarget {
  kind: 'last' | 'progress' | 'feed' | 'start';
  href: string;
  /** the hero's eyebrow */
  eyebrow: string;
  /** the hero's headline: the chapter's title (the book's) or the feed's name */
  title: string;
  /** one line: the lesson's title (the book's), or what the feed is */
  line: string;
  /** the button */
  cta: string;
}

function lessonTarget(kind: 'last' | 'progress' | 'start', chapter: number, key: string): ContinueTarget | null {
  const ch = CHAPTERS.find((c) => c.number === chapter);
  const i = ch ? ch.lessons.findIndex((l) => l.key === key) : -1;
  if (!ch || i < 0) return null;
  return {
    kind,
    href: lessonHref(chapter, key),
    eyebrow: kind === 'start' ? 'The Playbook' : `Chapter ${chapter} · Lesson ${i + 1} of ${ch.lessons.length}`,
    title: ch.title,
    line: ch.lessons[i].title,
    cta: kind === 'start' ? 'Start' : 'Continue',
  };
}

export function continueTarget(o: { last: LastLesson | null; done: ReadonlySet<string>; signedIn: boolean; feedStarted: boolean }): ContinueTarget {
  if (o.last) {
    const t = lessonTarget('last', o.last.chapter, o.last.lesson);
    if (t) return t;
  }
  if (o.signedIn && o.done.size > 0) {
    for (const c of CHAPTERS) {
      const next = c.lessons.find((l) => !o.done.has(lessonId(c.number, l.key)));
      if (next) return lessonTarget('progress', c.number, next.key)!;
    }
  }
  if (!o.signedIn && o.feedStarted) {
    return { kind: 'feed', href: LEARN_FEED_PATH, eyebrow: 'Your feed', title: 'Quick cards', line: 'Pick up where you left off.', cta: 'Continue' };
  }
  const first = CHAPTERS[0];
  return lessonTarget('start', first.number, first.lessons[0].key)!;
}
