// BodyFloor — one mode's body profile turned into ordinary FelInput (movement play P3, 2026-09-24).
//
//   BodyPacket (read + events + channels) ──▶ BodyFloor(profile) ──▶ BodyOut[] (src: 'body') ──▶ the bus's arbiter
//
// The P1 mapper read the hips' HEIGHT as the stick and a hip rise as A, so standing still held the stick at full back
// and every jump pushed it (P3 bugs 1 and 2). This floor cannot do either, by construction:
//   • rest emits NOTHING: every output is a change from the last one sent, starting from an implicit neutral;
//   • hip height is never an input: the stick's x is the lean (sideSw, with hysteresis), its y only the cadence of
//     running in place (channels.stride), and both HOLD their last grounded value through a jump (channels.inJump);
//   • the trigger is the crouch, shaped for the boards (below), and never rises in a jump or its landing absorb;
//   • buttons and the d-pad are PULSES off the reader's own events (a take-off, a step, a punch, a kick): pressed, then
//     released on the first step or tick at least PULSE_MS later. None but the hop in the air; no strike out of a
//     jump's gather (a crouch on the move; a stance held low strikes) or out of both arms coming down from overhead;
//     no step whose foot never left the floor.
// Only what the profile binds is ever written (a session-only profile writes nothing at all, P3 Z3), and nothing before
// the reader is calibrated and tracking.
//
// THE CROUCH (the judges' fix for the pop scaling). SkateRun takes max(pump, pumpReleased) at A (SkateRunMode :131-133,
// :650-662) and the snowboard jumps 0.5 + tuck·0.5 off the RT held at A (SnowboardSlalomMode :258-262), so the dip's
// depth has to still be ON the trigger when the hop's A arrives — and the hop is told late (a small one only
// MIN_FLIGHT_MS into its flight, up to ~267 ms after it left). So RT tracks the squat DOWN into the crouch, then HOLDS
// ITS PEAK while the body extends and leaves, and drops to 0 in one step: right after the hop's A (the same step, the
// A first), or, when no hop comes, once the squat has sat under the dead band for PEAK_HOLD_MS on the floor. After a
// hop it stays 0 until the jump is over (land + ABSORB_MS) and the landing's crouch has been stood out of: a landing's
// absorb is not a pump. After any release (the body lost, the START latch) a crouch likewise counts from a stand.
//
// Clocks: the body's own timings (the absence release, the peak hold) run on read.t, the capture clock; the pulses run
// on `now`, the page's clock (performance.now, the same one PoseService stamps captures with), because a tick has only
// that. Pure: no DOM, no bus.
import type { BodyOut, BodyPacket, FelButton } from '@/lib/babylon/core/InputBus';
import type { BodyBinding, BodyProfile } from './bodyProfiles';

/** The lean engages past LEAN_ON_SW shoulder widths off the calibrated centre and lets go under LEAN_OFF_SW, reaching
 *  full stick at LEAN_FULL_SW (the ramp runs from the OFF line, so the hysteresis never jumps the value). Rest reads
 *  ≤ 0.03 sw, jumps ≤ 0.15, the jump shot 0.29, a sideways shuffle 1.33. */
export const LEAN_ON_SW = 0.35;
export const LEAN_OFF_SW = 0.28;
export const LEAN_FULL_SW = 1.1;
/** The crouch pulls nothing under CROUCH_DEAD squat (a 10 cm duck reads 0.26–0.29) and full trigger at CROUCH_FULL
 *  (a 20 cm duck reads 0.51–0.55, a gather 0.43–1.0). */
export const CROUCH_DEAD = 0.35;
export const CROUCH_FULL = 0.9;
/** The crouch's peak is let go after this long (ms) under the dead band on the floor when no hop took it: it covers
 *  the extension and a take-off told up to 267 ms after the real one. */
export const PEAK_HOLD_MS = 450;
/** After a hop the trigger stays 0 until the landing's crouch has been stood out of: the squat under the dead band on
 *  the floor this long (ms, three frames). */
