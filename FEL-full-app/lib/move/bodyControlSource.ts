// bodyControlSource — 1v1 and 3v3 played by the body, through the hoops ControlSource (movement play P6; Mirror &
// coaching Plan Phase 7, owner decision 2026-10-07: FULL hoops body play).
//
// Every court body in 1v1 / 3v3 is driven by a ControlSource (lib/babylon/core/PlayerSlot): the hero's is the pad's
// LocalInputSource, an AI's an AISource, a netplay peer's a NetworkInputSource. The plan's row 6 puts the body there too:
// a BodyControlSource that turns the body's reads into the same small Intent, MERGED with the pad's (a body player still
// has the pad or the touch deck for what the body does not read — the plan's "body and pad together").
//
// THE READABLE SET (the smallest that plays a full game on the lite model at 30 fps; everything else stays on the pad):
//   offence  the drive        running in place (channels.stride): forward on the stick, ramped by the cadence; a fast
//                             cadence (BODY_TURBO_HZ) is the TURBO — never a dip or a crouch (the plan's rule)
//            the side step    the hips off the stand's centre (lean.sideSw, the floor's own hysteresis): left / right
//            the jumper       a jump starts the shot (the meter and the rise), the release is graded against the body's
//                             own apex (lib/move/hoopsBody BodyShot) and placed on the meter, which the mode releases as
//                             its own. A one-foot take-off at speed near the rim is the mode's layup, a drive into a jump
//                             at the rim with the turbo its dunk: the mode reads the finish off the geometry and the
//                             turbo, exactly as for a pad squeeze — the body only says "up now"
//            the handle       a low hand carried across the body's middle (a crossover's swap of hands): the mode's own
//                             crossover, as the 2K pro stick's up-away flick (lib/babylon/core/StickHandle)
//   defence  the slide        the same side step and drive
//            sit down         a crouch held (squat ≥ BODY_INTENSE_SQUAT) on the floor: intense D (L2's hold) — never the
//                             turbo
//            contest          a hand overhead with both feet down: the grounded hand-up (the steal button's hold)
//            block            a jump: the contest jump
//            steal            a reach straight out at the ball (BodyReader's 'punch'), on the floor: the poke. A swipe DOWN
//                             is not read: the arms coming down from overhead are a block's landing, a jump's arm swing and
//                             a contest let go far more often than a steal (the recorded jump takes say so)
//   ON THE PAD ONLY (hybrid): the pass and the pass fake (no pass from a jump: the body never passes), the screen call
//   and the charge (Circle), post-up / box-out (L1 / L2 on offence), glass (R1), the pump fake, the rest of the dribble
//   package (hesi, behind the back, spin, size-ups, step-back, pausin'), the dunk's showtime flush, the parry-vault and the
//   drive-by steal (raw-press reads in the modes), and the camera's look.
//
// TUNED (2026-10-07, flagged): BODY_TURBO_HZ 2.4 steps/s (run_in_place reads 2.68; a jog that is not a sprint stays
// under it), BODY_INTENSE_SQUAT 0.3 (a 10 cm duck reads 0.26–0.29, so a bob is not a sit-down), the crossover's
// LOW_REL_Y_M −0.25, SWAP_SIDE_SW 0.3, SWAP_MS 450 and SWAP_COOLDOWN_MS 450. None of them is a button-play number: with
// no body (no camera, or nobody in frame) the merge hands the pad's Intent back field for field (mergeIntent).
//
// Pure: no DOM, no camera, no Babylon (types only).
import type { ControlSource, Intent } from '@/lib/babylon/core/PlayerSlot';
import type { BodyView } from '@/lib/babylon/core/ModeHarness';
import type { FelInput } from '@/lib/babylon/core/InputBus';
import type { ModeBodySpec } from '@/lib/input/bodyProfiles';
import type { BodyEvent, BodyRead } from '@/lib/pose/BodyReader';
import { LEAN_ON_SW, LEAN_OFF_SW, LEAN_FULL_SW } from '@/lib/input/bodyFloor';
import { BodyShot, meterTFor, BODY_SHOT_MAX_MS, HELD_ERR_MS, PUMP_MAX_SEC, PUMP_CLEAR_SEC, type MeterFace, type ShotVerdict } from './hoopsBody';

