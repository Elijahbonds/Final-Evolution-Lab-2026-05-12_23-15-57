'use client';

// PlayShelf — the game shelf, grouped.
//
// It replaces a flat two-column grid of 37 tiles. The measurement that justified the change: a player looking for
// basketball scrolled past karate, a kart, a marketplace and a music academy to reach it, and nothing on the page
// said which of those was a sport, a hub or a storefront.
//
// Families are bubbles. Tapping one opens it in place — no navigation, no page load, no losing your spot — and the
// modes inside carry their family's colour so the shelf you are standing in front of is always obvious. One family
// is open at a time, because two open families is the grid again with extra steps.

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { FAMILIES, type Family } from '@/lib/nav/families';
import { MODE_INFO } from '@/lib/game-data';
import { modeMenuMetaFor } from '@/lib/mode-menu';
import { isUnlistedMode } from '@/lib/unlisted-modes';
import { PartyBadge } from '@/components/party/party-badge';   // MULTIPLAYER: "2 PLAYERS" on the games friends can play together
import { COLOR } from '@/lib/design/tokens';
import { TYPE } from '@/lib/design/type';
import { enterDelay } from '@/components/ui/fel/page-enter';

type ModeRow = { key: string; name: string; venue: string; href: string; desc: string; color: string; Icon: LucideIcon };

function modesOf(f: Family): ModeRow[] {
  const info = MODE_INFO as Record<string, { name?: string; venue?: string; href?: string } | undefined>;
  return f.modes
    // IRON-PARADISE-OUT (2026-10-03): a parked mode (lib/unlisted-modes.ts) never renders as a shelf row.
    .filter((key) => !isUnlistedMode(key))
    .map((key) => {
      const m = info[key];
      if (!m) return null;
      const meta = modeMenuMetaFor(key);
      return { key, name: m.name ?? key, venue: m.venue ?? '', href: m.href ?? '/', desc: meta.desc, color: meta.color, Icon: meta.icon };
    })
    .filter((x): x is ModeRow => x !== null);
}

export function PlayShelf({ initialFamily }: { initialFamily?: string }) {
  const [open, setOpen] = useState<string | null>(initialFamily ?? FAMILIES[0].id);

  return (
    <div className="space-y-2">
      {FAMILIES.map((f, i) => {
        const isOpen = open === f.id;
        const modes = modesOf(f);
        // A VENUE THAT EVERY MODE SHARES IS NOT INFORMATION. All five hoops modes read "VENICE BEACH COURT"; printing
        // it five times is the clutter this shelf exists to remove, so it is shown only where it tells them apart.
        const venues = new Set(modes.map((m) => m.venue).filter(Boolean));
        const venueDistinguishes = venues.size > 1;
        return (
          <section key={f.id} className="fel-enter" style={enterDelay(i, 40)}>
            <button
              onClick={() => setOpen(isOpen ? null : f.id)}
              aria-expanded={isOpen}
              className="fel-press group flex min-h-[64px] w-full items-center gap-3.5 rounded-[20px] border px-4 py-3 text-left"
              style={{
                borderColor: isOpen ? `${f.accent}55` : 'rgba(255,255,255,0.08)',
                background: isOpen
                  ? `linear-gradient(90deg, ${f.accent}16 0%, rgba(255,255,255,0.02) 55%)`
                  : 'linear-gradient(180deg, #12161c 0%, #0b0e12 100%)',
                boxShadow: isOpen ? `0 0 42px -18px ${f.accent}, var(--fel-highlight)` : 'var(--fel-highlight)',
              }}
            >
              {/* The bubble: the family's colour as an object, not a border. The mode count used to live inside it,
                  which made a coloured disc with a number in it — the shape of an unread badge, reading as "seven
                  things need you" rather than "seven games are in here". The count is now a quiet figure on the
                  right, where a count belongs. */}
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover:scale-110"
                style={{
                  background: `radial-gradient(circle at 30% 28%, ${f.accent}, ${f.accent}22 70%)`,
                  boxShadow: `0 0 20px -6px ${f.accent}`,
                }}
              />

              <span className="flex min-w-0 flex-1 items-baseline gap-3">
                <span className={`${TYPE.heading} shrink-0 leading-none text-white`}>{f.label}</span>
                {/* CLOSED, THE ROW SAYS WHAT IS INSIDE IT. Seven collapsed families with a mood line each filled
                    530px of the page and told you nothing you could act on, directly above a venue grid that shows
                    fourteen places with artwork. Listing the modes makes the shelf worth reading at rest; the
                    family's own line takes over once it is open and the modes are on screen underneath anyway. */}
                <span className={`${TYPE.small} min-w-0 truncate leading-none text-fel-dim`}>
                  {isOpen ? f.blurb : modes.map((m) => m.name).join('  ·  ')}
                </span>
              </span>

              <span
                className="shrink-0 font-sans text-[12px] font-semibold tabular-nums transition-colors"
                style={{ color: isOpen ? f.accent : COLOR.textQuiet }}
              >
                {modes.length}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 transition-transform duration-300"
                style={{ color: isOpen ? f.accent : COLOR.textQuiet, transform: isOpen ? 'rotate(90deg)' : 'none' }}
              />
            </button>

            {/* opens in place — a grid that appears under the bubble you pressed. CLOSED IS INERT (A11-01, 2026-10-25): the
                collapsed grid is 0 px tall and transparent, but its links were still in the tab order — the audit's Tab
                pass walked into 16 invisible games on /play, and a pad or remote would too. `inert` takes a closed family
                out of focus and out of the accessibility tree; opening it puts them back. */}
            <div
              className="grid overflow-hidden transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}
              {...(isOpen ? {} : { inert: '' })}
            >
              <div className="min-h-0">
                <ul className="mt-2 grid gap-2 pl-2 sm:grid-cols-2 lg:grid-cols-3">
                  {modes.map((m) => {
                    const Icon = m.Icon;
                    return (
                      <li key={m.key}>
                        <Link
                          href={m.href}
                          className="fel-press flex items-center gap-3 rounded-[16px] border border-white/8 bg-white/[0.02] px-3 py-3
                                     hover:bg-white/[0.05]"
                          style={{ boxShadow: 'none' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${m.color}66`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                        >
                          <span
                            aria-hidden
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] border"
                            style={{
                              borderColor: `${m.color}55`,
                              background: `linear-gradient(135deg, ${m.color}22, rgba(255,255,255,0.03))`,
                              color: m.color,
                            }}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className={`${TYPE.body} block truncate font-semibold leading-tight text-white`}>{m.name} <PartyBadge modeKey={m.key} className="ml-1" /></span>
                            {/* premium-ui P10: on a phone the row is the game's name — a label, not a sentence; the line returns from sm up */}
                            <span className={`${TYPE.small} mt-0.5 hidden truncate text-fel-dim sm:block`}>{m.desc}</span>
                            {m.venue && venueDistinguishes && (
                              <span className="mt-1.5 block truncate font-sans text-[12px] uppercase tracking-[0.14em] text-fel-quiet">
                                {m.venue}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
