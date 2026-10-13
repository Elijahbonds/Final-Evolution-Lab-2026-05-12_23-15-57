'use client';

// The banner and the line (A9.13).
//
//   HudBanner — the mode's big call (GOAL!, ROUND 2, 412 FT, a dive prompt): display face, banner size, a plate in the
//               call's tone, and it ARRIVES — a short spring pop on each new text, a fade on its way out (framer-motion;
//               a plain fade under reduced motion). Empty text renders nothing, so a host passes `hud.banner` as it is.
//   HudLine   — a centred one- or two-line read (a control hint, a coach line, a wall cue): body size on a plate, and
//               clamped to two lines, the way game-surface.css clamps a sideways hint (that rule matches only a host's
//               direct child, and the line now sits inside the HudFrame, so the clamp travels with it).
//
// Neither positions itself vertically: the host passes the slot it always used (top-1/3, bottom-16, …) as `className`,
// so a migrated host's calls land exactly where they did.
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HUD_PLATE, HUD_TEXT_ALPHA, hudColor, hudEnter, hudType, type HudSize, type HudTone } from './tokens';
import { useHudReducedMotion } from './use-hud-motion';

/** The line clamp a sideways hint gets (two lines), and the narrower column between a phone's thumb clusters. */
export const LINE_CLAMP_STYLE: CSSProperties = {
  display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
};
export const PHONE_THUMB_GAP_CLASS = '[@media(orientation:landscape)_and_(max-height:520px)]:max-w-[44%]';

export function HudBanner({ text, tone = 'score', size = 'banner', className, plate = true, flow = false, children }: {
  /** The call. Empty / not a string: nothing renders. */
  text?: unknown;
  tone?: HudTone;
  size?: HudSize;
  /** The vertical slot, as the host always placed it (default top-1/3; none in flow). */
  className?: string;
  plate?: boolean;
  /** In the flow of its parent (a call under a scorebug) instead of a full-width layer of its own. */
  flow?: boolean;
  /** Extra content under the call (rare). */
  children?: ReactNode;
}) {
  const reduced = useHudReducedMotion();
  const call = typeof text === 'string' ? text : typeof text === 'number' ? String(text) : '';
  const m = hudEnter(reduced);
  return (
    <div data-hud-banner className={flow ? `flex flex-col items-center text-center ${className ?? ''}` : `pointer-events-none absolute inset-x-0 ${className ?? 'top-1/3'} flex flex-col items-center px-4 text-center`}>
      <AnimatePresence initial={!reduced}>
        {call && (
          <motion.span
            key={call}
            data-hud-call
            initial={m.initial}
            animate={m.animate}
            exit={m.exit}
            transition={m.transition}
            className="inline-block max-w-full"
            style={{
              ...hudType(size),
              color: hudColor(tone),
              ...(plate ? {
                background: HUD_PLATE.background,
                border: `1px solid ${hudColor(tone, 0.45)}`,
                borderRadius: HUD_PLATE.radius + 2,
                boxShadow: `0 0 18px ${hudColor(tone, 0.28)}, ${HUD_PLATE.shadow}`,
                padding: '0.18em 0.6em 0.12em',
              } : {}),
            }}
          >
            {call}
          </motion.span>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}

export function HudLine({ text, children, tone = 'text', alpha = HUD_TEXT_ALPHA.muted, size = 'body', className = 'bottom-16', clamp = true, strong = false, edge, data, maxWidthClass = 'max-w-[min(92%,980px)]' }: {
  text?: unknown;
  children?: ReactNode;
  tone?: HudTone;
  alpha?: number;
  size?: HudSize;
  className?: string;
  clamp?: boolean;
  strong?: boolean;
  /** Edge the plate in a tone (a gold "now" line). */
  edge?: HudTone;
  /** data-* attributes for the line's layer (a host's test hook, e.g. { prompt: 'tell' } → data-prompt). */
  data?: Record<string, string>;
  /** The line's width cap (a host that kept its line narrower, e.g. max-w-[70%]). */
  maxWidthClass?: string;
}) {
  const body = children ?? (typeof text === 'string' ? text : '');
  if (body === '' || body == null) return null;
  return (
    <div data-hud-line {...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))} className={`pointer-events-none absolute inset-x-0 ${className} flex justify-center px-4 text-center`}>
      <span
        className={`${maxWidthClass} ${PHONE_THUMB_GAP_CLASS}`}
        style={{
          ...hudType(size),
          ...(strong ? { fontWeight: 800 } : {}),
          color: hudColor(tone, alpha),
          background: HUD_PLATE.background,
          border: edge ? `1px solid ${hudColor(edge, 0.6)}` : HUD_PLATE.border,
          borderRadius: HUD_PLATE.radius,
          padding: '0.2em 0.75em',
          ...(clamp ? LINE_CLAMP_STYLE : {}),
        }}
      >
        {body}
      </span>
    </div>
  );
}
