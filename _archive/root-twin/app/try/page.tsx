import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { GuestDunkShell } from '@/components/games/guest-dunk-shell';

export const dynamic = 'force-dynamic';

/**
 * M13 Step 1 — guest landing ("60 seconds to a dunk"). Logged-out visitors can
 * play a full dunk contest with an anonymous server-issued session (no PII).
 * Authed users are sent to the real dunk experience. `?c=<code>` accepts a
 * challenge ghost-duel.
 */
export default async function TryPage({ searchParams }: { searchParams: { c?: string } }) {
  const session = await getServerSession(authOptions);
  const code = typeof searchParams?.c === 'string' ? searchParams.c : null;
  if (session) {
    redirect(code ? `/play/dunk?c=${code}` : '/play/dunk');
  }
  return <GuestDunkShell challengeCode={code} />;
}
