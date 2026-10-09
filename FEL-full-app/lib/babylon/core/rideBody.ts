// rideBody — what a board or race mode reads off the body itself (movement play P8, 2026-09-26).
//
// The floor (lib/input/bodyFloor) presses what a row binds: the carve, the crouch, the hop, the wheel, the wings, the run.
// The verbs that mean something only in a phase of the GAME live here instead, for the mode to poll with its own state:
//   the grab       a hand at the board's edge (the ride read's grab) while the game's rider is in the air — held while the
//                  hand stays down, banked when it comes up or the rider lands. The hand and the edge name the grab from
//                  each discipline's own table (grabTrickFor, lib/babylon/core/rideTricks);
//   the spin       a real quarter-turn of the shoulders (the ride read's quarter) while the rider is in the air — the game
//                  throws the biggest spin in that direction the air left can finish (spinTrickFor, rideTricks), and its own caught-
//                  spin code finishes it (owner: "spins start with a real quarter-turn and the game finishes them");
//   the push       a kick-push with the back foot: that foot's step with the lead foot planted, on the ground (skate);
//   the dip        the chest dipped forward at the tape (sprint);
//   the stride     a step graded on the CAPTURE clock against a body's cadence, not a thumb's (sprint, big air): a body
//                  jogging in place at 2.7–3.1 steps/s graded against the pad's 200 ms target covered ~1 m in 12 s of the
//                  real SprintCore (PLAN-P8 §1.4, measured) — every stride "off". A missed detection is never a stumble.
// RideIntents knows nothing of any mode: the mode hands it `{ airborne, onFace, … }` and gets intents back. Each intent is
// edge-detected here (a quarter by its seq), so a mode that polls every frame never takes one twice.
// Pure: no DOM, no Babylon.
import type { BodyView } from './ModeHarness';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { STEP_SWING_M, type RideRead } from '@/lib/pose/rideReader';
import type { CadenceQuality } from '@/lib/feel';
import type { CardLine } from './sessionStore';
import { cardLines, resolveBodyProfile, type BodyClaim } from '@/lib/input/bodyProfiles';
import { RIDE_MODE_LINES } from '@/lib/input/rideProfiles';

// ── the numbers (PLAN-P8 §3–§6; [est.] where the plan says so, measured in rideBody.gate.test) ───────────────────────

/** A quarter read this long (ms, capture clock) BEFORE the game's rider left the ground still starts the spin: the body's
 *  turn and hop come together, and the hop reaches the mode +144 ms median, +351 p90 (SEAM.md). It is also a quarter's
 *  shelf life: one older than this when it reaches the mode is old news (review fix, 2026-09-26 — the reader keeps its last
 *  quarter until the body goes, and a fresh RideIntents took a 20 s old one as new: a CUTBACK on surf's first frame of play,
 *  after the turn into the stance at READY), and surf's face waits it out before a quarter is the cutback (below). */
export const SPIN_EARLY_MS = 350;
/** A kick-push: the back foot's step with the lead foot planted at least this long (ms). */
export const PUSH_LEAD_PLANTED_MS = 400;
/** One push per this long (ms): its second told step is the foot back on the board. */
export const PUSH_REFRACTORY_MS = 1000;
/** The dip: the chest this far forward (deg) for DIP_HOLD_MS; re-armed under DIP_REARM_DEG. */
export const DIP_DEG = 20;
export const DIP_HOLD_MS = 100;
export const DIP_REARM_DEG = 10;
/** A body step is graded on the body's own scale (PLAN-P8 §4): perfect at ≥ PERFECT_HZ steps/s and within STEADY of the
 *  last interval, good at ≥ GOOD_HZ, else off. Owner call 4's default: the jog finishes, the sprint wins. */
export const BODY_PERFECT_HZ = 3.4;
export const BODY_GOOD_HZ = 2.6;
export const BODY_STEADY = 0.2;
/** The same foot twice within this share of the running period is a real double step (a stumble); later, a missed one. */
export const BODY_FAULT_SHARE = 0.8;
/** A step counts only when its foot left the floor inside this long (ms) before it (the floor's calf-raise rule). */
export const BODY_STEP_SWING_MS = 1000;
/** The body coyote (skate, snow): a body's hop reaching the mode up to this long (ms) after the wheels left a lip is still
 *  the pop (PLAN-P8 §6: the hop arrives +144 median, +351 p90; the pad's own window stays 110 ms). */
