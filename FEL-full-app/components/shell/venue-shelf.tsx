'use client';

// VenueShelf — the places, under the modes, on the Play tab.
//
// This grid used to live on the signed-in home page, which was a fourth front door competing with the three tabs:
// seven tiles and three banners that all pointed at things the tabs now own. The grid itself was the best-looking
// surface in the product and it was on the one screen there was no reason to visit. So the hub goes and this
// comes here, where "which court do I want to be on" is the question actually being asked.
//
// Two ways to choose a game, on purpose. The family shelf above answers "what do I feel like playing"; this
// answers "where". A mastery badge on a venue is the only earned mark on the page, so it is the only badge.

import { useEffect, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Lock, Play } from 'lucide-react';
import { VENUES } from '@/lib/game-data';
import { MasteryBadge } from '@/components/mastery-badge';

/** A venue's /play/<route> slug is not the camelCase key its sessions post under; this is that map. */
const ROUTE_TO_MODE: Record<string, string> = {
  karate: 'karateEndless', dunk: 'dunkContest', tennis: 'tennis', 'brain-brawl': 'brainBrawl',
  skateboard: 'skateboarding', snowboard: 'snowboarding', surf: 'surfing', golf: 'golf',
  soccer: 'soccer', baseball: 'baseball', football: 'football', freerun: 'freerun', training: 'training',
};

function venueModeKey(href?: string): string | null {
  const slug = (href ?? '').split('/play/')[1]?.split(/[?#]/)[0];
  return slug ? ROUTE_TO_MODE[slug] ?? slug : null;
}

export function VenueShelf({ heading = 'Venues' }: { heading?: string | null } = {}) {
  const [mastery, setMastery] = useState<Record<string, { tierIndex: number }>>({});

  useEffect(() => {
    let live = true;
    fetch('/api/mastery')
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => { if (live && j?.mastery) setMastery(j.mastery); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const live = VENUES.filter((v) => v.playable).length;
  const soon = VENUES.length - live;

  return (
    <section className={heading ? 'mt-12' : ''}>
      {heading ? (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="fel-heading text-[19px] font-bold text-white">{heading}</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
            {live} live{soon > 0 && ` · ${soon} coming`}
          </span>
        </div>
      ) : (
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
          {live} live{soon > 0 && ` · ${soon} coming`}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VENUES.map((venue, i) => {
          const key = venueModeKey(venue.href);
          const tier = key ? mastery[key]?.tierIndex ?? 0 : 0;
          const card = (
            <div
              className={`group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]
                          transition-all duration-500 ${venue.playable ? 'hover:border-white/20' : ''}`}
            >
              <div className="relative aspect-video bg-[#0B0B0F]">
                {venue.image ? (
                  <Image
                    src={venue.image}
                    alt={`${venue.name} venue artwork`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover opacity-75 transition-all duration-700 group-hover:scale-[1.04] group-hover:opacity-95"
                  />
                ) : (
                  // A venue whose art has not shipped yet gets a branded tile rather than a grey hole.
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(168,85,247,0.35)_0%,rgba(0,229,255,0.14)_55%,rgba(5,5,5,0.95)_100%)]">
                    <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
                      <span className="fel-heading text-[22px] font-black uppercase leading-none tracking-tight text-white/80">
                        {venue.name}
                      </span>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-transparent" />
                {!venue.playable && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-2.5 py-1.5
                                     font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                      <Lock className="h-3 w-3" /> Coming soon
                    </span>
                  </div>
                )}
                {venue.playable && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5
                                   font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#00FF9D] ring-1 ring-[#00FF9D]/40">
                    <Play className="h-2.5 w-2.5" /> Live
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 p-4">
                <div className="min-w-0">
                  <h3 className="fel-heading text-[17px] font-bold leading-tight text-white">{venue.name}</h3>
                  <p className="mt-1 line-clamp-1 text-[12px] text-white/35">{(venue.modes ?? []).join(' · ')}</p>
                </div>
                {tier ? <MasteryBadge tierIndex={tier} className="ml-auto shrink-0" /> : null}
              </div>
            </div>
          );
          return (
            <li key={venue.key} className="fel-rise" style={{ '--fel-rise-delay': `${Math.min(i, 8) * 45}ms` } as React.CSSProperties}>
              {venue.playable && venue.href ? <Link href={venue.href}>{card}</Link> : card}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
