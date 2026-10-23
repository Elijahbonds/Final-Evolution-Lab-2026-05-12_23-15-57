import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { LiveView } from '@/components/live-view';
import { isLiveStreamScheduleEnabled } from '@/lib/flags';

export const dynamic = 'force-dynamic';

export default async function LivePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/live'));
  const scheduleEnabled = isLiveStreamScheduleEnabled();
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <LiveView scheduleEnabled={scheduleEnabled} />
    </div>
  );
}
