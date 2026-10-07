// playbookLinks — a drill and the Playbook lessons it comes from, both ways (Mirror & coaching plan Phase 6,
// 2026-10-07): "linked from Train and the Playbook".
//
// NO HAND-WRITTEN TABLE. Every drill already names its book, chapter and section (chart.ts DrillSource; drills.test.ts
// holds each to a real section of the imported book), and the Playbook course keys its lessons by course.ts slugify of
// the same section title. So the link is derived: a lesson links to every drill on the route whose source — the drill's
// own, or one of its phases' (the Wake-Up's six) — is that lesson. A drill names its lessons the same way, so the drills
// page shows the book's own words for it (the lesson's purpose and steps, verbatim from playbook.data.json; nothing
// rewritten, nothing attributed to the owner that the book does not say).
//
// lib/education/lessonMovement.ts stays as it is: it maps lessons to Mirror movements and is edu-links' pure table. A
// drill id is not a Mirror movement, so this is its own map, read by components/drills/drills-link.tsx.
//
// This imports the course (and so the imported book): only the chapter reader, the drills page's server render and
// tests use it, never the drills page's client bundle.
import { chapterByNumber, lessonId, slugify, type Lesson } from '../education/course';
import type { Drill, DrillSource } from './chart';
import { ROUTE_DRILLS, drillHref } from './route';

/** The lesson a source names, as `<chapter>:<lessonKey>` (course.ts lessonId), or null when the book has no such lesson. */
export function sourceLessonId(s: DrillSource): string | null {
  if (s.book !== 'playbook') return null;
  const ch = chapterByNumber(s.chapter);
  const key = slugify(s.section);
  return ch && ch.lessons.some((l) => l.key === key) ? lessonId(s.chapter, key) : null;
}

/** Every lesson a drill comes from, in order (the drill's own first, then its phases'), no repeats. */
export function drillLessonIds(d: Pick<Drill, 'source' | 'phases'>): string[] {
  const out: string[] = [];
  for (const s of [d.source, ...d.phases.map((p) => p.source)]) {
    const id = s ? sourceLessonId(s) : null;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The drills on the route that run a lesson (`<chapter>:<lessonKey>`), in the route's order. */
export function drillsForLesson(id: string): Drill[] {
  return ROUTE_DRILLS.filter((d) => drillLessonIds(d).includes(id));
}

/** The link a lesson shows for each of its drills. */
export function lessonDrillLinks(id: string): { href: string; label: string; drillId: string }[] {
  return drillsForLesson(id).map((d) => ({ href: drillHref(d.id), label: `Run it on camera: ${d.name}`, drillId: d.id }));
}

/** The book's words for a drill: each lesson it comes from, its title, purpose, first paragraph and steps, verbatim. */
export interface BookLesson { id: string; chapter: number; title: string; purpose: string; firstProse: string | null; steps: string[] }

export function bookLessonsFor(d: Pick<Drill, 'source' | 'phases'>): BookLesson[] {
  return drillLessonIds(d).map((id) => {
    const [n, key] = id.split(':');
    const l = chapterByNumber(Number(n))!.lessons.find((x) => x.key === key) as Lesson;
    return { id, chapter: Number(n), title: l.title, purpose: l.purpose, firstProse: l.prose[0] ?? null, steps: [...l.steps] };
  });
}
