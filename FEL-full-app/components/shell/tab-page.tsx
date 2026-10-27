// TabPage — one frame for all three tabs, so they cannot drift apart.
//
// The premium of a premium interface is mostly restraint: one column width, one heading size, one rhythm of
// spacing, one place the eye starts. Three pages that each invent their own is how an app starts to feel cheap
// even when every screen is individually fine.
//
// PREMIUM-UI P3 (2026-10-27; docs/PLAN-UI-10PHASE.md). The owner: "it still feels cheap" — flat and empty, too much text,
// no motion. The frame now has two forms:
//   hero     a full-bleed image (a venue, a 3D scene capture) or figure (the player's avatar) under a scrim, the headline
//            on it, and the screen's ONE primary action docked where a thumb is (components/ui/fel);
//   compact  the type scale's eyebrow, title and one short line, for the 20-odd sub-pages that use this frame.
// Both arrive with a short fade (opacity only, zero under reduced motion). ONE ACCENT: the eyebrow and the page's glow are
// FEL cyan on every tab; `accent` is still accepted from the pages that pass it, and no longer paints the frame
// (LOOK CHANGE, flagged: Train's green and Profile's gold washes are gone).

import type { ReactNode } from 'react';
import { HeroHeader } from '@/components/ui/fel/hero-header';
import { TYPE } from '@/lib/design/type';

export interface TabHero {
  /** a public/ image, credited in lib/credits/credits.ts */
  image?: string;
  imagePosition?: string;
  /** a figure over the scrim instead of (or with) the image: the player's avatar */
  media?: ReactNode;
  /** the ONE primary action (a docked PrimaryCta) */
  primary?: ReactNode;
  /** at most a couple of secondary doors (Chip with href) */
  chips?: ReactNode;
}

export function TabPage({
  eyebrow, title, lede, children, aside, hero,
}: {
  eyebrow: string; title: string; lede?: string;
  /** @deprecated the frame is one accent now (premium-ui P3); kept so the pages that pass it compile */
  accent?: string;
  children: ReactNode; aside?: ReactNode; hero?: TabHero;
}) {
  return (
    <div className="relative min-h-screen bg-fel-bg pb-28 md:pb-12" style={{ backgroundImage: 'var(--fel-page-glow)' }}>
      {hero && (
        <HeroHeader image={hero.image} imagePosition={hero.imagePosition} media={hero.media} eyebrow={eyebrow} title={title} line={lede}>
          {hero.primary}
          {hero.chips}
          {aside}
        </HeroHeader>
      )}
      {/* data-couch-scale: the couch view (lib/design/couch.ts) zooms this column on a TV driven by a pad or a remote */}
      <main data-couch-scale className={`fel-fade relative mx-auto max-w-[1080px] px-5 ${hero ? 'pt-2' : 'pt-8 md:pt-10'} ${hero?.primary ? 'pb-20 md:pb-0' : ''}`}>
        {!hero && (
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <p className={`${TYPE.label} text-fel-cyan`}>{eyebrow}</p>
              <h1 className={`${TYPE.title} text-white`}>{title}</h1>
              {lede && <p className={`${TYPE.small} max-w-lg text-fel-soft`}>{lede}</p>}
            </div>
            {aside}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
