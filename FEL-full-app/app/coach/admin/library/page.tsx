import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { LibraryReview } from '@/components/library/library-review';

export const dynamic = 'force-dynamic';

/** /coach/admin/library — EXERCISE-LIBRARY (2026-10-25): the owner's review of library drafts and coach submissions. */
export default async function LibraryReviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath('/coach/admin/library'));
  // the same admin check /coach/admin uses (lib/admin/requireAdmin.ts)
  if (!(await requireAdmin())) notFound();
  return (
    <div className="min-h-screen bg-fel-bg pb-20">
      <LibraryReview />
    </div>
  );
}