/** A stride this fast is the turbo (steps/s): a jog in place reads 2.2–2.8, running hard 3+ (the owner's dunk approaches
 *  read 4.3). [TUNE] */
export const BODY_TURBO_HZ = 3.0;
/**
 * The side step while running in place: a jog drifts (Free Run measured 0.58 sw; the run_in_place take reads past the
 * floor's 0.35), so while the stride drives, a side step must be a real one (a shuffle reads 1.33 sw). [TUNE]
 */
export const STRIDE_SIDE_ON_SW = 0.75;
export const STRIDE_SIDE_OFF_SW = 0.6;
/** A crouch this deep, held on the floor this long, is intense D (a jump's dip is not a sit-down). [TUNE] */
export const BODY_INTENSE_SQUAT = 0.3;
export const BODY_INTENSE_HOLD_MS = 250;
/** No steal from the arms coming down with a landing: a strike or punch inside this of a landing (ms, capture clock). */
export const LAND_STEAL_VETO_MS = 450;
/** A wrist this far below its shoulder (m) is low: the dribble's height. [TUNE] */
export const LOW_REL_Y_M = -0.25;
/** A low wrist this far to a side of the hips (shoulder widths) is on that side. [TUNE] */
export const SWAP_SIDE_SW = 0.3;
/** …and carried to the other side inside this long (ms, capture clock) is the swap. [TUNE] */
export const SWAP_MS = 450;
/** …level: a carry across, not a lift (a jump shot's ball comes up across the body). [TUNE] */
export const SWAP_LEVEL_M = 0.15;
/** …and ACROSS: the wrist's travel across the body at least this many times its travel toward / away from the lens. An arm
 *  swing (a run-up's, the arms coming down from a jump) crosses the middle too, but forward and back. [TUNE] */
export const SWAP_ACROSS_RATIO = 1.5;
/** …and not out of another movement: inside this of a step, a reach, a swing down, a release, a take-off or a landing (ms,
 *  capture clock) the arms are swinging with it or coming down from it, not dribbling. [TUNE] */
export const SWAP_ARMS_BUSY_MS = 600;
/** One crossover at a time. [TUNE] */
export const SWAP_COOLDOWN_MS = 450;
/** The 2K pro stick's crossover is the up-away flick (StickHandle.stickMoveFor): this far out on each axis. */
export const CROSS_FLICK = 0.75;
/** While the body's shot is up, the meter is held this far short of its end (the auto-release). */
export const METER_HOLD_T = 0.97;

export type CourtRole = 'offense' | 'defense';

/** The shot meter, as much of it as the body touches (BasketballCore.ShotMeter). */
export interface BodyMeter extends MeterFace { t: number; readonly active: boolean }

export interface BodyControlOptions {
  /** Whose ball it is, from the hero's side. */
  role(): CourtRole;
  /** The latest body frame (ctx.body), or null with no body source. */
  view(): BodyView | null;
  /** The mode's shot meter (the body's release is placed on it). */
  meter?(): BodyMeter | null;
  /** The avatar's ball hand: the crossover's flick is up-AWAY from it. Default the right. */
  hand?(): 'Left' | 'Right' | null;
  /** Where the crossover's R-stick flick goes: the mode's own onInput (its dribble stick reads it). */
  emit?(e: FelInput): void;
  /** App clock (ms), for the meter hold's give-up. Default performance.now. */
  now?(): number;
}

