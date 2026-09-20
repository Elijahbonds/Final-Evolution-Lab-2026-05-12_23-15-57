import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { LadderView } from '@/components/ladder-view';

export const dynamic = 'force-dynamic';

/** /ladder — the mastery ladder: this week's standing, recent seasons, your PRQ grade (pass 5 phase 4). */
export default async function LadderPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-24 text-white">
      <LadderView />
    </div>
  );
}
