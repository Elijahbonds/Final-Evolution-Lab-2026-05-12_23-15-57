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

  static readonly DASH_SPEED = 9.5;        // m/s burst
  static readonly DASH_SEC = 0.22;
  static readonly DASH_IFRAMES_SEC = 0.16;
  static readonly DASH_COOLDOWN_SEC = 0.55;

  constructor(tune: Partial<MovementTuning> = {}) {
    this.base = new CourtMovement({ ...DEFAULT_MOVEMENT, ...tune });
  }

  get vel(): Vector3 { return this.base.vel; }
  get facing(): number { return this.base.facing; }
  get dashIFrames(): boolean { return this.iframeTimer > 0; }
  get dashing(): boolean { return this.dashTimer > 0; }
  get dashReady(): boolean { return this.dashCooldown === 0 && this.dashTimer === 0; }

  /** Dash-cancel: a fast directional burst with i-frames. Returns false if
   *  on cooldown (modes gate the resource spend on this returning true). */
  dash(dirX: number, dirZ: number): boolean {
    if (!this.dashReady) return false;
    const d = new Vector3(dirX, 0, dirZ);
    if (d.lengthSquared() < 0.01) d.copyFrom(Vector3.Forward());
    this.dashDir = d.normalize();
    this.dashTimer = CombatMovement.DASH_SEC;
    this.iframeTimer = CombatMovement.DASH_IFRAMES_SEC;
    this.dashCooldown = CombatMovement.DASH_COOLDOWN_SEC;
    return true;
  }

  update(dt: number, moveX: number, moveY: number, sprint: boolean): CombatMoveResult {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.iframeTimer = Math.max(0, this.iframeTimer - dt);

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
  updateWithSelf(dt: number, moveX: number, moveY: number, sprint: boolean, selfPos: Vector3): CombatMoveResult {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.iframeTimer = Math.max(0, this.iframeTimer - dt);

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
      const wish = tangent.scale(moveX).add(radial.scale(-moveY));
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
    };
  }
}
