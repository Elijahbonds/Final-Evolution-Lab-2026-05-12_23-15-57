import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { loginPath } from '@/lib/auth/safeNext';
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
  // PLAT-P10 header cut (coordinator 2026-11-03: the student lesson ≤ 40 words above the fold, measured): no page header —
  // the lesson's title is the one heading (CoursePlayer), and the course's name moves under the lesson. TabPage's frame
  // (background and column) without its header. The name and the teach door show once the lesson's steps are done.
  return (
    <div className="relative min-h-screen bg-fel-bg pb-28 md:pb-12" style={{ backgroundImage: 'var(--fel-page-glow)' }}>
      <main className="fel-fade relative mx-auto max-w-3xl px-5 pt-6 md:pt-10">
        <CoursePlayer course={course} startAt={Number.isInteger(n) && n > 0 ? n - 1 : undefined} footer={(
          <div className="space-y-1 pt-2">
            <p className={L.label} data-course-name>{course.title}</p>
            {/* PLAT-P10: the door to teaching (the teacher platform's home), below the lesson */}
            <Link href="/teach" className={`${L.label} inline-flex min-h-11 items-center text-fel-cyan`} data-course-teach-door>Teach a course on FEL</Link>
          </div>
        )} />
      </main>
    </div>
  );
}
