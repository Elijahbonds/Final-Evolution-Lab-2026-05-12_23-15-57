// BasketballCore v3 — REPLACES the M52 file. Everything v2 shipped is kept
// byte-for-byte in behavior (DribbleController, ShotMeter, body collision,
// ankle-breaker, shot variety, both AI brains, contestLevel, court clamps)
// and FOUR systems are added for the comprehensive upgrade pass:
//   TurboMeter — sprint is now a spent resource (drains while sprinting,
//     regens while you don't). Ends sprint-spam, creates real pacing, and
//     gates the new drive dunks so they're earned, not free.
//   ShotArc — the ball actually FLIES now: a real parabolic arc from the
//     release hand to the rim over ~0.65s (makes drop through, misses clang
//     off a rim point and bounce out via the mode's BallSim). The result is
//     still decided at release — the arc is the honest visual sell, not
//     hidden physics dice.
//   Drive dunks — checkDriveDunk(): attacking the rim at speed with turbo
//     in the tank converts the attempt into a DUNK instead of a metered
//     shot; a defender inside the drive makes it a POSTERIZE opportunity
//     (they get put on the floor). The missing Blacktop fantasy.
//   Shot blocking — checkBlock(): defense grows a real contest JUMP with a
//     timing window around the shooter's release. Mistimed jumps do
//     nothing; timed ones erase the shot.

import { Vector3 } from '@babylonjs/core';
import type { AIBehavior, Intent } from './PlayerSlot';
import { CourtMovement, DEFAULT_MOVEMENT, GEARS_HOOPS, type Gear } from './CourtMovement';
import {   // HOOPS-MOVE-KIT-A O1–O3: the off-ball jobs (screen / roll / pop / crash, box-out, navigating a screen)
  screenSpot, pickScreenSide, stepScreen, SCREEN_IDLE, rollLaneOpen, rollTarget, crashSpot, navigateAround, boxOutSpot, SCREEN_MIN_RIM_DIST,
  type OffenseJob, type DefenseJob, type ScreenState,
} from './HoopsOffball';

// ── Movement ─────────────────────────────────────────────────────────────
export interface DribbleResult { crossover: boolean; hesitation: boolean; speed01: number; facingRad: number; planting: boolean; gear: Gear; intensity01: number; paceChange: boolean }

/** Planar movement now runs on CourtMovement (Phase 2 weight model):
 *  ramped accel, stronger decel, speed-scaled plant-and-cut, turn-rate cap.
 *  This class keeps its API (and its crossover detection) so every mode's
 *  call sites are unchanged — the FEEL underneath got heavier. A detected
 *  crossover is a *skilled* cut: it bypasses the plant penalty and gets the
 *  burst boost, exactly like 2K's explosive crossover.
 *
 *  Depth pass: a hard stick reversal is no longer one move. A reversal
 *  BACKWARD against your facing is a HESITATION (the 2K right-stick
 *  pullback): you plant dead — your momentum is the cost — and get a short
 *  explode-out window on the next push. A reversal LATERAL to your facing
 *  stays the crossover. Before this split, pulling back to set up a drive
 *  fired the crossover burst and (worse) could trigger ankle-breakers while
 *  retreating. */
export class DribbleController {
  private movement: CourtMovement;
  // The last COMMITTED stick direction (normalised) and how long ago. The
  // reversal detection used to compare CONSECUTIVE frames — which meant the
  // move only existed for an analog flick fast enough to skip the deadzone
  // between two frames. A keyboard can never do that (key-up reports neutral
  // before the next key-down), and a human thumb passes through neutral too.
  // On keyboard the entire crossover/hesi vocabulary was simply absent.
  private lastDirX = 0; private lastDirY = 0; private lastDirAge = Infinity;
  private crossoverCooldown = 0;
  private hesiCooldown = 0;
  private hesiBoostLeft = 0;
  /** Seconds the stick has been held BACK (pullback gather); -1 = not
   *  pulling, Infinity = held too long — that's a retreat, not a hesi. */
  private pullbackSec = -1;

  /** Max seconds between the last committed direction and its reversal —
   *  a flick, not a meander. */
  static readonly REVERSAL_WINDOW_SEC = 0.25;
  /** A pullback becomes a retreat if held longer than this. */
  static readonly PULLBACK_TAP_SEC = 0.35;

  /** Seconds the explode-out window stays open after a hesitation plant. */
  static readonly HESI_BOOST_SEC = 0.6;
  /** Seconds before another hesitation can be thrown. */
  static readonly HESI_COOLDOWN_SEC = 1.0;

  constructor(cfg = { maxSpeed: 6.4, accel: 26, decel: 34, turnRate: 9, crossoverBoost: 2.2 }) {
    this.movement = new CourtMovement({ ...DEFAULT_MOVEMENT, maxSpeed: cfg.maxSpeed, gears: GEARS_HOOPS });   // DRIBBLE PACE: the gears are on for the ball handler
    this.crossoverBoost = cfg.crossoverBoost;
  }
  private crossoverBoost: number;
  /** DRIBBLE PACE: letting off the turbo at pace opens a change-of-pace window; the next R2 PRESS inside it explodes. */
  private sprintWas = false; private paceWindowLeft = 0;
  static readonly PACE_WINDOW_SEC = 0.6;
  static readonly PACE_DOWN_MIN_SPEED = 3.4;

  get vel(): Vector3 { return this.movement.vel; }
  get facing(): number { return this.movement.facing; }
  /** The movement layer's facing starts at 0 no matter which way the model
   *  spawned — and "pull BACK" is judged against facing, so a triple-threat
   *  hesi before your first step read backwards as a push. Modes that spawn
   *  a character facing somewhere (all of them) must say so. */
  setFacing(rad: number): void { this.movement.facing = rad; }

