import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { ProgramReview } from '@/components/signature/program-review';
import { defaultDeps, reviewOverview } from '@/lib/signature/server';

export const dynamic = 'force-dynamic';

/** /coach/admin/programs — SIGNATURE-PROGRAMS (2026-10-25): the owner's review and edit of the four signature programs. */
export default async function SignatureReviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath('/coach/admin/programs'));
  // the same admin check the library review uses (lib/admin/requireAdmin.ts)
  if (!(await requireAdmin())) notFound();
  const initial = await reviewOverview(defaultDeps()).catch(() => null);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <ProgramReview initial={initial} />
    </div>
  );
}
