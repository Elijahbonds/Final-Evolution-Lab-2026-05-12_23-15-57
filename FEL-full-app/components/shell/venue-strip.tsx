import Link from 'next/link';
import { VENUES } from '@/lib/game-data';
import { playableGameVenues } from '@/lib/venueModes';
import { MediaCard } from '@/components/ui/fel/cards';
import { TYPE } from '@/lib/design/type';
import { t } from '@/lib/i18n';

/**
 * The venues, from Play, as a rail of pictures you swipe.
 *
 * The full grid used to sit under the family shelf, which meant scrolling past twenty-eight modes to reach fourteen
 * photographs of where those same modes happen. The grid has its own page (/venues). This was a one-line door to it with
 * four overlapped thumbnails; PREMIUM-UI P4 (2026-10-27, "flat and empty … little imagery") makes it the imagery itself:
 * each venue a picture card that drops straight into its game, the way a console's home shelf does, and the door to the
 * full grid beside the heading.
 */
export function VenueStrip() {
  const playable = playableGameVenues(VENUES).filter((v) => v.image).slice(0, 8);
  return (
    <section aria-labelledby="venue-strip-h" className="mt-10">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 id="venue-strip-h" className={`${TYPE.heading} text-white`}>{t('shell.venues.heading')}</h2>
        <Link href="/venues" className={`${TYPE.label} fel-press inline-flex min-h-11 items-center text-fel-cyan`}>
          {t('shell.venues.browse')} →
        </Link>
      </div>
      <ul className="fel-rail -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
        {playable.map((v) => (
          <li key={v.key} className="w-[68%] shrink-0 snap-start sm:w-[280px]">
            <MediaCard href={v.href ?? '/venues'} image={v.image!} title={v.name} line={v.modes.join(' · ')} aspect="tall" sizes="280px" />
          </li>
        ))}
      </ul>
    </section>
  );
}