  update(dt: number, moveX: number, moveY: number, sprint: boolean): DribbleResult {
    this.crossoverCooldown = Math.max(0, this.crossoverCooldown - dt);
    this.hesiCooldown = Math.max(0, this.hesiCooldown - dt);
    this.hesiBoostLeft = Math.max(0, this.hesiBoostLeft - dt);
    const mag = Math.hypot(moveX, moveY);
    let crossover = false;
    let hesitation = false;
    let paceChange = false;
    this.paceWindowLeft = Math.max(0, this.paceWindowLeft - dt);
    const speedBefore = this.movement.vel.length();
    // the gear-down: R2 let go at pace with the stick still in — the body eases off (CourtMovement) and the window arms
    if (!sprint && this.sprintWas && speedBefore >= DribbleController.PACE_DOWN_MIN_SPEED && mag > 0.5) this.paceWindowLeft = DribbleController.PACE_WINDOW_SEC;
    const sprintPress = sprint && !this.sprintWas && mag > 0.5;

    this.lastDirAge += dt;
    const committed = mag > 0.6;
    const dot = this.lastDirX * (committed ? moveX / mag : 0) + this.lastDirY * (committed ? moveY / mag : 0);
    // Classify the gesture against the facing you HAD, not the facing after
    // this frame's movement: at low speed CourtMovement snaps facing to the
    // stick, which re-labelled a pull-back as a push mid-gesture (measured:
    // three frames of held pull-back wrapped facing π → 0 and the tap
    // exploded you toward your own basket).
    const facingX = Math.sin(this.movement.facing), facingZ = Math.cos(this.movement.facing);
    const state = this.movement.update(dt, moveX, moveY, sprint);
    const dir = committed ? new Vector3(moveX / mag, 0, -moveY / mag) : null;
    const back = dir ? dir.x * facingX + dir.z * facingZ : 0;
    const fwd = back !== 0 ? -back : 0;
    // Backpedalling keeps your chest to the rim: a pull-back/retreat must not
    // turn the model (or the gesture layer's idea of "back") around — after
    // one retreat the next pull-back read as a push and the vocabulary died.
    if (dir && back < -0.5) this.movement.facing = Math.atan2(facingX, facingZ);

    // HESITATION — the pull-back TAP. Hold the stick away from your facing
    // for a beat and let go (or snap forward): you plant dead — your momentum
    // is the price — and the explode-out window arms. Held longer than
    // PULLBACK_TAP_SEC it's just a retreat dribble and nothing fires. A tap
    // from a TRIPLE-THREAT standstill is the canonical throw (no run-up
    // needed), which a reversal-only detector could never see.
    if (dir && back < -0.92) {
      if (this.pullbackSec < 0) this.pullbackSec = 0;
      else this.pullbackSec += dt;
      if (this.pullbackSec > DribbleController.PULLBACK_TAP_SEC) this.pullbackSec = Infinity;
    } else {
      if (this.pullbackSec >= 0 && this.pullbackSec <= DribbleController.PULLBACK_TAP_SEC && this.hesiCooldown === 0) {
        hesitation = true;
        this.hesiCooldown = DribbleController.HESI_COOLDOWN_SEC;
        this.hesiBoostLeft = DribbleController.HESI_BOOST_SEC;
        this.movement.vel.scaleInPlace(0.12);
        // A flick straight back OUT (pull then push in one motion) explodes
        // on the same frame instead of waiting for the next push.
        if (dir && fwd > 0.3) {
          const top = DEFAULT_MOVEMENT.maxSpeed;
          this.movement.vel.copyFrom(dir.scale(Math.min(top * 1.15, this.crossoverBoost * 1.5)));
          this.movement.facing = Math.atan2(dir.x, dir.z);
          this.hesiBoostLeft = 0;
        }
      }
      this.pullbackSec = -1;
    }

    // CROSSOVER — a hard reversal of the committed direction that is NOT a
    // pullback (keeps a rim-ward component), with a head of steam. The speed
    // gate is real: an explosive cut from a standstill is a hesi's job.
    if (!hesitation && committed && dot < -0.4 && this.lastDirAge <= DribbleController.REVERSAL_WINDOW_SEC
        && back >= -0.92 && this.crossoverCooldown === 0 && this.movement.vel.lengthSquared() > 1) {
      crossover = true;
      this.crossoverCooldown = 0.5;
      // Skilled cut: instant redirect + burst (bypasses plant penalty).
      const top = DEFAULT_MOVEMENT.maxSpeed;
      this.movement.vel.copyFrom(dir!.scale(Math.min(top * 1.15, this.movement.vel.length() + this.crossoverBoost * (sprint ? 1.3 : 0.85))));   // DRIBBLE PACE: the turbo makes the cut violent
      this.movement.facing = Math.atan2(dir!.x, dir!.z);
    }

    // EXPLODE-OUT — the first FORWARD push inside the hesi window gets the
    // burst (dot > 0.3 against facing — a held pullback stick must not
    // explode you toward your own half). That's the separation the move
    // exists to create.
    if (!hesitation && this.hesiBoostLeft > 0 && mag > 0.5) {
      const dir = new Vector3(moveX, 0, -moveY).normalize();
      const fwd = dir.x * Math.sin(this.movement.facing) + dir.z * Math.cos(this.movement.facing);
      if (fwd > 0.3) {
        const top = DEFAULT_MOVEMENT.maxSpeed;
        this.movement.vel.copyFrom(dir.scale(Math.min(top * 1.15, this.movement.vel.length() + this.crossoverBoost)));
        this.movement.facing = Math.atan2(dir.x, dir.z);
        this.hesiBoostLeft = 0;
      }
    }

    // CHANGE OF PACE — the R2 press inside the gear-down window: the explode-out's burst along the stick (the hesi's
    // separation without the plant), and the sprint's own kick on top. Turbo makes the move: no window without a sprint
    // to let off, no burst without the press.
    if (!hesitation && !crossover && this.paceWindowLeft > 0 && sprintPress) {
      const dir = new Vector3(moveX, 0, -moveY).normalize();
      const top = DEFAULT_MOVEMENT.maxSpeed;
      this.movement.vel.copyFrom(dir.scale(Math.min(top * 1.15, this.movement.vel.length() + this.crossoverBoost)));
      this.movement.facing = Math.atan2(dir.x, dir.z);
      this.movement.noteBurst(0.5);
      this.paceWindowLeft = 0; paceChange = true;
    }
    if (crossover || hesitation) this.movement.noteBurst(sprint ? 0.5 : 0.3);   // a move is intensity too — more of it on the turbo
    this.sprintWas = sprint && mag > 0.05;
    if (committed) {
      this.lastDirX = moveX / mag; this.lastDirY = moveY / mag;
      this.lastDirAge = 0;
    }
    return { crossover, hesitation, speed01: state.speed01, facingRad: this.movement.facing, planting: state.planting, gear: state.gear ?? 'stop', intensity01: state.intensity01 ?? state.speed01, paceChange };
  }
}

// ── NEW: body collision ──────────────────────────────────────────────────
/** Push two bodies apart on XZ if they overlap. Returns true when a push
 *  happened (modes can use it for a bump sound at high closing speed). */
/**
 * TWO BODIES CANNOT BE CLOSER THAN THIS, centre to centre — `resolveBodyCollision` pushes them apart at exactly
 * `radius * 2`, so it is a hard floor on every distance measured between two players, not a tuning value.
 *
 * Exported because a rule written as if bodies could overlap is a rule that can never fire, and one had been:
 * 1v1's CHARGE_RANGE was 1.15 m, five centimetres above this floor. Measured live — a defender who held a plant
 * for 7.7 s across eight possessions never saw the driver come closer than 1.30 m, so the charge was unreachable
 * by construction while looking, in code, like a tight-but-fair window.
 */
export const BODY_STANDOFF = 1.10;

export function resolveBodyCollision(a: Vector3, b: Vector3, radius = 0.55): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const distSq = dx * dx + dz * dz;
  const minDist = radius * 2;
  if (distSq >= minDist * minDist || distSq < 1e-6) return false;
  const dist = Math.sqrt(distSq);
  const push = (minDist - dist) / 2;
  const nx = dx / dist, nz = dz / dist;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;
  return true;
}

// ── NEW: ankle-breaker ───────────────────────────────────────────────────
export const ANKLE_BREAK_RANGE = 1.6;
export const ANKLE_BREAK_STUN_SEC = 0.7;
/** A crossover thrown right in a tight defender's face breaks their ankles.
 *  The mode applies the stun (skip the defender's movement for
 *  ANKLE_BREAK_STUN_SEC and play a stagger clip). */
export function checkAnkleBreak(crossover: boolean, handler: Vector3, defender: Vector3): boolean {
  return crossover && Vector3.Distance(handler, defender) < ANKLE_BREAK_RANGE;
}

// ── Shooting ─────────────────────────────────────────────────────────────
/** `held` (2026-09-17): a FINISH whose button was still down at the clip's release frame — the layup goes up anyway, and
 *  it is not a mistimed jumper. It graded 'late' (0.30), so the most natural layup input in the game — press, hold, let
 *  the body lay it in — was the most punished: six held layups, six misses, in both court modes. A held finish is a
 *  no-timing finish: below a timed 'good', well above a mistime. */
export type ShotQuality = 'perfect' | 'good' | 'early' | 'late' | 'brick' | 'held';
export type ShotStyle = 'layup' | 'floater' | 'jumper' | 'fadeaway' | 'hook' | 'reverse' | 'mikan' | 'upAndUnder' | 'fingerRoll';   // M5 the jump hook, M11 the reverse layup, 2026-09-16 the Mikan and the up-and-under

/**
 * Which way the body is going across as it rises. 'none' is straight back or planted.
 *
 * The direction is the shot, not decoration: a fade drifting across the baseline turns the shoulders away
 * from the rim and is a harder shot than the same fade going straight back, and the body has to actually
 * drift that way for it to read.
 */
export type ShotDrift = 'left' | 'right' | 'none';

export interface ShotContext { style: ShotStyle; label: string; pctMod: number; drift: ShotDrift }

/** A floater is a paint shot: inside this floor distance of the rim (the old 4.5 m band, planar, made a 1-dribble pull-up
 *  from the elbow a floater). */
export const FLOATER_RANGE = 3.4;
/** HOOPS-MOVE-KIT-B M4/M5: what the POST asks for at the squeeze — the mode reads it off the stick while the back is to
 *  the basket (pulled away from the rim = a fade, anything else = the hook). 'none' is every face-up shot, and leaves this
 *  classifier exactly as KIT-A left it. */
export type PostShot = 'none' | 'fade' | 'hook' | 'reverse' | 'floater';
/** Type the attempt from real context. `moveVel` is the shooter's current
 *  velocity; moving away from the hoop under a tight contest = fadeaway. */
/** Inside this the drive has arrived: no stride left to take and no angle to create, just the square. */
export const MIKAN_RANGE = 1.15;
/** Past this much contest there is a hand to shield the ball from, and you lay it up instead of reaching. */
export const FINGER_ROLL_MAX_CONTEST = 0.2;
/** …and a finger roll is taken ON THE MOVE. Standing under the rim, it is a layup or a Mikan. */
export const FINGER_ROLL_MIN_SPEED = 3.2;
/** Below this the body is not drifting, it is standing still with a wobble. */
export const FADE_SPEED = 1.2;
/**
 * How much of the drift has to be sideways before a fade is a BASELINE fade.
 *
 * A fraction of the away-component, so it scales: a body drifting hard away and slightly across is still a
 * straight fade, and one sliding across the baseline while giving a little ground is the Kobe shot.
 */
export const BASELINE_FADE_RATIO = 0.6;

/** Which way `vel` is going across, seen by a shooter facing `toHoop`. */
export function driftOf(moveVel: Vector3, toHoop: Vector3, awaySpeed: number): ShotDrift {
  const flat = new Vector3(toHoop.x, 0, toHoop.z);
  if (flat.lengthSquared() < 1e-6) return 'none';
  flat.normalize();
  // the repo's convention: for a facing (fx, fz), the shooter's right is (fz, -fx)
  const lateral = moveVel.x * flat.z - moveVel.z * flat.x;
  if (Math.abs(lateral) < Math.max(0.35, awaySpeed * BASELINE_FADE_RATIO)) return 'none';
  return lateral > 0 ? 'right' : 'left';
}

