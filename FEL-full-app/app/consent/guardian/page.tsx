import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { GuardianConsentGate } from '@/app/play/mirror/_components/guardian-consent-gate';

export const dynamic = 'force-dynamic';

/**
 * /consent/guardian — the "Ask a parent or guardian" screen as its OWN page (MIRROR-COACH P5, 2026-09-29).
 *
 * SAFETY FIX (owner-approved 2026-10-06): the "all set" copy said "The Mirror, pain check-ins and the daily check-in are
 * open now", false since TEEN-WRITE-BLOCK (2026-09-29) took the guardian path off health writes. What an accepted
 * guardian consent unlocks today is one thing: a camp plan going live (app/api/v1/camp/plans 'activate' refuses a minor's
 * plan without it). Pain and readiness POSTs save only for a verified 18+ (canWriteHealthData), and the Mirror runs on
 * the device for everyone, saving nothing under 18 (app/play/mirror/page.tsx). tests/camp/guardian-page-copy.test.ts
 * holds the copy to that code.
 *
 * app/play/mirror/page.tsx mounts <GuardianConsentGate> inline, in front of the Mirror itself. A locked pain
 * check-in (components/coach/pain-checkin.tsx) has nowhere inline to put the same screen — it is a small chip under
 * one exercise, not a session with a front door — so it links here instead: the identical gate, the identical
 * request flow, just reached as a page rather than wrapped around something. Once a guardian accepts, both doors
 * read the same unlocked status (GET /api/health/guardian).
 */
export default async function GuardianConsentPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/consent/guardian'));

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <GuardianConsentGate>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
            <h2 className="text-[20px] font-black leading-tight text-white">You&apos;re all set</h2>
            <p className="mt-2 text-[13.5px] leading-snug text-white/70">
              Nothing more is needed here: you&apos;re 18 or over, or a parent or guardian has said it&apos;s OK. Their OK lets a
              camp plan your coach builds with you go live.
            </p>
            <p className="mt-2 text-[12.5px] leading-snug text-white/55">
              Pain check-ins and the daily check-in save only for players who are 18 or over, so under 18 they stay off, with or
              without a guardian&apos;s OK. The Mirror runs on your device either way; under 18 it keeps nothing.
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
