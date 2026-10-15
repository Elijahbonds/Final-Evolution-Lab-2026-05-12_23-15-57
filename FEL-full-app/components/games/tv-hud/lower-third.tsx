'use client';

// HudLowerThird (A9.13, lane/w3-present, wave 3) — the broadcast lower third: a name card that slides in from the left edge of the safe
// frame when something NEW starts (a turn, a kick), holds for a couple of seconds, and goes. The dunk duel's "PLAYER 2 · DUNK 4 OF 6" and
// the penalty shootout's "PENALTY 3 OF 5" are the same piece with different words.
//
// It is keyed: the host hands `cardKey` (a string that changes when the thing changes: the active player and the dunk number, the kick's
// label) and the card shows for `holdMs` each time the key changes, including the first non-empty key it sees. An empty key shows nothing.
// A re-render with the SAME key never re-fires it, and a key that changes back mid-hold restarts the hold on the new words.
//
// WHERE IT SITS. A lower third is the one HUD piece that lives in the lower-left of the picture, so it must stay clear of what the host keeps
// there: the MC's caption (centred), the hint, the take-off chip, the beat strip (centred, in a column of their own), and a phone's touch
// deck (the bottom 15 %). `className` is the slot's vertical position (default 24 % up from the bottom of the safe frame); the card is
// left-aligned in it and, on a phone, no wider than 58 % of the screen (the pad's action diamond stands in the right-hand third).
// It carries `data-hud-lower-third` so a layout test can find it.
//
// PRESENTATION ONLY: it draws the words it is handed. Motion follows the app's reduced-motion answer (a fade where it would slide).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HUD_PLATE, hudColor, hudType, type HudTone } from './tokens';
import { useHudReducedMotion } from './use-hud-motion';

/** How long a card stays up, ms. */
export const LOWER_THIRD_MS = 2400;

/** Pure: does this key fire the card? (a non-empty key that is not the one already shown.) */
export function lowerThirdFires(shownKey: string | null, key: unknown): key is string {
  return typeof key === 'string' && key !== '' && key !== shownKey;
}

export function HudLowerThird({ cardKey, tone = 'you', kicker, title, sub, aside, holdMs = LOWER_THIRD_MS, className = 'bottom-[24%]', enabled = true }: {
  /** The thing's identity: the card fires when it changes. Empty / not a string: nothing. */
  cardKey: unknown;
  tone?: HudTone;
  /** A small line over the title (UP NEXT, SHOOTOUT). */
  kicker?: ReactNode;
  /** The name (PLAYER 2, PENALTY 3 OF 5). */
  title: ReactNode;
  /** A line under it (DUNK 4 OF 6 · WINDMILL, the score). */
  sub?: ReactNode;
  /** Something small on the right edge of the card (a score, a count). */
  aside?: ReactNode;
  holdMs?: number;
  /** The slot (position classes). */
  className?: string;
  /** False: the host is in a state that has no card (paused, the end card): nothing shows and the key is not consumed. */
  enabled?: boolean;
}) {
  const reduced = useHudReducedMotion();
  const [shown, setShown] = useState<string | null>(null);
  const seen = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled || !lowerThirdFires(seen.current, cardKey)) return;
    seen.current = cardKey;
    setShown(cardKey);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setShown(null); }, holdMs);
  }, [cardKey, enabled, holdMs]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div data-hud-lower-third-slot className={`pointer-events-none absolute inset-x-0 flex justify-start ${className}`}>
      <AnimatePresence>
        {shown !== null && enabled && (
          <motion.div
            key={shown}
            data-hud-lower-third={shown}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: -48 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24, transition: { duration: 0.2 } }}
            transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 22, stiffness: 320, mass: 0.7 }}
            className="flex w-fit max-w-[58%] items-stretch sm:max-w-[min(92%,640px)]"
            style={{
              background: HUD_PLATE.background,
              border: HUD_PLATE.border,
              borderLeft: 'none',
              borderRadius: `0 ${HUD_PLATE.radius}px ${HUD_PLATE.radius}px 0`,
              boxShadow: `inset 4px 0 0 ${hudColor(tone)}, 0 0 22px ${hudColor(tone, 0.25)}, ${HUD_PLATE.shadow}`,
              padding: '0.3em 0.9em 0.25em 1em',
            }}
          >
            <div className="flex flex-col">
              {kicker != null && kicker !== '' && <span style={{ ...hudType('caption'), color: hudColor(tone), letterSpacing: '0.18em', fontWeight: 800 }}>{kicker}</span>}
              <span style={{ ...hudType('banner'), color: hudColor('text'), letterSpacing: '0.03em' }}>{title}</span>
              {sub != null && sub !== '' && <span style={{ ...hudType('label'), color: hudColor('text', 0.8) }}>{sub}</span>}
            </div>
            {aside != null && aside !== '' && <div className="ml-4 flex items-center whitespace-nowrap" style={{ ...hudType('score'), color: hudColor(tone) }}>{aside}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
