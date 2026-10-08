import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { STORE_TERMS_SECTIONS, STORE_TERMS_VERSION, storeTermsText, withBusinessAddress } from '@/lib/store-terms';
import { BUSINESS_MAILING_ADDRESS } from '@/lib/legal/business';

export const dynamic = 'force-dynamic';

// STORE-TERMS-2: the public coach-store terms page (Terms of Service + Refund & Cancellation Policy,
// store-terms-2026-10-04). Public route: legal pages must be reachable logged-out on every hostname (M12.8).
// The business address is NEVER typed here — the {BUSINESS_ADDRESS} token in the approved text is filled
// from lib/legal/business.ts at render time.
export default async function StoreTermsPage() {
  const session = await getServerSession(authOptions);
  const text = withBusinessAddress(storeTermsText(STORE_TERMS_SECTIONS), BUSINESS_MAILING_ADDRESS);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
      <main className="mx-auto max-w-[700px] px-4 py-8">
        <div className="fel-panel rounded-xl p-6">
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:fel-heading prose-headings:text-white
            prose-p:text-white/70 prose-li:text-white/70
            prose-blockquote:border-[#FFD700]/40 prose-blockquote:text-[#FFD700]/80
            prose-strong:text-white prose-em:text-white/50">
            <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(text) }} />
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

// The same minimal markdown the general /terms and /privacy pages use (headings, bold, italics, lists,
// blockquotes, links).
function simpleMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<)(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[123]>)/g, '$1')
    .replace(/(<\/h[123]>)<\/p>/g, '$1')
    .replace(/<p>(<blockquote>)/g, '$1')
    .replace(/(<\/blockquote>)<\/p>/g, '$1')
    .replace(/<p>(<ul>)/g, '$1')
    .replace(/(<\/ul>)<\/p>/g, '$1');
}
