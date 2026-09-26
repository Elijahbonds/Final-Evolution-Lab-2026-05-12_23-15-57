// hudChip — what the Mirror's top-left chip says, per pattern (MIRROR-COACH P2, 2026-09-26). Pure.
//
// The chip was a ternary in mirror-harness.tsx (~:643) with three arms — press/row's phase, the jump's state, and
// `squatStage` for EVERYTHING ELSE. The Movement Screen fell into that last arm, so its chip read the guided squat's
// untouched first stage, BREATHE, from the first station to the last (P1 report, "Minor"). A map over every pattern
// cannot miss one: the screen now shows the station it is on.
import { screenFor, type ScreenId } from './screen';
import type { RunnerPhase } from './screenRunner';
import type { SquatStage } from './squatStage';

export type MirrorPattern = 'pressRow' | 'jump' | 'squat' | 'screen';

export interface ChipInput {
  pattern: MirrorPattern;
  /** Press/row: the kinematic engine's phase word. */
  phase: string;
  /** Jump: the DunkTracker's state. */
  jumpState: string;
  squatStage: SquatStage;
  /** Screen: the runner's latest state (null before its first tick). */
  runner: { screen: ScreenId; phase: RunnerPhase; stationIndex: number } | null;
}

const JUMP: Record<string, string> = { ready: 'Jump when ready', airborne: 'Airborne', calibrating: 'Stand still' };

/**
 * A check's label cut to the chip: up to its first comma or bracket ("Single-leg stance, 30 seconds a side" →
 * "Single-leg stance", "Pelvic tilt (hands on the hip points)" → "Pelvic tilt"). The full label is on the screen panel;
 * the chip sits beside the stage's corner figure and has to fit a phone.
 */
export const shortCheckLabel = (label: string): string => label.split(/[,(]/)[0].trim();

/** The screen's chip: which station of how many, and what it looks at. */
export function screenChip(runner: ChipInput['runner']): string {
  if (!runner) return 'Get set';
  if (runner.phase === 'complete') return 'Screen complete';
  const stations = screenFor(runner.screen);
  const i = Math.min(Math.max(0, runner.stationIndex), stations.length - 1);
  const what = stations[i]?.checks[0]?.label;
  return `Station ${i + 1} of ${stations.length}${what ? ` · ${shortCheckLabel(what)}` : ''}`;
}

export function chipLabel(c: ChipInput): string {
  const by: Record<MirrorPattern, () => string> = {
    pressRow: () => c.phase,
    jump: () => JUMP[c.jumpState] ?? c.jumpState,
    squat: () => c.squatStage,
    screen: () => screenChip(c.runner),
  };
  return by[c.pattern]();
}
