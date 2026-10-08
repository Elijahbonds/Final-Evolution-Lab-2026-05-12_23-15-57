/**
 * The story's world runtime (Phase B; A4's SandboxRuntime pattern): what happens in the story's worlds between the
 * beats, run in the host's events stage (AdventureHost.onTick) so a headless test plays it exactly as the page does.
 * It is also the chapter runner's `StoryPort`.
 *
 *   encounters   a beat's camp or boss spawns when its beat starts (A2's defs through the story bestiary); a downed
 *                body is cleared away after CORPSE_SEC (it still counts against the body budget while it lies there).
 *                A 'world' encounter (the chain's wisps) lives while the player is near it.
 *   falls        a body below its world's kill height: the party back at the checkpoint (`story.checkpoint`).
 *   bleed-out    the party back at the checkpoint, stood up through the `revive` event (hp is A2's field).
 *   the partner  catches up (KH-style) when it falls or is left CATCHUP_M behind: it reappears beside the player.
 *   free roam    with no chapter beat waiting on it, an OPEN gate the player walks into warps the party to its spawn.
 * A respawn and a warp are a spawn's writes (position, velocity, facing, the movement state reset): the field-
 * ownership test charges them to the host, as it does the sandbox's.
 * Pure. [TUNE] every timer and distance.
 */

import type { ActorId, AdventureActor, CameraHint, Element, Vec3 } from '../../contracts';
import type { AdventureHost } from '../../host/AdventureHost';
import type { MonsterArchetype } from '../../combat/monsters/defs';
import { STORY_BESTIARY, STORY_BOSSES } from '../ch1/bestiary';
import { encounterOf, spawnOf, findSpawn, type StoryMap } from './storyMap';
import type { EncounterSpec } from './spec';
import type { HubGates } from '../../story/gates';
import type { CutsceneFocus } from '../../story/format';
import type { StoryPort } from '../../story/chapter';
import { flightUnlockedIn } from '../../story/flags';

/** Seconds a downed monster lies before it is cleared away. [TUNE] */
export const CORPSE_SEC = 3;
/** The partner is brought to the player's side past this distance (planar), or when it falls. [TUNE] */
export const CATCHUP_M = 32;
/** Seconds a warp through a gate cannot repeat (stepping out of the arrival gate). [TUNE] */
export const GATE_COOLDOWN_SEC = 2;
/** How often 'world' encounters check the player's distance, in ticks. [TUNE] */
export const WORLD_ENC_EVERY = 15;

export interface StoryRuntimeHooks {
  /** The party was put back at the checkpoint (the chapter runner re-fuses a flight home). */
  onRespawn?: (why: 'fall' | 'bleedout') => void;
  /** The party warped (a gate): the camera snaps. */
  onWarp?: (worldId: string, spawnId: string) => void;
  /** The progress is worth keeping now. */
  onSave?: (reason: 'beat' | 'checkpoint' | 'chapter') => void;
  /** True while a chapter beat is running (free-roam gates step aside for the story's own gate objective). */
  storyActive?: () => boolean;
  /** The chapters reached so far (a gate's `opensWith`). */
  reached?: (chapterId: string) => boolean;
}

interface Live { spec: EncounterSpec; ids: ActorId[]; bossId: string | null }

