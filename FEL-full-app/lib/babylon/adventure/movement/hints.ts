/**
 * Camera hints from traversal (lane A1): 'grind', 'flight', 'cruise', 'ride' (contracts.CameraHint; A4's camera blends
 * the highest priority each tick). One object per preset, reused and refreshed every tick, so the local player's
 * hints allocate nothing. A4: read a hint inside the tick it arrives (copy it if you keep it).
 */

import type { ActorId, CameraHint } from '../contracts';
import type { StepEnv } from './body';

/** Priorities, low to high: a lock (A2) or a boss beat outranks a ride, cruise outranks free flight. [TUNE] */
export const HINT_PRIORITY = { ride: 2, grind: 3, flight: 4, cruise: 5 } as const;

type TraversalPreset = keyof typeof HINT_PRIORITY;

const cache: Record<TraversalPreset, CameraHint> = {
  ride: { preset: 'ride', priority: HINT_PRIORITY.ride },
  grind: { preset: 'grind', priority: HINT_PRIORITY.grind },
  flight: { preset: 'flight', priority: HINT_PRIORITY.flight },
  cruise: { preset: 'cruise', priority: HINT_PRIORITY.cruise },
};

/** Push a traversal hint for the local player (a no-op for everyone else: env.hint is null then). */
export function pushHint(env: StepEnv, preset: TraversalPreset, targetId: ActorId, fovBoost: number): void {
  if (!env.hint) return;
  const h = cache[preset];
  h.targetId = targetId;
  h.fovBoost = Math.round(fovBoost * 10) / 10;
  env.hint(h);
}
