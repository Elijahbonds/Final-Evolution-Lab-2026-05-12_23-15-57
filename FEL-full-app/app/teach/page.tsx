import { redirect } from 'next/navigation';
import Link from 'next/link';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { ApplyForm } from '@/components/teach/apply-form';
import { CourseStudio } from '@/components/teach/course-studio';
import { TEACH_COPY as T } from '@/components/teach/copy';
import { TEACH_LOOK as L } from '@/components/teach/look';
import { canAuthor } from '@/lib/teach/role';
import { coursesOf, latestApplication, teachReady } from '@/lib/teach/store';
import { sessionUserId, teachApiDeps } from '@/lib/teach/server';
import { PLAYBOOK_COURSE_ID } from '@/lib/teach/playbookCourse';

export const dynamic = 'force-dynamic';

/**
 * /teach — PLAT-P10 (EDU-01 / EDU-02, 2026-11-03): teach on FEL. Until the teacher SQL is applied (prisma/pending/
 * 2026-11-03-teacher.sql, read through the seam) it says "Opens soon". Then: a teacher (the owner-granted role, a
 * Camp-certified facilitator, or the coach-store env list as the fallback) gets the course studio; anyone else applies,
 * or sees where their application is.
 */
export default async function TeachPage() {
  const userId = await sessionUserId();
  if (!userId) redirect(loginPath('/teach'));
  const d = teachApiDeps();
  const ready = await teachReady(d.db);
  const author = ready && (await canAuthor(userId, d.role));
  const app = ready && !author ? await latestApplication(d.db, userId) : null;
  const courses = author ? await coursesOf(d.db, userId) : [];
  return (
    <TabPage eyebrow="Learn" title={author ? T.studio : T.applyTitle} accent="#FFD700">
      <div className="mx-auto max-w-3xl space-y-6">
        {!ready ? <p className={L.text} role="status" data-teach-soon>{T.opensSoon}</p>
          : author ? <CourseStudio initial={courses[0] ?? null} teacherId={userId} />
          : app?.status === 'pending' ? <p className={L.ok} role="status" data-teach-pending>{T.pending}</p>
          : (
            <>
              {app?.status === 'rejected' && <p className={L.text} data-teach-rejected>{T.rejected}{app.note ? ` ${app.note}` : ''}</p>}
              <p className={L.text}>{T.applyLede}</p>
              <ApplyForm />
            </>
          )}
        <Link href={`/education/course/${PLAYBOOK_COURSE_ID}`} className={L.row} data-teach-example><span>See a course: the Playbook</span><span aria-hidden>→</span></Link>
      </div>
    </TabPage>
  );
}
