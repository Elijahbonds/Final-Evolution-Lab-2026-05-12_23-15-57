'use client';

// FIGHT PRESENTATION (lane/w3-present, wave 3) — the three pieces of a fighting game's broadcast the combat hosts draw.
//
//   FightIntroPlates — the name plates of the intro walk-in: the rival's slides in from the right while the camera is on him,
//                      the player's from the left while it is on them, both while the wide shot settles. Karate VS.
//   FightSlam        — ROUND 2 / FIGHT! / K.O.: one big call that slams in at the centre and is gone in about a second.
//   ReplayBug        — the corner "REPLAY" tag while a KO plays back, and how to skip it (any button).
//
// PRESENTATION ONLY. Each renders what the mode's HUD keys say (`intro`, `foeName`, `foeSub`, `meName`, `meSub`, `slam`, `slamSeq`,
// `replay`) and reads nothing else. Motion follows the app's reduced-motion answer (a fade where it would slam or slide). They sit
// inside the host's <HudFrame>: the safe frame, the display face and the end-card hand-off come with it.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HUD_PLATE, HudChip, HudText, hudColor, hudType, useHudReducedMotion, type HudTone } from './tv-hud';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** One name plate: a name on a plate with the side's tone along its edge, and a small line under it. */
function Plate({ side, name, sub, tone, reduced }: { side: 'foe' | 'me'; name: string; sub: string; tone: HudTone; reduced: boolean }) {
  const from = side === 'foe' ? 70 : -70;
  return (
    <motion.div
      data-fight-plate={side}
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: from }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: from * 0.5, transition: { duration: 0.18 } }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 20, stiffness: 300, mass: 0.7 }}
      className={`flex flex-col ${side === 'foe' ? 'items-end text-right' : 'items-start text-left'}`}
      style={{
        background: HUD_PLATE.background,
        border: HUD_PLATE.border,
        borderRadius: HUD_PLATE.radius,
        boxShadow: `inset ${side === 'foe' ? '-' : ''}4px 0 0 ${hudColor(tone)}, 0 0 22px ${hudColor(tone, 0.3)}, ${HUD_PLATE.shadow}`,
        padding: '0.25em 0.9em 0.2em',
      }}
    >
      <span style={{ ...hudType('banner'), color: hudColor(tone), letterSpacing: '0.04em' }}>{name}</span>
      {sub && <HudText size="label" alpha={0.8} style={{ letterSpacing: '0.14em' }}>{sub}</HudText>}
    </motion.div>
  );
}

/** The intro's plates. `beat`: 'foe' | 'me' | 'wide' | '' (hud.intro). Draws nothing outside the intro. */
export function FightIntroPlates({ beat, foeName, foeSub, meName, meSub }: { beat: unknown; foeName: unknown; foeSub: unknown; meName: unknown; meSub: unknown }) {
  const reduced = useHudReducedMotion();
  const b = str(beat);
  const showFoe = b === 'foe' || b === 'wide', showMe = b === 'me' || b === 'wide';
  return (
    <div data-fight-intro={b || undefined} className="pointer-events-none absolute inset-x-0 bottom-[17%] flex justify-between gap-4 px-4">
      <div className="flex">
        <AnimatePresence>{showMe && <Plate key="me" side="me" name={str(meName) || 'YOU'} sub={str(meSub)} tone="you" reduced={reduced} />}</AnimatePresence>
      </div>
      <div className="flex">
        <AnimatePresence>{showFoe && <Plate key="foe" side="foe" name={str(foeName) || 'RIVAL'} sub={str(foeSub)} tone="danger" reduced={reduced} />}</AnimatePresence>
      </div>
    </div>
  );
}

/** How long each call stays up, ms. */
export const SLAM_MS = { default: 1100, fight: 850 } as const;
/** How long a call stays on screen. */
export const slamMs = (call: string): number => (call.startsWith('FIGHT') ? SLAM_MS.fight : SLAM_MS.default);
const slamTone = (t: string): HudTone => (t.startsWith('FIGHT') || t.startsWith('K.O') ? 'danger' : t.startsWith('TIME') ? 'score' : 'text');

/** The slam: `text` is the call, `seq` a counter the mode bumps for each (so the same call twice fires twice). Gone after SLAM_MS. */
export function FightSlam({ text, seq }: { text: unknown; seq: unknown }) {
  const reduced = useHudReducedMotion();
  const call = str(text), n = Number(seq);
  const [shown, setShown] = useState<{ call: string; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a new call (a bumped counter) shows and restarts the timer; the mode clearing the key (call → '') leaves the timer running, so a call is on screen
  // for its own SLAM_MS whatever the HUD key does after it
  useEffect(() => {
    if (!call || !Number.isFinite(n) || n <= 0) return;
    setShown({ call, n });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setShown(null); }, slamMs(call));
  }, [call, n]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const tone = slamTone(shown?.call ?? '');
  return (
    <div data-fight-slam className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center px-4">
      <AnimatePresence>
        {shown && (
          <motion.span
            key={shown.n}
            data-fight-slam-call={shown.call}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 2.7 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.12, transition: { duration: 0.22 } }}
            transition={reduced ? { duration: 0.12 } : { type: 'spring', damping: 15, stiffness: 520, mass: 0.8 }}
            className="inline-block"
            style={{
              ...hudType('hero'),
              fontSize: `calc(${hudType('hero').fontSize} * 1.7)`,
              fontStyle: 'italic',
              letterSpacing: '0.06em',
              color: hudColor(tone),
              textShadow: `0 0 26px ${hudColor(tone, 0.55)}, 0 4px 0 ${hudColor('ink', 0.6)}, 0 2px 14px ${hudColor('ink', 0.7)}`,
            }}
          >
            {shown.call}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The REPLAY tag, and how to skip it. `on` = hud.replay is 1. */
export function ReplayBug({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <div data-replay-bug className="pointer-events-none absolute inset-x-0 bottom-[17%] flex justify-center px-4">
      <HudChip label="REPLAY" labelTone="danger" tone="text" alpha={0.75} size="label" glow>ANY BUTTON SKIPS</HudChip>
    </div>
  );
}