export const BODY_COYOTE_MS = 300;

// ── the card ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A P8 mode's card lines (its ModeBodySpec.lines): what the floor presses for it — its table row minus its claims, so a
 * row that falls back to its P3 cut line shows that row's words — then the verbs the mode reads itself (RIDE_MODE_LINES:
 * GRAB, SPIN, PUSH, CUTBACK, RUN-UP, STRIDE, DIP). Big air and sprint claim the step, so their floor says nothing.
 */
export function rideLines(modeId: string, claims: readonly BodyClaim[] = []): CardLine[] {
  return [...cardLines(resolveBodyProfile({ modeId, body: { claims } })), ...(RIDE_MODE_LINES[modeId] ?? [])];
}

// ── the grab's hand and edge ──────────────────────────────────────────────────────────────────────────────────────
// (the names they make in each board discipline's table are lib/babylon/core/rideTricks: this module stays free of the
// board vocabulary, so a mode that only runs — sprint — carries none of the boards' clips, clipScope.test)

export type RideHand = 'lead' | 'rear';
export type RideEdge = 'toe' | 'heel' | null;

// ── the intents ──────────────────────────────────────────────────────────────────────────────────────────────────

/** What the mode says about its own game this frame. */
export interface RideGameState {
  /** The game's rider is in the air (a pop, a lip, a kicker). */
  airborne: boolean;
  /** Surf: the rider is on the wave's face (a quarter there is the cutback — once SPIN_EARLY_MS has passed with no take-off). */
  onFace?: boolean;
}
export type RideIntent =
  | { kind: 'grab'; hand: RideHand; edge: RideEdge; wrist: 'L' | 'R' }
  | { kind: 'grabEnd' }
  | { kind: 'spin'; dir: 'fs' | 'bs'; side: 'L' | 'R'; where: 'air' | 'face' }
  | { kind: 'dip' };

/** The ride read of a body view (null: no body source, or a stepper that passed no frame). */
export const rideOf = (v: BodyView | null | undefined): RideRead | null => v?.channels.ride ?? null;

/**
 * Whose x an L stick event carries, as the mode receives it (review fix, 2026-09-26): the bus's per-axis answer (InputBus
 * .bodyOwnsLx — the arbiter composes a thumb's y with the body's x UNTAGGED, and a body's y change with a thumb's x tagged,
 * so `e.src === 'body'` said the wrong thing for both); a bus without it (a test's stand-in): the event's own tag.
 */
export function stickXFromBody(input: { bodyOwnsLx?: () => boolean } | null | undefined, e: { src?: string }): boolean {
  return typeof input?.bodyOwnsLx === 'function' ? input.bodyOwnsLx() : e.src === 'body';
}

export class RideIntents {
  private seq = 0;
  private grabbing = false;
  private lastHand: RideRead['grab'] = null;
  /** A quarter waiting for the game's air (`air`: the body was in a jump for it, so it is never the face's cutback). */
  private pendingSpin: { dir: 'fs' | 'bs'; side: 'L' | 'R'; t: number; air: boolean } | null = null;
  private dipFrom: number | null = null;
  private dipArmed = true;

