// hoopsBody — hoops by body: the shot read on the body's own clock (movement play P6; Mirror & coaching Plan Phase 7,
// owner decision 2026-10-07: FULL hoops body play — the 3PT, 1v1 and 3v3).
//
// The plan's row 6: "3PT: bend to the rack, dip, set point, jump, and the release graded against the apex … shots graded
// on the body's clock". The pad's shot is a meter (BasketballCore.ShotMeter): the press starts it, the release is graded
// by where the bar is. A camera cannot press on the meter's clock — every frame reaches the page 60–250 ms late, and a
// take-off is told up to ~270 ms after it happened (BodyReader: a small hop is told only MIN_FLIGHT_MS in). So the body's
// shot is graded the way the dunk's slam is (lib/move/dunkBody): against the body's OWN apex, two instants on the one
// capture clock, so the camera's lag cancels out. The meter is then placed where that timing puts it and released, so
// every shot downstream (the make, the arc, the follow-through, the HUD's EARLY / LATE, the end card) is the pad's.
//
//   take-off    starts the shot (the meter and the rise clip): a jump is the commitment, never a dip — a dip is the load,
//               and a dip on its own presses nothing (no turbo from a dip, the plan's rule; lib/move/bodyControlSource);
//   release     the wrist's push from overhead (BodyReader 'release'): its hand is the ball hand, its instant against the
//               apex is the grade;
//   apex        the top of the jump (BodyReader 'apex'); a landing told first stands in with the take-off's own top
//               (v0 / g);
//   no release  by RELEASE_WAIT_MS after the landing: the ball was held through the jump (graded late, as a meter run
//               out is);
//   no jump     a release on the floor with no take-off told within SET_SHOT_WAIT_MS: a set shot, graded early (short):
//               the read is "release against the apex", and a set shot has none.
//
// Measured on the two recorded jump shots (lib/pose/__fixtures__, CMU 124_05 and 06_15): the reader's release sits
// 170 ms and 168 ms before its apex (the truth's: 106 and 159 ms). Both shooters release on the way up, as most do.
//
// TUNED (2026-10-07, flagged — the owner's eye is the judge): BODY_RELEASE_TARGET_MS −120 (the body's green centre,
// between the two captures' truths) and BODY_RELEASE_GOOD_MS ±120 (the body's open-jumper good window; perfect is the
// meter's own 0.35 of it, ±42 ms). The window is wider than the pad's ±65 ms because two read instants each carry about
// a frame of error at 30 fps (the plan's phase-2 gate: ±1 frame); a pad window on a camera read would grade the
// reader's jitter, not the shot. Contest and distance still narrow it: the body's error is scaled into the meter's
// seconds (BODY_TO_METER) and graded by the meter's own window for THAT shot.
//
// Pure: no DOM, no camera, no Babylon.
import type { ModeBodySpec } from '@/lib/input/bodyProfiles';
import type { BodyEvent, Hand } from '@/lib/pose/BodyReader';

/** The body's green centre: release − apex (ms). [TUNE] */
export const BODY_RELEASE_TARGET_MS = -120;
/** The body's good half-window around it on an open jumper (ms). [TUNE] */
export const BODY_RELEASE_GOOD_MS = 120;
/**
 * The meter's own good half-window on an open set jumper (s): ShotMeter.start(0, 'jumper', 0) gives 0.09 of a 0.72 s rise
 * (lib/pose/baseline SET_JUMPER_GREEN.goodMs 65). The body's ±BODY_RELEASE_GOOD_MS maps onto exactly this.
 */
export const OPEN_JUMPER_GOOD_SEC = 0.09 * 0.72;
/** Body ms → meter seconds: the open jumper's windows line up; a contested or deep shot's narrower meter narrows the body's too. */
export const BODY_TO_METER = OPEN_JUMPER_GOOD_SEC / (BODY_RELEASE_GOOD_MS / 1000);
/** The meter's perfect band is this share of its good one (ShotMeter.release: |d| ≤ half × 0.35). */
export const PERFECT_SHARE = 0.35;

/** A release up to this long BEFORE the take-off still belongs to the jump: a quick shot leaves on the way up (06_15: 16 ms). */
export const RELEASE_BEFORE_TAKEOFF_MS = 250;
/** After the landing (capture clock), a jump with no release told by now was held through: graded late. */
export const RELEASE_WAIT_MS = 400;
/** A release with no take-off told this long after it (capture clock) is a set shot. */
export const SET_SHOT_WAIT_MS = 400;
/** A take-off never landed (the body lost in the air) is given up this long after it (capture clock). */
export const LOST_SHOT_MS = 1500;
/**
 * The longest a mode holds its meter for the body (app clock, from the shot's start): past it the meter runs out as a
 * pad's would. Over the slowest path above: a take-off told ~270 ms late, a ~1 s flight, the landing told 100 ms after
 * it, then RELEASE_WAIT_MS.
 */
