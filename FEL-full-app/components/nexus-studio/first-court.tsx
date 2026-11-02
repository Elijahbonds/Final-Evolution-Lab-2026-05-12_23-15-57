'use client';

// MAKE YOUR FIRST COURT — the guided first project (STUDIO-EASY, 2026-10-28; lib/nexus-studio/firstCourt.ts). A card over the
// viewport with three one-tap steps: pick the light, add lights and fans, watch the intro. Each tap is an ordinary Studio command
// (Undo takes it back). No walls of text: a title and one short hint per step.
//
// AUTOPLAY HINTS: a step that waits HINT_MS without a tap lights its first choice (a soft pulse — none under reduced motion, the
// device's or the app's own setting — a steady ring instead) and says what to tap. Done steps tick over by themselves: the card
// follows the venue, so a light placed by hand from Assets also completes step 2.

import { useEffect, useState } from 'react';
import { Check, Sparkles, X, Play } from 'lucide-react';
import { TYPE } from '@/lib/design/type';
import { reducedMotion } from '@/lib/a11y/reducedMotion';
import {
  FIRST_COURT_TITLE, GUIDE_ADDS, GUIDE_DONE, GUIDE_LIGHTS, GUIDE_STEPS, addCommand, guideStep, introCommand, lightCommand, quickCourtCommand,
  type GuideAdd,
} from '@/lib/nexus-studio/firstCourt';
import type { Command } from '@/lib/nexus-studio/commands';
import type { StudioVenue } from '@/lib/nexus-studio/doc';
import { C } from './ui';

/** How long a step waits before it shows its hint. */
export const HINT_MS = 5000;

export interface FirstCourtProps {
  venue: StudioVenue;
  run(cmd: Command): void;
  /** Step 3: play the walk-in intro in the viewport; false when it cannot (reduced motion: the view is framed instead). */
  onWatch(): boolean;
  /** Placed objects become the selection, as a hand placement's do. */
  onPlaced?(ids: string[]): void;
  onFinish(): void;
  onSkip(): void;
  /** Play the court in the game (the header's Play-test). Absent: no Play button on the last step. */
  onPlay?(): void;
}

