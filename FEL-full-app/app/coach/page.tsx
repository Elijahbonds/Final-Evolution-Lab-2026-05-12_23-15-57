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
      {/* A11-01's heading is now the visible one in CoachView (premium-ui P8): one h1, seen and read */}
      <CoachView />
    </div>
  );
}
