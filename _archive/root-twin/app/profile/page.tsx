import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { ProfileView } from '@/components/profile-view';
import { ReferralCard } from '@/components/marketing/referral-card';
import { CardEditor } from '@/components/creator/card-editor';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <ProfileView userName={session?.user?.name ?? 'Athlete'} email={session?.user?.email ?? ''} />
      <div className="mx-auto max-w-[900px] px-4">
        <div className="mt-2 flex items-center gap-2">
          <h2 className="fel-heading text-xl font-bold text-white">Creator Card</h2>
          <span className="rounded-full bg-[#A855F7]/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#C79BFF]">Shareable</span>
        </div>
        <div className="mt-3"><CardEditor /></div>
      </div>
      <div className="px-4">
        <ReferralCard />
      </div>
      <BottomNav />
    </div>
  );
}
