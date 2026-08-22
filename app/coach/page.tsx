import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { CoachView } from './_components/coach-view';

export const dynamic = 'force-dynamic';

export default async function CoachPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <CoachView />
      <BottomNav />
    </div>
  );
}
