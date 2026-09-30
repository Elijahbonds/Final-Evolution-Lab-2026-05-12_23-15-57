'use client';
// The breathing pacer, drawn (MIRROR-COACH P7, 2026-09-29): a ring that fills on the breath in, stays full through a
// hold, empties on the breath out and rests through a pause, with the seconds left in the ring and the part's name under
// it. Every breath in the app draws this one — the Mirror's breathe-first stage, the warm-up's Pressurize, the
// cool-down's recovery breath and the settle between sets — where there used to be a CSS loop on its own clock (the
// Mirror's) and two text lines ("Breathe in · 3", the warm-up's and the cool-down's).
//
// IT HAS NO CLOCK. The host passes seconds on ITS clock (the pose clock, a guided run, a rest timer) and the spec's
// `from` is on that same clock, so the ring can never drift from the stage it paces, and pausing the host pauses the
// ring. All the arithmetic is lib/breath/pacer.ts (pacerView, ringLook), tested there; this file lays it out.
//
// REDUCED MOTION. The app's one answer (lib/a11y/reducedMotion: the player's own setting, else the device's) is read
// through useSyncExternalStore, so a change applies on the next frame and a server render (no window) paints the calm
// ring rather than guessing. Reduced = the ring never changes size; it paces by brightness alone. A `reducedMotion` prop
// overrides it (tests; a host that already knows).
//
// HONESTY. It counts; it measures nothing. The captions are the part's name and the breath number — no claim.
//
// MIRROR-COACH P7 FIX (2026-09-29, review), two things:
//   · THE COUNT CAN BE THE BREATH NUMBER (`count="breath"`). The number in the ring is the whole seconds left in the part
//     (pacerView), which for a 1-second part is always 1: the Dial-Up Breath's ring (1 s in, 1 s out) read "1" for its
//     whole run while the progress sat in the small line under it. A host whose parts are that short now shows which
//     breath it is in the ring instead (the get-ready countdown before the first breath is unchanged).
//   · THE CAPTION IS A LIVE REGION ONLY WHEN ASKED (`liveCaption`). It was always aria-live="polite", so a host with its
//     own live line (the Dial-Up's "Sharp sniff in", the warm-up's and the cool-down's run lines) made a screen reader
//     announce twice for every part — twice a second on the Dial-Up. Hosts with no line of their own (the settle, a
//     timed breath item's ring) turn it on.
//
// Opacity steps are Tailwind 3.3's own scale (…/40, /50, /60): a step outside it (/45, /35) generates no CSS at all in
// this app's Tailwind (measured on the P7 proof build: text-white/45 → 0 rules), and the text falls back to solid white.
import { useSyncExternalStore } from 'react';
import { onMotionChange, reducedMotion as readReducedMotion } from '@/lib/a11y/reducedMotion';
import { pacerView, ringLook, type PacerSpec, type PacerView } from '@/lib/breath/pacer';

const SIZE_PX = { sm: 72, md: 104, lg: 132 } as const;
const COUNT_CLASS = { sm: 'text-xl', md: 'text-3xl', lg: 'text-4xl' } as const;

/** The app's reduced-motion answer, live. The server's answer is "calm" (true): no window means no guess at motion. */
export function usePacerReducedMotion(override?: boolean): boolean {
  const live = useSyncExternalStore(onMotionChange, readReducedMotion, () => true);
  return override ?? live;
}

export interface BreathPacerProps {
  spec: PacerSpec;
  /** Seconds on the host's clock — the clock the spec's `from` is on. */
  elapsedSec: number;
  size?: keyof typeof SIZE_PX;
  /** Force reduced motion on or off; default: the app's setting (lib/a11y/reducedMotion). */
  reducedMotion?: boolean;
  /** The part's name and the breath number under the ring (default on). */
  captions?: boolean;
  /** The number in the ring while breathing: the seconds left in the part (default), or which breath it is ('breath' —
   *  for parts too short for a countdown to say anything). Before the first breath it is always the get-ready count. */
  count?: 'seconds' | 'breath';
  /** Announce the caption to a screen reader as it changes (default off: a host that has its own live line keeps it). */
  liveCaption?: boolean;
  /** data-pacer on the root, so a test or a probe can find which pacer this is. */
  id?: string;
  className?: string;
}

/** The number in the ring for a view (see BreathPacerProps.count). */
export const ringCount = (view: PacerView, count: 'seconds' | 'breath' = 'seconds'): number | null =>
  (count === 'breath' && view.state === 'on' && view.point ? view.point.round : view.count);

export function BreathPacer({ spec, elapsedSec, size = 'md', reducedMotion, captions = true, count = 'seconds', liveCaption = false, id, className = '' }: BreathPacerProps) {
  const reduced = usePacerReducedMotion(reducedMotion);
  const view = pacerView(spec, elapsedSec);
  const look = ringLook(view.fill, reduced);
  const px = SIZE_PX[size];
  const round = view.point ? `breath ${view.point.round} of ${view.point.rounds}` : null;
  return (
    <div
      className={`flex flex-col items-center gap-1.5 ${className}`}
      data-pacer={id ?? ''}
      data-pacer-state={view.state}
      data-pacer-phase={view.point?.phase}
      data-reduced={reduced ? 'true' : 'false'}
      role="group"
      aria-label="Breathing pacer"
    >
      <div className="relative grid place-items-center" style={{ width: px, height: px }}>
        {/* the full-size line the ring fills to: a still guide, so growth reads as "fill to here" */}
        <div aria-hidden="true" className="absolute inset-0 rounded-full border border-[#00E5FF]/25" />
        <div
          aria-hidden="true"
          data-pacer-ring
          className="absolute inset-0 rounded-full border-2 border-[#00E5FF]"
          style={{
            transform: reduced ? undefined : `scale(${look.scale.toFixed(3)})`,
            opacity: Number(look.opacity.toFixed(3)),
            background: 'radial-gradient(circle, rgba(0, 229, 255, 0.35), transparent 70%)',
            boxShadow: '0 0 48px -12px #00E5FF',
          }}
        />
        <div className={`relative font-mono tabular-nums text-white ${COUNT_CLASS[size]}`} data-pacer-count={count} aria-hidden="true">
          {ringCount(view, count) ?? ''}
        </div>
      </div>
      {captions && (
        <div className="text-center leading-tight">
          <div className="text-sm font-medium text-[#00E5FF]" data-pacer-caption aria-live={liveCaption ? 'polite' : undefined}>{view.caption}</div>
          {round && <div className="text-[11px] text-white/50" data-pacer-round>{round}</div>}
        </div>
      )}
    </div>
  );
}
