import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar } from '@/components/public-chrome';
import { CheckoutThanks } from '@/components/coach-business/checkout-thanks';

export const dynamic = 'force-dynamic';

// COACH-BUSINESS: Stripe Checkout's success_url for a coach's package (lib/coach-business/connect.ts). noindex (layout).
export default async function CoachBusinessThanksPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const id = typeof searchParams?.session_id === 'string' ? searchParams.session_id : '';
  // PUBLIC-POLISH (2026-11-02, live sweep D3): opened with no checkout session (a bookmark, a shared link, a typed URL)
  // this said "We could not confirm that payment" on a bare page with no header, which reads like a failed charge to
  // someone who paid nothing. With no session id there is nothing to confirm, so it says so, under the site's header,
  // with a way on. A real return from Stripe (a session id) is the confirm-with-Stripe flow below, unchanged.
  if (!id) {
    let signedIn = false;
    try { signedIn = !!(await getServerSession(authOptions))?.user; } catch { signedIn = false; }
    return (
      <div className="min-h-screen bg-fel-bg">
        {signedIn ? null : <PublicTopBar />}
        <main className="mx-auto max-w-xl px-4 py-16 text-white" data-thanks="none">
          <h1 className="text-2xl font-black">Nothing to show here</h1>
          <p className="mt-3 text-sm text-white/70">
            This page opens after you pay for a coach&apos;s package, to confirm the booking. There is no payment to look up from here.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/coach" className="inline-block rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-black">Go to Coach</Link>
            <Link href="/" className="inline-block rounded-xl border border-white/20 px-4 py-2 text-sm font-bold text-white">Back to home</Link>
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-fel-bg">
      <CheckoutThanks sessionId={id} />
    </div>
  );
}
