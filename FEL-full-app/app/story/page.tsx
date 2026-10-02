import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { TabPage } from '@/components/shell/tab-page';
import StoryMap from '@/components/story-map';
import { CellOrb } from '@/components/cell-orb';

export const dynamic = 'force-dynamic';

export default async function StoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <TabPage
        eyebrow="Story"
        title="The Nexus Initiative"
        lede="Run the campaign map, or jump into the standalone Nexus rail and Vertigo boss trials."
        accent="#00E5FF"
        aside={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/story/rail"
              className="rounded-xl border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#00E5FF]/18"
            >
              Nexus Rail
            </Link>
            <Link
              href="/story/boss"
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-amber-400/18"
            >
              The Vertigo
            </Link>
          </div>
        }
      >
        <StoryMap className="min-h-[640px] overflow-hidden rounded-3xl border border-white/[0.08]" />
      </TabPage>
      <CellOrb />
    </div>
  );
}
