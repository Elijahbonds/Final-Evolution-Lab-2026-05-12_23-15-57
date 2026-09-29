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
//
// MOVEMENT PLAY P8 (2026-09-26): THE RIDE'S CONTROLS, off the channels' ride read (lib/pose/rideReader): the stance's
// carve, the steering wheel's tilt or the wings' bank on x; surf's crouch rhythm (the trim) or the wings' height on y; the
// grip, the spread wings or high knees on a trigger; a hop into a turned wheel held on a button (the kart's drift). Each
// has an ON / OFF hysteresis pair, a dwell before it engages and the QUANTUM grid, and rest emits nothing (the P3
// contract): an unread control is 0, never a guess. Every stick source holds its grounded value through a body jump, as
// the lean does (a surfer's gather into the pop is a compress and an extend: its trim stroke is held through the air, never
// changed in it). A profile binds one source per axis and per trigger.
import type { BodyOut, BodyPacket, FelButton } from '@/lib/babylon/core/InputBus';
import type { BodyBinding, BodyProfile } from './bodyProfiles';
// MOVEMENT PLAY P7 (2026-09-25): the strike vetoes live in lib/pose/strikeVeto.ts now, shared with the fight reader;
// the numbers below are re-exported from there (their measurements stay documented here, where they were set).
import { StrikeVeto, CROUCH_DEAD, STRIKE_LOOKBACK_MS, STRIKE_SQUAT_MOVE, OVERHEAD_STRIKE_MS } from '@/lib/pose/strikeVeto';
import { STRIDE_MIN_HZ, STRIDE_FULL_HZ } from '@/lib/pose/bodyChannels';                 // MOVEMENT PLAY P8
import { CARVE_ON as CARVE_ON_, CARVE_OFF as CARVE_OFF_ } from '@/lib/pose/rideReader';   // MOVEMENT PLAY P8
import { GO_AT, ROCKET_EARLIEST } from '@/lib/babylon/racing/RaceStart';                   // MOVEMENT PLAY P8 (the race's count)

/** The lean engages past LEAN_ON_SW shoulder widths off the calibrated centre and lets go under LEAN_OFF_SW, reaching
 *  full stick at LEAN_FULL_SW (the ramp runs from the OFF line, so the hysteresis never jumps the value). Rest reads
 *  ≤ 0.03 sw, jumps ≤ 0.15, the jump shot 0.29, a sideways shuffle 1.33. */
export const LEAN_ON_SW = 0.35;
export const LEAN_OFF_SW = 0.28;
export const LEAN_FULL_SW = 1.1;
/** The crouch pulls nothing under CROUCH_DEAD squat (a 10 cm duck reads 0.26–0.29) and full trigger at CROUCH_FULL
 *  (a 20 cm duck reads 0.51–0.55, a gather 0.43–1.0). */
export { CROUCH_DEAD };
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
export { STRIKE_LOOKBACK_MS };
/** A crouch that is MOVING: the squat's range over the lookback (from STRIKE_LOOKBACK_MS before the strike to the
 *  frame that told it) at least this. A jump's gather moves 0.36–0.55 there; a fighting stance held 13–25 cm down
 *  (squat 0.33–0.66) moves 0.01–0.06 while it throws (the gate's stance streams, three seeds). */
export { STRIKE_SQUAT_MOVE };
/** No strike this soon (ms) after both wrists were overhead: the arms coming down out of a hands-up read as a punch
 *  69–103 ms after they left it (the gate's hands-up hold dropped at once and lowered over 0.5 s), and both hands up
 *  while playing does nothing (owner call 3) — not even a jab on the way down. */
export { OVERHEAD_STRIKE_MS };
/** Every analog value goes out on this grid, so the reader's jitter is not a stream of one-hundredth changes. */
export const QUANTUM = 0.05;

const ramp = (v: number, lo: number, hi: number): number => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
/** On the QUANTUM grid, two decimals exact, and never −0 (a centred axis is 0). */
export function quantise(v: number): number {
  const q = Math.round(v / QUANTUM) * QUANTUM;
  return Math.abs(q) < 1e-9 ? 0 : Math.round(q * 100) / 100;
}

