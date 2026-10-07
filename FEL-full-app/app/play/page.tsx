import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Camera, Swords, Users } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { DoorsRow } from '@/components/shell/doors-row';
import { PlayShelf } from '@/components/shell/play-shelf';
import { SHELF_LEDE } from '@/lib/nav/families';
import { VenueStrip } from '@/components/shell/venue-strip';
// The season pass came off the retired hub with the venues. It is what playing earns, so it belongs on Play.
import { SeasonPassTrack } from '@/components/season-pass-track';
// MIRROR-PROGRESS (2026-10-07): a coached athlete's door to today's session, first on the page (nothing for anyone else)
import { TodayCard } from '@/components/coach/today-card';
import { todayCardFor } from '@/lib/coach/todayCard';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** PLAY — every game, on a shelf, grouped into families. */
export default async function PlayPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play'));
  const me = (session.user as { id?: string } | undefined)?.id;
  const todayCard = me ? await todayCardFor(prisma, me) : null;
  return (
    <TabPage
      eyebrow="Play"
      title="Pick your lane"
      lede={SHELF_LEDE}
      accent="#00E5FF"
      aside={
        <div className="flex flex-wrap items-center gap-2">
          {/* DUNK-LOOP-HANDSFREE: one obvious way in. One tap to the solo dunk session. */}
          <Link
            href="/play/dunkduel"
            data-testid="play-dunk-session-entry"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#FFD700]/60 bg-[#FFD700]/[0.14] px-5 py-3
                       text-base font-black text-white transition-colors hover:bg-[#FFD700]/25"
          >
            <Camera className="h-5 w-5 text-[#FFD700]" /> Dunk session
          </Link>
          {/* MULTIPLAYER (2026-10-06): the couch — one screen, phones and pads, friends join by QR. The first door. */}
          <Link
            href="/play/party"
            data-testid="play-party-entry"
            className="inline-flex items-center gap-2 rounded-xl border border-[#00E5FF]/45 bg-[#00E5FF]/[0.1] min-h-12 px-4 py-2.5
                       text-base font-bold text-white transition-colors hover:bg-[#00E5FF]/20"
          >
            <Users className="h-4 w-4 text-[#00E5FF]" /> Play with friends
          </Link>
          <Link
            href="/multiplayer"
            className="inline-flex items-center gap-2 rounded-xl border border-[#FF3366]/35 bg-[#FF3366]/[0.07] min-h-12 px-4 py-2.5
                       text-base font-bold text-white transition-colors hover:bg-[#FF3366]/15"
          >
            <Swords className="h-4 w-4 text-[#FF3366]" /> Versus
          </Link>
        </div>
      }
    >
      <TodayCard view={todayCard} />
      <PlayShelf />
      <VenueStrip />
      <div className="mt-10 empty:mt-0"><SeasonPassTrack /></div>
      <DoorsRow tab="play" />
    </TabPage>
  );
}
