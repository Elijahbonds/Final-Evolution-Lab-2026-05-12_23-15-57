/**
 * The test yard's small runtime (A4): the camp, the gate, the boss and the yard's reset. Pure — it runs in the host's
 * events stage (AdventureHost.onTick), so a headless test plays the yard exactly as the page does.
 *
 *   start      the camp's ten monsters spawn; the gate is shut; the boss is not in the scene (the body budget).
 *   cleared    when every camp monster is down, the downed bodies are cleared away after CORPSE_SEC, the gate drops
 *              and the boss spawns in the arena.
 *   the boss   down → after RESET_SEC it is cleared away and the camp returns; the gate shuts again once the player is
 *              back out of the arena (never on top of them).
 *   the party  a player or partner who bleeds out (A3's DownRevive) is stood up at the spawn: a sandbox never ends.
 * [TUNE] every timer.
 */

import type { ActorId, AdventureActor } from '../contracts';
import { MONSTERS } from '../combat/monsters/defs';
import { PLACEHOLDER_BOSS } from '../combat/bosses/defs';
import type { AdventureHost } from '../host/AdventureHost';
import type { SandboxSpec } from './sandbox';

/** Seconds a downed monster lies before it is cleared away. [TUNE] */
export const CORPSE_SEC = 3;
/** Seconds after the boss falls before the yard resets. [TUNE] */
export const RESET_SEC = 8;

export type YardPhase = 'camp' | 'arena' | 'reset';

export class SandboxRuntime {
  phase: YardPhase = 'camp';
  /** Times the camp was cleared and the boss beaten (the HUD's and the tests' counters). */
  campsCleared = 0;
  bossesBeaten = 0;
  private downAt = new Map<ActorId, number>();
  private bossDownAt: number | null = null;
  private off: (() => void) | null = null;

  constructor(private readonly host: AdventureHost, readonly spec: SandboxSpec) {}

  /** Spawn the camp and hook the host's events stage. */
  start(): void {
    this.spawnCamp();
    this.spec.gate.off = false;
    this.off = this.host.onTick(() => this.tick());
  }

  get gateOpen(): boolean { return !!this.spec.gate.off; }

  private spawnCamp(): void {
    for (const c of this.spec.camp) {
      if (this.host.world.actors.has(c.id)) continue;
      this.host.spawnMonster(MONSTERS[c.type], c.id, c.pos);
    }
    this.phase = 'camp';
  }

  private campAlive(): number {
    let n = 0;
    for (const c of this.spec.camp) {
      const a = this.host.world.actors.get(c.id);
      if (a && a.stats.hp.cur > 0) n++;
    }
    return n;
  }

  private tick(): void {
    const host = this.host, t = host.tSec;
    // clear downed monsters away after a beat (they still count against the body budget while they lie there)
    for (const c of this.spec.camp) {
      const a = host.world.actors.get(c.id);
      if (!a) continue;
      if (a.stats.hp.cur > 0) { this.downAt.delete(c.id); continue; }
      const since = this.downAt.get(c.id);
      if (since === undefined) this.downAt.set(c.id, t);
      else if (t - since >= CORPSE_SEC) { host.despawn(c.id); this.downAt.delete(c.id); }
    }
    if (this.phase === 'camp' && this.campAlive() === 0 && this.spec.camp.every((c) => !host.world.actors.has(c.id))) {
      this.campsCleared++;
      this.spec.gate.off = true;
      if (!host.world.actors.has(this.spec.boss.id)) host.spawnBoss(PLACEHOLDER_BOSS, this.spec.boss.id, this.spec.boss.pos);
      this.phase = 'arena';
    }
    if (this.phase === 'arena') {
      const boss = host.world.actors.get(this.spec.boss.id);
      if (boss && !(boss.stats.hp.cur > 0)) {
        if (this.bossDownAt === null) { this.bossDownAt = t; this.bossesBeaten++; }
        else if (t - this.bossDownAt >= RESET_SEC) {
          host.despawn(this.spec.boss.id);
          this.bossDownAt = null;
          this.phase = 'reset';
        }
      }
    }
    if (this.phase === 'reset') {
      this.spawnCamp();
    }
    // the gate shuts again once the camp is back and the player is out of the arena
    if (this.phase === 'camp' && this.spec.gate.off && host.player.pos.z < this.spec.gate.minZ - 4) this.spec.gate.off = false;
    // a bled-out party member stands up at the spawn (a spawn's writes)
    for (const a of [host.player, host.partnerActor]) if (a) this.standUpIfLost(a);
  }

  private standUpIfLost(a: AdventureActor): void {
    const fell = a.pos.y < -30;
    if (!fell) return;
    const s = a.id === this.host.playerId ? this.spec.player : this.spec.partner;
    a.pos.x = s.pos.x; a.pos.y = s.pos.y; a.pos.z = s.pos.z;
    a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
  }

  /**
   * A party member bled out: back on their feet at the spawn (a spawn's writes for the place; the hp through the
   * `revive` event, which A2 applies on its next step — hp is A2's field).
   */
  bledOut(id: ActorId): void {
    const a = this.host.world.actors.get(id);
    if (!a) return;
    const s = id === this.host.playerId ? this.spec.player : this.spec.partner;
    a.pos.x = s.pos.x; a.pos.y = s.pos.y; a.pos.z = s.pos.z;
    a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
    this.host.bus.emit('revive', { actorId: id, byId: id, hpRatio: 1 });
  }

  dispose(): void { this.off?.(); this.off = null; }
}
