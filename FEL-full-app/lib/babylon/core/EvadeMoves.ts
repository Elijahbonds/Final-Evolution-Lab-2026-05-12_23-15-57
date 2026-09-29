// THE ROLL AND THE JUMP, USABLE WITHOUT ADOPTING A LOCOMOTION CONTROLLER (2026-09-14).
//
// These verbs were first written inside `CombatMovement`, which was wrong the moment I checked who owns
// one: of the five combat modes, only DUEL and SHOWDOWN do. Karate endless, karate_vs and mixedcombat all
// move the fighter by writing a velocity straight onto the root — karate_vs's is camera-relative and was
// tuned for a reason (MODE-STICK-FACE), and mixedcombat's has its own boundary pinning.
//
// So there were two ways to give those three a roll: migrate their locomotion onto `CombatMovement`, or
// make the roll not require it. Migrating tuned movement in three shipped modes to deliver a new verb is
// the kind of refactor that breaks a feel nobody can get back, and the brief that opened this work says
// not to. This file is the other way: the state machine lives alone, `CombatMovement` delegates to it, and
// a mode that owns no controller can own one of these directly.
//
// WHY A ROLL IS NOT A LONGER DASH — the distinction both verbs exist to hold:
//
//   the DASH is a CANCEL — short, cheap, and legal out of combo recovery. Offence.
//   the ROLL is a COMMITMENT — further, more generous i-frames, and a recovery on the end you can be
//   punished during. Defence.
//
// THE I-FRAMES END BEFORE THE ROLL DOES (ROLL_IFRAMES_SEC < ROLL_SEC), deliberately. A roll invulnerable
// for its whole length is strictly better than not rolling at every moment, and the correct play becomes
// mashing it. Ending them early is what makes a roll a read instead of a state.
//
// Pure: no Babylon beyond a Vector3 for direction, no scene, no clock.

import { Vector3 } from '@babylonjs/core';

export const ROLL_SPEED = 7.4;
export const ROLL_SEC = 0.42;
export const ROLL_IFRAMES_SEC = 0.26;
export const ROLL_RECOVER_SEC = 0.18;
export const ROLL_COOLDOWN_SEC = 0.75;

/**
 * MOVEMENT PLAY P7 (2026-09-25): the SLIP — the body's head off the line (a slip) or under it (a duck). Short and cheap
 * like the dash, but only ever the body's (no button makes one): SLIP_M across in SLIP_SEC (0 = in place: the duck),
 * SLIP_IFRAMES_SEC of i-frames from its start, SLIP_COOLDOWN_SEC before the next. It leaves the fighter free to strike
 * (a slip and a counter is the move), unlike the roll's committed recovery. [est.: PLAN-P7 §4.1]
 */
export const SLIP_M = 0.45;
export const SLIP_SEC = 0.22;
export const SLIP_IFRAMES_SEC = 0.2;
export const SLIP_COOLDOWN_SEC = 0.5;

/** Take-off speed, m/s. ~0.95 m of clearance: over a sweep, under a high kick. */
export const JUMP_V = 4.3;
/** Combat gravity. Heavier than the world's, so a jump is a beat rather than a float. */
export const JUMP_G = -19.5;

export class EvadeMoves {
  private rollTimer = 0;
  private rollRecover = 0;
  private rollCooldown = 0;
  private rollIframe = 0;
  private dir = new Vector3(0, 0, 1);
  private airY = 0;
  private airVy = 0;
  private slipTimer = 0;
  private slipIframe = 0;
  private slipCooldown = 0;
  private slipDir = new Vector3(0, 0, 0);