export function FirstCourt({ venue, run, onWatch, onPlaced, onFinish, onSkip, onPlay }: FirstCourtProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [added, setAdded] = useState<GuideAdd[]>([]);
  const [watched, setWatched] = useState<null | 'flown' | 'still' | 'skipped'>(null);
  const step = guideStep(venue, { picked: !!picked, watched: !!watched });
  const [hint, setHint] = useState(false);
  const calm = useCalm();

  // the autoplay hint: a step left alone for HINT_MS lights its first choice
  useEffect(() => {
    setHint(false);
    if (step === 3) return;
    const t = setTimeout(() => setHint(true), HINT_MS);
    return () => clearTimeout(t);
  }, [step]);

  // one tap: the whole court (night light, floods, fans, the walk-in intro) as one undo step, then straight to "Play it"
  const quick = () => {
    const r = quickCourtCommand(venue);
    if (!r) return;
    run(r.cmd); onPlaced?.(r.ids); setPicked('nightGame'); setAdded(['floods', 'fans']); setWatched('skipped');
  };
  const pick = (mood: (typeof GUIDE_LIGHTS)[number]['mood']) => { run(lightCommand(venue, mood)); setPicked(mood); };
  const add = (what: GuideAdd) => {
    const r = addCommand(venue, what);
    if (!r) return;
    run(r.cmd); onPlaced?.(r.ids); setAdded((a) => (a.includes(what) ? a : [...a, what]));
  };
  const watch = () => {
    const c = introCommand(venue);
    if (c) run(c);
    // the intro reads the venue as it is after this render: give the viewport one frame to take the new intro
    requestAnimationFrame(() => setWatched(onWatch() ? 'flown' : 'still'));
  };

  const ring = (on: boolean) => (on ? `ring-2 ring-[color:var(--fel-cyan)] ring-offset-2 ring-offset-[color:var(--fel-surface)] ${calm ? '' : 'motion-safe:animate-pulse'}` : '');
  const choice = 'fel-press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-4 font-sans text-[14px] font-semibold transition-colors';
  const words: { title: string; hint: string } = step === 3 ? GUIDE_DONE : GUIDE_STEPS[step];

  return (
    <section aria-label={FIRST_COURT_TITLE} data-testid="first-court" data-step={step}
      className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border p-4 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md md:mx-0 md:w-[24rem]"
      style={{ background: 'rgba(12, 12, 17, 0.92)', borderColor: 'rgba(0,229,255,0.28)' }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`${TYPE.label} flex items-center gap-2`} style={{ color: C.cyan }}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> {FIRST_COURT_TITLE}
          </p>
          <ol className="mt-2 flex gap-1.5" aria-label={`Step ${Math.min(step + 1, 3)} of 3`}>
            {GUIDE_STEPS.map((s, i) => (
              <li key={s.title} className="h-1.5 flex-1 rounded-full" aria-hidden style={{ background: i < step ? C.emerald : i === step ? C.cyan : C.line }} />
            ))}
          </ol>
        </div>
        <button type="button" onClick={onSkip} aria-label="Close the guide" title="Close the guide (it is in Help any time)"
          className="-m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/5" style={{ color: C.dim }} data-testid="first-court-skip">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <h2 className={`${TYPE.heading} mt-3 text-white`} aria-live="polite">{step < 3 ? `${step + 1}. ` : ''}{words.title}</h2>
      <p className={`${TYPE.small} mt-1`} style={{ color: 'var(--fel-text-soft, #c3cad3)' }}>{words.hint}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {step === 0 && (
          <button type="button" onClick={quick} data-testid="guide-quick" data-fel-primary className={`${choice} w-full border-transparent ${ring(hint)}`}
            style={{ background: 'linear-gradient(180deg, #4df0ff 0%, var(--fel-accent, #00E5FF) 55%, #00c8e0 100%)', color: '#050505' }}>
            <Sparkles className="h-4 w-4" aria-hidden /> Make it for me
          </button>
        )}
        {step === 0 && GUIDE_LIGHTS.map((l, i) => (
          <button key={l.mood} type="button" onClick={() => pick(l.mood)} data-testid={`guide-light-${l.mood}`}
            className={choice} style={{ borderColor: C.line, color: C.text, background: C.surface2 }}>{l.label}</button>
        ))}
        {step === 1 && GUIDE_ADDS.map((a, i) => (
          <button key={a.id} type="button" onClick={() => add(a.id)} disabled={added.includes(a.id)} data-testid={`guide-add-${a.id}`}
            className={`${choice} disabled:opacity-50 ${ring(hint && i === 0)}`} style={{ borderColor: C.line, color: C.text, background: C.surface2 }}>
            {added.includes(a.id) && <Check className="h-4 w-4" aria-hidden style={{ color: C.emerald }} />}{a.label}
          </button>
        ))}
        {step === 2 && (
          <>
            {GUIDE_ADDS.filter((a) => !added.includes(a.id)).map((a) => (
              <button key={a.id} type="button" onClick={() => add(a.id)} data-testid={`guide-add-${a.id}`} className={choice} style={{ borderColor: C.line, color: C.dim, background: 'transparent' }}>+ {a.label}</button>
            ))}
            <button type="button" onClick={watch} data-testid="guide-watch" data-fel-primary
              className={`${choice} border-transparent ${ring(hint)}`} style={{ background: 'linear-gradient(180deg, #4df0ff 0%, var(--fel-accent, #00E5FF) 55%, #00c8e0 100%)', color: '#050505' }}>
              <Play className="h-4 w-4" aria-hidden /> Watch it
            </button>
          </>
        )}
        {step === 3 && (
          <>
            {onPlay && (
              <button type="button" onClick={() => { onFinish(); onPlay(); }} data-testid="guide-play" data-fel-primary className={`${choice} border-transparent`}
                style={{ background: 'linear-gradient(180deg, #4df0ff 0%, var(--fel-accent, #00E5FF) 55%, #00c8e0 100%)', color: '#050505' }}>
                <Play className="h-4 w-4" aria-hidden /> Play it
              </button>
            )}
            {watched === 'still' && <p className={`${TYPE.small} w-full`} style={{ color: C.dim }}>Reduced motion is on, so the camera stays still.</p>}
            {watched === 'skipped' && <button type="button" onClick={watch} data-testid="guide-watch" className={choice} style={{ borderColor: C.line, color: C.text, background: C.surface2 }}>Watch the intro</button>}
            <button type="button" onClick={onFinish} data-testid="guide-finish" className={choice} style={{ borderColor: C.line, color: C.text, background: C.surface2 }}>
              <Check className="h-4 w-4" aria-hidden /> Keep building
            </button>
          </>
        )}
      </div>
      {hint && step < 3 && (
        <p className={`${TYPE.small} mt-2`} style={{ color: C.gold }} data-testid="guide-hint" role="status">
          {step === 0 ? 'Tap Make it for me.' : step === 1 ? 'Try Floodlights.' : 'Tap Watch it.'}
        </p>
      )}
    </section>
  );
}

/** Reduced motion, the device's or the app's own setting (read once; the guide is short-lived). */
function useCalm(): boolean {
  const [calm, setCalm] = useState(false);
  useEffect(() => { try { setCalm(reducedMotion()); } catch { /* no window: motion allowed */ } }, []);
  return calm;
}
