'use client';
// CoursePlayer — PLAT-P10 (EDU-02, 2026-11-03): a course as a student takes it, one lesson at a time. The lesson's title,
// its blocks (CourseLesson: a demo plays by itself), and one primary: the next lesson. A student's place is kept ON THIS
// DEVICE only, for every age (teens' learning progress stays on the device; nothing is sent).
import { useEffect, useState } from 'react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import type { Course } from '@/lib/teach/course';
import { CourseLesson } from './course-lesson';
import { TEACH_LOOK as L } from './look';

const KEY = (id: string) => `fel.course.${id}.at.v1`;
const read = (id: string): number => { try { const n = Number(localStorage.getItem(KEY(id))); return Number.isInteger(n) && n >= 0 ? n : 0; } catch { return 0; } };
const write = (id: string, n: number) => { try { localStorage.setItem(KEY(id), String(n)); } catch { /* not kept */ } };

export function CoursePlayer({ course, startAt }: { course: Course; startAt?: number }) {
  const last = course.lessons.length - 1;
  const [i, setI] = useState(() => Math.min(last, Math.max(0, startAt ?? 0)));
  useEffect(() => { if (startAt == null) setI(Math.min(last, read(course.id))); }, [course.id, last, startAt]);
  useEffect(() => { write(course.id, i); }, [course.id, i]);
  const lesson = course.lessons[i];
  if (!lesson) return <p className={L.text}>This course has no lessons yet.</p>;
  return (
    <article className="space-y-4 pb-24" data-course-player={course.id} data-lesson-index={i}>
      <header className="space-y-1">
        <p className={L.label}>Lesson {i + 1} of {course.lessons.length}</p>
        <h2 className={L.title} data-lesson-title>{lesson.title}</h2>
      </header>
      <CourseLesson lesson={lesson} />
      {i < last
        ? <PrimaryCta onClick={() => { setI(i + 1); window.scrollTo?.(0, 0); }} testId="course-next">Next lesson</PrimaryCta>
        : <p className={L.ok} data-course-done>That is the last lesson.</p>}
    </article>
  );
}
