import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { GuestLandingHero } from '@/components/guest-landing-hero';
import { VerifyCheckoutParams } from '@/components/stripe/verify-checkout-params';

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
export default async function HomePage({ searchParams }: { searchParams: { session_id?: string } }) {
  const session = await getServerSession(authOptions);
  // SEC-F4 NO-WEBHOOK: the season-pass success_url lands here (?season=pro-unlocked&
  // session_id=…). A signed-in buyer is normally redirected straight to /play, which
  // would unmount any verify before it fired — so a checkout landing detours through
  // this page's verify first, and the redirect happens only after (client-side).
  if (session && !searchParams.session_id) redirect('/play');
  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Suspense: useSearchParams bails out of prerendering. VerifyCheckoutParams
          renders null and redirects to /play itself once the verify has settled. */}
      <Suspense fallback={null}>
        <VerifyCheckoutParams signedIn={!!session} />
      </Suspense>
      {!session && <GuestLandingHero />}
    </div>
  );
}
