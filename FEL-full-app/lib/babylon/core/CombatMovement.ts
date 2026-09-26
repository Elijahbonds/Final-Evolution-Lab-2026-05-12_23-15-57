// CombatMovement — Mode 2 Phase 2: the shared combat locomotion core.
//
// ONE controller, three expressions, selected per sub-mode:
//   - 'free'     — omni footwork (Endless Onslaught, exploration)
//   - 'eightWay' — Soul Calibur's 8-way run: movement on the disc around a
//                  locked opponent. Stick X orbits, stick Y closes/retreats;
//                  facing is ALWAYS the opponent. (Duel Mode's plane.)
//   Stances modulate speed/range/available moves; dash-cancel is a
//   directional burst with real i-frames and a resource cost, legal
//   mid-combo-recovery (that's what makes it a cancel).
//
// Built ON CourtMovement (Mode 1's weight model) so combat movement keeps
// the planted, heavy feel — fighting-game verbs layered on top.

import { Vector3 } from '@babylonjs/core';
import { CourtMovement, DEFAULT_MOVEMENT, type MovementTuning } from './CourtMovement';
import {
  EvadeMoves, ROLL_SPEED, ROLL_SEC, ROLL_IFRAMES_SEC, ROLL_RECOVER_SEC, ROLL_COOLDOWN_SEC, JUMP_V, JUMP_G,
} from './EvadeMoves';

// ── Stances ────────────────────────────────────────────────────────────────
export type Stance = 'orthodox' | 'cat' | 'rooted';

export interface StanceProfile {
  label: string;
  speedMult: number;         // locomotion speed
  rangeMult: number;         // strike reach multiplier
  dashCostMult: number;      // resource cost of dash-cancel
  /** which strike tags this stance unlocks (modes map tags to attacks) */
  moveTags: string[];
}

export const STANCES: Record<Stance, StanceProfile> = {
  orthodox: { label: 'ORTHODOX', speedMult: 1.0, rangeMult: 1.0, dashCostMult: 1.0, moveTags: ['jab', 'kick', 'heavy'] },
  cat:      { label: 'CAT', speedMult: 1.18, rangeMult: 0.85, dashCostMult: 0.75, moveTags: ['jab', 'kick', 'pounce'] },
  rooted:   { label: 'ROOTED', speedMult: 0.82, rangeMult: 1.2, dashCostMult: 1.4, moveTags: ['heavy', 'sweep', 'breaker'] },
};

export class StanceSystem {
  current: Stance = 'orthodox';
  private switchCooldown = 0;
  static readonly SWITCH_SEC = 0.35;   // no stance flicker mid-frame-chain

  update(dt: number): void { this.switchCooldown = Math.max(0, this.switchCooldown - dt); }

  switchTo(s: Stance): boolean {
    if (this.switchCooldown > 0 || s === this.current) return false;
    this.current = s;
    this.switchCooldown = StanceSystem.SWITCH_SEC;
    return true;
  }

  get profile(): StanceProfile { return STANCES[this.current]; }
}

// ── Movement modes ─────────────────────────────────────────────────────────
export type CombatMoveMode = 'free' | 'eightWay';

export interface CombatMoveResult {
  vel: Vector3;
  speed01: number;
  facingRad: number;
  dashing: boolean;
  dashIFrames: boolean;
  planting: boolean;
  /** Mid-roll. The body is committed — see the header on ROLL vs DASH. */
  rolling: boolean;
  /** Invulnerable, from a dash OR a roll. Modes should read this, never the dash flag alone. */
  iframes: boolean;
  /** Off the floor. */
  airborne: boolean;
  /** Metres above the floor — the mode adds this to the root's y. */
  height: number;
  /** Free to strike, block or move. False through a roll and its recovery. */
  canAct: boolean;
}

export class CombatMovement {
  private base: CourtMovement;
  readonly stances = new StanceSystem();
  moveMode: CombatMoveMode = 'free';
  lockTarget: Vector3 | null = null;      // opponent position for 8-way
  private dashTimer = 0;
  private dashDir = Vector3.Zero();
  private iframeTimer = 0;
  private dashCooldown = 0;
  private readonly evade = new EvadeMoves();

  static readonly DASH_SPEED = 9.5;        // m/s burst
  static readonly DASH_SEC = 0.22;
  static readonly DASH_IFRAMES_SEC = 0.16;
  static readonly DASH_COOLDOWN_SEC = 0.55;

  // ── ROLL and JUMP ────────────────────────────────────────────────────────────────────────────────────
  //
  // The state machine lives in EvadeMoves, NOT here, and the reason is worth keeping: of the five combat
  // modes only duel and showdown own a CombatMovement. Karate endless, karate_vs and mixedcombat write a
  // velocity straight onto the root. Putting the roll in here would have meant migrating three shipped,
  // tuned locomotions to deliver one verb. These re-exports keep the old constant names working.
  static readonly ROLL_SPEED = ROLL_SPEED;
  static readonly ROLL_SEC = ROLL_SEC;
  static readonly ROLL_IFRAMES_SEC = ROLL_IFRAMES_SEC;
  static readonly ROLL_RECOVER_SEC = ROLL_RECOVER_SEC;
  static readonly ROLL_COOLDOWN_SEC = ROLL_COOLDOWN_SEC;
  static readonly JUMP_V = JUMP_V;
  static readonly JUMP_G = JUMP_G;

  constructor(tune: Partial<MovementTuning> = {}) {
    this.base = new CourtMovement({ ...DEFAULT_MOVEMENT, ...tune });
  }

