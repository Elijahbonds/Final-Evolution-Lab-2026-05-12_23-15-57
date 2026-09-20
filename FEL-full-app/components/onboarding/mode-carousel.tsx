'use client';

// ModeCarousel — the games, as a thing you swipe, on the screen where you decide to join.
//
// It replaces a strip of six hardcoded sports on the sign-up form that saved your pick to localStorage and then
// sent you to the home page and forgot it. You told it what you came for and it shrugged.
//
// ABOUT "LIVE PREVIEW". The focused card preloads its mode's route and chunk, so pressing play enters a game that
// is already fetched rather than starting a download. That is the part that changes how it FEELS. What it is not
// is a running 3D scene per card: that would mean several Babylon contexts alive at once on a phone, and this
// codebase has a whole lane of work about exactly that going wrong (loseContextOnDispose, the scene the engine
// keeps a handle to after dispose). A `clip` field is on the shape so a captured loop can be dropped in per mode
// the day those exist — scripts/capture-mode-play.mts is the tool that would make them — and the card plays it
// instead of the still without any other change.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MODE_INFO } from '@/lib/game-data';
import { artFor, carouselOrder } from '@/lib/onboarding/firstRun';

export interface CarouselProps {
  /** The mode to open on — a creator's signature game when a card brought them here. */
  lead?: string | null;
  /** The currently chosen mode key. */
  value: string;
  onChange: (modeKey: string) => void;
  /** The host's accent, so a scanned card carries its owner's colour through the whole arrival. */
  accent?: string | null;
}

export function ModeCarousel({ lead, value, onChange, accent }: CarouselProps) {
  const router = useRouter();
  const railRef = useRef<HTMLUListElement | null>(null);
  // THE HOST ARRIVES AFTER THE FIRST RENDER. /api/onboarding/host is a fetch, so `lead` is null on mount and
  // becomes the creator's mode a moment later. Freezing the order in useState meant the banner said "you are
  // starting in Venice Lines" while the rail still opened on the default — the page contradicting itself.
  const order = useMemo(() => carouselOrder(lead), [lead]);
  const prefetched = useRef(new Set<string>());

  const accentOf = accent && /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : '#00E5FF';

  // Preload the focused game. Entry then starts from a cache rather than from the network, which is the whole
  // difference between "tap and wait" and "tap and you are in".
  useEffect(() => {
    const href = MODE_INFO[value]?.href;
    if (!href || prefetched.current.has(href)) return;
    prefetched.current.add(href);
    try { router.prefetch(href); } catch { /* prefetch is an optimisation, never a requirement */ }
  }, [value, router]);

  const scrollToIndex = useCallback((i: number) => {
    const rail = railRef.current;
    const card = rail?.children[i] as HTMLElement | undefined;
    if (!rail || !card) return;
    rail.scrollTo({ left: card.offsetLeft - rail.offsetLeft - 16, behavior: 'smooth' });
  }, []);

  const step = (dir: -1 | 1) => {
    const i = order.indexOf(value);
    const next = Math.min(order.length - 1, Math.max(0, i + dir));
    onChange(order[next]);
    scrollToIndex(next);
  };

  // Open on the lead card rather than making somebody swipe to the thing they were sent for. Keyed on the order
  // itself, so it also runs the moment the host resolves and the order changes underneath.
  useEffect(() => {
    const i = order.indexOf(value);
    if (i > 0) scrollToIndex(i);
    // Deliberately not keyed on `value`: a tap should not yank the rail out from under the thumb that made it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
          Your first game
        </p>
        <div className="hidden gap-1.5 sm:flex">
          {([-1, 1] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => step(d)}
              aria-label={d === -1 ? 'Previous game' : 'Next game'}
              className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-white/45
                         transition-colors hover:border-white/30 hover:text-white"
            >
              {d === -1 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      {/* A rail that snaps. On a phone this is the whole interaction — thumb, swipe, tap — and the cards are
          sized so the next one peeks in and tells you there is more without needing an arrow. */}
      <ul
        ref={railRef}
        className="fel-rail -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
      >
        {order.map((key) => {
          const info = MODE_INFO[key];
          const art = artFor(key);
          const on = value === key;
          return (
            <li key={key} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onChange(key)}
                onMouseEnter={() => { const h = info.href; if (h && !prefetched.current.has(h)) { prefetched.current.add(h); try { router.prefetch(h); } catch { /* optional */ } } }}
                aria-pressed={on}
                className="group relative block h-[180px] w-[148px] overflow-hidden rounded-2xl border text-left
                           transition-all duration-300 sm:h-[200px] sm:w-[168px]"
                style={{
                  borderColor: on ? accentOf : 'rgba(255,255,255,0.10)',
                  boxShadow: on ? `0 18px 50px -24px ${accentOf}` : 'none',
                  transform: on ? 'translateY(-2px)' : 'none',
                }}
              >
                {art ? (
                  <Image
                    src={art}
                    alt=""
                    fill
                    sizes="168px"
                    className="object-cover transition-all duration-500 group-hover:scale-105"
                    style={{ opacity: on ? 0.92 : 0.5 }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(160deg, ${accentOf}33 0%, rgba(5,5,5,0.95) 70%)` }}
                  />
                )}
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/35 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-3">
                  <span className="fel-heading block text-[14px] font-bold leading-tight text-white">{info.name}</span>
                  <span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
                    {info.venue}
                  </span>
                </span>
                {on && (
                  <span
                    aria-hidden
                    className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full"
                    style={{ background: accentOf, boxShadow: `0 0 12px ${accentOf}` }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
