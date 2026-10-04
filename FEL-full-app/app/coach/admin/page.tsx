import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { KBAdmin } from './_components/kb-admin';

export const dynamic = 'force-dynamic';

export default async function CoachAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath('/coach/admin'));
  // Same helper /api/admin/metrics and /api/admin/diag use. Not a second copy of the check.
  if (!(await requireAdmin())) notFound();
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <KBAdmin />
    </div>
  );
}
