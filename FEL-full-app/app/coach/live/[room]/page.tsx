import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { coachLiveEnabled } from '@/lib/coach/live/flag';
import { parseRoomId } from '@/lib/coach/live/gate';
import { LiveRoom } from '@/components/coach/live/live-room';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** COACH-LIVE (2026-10-25): /coach/live/p_<programId> | b_<bookingId>. The door itself is the API's (GET /api/coach/live). */
export default async function LivePage({ params }: { params: { room: string } }) {
  if (!coachLiveEnabled() || !parseRoomId(params.room)) notFound();
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath(`/coach/live/${params.room}`));
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <LiveRoom room={params.room} />
    </div>
  );
}
