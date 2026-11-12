import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { BusinessDashboard } from '@/components/coach-business/business-dashboard';
import { sellerNeedsBirthYear } from '@/lib/seller/server';
import { SellerBirthYearPrompt } from '@/components/seller/birth-year-prompt';

export const dynamic = 'force-dynamic';

// COACH-BUSINESS (2026-10-25): the coach's business — plan, payments, page, packages, sales, applications, results.
export default async function CoachBusinessPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/coach/business'));
  // SELLER-18-1 v2: a coach with no birth year is asked for one (selling is for verified adults, 18+).
  const askYear = await sellerNeedsBirthYear((session.user as { id?: string } | undefined)?.id, 'coach_business');
  return (
    <div className="min-h-screen bg-fel-bg pb-20">
      {askYear ? <div className="mx-auto max-w-3xl px-4 pt-4"><SellerBirthYearPrompt next="/coach/business" /></div> : null}
      <BusinessDashboard />
    </div>
  );
}
