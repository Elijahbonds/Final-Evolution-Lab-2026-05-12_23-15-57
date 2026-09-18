import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { CampView } from '@/components/camp/camp-view';

export const dynamic = 'force-dynamic';

/** /camp — the Camp Blueprint: certify, intake, sessions, templates. */
export default async function CampPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <AppHeader />
      <CampView />
      <BottomNav />
    </div>
  );
}
