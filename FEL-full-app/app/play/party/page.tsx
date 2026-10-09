import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { PartyLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * PLAY WITH FRIENDS (MULTIPLAYER lane, 2026-10-06) — the party room: one screen, a QR, phones and pads as controllers,
 * a game shelf, rematches. The HOST is signed in like every /play page; the friends who join are not asked to be
 * (/controller/<code> is the guest side). `?mode=<id>` arrives with a game already picked (the "play with friends"
 * links on the shelf, a mode's start screen and its results card).
 */
export default async function PartyPage({ searchParams }: { searchParams?: { mode?: string } }) {
  const session = await getServerSession(authOptions);
  const mode = typeof searchParams?.mode === 'string' ? searchParams.mode : null;
  if (!session) redirect(loginPath(mode ? `/play/party?mode=${encodeURIComponent(mode)}` : '/play/party'));
  return <PartyLoader initialMode={mode} />;
}
