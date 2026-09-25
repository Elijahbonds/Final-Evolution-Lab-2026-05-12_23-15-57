// bodyChannels — the few body facts that need history (movement play P3, 2026-09-24).
//
//   BodyReader ──(read, events)──▶ ChannelReader ──▶ BodyChannels { inJump, stride, handsUpMs, handsDownMs }
//
// A BodyRead is one frame, and most of what a game wants from it is already there with no memory at all: the lean
// (lean.sideSw, trunkFwdDeg), the crouch (squat), the turn (yaw.deg). Those stay on the read. This file holds only the
// four things a single frame cannot say:
//   inJump      — is this body in a jump (or just landing from one)? The take-off is told late (a small hop only
//                 once it has flown MIN_FLIGHT_MS), so an airborne read starts it early; a landing is told after its
//                 touch-down, and the absorb after it (dips at land +53 / +115 ms on the fixtures) is not a crouch.
//                 A floor that knows this never lets a jump move the stick or pull a trigger (P3 bugs 1 and 2).
//   stride      — running in place, as a drive that holds between steps and dies soon after the last one.
//   handsUpMs   — both hands held overhead, on the ground: the body's START. A jump's arms are never it: every
//                 overhead span over 32 ms measured during a jump had airborne frames in it.
//   handsDownMs — both hands back down: what lets go of the START latch, so the START pose presses nothing.
//
// The clock is read.t, the capture clock, everywhere: the same clock the events' t and seen are on.
// Pure: no DOM, no camera. Deterministic.
import type { BodyRead, BodyEvent } from './BodyReader';
import { CADENCE_STEPS, CADENCE_WINDOW_MS, LAND_SETTLE_MS, MAX_FLIGHT_MS } from './BodyReader';

export const ABSORB_MS = 250;          // landing absorb: dips at land +53/+115 ms (fixtures) are not crouches
export const STRIDE_MIN_HZ = 1.2;
export const STRIDE_FULL_HZ = 3.2;     // run_in_place reads 2.68 Hz (true 3.11)
export const STRIDE_ZERO_MS = 700;     // drive is exactly 0 this long after the last step
export const OVERHEAD_GAP_MS = 120;    // a 1.2 s scripted hold reads 632 + 701 ms with one flicker gap
export const JUMP_GUARD_MS = 400;      // a takeoff/land told within this before or during a hold resets it
/** The stride drive is held at least this long after a step (ms)… */
export const STRIDE_HOLD_MS = 500;
/** …or this many of its own step periods, whichever is longer: a slow jog's gap between steps is not a stop. */
export const STRIDE_HOLD_STEPS = 1.5;
/** …then fades to 0 over this (ms), never past STRIDE_ZERO_MS. */
export const STRIDE_FADE_MS = 200;
/**
 * A take-off the reader never landed: past its longest flight plus the landing's settle (ms), the reader has either
 * told the landing or dropped the flight (a body found on the floor, a flight longer than any jump). Given up then.
 */
export const FLIGHT_GIVE_UP_MS = MAX_FLIGHT_MS + LAND_SETTLE_MS;

export interface BodyChannels {
  /** A TOLD jump: from its take-off event until land + ABSORB_MS (held through a flight lost at the top of the frame;
   *  one the reader drops unlanded ends ABSORB_MS after the drop). An UNTOLD float: an airborne read with no take-off
   *  told yet is in a jump too, but only until the first grounded read, with NO absorb after it — a jog's double-float
   *  is never told, and an absorb after it would eat the next step. So a small hop the reader never tells (flight
   *  under MIN_FLIGHT_MS and v0 under JUMP_V0_SURE) gets no absorb either: its landing dip is the floor's to judge. */
  inJump: boolean;
  /** Running in place. drive = ramp(hz, MIN, FULL), held max(500 ms, 1.5/hz) after the last step, faded to 0 over 200 ms,
   *  and 0 at STRIDE_ZERO_MS. Held (not faded) while inJump. null = no cadence yet (fewer than 4 steps in 2.5 s). */
  stride: { hz: number; drive: number } | null;
  /** Continuous both-wrists-overhead hold: airborne === false on every frame, tracking and calibrated, gaps ≤ OVERHEAD_GAP_MS
   *  tolerated, reset by any takeoff/land event told during the hold or within JUMP_GUARD_MS before it. 0 = not holding. */
  handsUpMs: number;
  /** Both wrists continuously below the head line (for the post-START latch). */
  handsDownMs: number;
}

const ramp = (v: number, lo: number, hi: number): number => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

export class ChannelReader {
  // ── the jump ──
  /** 'maybe': an airborne read with no take-off told yet (a small hop is told only MIN_FLIGHT_MS in, and a jog's
   *  82–123 ms double-float never is); 'sure': a take-off told and not yet landed. */
  private air: 'none' | 'maybe' | 'sure' = 'none';
  private offT = -Infinity;
  private absorbUntil = -Infinity;
  private wasInJump = false;
  /** A told flight came back from a loss (a 'found') and no frame since has read the feet: the reader's `resumed`. */
  private resumePending = false;
  // ── the stride ──
  /** Step instants (capture clock), oldest first: at most the cadence's CADENCE_STEPS + 1 inside CADENCE_WINDOW_MS. */
  private steps: number[] = [];
  private hz: number | null = null;
  /** Time since the last step (ms), counted on the ground only: a jump holds the stride where it was. */
  private since = Infinity;
  private lastT: number | null = null;
  // ── the hands ──
  private upFrom: number | null = null;
  private upLast = -Infinity;
  private downFrom: number | null = null;
  private jumpToldAt = -Infinity;