  /** One frame: the body's latest view and the game's state → what the body asked for, once each. */
  poll(view: BodyView | null | undefined, g: RideGameState): RideIntent[] {
    const out: RideIntent[] = [];
    const r = rideOf(view);
    const t = view?.read.t ?? -Infinity;
    // a frame the reader could not read (a missed detection, a blink) is no news: the hand held down stays held
    const unread = !!view && !view.read.tracking;
    // the grab: a hand at the edge while the rider flies (a hand already down at the take-off grabs from the take-off)
    const hand = unread ? (this.grabbing ? this.lastHand : null) : r?.grab ?? null;
    if (hand) this.lastHand = hand;
    const want = !!hand && g.airborne;
    if (want && !this.grabbing) { this.grabbing = true; out.push({ kind: 'grab', hand: hand!.hand, edge: hand!.edge, wrist: hand!.wrist }); }
    else if (!want && this.grabbing) { this.grabbing = false; out.push({ kind: 'grabEnd' }); }
    // the spin: a NEW quarter, in the air; one read just before the game's take-off waits SPIN_EARLY_MS for it; one on the
    // ground is spent there — or, on surf's face, is the CUTBACK once that wait is over with the rider still on the face.
    // (Review fix, 2026-09-26: the face paid a pending quarter at once, and real riders start the turn with the hop — the
    // quarter reached the mode −90 to 0 ms from the hop's A on 5 of 6 real hop turns — so 46 of 96 replayed cells paid the
    // air's spin as a cutback on the face, 83_58's 270° and 83_61's 360° in 16 / 16. A quarter read in a body jump is the
    // air's: if the game never leaves the ground for it, it is nothing, never a cutback.)
    const q = r?.turn.quarter ?? null;
    if (q && q.seq !== this.seq) {
      this.seq = q.seq;
      // (older than SPIN_EARLY_MS on arrival: old news, in every game state)
      this.pendingSpin = t - q.t > SPIN_EARLY_MS ? null : { dir: q.dir, side: q.side, t: q.t, air: !!view?.channels.inJump };
    }
    if (this.pendingSpin) {
      const p = this.pendingSpin;
      if (view?.channels.inJump) p.air = true;
      if (g.airborne) { out.push({ kind: 'spin', dir: p.dir, side: p.side, where: 'air' }); this.pendingSpin = null; }
      else if (t - p.t > SPIN_EARLY_MS) {
        if (g.onFace && !p.air) out.push({ kind: 'spin', dir: p.dir, side: p.side, where: 'face' });
        this.pendingSpin = null;
      }
    }
    // the dip: the chest forward WHILE RUNNING, on the ground (a stretch's forward fold, a tucked hop's, is not one)
    const fwd = r?.trunkFwdDeg ?? null;
    if (fwd !== null && fwd >= DIP_DEG && !!r?.running && !view?.channels.inJump) {
      this.dipFrom ??= t;
      if (this.dipArmed && t - this.dipFrom >= DIP_HOLD_MS) { this.dipArmed = false; out.push({ kind: 'dip' }); }
    } else {
      this.dipFrom = null;
      if (fwd === null || fwd < DIP_REARM_DEG) this.dipArmed = true;
    }
    return out;
  }

  /** A grab in progress (the mode banks it on grabEnd, or on its own landing). */
  get grabHeld(): boolean { return this.grabbing; }

  reset(): void { this.seq = 0; this.grabbing = false; this.lastHand = null; this.pendingSpin = null; this.dipFrom = null; this.dipArmed = true; }

  /** Forget a quarter already read (a mode that starts listening mid-stream: skate, snow, surf and big air call it on their
   *  first frame of play, so a turn made at READY — into the stance — is never a spin or a cutback). */
  sync(view: BodyView | null | undefined): void { this.seq = rideOf(view)?.turn.quarter?.seq ?? this.seq; this.pendingSpin = null; }
}

/**
 * Kick-pushes, one per push (skate): the first real step of the back foot after PUSH_REFRACTORY_MS — a push steps the foot
 * down to the ground and back onto the board (two told steps ~0.55–0.65 s apart on the scripted push), and the second is the
 * return, not another push.
 */
export class KickPush {
  private lastAt = -Infinity;
  take(ev: Extract<BodyEvent, { kind: 'step' }>, view: BodyView): boolean {
    if (!isKickPush(ev, view)) return false;
    if (ev.t - this.lastAt < PUSH_REFRACTORY_MS) return false;
    this.lastAt = ev.t;
    return true;
  }
  reset(): void { this.lastAt = -Infinity; }
}

/**
 * A kick-push step (skate): a step of the BACK foot while the lead foot has been planted PUSH_LEAD_PLANTED_MS, from a side-on
 * stance, not in a jump, the foot really swung. Running in place lifts both feet in turn and is never a push; a hop is the
 * jump's. (KickPush takes one per push.)
 */
