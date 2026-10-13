import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { TERMS_CONTENT, CURRENT_POLICY_VERSION } from '@/lib/policies';
import { termsMarkdown } from '@/lib/legal/terms-markdown';

export const dynamic = 'force-dynamic';

// Public route: legal pages must be reachable logged-out on every hostname (M12.8).
export default async function TermsPage() {
  const session = await getServerSession(authOptions);
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
