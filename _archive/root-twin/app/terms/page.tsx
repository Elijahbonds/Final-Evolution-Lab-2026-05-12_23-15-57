import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { TERMS_CONTENT, CURRENT_POLICY_VERSION } from '@/lib/policies';

export const dynamic = 'force-dynamic';

// Public route: legal pages must be reachable logged-out on every hostname (M12.8).
export default async function TermsPage() {
  const session = await getServerSession(authOptions);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? <AppHeader /> : <PublicTopBar />}
      <main className="mx-auto max-w-[700px] px-4 py-8">
        <div className="fel-panel rounded-xl p-6">
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:fel-heading prose-headings:text-white
            prose-p:text-white/70 prose-li:text-white/70
            prose-blockquote:border-[#FFD700]/40 prose-blockquote:text-[#FFD700]/80
            prose-strong:text-white prose-em:text-white/50">
            <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(TERMS_CONTENT) }} />
          </div>
          <div className="mt-4 text-center text-[10px] text-white/30">
            Policy version: {CURRENT_POLICY_VERSION}
          </div>
        </div>
      </main>
      {session ? <BottomNav /> : <PublicLegalFooter />}
    </div>
  );
}

function simpleMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
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
