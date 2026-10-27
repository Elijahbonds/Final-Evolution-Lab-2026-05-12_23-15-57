import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Camera, Swords, Users } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { DoorsRow } from '@/components/shell/doors-row';
import { PlayShelf } from '@/components/shell/play-shelf';
import { SHELF_MODE_COUNT } from '@/lib/nav/families';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { Chip } from '@/components/ui/fel/chip';
import { VenueStrip } from '@/components/shell/venue-strip';
// The season pass came off the retired hub with the venues. It is what playing earns, so it belongs on Play.
import { SeasonPassTrack } from '@/components/season-pass-track';
// MIRROR-PROGRESS (2026-10-07): a coached athlete's door to today's session, first on the page (nothing for anyone else)
import { TodayCard } from '@/components/coach/today-card';
import { todayCardFor } from '@/lib/coach/todayCard';
import { prisma } from '@/lib/db';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** PLAY — every game, on a shelf, grouped into families. */
export default async function PlayPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play'));
  const me = (session.user as { id?: string } | undefined)?.id;
  const todayCard = me ? await todayCardFor(prisma, me) : null;
  // The week card is not on Play any more: it is Profile's one primary and sits on Train (P4 follow-up, 2026-10-27).
  // PREMIUM-UI P4 (2026-10-27): the Venice court at golden hour full-bleed, the shelf's promise in one line, and ONE
  // primary — the Prove It dunk duel, the flagship, docked where a thumb is. Couch and Versus are two quiet doors beside it.
  return (
    <TabPage
      eyebrow={t('play.eyebrow')}
      title={t('play.title')}
      lede={t('play.line', { count: SHELF_MODE_COUNT })}
      hero={{
        image: '/backdrops/dunk.jpg',
        imagePosition: '50% 38%',
        primary: (
          // DUNK-LOOP-HANDSFREE: one obvious way into the camera-forward Prove It flow.
          <PrimaryCta href="/play/dunkduel" docked testId="play-dunk-session-entry" icon={<Camera aria-hidden className="h-5 w-5" />}>
            {t('play.proveIt')}
          </PrimaryCta>
        ),
        chips: (
          <>
            {/* MULTIPLAYER (2026-10-06): the couch — one screen, phones and pads, friends join by QR. */}
            <Chip href="/play/party" testId="play-party-entry" icon={<Users aria-hidden className="h-4 w-4 text-fel-cyan" />}>{t('play.couch')}</Chip>
            <Chip href="/multiplayer" icon={<Swords aria-hidden className="h-4 w-4 text-fel-crimson" />}>{t('play.versus')}</Chip>
          </>
        ),
      }}
    >
      <TodayCard view={todayCard} />
      <PlayShelf />
      <VenueStrip />
      <div className="mt-10 empty:mt-0"><SeasonPassTrack /></div>
      <DoorsRow tab="play" />
    </TabPage>
  );
}
