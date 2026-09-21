import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Swords } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { TabPage } from '@/components/shell/tab-page';
import { DoorsRow } from '@/components/shell/doors-row';
import { PlayShelf } from '@/components/shell/play-shelf';
import { VenueStrip } from '@/components/shell/venue-strip';
// The season pass came off the retired hub with the venues. It is what playing earns, so it belongs on Play.
import { SeasonPassTrack } from '@/components/season-pass-track';

export const dynamic = 'force-dynamic';

/** PLAY — every game, on a shelf, grouped into families. */
export default async function PlayPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Fplay');
  return (
    <TabPage
      eyebrow="Play"
      title="Pick your lane"
      lede="Seven families, twenty-eight modes. Open one to see what is inside."
      accent="#00E5FF"
      aside={
        <Link
          href="/multiplayer"
          className="inline-flex items-center gap-2 rounded-xl border border-[#FF3366]/35 bg-[#FF3366]/[0.07] px-4 py-2.5
                     text-[13px] font-bold text-white transition-colors hover:bg-[#FF3366]/15"
        >
          <Swords className="h-4 w-4 text-[#FF3366]" /> Versus
        </Link>
      }
    >
      <PlayShelf />
      <VenueStrip />
      <div className="mt-10 empty:mt-0"><SeasonPassTrack /></div>
      <DoorsRow tab="play" />
    </TabPage>
  );
}