export function classifyShot(shooter: Vector3, moveVel: Vector3, hoop: Vector3, contest01: number, post: PostShot = 'none'): ShotContext {
  // HOOPS-MOVE-KIT-A (2026-09-08): PLANAR. This was Vector3.Distance against a rim 3.05 m up, so a floor-bound shooter was
  // never inside the 2.2 m layup band (√(2.2² − 3.05²) is imaginary) — every shot at the rim classified as a FLOATER and
  // the layup style had never fired in play (the drive-dunk gate had the identical bug, fixed in the modes in A+ P0).
  const dist = distXZ(shooter, hoop);
  const toHoop = hoop.subtract(shooter); toHoop.y = 0;
  const speed = moveVel.length();
  const toHoopLen = toHoop.length() || 1;
  /** Metres per second the body is giving ground. Negative means driving in. */
  const awaySpeed = -Vector3.Dot(moveVel, toHoop) / toHoopLen;
  const movingAway = speed > FADE_SPEED && awaySpeed > 0.3 * speed;
  const drift = movingAway ? driftOf(moveVel, toHoop, awaySpeed) : 'none';

  // HOOPS-MOVE-KIT-B: the post's own two shots come first — a body with its back to the basket is not taking a layup
  if (post === 'fade') return { style: 'fadeaway', label: 'FADEAWAY', pctMod: 0.86, drift };   // the lean costs a little; the separation is what you paid for
  if (post === 'hook') return { style: 'hook', label: 'JUMP HOOK', pctMod: 1.06, drift: 'none' };      // quick, shielded, from the block
  // M11 the drive that goes UNDER the rim finishes on the far side, off the glass; M10 a protected rim is a floater over
  // the length rather than a layup into a chest
  if (post === 'reverse') return { style: 'reverse', label: 'REVERSE', pctMod: 1.1, drift: 'none' };
  if (post === 'floater') return { style: 'floater', label: 'FLOATER', pctMod: 1.0, drift: 'none' };

  // THE RUNNING FADEAWAY, EITHER DIRECTION, FROM ANYWHERE (owner, 2026-09-13).
  //
  // This used to require `contest01 > 0.25`, so a fade only existed when somebody was already on you — you
  // could not simply rise and fade off the dribble, which is the shot the owner asked for by name. The
  // separation is the POINT of the shot, so demanding a defender before allowing it had it backwards: you
  // fade to create the space, not because the space is gone.
  //
  // It is now purely a movement read (giving ground at speed), it works at any range, and it carries the
  // direction. Drifting across rather than straight back turns the shoulders away from the rim and is the
  // harder shot — that is the baseline fade, and it costs more than the straight one.
  if (movingAway) {
    if (drift !== 'none') {
      return {
        style: 'fadeaway',
        label: `BASELINE FADE — ${drift === 'right' ? 'RIGHT' : 'LEFT'}`,
        pctMod: 0.78,
        drift,
      };
    }
    return { style: 'fadeaway', label: 'FADEAWAY', pctMod: 0.84, drift: 'none' };
  }

  // UNDER THE RING IS ITS OWN SHOT (2026-09-16). Inside MIKAN_RANGE there is no stride left to take and no angle to
  // create: the knee goes up, the ball goes up the middle off the square, and you land ready to go again. It is the
  // highest-percentage shot in the game and the easiest to block, which is the trade — see AI_BLOCK_BASE.
  if (dist < MIKAN_RANGE) return { style: 'mikan', label: 'MIKAN', pctMod: 1.26, drift: 'none' };
  // AN EMPTY LANE IS A DIFFERENT SHOT. Arriving at the rim at speed with nobody home, you do not shield the ball
  // and lay it against the glass — you reach past the iron and roll it off the fingers. Same band as the layup,
  // and the read that separates them is the only one that matters here: whether anybody is there.
  if (dist < 2.2 && contest01 <= FINGER_ROLL_MAX_CONTEST && speed >= FINGER_ROLL_MIN_SPEED) {
    return { style: 'fingerRoll', label: 'FINGER ROLL', pctMod: 1.22, drift: 'none' };
  }
  if (dist < 2.2) return { style: 'layup', label: 'LAYUP', pctMod: 1.18, drift: 'none' };
  if (dist < FLOATER_RANGE) return { style: 'floater', label: 'FLOATER', pctMod: 1.0, drift: 'none' };
  return { style: 'jumper', label: 'JUMPER', pctMod: 0.95, drift: 'none' };
}

export class ShotMeter {
  active = false;
  t = 0;
  private duration = 0.72;
  private greenCenter = 0.62;
  private greenHalfWidth = 0.09;
  /** HOOPS-MOVE-KIT-A: the gather's share of the meter (seconds) and the rise's own duration (what the clip is paced to). */
  private gather = 0;
  private rise = 0.72;
  /** What kind of shot this bar belongs to — the auto-release at the end is graded differently for a FINISH. */
  private style: ShotStyle = 'jumper';

  /** A tight defender narrows the window and speeds the rise; shot style tunes it further (layups quick and forgiving,
   *  floaters between, fadeaways demanding). `gatherSec` (HOOPS-MOVE-KIT-A M1) puts the player's gather INSIDE the meter:
   *  the bar runs from the squeeze, the green sits at the rise's 0.62 AFTER the gather (the same width in seconds), so a
   *  pull-up's release frame — the clip paced to `riseSec` and started when the gather ends — is where the green is. */
  start(contestLevel01: number, style: ShotStyle = 'jumper', gatherSec = 0): void {
    this.active = true; this.t = 0; this.style = style;
    let rise = 0.72 - contestLevel01 * 0.22;
    let half = Math.max(0.035, 0.09 - contestLevel01 * 0.05);
    // a layup is a quick finish off the stride (it used to run 0.8 s — longer than a jumper — on the jumpshot's meter)
    if (style === 'layup') { half = Math.max(0.05, half) * 1.5; rise = 0.55 - contestLevel01 * 0.1; }
    if (style === 'floater') { half *= 1.2; rise = 0.6 - contestLevel01 * 0.12; }
    // HOOPS-MOVE-KIT-B M5: the jump hook is a QUICK release off the block — short, and no harder than a jumper to time
    if (style === 'hook') { half = Math.max(0.05, half) * 1.25; rise = 0.52 - contestLevel01 * 0.08; }
    if (style === 'reverse') { half = Math.max(0.05, half) * 1.4; rise = 0.58 - contestLevel01 * 0.1; }   // M11: a layup's forgiveness, a beat longer under the rim
    // the Mikan is a flick under the ring — quick and forgiving, because the defence it beats is time, not a hand
    if (style === 'mikan') { half = Math.max(0.055, half) * 1.6; rise = 0.42 - contestLevel01 * 0.06; }
    // the roll is a layup's forgiveness with a beat more reach in it
    if (style === 'fingerRoll') { half = Math.max(0.05, half) * 1.45; rise = 0.6 - contestLevel01 * 0.1; }
    // the up-and-under is the LONGEST bar in the game and a third of it is the fake. That length is the risk: a
    // defender who does not bite has all of it to recover, which is why the reward (AI_BLOCK_BASE 0.04) is what it is.
    if (style === 'upAndUnder') { half = Math.max(0.05, half) * 1.15; rise = 0.86 - contestLevel01 * 0.1; }
    if (style === 'fadeaway') { half *= 0.75; rise -= 0.06; }
    const g = Math.max(0, gatherSec);
    this.rise = rise; this.gather = g;
    this.duration = rise + g;
    this.greenCenter = (g + 0.62 * rise) / this.duration;
    this.greenHalfWidth = half * rise / this.duration;
  }
  update(dt: number): number {
    if (!this.active) return 0;
    this.t = Math.min(1, this.t + dt / this.duration);
    return this.t;
  }
  /** Meter pacing, exposed for ShotReleaseSync (BallHandling.ts). */
  get durationSec(): number { return this.duration; }
  get greenCenter01(): number { return this.greenCenter; }
  get greenHalfWidth01(): number { return this.greenHalfWidth; }
  /** The gather's seconds at the front of the meter, and the rise's own seconds (pace the shot clip to THIS, not durationSec). */
  get gatherSec(): number { return this.gather; }
  get riseSec(): number { return this.rise; }
  /** 0..1 of the meter at which the gather ends and the rise starts. */
  get gatherEnd01(): number { return this.duration > 0 ? this.gather / this.duration : 0; }

