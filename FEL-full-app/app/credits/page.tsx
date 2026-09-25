import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { CreditsList } from '@/components/credits/credits-list';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Credits & licences · Final Evolution Lab' };

// HOTFIX (2026-09-24): there was no credits page, and CMU's acknowledgement (a condition of using its motion data)
// appeared nowhere in the app. Public like /terms and /privacy: a licence notice has to be readable logged-out.
export default async function CreditsPage() {
  const session = await getServerSession(authOptions);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
      <main className="mx-auto max-w-[700px] px-4 py-8">
        <CreditsList />
      </main>
      {session ? null : <PublicLegalFooter />}
    </div>
  );
}