/** The 1v1 / 3v3 card: the claimed events reach onBody (the shot and the defence's edges); the drive is read per frame. */
export const COURT_BODY: ModeBodySpec = {
  claims: ['takeoff', 'apex', 'land', 'release', 'punch', 'strike', 'reach', 'step'],
  lines: [
    { move: 'Run in place (fast = turbo)', verb: 'DRIVE' },
    { move: 'Step left / right', verb: 'MOVE / SLIDE' },
    { move: 'Low hand across your body', verb: 'CROSSOVER' },
    { move: 'Jump, release at the top', verb: 'SHOOT' },
    { move: 'Jump on defence', verb: 'BLOCK' },
    { move: 'Hand up, feet down', verb: 'CONTEST' },
    { move: 'Reach at the ball', verb: 'STEAL' },
    { move: 'Sit low on defence', verb: 'INTENSE D' },
  ],
};

const ramp = (v: number, lo: number, hi: number): number => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

/** A neutral Intent: what the body says with nobody in frame. */
export function neutralIntent(): Intent {
  return { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false };
}

/**
 * The pad's Intent and the body's, as one. With a neutral body this IS the pad's Intent, field for field (optional
 * fields left as the pad left them): body play never changes button play. The stick is the pad's whenever the pad's is
 * pushed (or the body's is still); every edge and hold is either's; the pass is the pad's alone.
 */
export function mergeIntent(pad: Intent, body: Intent): Intent {
  const out: Intent = { ...pad };
  const bodyMoves = body.moveX !== 0 || body.moveY !== 0;
  if (bodyMoves && Math.hypot(pad.moveX, pad.moveY) <= 0.1) { out.moveX = body.moveX; out.moveY = body.moveY; }
  if (body.sprint) out.sprint = true;
  if (body.turbo) out.turbo = true;
  if (body.action) out.action = true;
  if (body.actionHeld > pad.actionHeld) out.actionHeld = body.actionHeld;
  if (body.steal) out.steal = true;
  if (body.jump) out.jump = true;
  if (body.contest) out.contest = true;
  if (body.intense) out.intense = true;
  return out;
}

/** The pad first, the body merged in (the hero slot's source when the body may play). */
export class MergedControlSource implements ControlSource {
  constructor(readonly pad: ControlSource, readonly body: ControlSource) {}
  poll(dt: number): Intent { return mergeIntent(this.pad.poll(dt), this.body.poll(dt)); }
  dispose(): void { this.pad.dispose?.(); this.body.dispose?.(); }
}

interface SwapHand { side: -1 | 0 | 1; sideT: number; relY: number; relX: number; relZ: number }

const BLANK_SWAP = (): SwapHand => ({ side: 0, sideT: -Infinity, relY: 0, relX: 0, relZ: 0 });

export class BodyControlSource implements ControlSource {
  private readonly shot = new BodyShot();
  private role: CourtRole;
  /** The body began the shot on the meter (so it may hold and place it), and when (app clock). */
  private shotOn = false;
  private shotAt = 0;
  /** A decided shot waiting for the meter to be running. */
  private verdict: ShotVerdict | null = null;
  private jumpEdge = false;
  private stealEdge = false;
  private leanOn = false;
  private mx = 0;
  private lastT = -Infinity;
  private swap: [SwapHand, SwapHand] = [BLANK_SWAP(), BLANK_SWAP()];
  private landT = -Infinity;
  /** The last arm or jump event's instant (capture clock): no crossover read out of it. */
  private armsT = -Infinity;
  private sitSince: number | null = null;
  private swapAt = -Infinity;
  /** The verdicts placed on the meter (the form read and the tests read them). */
  readonly shots: ShotVerdict[] = [];
  /** Crossovers sent. */
  crossovers = 0;

  constructor(private readonly opts: BodyControlOptions) {
    this.role = opts.role();
  }

