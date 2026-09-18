import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { getChallenge } from '@/lib/social/challenge-service';
import { ChallengeLanding } from '@/components/challenge-landing';

export const dynamic = 'force-dynamic';

/**
 * M13 Step 4 — public challenge landing (`/c/<code>`). Reachable logged-out;
 * opening it starts a GUEST-playable ghost duel. Metadata only — no video, no
 * PII. The open is recorded client-side (ensures a guest token first).
 */
export default async function ChallengePage({ params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  const link = await getChallenge(params.code);

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? <AppHeader /> : <PublicTopBar />}
      <main className="mx-auto max-w-[640px] px-4 py-10">
        {!link ? (
          <div className="fel-panel rounded-xl p-8 text-center">
            <h1 className="fel-heading text-2xl font-bold text-white">Challenge not found</h1>
            <p className="mt-2 text-sm text-white/60">
              This challenge link is invalid or has expired.
            </p>
            <a
              href="/try"
              className="mt-6 inline-block rounded-lg bg-[#00E5FF] px-6 py-3 font-bold text-black transition-transform hover:scale-[1.03]"
            >
              Try a dunk instead
            </a>
          </div>
        ) : (
          <ChallengeLanding
            code={link.code}
            modeKey={link.modeKey}
            score={link.score}
            display={link.display}
            tag={link.tag}
            isAuthed={!!session}
          />
        )}
      </main>
      {session ? <BottomNav /> : <PublicLegalFooter />}
    </div>
  );
}
