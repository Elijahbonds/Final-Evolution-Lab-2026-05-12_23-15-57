import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import StoryMap from '@/components/story-map';
import { CellOrb } from '@/components/cell-orb';

export const dynamic = 'force-dynamic';

export default async function StoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505]">
      <StoryMap className="min-h-screen" />
      <CellOrb />
    </div>
  );
}
