import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { SignatureView } from '@/components/signature-view';

export const dynamic = 'force-dynamic';

/**
 * M13 Step 3 — weekly Signature Challenge hub. Three seeded hoops challenges
 * (same for everyone this week), 1 attempt/day each, with live leaderboards.
 */
export default async function SignaturePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-4 py-8">
        <h1 className="fel-heading text-3xl font-bold text-white">
          SIGNATURE <span className="text-[#FFD700]">CHALLENGE</span>
        </h1>
        <p className="mt-1 font-mono text-xs text-white/50">
          Three seeded hoops challenges — same for every athlete this week. One shot a day. Climb the board.
        </p>
        <SignatureView />
      </main>
      <BottomNav />
    </div>
  );
}
