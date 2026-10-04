// Training cards for a coach-run session. The lane names and cues are the proposed screen lanes
// (still pending Elijah). Timers below are a starting clock so the coach can run a drill on the
// spot. assumption: 40s work / 20s rest for correctives and posture, 30/30 for plyos — not a
// signed feel number. They live here so a later pass can change them in one place.

import { DRAFT_CUES } from '@/lib/screen/PROPOSED-thresholds';

export type TrainingLane = 'correctives' | 'posture' | 'dunking';

export interface DrillCard {
  lane: TrainingLane;
  name: string;
  cue: string;
  reps: number;
  workSec: number;
  restSec: number;
}

export const DRILL_CARDS: readonly DrillCard[] = [
  {
    lane: 'correctives',
    name: 'Correctives',
    cue: DRAFT_CUES.kneeWallShin,
    reps: 8,
    workSec: 40,
    restSec: 20,
  },
  {
    lane: 'posture',
    name: 'Static & Dynamic Posture',
    cue: DRAFT_CUES.ohsArmsForward,
    reps: 8,
    workSec: 40,
    restSec: 20,
  },
  {
    lane: 'dunking',
    name: 'Dunking & Plyometrics',
    cue: DRAFT_CUES.jumpLandingKneeCave,
    reps: 6,
    workSec: 30,
    restSec: 30,
  },
];

export function drillByLane(lane: TrainingLane): DrillCard {
  const card = DRILL_CARDS.find((d) => d.lane === lane);
  if (!card) throw new Error(`unknown lane ${lane}`);
  return card;
}

export function drillPhase(
  elapsedMs: number,
  workSec: number,
  restSec: number,
): { phase: 'work' | 'rest' | 'done'; remainingSec: number } {
  const workMs = workSec * 1000;
  const restMs = restSec * 1000;
  if (elapsedMs < workMs) return { phase: 'work', remainingSec: Math.ceil((workMs - elapsedMs) / 1000) };
  if (elapsedMs < workMs + restMs) return { phase: 'rest', remainingSec: Math.ceil((workMs + restMs - elapsedMs) / 1000) };
  return { phase: 'done', remainingSec: 0 };
}
