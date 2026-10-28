import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { BusinessDashboard } from '@/components/coach-business/business-dashboard';

export const dynamic = 'force-dynamic';

// COACH-BUSINESS (2026-10-25): the coach's business — plan, payments, page, packages, sales, applications, results.
export default async function CoachBusinessPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/coach/business'));
  return (
    <div className="min-h-screen bg-fel-bg pb-20">
      <BusinessDashboard />
    </div>
  );
}