  get rolling(): boolean { return this.rollTimer > 0; }
  /** MOVEMENT PLAY P7: a slip / duck is under way, and its i-frames. */
  get slipping(): boolean { return this.slipTimer > 0; }
  get slipIFrames(): boolean { return this.slipIframe > 0; }
  get rollIFrames(): boolean { return this.rollIframe > 0; }
  get airborne(): boolean { return this.airY > 0.001 || this.airVy > 0; }
  /** Metres above the floor. The mode adds this to the root's y; nothing here touches a transform. */
  get height(): number { return this.airY; }
  get rollDir(): Vector3 { return this.dir; }
  get rollReady(): boolean {
    return this.rollCooldown === 0 && this.rollTimer === 0 && this.rollRecover === 0 && !this.airborne;
  }
  /**
   * Free to strike, block or steer.
   *
   * ONE predicate, because five modes gate their input on this and five modes each deciding what "busy"
   * means is how a roll ends up cancellable in one of them and not in the others.
   */
  get canAct(): boolean { return this.rollTimer === 0 && this.rollRecover === 0; }

  /** Committed ground evade. False when on cooldown, already rolling, or airborne. */
  roll(dirX: number, dirZ: number): boolean {
    if (!this.rollReady) return false;
    const d = new Vector3(dirX, 0, dirZ);
    if (d.lengthSquared() < 0.01) d.copyFrom(Vector3.Forward());
    this.dir = d.normalize();
    this.rollTimer = ROLL_SEC;
    this.rollIframe = ROLL_IFRAMES_SEC;
    this.rollRecover = 0;
    this.rollCooldown = ROLL_COOLDOWN_SEC;
    return true;
  }

  /**
   * MOVEMENT PLAY P7: slip along (dirX, dirZ) — a unit direction in the world, or (0, 0) for the duck in place. Refused on
   * its cooldown, mid-roll and in the air.
   */
  slip(dirX: number, dirZ: number): boolean {
    if (this.slipCooldown > 0 || this.rollTimer > 0 || this.airborne) return false;
    const d = new Vector3(dirX, 0, dirZ);
    this.slipDir = d.lengthSquared() > 1e-4 ? d.normalize() : Vector3.Zero();
    this.slipTimer = SLIP_SEC;
    this.slipIframe = SLIP_IFRAMES_SEC;
    this.slipCooldown = SLIP_COOLDOWN_SEC;
    return true;
  }

  /** Leave the floor. Refused mid-air and mid-roll: no double jumps, no roll-cancel into one. */
  jump(): boolean {
    if (this.airborne || !this.canAct) return false;
    this.airVy = JUMP_V;
    return true;
  }

  /**
   * Advance both arcs. Returns the roll's velocity while the roll owns the body, else null.
   *
   * A mode that owns a `CombatMovement` lets it handle the return; a mode that writes its own velocity
   * uses the returned vector INSTEAD of its stick velocity for that frame, and reads `canAct` to know when
   * to ignore the stick entirely.
   */
  update(dt: number): Vector3 | null {
    if (!(dt > 0)) return this.rolling ? this.dir.scale(ROLL_SPEED) : null;
    this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    this.rollIframe = Math.max(0, this.rollIframe - dt);
    this.slipCooldown = Math.max(0, this.slipCooldown - dt);
    this.slipIframe = Math.max(0, this.slipIframe - dt);

    if (this.airborne) {
      this.airVy += JUMP_G * dt;
      this.airY += this.airVy * dt;
      if (this.airY <= 0) { this.airY = 0; this.airVy = 0; }
    }

    if (this.rollTimer > 0) {
      this.rollTimer = Math.max(0, this.rollTimer - dt);
      if (this.rollTimer === 0) this.rollRecover = ROLL_RECOVER_SEC;
      return this.dir.scale(ROLL_SPEED);
    }
    if (this.rollRecover > 0) {
      this.rollRecover = Math.max(0, this.rollRecover - dt);
      return Vector3.Zero();            // planted through the recovery: the stick does nothing
    }
    if (this.slipTimer > 0) {
      this.slipTimer = Math.max(0, this.slipTimer - dt);
      return this.slipDir.scale(SLIP_M / SLIP_SEC);
    }
    return null;
  }

  /** Back to neutral — a round reset, a respawn, a revive. */
  reset(): void {
    this.rollTimer = 0; this.rollRecover = 0; this.rollCooldown = 0; this.rollIframe = 0;
    this.airY = 0; this.airVy = 0;
    this.slipTimer = 0; this.slipIframe = 0; this.slipCooldown = 0;
  }
}
