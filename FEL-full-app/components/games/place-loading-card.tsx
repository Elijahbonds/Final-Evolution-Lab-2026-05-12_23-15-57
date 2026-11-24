'use client';

// The places' branded loading card, and the veil the /play layout draws it in (look-screens phase A3(a); the rule, the words and
// the measurements are in lib/ui/placeLoading.ts). The card is BootSplash's loading look — the venue art, the brand line, the
// title, the bar and the line — so a place loads the way every hoops game does, not on a black screen.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { getFeelState, getServerFeelState, subscribeFeel } from '@/lib/feel-panel/feel';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { venueThumb } from '@/lib/babylon/ui/venueThumbs';
import { PLACE_CARDS, placeLoadingCard, veiledPlace, type Place } from '@/lib/ui/placeLoading';

const BAR_CSS = '[data-place-bar]{width:30%;animation:felplacebar 1.1s ease-in-out infinite alternate}'
  + '@keyframes felplacebar{from{transform:translateX(0)}to{transform:translateX(233%)}}'
  + '@media (prefers-reduced-motion: reduce){[data-place-bar]{animation:none}}';

/** A stage's failed-load line (the layout's caption region is a role="alert" too, always mounted: not that one). */
export const STAGE_ALERT = '[role="alert"]:not([data-fel-captions])';

/** The card itself, full-bleed in its box. `fixed`: over the whole screen (the veil); otherwise it fills its parent. */
export function PlaceLoadingCard({ place, fixed = false }: { place: Place; fixed?: boolean }) {
  const c = PLACE_CARDS[place];
  // the art is drawn on a canvas in the browser (no file, no request); the server and the first paint have the tint's gradient
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => { try { setArt(venueThumb(c.venue, 960, 540)); } catch { setArt(null); } }, [c.venue]);
  return (
    <div role="status" aria-live="polite" data-place-loading={place}
      className={`${fixed ? 'fixed' : 'absolute'} inset-0 z-10 flex flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center`}
      style={{
        background: '#05060a', fontFamily: 'var(--fel-font-display, ui-monospace)',
        backgroundImage: art
          ? `linear-gradient(180deg, rgba(5,6,10,.25), rgba(5,6,10,.92)), url(${art})`
          : `radial-gradient(120% 90% at 50% 0%, ${c.tint}22, rgba(5,6,10,.96) 70%)`,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
      <style dangerouslySetInnerHTML={{ __html: BAR_CSS }} />
      <p className="text-[12px] font-black tracking-[0.4em]" style={{ color: c.tint }}>{c.sub}</p>
      <h1 className="text-4xl font-black uppercase tracking-wide text-white drop-shadow-lg">{c.title}</h1>
      <div className="w-56">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
          <div data-place-bar className="h-full rounded-full" style={{ background: c.tint }} />
        </div>
        <p className="mt-2 text-base text-white/80">{c.line}</p>
      </div>
    </div>
  );
}

/**
 * Drawn once by the /play layout. On a place that loads on black (Venice, the Coast, the arena) it shows the card from the first
 * paint until the place's harness leaves its loading phase, or the stage reports an error (its role="alert" line), so nothing of
 * the stage's own is hidden once it has something to say. Everywhere else, and with the knob at 0, it draws nothing.
 */
export function PlaceLoadingVeil() {
  useSyncExternalStore(subscribeFeel, getFeelState, getServerFeelState);
  const place = veiledPlace(usePathname());
  const view = useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);
  const loading = view.phase === null || view.phase === 'loading';
  const [failed, setFailed] = useState(false);
  const on = placeLoadingCard() && place !== null && loading && !failed;
  useEffect(() => { setFailed(false); }, [place]);
  // the stages say a failed load in a role="alert" line of their own: the card steps aside for it (read twice a second, while up)
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => { if (document.querySelector(STAGE_ALERT)) setFailed(true); }, 500);
    return () => window.clearInterval(t);
  }, [on]);
  return on && place ? <PlaceLoadingCard place={place} fixed /> : null;
}
