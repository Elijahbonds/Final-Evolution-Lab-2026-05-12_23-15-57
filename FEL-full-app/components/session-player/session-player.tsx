'use client';
// SessionPlayer — PLAT-P01 (2026-10-27): one full-screen player for a training session. Owner, 2026-10-27: "autoplay,
// no extra taps, never confusing"; the look: dark, premium, athletic.
//
//   top 55%   the avatar demo of the step on screen (components/library/avatar-demo.tsx: autoplay, looping, silent; a step
//             with no loop shows the still start pose, "Demo coming" — never another movement). In a rest it already
//             plays the NEXT exercise, so the person sees what is coming.
//   below     the exercise name, the dose as the biggest type on screen ("3 × 8"; a timed set counts itself down), the
//             set pips, and one cue line.
//   bottom    ONE button: Set done (a set) · Skip rest (a rest) · Start now (the ready count) · Resume (paused).
//   top bar   close, a thin bar of the session's steps with "2 of 6", previous set, pause, mute.
//
// Nothing else is visible during a set. The set-up sits behind the small "How to set up" sheet, which opens by itself only
// before the first set of an exercise this device has never run. The finish screen: the time, the sets done, one next step.
//
// Reduced motion (the app's setting, lib/a11y/reducedMotion.ts, which follows the phone's by default): the decorative
// transitions go off. assumption: the demo keeps playing — it IS the instruction (the library stage only stops moving its
// camera by itself).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Info, Pause, Play, SkipBack, Volume2, VolumeX, X } from 'lucide-react';
import { AvatarDemo } from '@/components/library/avatar-demo';
import { reducedMotion } from '@/lib/a11y/reducedMotion';
import { clock, doseParts, duration } from '@/lib/session-player/dose';
import { isTimed, totalSets, type Session } from '@/lib/session-player/model';
import type { PlayerState } from '@/lib/session-player/machine';
import type { PlayMode } from '@/lib/session-player/fromSignature';
import type { VoiceOut } from '@/lib/session-player/voice';
import type { Clock } from '@/lib/session-player/ticker';
import { useSessionPlayer } from './use-session-player';
import { LOOK, SHEET_KEYFRAMES } from './look';
import { PLAYER_COPY as T, stepOfLine } from './copy';

export interface FinishResult { ok: boolean; line: string | null }

export interface SessionPlayerProps {
  session: Session;
  mode: PlayMode;
  /** The finish: save the session (the page's own action), or nothing in a preview. Called once. */
  onFinish?: () => Promise<FinishResult>;
  onClose: () => void;
  initial?: PlayerState;
  clock?: Clock;
  voice?: VoiceOut;
}

