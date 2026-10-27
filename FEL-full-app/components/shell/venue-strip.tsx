import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { VENUES } from '@/lib/game-data';
import { playableGameVenues } from '@/lib/venueModes';
import { t } from '@/lib/i18n';

/**
 * The way into the venues, from Play, in one row instead of nine hundred pixels.
 *
 * The full grid used to sit under the family shelf, which meant scrolling past twenty-eight modes to reach
 * fourteen photographs of where those same modes happen — the same question answered twice, stacked. The grid
 * has its own page now. This is the door to it, and it is a picture door rather than a word in a list, because
 * the artwork is the reason anybody would want to browse that way at all.
 */
export function VenueStrip() {
  const playable = playableGameVenues(VENUES);
  const withArt = playable.filter((v) => v.image).slice(0, 4);

  return (
    <Link
      href="/venues"
      className="group mt-6 flex items-center gap-4 overflow-hidden rounded-2xl border border-white/8
                 bg-white/[0.02] p-3 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
    >
      {/* A few of the places, overlapped like a stack of prints. */}
      <span aria-hidden className="flex shrink-0 -space-x-4">
        {withArt.map((v, i) => (
          <span
            key={v.key}
            className="relative h-14 w-14 overflow-hidden rounded-xl border-2 border-fel-bg transition-transform duration-300 group-hover:translate-x-0"
            style={{ zIndex: withArt.length - i, transform: `rotate(${(i - 1.5) * 2.5}deg)` }}
          >
            <Image src={v.image!} alt="" fill sizes="56px" className="object-cover opacity-80" />
          </span>
        ))}
      </span>

      <span className="min-w-0 flex-1">
        <span className="fel-heading block text-[16px] font-bold leading-tight text-white">{t('shell.venues.browse')}</span>
        <span className="mt-1 block truncate text-[12.5px] text-fel-dim">
          {t('shell.venues.browseLine', { count: playable.length })}
        </span>
      </span>

      <ArrowRight className="h-4 w-4 shrink-0 text-fel-quiet transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white/70" />
    </Link>
  );
}