  get vel(): Vector3 { return this.base.vel; }
  get facing(): number { return this.base.facing; }
  get dashIFrames(): boolean { return this.iframeTimer > 0; }
  get dashing(): boolean { return this.dashTimer > 0; }
  get dashReady(): boolean { return this.dashCooldown === 0 && this.dashTimer === 0; }
  get rolling(): boolean { return this.evade.rolling; }
  get rollIFrames(): boolean { return this.evade.rollIFrames; }
  /** Invulnerable from EITHER source. Modes read this; reading `dashIFrames` alone misses the roll. */
  get iframes(): boolean { return this.iframeTimer > 0 || this.evade.rollIFrames; }
  get airborne(): boolean { return this.evade.airborne; }
  get height(): number { return this.evade.height; }
  get rollReady(): boolean { return this.evade.rollReady; }
  /** Free to strike, block or steer. One predicate — see EvadeMoves. */
  get canAct(): boolean { return this.evade.canAct; }

  /** Committed defensive evade. False on cooldown, mid-roll, or airborne. */
  roll(dirX: number, dirZ: number): boolean { return this.evade.roll(dirX, dirZ); }

  /** Leave the floor. Refused mid-roll and mid-air. */
  jump(): boolean { return this.evade.jump(); }

  /** MOVEMENT PLAY P7 (2026-09-25): the body's slip (a unit world direction) or duck ((0, 0): in place) — EvadeMoves.slip.
   *  Only the body makes one; its i-frames are the mode's DefenseLedger's, so `iframes` is unchanged. */
  slip(dirX: number, dirZ: number): boolean { return this.evade.slip(dirX, dirZ); }
  get slipping(): boolean { return this.evade.slipping; }

  /** Dash-cancel: a fast directional burst with i-frames. Returns false if
   *  on cooldown (modes gate the resource spend on this returning true). */
  dash(dirX: number, dirZ: number, force = false): boolean {
    if (!this.dashReady && !force) return false;   // phase 3: the chakra dash (a double tap) lands mid-burst by definition — it forces
    const d = new Vector3(dirX, 0, dirZ);
    if (d.lengthSquared() < 0.01) d.copyFrom(Vector3.Forward());
    this.dashDir = d.normalize();
    this.dashTimer = CombatMovement.DASH_SEC;
    this.iframeTimer = CombatMovement.DASH_IFRAMES_SEC;
    this.dashCooldown = CombatMovement.DASH_COOLDOWN_SEC;
    return true;
  }

  /** Advance the evade state; returns true while it owns the body (the roll AND its recovery). */
  private stepEvade(dt: number): boolean {
    const v = this.evade.update(dt);
    if (!v) return false;
    this.base.vel.copyFrom(v);
    if (this.evade.rolling) this.base.facing = Math.atan2(this.evade.rollDir.x, this.evade.rollDir.z);
    return true;
  }

  update(dt: number, moveX: number, moveY: number, sprint: boolean): CombatMoveResult {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.iframeTimer = Math.max(0, this.iframeTimer - dt);
    // the roll outranks the stick and the dash: it is the committed state
    if (this.stepEvade(dt)) return this.result(false);

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      this.base.vel.copyFrom(this.dashDir.scale(CombatMovement.DASH_SPEED));
      this.base.facing = Math.atan2(this.dashDir.x, this.dashDir.z);
      return this.result(true);
    }

    this.base.speedScale = this.stances.profile.speedMult;
    this.base.update(dt, moveX, moveY, sprint);
    return this.result(false);
  }

  /** 8-way run (Soul Calibur disc): call INSTEAD of update() when in
   *  eightWay mode — needs the self position for the radial basis.
   *  Stick X orbits the locked opponent, stick Y closes/retreats; facing
   *  always locks to the opponent. Dash still works (bursts radially). */
  updateWithSelf(dt: number, moveX: number, moveY: number, sprint: boolean, selfPos: Vector3, worldWish?: Vector3): CombatMoveResult {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.iframeTimer = Math.max(0, this.iframeTimer - dt);
    if (this.stepEvade(dt)) return this.result(false);

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      this.base.vel.copyFrom(this.dashDir.scale(CombatMovement.DASH_SPEED));
      return this.result(true);
    }

    if (this.lockTarget) {
      this.base.speedScale = this.stances.profile.speedMult;
      const toSelf = selfPos.subtract(this.lockTarget); toSelf.y = 0;
      const radial = toSelf.lengthSquared() > 0.01 ? toSelf.normalize() : Vector3.Forward();
      const tangent = new Vector3(-radial.z, 0, radial.x);   // orbit direction
      // express the orbit/radial wish in the weight model's stick space
      // MODE-STICK-FACE (2026-09-07): a mode may hand in the wish in WORLD space (camera-relative: up = the camera's
      // flat forward, i.e. toward the rival the fight camera looks at) — the radial/tangent basis made raw up-stick
      // RETREAT (−moveY·radial points away from the foe).
      const wish = worldWish ?? tangent.scale(moveX).add(radial.scale(-moveY));
      this.base.update(dt, wish.x, -wish.z, sprint);
      // facing locks to the opponent
      const toFoe = this.lockTarget.subtract(selfPos);
      this.base.facing = Math.atan2(toFoe.x, toFoe.z);
    }
    return this.result(false);
  }

  private result(dashing: boolean, ret?: void): CombatMoveResult {
    void ret;
    return {
      vel: this.base.vel,
      speed01: Math.min(1, this.base.vel.length() / DEFAULT_MOVEMENT.maxSpeed),
      facingRad: this.base.facing,
      dashing,
      dashIFrames: this.iframeTimer > 0,
      planting: false,
      rolling: this.evade.rolling,
      iframes: this.iframes,
      airborne: this.evade.airborne,
      height: this.evade.height,
      canAct: this.evade.canAct,
    };
  }
}
