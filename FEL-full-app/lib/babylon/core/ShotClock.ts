// THE PLAYER'S SHOT CLOCK — ELITE ONLY (lane/hoops-shot-core, owner 2026-10-20).
//
// The AI has always had a timer (BasketballCore.SHOT_CLOCK_SEC 6: "the possession never hangs") and it is unchanged. The player
// had none: a possession could be dribbled out forever. On ELITE it is now a broadcast shot clock on the scorebug:
//
//   · 12 s in 1v1, 14 s in 3v3 (the owner's numbers);
//   · it runs while MY side holds the ball live (in 3v3 my mates' hands count; a pass in the air counts; a shot in the air, a
//     loose ball, a board and a dunk flight do not);
//   · it resets on a rim touch and on every change of possession — any new possession, read off the mode's own
//     `possessionToken`, which every possession start already bumps (a check, a make-it-take-it reset, a board, a putback);
//   · at zero it is a violation: the Ref's `shot_clock` call, and the ball goes the other way;
//   · ROOKIE and PRO are untimed, and so is every staked / head-to-head run (runTier() plays those at PRO).
//
// Pure: no scene. The mode feeds it a frame's dt and three facts; it says when the horn goes, and publishes its own HUD value
// (`shotClock`: '' hidden, whole seconds from 5 up, tenths under 5 — the broadcast read) only when the shown value changes.

import type { Tier } from './Difficulty';

/** The owner's seconds (2026-10-20), per mode, on ELITE. Knob candidates: hoops.shotClock1v1Sec, hoops.shotClock3v3Sec. */
export const PLAYER_SHOT_CLOCK_SEC = { '1v1': 12, '3v3': 14 } as const;
export type ShotClockMode = keyof typeof PLAYER_SHOT_CLOCK_SEC;

/** The clock this run plays: ELITE only (0 = no clock). */
export function playerShotClockSec(mode: ShotClockMode, tier: Tier): number {
  return tier === 'elite' ? PLAYER_SHOT_CLOCK_SEC[mode] : 0;
}

/** Under this many seconds the clock shows tenths (the broadcast's last-five read). */
export const TENTHS_UNDER_SEC = 5;

/** What the scorebug shows for `remaining` seconds. */
export function shotClockText(remaining: number): string {
  const r = Math.max(0, remaining);
  return r < TENTHS_UNDER_SEC ? (Math.ceil(r * 10) / 10).toFixed(1) : String(Math.ceil(r));
}

export interface ShotClockFrame {
  /** The mode's possession token (bumped at every possession start). */
  token: number;
  /** My side has the possession. */
  ours: boolean;
  /** …and the ball is LIVE in our hands (not a shot in the air, a loose ball, a board, a dunk flight, a dead ball). */
  live: boolean;
}

export class PlayerShotClock {
  private full = 0;
  private left = 0;
  private token: number | null = null;
  private wasOurs = false;
  private fired = false;
  private shown: string | null = null;

  /** `seconds` is read at every new possession (so a pick made at TAP TO START is the run's); `publish` gets the HUD value. */
  constructor(private seconds: () => number, private publish: (v: string) => void = () => {}) {}

  /** Seconds left (the full clock when it is not running). */
  get remaining(): number { return this.left; }
  get on(): boolean { return this.full > 0; }

  /** A new possession, or a rim touch: back to the full clock. */
  reset(): void { this.full = Math.max(0, this.seconds()); this.left = this.full; this.fired = false; }
  /** The ball touched the iron: a fresh clock for whoever comes up with it. */
  rimTouch(): void { this.reset(); }

  /** One frame. Returns true ONCE, on the frame the clock runs out — the mode calls the violation. */
  tick(dt: number, f: ShotClockFrame): boolean {
    if (f.token !== this.token || (f.ours && !this.wasOurs)) { this.token = f.token; this.reset(); }
    this.wasOurs = f.ours;
    let violation = false;
    if (this.full > 0 && f.ours && f.live && !this.fired) {
      this.left = Math.max(0, this.left - Math.max(0, dt));
      if (this.left <= 0) { this.fired = true; violation = true; }
    }
    this.show(this.full > 0 && f.ours ? shotClockText(this.left) : '');
    return violation;
  }

  /** Hide it (the mode ended). */
  hide(): void { this.show(''); }

  private show(v: string): void {
    if (v === this.shown) return;
    this.shown = v;
    this.publish(v);
  }
}