export const HOP_CLEAR_MS = 100;
/** A step presses the d-pad only when its foot left the floor (the reader's contact line) inside this long (ms) before
 *  it: running in place breaks contact every step (6–19 cm lifts on the fixtures); a calf raise's heels coming down read
 *  as a 2 cm "step" with the foot never off (the gate's scripted calf raise, seed 17), and a sprint would false-start on it. */
export const STEP_SWING_MS = 1000;
/** Not tracking this long (ms, capture clock) releases everything: longer than the fixtures' 1 % missed detections. */
export const FLOOR_RELEASE_MS = 100;
/** A pulse's press → release (ms): two frames at 30 fps. */
export const PULSE_MS = 60;
/** How far back (ms) from a strike's own instant the floor looks at the squat: a punch or a kick is told ~1–3 frames
 *  after it (BodyReader's VEL_HALF_MS look-ahead), so the floor keeps twice this. */
export const STRIKE_LOOKBACK_MS = 300;
/** A crouch that is MOVING: the squat's range over the lookback (from STRIKE_LOOKBACK_MS before the strike to the
 *  frame that told it) at least this. A jump's gather moves 0.36–0.55 there; a fighting stance held 13–25 cm down
 *  (squat 0.33–0.66) moves 0.01–0.06 while it throws (the gate's stance streams, three seeds). */
export const STRIKE_SQUAT_MOVE = 0.15;
/** No strike this soon (ms) after both wrists were overhead: the arms coming down out of a hands-up read as a punch
 *  69–103 ms after they left it (the gate's hands-up hold dropped at once and lowered over 0.5 s), and both hands up
 *  while playing does nothing (owner call 3) — not even a jab on the way down. */
export const OVERHEAD_STRIKE_MS = 300;
/** Every analog value goes out on this grid, so the reader's jitter is not a stream of one-hundredth changes. */
export const QUANTUM = 0.05;

const ramp = (v: number, lo: number, hi: number): number => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
/** On the QUANTUM grid, two decimals exact, and never −0 (a centred axis is 0). */
export function quantise(v: number): number {
  const q = Math.round(v / QUANTUM) * QUANTUM;
  return Math.abs(q) < 1e-9 ? 0 : Math.round(q * 100) / 100;
}

type Dir = 'up' | 'down' | 'left' | 'right';
interface Pulse { release: BodyOut; due: number }

export class BodyFloor {
  // what the profile binds (null / false = unbound)
  private readonly leanX: boolean;
  private readonly cadenceY: boolean;
  private readonly trig: 'L' | 'R' | null;
  private readonly hop: FelButton | null;
  private readonly punch: FelButton | null;
  private readonly kick: FelButton | null;
  private readonly steps: boolean;
  /** What the listeners last got from the floor: neutral until something is sent, and again after a release / begin. */
  private sent = { x: 0, y: 0, t: 0 };
  // the stick's grounded values (held through a jump)
  private gx = 0;
  private gy = 0;
  private leanOn = false;
  // the crouch: the value on the trigger, the time under the dead band on the floor, and STAND FIRST — after a hop's A
  // or a release, no crouch is tracked until the body has stood (HOP_CLEAR_MS under the band, out of any jump)
  private rt = 0;
  private underMs = 0;
  private underT: number | null = null;
  private standFirst = false;
  private clearMs = 0;
  private clearT: number | null = null;
  // presence
  private lastTrackT = -Infinity;
  private wasCalibrated = false;
  private latchSent = false;
  private pulses = new Map<string, Pulse>();
  /** The tracked frames' squat over the last 2 × STRIKE_LOOKBACK_MS: a strike is judged at its own instant, told late. */
  private squats: { t: number; squat: number | null }[] = [];
  /** When each foot was last seen off the floor on the ground (capture ms). */
  private liftAt: Record<'L' | 'R', number> = { L: -Infinity, R: -Infinity };
  /** The last tracked frame with both wrists overhead (capture ms). */
  private bothUpT = -Infinity;

