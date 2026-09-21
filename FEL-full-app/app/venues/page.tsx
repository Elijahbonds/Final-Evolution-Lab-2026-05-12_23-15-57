import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { TabPage } from '@/components/shell/tab-page';
import { VenueShelf } from '@/components/shell/venue-shelf';
import { VENUES } from '@/lib/game-data';

export const dynamic = 'force-dynamic';

/**
 * THE PLACES, ON THEIR OWN PAGE.
 *
 * The venue grid was under the family shelf on /play, which asked a player to scroll past twenty-eight modes to
 * reach fourteen photographs of the same modes' locations — two answers to one question, stacked. Play answers
 * "what do I feel like playing". This answers "where", for somebody who thinks that way round, and it gets the
 * room to be the picture-led page it deserves to be instead of a footer.
 */
export default async function VenuesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Fvenues');

  const live = VENUES.filter((v) => v.playable).length;

  return (
    <TabPage
      eyebrow="Venues"
      title="Where you play"
      lede={`${live} places, each with its own games. Pick the room and it opens straight into what happens there.`}
      accent="#00E5FF"
      aside={
        <Link
          href="/play"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2 text-[12.5px]
                     font-bold text-white/60 transition-colors hover:border-white/25 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> All modes
        </Link>
      }
    >
      <VenueShelf heading={null} />
    </TabPage>
  );
}
