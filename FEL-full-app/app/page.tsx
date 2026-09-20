import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { GuestLandingHero } from '@/components/guest-landing-hero';

export const dynamic = 'force-dynamic';

/**
 * The front door has one job each way.
 *
 * SIGNED OUT it is the pitch — sixty seconds to a dunk, no account, no download. That is what a shared link
 * should open on and it is the only page whose job is to convert a stranger.
 *
 * SIGNED IN it used to be HubWorld: seven tiles and three banners pointing at the scan, multiplayer, the creator
 * card, the workout, live classes, sessions and the closet. Every one of those is now a tab or a door inside one,
 * so the hub was a fourth front door arguing with the three, which is the clutter the owner asked to be rid of.
 * Its venue grid was the best-looking thing in the product and it moved to the Play tab, where "which court" is
 * the question being asked. So a signed-in visitor goes where the games are.
 */
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/play');
  return (
    <div className="min-h-screen bg-[#050505]">
      <GuestLandingHero />
    </div>
  );
}
