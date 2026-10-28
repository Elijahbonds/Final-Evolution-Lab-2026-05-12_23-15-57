// RestDribble — THE DRIBBLE AT REST (lane/h3-handler, owner 2026-10-24: port the still-missing half of PR #312, "H3b"; the owner's
// words when #312 was written, 2026-10-16: "idle dribbling felt off" — stiff and robotic, the bounce rhythm wrong, the ball and the hand
// don't meet, not reading the defense). #312 is ~90 commits stale; this is a re-implementation on the release, its logic kept out of the
// shared hoops files (the tree, the carry and the modes carry one-line hooks).
//
// Three things live here, each with its own 0/1 feel knob (group "Hoops · handle (rest)") so the owner can A/B it on the phone:
//   1. THE PROTECT PLAYS A DRIBBLE (`hoops.protectDribbleOn`). The tree's protect state played `bball_defend_stance` — the DEFENDER's
//      stance, with no ball arm — so a handler at rest under pressure spent his time in a stance whose arm the carry's reach dragged after
//      a ball it never bounced. It plays the idle dribble loop now (and its left twin), the shield drawn on the body over it (HoopsLook's
//      turn, the guard below, ProtectSink's sink).
//   2. THE BOUNCE KEEPS THE CLIP'S TIME (`hoops.restBounceOn`). At rest the dribble loop plays quicker than its capture (REST_TEMPO_*:
//      CMU 06_12 bounces once in 0.77 s, 1.3 Hz — a lazy bounce) and the carry's bounce LOCKS to the tops of the clip's own ball hand
//      (ClipHandClock, read before the carry reaches for anything) the way the stride lock ties it to a foot at a run. Before, the bounce
//      ran on its own clock (HOOPS_DRIBBLE.hzIdle) over the clip and drifted through the clip's hand and back every few bounces.
//   3. THE GUARD (`hoops.protectGuardOn`). In the protect the bounce goes back beside the hip (GUARD_BACK_M) and a touch wider
//      (GUARD_OUT_M), the palm drops with the sink (GUARD_DROP_M), and the off forearm comes across the front as a bar (GUARD_BAR_*).
//      WHICH HAND the ball is in is not this file's: that is #399's GuardHand (the outside hand when guarded), unchanged.
//
// Visual only: nothing here reads or writes a speed, a steal, a strip, an odds number or a timing window. Pure: no Babylon import.
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.protectDribbleOn … hoops.guardBarZM (lib/feel-panel/knobs.ts)

// ── 1 · the protect's clip ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** 1 = the protect plays the idle dribble loop (#312); 0 = the defender's stance, exactly as before. Knob `hoops.protectDribbleOn`. */
export const PROTECT_DRIBBLE_ON = 1;
/** The protect's clip now: the idle dribble loop (on) or the stance it always played (off). The tree passes both names (this file names
 *  no clip: the carry imports it, and the dunk runway's clip scope has no dribble loop — clipScope.test). */
export function protectClip(dribbleClip: string, stanceClip: string): string {
  return feel('hoops.protectDribbleOn', PROTECT_DRIBBLE_ON) >= 0.5 ? dribbleClip : stanceClip;
}
/** Does the protect dribble now (it then has a `_left` twin like every dribble loop)? */
export const protectDribbles = (): boolean => feel('hoops.protectDribbleOn', PROTECT_DRIBBLE_ON) >= 0.5;

// ── 2 · the bounce at rest ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** 1 = the rest tempo and the clip lock (#312); 0 = the loop at its capture's pace and the bounce on its own clock. Knob `hoops.restBounceOn`. */
export const REST_BOUNCE_ON = 1;
/** The idle dribble loop's pace at rest (× its capture; 1.3 Hz → 1.56 Hz). TUNED (new, #312). Knob `hoops.restTempoIdle`. */
export const REST_TEMPO_IDLE = 1.2;
/** …and in the protect, low and hard (→ 1.88 Hz). TUNED (new, #312). Knob `hoops.restTempoProtect`. */
export const REST_TEMPO_PROTECT = 1.45;
/** The clip lock's pull (the stride lock's own gain). TUNED (new, #312). Knob `hoops.clipLockGain`. */
export const CLIP_LOCK_GAIN = 3;
/** The fastest the locked bounce may run (Hz). TUNED (new, #312). Knob `hoops.clipLockHzMax`. */
export const CLIP_LOCK_HZ_MAX = 2.6;
/** The clip lock runs under this much root speed (m/s): at rest. TUNED (new, #312). Knob `hoops.clipLockMaxMps`. */
export const CLIP_LOCK_MAX_MPS = 0.4;
/** The bounce's phase at the clip hand's top: the ball at the palm (structural, not a feel number). */
export const CLIP_PHI_AT_PEAK = 0;
/** A hand top counts past this much rise since the last low (m): the detector's noise floor, not a feel number. */
export const CLIP_PEAK_MIN_M = 0.03;

export const restBounceOn = (): boolean => feel('hoops.restBounceOn', REST_BOUNCE_ON) >= 0.5;
/** The tree's pace for a loop state at rest (× the capture), or null (the state has none: the stride rate, or 1). */
export function restTempoFor(state: string): number | null {
  if (!restBounceOn()) return null;
  if (state === 'idle_dribble') return feel('hoops.restTempoIdle', REST_TEMPO_IDLE);
  if (state === 'protect' && protectDribbles()) return feel('hoops.restTempoProtect', REST_TEMPO_PROTECT);   // (the stance keeps its pace)
  return null;
}
export interface ClipLockTune { gain: number; hzMax: number; maxMps: number }
/** The clip lock's numbers now, or null when the feature is off. */
export function clipLockTune(): ClipLockTune | null {
  if (!restBounceOn()) return null;
  return { gain: feel('hoops.clipLockGain', CLIP_LOCK_GAIN), hzMax: feel('hoops.clipLockHzMax', CLIP_LOCK_HZ_MAX), maxMps: feel('hoops.clipLockMaxMps', CLIP_LOCK_MAX_MPS) };
}