  /** Release NOW — call on the actionEdge; returns the quality band. */
  release(): ShotQuality {
    this.active = false;
    const d = this.t - this.greenCenter;
    if (Math.abs(d) <= this.greenHalfWidth * 0.35) return 'perfect';
    if (Math.abs(d) <= this.greenHalfWidth) return 'good';
    if (d < 0) return 'early';
    // YOU CANNOT HOLD A LAYUP. A meter that runs all the way out is a shot the player never released, and for a
    // jumper that is exactly a brick — you stood there with the ball over your head. A FINISH is not that shape: the
    // body is already in the air off a clip whose release key IS the green (see startFinish), the hand passes the rim
    // whether or not the trigger comes up, and the bar itself is 0.45–0.55 s against a jumper's 0.72 — the shortest
    // in the game, entered automatically by classifyShot, with no cue that it just got a third shorter.
    //
    // Graded as a brick that was a 4 % shot, so holding a hair too long at the rim was a guaranteed miss: measured
    // 0 for 4 on layups that all peaked at 0.99–1.00, every one of them a LAYUP — LEFT/RIGHT that reached the iron.
    // A late layup is a bad shot, not an impossible one; 'late' is 0.3, and the 1.18 layup modifier carries it to
    // about a third. The demanding shots keep the brick, because standing up out of a fadeaway IS a thrown-away ball.
    // A FINISH past its green is UNTIMED, not mistimed: the layup goes up off the gather stride whether the button came
    // up a beat late or never came up at all, and 'late' (0.30) for a beat late while a hold-through scored 'held'
    // (0.62) made letting go the worse input. A jumper past its green is still a late jumper, and at the end a brick.
    const finish = this.style !== 'jumper' && this.style !== 'fadeaway';
    if (finish) return 'held';
    return this.t >= 1 ? 'brick' : 'late';
  }
}
export const SHOT_QUALITY_PCT: Record<ShotQuality, number> = {
  perfect: 0.97, good: 0.8, early: 0.35, late: 0.3, brick: 0.04, held: 0.62,
};

// ── AI: defender ─────────────────────────────────────────────────────────
/**
 * Push away from anyone standing on top of you.
 *
 * Both brains steered toward a single ideal point and nothing else, so every AI
 * that shared a goal converged on the same square metre and body collision then
 * jammed them into a heap. Real spacing is a repulsion term, not a nicer target.
 */
function separation(self: Vector3, others: Vector3[], minDist: number): Vector3 {
  const push = new Vector3(0, 0, 0);
  for (const o of others) {
    if (o === self) continue;
    const away = self.subtract(o);
    away.y = 0;
    const d = away.length();
    if (d > 1e-3 && d < minDist) push.addInPlace(away.normalize().scale((minDist - d) / minDist));
  }
  return push;
}

/** Turn a desired world-space direction into an Intent, with a dead zone. */
function steer(to: Vector3, sprint: boolean, deadZone: number, steal = false): Intent {
  to.y = 0;
  const dist = to.length();
  if (dist < deadZone) {
    return { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal };
  }
  const dir = to.normalize();
  return { moveX: dir.x, moveY: -dir.z, sprint, action: false, actionHeld: 0, pass: false, steal };
}

export class DefenderBrain implements AIBehavior {
  /** Ball position last frame — the brain slides with the HANDLER's speed,
   *  and the ball is the only handler telemetry an AIBehavior gets. */
  private prevBall: Vector3 | null = null;
  /** How long the ball has been stationary — a standing handler is an
   *  invitation to pressure. */
  private stillSec = 0;
  /** Handler body position last frame (press clock + slide lever). */
  private prevHandler: Vector3 | null = null;

  /** Ball still this long → the on-ball defender steps UP into the handler
   *  instead of holding the cushion. */
  static readonly PRESS_AFTER_SEC = 0.6;

  /**
   * @param markIndex which opponent this defender is assigned to. Null keeps the
   *   old ball-chasing behaviour, which is correct for a 1v1 mode with a single
   *   defender and disastrous with three: all three computed the SAME deny point
   *   between the ball and the rim and piled onto it, leaving every other
   *   attacker completely unguarded. Basketball defenders match up.
   */
  constructor(private aggression = 0.6, private markIndex: number | null = null) {}
  /** Re-mark this defender (the scram switch, lib/babylon/core/Matchups.ts). */
  setMark(index: number | null): void { this.markIndex = index; }
  get mark(): number | null { return this.markIndex; }
  // ── HOOPS-MOVE-KIT-A O1–O3 ──
  /** The man to BOX OUT (a shot is up): the seal between him and the rim; null = play. */
  private boxTarget: Vector3 | null = null;
  /** Fight OVER a screen (toward the ball) or go UNDER — picked per screen, kept while the screener is there. */
  private over = true; private navigating = 0; private prevFoes: Vector3[] = [];
  /** The job this frame, for the mode's stance / facing / probes. */
  job: DefenseJob = 'deny';
  private closingOut = false;   // DEFENSE-LOOK: the closeout is sticky until he is on the man
  /** The objective the job faces (the handler, the boxed man, the ball). */
  objective: Vector3 | null = null;
  boxOut(mark: Vector3 | null): void { this.boxTarget = mark ? mark.clone() : null; }
  get boxing(): boolean { return this.boxTarget !== null; }
  /** The ball is LOOSE on the floor — go and get it. Outranks the seal, because a seal you hold while
   *  the ball rolls away unclaimed is not defence. Null = back to the normal job. */
  private chaseTarget: Vector3 | null = null;
  chaseBall(at: Vector3 | null): void { this.chaseTarget = at ? at.clone() : null; }
  get chasing(): boolean { return this.chaseTarget !== null; }

  decide(dt: number, self: Vector3, ball: Vector3, hoop: Vector3, allies: Vector3[] = [], foes: Vector3[] = []): Intent {
    const mark = this.markIndex !== null ? foes[this.markIndex] ?? null : null;
    const markHasBall = mark ? distXZ(mark, ball) < 1.8 : false;
    // A LIVE BALL outranks everything. Measured in 3v3: after a miss every one of the six bodies sat
    // 8-19 m from the ball holding its seal or its crash lane, and the board fell through to the dice
    // roll — because no job in the system meant "go and get the actual ball".
    if (this.chaseTarget) {
      this.job = 'chase'; this.objective = this.chaseTarget;
      return steer(this.chaseTarget.subtract(self), true, 0.6);
    }
    // O2 BOX OUT — a shot is up: seal the man between him and the rim, chest on him; nothing else matters
    if (this.boxTarget) {
      const { spot } = boxOutSpot(this.boxTarget, hoop);
      this.job = 'boxout'; this.objective = this.boxTarget;
      const to = spot.subtract(self);
      return steer(to, false, 0.25);
    }
    // O1 NAVIGATE — a set attacker (not the handler) planted between me and where I am going: fight over or go under
    const foeSpeeds = foes.map((f, i) => this.prevFoes[i] && dt > 1e-4 ? distXZ(f, this.prevFoes[i]) / dt : 9);
    this.prevFoes = foes.map((f) => f.clone());

    // Two different speeds, two different jobs:
    //   ballDelta — the BALL's motion. Off-ball defenders need this too:
    //     a drive IS the ball moving fast at the rim, and help rotation
    //     dies without it (measured: the low man read ballSpeed 0 and held
    //     his mark through every drive). Hand sway rides along but stays
    //     well under the drive threshold.
    //   handlerSpeed — the handler's BODY. Used for the press clock and the
    //     slide lever, where idle hand sway would read as perpetual motion.
    const onBall = !mark || markHasBall;
    const ballDelta = this.prevBall && dt > 1e-4 ? Vector3.Distance(ball, this.prevBall) / dt : 0;
    this.prevBall = ball.clone();
    const handlerPos = onBall ? (mark ?? foes[0] ?? null) : null;
    const handlerSpeed = handlerPos && this.prevHandler && dt > 1e-4
      ? Vector3.Distance(handlerPos, this.prevHandler) / dt : 0;
    if (handlerPos) this.prevHandler = handlerPos.clone();

    this.stillSec = onBall && handlerSpeed < 0.5 ? this.stillSec + dt : 0;

    // PRESSURE — a handler standing still gets stepped into. Without this the
    // on-ball defender parked at its deny point forever (measured: ~2m off,
    // never closing, never in poke range), so fakes had nothing to beat and
    // standing with the ball was free. The press also puts the steal roll in
    // range — holding the ball should be dangerous.
    const press = onBall && this.stillSec > DefenderBrain.PRESS_AFTER_SEC;

    // HELP DEFENCE — the low man rotates to a drive. When the ball is inside
    // ~4m of the rim and moving fast (a drive, not a pass — pass flight is
    // faster), the off-ball defender CLOSEST to the rim steps into the lane
    // and the others stay home. This is the rotation that makes the kick-out
    // the right read: beat your man and the rim is NOT empty; the open man
    // is the helper's man. Without it (measured): beat your mark and the
    // drive was a layup line, every time, because all three defenders held
    // their own matchup no matter how beaten it was.
    let helping = false;
    if (!onBall && mark) {
      const driving = distXZ(ball, hoop) < 4.2 && ballDelta > 3;
      if (driving) {
        // "Low man" = the off-ball defender closest to the rim. The beaten
        // on-ball defender is excluded from that comparison — he's behind the
        // drive, and counting him means nobody ever rotates (he is, by
        // definition, the closest defender to the rim on a drive).
        const beatenMan = allies.reduce<number>((m, a) => Math.min(m, distXZ(a, ball)), Infinity);
        const myDist = distXZ(self, hoop);
        const nearestHelper = allies.reduce<number>((m, a) =>
          distXZ(a, ball) <= beatenMan + 1e-6 ? m : Math.min(m, distXZ(a, hoop)), Infinity);
        helping = myDist < 4 && myDist <= nearestHelper;
      }
    }

    // On the ball: stay between the handler and the rim, DROPPING DEEPER as
    // the attack speeds up (contain first, contest second) — or STEPPING IN
    // when the handler stands on the ball. Off the ball: stay between YOUR
    // man and the rim, shaded toward the ball — help-side defence, which is
    // what stops three defenders being in the same place.
    //
    // The on-ball dead zone also used to be 1.4m — so wide that the defender
    // never adjusted at all: measured live, the 1v1 defender moved < 1m in
    // an entire possession and could never be caught closing (which the hesi
    // bite needs). A statue can't bite on a fake; a sliding defender can.
    const anchor = onBall ? ball : mark!;
    // DEFENSE-LOOK (2026-09-17). Two reads a real defender makes that this one never did:
    //   BEATEN — the handler is nearer the rim than I am: stop guarding the spot he left, RECOVER toward the rim at a run
    //            (the deny point drops to the rim side of him) with the chest still on him — the backpedal.
    //   CLOSEOUT — he has the ball with space and is not moving: the deny point is a run away; sprint it, and the tree
    //            chops the last two metres under a high hand (the mode reads `job === 'closeout'`).
    const handlerDist = distXZ(self, ball);
    const beaten = onBall && distXZ(ball, hoop) < distXZ(self, hoop) - 0.4 && handlerDist > 0.8;
    // sticky: a closeout that started keeps going until he is on the man (measured without it: closeout ↔ onball flipping
    // every frame as the distance crossed 2.6 m, and the tree with it)
    const closingOut = onBall && !beaten && (this.closingOut ? handlerDist > 1.5 : handlerDist > 2.6 && handlerSpeed < 0.9);
    this.closingOut = closingOut;
    const lever = beaten ? 0.6 : press ? 0.12 : onBall ? 0.35 + Math.min(1, handlerSpeed / 6) * 0.25 : 0.30;
    let denyPoint = Vector3.Lerp(anchor, hoop, lever);
    if (!onBall) denyPoint = Vector3.Lerp(denyPoint, ball, 0.22);
    if (helping) denyPoint = Vector3.Lerp(hoop, ball, 0.2);   // the low man steps INTO the drive

    const to = denyPoint.subtract(self);
    to.addInPlace(separation(self, allies, 2.0).scale(1.4));
    let fighting = false;
    for (let i = 0; i < foes.length; i++) {
      if (foes[i] === mark || distXZ(foes[i], ball) < 1.2 || foeSpeeds[i] > 0.6) continue;   // the handler and moving bodies are not screens
      const nav = navigateAround(self, denyPoint, foes[i], ball, this.over);
      if (nav) { if (this.navigating <= 0) this.over = Math.random() < 0.6; this.navigating = 0.5; to.addInPlace(nav.scale(1.6)); fighting = true; break; }
    }
    this.navigating = Math.max(0, this.navigating - dt);
    this.job = fighting ? 'navigate' : helping ? 'help' : beaten ? 'recover' : closingOut ? 'closeout' : onBall ? 'onball' : 'deny';
    this.objective = onBall ? (mark ?? ball) : ball;
    // PLANAR distance. Vector3.Distance includes Y, and the deny point's Y
    // is lerped toward the rim (y=3.05) while the defender's feet are at 0 —
    // so `dist` carried ~1.3m of phantom altitude and the steal gate
    // (dist < 1.1) could never open. Measured live: press active, defender
    // parked 0.9m off the handler, zero steal rolls in 12 seconds. The poke
    // had never fired in any game this mode has played.
    const dist = distXZ(denyPoint, self);
    // The press needs its own dead zone: the normal 0.6m settle stopped the
    // approach 0.6m short of the press point, which parked the defender at
    // ~1.4m — just OUTSIDE poke range (1.1m). Pressure without arrival is a
    // statue with intent. Measured live: never stripped, never stole.
    const out = steer(to, (dist > 3 || beaten || closingOut) && !fighting, press ? 0.2 : onBall ? 0.6 : 1.4,
      onBall && dist < 1.1 && Math.random() < this.aggression * 0.02);
    if (fighting && this.over) { out.moveX *= 0.7; out.moveY *= 0.7; }   // fighting OVER the screen costs speed (FIGHT_SLOW)
    return out;
  }
  /** Fighting over / under this frame (for the mode's marks). */
  get fightingOver(): boolean | null { return this.navigating > 0 ? this.over : null; }
}

