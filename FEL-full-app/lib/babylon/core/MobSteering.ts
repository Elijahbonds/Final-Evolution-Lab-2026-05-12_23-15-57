// MobSteering — pursuit/containment steering for defenders, karate mobs, and
// the yeti chase. Kinematic (no physics engine dependency), staggered updates.

import { Vector3 } from '@babylonjs/core';
import type { SpawnedCharacter } from './CharacterLibrary';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';

export interface SteeringConfig {
  maxSpeed: number;          // m/s
  turnRateRad: number;       // max yaw change /s (M13-01 slew)
  containmentBias: number;   // 0..1 — lateral cut-off tendency (football defenders)
  giveUpAfterSec?: number;   // chase timeout (yeti ~12)
  reactionSec?: number;      // M45: delay before pursuit actually starts moving ("noticed you", not psychic)
}

export const STEERING_PRESETS: Record<string, SteeringConfig> = {
  // M45: football's purpose-built lane cut-off preset (was never actually
  // used — football reused karate's striker/rusher).
  defender: { maxSpeed: 5.2, turnRateRad: 6.0, containmentBias: 0.45, reactionSec: 0.12 },  //TUNE(elijah)
  rusher:   { maxSpeed: 4.2, turnRateRad: 5.0, containmentBias: 0.1, reactionSec: 0.1 },     //TUNE(elijah)
  striker:  { maxSpeed: 2.8, turnRateRad: 4.0, containmentBias: 0.0, reactionSec: 0.15 },    //TUNE(elijah)
  // M45: new — attacks from an angle instead of a straight line, so a group
  // reads as coordinated rather than a single-file conga line.
  flanker:  { maxSpeed: 3.4, turnRateRad: 4.5, containmentBias: 0.65, reactionSec: 0.2 },    //TUNE(elijah)
  yeti:     { maxSpeed: 7.5, turnRateRad: 3.5, containmentBias: 0.2, giveUpAfterSec: 12, reactionSec: 0.1 },
};

/** KARATE-NEO-COOP (2026-09-07): a mode that OWNS its mobs' clips (one owner per rig — a BeatOwner / tree on the body)
 *  passes a hook; the Mob then never plays a clip itself and only reports what its steering wants shown. Modes without
 *  a hook keep the shared idle / run / knockdown exactly as before. */
export type MobLocoState = 'idle' | 'move' | 'down';
export type MobLocoHook = (state: MobLocoState) => void;

export class Mob {
  public state: 'idle' | 'pursuing' | 'gaveUp' | 'downed' = 'idle';
  private chaseTime = 0;
  private reactionLeft = 0;   // M45: reaction-delay countdown before movement
  private yaw: number;

  constructor(
    public char: SpawnedCharacter,
    private cfg: SteeringConfig,
    private loco?: MobLocoHook,
  ) {
    this.yaw = char.root.rotation.y;
    // M45 E22 FIX: route mob clips through clipRegistry/installSafePlay so a
    // stale name (the old literal 'run_forward') can never silently T-pose
    // the entire enemy roster from this shared class again.
    installSafePlay(char.animator, 'mob');
    this.show('idle', 0.15);
  }

  /** The steering's clip request: the owner's hook when the mode owns the rig, the shared clips otherwise. */
  private show(state: MobLocoState, fadeSec: number): void {
    if (this.loco) { this.loco(state); return; }
    if (state === 'move') this.char.animator.play(SPORT_CLIP.moveLoop, { loop: true });
    else if (state === 'down') this.char.animator.play(SPORT_CLIP.karateKnockdown, { fadeSec: 0.1 });
    else this.char.animator.play(SPORT_CLIP.idle, { loop: true, fadeSec });
  }

  /** KARATE-NEO-COOP: the mode takes the body for an attack beat (wind-up / strike / recover) — the steering stops
   *  without asking for a clip (the owner shows the beat), and `resume()` puts it straight back on the chase. */
  hold(): void { if (this.state === 'pursuing') this.state = 'idle'; }
  resume(): void {
    if (this.state === 'downed') return;
    this.state = 'pursuing';
    this.chaseTime = 0;        // the next update shows the move loop again
    this.reactionLeft = 0;     // it already noticed you
  }

  startPursuit(): void {
    if (this.state === 'downed') return;
    this.state = 'pursuing';
    this.chaseTime = 0;
    this.reactionLeft = this.cfg.reactionSec ?? 0;
    // M45: stay in idle during the reaction beat ("notices you"); switch to
    // the real chase clip once movement actually starts (in update()).
  }

