'use client';

// HudFrame — the safe-area wrapper every migrated host draws its HUD inside (A9.13, lane/tv-hud).
//
// WHERE THE 5 % COMES FROM. On any sideways screen GameShell marks its stage `data-fel-console` and app/game-surface.css
// shrinks the HOST box to the title-safe frame (5 % each side on a TV, 3 % on a phone, plus the notch), growing only the
// canvas back out to the screen's edge. So a layer positioned against the host box is already inside the frame — and
// this wrapper must NOT add the margin again (a second 5 % would push the corner readouts a tenth of the screen in). It
// is `inset: 0` there. Off the console view (a portrait phone, where the stage sits under the page header) the host box
// is the page's, so the wrapper keeps clear of the device's own safe areas with env().
//
// WHAT ELSE IT CARRIES, once per host instead of per readout:
//   - the display face, the plate-less text shadow and the base size (the `body` step: the em the plates' padding is
//     measured in) for everything inside;
//   - the HUD's motion policy: framer-motion's MotionConfig set from the app's reduced-motion answer, so every banner,
//     pop and meter inside honours it without asking;
//   - the END-CARD HAND-OFF: when the shell's end card (`data-end-screen`, a sibling of the host in the stage) is up, the
//     HUD fades out under it, so the card's score slam is the only score on the screen; when the card goes (REPLAY in
//     place) the HUD comes back. CSS `:has()`, so no host has to know when the shell's card mounts.
//
// It is ONE direct child of the host, so console view's `zoom` (the HUD's height-scaled size) applies to it once, and
// the READY card (BootSplash), the pause (PausedLayer), TouchOverlay and MicCaption stay the host's own direct children,
// where game-surface.css's full-bleed and caption rules find them. No z-index of its own: the layers inside stack
// exactly as they did as the host's children (a CombatHudBand inside keeps its z 35 over the juice overlay).
import type { CSSProperties, ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useHudReducedMotion } from './use-hud-motion';
import { HUD_FONT_CLASS, HUD_TEXT_SHADOW, hudFontSize } from './tokens';

/** The class that hides the HUD while the shell's end card is up (see END_CARD_ATTR). */
export const END_CARD_HANDOFF_CLASS = '[div:has(>[data-end-screen])_&]:opacity-0';
/** Console view: the host box is already the safe frame, so the wrapper sits flush with it. */
export const CONSOLE_FLUSH_CLASS = '[[data-fel-console]_&]:!inset-0';

const OFF_CONSOLE_INSET: CSSProperties = {
  top: 'env(safe-area-inset-top, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)',
};

export function HudFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useHudReducedMotion();
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div
        data-hud-frame
        data-hud-motion={reduced ? 'reduced' : 'full'}
        className={`pointer-events-none absolute ${CONSOLE_FLUSH_CLASS} ${HUD_FONT_CLASS} text-white transition-opacity duration-300 ${END_CARD_HANDOFF_CLASS} ${className}`}
        style={{ ...OFF_CONSOLE_INSET, textShadow: HUD_TEXT_SHADOW, fontSize: hudFontSize('body') }}
      >
        {children}
      </div>
    </MotionConfig>
  );
}
