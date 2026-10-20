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
    // pb-28 on a phone: the room the tab pages leave for the bottom bar (TabPage). This page had none, so its last 42 px sat
    // under the tab bar even scrolled to the end, and 81 px with the soundtrack strip (PHONE-FIRST-SCREEN, 2026-10-17).
    <div className="min-h-screen bg-[#050505] pb-28 md:pb-0">
      <StoryMap className="min-h-screen" />
      {/* CREATE HUB (owner 2026-10-06): approved community writing, under the map */}
      <CommunityReads />
      <CellOrb />
    </div>
  );
}
