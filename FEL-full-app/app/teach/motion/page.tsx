import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { MotionPreview } from '@/components/motion-lesson/motion-preview';
import { MOTION_COPY as T } from '@/components/motion-lesson/copy';
import { TEACH_LOOK as L } from '@/components/teach/look';
import { canApprove } from '@/lib/creator/creative-card-review';
import { canPreviewMotion } from '@/lib/motion-lesson/access';
import { canAuthor } from '@/lib/teach/role';
import { teacherRoleDeps } from '@/lib/teach/server';

export const dynamic = 'force-dynamic';

/**
 * /teach/motion — EDU-05 motion lessons, phase B (2026-11-10): the PREVIEW. A recorded movement replayed on the viewer's
 * own athlete: the owner's own takes, packed as lesson files and opened in the browser (lib/motion-lesson). It is here so
 * the owner can watch it on a phone and sign off the look (docs/PLATFORM-ROADMAP.md P3, done-when 5). Dark: the owner's
 * roles (founder, admin: the approvers of /admin/review) and course authors only (lib/motion-lesson/access.ts); everyone
 * else reads "opens soon". Not linked from anywhere yet. No API route, no table, nothing stored or sent.
 */
export default async function MotionLessonPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect(loginPath('/teach/motion'));
  const admin = canApprove(user.role);
  const author = admin || (await canAuthor(user.id, teacherRoleDeps()).catch(() => false));
  return (
    <TabPage eyebrow={T.eyebrow} title={T.title}>
      <div className="mx-auto max-w-3xl">
        {canPreviewMotion({ signedIn: true, admin, author })
          ? <MotionPreview />
          : <p className={L.text} role="status" data-motion-soon>{T.opensSoon}</p>}
      </div>
    </TabPage>
  );
}
