import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { CoachView } from './_components/coach-view';

export const dynamic = 'force-dynamic';

export default async function CoachPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/coach'));
  return (
    <div className="min-h-screen bg-fel-bg pb-20">
      {/* A11-01 (2026-10-25): the page's heading for a screen reader (WCAG 1.3.1 / 2.4.6); the tabs below are its sections */}
      <h1 className="sr-only">Coach</h1>
      <CoachView />
    </div>
  );
}