export const BODY_SHOT_MAX_MS = 1800;
/** The modes' pump-fake window (HoopsMoves.PUMP_MAX_SEC, pinned by hoopsBody.test): a body release is never placed in it. */
export const PUMP_MAX_SEC = 0.22;
/** Clear of the pump window by this much (s). */
export const PUMP_CLEAR_SEC = 0.05;
/** The error a shot with no read release (held through the jump) and a set shot (no jump) are graded at. */
export const HELD_ERR_MS = 1.6 * BODY_RELEASE_GOOD_MS;
export const SET_SHOT_ERR_MS = -1.6 * BODY_RELEASE_GOOD_MS;

const G = 9.81;

export type BodyShotWhy = 'timed' | 'set' | 'held';

/** One body shot, decided. */
export interface ShotVerdict {
  /** The error against the body's green centre (ms, − = early): what the meter is placed by. */
  errMs: number;
  /** Release − apex (ms) when both were read; null for a set shot or a held one. */
  lateMs: number | null;
  why: BodyShotWhy;
  /** The ball hand: whichever wrist released (null when no release was read). */
  hand: Hand | null;
  jumped: boolean;
  feet: 'one' | 'two' | null;
  takeoffT: number | null;
  apexT: number | null;
  releaseT: number | null;
}

export interface ShotAct {
  /** The shot began on this event: start the meter and the rise now. */
  start: boolean;
  /** The shot is decided: place the meter (meterTFor) and release it. */
  verdict: ShotVerdict | null;
  /** The event was part of a shot (play the game received). */
  took: boolean;
}

/** The quality the meter will call for this error on an OPEN jumper (the HUD's word, and the tests'). */
export function bodyShotQuality(errMs: number): 'perfect' | 'good' | 'early' | 'late' {
  const a = Math.abs(errMs);
  if (a <= BODY_RELEASE_GOOD_MS * PERFECT_SHARE) return 'perfect';
  if (a <= BODY_RELEASE_GOOD_MS) return 'good';
  return errMs < 0 ? 'early' : 'late';
}

/** The meter a body shot is placed on (BasketballCore.ShotMeter's public face). */
export interface MeterFace { readonly greenCenter01: number; readonly durationSec: number }

/**
 * Where the meter must stand for its own release() to grade this error: the green centre plus the error in the meter's
 * seconds. Never under `minSec` (a mode's pump-fake window: a release that early is read as a fake) and never at the
 * meter's end (which is the brick / the auto-release).
 */
export function meterTFor(errMs: number, meter: MeterFace, minSec = 0): number {
  const dur = meter.durationSec > 0 ? meter.durationSec : 1;
  const t = meter.greenCenter01 + (errMs / 1000) * BODY_TO_METER / dur;
  return Math.min(0.995, Math.max(minSec / dur, t));
}

/**
 * A jump shot read off the body's events. One shot at a time: after its verdict it waits for the jump to come down (or a
 * new take-off) before another can start; the owner may reset() it at any moment (a new ball, a new possession).
 */
export class BodyShot {
  private state: 'idle' | 'up' | 'set' | 'done' = 'idle';
  private takeoff: { t: number; v0: number; feet: 'one' | 'two' } | null = null;
  private apexT: number | null = null;
  private landT: number | null = null;
  private rel: { t: number; hand: Hand } | null = null;
  private doneAt = -Infinity;

  /** A shot has started and has no verdict yet: the mode holds its meter short of the end. */
  get pending(): boolean { return this.state === 'up' || this.state === 'set'; }

  reset(): void {
    this.state = 'idle'; this.takeoff = null; this.apexT = null; this.landT = null; this.rel = null; this.doneAt = -Infinity;
  }