  constructor(profile: BodyProfile) {          // already minus claims
    const b = profile.bindings;
    const has = (from: BodyBinding['from']): boolean => b.some((x) => x.from === from);
    const button = (from: 'takeoff' | 'punch' | 'kick'): FelButton | null => {
      for (const x of b) if (x.from === from && (x.from === 'takeoff' || x.from === 'punch' || x.from === 'kick')) return x.to;
      return null;
    };
    this.leanX = has('lean');
    this.cadenceY = has('cadence');
    let trig: 'L' | 'R' | null = null;
    for (const x of b) if (x.from === 'squat') trig = x.to === 'RT' ? 'R' : 'L';
    this.trig = trig;
    this.hop = button('takeoff');
    this.punch = button('punch');
    this.kick = button('kick');
    this.steps = has('step');
  }

  /** last-emitted := neutral (wake / resume): the first playing frame re-emits current values. A pulse still pending
   *  keeps its release (a press is never left unpaired). */
  begin(): void {
    this.sent = { x: 0, y: 0, t: 0 };
    this.latchSent = false;
  }

  step(p: BodyPacket, now: number, latched: boolean): BodyOut[] {
    const out = this.tick(now);
    if (p.final) return [...out, ...this.release()];
    const r = p.read, ch = p.channels;
    // rule 2: nothing before calibrated + tracking; losing the calibration (a recalibrate) lets go of everything
    if (!r.calibrated) {
      if (this.wasCalibrated) { this.wasCalibrated = false; out.push(...this.release()); }
      return out;
    }
    this.wasCalibrated = true;
    // rule 3: a body not tracked for FLOOR_RELEASE_MS lets go (a shorter gap — a missed detection — holds)
    if (!r.tracking) {
      if (r.t - this.lastTrackT >= FLOOR_RELEASE_MS) out.push(...this.release());
      return out;
    }
    this.lastTrackT = r.t;
    // rule 8: the START pose presses nothing — one release, then silence until the hands come down
    if (latched) {
      if (!this.latchSent) { this.latchSent = true; out.push(...this.release()); }
      return out;
    }
    this.latchSent = false;

    // ── the L stick (rules 4 and 7): the lean on x, the cadence on y, both held through a jump ──
    if (this.leanX || this.cadenceY) {
      if (!ch.inJump) {
        const s = r.lean?.sideSw;
        if (this.leanX && s !== undefined && s !== null) {
          const a = Math.abs(s);
          if (!this.leanOn && a >= LEAN_ON_SW) this.leanOn = true;
          else if (this.leanOn && a < LEAN_OFF_SW) this.leanOn = false;
          this.gx = this.leanOn ? quantise(Math.sign(s) * ramp(a, LEAN_OFF_SW, LEAN_FULL_SW)) : 0;
        }
        if (this.cadenceY) this.gy = quantise(-(ch.stride?.drive ?? 0));   // forward = −y
      }
      if (this.gx !== this.sent.x || this.gy !== this.sent.y) {
        this.sent.x = this.gx; this.sent.y = this.gy;
        out.push({ t: 'stick', side: 'L', x: this.gx, y: this.gy, src: 'body' });
      }
    }

    // ── the trigger (rule 5) ──
    if (this.trig) {
      this.crouch(r.squat, r.airborne, r.t, ch.inJump);
      out.push(...this.sendTrigger());
    }

    // ── the pulses (rule 6) ──
    // MOVEMENT PLAY P3 (2026-09-24, the gate): no strike out of a jump's gather. Crouched past the dead band and going
    // down or up through it, the reader has told the arms' swing into the push as a punch (a jump with the arm swing:
    // the swing read at squat 0.45–0.65, told a frame later at 0.34–0.57 as the hips rise). So no punch or kick whose
    // own instant (or the frame that told it) is crouched WHILE the crouch moves (STRIKE_SQUAT_MOVE over the lookback).
    // MOVEMENT PLAY P3 (2026-09-24, the step-2 review): a crouch HELD is a fighting stance, and strikes come out of it:
    // the first cut vetoed every strike at squat ≥ CROUCH_DEAD (a ~14 cm drop), so a jab from a 16–20 cm stance and a
    // kick off a bent supporting leg pressed nothing in VS, Mixed and Showdown. The gate's stance streams pin both.
    // MOVEMENT PLAY P3 (2026-09-24, the step-2 review): nor out of both hands coming down from overhead. The START
    // latch covers that pose in READY and PAUSED; while playing a hands-up does nothing (owner call 3), and the gate's
    // every-press-is-explained row found its way down read as two jabs (seed 23; a 0.5 s lowering, seed 41).
    if (r.wrist?.L.overhead && r.wrist.R.overhead) this.bothUpT = r.t;
    // a foot off the floor on the ground (a stride's swing; a jump's are the jump's)
    if (r.feet && !ch.inJump) for (const f of ['L', 'R'] as const) if (!r.feet[f].contact) this.liftAt[f] = r.t;
    this.squats.push({ t: r.t, squat: r.squat });
    while (this.squats.length > 2 && r.t - this.squats[0].t > 2 * STRIKE_LOOKBACK_MS) this.squats.shift();
    const inGather = (t: number): boolean => {
      let at: number | null = r.squat;
      for (const x of this.squats) { if (x.t > t) break; at = x.squat; }
      if (!((at !== null && at >= CROUCH_DEAD) || (r.squat !== null && r.squat >= CROUCH_DEAD))) return false;
      let lo = Infinity, hi = -Infinity;
      for (const x of this.squats) if (x.t >= t - STRIKE_LOOKBACK_MS && x.squat !== null) { lo = Math.min(lo, x.squat); hi = Math.max(hi, x.squat); }
      return hi - lo >= STRIKE_SQUAT_MOVE;
    };
    /** A strike the floor presses: on the ground, not out of a gather, not both arms coming down from overhead. */
    const struck = (t: number): boolean => !ch.inJump && t - this.bothUpT > OVERHEAD_STRIKE_MS && !inGather(t);
    let hopped = false;
    for (const ev of p.events) {
      switch (ev.kind) {
        case 'takeoff':
          if (this.hop) { out.push(...this.pulse({ t: 'button', btn: this.hop, pressed: true, src: 'body' }, now)); hopped = true; }
          break;
        case 'step':
          if (this.steps && !ch.inJump && ev.t - this.liftAt[ev.foot] <= STEP_SWING_MS) {
            this.liftAt[ev.foot] = -Infinity;   // one lift, one stride
            out.push(...this.pulse({ t: 'dpad', dir: ev.foot === 'L' ? 'left' : 'right', pressed: true, src: 'body' }, now));
          }
          break;
        case 'punch':
          if (this.punch && struck(ev.t)) out.push(...this.pulse({ t: 'button', btn: this.punch, pressed: true, src: 'body' }, now));
          break;
        case 'kick':
          if (this.kick && struck(ev.t)) out.push(...this.pulse({ t: 'button', btn: this.kick, pressed: true, src: 'body' }, now));
          break;
        default: break;
      }
    }
    // (a): the hop's A has gone — the crouch's peak rode it — so the trigger drops now, after it, and stays down
    // until the jump is over and its landing stood out of
    if (hopped && this.trig) {
      this.standFirst = true;
      this.clearCrouch();
      out.push(...this.sendTrigger());
    }
    return out;
  }