  /** A claimed body event (the mode's onBody, with its frame): true when it was play the game received. */
  see(ev: BodyEvent, view?: BodyView | null): boolean {
    this.syncRole();
    if (ev.kind === 'land') this.landT = ev.t;
    if (ev.kind === 'land' || ev.kind === 'takeoff' || ev.kind === 'reach' || ev.kind === 'strike' || ev.kind === 'release' || ev.kind === 'step') {
      this.armsT = Math.max(this.armsT, ev.t);
    }
    if (ev.kind === 'reach' || ev.kind === 'step') return false;   // read for the crossover's veto only (the drive is the stride channel)
    if (this.role === 'defense') {
      if (ev.kind === 'takeoff') { this.jumpEdge = true; return true; }
      // the poke: a reach straight at the ball, on the floor — never the arms coming down with a landing (a block's own
      // follow-through reads as a reach toward the lens as the arms drop)
      if (ev.kind === 'punch' && Math.abs(ev.t - this.landT) > LAND_STEAL_VETO_MS && !view?.channels.inJump) { this.stealEdge = true; return true; }
      return false;
    }
    const act = this.shot.see(ev);
    if (act.start) { this.shotOn = true; this.shotAt = this.now(); }
    if (act.verdict) this.verdict = act.verdict;
    return act.took;
  }

  poll(dt: number): Intent {
    this.syncRole();
    const out = neutralIntent();
    const v = this.opts.view();
    const r = v?.read ?? null;
    const ch = v?.channels ?? null;
    if (r && r.t !== this.lastT) {
      this.lastT = r.t;
      if (this.role === 'offense') {
        const late = this.shot.tick(r.t);
        if (late) this.verdict = late;
        this.readSwap(r, !!ch?.inJump || (ch?.stride?.drive ?? 0) > 0);
      }
    }
    const live = !!r && r.present && r.tracking;
    if (live && r && ch) {
      // the stick: the side step on x (held through a jump, as the floor holds it), the drive on y
      if (!ch.inJump) {
        const s = r.lean?.sideSw;
        if (s !== undefined && s !== null) {
          const a = Math.abs(s);
          const striding = (ch.stride?.drive ?? 0) > 0;
          const on = striding ? STRIDE_SIDE_ON_SW : LEAN_ON_SW, off = striding ? STRIDE_SIDE_OFF_SW : LEAN_OFF_SW;
          if (!this.leanOn && a >= on) this.leanOn = true;
          else if (this.leanOn && a < off) this.leanOn = false;
          this.mx = this.leanOn ? Math.sign(s) * ramp(a, off, Math.max(LEAN_FULL_SW, off + 0.3)) : 0;
        }
      }
      const drive = ch.stride?.drive ?? 0;
      out.moveX = this.mx;
      out.moveY = drive;
      // the turbo is the cadence, and only the cadence: a dip, a crouch or a jump never lights it
      const turbo = !!ch.stride && drive > 0 && ch.stride.hz >= BODY_TURBO_HZ;
      out.turbo = turbo;
      out.sprint = turbo && Math.hypot(out.moveX, out.moveY) > 0.1;
      if (this.role === 'defense') {
        const grounded = !ch.inJump && r.airborne === false;
        const sat = grounded && (r.squat ?? 0) >= BODY_INTENSE_SQUAT;
        if (!sat) this.sitSince = null; else if (this.sitSince === null) this.sitSince = r.t;
        out.intense = sat && this.sitSince !== null && r.t - this.sitSince >= BODY_INTENSE_HOLD_MS;
        out.contest = grounded && !!(r.wrist?.L.overhead || r.wrist?.R.overhead);
      }
    } else {
      this.leanOn = false; this.mx = 0; this.sitSince = null;
    }
    out.jump = this.jumpEdge;
    out.steal = this.stealEdge;
    this.jumpEdge = false; this.stealEdge = false;
    if (this.role === 'offense') this.shotIntent(out, dt);
    return out;
  }

