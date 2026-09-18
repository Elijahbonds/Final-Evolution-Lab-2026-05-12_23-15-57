import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import Link from 'next/link';
import { Mail, FileText, Shield } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Public route: legal pages must be reachable logged-out on every hostname (M12.8).
export default async function SupportPage() {
  const session = await getServerSession(authOptions);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? <AppHeader /> : <PublicTopBar />}
      <main className="mx-auto max-w-[700px] px-4 py-8">
        <h1 className="fel-heading text-3xl font-bold text-white">SUPPORT</h1>
        <p className="mt-2 text-sm text-white/50">
          Need help? We’re here for you. Expect a response within 48 hours.
        </p>

        <div className="mt-6 fel-panel rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/30">
              <Mail className="h-5 w-5 text-[#00E5FF]" />
            </div>
            <div>
              <h2 className="fel-heading text-lg font-bold text-white">Contact Us</h2>
              <a
                href="mailto:support@finalevolutionlab.com"
                className="font-mono text-sm text-[#00E5FF] hover:underline"
              >
                support@finalevolutionlab.com
              </a>
            </div>
          </div>
          <p className="mt-3 text-xs text-white/50">
            For account issues, billing questions, bug reports, or feature requests.
            Include your account email and a description of the issue.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/terms"
            className="fel-card flex items-center gap-3 rounded-xl p-5 transition-all hover:border-white/20"
          >
            <FileText className="h-5 w-5 text-[#FFD700]" />
            <div>
              <h3 className="fel-heading text-sm font-bold text-white">Terms of Service</h3>
              <p className="text-[10px] text-white/40">Usage terms &amp; conditions</p>
            </div>
          </Link>
          <Link
            href="/privacy"
            className="fel-card flex items-center gap-3 rounded-xl p-5 transition-all hover:border-white/20"
          >
            <Shield className="h-5 w-5 text-[#A855F7]" />
            <div>
              <h3 className="fel-heading text-sm font-bold text-white">Privacy Policy</h3>
              <p className="text-[10px] text-white/40">How we handle your data</p>
            </div>
          </Link>
        </div>
      </main>
      {session ? <BottomNav /> : <PublicLegalFooter />}
    </div>
  );
}