export function isKickPush(ev: Extract<BodyEvent, { kind: 'step' }>, view: BodyView): boolean {
  const r = rideOf(view);
  const lead = r?.stance?.kind === 'side' ? r.stance.lead : null;
  if (!r || !lead || view.channels.inJump) return false;
  const rear = lead === 'L' ? 'R' : 'L';
  return ev.foot === rear && ev.t - r.lift[lead] >= PUSH_LEAD_PLANTED_MS && ev.t - r.lift[rear] <= BODY_STEP_SWING_MS && r.swing[rear] >= STEP_SWING_M;
}

// ── the body's stride ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Body strides graded on the capture clock (PLAN-P8 §4). Each step must have lifted its foot (BODY_STEP_SWING_MS, the
 * calf-raise rule, one lift per stride) and not be in a jump. Alternating: perfect at ≥ BODY_PERFECT_HZ and steady, good at
 * ≥ BODY_GOOD_HZ, else off. The same foot twice is a stumble only inside BODY_FAULT_SHARE of the running period (a real
 * double step); later it is a missed detection — graded off, never a fault.
 */
export class BodyStride {
  private last: { t: number; foot: 'L' | 'R' } | null = null;
  private prevInterval: number | null = null;
  private period: number | null = null;
  private usedLift: { L: number; R: number } = { L: -Infinity, R: -Infinity };

  /** A told step → its grade, or null when it is not a stride (no lift behind it, in a jump). */
  grade(ev: Extract<BodyEvent, { kind: 'step' }>, view: BodyView): CadenceQuality | null {
    const r = rideOf(view);
    if (view.channels.inJump) return null;
    const lift = r?.lift[ev.foot] ?? -Infinity;
    // a real swing (the P2 reader tells jittered "steps" of a still stand at 1.5× noise, peaking under 5 cm)
    if (!(ev.t - lift <= BODY_STEP_SWING_MS) || lift <= this.usedLift[ev.foot] || (r?.swing[ev.foot] ?? 0) < STEP_SWING_M) return null;
    this.usedLift[ev.foot] = lift;
    return this.gradeAt(ev.t, ev.foot);
  }

  /** The grading alone, on capture instants (the gate drives it with scripted steps). */
  gradeAt(t: number, foot: 'L' | 'R'): CadenceQuality {
    const last = this.last;
    this.last = { t, foot };
    if (!last) return 'first';
    const interval = t - last.t;
    if (interval <= 0) return 'off';
    if (foot === last.foot) {
      // a real double step, or a step of the other foot the reader never told
      if (this.period !== null && interval < BODY_FAULT_SHARE * this.period) return 'fault';
      return 'off';
    }
    const steady = this.prevInterval !== null && Math.abs(interval - this.prevInterval) <= BODY_STEADY * this.prevInterval;
    // the rate over the whole stride (this step and the one before it): at 15 fps one interval is quantised ±67 ms, and a
    // 3.1 steps/s jog's 322 ms reads anywhere from 2.5 to 3.75
    const rateMs = this.prevInterval !== null ? (interval + this.prevInterval) / 2 : interval;
    this.prevInterval = interval;
    this.period = this.period === null ? interval : this.period + (interval - this.period) * 0.3;
    const hz = 1000 / rateMs;
    if (hz >= BODY_PERFECT_HZ && steady) return 'perfect';
    if (hz >= BODY_GOOD_HZ) return 'good';
    return 'off';
  }

  reset(): void { this.last = null; this.prevInterval = null; this.period = null; this.usedLift = { L: -Infinity, R: -Infinity }; }
}

/**
 * How long ago (ms) the body did what this event says, as the page sees it now — the latency a graded verb makes up for:
 * the time since the packet arrived, the camera's own lag, and the told-late part (the frame that told it vs the instant).
 */
export function bodyElapsedMs(ev: { t: number }, view: BodyView, now: number): number {
  return (now - view.arrivedAt) + view.lagMs + (view.read.t - ev.t);
}