export class StoryRuntime implements StoryPort {
  respawns = 0;
  warps = 0;
  private readonly live = new Map<string, Live>();
  private readonly world = new Map<string, Live>();
  private readonly downAt = new Map<ActorId, number>();
  private readonly archetypes = new Map<ActorId, MonsterArchetype | 'boss'>();
  private gateQuietUntil = -Infinity;
  private tickN = 0;
  private off: (() => void) | null = null;
  private readonly tmp: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly host: AdventureHost, readonly map: StoryMap, readonly gates: HubGates, private readonly hooks: StoryRuntimeHooks = {}) {}

  start(): void { this.off = this.host.onTick(() => this.tick()); }
  dispose(): void { this.off?.(); this.off = null; }

  /** The view's question: what placeholder body a monster id wears. */
  archetypeOf(id: ActorId): MonsterArchetype | 'boss' | null { return this.archetypes.get(id) ?? null; }

  // ── the port ──

  playerPos(): Readonly<Vec3> { return this.host.player.pos; }
  playerGrounded(): boolean { const p = this.host.player; return p.grounded || p.state === 'ground'; }

  focusOf(f: CutsceneFocus, spawnId?: string): { pos: Vec3; yaw: number } {
    const p = this.host.player;
    if (f === 'partner') {
      const q = this.host.partnerActor;
      if (q && !q.fusion.active) return { pos: { ...q.pos }, yaw: q.facingYaw };
    } else if (f === 'boss') {
      for (const a of this.host.world.actors.values()) if (a.kind === 'boss') return { pos: { ...a.pos }, yaw: a.facingYaw };
    } else if (f === 'spawn' && spawnId) {
      const s = findSpawn(this.map, spawnId);
      if (s) return { pos: { ...s.spawn.pos }, yaw: s.spawn.yaw };
    }
    return { pos: { ...p.pos }, yaw: p.facingYaw };
  }

  spawnPos(worldId: string, spawnId: string): Readonly<Vec3> | null { return spawnOf(this.map, worldId, spawnId)?.pos ?? null; }

  warpParty(worldId: string, spawnId: string): void {
    const s = spawnOf(this.map, worldId, spawnId);
    if (!s) return;
    this.place(this.host.player, s.pos, s.yaw);
    const q = this.host.partnerActor;
    if (q && !q.fusion.active) this.placeBeside(q, s.pos, s.yaw);
    this.warps++;
    this.gateQuietUntil = this.host.tSec + GATE_COOLDOWN_SEC;
    this.hooks.onWarp?.(worldId, spawnId);
  }

  gateAt(): { id: string; open: boolean } | null {
    const a = this.gates.at(this.host.player.pos, { flight: flightUnlockedIn(this.host.save.story.flags), reached: (id) => this.hooks.reached?.(id) ?? true });
    return a ? { id: a.gate.id, open: a.open } : null;
  }

  startEncounter(id: string): void {
    const e = encounterOf(this.map, id);
    if (!e || this.live.has(id)) return;
    this.live.set(id, this.spawnEncounter(e.enc));
  }

  encounterCleared(id: string): boolean {
    const l = this.live.get(id);
    if (!l) return false;
    for (const aid of l.ids) {
      const a = this.host.world.actors.get(aid);
      if (a && a.stats.hp.cur > 0) return false;
    }
    return true;
  }

  bossOf(encounterId: string): string | null { return encounterOf(this.map, encounterId)?.enc.boss?.id ?? null; }

  storyFuse(): void { this.host.partner?.storyFuse(); }
  fused(): boolean { return this.host.player.fusion.active; }
  partnerName(): string { return this.host.partnerDefNow()?.name ?? 'PARTNER'; }
  partnerElement(): Element { return this.host.partnerDefNow()?.element ?? 'light'; }
  grantXp(amount: number): void { if (amount > 0) this.host.bus.emit('xp', { actorId: this.host.playerId, amount, source: 'story' }); }
  save(reason: 'beat' | 'checkpoint' | 'chapter'): void { this.hooks.onSave?.(reason); }

  /** Clear away every downed encounter body now (a scene is starting). */
  clearFallen(): void {
    for (const l of [...this.live.values(), ...this.world.values()]) {
      for (const id of l.ids) {
        const a = this.host.world.actors.get(id);
        if (a && !(a.stats.hp.cur > 0)) { this.host.despawn(id); this.downAt.delete(id); }
      }
    }
  }

  /** How many bodies are in the scene now (the body budget). */
  bodies(): number { return this.host.world.actors.size; }

  /**
   * A party member bled out (no revive in time). The PLAYER: the party back at the checkpoint, stood up. The PARTNER:
   * it catches up beside the player, stood up (the player's run goes on). The hp goes through `revive` (A2's field).
   */
  bledOut(id: ActorId): void {
    const host = this.host;
    if (id === host.partnerId) {
      const q = host.partnerActor, p = host.player;
      if (q && !q.fusion.active) this.placeBeside(q, p.pos, p.facingYaw);
      host.bus.emit('revive', { actorId: id, byId: host.playerId, hpRatio: 1 });
      return;
    }
    this.respawnParty('bleedout');
    host.bus.emit('revive', { actorId: id, byId: id, hpRatio: 1 });
    const q = host.partnerActor;
    if (q && !(q.stats.hp.cur > 0)) host.bus.emit('revive', { actorId: q.id, byId: id, hpRatio: 1 });
  }

  // ── the events stage ──

  private tick(): void {
    const host = this.host, t = host.tSec;
    this.tickN++;
    // corpses: a downed monster or boss is cleared away after a beat
    for (const l of this.live.values()) this.sweep(l, t);
    for (const l of this.world.values()) this.sweep(l, t);
    // the chain's wisps (and any 'world' encounter) live while the player is near
    if (this.tickN % WORLD_ENC_EVERY === 1) this.worldEncounters();
    // falls
    const p = host.player;
    if (p.pos.y < this.killYAt(p.pos)) { this.respawnParty('fall'); return; }
    const q = host.partnerActor;
    if (q && !q.fusion.active && !q.ridingId && p.ridingId !== q.id) {
      const far = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) > CATCHUP_M;
      if (q.pos.y < this.killYAt(q.pos) || (far && (p.grounded || p.state === 'ground'))) this.placeBeside(q, p.pos, p.facingYaw);
    }
    // free roam: an open gate warps (the story's own gate objective is the chapter runner's)
    if (!this.hooks.storyActive?.() && t >= this.gateQuietUntil) {
      const g = this.gateAt();
      const spec = g?.open ? this.gates.spec(g.id) : null;
      if (spec?.to) this.warpParty(spec.to.worldId, spec.to.spawnId);
    }
  }

  private sweep(l: Live, t: number): void {
    for (const id of l.ids) {
      const a = this.host.world.actors.get(id);
      if (!a) continue;
      if (a.stats.hp.cur > 0) { this.downAt.delete(id); continue; }
      const since = this.downAt.get(id);
      if (since === undefined) this.downAt.set(id, t);
      else if (t - since >= CORPSE_SEC) { this.host.despawn(id); this.downAt.delete(id); }
    }
  }

  private worldEncounters(): void {
    const p = this.host.player.pos;
    for (const w of this.map.worlds.values()) {
      for (const e of w.encounters) {
        if (e.life !== 'world') continue;
        const near = e.nearM ?? 60;
        let cx = 0, cz = 0;
        for (const m of e.monsters) { cx += m.pos.x; cz += m.pos.z; }
        cx /= Math.max(1, e.monsters.length); cz /= Math.max(1, e.monsters.length);
        const d = Math.hypot(p.x - cx, p.z - cz);
        const live = this.world.get(e.id);
        if (!live && d <= near) this.world.set(e.id, this.spawnEncounter(e));
        else if (live && d > near + 20) {
          for (const id of live.ids) { this.host.despawn(id); this.downAt.delete(id); }
          this.world.delete(e.id);
        }
      }
    }
  }

  private spawnEncounter(e: EncounterSpec): Live {
    const ids: ActorId[] = [];
    for (const m of e.monsters) {
      const def = STORY_BESTIARY[m.def];
      if (!def || this.host.world.actors.has(m.id)) continue;
      this.host.spawnMonster(def, m.id, m.pos, { fly: !!m.fly });
      this.archetypes.set(m.id, def.archetype);
      ids.push(m.id);
    }
    let bossId: string | null = null;
    if (e.boss) {
      const def = STORY_BOSSES[e.boss.def];
      if (def && !this.host.world.actors.has(e.boss.id)) {
        this.host.spawnBoss(def, e.boss.id, e.boss.pos);
        this.archetypes.set(e.boss.id, 'boss');
        ids.push(e.boss.id);
        bossId = e.boss.id;
      }
    }
    return { spec: e, ids, bossId };
  }

  private killYAt(p: Vec3): number {
    for (const w of this.map.worlds.values()) {
      const a = w.area;
      if (p.x >= a.minX && p.x <= a.maxX && p.z >= a.minZ && p.z <= a.maxZ) return w.killY;
    }
    return -30;
  }

  private respawnParty(why: 'fall' | 'bleedout'): void {
    const cp = this.host.save.story.checkpoint ?? { worldId: this.map.hubId, spawnId: 'hub.home' };
    const s = spawnOf(this.map, cp.worldId, cp.spawnId) ?? spawnOf(this.map, this.map.hubId, 'hub.home');
    if (!s) return;
    this.place(this.host.player, s.pos, s.yaw);
    const q = this.host.partnerActor;
    if (q && !q.fusion.active) this.placeBeside(q, s.pos, s.yaw);
    this.respawns++;
    this.gateQuietUntil = this.host.tSec + GATE_COOLDOWN_SEC;
    this.hooks.onRespawn?.(why);
  }

  /** A spawn's writes: the body at a spot, still, facing `yaw`, its traversal state forgotten. */
  private place(a: AdventureActor, pos: Vec3, yaw: number): void {
    a.pos.x = pos.x; a.pos.y = pos.y; a.pos.z = pos.z;
    a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
    a.facingYaw = yaw;
    if (!a.ridingId) {
      a.rail = null; a.state = 'ground'; a.stateSec = 0; a.grounded = true; a.wantsFlight = false;
      this.host.movement.reset(a.id);
    }
  }

  /** The partner beside a spot (to its right, a step back). */
  private placeBeside(q: AdventureActor, pos: Vec3, yaw: number): void {
    const t = this.tmp;
    t.x = pos.x + Math.cos(yaw) * 1.6 - Math.sin(yaw) * 1.2;
    t.y = pos.y;
    t.z = pos.z - Math.sin(yaw) * 1.6 - Math.cos(yaw) * 1.2;
    const g = this.host.world.groundY(t.x, t.z);
    if (g === null) { t.x = pos.x; t.z = pos.z; } else t.y = g;
    this.place(q, t, yaw);
  }

  /** The camera hint a cutscene holds (the host's camera reads `cutscene`). */
  static readonly CUTSCENE_HINT: CameraHint = { preset: 'cutscene', priority: 100 };
}
