import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { canFlag } from '@/lib/creator/creative-card-review';
import { ReviewBoard } from './_components/review-board';

export const dynamic = 'force-dynamic';

/**
 * CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06): the Creative Card review queue. Before this the owner could approve only
 * by calling the review API by hand. Founder and admin approve, reject (with a note the creator sees) and run the
 * soundtrack rotation; mods read and flag. The page gate is the session's role; every action is re-checked against the
 * database role by its route.
 */
export default async function AdminReviewPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/admin/review'));
  const role = (session.user as { role?: string } | undefined)?.role;
  if (!canFlag(role)) redirect('/');

  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <main className="mx-auto max-w-[1100px] px-4 py-8">
        <h1 className="fel-heading text-3xl font-bold text-white">
          CREATOR <span className="text-[#00E5FF]">REVIEW</span>
        </h1>
        <p className="mt-1 font-mono text-xs text-white/50">
          Everything public passes here first. Approve or reject with a note; music can go into the soundtrack rotation.
        </p>
        <ReviewBoard />
      </main>
    </div>
  );
}
