'use client';

// PHOTO FINISH (lane/w3-present, wave 3) — the sprint's end image: the frame the camera drew at the tape, printed with the finish line over
// it and a timing ruler under it that puts the player and the pacer on one clock.
//
//   the photo   a still the mode took at the tape (hud.photoSrc, a JPEG data URL), in a print's treatment (desaturated, contrasty, a paper
//               border), with the FINISH LINE drawn where the line really is in the frame (hud.photoLine: its row, projected by the mode)
//   the ruler   a time axis (racing/photoFinish.ruler): the finish line near the left, the winner on it, the loser to the right by the
//               margin, ticks every 0.01-5 s as the margin needs; "YOU BY 0.56 s" under it
//
// PRESENTATION ONLY: it draws what the mode sends (the still, the line's row, the two raw crossing times) and does the ruler's arithmetic through
// the pure racing/photoFinish. The official time, the penalties and the result are the mode's and the shell's.
//
// On the TV HUD system: the 10-foot scale for every label, the one palette, the print arrives with a short settle (a fade under reduced motion).
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { HUD_PLATE, HudChip, HudText, hudColor, useHudReducedMotion } from './tv-hud';
import { PACER_FINISH_S, finishMargin, printTime, ruler } from '@/lib/babylon/racing/photoFinish';

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The print's frame (a paper border) and the film treatment of the photo itself. */
const PRINT: CSSProperties = { background: hudColor('text', 0.94), padding: '0.5em 0.5em 0.35em', borderRadius: 4, boxShadow: `0 6px 26px ${hudColor('ink', 0.6)}` };
const FILM: CSSProperties = { filter: 'grayscale(0.85) contrast(1.18) sepia(0.28)' };

export function PhotoFinishPrint({ src, line, you, pacer }: { src: unknown; line: unknown; you: unknown; pacer: unknown }) {
  const reduced = useHudReducedMotion();
  if (typeof src !== 'string' || !src) return null;
  const youS = num(you, NaN), pacerS = num(pacer, PACER_FINISH_S);
  const m = finishMargin(youS, pacerS);
  const r = ruler(m);
  const row = typeof line === 'number' && Number.isFinite(line) ? line : null;
  // the ticks: one every stepS across the ruler's span, from the line to the end
  const ticks: number[] = [];
  for (let t = 0; t <= r.spanS + 1e-9 && ticks.length < 40; t += r.stepS) ticks.push(Math.round(t * 1000) / 1000);
  const x = (sec: number): string => `${(r.lineX + (sec / r.spanS) * (0.94 - r.lineX)) * 100}%`;
  const tone = m.winner === 'pacer' ? 'danger' : 'good';
  return (
    <div data-photo-finish className="pointer-events-none absolute bottom-[5%] left-0 right-0 flex justify-center px-4 [@media(max-width:639px)]:bottom-[14rem]">
      <motion.figure
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 36, rotate: -3 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, rotate: -1.2 }}
        transition={reduced ? { duration: 0.2 } : { type: 'spring', damping: 17, stiffness: 190, mass: 0.9 }}
        className="m-0 w-[min(34%,420px)] min-w-[240px]"
        style={PRINT}
      >
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16 / 9', background: hudColor('ink') }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL captured from the canvas; next/image cannot optimise it */}
          <img data-photo-still src={src} alt="The finish line, as the camera drew it at the tape" className="absolute inset-0 h-full w-full object-cover" style={FILM} />
          {row !== null && (
            <div data-photo-line className="absolute left-0 right-0" style={{ top: `${row * 100}%`, height: 3, background: hudColor('score'), boxShadow: `0 0 8px ${hudColor('score', 0.8)}` }}>
              <HudText size="caption" tone="score" className="absolute right-1 -top-[1.4em]" style={{ fontWeight: 800, letterSpacing: '0.12em' }}>FINISH</HudText>
            </div>
          )}
          <HudText size="caption" tone="text" className="absolute left-1.5 top-1" style={{ fontWeight: 800, letterSpacing: '0.14em' }}>PHOTO FINISH</HudText>
        </div>

        {/* the ruler: a time axis, the winner on the line */}
        <div data-photo-ruler className="relative mt-[0.35em] w-full" style={{ height: '3.1em', color: hudColor('ink', 0.85) }}>
          <div className="absolute left-0 right-0 top-[0.5em] h-px" style={{ background: hudColor('ink', 0.7) }} />
          {ticks.map((t, i) => (
            <span key={i} data-photo-tick className="absolute top-[0.5em] w-px" style={{ left: x(t), height: i === 0 ? '1.1em' : i % 5 === 0 ? '0.8em' : '0.45em', background: hudColor('ink', 0.75) }} />
          ))}
          <span data-photo-line-mark className="absolute top-0 w-[3px]" style={{ left: x(0), height: '1.25em', background: hudColor('score'), transform: 'translateX(-1px)' }} />
          {/* the two runners on it */}
          <span data-photo-marker="you" className="absolute" style={{ left: `${r.youX * 100}%`, top: '1.2em', transform: 'translateX(-50%)' }}>
            <HudText size="caption" tone="you" style={{ fontWeight: 800, textShadow: 'none', background: hudColor('ink', 0.9), padding: '0 0.4em', borderRadius: 3 }}>YOU {printTime(youS)}</HudText>
          </span>
          <span data-photo-marker="pacer" className="absolute" style={{ left: `${r.pacerX * 100}%`, top: m.winner === 'tie' || Math.abs(r.pacerX - r.youX) < 0.2 ? '2.2em' : '1.2em', transform: 'translateX(-50%)' }}>
            <HudText size="caption" tone="them" style={{ fontWeight: 800, textShadow: 'none', background: hudColor('ink', 0.9), padding: '0 0.4em', borderRadius: 3 }}>PACER {printTime(pacerS)}{r.clipped ? ' ▸' : ''}</HudText>
          </span>
        </div>
        <div className="mt-[0.2em] flex justify-center">
          <HudChip tone={tone} size="value" style={{ fontWeight: 800, background: hudColor('ink', 0.92), border: HUD_PLATE.border }}>{m.call}</HudChip>
        </div>
      </motion.figure>
    </div>
  );
}
