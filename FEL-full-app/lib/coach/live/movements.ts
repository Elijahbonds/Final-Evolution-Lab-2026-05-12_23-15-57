// lib/coach/live/movements.ts — COACH-LIVE (2026-10-25): which exercises a live session counts, what their flags are
// called, and the preset cues a coach may send.
//
// No new grading and no new fault words. The faults and their names are the Mirror's own (squatStage.ts,
// lungeStage.ts, hingeStage.ts, pushupStage.ts review labels); the per-fault cues are the Mirror's own linted cue lines
// (CueRule.cue, the ones its live coach already says). The only new copy is the handful of general presets below, and
// lib/coach/live/movements.test.ts runs every preset through lib/coach/cueLint.ts.
//
// THE CUE IS A KEY, NOT TEXT. A coach picks a preset and the wire carries its key; the client's page looks the words up
// in this same table. So nothing a coach types can appear on an athlete's screen — which matters for a minor's session —
// and an unknown key shows nothing.
//
// Pure data.

import type { CueRule } from '@/lib/mirror/patterns';
import { SQUAT_CUES } from '@/lib/mirror/squatPattern';
import { SQUAT_FAULT_LABEL } from '@/lib/mirror/squatStage';
import { LUNGE_CUES } from '@/lib/mirror/lungeAudit';
import { LUNGE_FAULT_LABEL, LUNGE_FAULTS } from '@/lib/mirror/lungeStage';
import { HINGE_CUES } from '@/lib/mirror/hingeAudit';
import { HINGE_FAULT_LABEL, HINGE_FAULTS } from '@/lib/mirror/hingeStage';
import { PUSHUP_CUES } from '@/lib/mirror/pushupAudit';
import { PUSHUP_FAULT_LABEL, PUSHUP_FAULTS } from '@/lib/mirror/pushupStage';

export type LiveMovement = 'squat' | 'lunge' | 'hinge' | 'pushup';
export const LIVE_MOVEMENTS: readonly LiveMovement[] = ['squat', 'lunge', 'hinge', 'pushup'];
export type FaultSide = 'left' | 'right' | 'both';

export interface LiveMovementSpec {
  id: LiveMovement;
  label: string;
  /** How the phone must see the body for the count and the flags (the audit's own view). */
  view: 'front' | 'side';
  faults: readonly string[];
  labelOf: Readonly<Record<string, string>>;
  cues: readonly CueRule[];
}

const SQUAT_FAULTS = ['kneeValgus', 'heelRise', 'armFall', 'lateralShift', 'shallow'] as const;

export const LIVE_SPECS: Readonly<Record<LiveMovement, LiveMovementSpec>> = {
  squat: { id: 'squat', label: 'Squat', view: 'front', faults: SQUAT_FAULTS, labelOf: SQUAT_FAULT_LABEL, cues: SQUAT_CUES },
  lunge: { id: 'lunge', label: 'Lunge', view: 'front', faults: LUNGE_FAULTS, labelOf: LUNGE_FAULT_LABEL, cues: LUNGE_CUES },
  hinge: { id: 'hinge', label: 'Hip hinge', view: 'side', faults: HINGE_FAULTS, labelOf: HINGE_FAULT_LABEL, cues: HINGE_CUES },
  pushup: { id: 'pushup', label: 'Push-up', view: 'side', faults: PUSHUP_FAULTS, labelOf: PUSHUP_FAULT_LABEL, cues: PUSHUP_CUES },
};

export function isLiveMovement(v: unknown): v is LiveMovement {
  return typeof v === 'string' && (LIVE_MOVEMENTS as readonly string[]).includes(v);
}

export function isLiveFault(movement: LiveMovement, fault: unknown): fault is string {
  return typeof fault === 'string' && LIVE_SPECS[movement].faults.includes(fault);
}

/** The flag's words: the Mirror's review label, with the side for a knee ("… (left)"). */
export function flagLine(movement: LiveMovement, fault: string, side?: FaultSide | null): string {
  const label = LIVE_SPECS[movement].labelOf[fault] ?? fault;
  return side ? `${label} (${side === 'both' ? 'both sides' : side})` : label;
}

/** How the phone should see the body, said to the athlete when the coach picks the exercise. */
export function setupLine(movement: LiveMovement): string {
  return LIVE_SPECS[movement].view === 'side'
    ? 'Turn side-on to your phone, whole body in the picture.'
    : 'Face your phone, whole body in the picture.';
}

// ── the cues ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CuePreset { key: string; text: string }

/** The general presets: instructions and feedback, not attention cues on a body part (cueLint 'instruction' tier). */
export const GENERAL_CUES: readonly CuePreset[] = [
  { key: 'gen:good', text: 'Good rep. Same again.' },
  { key: 'gen:slow', text: 'Slow it down on the way down.' },
  { key: 'gen:still', text: 'Quiet and still at the top.' },
  { key: 'gen:last', text: 'Last rep.' },
  { key: 'gen:rest', text: 'Rest. Shake it out.' },
  { key: 'gen:frame', text: 'Step back: whole body in the picture.' },
];

/** The presets for one exercise: its faults' own cues, then the general ones. */
export function cuePresets(movement: LiveMovement): CuePreset[] {
  const spec = LIVE_SPECS[movement];
  const fault = spec.cues.filter((c) => spec.faults.includes(c.faultId)).map((c) => ({ key: `${movement}:${c.faultId}`, text: c.cue }));
  return [...fault, ...GENERAL_CUES];
}

/** A key's words, or null for an unknown key (shown as nothing). */
export function cueText(key: unknown): string | null {
  if (typeof key !== 'string' || key.length > 64) return null;
  const gen = GENERAL_CUES.find((c) => c.key === key);
  if (gen) return gen.text;
  const [m, f] = key.split(':');
  if (!isLiveMovement(m)) return null;
  return cuePresets(m).find((c) => c.key === `${m}:${f}`)?.text ?? null;
}
