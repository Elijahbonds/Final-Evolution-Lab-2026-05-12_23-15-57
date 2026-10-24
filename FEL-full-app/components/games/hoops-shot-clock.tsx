'use client';

// THE SHOT CLOCK ON THE SCOREBUG (lane/hoops-shot-core, owner 2026-10-20): ELITE's player shot clock (core/ShotClock — 12 s in 1v1,
// 14 s in 3v3), the broadcast's cell beside the score. The mode publishes `shotClock` as the text to show ('' = no clock: ROOKIE,
// PRO, a staked run, or their ball); the last five seconds go red with tenths.
//
// PRESENTATION ONLY: the mode owns the clock, the reset and the violation; this draws the string it is handed.
import { ScoreCell, ScoreDivider } from './tv-hud';

/** Under this the cell is in the danger tone (the mode switches to tenths at the same point). */
export const SHOT_CLOCK_DANGER_SEC = 5;

export function HoopsShotClock({ value }: { value: unknown }) {
  if (typeof value !== 'string' || value === '') return null;
  const n = Number(value);
  const danger = Number.isFinite(n) && n < SHOT_CLOCK_DANGER_SEC;
  return (
    <>
      <ScoreDivider />
      <span data-hud="shot-clock">
        <ScoreCell inline label="SHOT" value={value} tone={danger ? 'danger' : 'text'} size="stat" pop={false} />
      </span>
    </>
  );
}
