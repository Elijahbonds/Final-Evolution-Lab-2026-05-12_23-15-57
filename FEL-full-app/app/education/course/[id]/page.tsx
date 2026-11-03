import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { CoursePlayer } from '@/components/teach/course-player';
import { readCourse } from '@/lib/teach/api';
import { PLAYBOOK_COURSE_ID, playbookCourse } from '@/lib/teach/playbookCourse';
import { sessionUserId, teachApiDeps } from '@/lib/teach/server';
import { TEACH_LOOK as L } from '@/components/teach/look';

export const dynamic = 'force-dynamic';

/**
 * /education/course/<id>?lesson=<n> — PLAT-P10 (EDU-02, 2026-11-03): a course as a student takes it. The Playbook is the
 * first course (lib/teach/playbookCourse.ts: the owner's book, read, never retyped); any other is a teacher's published
 * course (its teacher sees their own draft). Free. A student's place stays on their device.
 */
export default async function CoursePage({ params, searchParams }: { params: { id: string }; searchParams?: { lesson?: string } }) {
  const userId = await sessionUserId();
  if (!userId) redirect(loginPath(`/education/course/${encodeURIComponent(params.id)}`));
  const course = params.id === PLAYBOOK_COURSE_ID ? playbookCourse() : await readCourse(userId, params.id, teachApiDeps());
  if (!course) notFound();
  const n = Number(searchParams?.lesson);
  return (
    <TabPage eyebrow="Course" title={course.title} accent="#FFD700">
      <div className="mx-auto max-w-3xl">
        <CoursePlayer course={course} startAt={Number.isInteger(n) && n > 0 ? n - 1 : undefined} />
        {/* PLAT-P10: the door to teaching (the teacher platform's home), below the lesson */}
        <Link href="/teach" className={`${L.label} mt-2 inline-flex min-h-11 items-center text-fel-cyan`} data-course-teach-door>Teach a course on FEL</Link>
      </div>
    </TabPage>
  );
}