/** How contested is `ballHandler` right now, 0..1 — feeds ShotMeter.start(). */
export function contestLevel(ballHandler: Vector3, defender: Vector3 | null): number {
  if (!defender) return 0;
  const d = Vector3.Distance(ballHandler, defender);
  return Math.max(0, Math.min(1, 1 - d / 2.2));
}

// ── AI: teammate (3v3) ──────────────────────────────────────────────────
/** Simple spacing: hold a lane away from the ball-handler and defenders,
 *  cut to the hoop when a lane opens. Good enough to read as "playing team
 *  ball" without needing a full playbook system. */
export class TeammateBrain implements AIBehavior {
  constructor(private slotAngle: number, private holdRadius = 5.5) {}
  // ── HOOPS-MOVE-KIT-A O1–O3: one JOB per possession, readable ──
  /** The job the mode hands this body for the possession ('screen' runs the screen state machine; 'crash' on a shot). */
  job: OffenseJob = 'space';
  /** The screen's state while the job is 'screen' / 'roll' / 'pop'. */
  screen: ScreenState = { ...SCREEN_IDLE };
  /** The objective the job faces (the screened defender, the rim, the ball). */
  objective: Vector3 | null = null;
  /** The defender being screened (the handler's man), for the mode's facing / marks. */
  screened: Vector3 | null = null;
  setJob(job: OffenseJob): void { this.job = job; if (job === 'screen') this.screen = { ...SCREEN_IDLE, side: 1 }; }
  /** O2: on THEIR shot, seal this man (the seal between him and the rim); null = play. */
  private boxTarget: Vector3 | null = null;
  boxOut(mark: Vector3 | null): void { this.boxTarget = mark ? mark.clone() : null; }
  get boxing(): boolean { return this.boxTarget !== null; }
  /** The ball is LOOSE — crash it for real instead of holding a lane near where it might land. */
  private chaseTarget: Vector3 | null = null;
  chaseBall(at: Vector3 | null): void { this.chaseTarget = at ? at.clone() : null; }
  get chasing(): boolean { return this.chaseTarget !== null; }

  decide(dt: number, self: Vector3, ball: Vector3, hoop: Vector3, allies: Vector3[] = [], foes: Vector3[] = []): Intent {
    const lane = new Vector3(Math.sin(this.slotAngle), 0, Math.cos(this.slotAngle));
    const spot = hoop.add(lane.scale(this.holdRadius));
    // a loose ball beats the crash lane: the lane is a guess about where it will land, the ball is where it IS
    if (this.chaseTarget) {
      this.job = 'chase'; this.objective = this.chaseTarget; this.screened = null;
      const to = this.chaseTarget.subtract(self);
      to.addInPlace(separation(self, allies, 1.6).scale(0.8));   // six bodies must not stack on one ball
      return steer(to, true, 0.6);
    }
    if (this.boxTarget) {   // O2 BOX OUT on their shot
      this.job = 'boxout'; this.objective = this.boxTarget; this.screened = null;
      return steer(boxOutSpot(this.boxTarget, hoop).spot.subtract(self), false, 0.25);
    }
    // O2 CRASH — a shot is up: to the crash lane on my side
    if (this.job === 'crash') {
      this.objective = hoop; this.screened = null;
      const to = crashSpot(self, hoop).subtract(self);
      to.addInPlace(separation(self, allies, 2.0).scale(1.2));
      return steer(to, true, 0.4);
    }
    // O1 SCREEN — to the handler's defender's shoulder, plant, then roll / pop
    if (this.job === 'screen' || this.job === 'roll' || this.job === 'pop') {
      const handler = ball;
      const def = foes.reduce<Vector3 | null>((b, f) => !b || distXZ(f, handler) < distXZ(b, handler) ? f : b, null);
      const farEnough = distXZ(handler, hoop) >= SCREEN_MIN_RIM_DIST;
      if (def && (farEnough || this.screen.phase === 'set' || this.screen.phase === 'roll' || this.screen.phase === 'pop') && this.screen.phase !== 'done') {
        const side = this.screen.side === -1 || this.screen.side === 1 ? (this.screen.phase === 'approach' ? pickScreenSide(handler, hoop) : this.screen.side) : 1;
        const sSpot = screenSpot(def, handler, hoop, side);
        const laneOpen = rollLaneOpen(self, hoop, foes);
        this.screen = stepScreen({ ...this.screen, side }, dt, self, sSpot, handler, hoop, laneOpen);
        this.screened = def;
        if (this.screen.phase === 'approach') { this.objective = def; const to = sSpot.subtract(self); return steer(to, distXZ(self, sSpot) > 2.5, 0.2); }
        if (this.screen.phase === 'set') { this.objective = def; this.job = 'screen'; return steer(new Vector3(0, 0, 0), false, 1); }   // PLANTED
        if (this.screen.phase === 'roll') { this.job = 'roll'; this.objective = hoop; const to = rollTarget(self, hoop).subtract(self); return steer(to, true, 0.5); }
        if (this.screen.phase === 'pop') { this.job = 'pop'; this.objective = ball; const to = spot.subtract(self); return steer(to, false, 0.6); }
      }
      // the screen is over (or the handler is inside the paint): back to spacing
      this.job = 'space'; this.screened = null;
    }

    // if the lane to the hoop is clear, cut hard
    const nearestFoe = foes.reduce<number>((m, f) => Math.min(m, Vector3.Distance(f, self)), 99);
    const cutting = nearestFoe > 3.2 && Vector3.Distance(self, ball) < 8;
    this.job = cutting ? 'cut' : 'space';
    this.objective = cutting ? hoop : ball; this.screened = null;

    // A cut used to target the hoop EXACTLY, so both teammates cut to the same
    // point and arrived stacked on each other. Each cuts to its own side of the
    // rim instead, along the lane it was already holding.
    const target = cutting ? hoop.add(lane.scale(1.7)) : spot;

    const to = target.subtract(self);
    // ...and hold the floor open regardless: allies never share a square metre.
    to.addInPlace(separation(self, allies, 3.0).scale(1.8));
    return steer(to, cutting, 0.6);
  }
}

