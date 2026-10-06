import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import StoryMap from '@/components/story-map';
import { CellOrb } from '@/components/cell-orb';
import { CommunityReads } from '@/components/create/community-reads';

export const dynamic = 'force-dynamic';

export default async function StoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath('/story'));
  return (
    <div className="min-h-screen bg-[#050505]">
      <StoryMap className="min-h-screen" />
      {/* CREATE HUB (owner 2026-10-06): approved community writing, under the map */}
      <CommunityReads />
      <CellOrb />
    </div>
  );
}
