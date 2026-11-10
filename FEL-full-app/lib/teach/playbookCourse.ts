// lib/teach/playbookCourse.ts — EDU-02 (platform phase 10, 2026-11-03): the owner's Playbook, re-expressed as the first
// course in the teachers' format — the proof that the format holds the book.
//
// It READS the book and never retypes it: every lesson of lib/education/course.ts (the imported manuscript) becomes one
// course lesson, titled by the book's own title, holding
//   · the lesson's demo, when the book lesson has one (lib/education/lessonDemo.ts — phase 4's choice, read-only);
//   · the lesson itself as a `book` block: a reference ("<chapter>:<lessonKey>") the lesson screen renders from the book
//     data (components/education BookText), so no sentence of the book is copied into the course;
//   · its camera check, when it has one (lib/education/lessonMovement.ts).
// playbookCourse.test.ts byte-compares what the course renders with the book.
//
// Pure. Client-safe.
import { CHAPTERS, PLAYBOOK, lessonId, type Lesson } from '@/lib/education/course';
import { demoForLesson } from '@/lib/education/lessonDemo';
import { movementForLesson } from '@/lib/education/lessonMovement';
import type { Block, Course } from './course';

export const PLAYBOOK_COURSE_ID = 'playbook';
/** The owner's account stands behind the book; the course names no person. */
export const PLAYBOOK_TEACHER = 'fel';

/** The book lesson a `book` block points at, or null. */
export function bookLesson(ref: string): { chapter: number; lesson: Lesson } | null {
  const [n, key] = ref.split(':');
  const ch = CHAPTERS.find((c) => c.number === Number(n));
  const lesson = ch?.lessons.find((l) => l.key === key);
  return ch && lesson ? { chapter: ch.number, lesson } : null;
}

export function playbookCourse(): Course {
  const lessons = CHAPTERS.flatMap((ch) => ch.lessons.map((l) => {
    const id = lessonId(ch.number, l.key);
    const blocks: Block[] = [];
    const clip = demoForLesson(id);
    if (clip) blocks.push({ id: `${id}#demo`, kind: 'demo', clip });
    blocks.push({ id: `${id}#book`, kind: 'book', lesson: id });
    const movement = movementForLesson(id);
    if (movement) blocks.push({ id: `${id}#camera`, kind: 'camera', movement });
    return { id, title: l.title, blocks };
  }));
  const first = CHAPTERS[0];
  return {
    id: PLAYBOOK_COURSE_ID, teacherId: PLAYBOOK_TEACHER, status: 'published',
    // the book's own title (its source line, before the author) and the first chapter's own subtitle: read, not written
    title: PLAYBOOK.source.split(' — ')[0], summary: first.subtitle, lessons,
  };
}