// ── The three-point line ─────────────────────────────────────────────────
// The real NBA arc is NOT a constant radius: 6.71m in the corners, 7.24m at the
// top. That difference is the whole reason a corner three is the shot everyone
// wants and the top of the key is the hard one. 3PT learned this the hard way —
// a single flat radius was its D1 — and 3v3 then made the identical mistake with
// its own `THREE_POINT_RADIUS = 6.75`, because the knowledge lived in
// ThreePointMode instead of in the shared basketball core. It lives here now.
export const THREE_CORNER_R = 6.71;
export const THREE_TOP_R = 7.24;

/** Radius of the arc at a given angle: corner distance at the ends, top at 90 deg. */
export function threePointRadius(angleRad: number): number {
  // sin peaks at 90 deg (top of the key) and falls to 0.5 at the 30/150 corners.
  const t = (Math.sin(angleRad) - 0.5) / 0.5;
  return THREE_CORNER_R + (THREE_TOP_R - THREE_CORNER_R) * Math.max(0, Math.min(1, t));
}

/** Is a shot from `pos` behind the arc around `rim`? Angle-aware, not a circle. */
export function isThree(pos: Vector3, rim: Vector3): boolean {
  const dx = pos.x - rim.x;
  const dz = pos.z - rim.z;
  const dist = Math.hypot(dx, dz);
  return dist > threePointRadius(Math.atan2(dz, dx));
}

// ── Court helpers ────────────────────────────────────────────────────────
export function clampToHalfCourt(pos: Vector3, halfWidth: number, depth: number): void {
  pos.x = Math.max(-halfWidth, Math.min(halfWidth, pos.x));
  pos.z = Math.max(0.5, Math.min(depth, pos.z));
}

/** Planar (XZ) distance. Basketball spacing is a floor game: the rim floats
 *  at 3.05m and the ball rides a hand at ~1.2m, so 3D distance to either
 *  carries phantom altitude. Every "how far apart are these players / how
 *  far from the rim" question on defence wants THIS, not Vector3.Distance —
 *  two separate gates (the steal roll, the help rotation) were silently
 *  dead until their distance math went planar. */
