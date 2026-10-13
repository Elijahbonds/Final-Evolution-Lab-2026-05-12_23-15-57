// RACE MOMENTS (vis-race, visual wave 2, 2026-10-13) — WHEN a race may replay a moment, and WHERE it leaves a mark. Pure.
//
// The broadcast kit (ModeDefinition.replay + ctx.highlight) replays whatever a mode asks it to, and holds the mode's update()
// while it plays. A race is not a football drive: there is no dead ball, so a replay is a cutaway from a clock that is
// running. Which is why every replay a racing mode asks for goes through this file's pacer:
//   · rarely — at most two a race, 25 s apart, and not in the first 10 s (the field has not sorted itself yet);
//   · only for a moment worth it — taking the lead, or two places inside four seconds (a kill, for the plane);
//   · never when it would sit on the end of the race: past 88 % of the distance nothing is offered, so the final stretch and
//     the line itself ("never replay the final moment before the end card") are always played, never replayed;
//   · never under reduced motion;
//   · and only if the moment still stands a beat later (a pass the player lost again is not a highlight).
// Nothing here touches scoring, timing, speed, handling or the camera that plays — presentation only.

/** How a race paces its replays. */
export const REPLAY_PACE = {
  /** No replay before this much race clock. */
  minRaceSec: 10,
  /** At most this many a race. */
  maxPerRace: 2,
  /** Race seconds between two replays. */
  minGapSec: 25,
  /** Past this fraction of the race (0..1) nothing is offered: the finish is never replayed, and never delayed. */
  endGuard01: 0.88,
} as const;

/** What counts as a BIG overtake: the lead, or this many places inside the window. */
export const OVERTAKE = { gainWindowSec: 4, bigGain: 2, /** the beat held after the pass, so the replay shows it complete */ settleSec: 0.7, /** seconds of recording shown */ replayLastSec: 3.0 } as const;
/** A kill's replay waits this long after the hit, so the replay's end shows the victim's tumble (it is recorded as drawn). */
export const KILL = { settleSec: 1.0, replayLastSec: 3.2 } as const;

/** Is a replay allowed at this moment of the race? (The cue and the pacer both ask; the pacer counts what it let through.) */
export class ReplayPacer {
  private n = 0;
  private lastAt = -Infinity;
  allow(raceSec: number, progress01: number, reduced: boolean): boolean {
    if (reduced) return false;
    if (this.n >= REPLAY_PACE.maxPerRace) return false;
    if (raceSec < REPLAY_PACE.minRaceSec) return false;
    if (raceSec - this.lastAt < REPLAY_PACE.minGapSec) return false;
    if (progress01 >= REPLAY_PACE.endGuard01) return false;
    return true;
  }
  /** A replay went out at `raceSec`. */
  commit(raceSec: number): void { this.n++; this.lastAt = raceSec; }
  get count(): number { return this.n; }
  reset(): void { this.n = 0; this.lastAt = -Infinity; }
}

/** A replay cue: armed by a moment, fired `delay` race-seconds later if it still stands and is still allowed. */
export class ReplayCue {
  private fireAt: number | null = null;
  constructor(private readonly pacer: ReplayPacer) {}
  get armed(): boolean { return this.fireAt !== null; }
  arm(raceSec: number, progress01: number, reduced: boolean, delay: number): boolean {
    if (this.fireAt !== null || !this.pacer.allow(raceSec, progress01, reduced)) return false;
    this.fireAt = raceSec + delay;
    return true;
  }
  cancel(): void { this.fireAt = null; }
  /** Every frame while armed: `stands` = the moment still holds. True once, when the replay should play now. */
  step(raceSec: number, progress01: number, reduced: boolean, stands: boolean): boolean {
    if (this.fireAt === null) return false;
    if (!stands || !this.pacer.allow(raceSec, progress01, reduced)) { this.fireAt = null; return false; }
    if (raceSec < this.fireAt) return false;
    this.fireAt = null;
    this.pacer.commit(raceSec);
    return true;
  }
}

/** Watches the player's place; says when a BIG overtake has happened and held. */
export class OvertakeWatch {
  private prev = 0;
  private gains: { t: number; gain: number }[] = [];
  private heldPlace = 0;
  readonly pacer = new ReplayPacer();
  private readonly cue = new ReplayCue(this.pacer);

