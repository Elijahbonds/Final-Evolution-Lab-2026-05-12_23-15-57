import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { COACH_TERMS_SECTIONS, COACH_TERMS_DOC_VERSION } from '@/lib/coach-terms';
import { renderStoreTerms } from '@/lib/store-terms/render';
import { LEGAL_PROSE, LEGAL_QUOTE_GOLD } from '@/lib/legal/legalProse';

export const dynamic = 'force-dynamic';

// OWNER-APPROVALS (2026-10-27, card C12): the public Coach Terms and Payout Terms page — the text a coach ticks before
// Stripe onboarding (lib/payments/terms.ts COACH_TERMS_HREF).
// Drafted by Claude 2026-10-27 on owner approval; not lawyer-reviewed.
// Rendered by the store terms' SAFE renderer (escaped text, "/" links only, anchored sections), like
// /store-terms. Public route: legal pages must be reachable logged-out on every hostname (M12.8).
export default async function CoachTermsPage() {
  const session = await getServerSession(authOptions);
  const html = renderStoreTerms(COACH_TERMS_SECTIONS);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
      <main className="mx-auto max-w-[700px] px-4 py-8">
        <div className="fel-panel rounded-xl p-6">
          <div className={`${LEGAL_PROSE} ${LEGAL_QUOTE_GOLD}`}>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          <div className="mt-4 text-center text-[10px] text-white/30">
            Coach terms version: {COACH_TERMS_DOC_VERSION}
          </div>
        </div>
      </main>
      {session ? null : <PublicLegalFooter />}
    </div>
  );
}
