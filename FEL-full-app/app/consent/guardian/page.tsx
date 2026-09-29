import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { GuardianConsentGate } from '@/app/play/mirror/_components/guardian-consent-gate';

export const dynamic = 'force-dynamic';

/**
 * /consent/guardian — the "Ask a parent or guardian" screen as its OWN page (MIRROR-COACH P5, 2026-09-29).
 *
 * app/play/mirror/page.tsx mounts <GuardianConsentGate> inline, in front of the Mirror itself. A locked pain
 * check-in (components/coach/pain-checkin.tsx) has nowhere inline to put the same screen — it is a small chip under
 * one exercise, not a session with a front door — so it links here instead: the identical gate, the identical
 * request flow, just reached as a page rather than wrapped around something. Once a guardian accepts, both doors
 * read the same unlocked status (GET /api/health/guardian).
 */
export default async function GuardianConsentPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Fconsent%2Fguardian');

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <GuardianConsentGate>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
            <h2 className="text-[20px] font-black leading-tight text-white">You&apos;re all set</h2>
            <p className="mt-2 text-[13.5px] leading-snug text-white/70">
              A parent or guardian has said it&apos;s OK. The Mirror and pain check-ins are open now.
            </p>
            <div className="mt-4 space-y-2.5">
              <Link href="/play/mirror" className="block w-full rounded-xl bg-[#00E5FF] py-3 text-[15px] font-bold text-black">
                Go to the Mirror
              </Link>
              <Link href="/training" className="block w-full rounded-xl border border-white/15 bg-transparent py-3 text-[14px] font-semibold text-white/70">
                Back to your programming
              </Link>
            </div>
          </div>
        </div>
      </GuardianConsentGate>
    </div>
  );
}
