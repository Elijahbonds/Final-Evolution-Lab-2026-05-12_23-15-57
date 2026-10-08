import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { STORE_TERMS_SECTIONS, STORE_TERMS_VERSION, BUSINESS_ADDRESS_TOKEN } from '@/lib/store-terms';
import { renderStoreTerms } from '@/lib/store-terms/render';
import { REAL_MAILING_ADDRESS, isMailingAddressSet, renderMailingAddress } from '@/lib/legal/business';

export const dynamic = 'force-dynamic';

// STORE-TERMS: the public coach-store terms page (Terms of Service + Refund & Cancellation Policy,
// store-terms-2026-10-04). Public route: legal pages must be reachable logged-out on every hostname (M12.8).
// The address is NEVER typed here. While REAL_MAILING_ADDRESS (lib/legal/business.ts) is unset, the lines that
// would print it are dropped at render time, along with the mailing-address section; once set, the
// {BUSINESS_ADDRESS} token in the approved text is filled from it.
// STORE-TERMS-3 (T2): the markdown goes through the SAFE renderer (lib/store-terms/render.ts), which
// escapes every text cell, emits only "/" links, and wraps each section in a stable <section id> anchor.
export default async function StoreTermsPage() {
  const session = await getServerSession(authOptions);
  // Fill (or drop) the address token section-by-section, then render each section with its anchor id.
  const addressSet = isMailingAddressSet(REAL_MAILING_ADDRESS);
  const sections = STORE_TERMS_SECTIONS.filter((s) => addressSet || s.id !== 'mailing-address').map((s) => ({
    ...s,
    markdown: renderMailingAddress(s.markdown, BUSINESS_ADDRESS_TOKEN, REAL_MAILING_ADDRESS),
  }));
  const html = renderStoreTerms(sections);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
      <main className="mx-auto max-w-[700px] px-4 py-8">
        <div className="fel-panel rounded-xl p-6">
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:fel-heading prose-headings:text-white
            prose-p:text-white/70 prose-li:text-white/70
            prose-blockquote:border-[#FFD700]/40 prose-blockquote:text-[#FFD700]/80
            prose-strong:text-white prose-em:text-white/50
            prose-a:text-cyan-300 prose-a:underline
            prose-table:w-full prose-td:border prose-td:border-white/10 prose-td:px-2 prose-td:py-1 prose-td:align-top">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          <div className="mt-4 text-center text-[10px] text-white/30">
            Store terms version: {STORE_TERMS_VERSION}
          </div>
        </div>
      </main>
      {session ? null : <PublicLegalFooter />}
    </div>
  );
}
