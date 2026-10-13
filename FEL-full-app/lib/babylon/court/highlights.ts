// HIGHLIGHT PACING (vis-court, wave 2, 2026-10-13) — when a mode may replay a moment.
//
// The broadcast kit (ModeDefinition.replay + ctx.highlight) replays whatever a mode asks it to. A replay on every point would be
// a TV stuck on the instant replay, so the court modes ask through this pacer: the first worthy moment replays at once, then
// `every` plays must pass before the next, never in reduced motion, and never for the moment that ends the match (the end card
// is what the player is waiting for; "never replay the final moment before the end card", the brief). Pure.

/** How many plays (points, shots, kicks) pass between replays. */
export const REPLAY_EVERY = 3;

export class HighlightPacer {
  private since: number;
  constructor(private readonly every = REPLAY_EVERY) { this.since = every; }

  /** A play ended without a replay (or after one): count it. */
  tick(): void { this.since++; }

  /** Replay this moment? Consumes the cooldown when it says yes. */
  offer(worthy: boolean, opts: { final?: boolean; reduced?: boolean } = {}): boolean {
    if (!worthy || opts.final || opts.reduced) return false;
    if (this.since < this.every) return false;
    this.since = 0;
    return true;
  }

  get playsSince(): number { return this.since; }
}

/** Pure: is this point's reason a winner (a kill, a stuff, one they could not reach), as opposed to an error? Hero's only. */
export function winnerReason(why: string, heroWon: boolean): boolean {
  return heroWon && /KILL|STUFF|METEOR|COULD NOT REACH|ZONE|KINETIC|STRETCHED/i.test(why);
}