/**
 * The clip's ball-hand clock: the tops of the hand's height as the CLIP posed it (read before the carry's reach), the period between
 * them, and when the last one was. `sample` takes one frame; `y` null = no clip read this frame (the hand is where the carry drew it
 * last frame with its reach on — a clip that does not key the arm; read as the clip's, the clock would lock to its own reach: #312's
 * gate fix). `key` names the hand being read (null = not at rest): a new key starts over.
 */
export class ClipHandClock {
  private y1 = Number.NaN; private y2 = Number.NaN; private low = Number.POSITIVE_INFINITY;
  private topAt = Number.NEGATIVE_INFINITY; private period = 0.77; private tops = 0; private key: string | null = null;
  /** Tops counted on this hand (for probes and tests). */
  get count(): number { return this.tops; }
  get periodSec(): number { return this.period; }
  sample(key: string | null, y: number | null, clock: number, dt: number): void {
    if (key === null || key !== this.key) { this.y1 = this.y2 = Number.NaN; this.low = Number.POSITIVE_INFINITY; this.tops = 0; this.key = key; }
    if (key === null || y === null) return;
    if (this.y1 > this.y2 && this.y1 >= y && this.y1 - this.low > CLIP_PEAK_MIN_M) {   // last frame was a top
      const at = clock - dt, gap = at - this.topAt;
      if (gap > 0.3 && gap < 1.5) this.period += (gap - this.period) * 0.5;
      if (gap > 0.25) { this.topAt = at; this.tops++; this.low = this.y1; }
    }
    this.low = Math.min(this.low, y); this.y2 = this.y1; this.y1 = y;
  }
  /** The locked bounce rate (Hz) for the carry's `phase` now, or 0 (no lock: under two tops, or the last top too long ago). `lockHz` is
   *  the stride lock's (Dribble.strideLockHz), passed in so this file stays pure of the carry. */
  hz(phase: number, clock: number, t: ClipLockTune, lockHz: (phase: number, since: number, period: number, phi: number, gain: number, hzMax: number) => number): number {
    if (this.key === null || this.tops < 2 || !(clock - this.topAt < 2 * this.period)) return 0;
    return lockHz(phase, clock - this.topAt, this.period, CLIP_PHI_AT_PEAK, t.gain, t.hzMax);
  }
}

// ── 3 · the guard ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** 1 = the protect's guard (#312); 0 = the bounce and the off arm as before. Knob `hoops.protectGuardOn`. */
export const PROTECT_GUARD_ON = 1;
/** The bounce moves this far BACK, beside-behind the hip (m; it bounced 0.16 m ahead of the hip, into him). TUNED (new, #312). */
export const GUARD_BACK_M = 0.22;
/** …and this much wider (m). TUNED (new, #312). */
export const GUARD_OUT_M = 0.06;
/** The palm drops this much with the protect's sink (m). TUNED (new, #312). */
export const GUARD_DROP_M = 0.06;
/** The guard eases in and out over this long (s). TUNED (new, #312). */
export const GUARD_SEC = 0.15;
/** The off hand's bar, root-local (m): across toward the ball side (× the side sign), up, forward — the forearm across the front, ahead
 *  of the ball's hip. TUNED (new, #312). */
export const GUARD_BAR_X_M = 0.15;
export const GUARD_BAR_Y_M = 1.06;
export const GUARD_BAR_Z_M = 0.34;
/** The bar's elbow points out toward the off side (a solver direction, root-local; not a feel number). */
export const GUARD_BAR_POLE: readonly [number, number, number] = [-0.7, -0.15, 0.3];

export interface GuardTune { on: boolean; backM: number; outM: number; dropM: number; sec: number; bar: [number, number, number] }
const _guard: GuardTune = { on: true, backM: 0, outM: 0, dropM: 0, sec: GUARD_SEC, bar: [0, 0, 0] };
/** The guard's numbers now (a kept object: no garbage per frame). `on` false: the feature is off (the guard eases out on these numbers). */
export function guardTune(): GuardTune {
  _guard.on = feel('hoops.protectGuardOn', PROTECT_GUARD_ON) >= 0.5;
  _guard.backM = feel('hoops.guardBackM', GUARD_BACK_M); _guard.outM = feel('hoops.guardOutM', GUARD_OUT_M);
  _guard.dropM = feel('hoops.guardDropM', GUARD_DROP_M); _guard.sec = Math.max(1e-3, feel('hoops.guardSec', GUARD_SEC));
  _guard.bar[0] = feel('hoops.guardBarXM', GUARD_BAR_X_M); _guard.bar[1] = feel('hoops.guardBarYM', GUARD_BAR_Y_M); _guard.bar[2] = feel('hoops.guardBarZM', GUARD_BAR_Z_M);
  return _guard;
}
/** The guard's weight one frame on (pure): toward `target` (0..1) at rest, toward 0 on the move (speed01 over 0.15), over `sec`. */
export function stepGuardK(k: number, target: number, speed01: number, dt: number, sec: number): number {
  const want = speed01 <= 0.15 ? Math.min(1, Math.max(0, target)) : 0;
  return k + (want - k) * Math.min(1, Math.max(0, dt) / Math.max(1e-3, sec));
}