  /** `place` 1 = leading. Returns true on the frame the replay should play. */
  step(place: number, raceSec: number, progress01: number, reduced: boolean): boolean {
    if (this.prev === 0) { this.prev = place; return false; }
    if (place < this.prev) {
      this.gains.push({ t: raceSec, gain: this.prev - place });
      this.gains = this.gains.filter((g) => raceSec - g.t <= OVERTAKE.gainWindowSec);
      const total = this.gains.reduce((a, g) => a + g.gain, 0);
      if ((place === 1 || total >= OVERTAKE.bigGain) && this.cue.arm(raceSec, progress01, reduced, OVERTAKE.settleSec)) this.heldPlace = place;
    }
    this.prev = place;
    return this.cue.step(raceSec, progress01, reduced, place <= this.heldPlace);
  }
  reset(): void { this.prev = 0; this.gains = []; this.heldPlace = 0; this.cue.cancel(); this.pacer.reset(); }
}

// ── MARKS ON THE GROUND ───────────────────────────────────────────────────────────────────────────────────────────

/** Metres between two tyre-mark stamps (the stamp is 2.2 m long, so neighbours overlap by 0.6 and their faded ends meet). */
export const TYRE_SPACING_M = 1.6;

export interface TyreStamp { x: number; z: number; yaw: number }

/**
 * Lays a tyre mark behind a vehicle while it slides or spins its wheels: one stamp every TYRE_SPACING_M along the path of
 * the REAR AXLE, turned to the direction of TRAVEL (a drifting kart's mark follows where it goes, not where its nose points).
 * Release it and the streak ends; the next slide starts a new one.
 */
export class TyreTrail {
  private lx = 0; private lz = 0; private on = false;
  /** (x, z) = the rear axle on the ground; (vx, vz) = the direction of travel (any length). Returns the stamps to lay. */
  step(x: number, z: number, vx: number, vz: number, active: boolean): TyreStamp[] {
    if (!active) { this.on = false; return []; }
    const yaw = Math.hypot(vx, vz) > 1e-3 ? Math.atan2(vx, vz) : 0;
    if (!this.on) { this.on = true; this.lx = x; this.lz = z; return [{ x, z, yaw }]; }
    const out: TyreStamp[] = [];
    let d = Math.hypot(x - this.lx, z - this.lz);
    // many stamps in one frame (a huge dt) walk the segment, so a gap is filled rather than skipped
    while (d >= TYRE_SPACING_M && out.length < 6) {
      const k = TYRE_SPACING_M / d;
      this.lx += (x - this.lx) * k; this.lz += (z - this.lz) * k;
      out.push({ x: this.lx, z: this.lz, yaw });
      d = Math.hypot(x - this.lx, z - this.lz);
    }
    if (out.length === 6) { this.lx = x; this.lz = z; }
    return out;
  }
  reset(): void { this.on = false; }
}

/** The rear axle's ground point for a vehicle at (x, z) heading `heading` (radians, 0 = +z), `back` metres behind its centre. */
export function rearAxle(x: number, z: number, heading: number, back: number): { x: number; z: number } {
  return { x: x - Math.sin(heading) * back, z: z - Math.cos(heading) * back };
}

/** A runner's stride, metres, by speed (m/s): ~1.5 m at a jog, ~2.4 m at 10 m/s — a sprinter's, not a distance runner's. */
export function strideLength(speed: number): number {
  return Math.max(1.2, Math.min(2.6, 1.0 + 0.14 * speed));
}

export interface PlantState { nextM: number; i: number }
export interface Plant { m: number; foot: 'L' | 'R' }

/** Where a runner's feet land: one plant every strideLength(speed) metres from `startM`, alternating left and right. */
export function stepPlants(s: PlantState, nowM: number, speed: number): Plant[] {
  const out: Plant[] = [];
  while (s.nextM <= nowM && out.length < 4) {
    out.push({ m: s.nextM, foot: s.i % 2 === 0 ? 'L' : 'R' });
    s.i++; s.nextM += strideLength(speed);
  }
  if (out.length === 4) s.nextM = nowM + strideLength(speed);   // a stall of frames: do not stamp the whole backlog
  return out;
}