  /** Pulse releases that are due (frames late, or none coming): the render loop calls this every frame. */
  tick(now: number): BodyOut[] {
    const out: BodyOut[] = [];
    for (const [k, p] of this.pulses) {
      if (now < p.due) continue;
      this.pulses.delete(k);
      out.push(p.release);
    }
    return out;
  }

  /** Every analog back to 0 where it is not, every pending pulse released: the body let go (rule 3). */
  release(): BodyOut[] {
    const out: BodyOut[] = [];
    if (this.sent.x !== 0 || this.sent.y !== 0) out.push({ t: 'stick', side: 'L', x: 0, y: 0, src: 'body' });
    if (this.trig && this.sent.t !== 0) out.push({ t: 'trigger', side: this.trig, value: 0, src: 'body' });
    for (const p of this.pulses.values()) out.push(p.release);
    this.pulses.clear();
    this.sent = { x: 0, y: 0, t: 0 };
    this.gx = 0; this.gy = 0; this.leanOn = false;
    // whatever the body does when it is back (a jump found in the air lands into its absorb; a player back in frame
    // crouched), a crouch counts from a stand
    this.clearCrouch();
    this.standFirst = true;
    this.squats = [];
    this.liftAt = { L: -Infinity, R: -Infinity };
    return out;
  }

