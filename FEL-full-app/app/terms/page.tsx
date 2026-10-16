import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { TERMS_CONTENT, CURRENT_POLICY_VERSION } from '@/lib/policies';
import { termsMarkdown } from '@/lib/legal/terms-markdown';
import { LEGAL_PROSE, LEGAL_QUOTE_GOLD } from '@/lib/legal/legalProse';

export const dynamic = 'force-dynamic';

// Public route: legal pages must be reachable logged-out on every hostname (M12.8).
export default async function TermsPage() {
  const session = await getServerSession(authOptions);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
      <main className="mx-auto max-w-[700px] px-4 py-8">
        <div className="fel-panel rounded-xl p-6">
          {/* TW-DEAD-CLASSES: the prose-* classes compiled to nothing (no typography plugin); lib/legal/legalProse.ts */}
          <div className={`${LEGAL_PROSE} ${LEGAL_QUOTE_GOLD}`}>
            <div dangerouslySetInnerHTML={{ __html: termsMarkdown(TERMS_CONTENT) }} />
          </div>
          <div className="mt-4 text-center text-[10px] text-white/30">
            Policy version: {CURRENT_POLICY_VERSION}
          </div>
        </div>
      </main>
      {session ? null : <PublicLegalFooter />}
    </div>
  );
}