  /** The shot on the meter: held while the body is up, placed and released on the verdict. */
  private shotIntent(out: Intent, dt: number): void {
    if (!this.shotOn) { this.verdict = null; return; }
    const m = this.opts.meter?.() ?? null;
    const timedOut = this.now() - this.shotAt > BODY_SHOT_MAX_MS;
    if (timedOut && (!m || !m.active)) { this.endShot(); return; }   // the mode never ran a meter for it (a dunk, footwork)
    out.actionHeld = 1;
    if (!m || !m.active) return;   // the press is down; the mode starts the meter on it
    // the body never said (lost in the air, frames stopped): the ball goes up held, as a jump with no release does
    if (timedOut && !this.verdict) this.verdict = { errMs: HELD_ERR_MS, lateMs: null, why: 'held', hand: null, jumped: true, feet: null, takeoffT: null, apexT: null, releaseT: null };
    const dur = m.durationSec > 0 ? m.durationSec : 1;
    const step = dt / dur;   // the mode advances its meter after this poll, in the same frame
    if (this.verdict) {
      m.t = Math.max(0, meterTFor(this.verdict.errMs, m, PUMP_MAX_SEC + PUMP_CLEAR_SEC) - step);
      this.shots.push(this.verdict);
      out.actionHeld = 0;
      out.action = true;
      this.endShot();
      return;
    }
    if (m.t > METER_HOLD_T - step) m.t = Math.max(0, METER_HOLD_T - step);
  }

  private endShot(): void {
    this.shotOn = false; this.verdict = null;
  }

  private syncRole(): void {
    const r = this.opts.role();
    if (r === this.role) return;
    this.role = r;
    this.shot.reset(); this.endShot();
    this.jumpEdge = false; this.stealEdge = false;
  }

  /**
   * The crossover: a low wrist carried from one side of the hips to the other, quickly, on the floor, STANDING (the size-up
   * at the top of the key). While running in place the arms swing across the body every stride, which a camera cannot
   * tell from a carry: the drive's dribble moves stay on the pad (`busy` = in a jump or running).
   */
  private readSwap(r: BodyRead, busy: boolean): void {
    const cal = r.rulers;
    if (!r.present || !r.tracking || busy || r.t - this.armsT < SWAP_ARMS_BUSY_MS || !r.wrist || !r.hip || !cal || !(cal.shoulderWidth > 0)) {
      this.swap = [BLANK_SWAP(), BLANK_SWAP()];
      return;
    }
    const hands = [r.wrist.L, r.wrist.R];
    // a crossover is dribbled: BOTH hands at dribble height (the one carrying and the one taking it), the body not in a
    // jump's gather (deep squat) — the shot's ball lift and an approach's arm swing are neither
    const bothLow = hands.every((w) => w.rel.y <= LOW_REL_Y_M);
    const gathering = (r.squat ?? 0) >= BODY_INTENSE_SQUAT + 0.1;
    for (let i = 0; i < 2; i++) {
      const w = hands[i];
      const h = this.swap[i];
      if (w.rel.y > LOW_REL_Y_M || gathering) { h.side = 0; h.sideT = -Infinity; continue; }
      const u = (w.x - r.hip.x) / cal.shoulderWidth;
      const side: -1 | 0 | 1 = u >= SWAP_SIDE_SW ? 1 : u <= -SWAP_SIDE_SW ? -1 : 0;
      if (side === 0) continue;   // crossing the middle: the side it left is kept
      const across = Math.abs(w.rel.x - h.relX) >= SWAP_ACROSS_RATIO * Math.abs(w.rel.z - h.relZ);
      if (h.side !== 0 && side !== h.side && bothLow && across && r.t - h.sideT <= SWAP_MS && Math.abs(w.rel.y - h.relY) <= SWAP_LEVEL_M
        && r.t - this.swapAt >= SWAP_COOLDOWN_MS) {
        this.swapAt = r.t;
        this.crossover();
      }
      h.side = side; h.sideT = r.t; h.relY = w.rel.y; h.relX = w.rel.x; h.relZ = w.rel.z;
    }
  }

  private crossover(): void {
    this.crossovers++;
    const emit = this.opts.emit;
    if (!emit) return;
    const away = (this.opts.hand?.() ?? 'Right') === 'Right' ? -CROSS_FLICK : CROSS_FLICK;
    // stick space (up = −y): home, out up-away (the StickHandle flick), home
    emit({ t: 'stick', side: 'R', x: 0, y: 0, src: 'body' });
    emit({ t: 'stick', side: 'R', x: away, y: -CROSS_FLICK, src: 'body' });
    emit({ t: 'stick', side: 'R', x: 0, y: 0, src: 'body' });
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }
}