export function distXZ(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ── NEW (v3): turbo ──────────────────────────────────────────────────────
/** Sprint fuel. Modes call gate() every frame with the player's wish; it
 *  returns whether sprint is actually allowed and burns/regens the tank.
 *  Empty tank must fall to 25% before sprint re-arms (no flutter). */
export class TurboMeter {
  t01 = 1;
  private rearming = false;
  gate(dt: number, wantSprint: boolean, moving: boolean): boolean {
    if (this.rearming && this.t01 >= 0.25) this.rearming = false;
    const canSprint = wantSprint && moving && !this.rearming && this.t01 > 0;
    if (canSprint) {
      this.t01 = Math.max(0, this.t01 - 0.34 * dt);
      if (this.t01 === 0) this.rearming = true;
    } else {
      this.t01 = Math.min(1, this.t01 + 0.18 * dt);
    }
    return canSprint;
  }
}

// ── NEW (v3): the ball flight arc ────────────────────────────────────────
/** Parabolic flight from the release point to the rim (or a front-rim
 *  clang point for misses). Pure visual sell — the make/miss is decided at
 *  release; step() returns 'flying' | 'made' | 'missed' when it lands. */
export class ShotArc {
  private from = new Vector3();
  private to = new Vector3();
  private t = 0;
  private duration = 0.65;
  private apex = 1.6;
  active = false;
  private made = false;
  /** NET EXIT (2026-09-17): the style this arc was started with — the make's exit speed reads it. */
  shotStyle: ShotStyle = 'jumper';

  /** HOOPS-MOVE-KIT-B M12: the glass point the ball is routed through on an intentional BANK — set with `bank`, cleared
   *  on any other shot. A banked ball is a quadratic Bezier from → glass → rim: it goes UP AND OUT to the square, kisses
   *  it and drops, instead of the straight parabola every shot in the game shared. */
  private glass: Vector3 | null = null;
  start(from: Vector3, rim: Vector3, made: boolean, style: ShotStyle, apexAdd = 0, bank: Vector3 | null = null): void {
    this.from.copyFrom(from);
    this.made = made; this.shotStyle = style;
    this.glass = bank ? bank.clone() : null;
    this.to.copyFrom(rim);
    if (!made) {                       // clang point on the front of the iron
      this.to.x += (Math.random() - 0.5) * 0.3;
      this.to.z += 0.22;
    }
    const dist = Vector3.Distance(from, rim);
    this.duration = style === 'layup' || style === 'reverse' ? 0.4 : Math.min(0.9, 0.45 + dist * 0.045);
    // HOOPS-MOVE-KIT-B: a hook goes UP and over the shoulder (a high soft arc off the block); a fadeaway is a longer,
    // higher ball because the body is falling away from the rim as it leaves
    this.apex = (style === 'floater' ? 2.2 : style === 'layup' || style === 'reverse' ? 0.9 : style === 'hook' ? 2.0 : style === 'fadeaway' ? 1.85 : 1.6) + apexAdd;   // HOOPS-MOVE-KIT-A D3: an ALTERED release arcs higher
    this.t = 0;
    this.active = true;
  }

  step(dt: number, ball: Vector3): 'flying' | 'made' | 'missed' {
    if (!this.active) return 'flying';
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = this.t;
    if (this.glass) {
      // M12: the ball is thrown AT the square and comes off it — two legs, not one curve that merely leans at the board.
      // (A quadratic Bezier never reaches its control point: measured, the "bank" never got behind the ring at all.)
      const BANK_K = 0.62;
      if (k <= BANK_K) {
        const u = k / BANK_K;
        ball.x = this.from.x + (this.glass.x - this.from.x) * u;
        ball.z = this.from.z + (this.glass.z - this.from.z) * u;
        ball.y = this.from.y + (this.glass.y - this.from.y) * u + Math.sin(u * Math.PI) * this.apex * 0.55;
      } else {
        const u = (k - BANK_K) / (1 - BANK_K);
        ball.x = this.glass.x + (this.to.x - this.glass.x) * u;
        ball.z = this.glass.z + (this.to.z - this.glass.z) * u;
        ball.y = this.glass.y + (this.to.y - this.glass.y) * u + Math.sin(u * Math.PI) * 0.06;   // off the glass and down
      }
    } else {
    ball.x = this.from.x + (this.to.x - this.from.x) * k;
    ball.z = this.from.z + (this.to.z - this.from.z) * k;
    ball.y = this.from.y + (this.to.y - this.from.y) * k + Math.sin(k * Math.PI) * this.apex;
    }
    if (this.t >= 1) {
      this.active = false;
      return this.made ? 'made' : 'missed';
    }
    return 'flying';
  }
}

// ── NEW (v3): drive dunks ────────────────────────────────────────────────
export type DriveDunkKind = 'none' | 'dunk' | 'poster' | 'standing';   // 'standing' (DEFENSE-LOOK, 2026-09-17): R2 + Square under the rim with no run-up
export const DUNK_RANGE = 2.8;
export const DUNK_MIN_SPEED = 3.4;
export const DUNK_MIN_TURBO = 0.25;
export const STANDING_DUNK_RANGE = 1.6;      // inside this, turbo + shoot with no run-up is a two-foot standing dunk
/** Attacking the rim at speed with turbo converts the attempt to a dunk;
 *  a defender parked inside the drive line makes it a posterize attempt. */
export function checkDriveDunk(shooter: Vector3, vel: Vector3, hoop: Vector3, turbo01: number, defender: Vector3 | null): DriveDunkKind {
  // PLANAR, like classifyShot above, and for the same reason. This measured a 3-D distance, which made the gate
  // depend on how high off the floor the two points were: hand a caller a real rim (y 3.05) and 2.8 m of range is
  // imaginary, so the dunk could never fire — the bug A+ P0 worked around by passing RIM_FLOOR from both modes
  // instead of fixing it here. That left the same trap armed for the next caller, and it ALSO cost the live modes a
  // dunk at the worst moment: the shooter's own y climbs as he gathers, so a drive that qualified on the floor could
  // fall out of range in the air, which is exactly when the gate is read.
  const dist = distXZ(shooter, hoop);
  // THE STANDING DUNK (DEFENSE-LOOK, 2026-09-17). Under the rim with turbo held and the shoot button, a body that is NOT
  // running is asking for a two-foot dunk — the gate demanded DUNK_MIN_SPEED and gave him a layup instead. A defender on
  // him makes it a poster like any other.
  if (dist <= STANDING_DUNK_RANGE && turbo01 >= DUNK_MIN_TURBO && vel.length() < DUNK_MIN_SPEED) return defender && distXZ(defender, shooter) < 1.5 ? 'poster' : 'standing';
  if (dist > DUNK_RANGE || vel.length() < DUNK_MIN_SPEED || turbo01 < DUNK_MIN_TURBO) return 'none';
  const toHoop = hoop.subtract(shooter); toHoop.y = 0;
  if (Vector3.Dot(vel, toHoop) <= 0) return 'none';                 // must be attacking, not retreating
  if (defender && distXZ(defender, shooter) < 1.5) return 'poster';
  return 'dunk';
}
export const DUNK_PCT: Record<Exclude<DriveDunkKind, 'none'>, number> = { dunk: 0.92, poster: 0.78, standing: 0.95 };   // a standing flush under the rim is the surest shot there is

// ── NEW (v3): shot blocking ──────────────────────────────────────────────
export const BLOCK_RANGE = 1.5;
export const BLOCK_WINDOW_SEC = 0.4;
/** A contest jump erases the shot when the blocker is in range AND jumped
 *  within the window before the release. `jumpAgeSec` = time since the
 *  blocker left the floor (Infinity = never jumped). */
export function checkBlock(blocker: Vector3, shooter: Vector3, jumpAgeSec: number): boolean {
  // PLANAR, and this one was not merely latent — it was self-defeating. Both roots are physics bodies, so a blocker
  // who LEAVES THE FLOOR (which is the only way to satisfy `jumpAgeSec`) rises most of a metre, and a 3-D distance
  // counted that rise as separation: at 1.2 m of floor gap and 0.7 m of height the check measured 1.39 m and refused
  // a block the player had timed correctly. Jumping made you worse at blocking. Only the floor gap is the contest.
  return jumpAgeSec <= BLOCK_WINDOW_SEC && distXZ(blocker, shooter) <= BLOCK_RANGE;
}

// ── Depth pass: the steal is a read, not a dice roll ─────────────────────
/** Exposure above which a poke connects. The rival's ball is exposed while it CROSSES OVER (a sidestep, the weave) and
 *  protected in the gather — see AttackerBrain.decide().exposure. Replaces `Math.random() < 0.5`: defence is a skill,
 *  not a coin flip. (The old driveBallExposure(t) read a 2.2 s timer; ONEVONE-DEFENSE-LOGIC reads the body.) */
export const STEAL_EXPOSURE_MIN = 0.5;

// ── ONEVONE-DEFENSE-LOGIC (2026-09-07): the rival's possession is a DRIVE you can guard ──────────────────────────
// Before this the rival's possession was a 2.2 s timer: x = sin(t) weave, z lerped to the rim, released on the clock
// whatever the defender did (measured: the hero in front of the drive 30–60 % of the frames, the rival released 0.8 m
// from the rim every time — positioning changed nothing but the contest number). This brain reads the DEFENDER:
//   CONTAINED — a body in the lane inside CONTAIN_RANGE makes the rival SIDESTEP (a crossover: the ball crosses over
//     = exposed, the steal read) instead of running through it; held in front for CONTAIN_PULLUP_SEC it pulls up from
//     wherever it is (a worse shot — that is what staying in front buys).
//   OPEN — a clear lane is a drive to LAYUP_RANGE and a layup.
//   GATHER — every shot is telegraphed by GATHER_SEC of gather before the release: the block cue (jump on the gather).
//   BLOW-BY — a whiffed reach or a jump at nothing opens the lane: the rival goes NOW (the read has a price).
//   CHECK — the possession starts with CHECK_HOLD_SEC of ball-check (an idle dribble): time to get set, no
//     instant re-steal (measured before: a strip followed by a counter-strip 0.10 s later, four times in four).
// Pure (Vector3 in, decision out) so every rule is headless-testable (scripts/onevone-defense-tests.ts).
export const RIVAL_DRIVE_SPEED = 4.6;          // m/s — under the defender's 6.4 so a slide can stay in front
export const RIVAL_SIDESTEP_SPEED = 3.4;
export const CONTAIN_RANGE = 1.5;              // a defender this close …
export const CONTAIN_CONE = 0.45;              // … and this much in the lane (cos) contains the drive
export const CONTAIN_PULLUP_SEC = 1.3;         // held in front this long → pull-up from wherever
export const SHOT_CLOCK_SEC = 6;               // the possession never hangs
export const LAYUP_RANGE = 1.9;                // rim distance that becomes a layup gather
export const GATHER_SEC = 0.32;                // the telegraph before every release (the block window)
export const STEPBACK_SEC = 0.3;               // a contained pull-up steps BACK first — space for the shot, a step-in for the block
export const STEPBACK_SPEED = 3.2;
export const BLOWBY_SEC = 0.8;
export const BLOWBY_SPEED = 6.2;               // a beaten defender (6.4 top speed, on their heels) does not catch this before the layup
export const CAUTION_PER_STEAL = 0.2;          // a rival stripped on a crossover crosses over less next time (floor 0.25) …
export const CAUTION_DECAY = 0.08;             // … and forgets a little each possession
export const CHECK_HOLD_SEC = 0.5;
export const EXPOSURE_LATERAL_SPEED = 2.4;     // lateral m/s that fully exposes the ball
export const CROSSOVER_EXPOSED_FROM = 0.1;    // the ball leaves the hand this long into a crossover step …
export const CROSSOVER_EXPOSED_TO = 0.42;     // … and settles on the far hip here — the poke window (a human reads ~0.2–0.3 s late)
export const SIDESTEP_SEC = 0.55;
export const CROSSOVER_CHANCE = 0.55;         // the rest of the contained steps are same-hand SHUFFLES — no switch, nothing to poke
export const CROSSOVER_FLOOR = 0.2;           // a cautious rival still crosses over this often
export const LAYUP_STRIDE_SPEED = 2.4;        // a layup is gathered IN STRIDE — a rival planted at the rim for the gather was a free chase-down block
export const HAND_UP_SEC = 0.7;                // a jump this recent still puts a hand in the shot …
export const HAND_UP_CONTEST = 0.3;            // … worth this much contest

export type AttackPhase = 'check' | 'drive' | 'sidestep' | 'blowby' | 'stepback' | 'gather' | 'released';
export interface AttackDecision {
  /** Wish velocity (m/s, planar). */
  wish: Vector3;
  phase: AttackPhase;
  /** The defender is in the lane this frame. */
  contained: boolean;
  /** 0..1 — how exposed the ball is to a poke right now. */
  exposure: number;
  /** A lateral step started this frame (a crossover or a same-hand shuffle). */
  step: boolean;
  /** A crossover started this frame (which side, in the rival's BODY frame — the clip to play). Null on a shuffle. */
  crossover: 'left' | 'right' | null;
  /** The release frame: the shot to take now. HOOPS-MOVE-KIT-A D1: a beaten defender (the blow-by) gets DUNKED on. */
  shot: 'layup' | 'jumper' | 'dunk' | null;
}

export class AttackerBrain {
  t = 0;
  phase: AttackPhase = 'check';
  containedSec = 0;
  private side = 1; private sideSec = 0; private blowbySec = 0; private gatherSec = 0;
  private pending: 'layup' | 'jumper' | 'dunk' | null = null; private swayPhase = 0; private stepbackSec = 0; private stepIsCross = false;
  /** How much the rival has learned to protect the ball against THIS defender (survives reset(); decays per possession). */
  caution = 0;
  /**
   * How long he is willing to wait for a good look, as a multiple of the normal hold. Survives reset().
   *
   * NERVE (2026-09-14): this is the AGGRESSION half of the invariant, and without it applying nerve to the
   * rival would have been a straight buff. A rival who is behind FORCES shots -- he pulls up out of a
   * contain sooner and takes the look that is there rather than the one he wants. A rival protecting a
   * lead waits. Below 1 he is pressing; above 1 he is being patient.
   */
  patience = 1;
  /** HOOPS-MOVE-KIT-A D1: this defender was IN FRONT and got beaten (a blow-by / a whiffed reach) — the finish at the rim is a
   *  DUNK on him. A defender who was never there (an unguarded drive) is just a layup line, which is what the open-drive
   *  check expects. */
  private beaten = false;
  constructor(private rng: () => number = Math.random) { this.reset(); }
  /** The defender picked a crossover: fewer crossovers, more shuffles, from now on. */
  noteStolen(): void { this.caution = Math.min(CROSSOVER_CHANCE - CROSSOVER_FLOOR, this.caution + CAUTION_PER_STEAL); }
  reset(): void {
    this.caution = Math.max(0, this.caution - CAUTION_DECAY);
    this.t = 0; this.phase = 'check'; this.containedSec = 0; this.side = this.rng() < 0.5 ? -1 : 1;
    this.sideSec = 0; this.blowbySec = 0; this.gatherSec = 0; this.stepbackSec = 0; this.pending = null; this.beaten = false; this.swayPhase = this.rng() * Math.PI * 2;
  }
  /** A whiffed reach / a jump at nothing opens the lane: the rival goes NOW. No effect once the shot is up. */
  blowBy(): void { if (this.phase === 'gather' || this.phase === 'released' || this.phase === 'check' || this.phase === 'stepback') return; this.phase = 'blowby'; this.blowbySec = 0; this.beaten = this.containedSec > 0.15; }
  decide(dt: number, self: Vector3, defender: Vector3, hoop: Vector3, opts: { defenderAirborne: boolean } = { defenderAirborne: false }): AttackDecision {
    this.t += dt;
    const zero = new Vector3(0, 0, 0);
    if (this.phase === 'released') return { wish: zero, phase: 'released', contained: false, exposure: 0, step: false, crossover: null, shot: null };
    const toRim = new Vector3(hoop.x - self.x, 0, hoop.z - self.z);
    const dist = toRim.length();
    const dir = dist > 1e-4 ? toRim.scale(1 / dist) : new Vector3(0, 0, -1);
    if (this.phase === 'gather') {
      this.gatherSec += dt;
      // a layup gathers in stride (the last step to the rim); a jumper rises on the spot
      const stride = (this.pending === 'layup' || this.pending === 'dunk') && dist > 0.9 ? dir.scale(LAYUP_STRIDE_SPEED) : zero;
      if (this.gatherSec >= GATHER_SEC) { this.phase = 'released'; return { wish: zero, phase: 'released', contained: false, exposure: 0, step: false, crossover: null, shot: this.pending }; }
      return { wish: stride, phase: 'gather', contained: false, exposure: 0, step: false, crossover: null, shot: null };
    }
    const perp = new Vector3(-dir.z, 0, dir.x);               // the lane's lateral
    if (this.phase === 'stepback') {
      // the step-back: space for the pull-up (the ball is protected — it is on the far hip), then the gather
      this.stepbackSec += dt;
      if (this.stepbackSec >= STEPBACK_SEC) { this.phase = 'gather'; this.gatherSec = 0; return { wish: zero, phase: 'gather', contained: false, exposure: 0, step: false, crossover: null, shot: null }; }
      return { wish: dir.scale(-STEPBACK_SPEED), phase: 'stepback', contained: false, exposure: 0.2, step: false, crossover: null, shot: null };
    }
    const dv = new Vector3(defender.x - self.x, 0, defender.z - self.z);
    const dDist = dv.length();
    const along = Vector3.Dot(dv, dir), lat = Vector3.Dot(dv, perp);
    const inLane = dDist < CONTAIN_RANGE && along > 0 && along / Math.max(dDist, 1e-4) > CONTAIN_CONE;
    if (this.phase === 'check') {
      if (this.t < CHECK_HOLD_SEC) return { wish: zero, phase: 'check', contained: inLane, exposure: 0, step: false, crossover: null, shot: null };
      this.phase = 'drive';
    }
    // the pump-fake read: a defender in the air with nothing to block gets driven past
    if (opts.defenderAirborne && dDist < 2.2 && this.phase !== 'blowby') this.blowBy();
    let crossover: 'left' | 'right' | null = null; let step = false;
    let wish: Vector3; let exposure = 0;
    if (this.phase === 'blowby') {
      this.blowbySec += dt;
      // AROUND the body, not through it: hard lateral while the defender is close (a run-through was read as a charge),
      // then the straight line
      const away = lat >= 0 ? -1 : 1;
      wish = dir.scale(BLOWBY_SPEED).addInPlace(perp.scale(away * (dDist < 1.6 ? 3.0 : 1.0)));
      exposure = 0.25;
      if (this.blowbySec >= BLOWBY_SEC) this.phase = 'drive';
    } else if (inLane) {
      this.containedSec += dt; this.phase = 'sidestep';
      this.sideSec -= dt;
      if (this.sideSec <= 0) {
        this.side = Math.abs(lat) < 0.12 ? (this.rng() < 0.5 ? -1 : 1) : lat > 0 ? -1 : 1;   // away from the defender's shoulder
        this.sideSec = SIDESTEP_SEC; step = true;
        this.stepIsCross = this.rng() < CROSSOVER_CHANCE - this.caution;
        if (this.stepIsCross) crossover = bodySide(dir, perp.scale(this.side));
      }
      wish = perp.scale(this.side * RIVAL_SIDESTEP_SPEED).addInPlace(dir.scale(0.9));
      // THE READ: on a CROSSOVER the ball is exposed while it crosses the body — from CROSSOVER_EXPOSED_FROM into the
      // step (a poke at the very start hits the hand) to CROSSOVER_EXPOSED_TO (then it rides the far hip). A same-hand
      // SHUFFLE never switches — nothing to poke. Measured: with the whole step exposed a zero-latency bot stole the first
      // crossover 5 of 5; with a 0.22 s window from the step's first frame a 220 ms human whiffed 12 of 12.
      const into = SIDESTEP_SEC - this.sideSec;
      exposure = this.stepIsCross && into >= CROSSOVER_EXPOSED_FROM && into <= CROSSOVER_EXPOSED_TO ? 1 : 0.3;
    } else {
      this.phase = 'drive';
      this.containedSec = Math.max(0, this.containedSec - dt * 0.5);
      this.sideSec = 0;
      const swayV = Math.cos(this.t * 2.6 + this.swayPhase) * 0.8 * 2.6;   // d/dt of a 0.8 m weave
      wish = dir.scale(RIVAL_DRIVE_SPEED).addInPlace(perp.scale(swayV));
      exposure = Math.min(1, Math.abs(swayV) / EXPOSURE_LATERAL_SPEED);
    }
    // the shot: at the rim it is a layup — a DUNK off a blow-by (the defender is beaten: D1, something to block); held in
    // front (or the clock) it is a pull-up from here
    if (dist < LAYUP_RANGE && (!inLane || this.containedSec > 0.5)) this.pending = this.beaten && !inLane ? 'dunk' : 'layup';
    // `patience` is nerve's aggression half: pressing pulls up out of a contain sooner (a forced look),
    // protecting waits longer for a better one. Floored so a desperate rival still plays basketball.
    else if (this.containedSec >= CONTAIN_PULLUP_SEC * Math.max(0.45, this.patience) || this.t >= SHOT_CLOCK_SEC) this.pending = dist < LAYUP_RANGE ? 'layup' : 'jumper';
    if (this.pending === 'layup' || this.pending === 'dunk') { this.phase = 'gather'; this.gatherSec = 0; wish = zero; exposure = 0; }
    else if (this.pending === 'jumper') {
      // a pull-up under a body steps back first; an open pull-up (the clock) just rises
      if (inLane) { this.phase = 'stepback'; this.stepbackSec = 0; wish = dir.scale(-STEPBACK_SPEED); exposure = 0.2; }
      else { this.phase = 'gather'; this.gatherSec = 0; wish = zero; exposure = 0; }
    }
    return { wish, phase: this.phase, contained: inLane, exposure, step, crossover, shot: null };
  }
}
/** Which side of the body a lateral vector is on. Body-right for a facing (measured, MODE-STICK-FACE): (cos yaw, 0, −sin yaw). */
function bodySide(facing: Vector3, lateral: Vector3): 'left' | 'right' {
  const yaw = Math.atan2(facing.x, facing.z);
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  return Vector3.Dot(lateral, right) > 0 ? 'right' : 'left';
}
/** The rival's make chance: a layup is the best shot, a contested pull-up from range the worst — the same contest that
 *  grades your jumper grades theirs (contestLevel), plus a hand up (handUpContest). */
export function rivalShotPct(distToRim: number, contest01: number, style: 'layup' | 'jumper'): number {
  const base = style === 'layup' ? 0.74 : distToRim < 4.5 ? 0.52 : distToRim < 6.7 ? 0.46 : 0.38;
  return Math.max(0.06, Math.min(0.95, base - contest01 * 0.42));
}
/** A jump inside HAND_UP_SEC of the release that is not a block still gets a hand in the shot. */
export function handUpContest(contest01: number, jumpAgeSec: number): number {
  return jumpAgeSec <= HAND_UP_SEC ? Math.min(1, contest01 + HAND_UP_CONTEST) : contest01;
}

/** Past this the nearest defender is not contesting the shot at all. */
export const CONTEST_RANGE = 3;

/**
 * How contested a shot is, from the distance to the nearest defender alone — 0 at CONTEST_RANGE, 1 in his chest.
 *
 * Extracted because three shooters were each computing `clamp01(1 - nearest/3)` inline and a fourth (the 3v3
 * teammate) was not computing it at all. A contest formula that lives in three places is a contest formula
 * that will mean three things after the next tuning pass.
 *
 * `Infinity` for "there is nobody to contest" reads as wide open, which is what an empty defender list means.
 */
export function proximityContest01(nearestDefenderDist: number): number {
  if (!Number.isFinite(nearestDefenderDist)) return 0;
  return Math.min(1, Math.max(0, 1 - nearestDefenderDist / CONTEST_RANGE));
}
