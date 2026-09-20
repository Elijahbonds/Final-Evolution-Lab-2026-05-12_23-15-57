import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { MultiplayerLobby } from '@/components/mp/multiplayer-lobby';

export const dynamic = 'force-dynamic';

/**
 * P6 — async multiplayer arena (online challenge codes + local pass-and-play).
 * Not realtime: players compete on their own time; the server settles the
 * match and banks rewards. Auth required.
 */
export default async function MultiplayerPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <MultiplayerLobby />
    </div>
  );
}