// ── MOVEMENT PLAY P8: the ride's controls (PLAN-P8 §5; the gate lib/pose/rideGate.test measures each) ──
/** The carve engages past CARVE_ON leg lengths for RIDE_DWELL_MS, lets go under CARVE_OFF, full stick at CARVE_FULL. */
export { CARVE_ON, CARVE_OFF } from '@/lib/pose/rideReader';
export const CARVE_FULL = 0.22;
/** Every ride stick holds its engage this long (ms, capture clock) before it moves: a flicker is not a steer. (R-F5: 100 → 60
 *  took the carve's p90 at 30 fps · 80 ms from 330 to 270 ms on the train seeds 11 / 17 / 23 with 0 outputs on 3,600 board
 *  rest runs either way.) */
export const RIDE_DWELL_MS = 60;
/** Surf's trim: the squat's rate (1/s) — compressing drops in (−y), extending climbs (+y). The plan's 0.4 / 0.3 / 60 ms est.
 *  let a 12° nose shift through at −0.05 (rideGate): a real pump's strokes run 1–2 /s. */
export const TRIM_ON = 0.5;
export const TRIM_OFF = 0.35;
export const TRIM_FULL = 2.0;
export const TRIM_DWELL_MS = 100;
/** The wheel's tilt (deg): + clockwise = steer right. */
export const WHEEL_ON_DEG = 7;
export const WHEEL_OFF_DEG = 5;
export const WHEEL_FULL_DEG = 55;
/** The wings' bank and pitch (deg). */
export const BANK_ON_DEG = 6;
export const BANK_OFF_DEG = 4;
export const BANK_FULL_DEG = 40;
export const PITCH_ON_DEG = 8;
export const PITCH_OFF_DEG = 6;
export const PITCH_FULL_DEG = 30;
/** High knees (Free Run's SPRINT on RT): the knee driven this high (thighs) at this cadence, on after / off after (ms).
 *  The plan's 0.75 est. moved to 0.6: run_in_place (a real jog) reads 0.34 median, 0.47 p90; scripted knees to 0.42 m
 *  read 0.68, to 0.55 m 1.0 (rideGate, measured). */
export const HIGH_KNEES_DRIVE = 0.6;
export const HIGH_KNEES_HZ = 2.4;
export const HIGH_KNEES_ON_MS = 150;
export const HIGH_KNEES_OFF_MS = 250;
/** The kart's drift: a hop with the wheel at least this far over (0.35 ≈ 22° of wheel: the plan's 0.5 est. sat on the 30°
 *  class's own value, which reads 0.35–0.55 at 15 fps and 1.5× noise; the 15° class reads 0.2) holds the button, until it is back under DRIFT_OFF for
 *  DRIFT_OFF_MS (or the grip goes). */
export const DRIFT_ON = 0.35;
export const DRIFT_OFF = 0.2;
export const DRIFT_OFF_MS = 150;
/** …and only with the wheel gripped this long (ms, capture clock) before the take-off (PLAN-P8 R-F2: the owner's two-foot
 *  dunk landed its arms where a turned wheel would be and the first build drifted on it; a driver has held the wheel). */
export const DRIFT_GRIP_MS = 500;
/**
 * THE RACE'S COUNT (review fix, 2026-09-26). The kart and the plane count 3 · 2 · 1 · GO from the wake (RaceStart: the gas
 * down on "2" and held through GO is a ROCKET START, down earlier and held is a BURNOUT). A body racer's gas is the grip or
 * the spread wings, and it went down whenever the arms happened to arrive: measured through the real session, floor and
 * count (the hands-up START, then the arms), arms dropped straight onto the wheel or out as wings the moment the game woke
 * put the gas down 1.0–1.4 s in — a burnout in every cell — and arms held up a beat longer put it down at 1.6–1.9 s, a
 * rocket. So a grip or a spread TAKEN before the rocket window opens (RACE_OPEN_MS after the wake: the window's own edge
 * plus a margin for the count starting on the next frame) is held at 0 until GO — a normal start, never a penalty for
 * gripping early — and one taken inside the window passes: the rocket, earned as a pad earns it. After GO the trigger is
 * the ride's own. Only the first begin() of a floor counts (one floor per mount: its first begin is the wake; every other
 * is a resume).
 */
export const RACE_OPEN_MS = (GO_AT - ROCKET_EARLIEST) * 1000 + 100;
export const RACE_GO_MS = GO_AT * 1000;

