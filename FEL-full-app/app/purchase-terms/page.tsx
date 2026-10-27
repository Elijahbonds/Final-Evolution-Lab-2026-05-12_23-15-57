import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { PURCHASE_TERMS_SECTIONS, PURCHASE_TERMS_VERSION } from '@/lib/purchase-terms';
import { renderStoreTerms } from '@/lib/store-terms/render';
import { LEGAL_PROSE, LEGAL_QUOTE_GOLD } from '@/lib/legal/legalProse';

export const dynamic = 'force-dynamic';

// OWNER-APPROVALS (2026-10-27, card C28): the public Purchase Terms and Refund Policy page — the text a buyer ticks before
// paying for FEL Pro or a coach's package (lib/payments/terms.ts BUYER_TERMS).
// Drafted by Claude 2026-10-27 on owner approval; not lawyer-reviewed.
// Rendered by the store terms' SAFE renderer (escaped text, "/" links only, anchored
// sections), like /store-terms. Public route: legal pages must be reachable logged-out on every hostname (M12.8).
export default async function PurchaseTermsPage() {
  const session = await getServerSession(authOptions);
  const html = renderStoreTerms(PURCHASE_TERMS_SECTIONS);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
      <main className="mx-auto max-w-[700px] px-4 py-8">
        <div className="fel-panel rounded-xl p-6">
          <div className={`${LEGAL_PROSE} ${LEGAL_QUOTE_GOLD}`}>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          <div className="mt-4 text-center text-[10px] text-white/30">
            Purchase terms version: {PURCHASE_TERMS_VERSION}
          </div>
        </div>
      </main>
      {session ? null : <PublicLegalFooter />}
    </div>
  );
}
