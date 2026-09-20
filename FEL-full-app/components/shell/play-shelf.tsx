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
import { ChevronRight } from 'lucide-react';
import { FAMILIES, type Family } from '@/lib/nav/families';
import { MODE_INFO } from '@/lib/game-data';

type ModeRow = { key: string; name: string; venue: string; href: string };

function modesOf(f: Family): ModeRow[] {
  const info = MODE_INFO as Record<string, { name?: string; venue?: string; href?: string } | undefined>;
  return f.modes
    .map((key) => {
      const m = info[key];
      return m ? { key, name: m.name ?? key, venue: m.venue ?? '', href: m.href ?? '/' } : null;
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
          <section key={f.id} className="fel-rise" style={{ ['--fel-rise-delay' as string]: `${i * 40}ms` }}>
            <button
              onClick={() => setOpen(isOpen ? null : f.id)}
              aria-expanded={isOpen}
              className="group flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition-all duration-300"
              style={{
                borderColor: isOpen ? `${f.accent}55` : 'rgba(255,255,255,0.08)',
                background: isOpen
                  ? `linear-gradient(90deg, ${f.accent}16 0%, rgba(255,255,255,0.02) 55%)`
                  : 'rgba(255,255,255,0.02)',
                boxShadow: isOpen ? `0 0 42px -18px ${f.accent}` : 'none',
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
                <span className="fel-heading shrink-0 text-[16px] font-bold leading-none text-white">{f.label}</span>
                {/* CLOSED, THE ROW SAYS WHAT IS INSIDE IT. Seven collapsed families with a mood line each filled
                    530px of the page and told you nothing you could act on, directly above a venue grid that shows
                    fourteen places with artwork. Listing the modes makes the shelf worth reading at rest; the
                    family's own line takes over once it is open and the modes are on screen underneath anyway. */}
                <span className="min-w-0 truncate text-[12px] leading-none text-white/35">
                  {isOpen ? f.blurb : modes.map((m) => m.name).join('  ·  ')}
                </span>
              </span>

              <span
                className="shrink-0 font-mono text-[11px] font-bold tabular-nums transition-colors"
                style={{ color: isOpen ? f.accent : 'rgba(255,255,255,0.3)' }}
              >
                {modes.length}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 transition-transform duration-300"
                style={{ color: isOpen ? f.accent : 'rgba(255,255,255,0.25)', transform: isOpen ? 'rotate(90deg)' : 'none' }}
              />
            </button>

            {/* opens in place — a grid that appears under the bubble you pressed */}
            <div
              className="grid overflow-hidden transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}
            >
              <div className="min-h-0">
                <ul className="mt-2 grid gap-2 pl-2 sm:grid-cols-2 lg:grid-cols-3">
                  {modes.map((m) => (
                    <li key={m.key}>
                      <Link
                        href={m.href}
                        className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3
                                   transition-all duration-200 hover:bg-white/[0.05]"
                        style={{ boxShadow: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${f.accent}55`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                      >
                        <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: f.accent }} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold leading-tight text-white">{m.name}</span>
                          {m.venue && venueDistinguishes && (
                            <span className="mt-0.5 block truncate font-mono text-[10.5px] uppercase tracking-wider text-white/35">
                              {m.venue}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