/** One ride axis: an ON / OFF hysteresis pair, a dwell before it engages, the ramp from the OFF line to FULL. */
class RideAxis {
  private on = false;
  private since: number | null = null;
  constructor(private readonly onAt: number, private readonly offAt: number, private readonly full: number, private readonly dwellMs: number) {}
  /** A signed read (null = unread: 0, and let go) at capture time t → the value on [−1, 1], before the grid. */
  step(v: number | null, t: number): number {
    if (v === null || !Number.isFinite(v)) { this.reset(); return 0; }
    const a = Math.abs(v);
    if (!this.on) {
      if (a >= this.onAt) { this.since ??= t; if (t - this.since >= this.dwellMs) this.on = true; }
      else this.since = null;
    } else if (a < this.offAt) this.reset();
    return this.on ? Math.sign(v) * ramp(a, this.offAt, this.full) : 0;
  }
  reset(): void { this.on = false; this.since = null; }
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
  // MOVEMENT PLAY P8: the ride's sources (one per axis, one per trigger), Free Run's own cadence band, the drift hold
  private readonly xSrc: 'lean' | 'carve' | 'wheel' | 'wingBank' | null;
  private readonly ySrc: 'cadence' | 'trim' | 'wingPitch' | null;
  private readonly trigSrc: 'squat' | 'grip' | 'spread' | 'highKnees' | null;
  private readonly band: { minHz: number; fullHz: number } | null;
  private readonly hopTurn: FelButton | null;
  private readonly xAxis: RideAxis | null;
  private readonly yAxis: RideAxis | null;
  private knees = { raw: false, flipAt: -Infinity, on: false };
  private drift = { held: false, underT: null as number | null };
  /** The race's count (RACE_OPEN_MS), from the wake's first frame (capture ms): when the grip / wings were last taken. */
  private count: { from: number | null; downAt: number; was: boolean } | null = null;
  private begun = false;
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
  /** The strike vetoes (lib/pose/strikeVeto): the squat over the last 2 × STRIKE_LOOKBACK_MS and when both wrists were
   *  last overhead — a strike is judged at its own instant, told late. */
  private readonly veto = new StrikeVeto();
  /** When each foot was last seen off the floor on the ground (capture ms). */
  private liftAt: Record<'L' | 'R', number> = { L: -Infinity, R: -Infinity };

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
    this.hop = button('takeoff');
    this.punch = button('punch');
    this.kick = button('kick');
    this.steps = has('step');
    // MOVEMENT PLAY P8: the ride's sources
    this.xSrc = has('lean') ? 'lean' : has('carve') ? 'carve' : has('wheel') ? 'wheel' : has('wingBank') ? 'wingBank' : null;
    this.ySrc = has('cadence') ? 'cadence' : has('trim') ? 'trim' : has('wingPitch') ? 'wingPitch' : null;
    let trigSrc: BodyFloor['trigSrc'] = trig ? 'squat' : null;
    for (const x of b) if (x.from === 'grip' || x.from === 'spread' || x.from === 'highKnees') { trigSrc = x.from; trig = x.to === 'RT' ? 'R' : 'L'; }
    this.trig = trig;
    this.trigSrc = trigSrc;
    const cad = b.find((x): x is Extract<BodyBinding, { from: 'cadence' }> => x.from === 'cadence');
    this.band = cad && cad.minHz !== undefined && cad.fullHz !== undefined ? { minHz: cad.minHz, fullHz: cad.fullHz } : null;
    this.hopTurn = b.find((x): x is Extract<BodyBinding, { from: 'hopTurn' }> => x.from === 'hopTurn')?.to ?? null;
    this.xAxis = this.xSrc === 'carve' ? new RideAxis(CARVE_ON_, CARVE_OFF_, CARVE_FULL, RIDE_DWELL_MS)
      : this.xSrc === 'wheel' ? new RideAxis(WHEEL_ON_DEG, WHEEL_OFF_DEG, WHEEL_FULL_DEG, RIDE_DWELL_MS)
        : this.xSrc === 'wingBank' ? new RideAxis(BANK_ON_DEG, BANK_OFF_DEG, BANK_FULL_DEG, RIDE_DWELL_MS) : null;
    this.yAxis = this.ySrc === 'trim' ? new RideAxis(TRIM_ON, TRIM_OFF, TRIM_FULL, TRIM_DWELL_MS)
      : this.ySrc === 'wingPitch' ? new RideAxis(PITCH_ON_DEG, PITCH_OFF_DEG, PITCH_FULL_DEG, RIDE_DWELL_MS) : null;
  }

  /** last-emitted := neutral (wake / resume): the first playing frame re-emits current values. A pulse still pending
   *  keeps its release (a press is never left unpaired). */
  begin(): void {
    this.sent = { x: 0, y: 0, t: 0 };
    this.latchSent = false;
    // MOVEMENT PLAY P8: the first begin() is the wake — a racer's count starts (RACE_OPEN_MS); a resume has none
    this.count = !this.begun && (this.trigSrc === 'grip' || this.trigSrc === 'spread') ? { from: null, downAt: -Infinity, was: false } : null;
    this.begun = true;
  }

  step(p: BodyPacket, now: number, latched: boolean): BodyOut[] {
    const out = this.tick(now);
    if (p.final) return [...out, ...this.release()];
    if (this.count && this.count.from === null) this.count.from = p.read.t;   // MOVEMENT PLAY P8: the wake's frame starts the race's count
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
    // (MOVEMENT PLAY P8: or the ride's carve / wheel / bank on x, trim / pitch on y — held the same way)
    if (this.xSrc || this.ySrc) {
      const ride = ch.ride;
      if (!ch.inJump) {
        const s = r.lean?.sideSw;
        if (this.leanX && s !== undefined && s !== null) {
          const a = Math.abs(s);
          if (!this.leanOn && a >= LEAN_ON_SW) this.leanOn = true;
          else if (this.leanOn && a < LEAN_OFF_SW) this.leanOn = false;
          this.gx = this.leanOn ? quantise(Math.sign(s) * ramp(a, LEAN_OFF_SW, LEAN_FULL_SW)) : 0;
        }
        if (this.cadenceY) this.gy = quantise(-this.cadenceDrive(ch.stride, ride));   // forward = −y
        if (this.xAxis) {
          const v = this.xSrc === 'carve' ? (ride?.carve == null ? null : ride.carve * ride.steerSign)
            : this.xSrc === 'wheel' ? (ride?.wheel.grip ? ride.wheel.angleDeg : null)
              : (ride?.wings.on ? ride.wings.bankDeg : null);
          this.gx = quantise(this.xAxis.step(v, r.t));
        }
        if (this.ySrc === 'trim') this.gy = quantise(-this.yAxis!.step(ride?.trimRate ?? null, r.t));   // compress = drop in (−y)
        if (this.ySrc === 'wingPitch') this.gy = quantise(this.yAxis!.step(ride?.wings.on ? ride.wings.pitchDeg : null, r.t));   // raised = climb (+y)
      }
      if (this.gx !== this.sent.x || this.gy !== this.sent.y) {
        this.sent.x = this.gx; this.sent.y = this.gy;
        out.push({ t: 'stick', side: 'L', x: this.gx, y: this.gy, src: 'body' });
      }
    }

    // ── the trigger (rule 5) ──
    if (this.trig) {
      if (this.trigSrc === 'squat') this.crouch(r.squat, r.airborne, r.t, ch.inJump);
      else this.rt = this.rideTrigger(p, r.t);   // MOVEMENT PLAY P8: the grip, the wings or high knees (held through a jump)
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
    // a foot off the floor on the ground (a stride's swing; a jump's are the jump's)
    if (r.feet && !ch.inJump) for (const f of ['L', 'R'] as const) if (!r.feet[f].contact) this.liftAt[f] = r.t;
    this.veto.push(r.t, r.squat, !!(r.wrist?.L.overhead && r.wrist.R.overhead));
    /** A strike the floor presses: on the ground, not out of a gather, not both arms coming down from overhead. */
    const struck = (t: number): boolean => this.veto.ok(t, r.squat, ch.inJump);
    let hopped = false;
    for (const ev of p.events) {
      switch (ev.kind) {
        case 'takeoff':
          if (this.hop) { out.push(...this.pulse({ t: 'button', btn: this.hop, pressed: true, src: 'body' }, now)); hopped = true; }
          // MOVEMENT PLAY P8: a hop into a turned wheel is the kart's DRIFT, held (released below, never a pulse)
          if (this.hopTurn && !this.drift.held && Math.abs(this.gx) >= DRIFT_ON && ch.ride?.wheel.grip && ev.t - ch.ride.wheel.since >= DRIFT_GRIP_MS) {
            this.drift = { held: true, underT: null };
            out.push({ t: 'button', btn: this.hopTurn, pressed: true, src: 'body' });
          }
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
    if (hopped && this.trig && this.trigSrc === 'squat') {
      this.standFirst = true;
      this.clearCrouch();
      out.push(...this.sendTrigger());
    }
    // MOVEMENT PLAY P8: the drift lets go once the wheel is back near centre for DRIFT_OFF_MS, or the grip is gone
    if (this.drift.held && this.hopTurn) {
      const straight = Math.abs(this.gx) < DRIFT_OFF;
      this.drift.underT = straight ? (this.drift.underT ?? r.t) : null;
      if (!ch.ride?.wheel.grip || (this.drift.underT !== null && r.t - this.drift.underT >= DRIFT_OFF_MS)) {
        this.drift = { held: false, underT: null };
        out.push({ t: 'button', btn: this.hopTurn, pressed: false, src: 'body' });
      }
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
    // MOVEMENT PLAY P8: the drift's hold goes with everything else, and the ride's axes start again from rest
    if (this.drift.held && this.hopTurn) out.push({ t: 'button', btn: this.hopTurn, pressed: false, src: 'body' });
    this.drift = { held: false, underT: null };
    this.xAxis?.reset(); this.yAxis?.reset(); this.knees = { raw: false, flipAt: -Infinity, on: false };
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
    this.veto.clearSquats();   // (the overhead instant is kept, as it always was)
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

  /** MOVEMENT PLAY P8: the stride's drive, on the profile's own band if it has one (Free Run) — the channels' hold and fade
   *  kept (the drive over the shared band's ramp), the ramp redrawn between the band's own lines. */
  private cadenceDrive(st: BodyPacket['channels']['stride'], ride?: BodyPacket['channels']['ride']): number {
    if (!st) return 0;
    if (!this.band) return st.drive;
    // (Free Run's P8 row: only while the ride read says the body is RUNNING — real swings, not a still stand's jittered steps
    // — and on the real steps' own rate: at 1.5× noise the channel's rate counts those jittered steps too, and a 2 step/s walk
    // read 0.6 of the stick, over the vault gate)
    if (ride && (!ride.running || ride.stepHz === null)) return 0;
    const shared = ramp(st.hz, STRIDE_MIN_HZ, STRIDE_FULL_HZ);
    const k = shared > 0 ? st.drive / shared : 0;
    return ramp(ride ? ride.stepHz! : st.hz, this.band.minHz, this.band.fullHz) * Math.max(0, Math.min(1, k));
  }

  /** MOVEMENT PLAY P8: a trigger held by a ride state — 1 while the wheel is gripped, the wings spread, or the knees driven
   *  high at a run (its own on / off dwell) — and 0 otherwise. Held through a jump (a hop never lets go of the gas). */
  private rideTrigger(p: BodyPacket, t: number): number {
    const ride = p.channels.ride;
    if (p.channels.inJump) return this.rt;
    if (this.trigSrc === 'grip' || this.trigSrc === 'spread') {
      const on = this.trigSrc === 'grip' ? !!ride?.wheel.grip : !!ride?.wings.on;
      // the race's count (RACE_OPEN_MS): a grip / spread taken before the rocket window waits for GO; one taken in it passes
      const c = this.count;
      if (c && c.from !== null) {
        const since = t - c.from;
        if (since >= RACE_GO_MS) this.count = null;
        else {
          if (on && !c.was) c.downAt = since;
          c.was = on;
          if (on && c.downAt < RACE_OPEN_MS) return 0;
        }
      }
      return on ? 1 : 0;
    }
    // (a running stride, not its hold's tail: a step told late there re-lit the trigger for 0.6 s after a stop) — on the RIDE's
    // real-step rate: the stride channel counts every told step, and at 15 fps the P2 reader tells a march's steps in pairs
    // (CMU 91_19, knees to the hip at 1.3 steps/s, read 3.2 and held SPRINT, R-F6). To START it, the KNEE rate — the rate as
    // it stood at each of the last two real steps (review fix: on the run's rate alone 91_19 read 2.56 at 15 fps for one step,
    // seed 41, and held SPRINT); to STAY on, the run's rate, as before (the two-step rule alone flickered the scripted high
    // knees' SPRINT off mid-run where the reader missed two steps running: seed 17, 15 fps)
    const k = this.knees;
    const hz = k.raw || k.on ? ride?.stepHz : ride?.kneeHz;
    const raw = (ride?.kneeDrive ?? 0) >= HIGH_KNEES_DRIVE && (hz ?? 0) >= HIGH_KNEES_HZ && (p.channels.stride?.drive ?? 0) >= 0.5 && ride?.kneeDriveRecent === true;
    if (raw !== k.raw) { k.raw = raw; k.flipAt = t; }
    if (!k.on && k.raw && t - k.flipAt >= HIGH_KNEES_ON_MS) k.on = true;
    if (k.on && !k.raw && t - k.flipAt >= HIGH_KNEES_OFF_MS) k.on = false;
    return k.on ? 1 : 0;
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
