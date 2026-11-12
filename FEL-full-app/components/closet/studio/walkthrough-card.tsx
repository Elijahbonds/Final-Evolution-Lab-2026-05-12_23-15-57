'use client';

// The Studio's FIRST-RUN WALKTHROUGH card (CREATOR-PLAN phase 4d, 2026-10-06): place a part, paint a layer, save — about
// thirty seconds, once per device, skippable at every step. The state machine is lib/creator/look/studio/walkthrough.ts;
// the Closet feeds it what the player does.

import { X } from 'lucide-react';
import { lineSize } from '@/lib/design/type';   // EVERY-SCREEN P10
import { WALK_COPY, WALK_SECONDS, WALK_STEPS, walkCurrent, type WalkState } from '@/lib/creator/look/studio/walkthrough';

/** NEXUS STUDIO "Edit in the Closet" (studio-5): the Studio-edit mode has no Save Look. Its last step is the hand-back, which the
 *  Closet completes when "Back to Nexus Studio" succeeds (the way a save completes the live Closet's). */
export const STUDIO_EDIT_SAVE_COPY = {
  title: 'Send it back',
  body: 'Back to Nexus Studio hands this look to the Studio as one undo step. Nothing here is saved to your Closet.',
  tab: null,
} as const;

export function WalkthroughCard({ state, onNext, onSkip, studioEdit }: { state: WalkState; onNext: () => void; onSkip: () => void; studioEdit?: boolean }) {
  const step = walkCurrent(state);
  if (!step) return null;
  const copy = studioEdit && step === 'save' ? STUDIO_EDIT_SAVE_COPY : WALK_COPY[step];
  return (
    <div role="dialog" aria-label="Studio walkthrough" className="pointer-events-auto w-[min(320px,calc(100vw-2rem))] rounded-xl border border-cyan-400/40 bg-[#0c0c11]/90 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="font-display text-[12px] uppercase tracking-[0.2em] text-cyan-300">Studio · {state.step + 1} / {WALK_STEPS.length} · ~{WALK_SECONDS}s</span>
        <button type="button" onClick={onSkip} aria-label="Skip the walkthrough" className="-mr-2 grid h-11 w-11 place-items-center rounded text-white/50 hover:text-white"><X className="h-3.5 w-3.5" /></button>
      </div>
      <h3 className="mt-1 font-display text-base font-bold text-white">{copy.title}</h3>
      <p className={`mt-1 ${lineSize(copy.body, 'text-[12px]')} leading-relaxed text-white/65`}>{copy.body}</p>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1" aria-hidden>
          {WALK_STEPS.map((s, i) => <span key={s} className="h-1 w-6 rounded-full" style={{ background: i <= state.step ? 'var(--fel-cyan)' : 'rgba(255,255,255,0.15)' }} />)}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onSkip} className="min-h-11 min-w-11 px-1 text-[12px] text-white/50 hover:text-white/80">Skip</button>
          <button type="button" onClick={onNext} className="min-h-11 min-w-11 rounded-md bg-cyan-400/15 px-2.5 py-1 font-display text-[12px] font-semibold uppercase text-cyan-200 hover:bg-cyan-400/25">Next</button>
        </div>
      </div>
    </div>
  );
}
