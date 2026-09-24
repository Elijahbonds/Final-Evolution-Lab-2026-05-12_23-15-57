// HOOPS SWING — which side of the momentum meter a team-game play lands on (finish-release, 2026-09-24).
//
// The Game-Breaker meter is MINE (the 1v1's contract): a play reports only when I made it or it was made on me. 3v3 picked
// the kind by the play's name instead of by who did it, so a rival swatting MY dunk reported swing('block') — a stop against
// me credited me — while my own blocks, my makes and the ball taken off me reported nothing. A make, a miss, a block and a
// steal happen BETWEEN two sides, so the call site names both and this table picks the kind (the 1v1's kinds, per side).

import type { MomentumEvent } from './MomentumBus';

/** Whose play it was, from my seat. */
export type Seat = 'me' | 'mate' | 'foe';

export interface SidedPlay {
  play: 'make' | 'miss' | 'block' | 'steal';
  /** Who did it: the scorer, the shooter, the blocker, the hand that took the ball. */
  by: Seat;
  /** Who it was done to: the shooter a block met, the carrier a steal took it from. */
  on?: Seat;
  /** A mate's make: my pass made it (the assist is my bucket too). */
  myPass?: boolean;
  /** A block on me: it met my dunk at the rim (1v1: the ball is gone, a turnover — a blocked jumper is a miss). */
  dunk?: boolean;
}

/** The kind to report on my meter, or null when the play is not mine to report. */
export function heroSwing(p: SidedPlay): MomentumEvent['kind'] | null {
  if (p.by === 'me') return p.play === 'make' ? 'big_make' : p.play;   // my make, my miss, my block, my steal
  if (p.play === 'make') return p.by === 'mate' && p.myPass ? 'big_make' : null;   // his bucket off my pass; nobody else's
  if (p.on !== 'me' || p.by !== 'foe') return null;   // the rest is mine only when THEY did it TO ME
  if (p.play === 'block') return p.dunk ? 'turnover' : 'miss';
  if (p.play === 'steal') return 'turnover';
  return null;
}