  see(ev: BodyEvent): ShotAct {
    const none: ShotAct = { start: false, verdict: null, took: false };
    // after a verdict: the same jump's landing closes it; a new take-off starts the next shot
    if (this.state === 'done') {
      if (ev.kind === 'land') { this.state = 'idle'; return none; }
      if (ev.kind !== 'takeoff' && !(ev.kind === 'release' && ev.t - this.doneAt > SET_SHOT_WAIT_MS)) return none;
      this.reset();
    }
    switch (ev.kind) {
      case 'takeoff': {
        if (this.state === 'up') return none;   // one jump, one shot
        const prior = this.state === 'set' ? this.rel : null;
        // a jump well after a release on the floor is not that shot's: the set shot stands, and this jump is not a shot
        if (prior && ev.t - prior.t > RELEASE_BEFORE_TAKEOFF_MS) return { start: false, verdict: this.decide('set'), took: true };
        this.state = 'up';
        this.takeoff = { t: ev.t, v0: ev.v0, feet: ev.feet };
        this.apexT = null; this.landT = null;
        // a release told before the take-off (a quick shot on the way up) belongs to this jump
        this.rel = prior && ev.t - prior.t <= RELEASE_BEFORE_TAKEOFF_MS ? prior : null;
        return { start: prior === null, verdict: null, took: true };
      }
      case 'apex': {
        if (this.state !== 'up') return none;
        this.apexT = ev.t;
        return { start: false, verdict: this.rel ? this.decide('timed') : null, took: true };
      }
      case 'release': {
        if (this.state === 'up') {
          if (this.rel || ev.t < this.takeoff!.t - RELEASE_BEFORE_TAKEOFF_MS) return none;
          this.rel = { t: ev.t, hand: ev.hand };
          const top = this.apexT ?? (this.landT !== null ? this.predictedApex() : null);
          return { start: false, verdict: top !== null ? this.decide('timed') : null, took: true };
        }
        if (this.state === 'idle') {
          this.state = 'set';
          this.rel = { t: ev.t, hand: ev.hand };
          return { start: true, verdict: null, took: true };
        }
        return none;
      }
      case 'land': {
        if (this.state !== 'up') return none;
        this.landT = ev.t;
        return { start: false, verdict: this.rel ? this.decide('timed') : null, took: true };
      }
      default:
        return none;
    }
  }

  /** The capture clock moved on (the latest frame's read.t): a held jump or a set shot is decided by the wait. */
  tick(t: number): ShotVerdict | null {
    if (this.state === 'set' && this.rel && t - this.rel.t >= SET_SHOT_WAIT_MS) return this.decide('set');
    if (this.state === 'up' && !this.rel) {
      if (this.landT !== null && t - this.landT >= RELEASE_WAIT_MS) return this.decide('held');
      if (this.landT === null && this.takeoff && t - this.takeoff.t >= LOST_SHOT_MS) return this.decide('held');
    }
    return null;
  }

  private predictedApex(): number {
    const k = this.takeoff!;
    return k.t + (Math.max(0, k.v0) / G) * 1000;
  }

  private decide(why: BodyShotWhy): ShotVerdict {
    const k = this.takeoff;
    const apexT = k ? this.apexT ?? this.predictedApex() : null;
    const lateMs = why === 'timed' && this.rel && apexT !== null ? this.rel.t - apexT : null;
    const errMs = why === 'set' ? SET_SHOT_ERR_MS : why === 'held' ? HELD_ERR_MS : (lateMs ?? 0) - BODY_RELEASE_TARGET_MS;
    const v: ShotVerdict = {
      errMs, lateMs, why, hand: this.rel?.hand ?? null, jumped: !!k, feet: k?.feet ?? null,
      takeoffT: k?.t ?? null, apexT: k ? apexT : null, releaseT: this.rel?.t ?? null,
    };
    this.state = 'done';
    this.doneAt = this.rel?.t ?? this.landT ?? k?.t ?? 0;
    return v;
  }
}

// ── the cards ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The 3PT: the shot's own events, and the card the READY screen shows. */
export const THREE_BODY: ModeBodySpec = {
  claims: ['takeoff', 'apex', 'land', 'release'],
  lines: [
    { move: 'Dip and jump', verb: 'SHOOT' },
    { move: 'Release at the top', verb: 'RELEASE' },
  ],
};

/**
 * The space a shot needs is the check's own arms-overhead headroom (lib/move/spaceCheck HEADROOM_JUMP_M: the arms
 * straight overhead with room above the hands for a 0.5 m jump). A jump shot's set point and release are BELOW the
 * straight-arm reach (the elbow is bent), and the recorded jump shots rise 0.11–0.37 m: so every game that shoots
 * passes through the same check before its READY offers the body — no hoops-only rule. Pinned by hoopsBody.test.
 */
export const SHOT_SPACE = { armsOverhead: true, jumpM: 0.5 } as const;
