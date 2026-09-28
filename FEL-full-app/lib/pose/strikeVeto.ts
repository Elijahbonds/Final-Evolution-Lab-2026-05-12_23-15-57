// strikeVeto — when a body's strike is not a strike (movement play P7, 2026-09-25): the three rules the P3 floor proved
// (lib/input/bodyFloor.ts, the gate's stance and hands-up streams), moved here so the floor and the fight reader
// (lib/pose/fightReader.ts) run ONE copy:
//
//   • no strike in a jump (a jump's arms are the jump's);
//   • none within OVERHEAD_STRIKE_MS of both wrists overhead (the arms coming down out of a hands-up read as a punch
//     69–103 ms after they left it, and hands up while playing does nothing: owner call 3);
//   • none out of a MOVING crouch — a jump's gather — judged at the strike's own instant, told late: crouched past
//     CROUCH_DEAD at that instant or now, AND the squat ranging STRIKE_SQUAT_MOVE over the STRIKE_LOOKBACK_MS before it.
//     A crouch HELD is a fighting stance, and strikes come out of it.
//
// The floor's behaviour is byte-for-byte what it was (its tests pin it); the numbers and their measurements stay
// documented where they were set, in bodyFloor's header.
// Pure: no DOM.

/** The crouch pulls nothing under this squat (bodyFloor.CROUCH_DEAD): the veto's "crouched". */
export const CROUCH_DEAD = 0.35;
/** How far back (ms) from a strike's own instant the squat is looked at; the history keeps twice this. */
export const STRIKE_LOOKBACK_MS = 300;
/** A crouch that is MOVING: the squat's range over the lookback at least this. */
export const STRIKE_SQUAT_MOVE = 0.15;
/** No strike this soon (ms) after both wrists were overhead. */
export const OVERHEAD_STRIKE_MS = 300;

export class StrikeVeto {
  /** The tracked frames' squat over the last 2 × STRIKE_LOOKBACK_MS. */
  private squats: { t: number; squat: number | null }[] = [];
  /** The last tracked frame with both wrists overhead (capture ms). */
  private bothUpT = -Infinity;

  /** One tracked frame: its capture time, squat (null in the air) and whether both wrists are overhead. */
  push(t: number, squat: number | null, bothOverhead: boolean): void {
    if (bothOverhead) this.bothUpT = t;
    this.squats.push({ t, squat });
    while (this.squats.length > 2 && t - this.squats[0].t > 2 * STRIKE_LOOKBACK_MS) this.squats.shift();
  }

  /** A strike at `t` (its own instant) out of a jump's gather: crouched then or now, and the crouch moving. */
  inGather(t: number, nowSquat: number | null): boolean {
    let at: number | null = nowSquat;
    for (const x of this.squats) { if (x.t > t) break; at = x.squat; }
    if (!((at !== null && at >= CROUCH_DEAD) || (nowSquat !== null && nowSquat >= CROUCH_DEAD))) return false;
    let lo = Infinity, hi = -Infinity;
    for (const x of this.squats) if (x.t >= t - STRIKE_LOOKBACK_MS && x.squat !== null) { lo = Math.min(lo, x.squat); hi = Math.max(hi, x.squat); }
    return hi - lo >= STRIKE_SQUAT_MOVE;
  }

  /** A strike at `t` counts: on the ground, not out of a gather, not both arms coming down from overhead. */
  ok(t: number, nowSquat: number | null, inJump: boolean): boolean {
    return !inJump && t - this.bothUpT > OVERHEAD_STRIKE_MS && !this.inGather(t, nowSquat);
  }

  /** When both wrists were last overhead (capture ms). */
  get overheadAt(): number { return this.bothUpT; }

  /** Forget the squat history (the floor's release); the overhead instant stays. */
  clearSquats(): void { this.squats = []; }
  reset(): void { this.squats = []; this.bothUpT = -Infinity; }
}