  // ── internals ──

  /**
   * The crouch's value this frame: tracks the squat DOWN (the ramp past the dead band), holds the peak on the way up,
   * and lets it go after PEAK_HOLD_MS under the dead band on the floor. It never rises in a jump (a null squat is the
   * air: it holds); a profile with a crouch and no hop lets it go at the jump.
   */
  private crouch(sq: number | null, airborne: boolean | null, t: number, inJump: boolean): void {
    if (this.standFirst) {
      // after a hop (or a release): 0 through the jump and its absorb, and until the body has STOOD OUT of the landing's
      // crouch — HOP_CLEAR_MS under the dead band on the floor. A landing's crouch outlasts land + ABSORB_MS (the
      // one-foot run-up reads 0.53 at land + 200; a scripted 2.8 m/s landing is still going down at land + 270, through
      // 0.34 and back to 0.39): that is the same crouch, not a new one. A NEW crouch then tracks from 0.
      if (inJump || sq === null || airborne !== false || sq >= CROUCH_DEAD) { this.clearT = null; this.clearMs = 0; return; }
      if (this.clearT !== null) this.clearMs += t - this.clearT;
      this.clearT = t;
      if (this.clearMs < HOP_CLEAR_MS) return;
      this.standFirst = false; this.clearT = null; this.clearMs = 0;
    }
    if (inJump && !this.hop) { this.clearCrouch(); return; }
    if (!inJump && sq !== null) {
      const v = quantise(ramp(sq, CROUCH_DEAD, CROUCH_FULL));
      if (v > this.rt) { this.rt = v; this.underMs = 0; this.underT = null; }
    }
    if (this.rt <= 0) return;
    if (airborne === false && sq !== null && sq < CROUCH_DEAD) {
      if (this.underT !== null) this.underMs += t - this.underT;
      this.underT = t;
      if (this.underMs >= PEAK_HOLD_MS) this.clearCrouch();   // (b): stood up and no hop came
    } else if (sq !== null && sq >= CROUCH_DEAD) {
      this.underMs = 0; this.underT = null;                   // still (or again) in the crouch
    } else this.underT = null;                                // in the air: the clock stops, the peak holds
  }

  private clearCrouch(): void { this.rt = 0; this.underMs = 0; this.underT = null; this.clearMs = 0; this.clearT = null; }

  private sendTrigger(): BodyOut[] {
    if (!this.trig || this.rt === this.sent.t) return [];
    this.sent.t = this.rt;
    return [{ t: 'trigger', side: this.trig, value: this.rt, src: 'body' }];
  }

  /** A press now and its release PULSE_MS later; a press of a key still pulsing releases that one first (pairs kept). */
  private pulse(press: Extract<BodyOut, { t: 'button' | 'dpad' }>, now: number): BodyOut[] {
    const key = press.t === 'button' ? `b:${press.btn}` : `d:${press.dir as Dir}`;
    const out: BodyOut[] = [];
    const prev = this.pulses.get(key);
    if (prev) out.push(prev.release);
    out.push(press);
    this.pulses.set(key, { release: { ...press, pressed: false }, due: now + PULSE_MS });
    return out;
  }
}
