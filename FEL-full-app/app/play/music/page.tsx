import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { MusicLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function MusicPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play/music'));
  // MUSIC-SUITE P3 (2026-09-25), P2's open item: the room keys its owned-kits cache to the signed-in player, so a shared
  // device never shows one player's kits to another while GET /api/music/unlock (the truth) is on its way. The id is the
  // session's own (lib/auth.ts puts token.sub there); only this player's cache key is built from it, on this device.
  const playerId = (session.user as { id?: unknown } | undefined)?.id;
  return (
    <Suspense fallback={<div className="grid min-h-[60vh] place-items-center bg-[#050505] text-sm text-white/60">Loading music room...</div>}>
      <MusicLoader playerId={typeof playerId === 'string' && playerId ? playerId : null} />
    </Suspense>
  );
}