export function SessionPlayer({ session, mode, onFinish, onClose, initial, clock: clk, voice }: SessionPlayerProps) {
  const [saved, setSaved] = useState<FinishResult | null>(null);
  const [saving, setSaving] = useState(false);
  const save = useRef(onFinish);
  save.current = onFinish;
  const runSave = () => {
    if (!save.current) { setSaved({ ok: true, line: null }); return; }
    setSaving(true);
    save.current().then((r) => setSaved(r), () => setSaved({ ok: false, line: null })).finally(() => setSaving(false));
  };
  const p = useSessionPlayer(session, { initial, clock: clk, voice, onFinish: runSave });
  const { state } = p;
  const [askEnd, setAskEnd] = useState(false);
  const calm = useMemo(() => reducedMotion(), []);
  const step = session.steps[Math.min(state.step, session.steps.length - 1)];

  // the step on screen and when it opened (the rig times the demo's first moving frame from here)
  const [openedAt, setOpenedAt] = useState(0);
  useEffect(() => { setOpenedAt(Math.round(typeof performance !== 'undefined' ? performance.now() : 0)); }, [state.step]);

  // no page scroll under the player
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const quiet = calm ? ' [&_*]:!transition-none [&_*]:!animate-none' : '';

  if (state.phase === 'finish' || !step) {
    const line = mode === 'preview' ? T.preview : saving ? T.saving : saved && !saved.ok ? T.saveFailed : mode === 'device' ? T.keptOnPhone : saved?.line ?? null;
    const failed = !!saved && !saved.ok;
    return (
      <div className={LOOK.shell + quiet} data-session-player data-phase="finish" data-mode={mode} role="dialog" aria-modal="true" aria-label={session.title}>
        <style>{SHEET_KEYFRAMES}</style>
        <div className={LOOK.finish}>
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[#00FF9D]/15 motion-safe:animate-[felSheetUp_320ms_cubic-bezier(0.2,1.4,0.4,1)]"><Check aria-hidden className="h-10 w-10 text-[#00FF9D]" /></span>
          <p className={LOOK.finishTitle}>{T.done}</p>
          <dl className="mt-6 flex gap-10">
            <div><dd className={LOOK.stat} data-finish-time>{duration(state.elapsedMs)}</dd><dt className={LOOK.label}>{T.time}</dt></div>
            <div><dd className={LOOK.stat} data-finish-sets>{state.setsDone}</dd><dt className={LOOK.label}>{T.sets}</dt></div>
          </dl>
          {line && <p role="status" className={LOOK.finishLine} data-finish-line>{line}</p>}
        </div>
        <div className={LOOK.bottom}>
          {failed
            ? <button type="button" data-fel-press data-player-primary className={LOOK.button} onClick={runSave}>{T.tryAgain}</button>
            : <button type="button" data-fel-press data-player-primary disabled={saving} className={LOOK.button} onClick={onClose}>{T.backToProgram}</button>}
        </div>
      </div>
    );
  }

  const d = doseParts(step);
  const timedWork = state.phase === 'work' && isTimed(step) && state.leftMs !== null;
  const counting = state.phase === 'ready' || state.phase === 'rest';
  const big = counting || timedWork ? clock(state.leftMs ?? 0) : d.big;
  const label = state.phase === 'ready' ? T.getReady : state.phase === 'rest' ? T.rest : null;
  const small = timedWork ? (d.small ? `s · ${d.small}` : 's') : counting ? null : d.small;
  const button = state.paused ? T.resume : state.phase === 'work' ? T.setDone : state.phase === 'rest' ? T.skipRest : T.startNow;
  const fill = (i: number) => (i < state.step ? 1 : i === state.step ? (state.set - 1) / Math.max(1, step.sets) : 0);
  const total = session.steps.length;

  return (
    <div className={LOOK.shell + quiet} data-session-player data-phase={state.phase} data-step={state.step} data-set={state.set} data-paused={state.paused ? '1' : '0'}
      data-mode={mode} data-clip={step.clip ?? 'still'} data-step-opened={openedAt} data-sets-total={totalSets(session)} role="dialog" aria-modal="true" aria-label={session.title}>
      <style>{SHEET_KEYFRAMES}</style>
      <div className={LOOK.demo + (step.clip ? ` ${LOOK.demoQuiet}` : '')} data-player-demo>
        <AvatarDemo clip={step.clip} />
        <div className={LOOK.topBar}>
          <button type="button" aria-label={T.close} className={LOOK.iconBtn} data-player-close onClick={() => { p.pause(); setAskEnd(true); }}><X className="h-5 w-5" /></button>
          <div className={LOOK.progressWrap} data-player-progress>
            <div className={LOOK.progressRow} aria-hidden>
              {session.steps.map((s, i) => (
                <span key={i} className={LOOK.progressSeg}><span className={LOOK.progressFill} style={{ width: `${Math.round(fill(i) * 100)}%` }} /></span>
              ))}
            </div>
            <p className={`mt-1.5 ${LOOK.label}`}>{stepOfLine(state.step + 1, total)}</p>
          </div>
          <button type="button" aria-label={T.back} className={LOOK.iconBtn} data-player-back disabled={state.phase === 'ready'} onClick={p.back}><SkipBack className="h-5 w-5" /></button>
          <button type="button" aria-label={state.paused ? T.resume : T.pause} aria-pressed={state.paused} className={LOOK.iconBtn} data-player-pause onClick={() => { setAskEnd(false); p.togglePause(); }}>
            {state.paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          <button type="button" aria-label={p.muted ? T.unmute : T.mute} aria-pressed={p.muted} className={LOOK.iconBtn} data-player-mute onClick={p.toggleMute}>
            {p.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
        {state.paused && (
          <div className={LOOK.pausedVeil + (askEnd ? ' pointer-events-auto' : '')} data-player-paused>
            {askEnd ? (
              <div className="flex flex-col items-center gap-4 px-6 text-center">
                <p className={LOOK.name}>{T.endAsk}</p>
                <div className="flex gap-3">
                  <button type="button" data-fel-press data-player-end className="min-h-[48px] rounded-2xl border border-white/25 px-6 text-[16px] font-bold text-white active:scale-[0.97]" onClick={onClose}>{T.end}</button>
                  <button type="button" data-fel-press data-player-keep className="min-h-[48px] rounded-2xl bg-white px-6 text-[16px] font-bold text-black active:scale-[0.97]" onClick={() => { setAskEnd(false); p.resume(); }}>{T.keepGoing}</button>
                </div>
              </div>
            ) : <p className={LOOK.label}>{T.paused}</p>}
          </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={LOOK.body} aria-live="polite">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {label && <p className={LOOK.label} data-player-label>{label}{state.phase === 'rest' ? ` · ${T.next}` : ''}</p>}
              <h2 className={LOOK.name} data-player-name>{step.name}</h2>
            </div>
            {!!step.setup && (
              <button type="button" aria-label={T.howToSetUp} aria-expanded={p.sheet} className={LOOK.setupBtn} data-player-setup onClick={() => p.setSheet(!p.sheet)}><Info className="h-5 w-5" /></button>
            )}
          </div>
          <div className={LOOK.doseRow}>
            <p className={counting ? LOOK.doseRest : LOOK.dose} data-player-dose>{big}</p>
            {small && <p className={LOOK.doseSmall}>{small}</p>}
          </div>
          {step.sets > 1 && (
            <div className={LOOK.pips} aria-hidden data-player-pips>
              {Array.from({ length: step.sets }, (_, i) => (
                <span key={i} className={LOOK.pip} style={{ background: i < state.set - 1 ? '#00FF9D' : i === state.set - 1 ? (state.phase === 'work' ? '#ffffff' : '#00E5FF') : 'rgba(255,255,255,0.16)' }} />
              ))}
            </div>
          )}
          {state.phase === 'work' && step.cue && <p className={LOOK.cue} data-player-cue>{step.cue}</p>}
        </div>
        {p.sheet && (
          <div className={LOOK.sheet} data-player-sheet role="region" aria-label={T.howToSetUp}>
            <div className="flex items-center justify-between gap-2">
              <p className={LOOK.label}>{T.howToSetUp}</p>
              <button type="button" aria-label={T.close} className={LOOK.setupBtn} onClick={() => p.setSheet(false)}><X className="h-5 w-5" /></button>
            </div>
            <p className={LOOK.sheetText}>{step.setup}</p>
            {step.note && <p className={LOOK.sheetText} data-player-note>{step.note}</p>}
          </div>
        )}
      </div>

      <div className={LOOK.bottom}>
        <button type="button" data-fel-press data-player-primary className={state.phase === 'rest' && !state.paused ? LOOK.buttonRest : LOOK.button} onClick={() => { setAskEnd(false); p.primary(); }}>{button}</button>
      </div>
    </div>
  );
}
