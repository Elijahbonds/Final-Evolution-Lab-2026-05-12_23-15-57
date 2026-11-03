'use client';
// CoursePlayer — PLAT-P10 (EDU-02, 2026-11-03): a course as a student takes it, one lesson at a time. The lesson's title,
// its blocks (CourseLesson: a demo plays by itself), and one primary: the next lesson, once the lesson's steps are done. A student's place is kept ON THIS
// DEVICE only, for every age (teens' learning progress stays on the device; nothing is sent).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { TYPE } from '@/lib/design/type';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import type { Course } from '@/lib/teach/course';
import { CourseLesson } from './course-lesson';
import { TEACH_LOOK as L } from './look';

const KEY = (id: string) => `fel.course.${id}.at.v1`;
const read = (id: string): number => { try { const n = Number(localStorage.getItem(KEY(id))); return Number.isInteger(n) && n >= 0 ? n : 0; } catch { return 0; } };
const write = (id: string, n: number) => { try { localStorage.setItem(KEY(id), String(n)); } catch { /* not kept */ } };

/** (new) A course this short shows where you are as dots; a longer one (the Playbook) as "31/90". */
export const DOTS_UP_TO = 8;

export function CoursePlayer({ course, startAt, footer }: { course: Course; startAt?: number; footer?: ReactNode }) {
  const last = course.lessons.length - 1;
  const [i, setI] = useState(() => Math.min(last, Math.max(0, startAt ?? 0)));
  const [end, setEnd] = useState(false);
  useEffect(() => { if (startAt == null) setI(Math.min(last, read(course.id))); }, [course.id, last, startAt]);
  useEffect(() => { write(course.id, i); }, [course.id, i]);
  useEffect(() => { setEnd(false); }, [i]);
  const onEnd = useCallback((e: boolean) => setEnd(e), []);
  const lesson = course.lessons[i];
  if (!lesson) return <p className={L.text}>This course has no lessons yet.</p>;
  return (
    <article className="space-y-4 pb-24" data-course-player={course.id} data-lesson-index={i}>
      {/* PLAT-P10 header cut (coordinator 2026-11-03): the lesson's title is the page's one heading; where you are in the
          course is dots, not words (the course's name sits under the lesson, on the page) */}
      <header className="flex items-center justify-between gap-3">
        <h1 className={`${TYPE.title} min-w-0 text-white`} data-lesson-title>{lesson.title}</h1>
        {course.lessons.length <= DOTS_UP_TO ? (
          <span role="img" aria-label={`${course.title}: lesson ${i + 1} of ${course.lessons.length}`} className="flex shrink-0 gap-1.5" data-lesson-dots>
            {course.lessons.map((_, n) => <span key={n} aria-hidden className={`h-1.5 rounded-full ${n === i ? 'w-5 bg-fel-cyan' : n < i ? 'w-1.5 bg-fel-cyan/50' : 'w-1.5 bg-white/20'}`} />)}
          </span>
        ) : <span className={`${L.label} shrink-0 tabular-nums`} data-lesson-count><span className="sr-only">{course.title}: lesson </span>{i + 1}/{course.lessons.length}</span>}
      </header>
      <CourseLesson lesson={lesson} onEnd={onEnd} />
      {i < last
        ? end && <PrimaryCta onClick={() => { setI(i + 1); window.scrollTo?.(0, 0); }} testId="course-next">Next lesson</PrimaryCta>
        : end && <p className={L.ok} data-course-done>That is the last lesson.</p>}
      {/* the course's name and the page's doors, once the lesson's steps are done (not in the first screen's words) */}
      {end && footer}
    </article>
  );
}
