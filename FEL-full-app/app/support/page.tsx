import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { BUSINESS_CONTACT_EMAIL } from '@/lib/legal/business';
import Link from 'next/link';
import { Mail, FileText, Shield, Award } from 'lucide-react';
import { prisma } from '@/lib/db';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { ReportProblem } from '@/components/report/report-problem';
import { MyStanding } from '@/components/report/my-standing';

export const dynamic = 'force-dynamic';

// Public route: legal pages must be reachable logged-out on every hostname (M12.8).
export default async function SupportPage() {
  const session = await getServerSession(authOptions);
  // SAFETY (SAF-04/05, 2026-10-25): typed text only from a verified adult (the server re-checks; a minor gets the
  // context-only report and preset-only appeals). A read that fails reads as not adult.
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const me = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null) : null;
  const adult = verifiedAdult(me?.dobYear ?? null);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
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
                href={`mailto:${BUSINESS_CONTACT_EMAIL}`}
                className="font-mono text-sm text-[#00E5FF] hover:underline"
              >
                {BUSINESS_CONTACT_EMAIL}
              </a>
            </div>
          </div>
          <p className="mt-3 text-xs text-white/50">
            For account issues, billing questions, bug reports, or feature requests.
            Include your account email and a description of the issue.
          </p>
        </div>

        {/* SAFETY (SAF-04, 2026-10-25): Report a problem — the page, device, last diagnostic and time; nothing about you. */}
        <div className="mt-6">
          <ReportProblem allowText={adult} />
        </div>
        {userId && <MyStanding allowNote={adult} />}

        {/* HOTFIX (2026-09-24): a third card for the credits page. Support is the legal hub a signed-in player reaches
            from the Profile tab, so the licence notices belong here too. */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
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
          <Link
            href="/credits"
            className="fel-card flex items-center gap-3 rounded-xl p-5 transition-all hover:border-white/20"
          >
            <Award className="h-5 w-5 text-[#00E5FF]" />
            <div>
              <h3 className="fel-heading text-sm font-bold text-white">Credits &amp; Licences</h3>
              <p className="text-[10px] text-white/40">Who made what we use</p>
            </div>
          </Link>
        </div>
      </main>
      {session ? null : <PublicLegalFooter />}
    </div>
  );
}
