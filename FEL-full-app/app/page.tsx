import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { HubWorld } from '@/components/hub-world';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { GuestLandingHero } from '@/components/guest-landing-hero';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  // M13 Step 1 — logged-out visitors get the guest landing ("60 seconds to a
  // dunk") instead of a hard login wall.
  if (!session) {
    return (
      <div className="min-h-screen bg-[#050505]">
        <PublicTopBar />
        <GuestLandingHero />
        <PublicLegalFooter />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <HubWorld userName={session?.user?.name ?? 'Athlete'} />
      <BottomNav />
    </div>
  );
}
