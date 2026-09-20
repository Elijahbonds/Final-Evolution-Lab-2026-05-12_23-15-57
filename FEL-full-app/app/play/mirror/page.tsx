import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { MirrorHarness } from './_components/mirror-harness';

export const dynamic = 'force-dynamic';

// Neuro-Mechanic Mirror (v1). Client-side biomechanical coaching overlay gated to
// a single movement pattern (split-stance press/row). Camera + pose run entirely
// in the browser; nothing is uploaded. See lib/babylon/nexus/neuro-mirror/.
export default async function MirrorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // Standard chrome — a menu screen with no header/nav is a dead end.
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <MirrorHarness />
    </div>
  );
}