  step(read: BodyRead, events: readonly BodyEvent[]): BodyChannels {
    const t = read.t;
    // the time since the last frame belongs to the state that frame left: none of it counts against the stride in a jump
    if (this.lastT !== null && !this.wasInJump) this.since += Math.max(0, t - this.lastT);
    this.lastT = t;

    let lost = false, found = false, jumpTold = false;
    for (const ev of events) {
      switch (ev.kind) {
        case 'takeoff': this.air = 'sure'; this.offT = ev.t; this.absorbUntil = -Infinity; this.resumePending = false; jumpTold = true; break;
        case 'land': this.air = 'none'; this.absorbUntil = Math.max(this.absorbUntil, ev.t + ABSORB_MS); this.resumePending = false; jumpTold = true; break;
        case 'step': this.addStep(ev.t, t); break;
        case 'lost': lost = true; break;
        case 'found': found = true; break;
        default: break;
      }
    }

    // ── the jump ──
    if (this.air === 'sure') {
      // A flight held through a loss, as the reader treats it (BodyReader.read / feetAndFlight), none of it told:
      //   • found past MAX_FLIGHT_MS: dropped there and then (resetMotion);
      //   • otherwise `resumed`: on the first later frame whose FEET are read (airborne !== null), a foot already down
      //     means it came down unseen, and the flight is dropped with no landing made up; both feet up flies on.
      // REVIEW (2026-09-24): this looked only at the found frame itself, so a body found with its feet unread (airborne
      // null) and grounded a frame later held inJump to the give-up — up to ~1.45 s of sticks held and presses eaten.
      if (found) this.resumePending = true;
      let drop = found && t - this.offT > MAX_FLIGHT_MS;
      if (this.resumePending && read.present && read.airborne !== null) {
        this.resumePending = false;
        drop ||= read.airborne === false;
      }
      // and one that outlived any jump is landed or dropped by now
      if (drop || t - this.offT > FLIGHT_GIVE_UP_MS) {
        this.air = 'none'; this.resumePending = false;
        this.absorbUntil = Math.max(this.absorbUntil, t + ABSORB_MS);
      }
    } else if (this.air === 'maybe') {
      // no take-off before the feet came back: a float or a stride, not a jump (and no absorb: the next step is real).
      // A loss drops it too (the reader forgets an unconfirmed flight when it loses the body).
      if (lost || (read.present && read.airborne === false)) this.air = 'none';
    }
    if (this.air === 'none' && read.present && read.airborne === true) this.air = 'maybe';
    const inJump = this.air !== 'none' || t < this.absorbUntil;
    this.wasInJump = inJump;

    // ── the stride ──
    // a body lost on the ground is a body whose steps the reader forgot (resetMotion); one lost in the air is held
    if (lost && this.air !== 'sure') { this.steps = []; this.hz = null; this.since = Infinity; }

    // ── the hands ──
    if (jumpTold) this.jumpToldAt = t;
    const w = read.wrist;
    const upNow = read.tracking && read.calibrated && read.airborne === false && !!w && w.L.overhead && w.R.overhead;
    // the gap is the time since the last overhead frame, whether the frames between said "not overhead" (a flicker)
    // or never came at all (a stalled camera)
    const gapOk = t - this.upLast <= OVERHEAD_GAP_MS;
    if (read.airborne === true || t - this.jumpToldAt < JUMP_GUARD_MS) this.upFrom = null;
    else if (upNow) { if (this.upFrom === null || !gapOk) this.upFrom = t; this.upLast = t; }
    else if (!gapOk) this.upFrom = null;
    const downNow = read.present && !!w && !w.L.overhead && !w.R.overhead;
    if (!downNow) this.downFrom = null;
    else if (this.downFrom === null) this.downFrom = t;

    return {
      inJump,
      stride: this.stride(),
      // a gap frame holds the hold where its last overhead frame left it: the ring never runs ahead of the arms
      handsUpMs: this.upFrom === null ? 0 : this.upLast - this.upFrom,
      handsDownMs: this.downFrom === null ? 0 : t - this.downFrom,
    };
  }

  reset(): void {
    this.air = 'none'; this.offT = -Infinity; this.absorbUntil = -Infinity; this.wasInJump = false; this.resumePending = false;
    this.steps = []; this.hz = null; this.since = Infinity; this.lastT = null;
    this.upFrom = null; this.upLast = -Infinity; this.downFrom = null; this.jumpToldAt = -Infinity;
  }

  private addStep(at: number, now: number): void {
    let i = this.steps.length;
    while (i > 0 && this.steps[i - 1] > at) i--;
    this.steps.splice(i, 0, at);
    const last = this.steps[this.steps.length - 1];
    this.steps = this.steps.filter((s) => last - s <= CADENCE_WINDOW_MS).slice(-(CADENCE_STEPS + 1));
    const span = last - this.steps[0];
    this.hz = this.steps.length >= CADENCE_STEPS && span > 0 ? ((this.steps.length - 1) * 1000) / span : null;
    this.since = Math.max(0, now - last);
  }

  private stride(): BodyChannels['stride'] {
    const hz = this.hz;
    if (hz === null || this.since > CADENCE_WINDOW_MS) return null;
    const hold = Math.max(STRIDE_HOLD_MS, (STRIDE_HOLD_STEPS * 1000) / hz);
    const from = Math.min(hold, STRIDE_ZERO_MS), to = Math.min(hold + STRIDE_FADE_MS, STRIDE_ZERO_MS);
    const s = this.since;
    const k = s >= STRIDE_ZERO_MS ? 0 : s <= from ? 1 : to > from ? Math.max(0, (to - s) / (to - from)) : 0;
    return { hz, drive: ramp(hz, STRIDE_MIN_HZ, STRIDE_FULL_HZ) * k };
  }
}