  /** call every frame with target pos+vel; returns true on CONTACT this frame */
  update(dt: number, targetPos: Vector3, targetVel: Vector3, contactRadius = 0.9): boolean {
    if (this.state !== 'pursuing') return false;

    if (this.reactionLeft > 0) {   // M45: reaction delay — aware, not psychic
      this.reactionLeft -= dt;
      return false;
    }
    if (this.chaseTime === 0) this.show('move', 0.15);

    this.chaseTime += dt;
    if (this.cfg.giveUpAfterSec && this.chaseTime > this.cfg.giveUpAfterSec) {
      this.state = 'gaveUp';
      this.show('idle', 0.15);
      return false;
    }

    const me = this.char.root.position;
    // Pursue predicted position; containment biases toward the target's lane
    const lead = Vector3.Distance(me, targetPos) / Math.max(this.cfg.maxSpeed, 0.1);
    const predicted = targetPos.add(targetVel.scale(Math.min(lead, 0.6)));
    const toTarget = predicted.subtract(me);
    if (this.cfg.containmentBias > 0) {
      toTarget.x += (targetPos.x - me.x) * this.cfg.containmentBias;
    }
    toTarget.y = 0;
    const dist = toTarget.length();
    if (dist < contactRadius) return true;         // caller plays tackle/knockdown

    // Yaw slew toward the pursuit direction, then move along facing
    const wantYaw = Math.atan2(toTarget.x, toTarget.z);
    let dYaw = wantYaw - this.yaw;
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    const maxStep = this.cfg.turnRateRad * dt;
    this.yaw += Math.max(-maxStep, Math.min(maxStep, dYaw));
    this.char.root.rotation.y = this.yaw;

    const speed = Math.min(this.cfg.maxSpeed, dist / dt);
    me.x += Math.sin(this.yaw) * speed * dt;
    me.z += Math.cos(this.yaw) * speed * dt;
    return false;
  }

  /** The owner turned the body itself (a wind-up faces the target): keep the slew's memory in step. */
  setYaw(yaw: number): void { this.yaw = yaw; this.char.root.rotation.y = yaw; }

  /** e.g. yeti swipe or defender wrap landed — play reaction and stand down */
  onContactResolved(): void {
    this.show('idle', 0.3);
    this.state = 'idle';
  }

  down(): void {
    this.state = 'downed';
    this.show('down', 0.1);
  }
}

/** Staggered updater: spreads N mobs across frames (¼ per frame at 4+ mobs). */
/** Two shoulders' width: closer than this and the bodies are inside each other on screen. */
export const BODY_SPACING = 0.82;

export class MobPool {
  private mobs: Mob[] = [];
  private cursor = 0;
  add(m: Mob): void { this.mobs.push(m); }
  all(): Mob[] { return this.mobs; }
  update(dt: number, targetPos: Vector3, targetVel: Vector3, contactRadius = 0.9): Mob[] {
    const contacts: Mob[] = [];
    const slice = Math.max(1, Math.ceil(this.mobs.length / 4));
    for (let i = 0; i < slice; i++) {
      const m = this.mobs[(this.cursor + i) % Math.max(this.mobs.length, 1)];
      if (m && m.update(dt * Math.min(4, this.mobs.length), targetPos, targetVel, contactRadius)) contacts.push(m);
    }
    this.cursor = (this.cursor + slice) % Math.max(this.mobs.length, 1);
    this.separate();
    return contacts;
  }

  /**
   * PERSONAL SPACE (2026-09-15). Every mob steers at the same point — the player — and nothing ever looked at another
   * mob, so a wave converged into one clump of bodies drawn through each other: the scorecard's frame review has
   * charged The Hundred for "bodies pile up" since rc10, and the rc19 mid frame is six fighters inside one silhouette.
   * A pair closer than two shoulders is pushed apart by half the overlap each, which is enough to hold a ring around
   * the player without fighting the steering (it is a position correction, not a force, so it cannot oscillate).
   * A downed body is left where it fell — stepping over someone on the floor is not a defect.
   */
  private separate(): void {
    const n = this.mobs.length;
    for (let i = 0; i < n; i++) {
      const a = this.mobs[i]; if (!a || a.state === 'downed' || !a.char.root.isEnabled()) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.mobs[j]; if (!b || b.state === 'downed' || !b.char.root.isEnabled()) continue;
        const pa = a.char.root.position, pb = b.char.root.position;
        let dx = pb.x - pa.x, dz = pb.z - pa.z;
        let d2 = dx * dx + dz * dz;
        if (d2 >= BODY_SPACING * BODY_SPACING) continue;
        if (d2 < 1e-6) { dx = (i % 2 ? 1 : -1) * 0.02; dz = (j % 2 ? 1 : -1) * 0.02; d2 = dx * dx + dz * dz; }   // exactly co-located: any direction beats none
        const d = Math.sqrt(d2), push = (BODY_SPACING - d) * 0.5, ux = dx / d, uz = dz / d;
        pa.x -= ux * push; pa.z -= uz * push;
        pb.x += ux * push; pb.z += uz * push;
      }
    }
  }
  dispose(): void { this.mobs.forEach((m) => m.char.dispose()); this.mobs = []; }
  disposeAll(): void { this.mobs.forEach((m) => m.char.dispose()); this.mobs = []; this.cursor = 0; }
}
