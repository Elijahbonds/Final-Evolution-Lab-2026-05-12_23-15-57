'use client';
// The Step Breath, drawn (MIRROR-COACH P7 FIX, 2026-09-29): the one pacer's ring on the STEP clock — it moves one unit
// per step the body reader detected, the number in it is the steps left in the breath in or out, and it holds still,
// saying why, when there is no body in the frame or no step for the reader's own cadence window. lib/breath/stepBreath.ts
// has the whole story (the cadence reader it consumes, FEL's own numbers, why it grades nothing); this file lays out
// a StepBreathView. Presentational: the host owns the body reader and the state.
//
// HONESTY: the cadence is the reader's own, labelled estimated, and the line under it says the camera counts steps and
// does not measure breathing. Nothing here is scored, paid, streaked or saved.
import { BreathPacer } from '@/components/breath/Pacer';
import { STEP_BREATH, STEP_BREATH_HONESTY, stepPacerSpec, type StepBreathSpec, type StepBreathView } from '@/lib/breath/stepBreath';

export function StepBreathRing({ view, spec = STEP_BREATH.spec, size = 'md' }: { view: StepBreathView; spec?: StepBreathSpec; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#00E5FF]/20 bg-black/30 p-3" data-step-breath data-waiting={view.waiting ?? ''} data-steps={view.stepCount}>
      <div className={view.waiting ? 'opacity-50' : undefined}>
        <BreathPacer id="step-breath" spec={stepPacerSpec(spec)} elapsedSec={view.stepCount} size={size} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-white/40">{STEP_BREATH.name}</div>
        <div className="text-sm text-white" aria-live="polite" data-step-breath-line>{view.line}</div>
        {view.spm !== null && <div className="text-[11px] text-white/50" data-step-breath-spm>About {view.spm} steps a minute (estimated)</div>}
        <div className="text-[11px] text-white/40">{STEP_BREATH_HONESTY}</div>
      </div>
    </div>
  );
}
