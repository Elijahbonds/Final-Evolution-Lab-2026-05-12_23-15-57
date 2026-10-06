/**
 * AdventureHost (ADVENTURE PLAN A4, "How a mode hosts it"): the one object that runs the Adventure's simulation. It
 * owns the world, the actors, the bus, the inputs, the clock and the five systems, and it steps them in the plan's order
 * at a fixed 60 Hz:
 *
 *   input (the player's mapper, any other input source) → partner brain (A3) → movement (A1) → combat (A2) →
 *   magic (A2) → stats (A3) → events (the host's own end-of-step: the camera's hint, the tick listeners)
 *
 * and AdventureMode syncs the views once per rendered frame after `frame()`. Only the host owns the clock: slow-time
 * and hit-stop reach it as `time:scale` requests (contracts v2 semantics, host/clock.ts), the systems receive the
 * unscaled fixed dt and apply `timeScaleOf` per actor.
 *
 * Pure: no Babylon, no DOM, no wall clock (the caller hands `frame()` real seconds), no Math.random (one seed feeds
 * every system's generator). The same seed and the same input script replay the same run, which is what lets the BR's
 * host hand the sim to another browser and the dedicated server run it in Node later.
 *
 * ALLOCATION. The step context, the input objects and the camera's hint records are made once. A step allocates only
 * what the lanes' systems do (their own audits: A1 none per body, A2 none per tell, A3 none per brain tick).
 */

import {
  createAdventureBus, neutralInput, NO_FUSION, type ActorId, type ActorKind, type AdventureActor, type AdventureBus,
  type AdventureSave, type AdventureStepContext, type AdventureSystem, type CameraHint, type MoveInput, type PartnerDef,
  type PrqBand, type SpellDef, type Vec3,
} from '../contracts';
import type { PrqAttr } from '@/lib/prq';
import { createMovementSystem, mountSpecFromPartner, type MovementSystem } from '../movement';
import { createCombatSystem, type CombatSystem } from '../combat';
import type { MonsterDef } from '../combat/monsters/defs';
import { createMonsterActor } from '../combat/monsters/defs';
import type { BossDef } from '../combat/bosses/defs';
import { createMagicSystem, type MagicSystem } from '../magic';
import type { SpellLoadout } from '../magic/cast';
import { createPartnerSystem, partnerGear, type PartnerSystem } from '../partner';
import { actorStatsFrom, createStatsSystem, deriveActorStats, statsSetupForParty, type StatsSystem } from '../stats';
import { withProgress } from '../save/save';
import { AdventureCamera } from './camera';
import { HostClock } from './clock';
import { HostWorld, type WorldSource } from './hostWorld';

export interface Spawn { pos: Vec3; yaw: number }

export interface AdventureHostOptions {
  world: WorldSource;
  /** The save the party is built from (A3's sanitised document). Its partner, when present, spawns beside the player. */
  save: AdventureSave;
  playerId?: ActorId;
  partnerId?: ActorId;
  playerSpawn?: Spawn;
  partnerSpawn?: Spawn;
  /** One seed for every system's generator. */
  seed?: number;
  /** PRQ band and attributes (ModeContext.prqBand; absent = a guest = READY). */
  band?: PrqBand | null;
  prqAttrs?: Partial<Record<PrqAttr, number>> | null;
  /** The spell table (default: A2's starter table). */
  spells?: readonly SpellDef[];
  /** The save's Mirror setting. */
  mirror?: boolean;
  /** A system threw inside a bus handler (the bus isolates it; the host reports it). Default: console.error. */
  onError?: (e: unknown) => void;
  /** A downed party member bled out with no revive (A3's DownRevive). The sandbox stands them up again. */
  onBleedOut?: (id: ActorId) => void;
  /**
   * The player's spell book, when it is not the save's (the sandbox lends one without writing it into the save).
   * Default: `save.player.spells` (known and equipped, learned through the story).
   */
  loadout?: SpellLoadout | null;
  /** Every body passes through this as it enters the world (the ownership test's write tracker). Default: itself. */
  instrument?: (a: AdventureActor) => AdventureActor;
}

/** What a tick listener sees (the host's "events" stage, after the systems). */
export type TickListener = (host: AdventureHost) => void;

const EDGES = ['jump', 'dash', 'attackLight', 'attackHeavy', 'lock', 'magic', 'partner', 'fuse'] as const;

export class AdventureHost {
  readonly bus: AdventureBus;
  readonly world: HostWorld;
  readonly clock = new HostClock();
  readonly camera = new AdventureCamera();
  readonly inputs = new Map<ActorId, MoveInput>();
  readonly playerId: ActorId;
  readonly partnerId: ActorId | null;
  readonly movement: MovementSystem;
  readonly combat: CombatSystem;
  readonly magic: MagicSystem;
  readonly stats: StatsSystem;
  readonly partner: PartnerSystem | null;
  /** The systems in the plan's step order (partner → movement → combat → magic → stats). */
  readonly systems: readonly AdventureSystem[];
  readonly save: AdventureSave;
  /** Errors the bus isolated (a lane's handler threw). */
  readonly errors: unknown[] = [];
  /** The player's spell book as the magic system reads it (the save's, or the one the host was lent). */
  readonly loadout: SpellLoadout;

  private readonly ctx: AdventureStepContext;
  private readonly sources = new Map<ActorId, (out: MoveInput) => void>();
  private readonly ownedInputs = new Set<ActorId>();
  private readonly listeners: TickListener[] = [];
  private readonly onError: (e: unknown) => void;
  private partnerDef: PartnerDef | null;
  private readonly instrument: (a: AdventureActor) => AdventureActor;
  private disposed = false;

  constructor(o: AdventureHostOptions) {
    this.onError = o.onError ?? ((e) => { console.error('[adventure] a system threw in a bus handler', e); });
    this.bus = createAdventureBus((e) => { this.errors.push(e); this.onError(e); });
    this.instrument = o.instrument ?? ((a) => a);
    this.world = new HostWorld(o.world);
    this.save = o.save;
    this.playerId = o.playerId ?? 'player';
    this.partnerDef = o.save.partner ? JSON.parse(JSON.stringify(o.save.partner)) as PartnerDef : null;
    this.partnerId = this.partnerDef ? o.partnerId ?? 'partner' : null;
    const seed = (o.seed ?? 0x5eed) >>> 0;

    // ── the party ──
    const setups = statsSetupForParty({ save: o.save, playerId: this.playerId, partnerId: this.partnerId, band: o.band ?? null, prqAttrs: o.prqAttrs ?? null });
    const pSetup = setups[0];
    const pDerived = deriveActorStats({
      level: o.save.player.level, band: pSetup.band, attrs: pSetup.attrs, training: pSetup.progress?.training,
      school: pSetup.school, element: pSetup.element,
    });
    const ps = o.playerSpawn ?? { pos: { x: 0, y: 0, z: 0 }, yaw: 0 };
    this.addActor(this.makeBody(this.playerId, 'player', 0, ps, actorStatsFrom(pDerived)));
    if (this.partnerDef && this.partnerId) {
      const qDerived = deriveActorStats({
        level: pDerived.level, band: null, attrs: this.partnerDef.attrs, element: this.partnerDef.element, gear: partnerGear(this.partnerDef),
      });
      const qs = o.partnerSpawn ?? { pos: { x: ps.pos.x + 1.6, y: ps.pos.y, z: ps.pos.z - 1.2 }, yaw: ps.yaw };
      const q = this.addActor(this.makeBody(this.partnerId, 'partner', 0, qs, actorStatsFrom(qDerived)));
      q.radius = 0.5;
    }

    // ── the systems ──
    this.stats = createStatsSystem({ actors: setups, mirror: o.mirror === true });
    const partnerId = this.partnerId;
    const def = this.partnerDef;
    this.partner = def && partnerId
      ? createPartnerSystem({ playerId: this.playerId, partnerId, def, stats: this.stats, seed: seed ^ 0xa3, onBleedOut: (id) => o.onBleedOut?.(id) })
      : null;
    const partner = this.partner;
    this.movement = createMovementSystem({
      mountCanFly: (id) => !!partner && partner.mountCanFly(id),
      mountSpecOf: (id) => (partner && id === partnerId ? mountSpecFromPartner(partner.def()) : null),
      localId: this.playerId,
      seed: seed ^ 0xa1,
    });
    this.combat = createCombatSystem({ localPlayerId: this.playerId, seed: seed ^ 0xa2 });
    const loadout: SpellLoadout = o.loadout ?? o.save.player.spells;
    this.loadout = loadout;
    this.magic = createMagicSystem({
      spells: o.spells,
      loadoutOf: (a) => (a.id === this.playerId ? loadout : null),
    });
    this.systems = partner
      ? [partner, this.movement, this.combat, this.magic, this.stats]
      : [this.movement, this.combat, this.magic, this.stats];

    // ── inputs: the player's (filled by its source each step), the partner's (its brain writes it) ──
    this.inputs.set(this.playerId, neutralInput());
    this.ownedInputs.add(this.playerId);
    if (partner && partnerId) this.inputs.set(partnerId, neutralInput());

    // ── the clock listens for time:scale ──
    this.bus.on('time:scale', (e) => this.clock.request(e));

    const camera = this.camera;
    this.ctx = {
      tSec: 0,
      world: this.world,
      inputs: this.inputs,
      bus: this.bus,
      timeScaleOf: (id) => this.clock.scaleOf(id),
      hint: (h: CameraHint) => camera.offer(h),
    };
  }

  // ── actors ──

  get player(): AdventureActor { return this.world.actors.get(this.playerId)!; }
  get partnerActor(): AdventureActor | null { return this.partnerId ? this.world.actors.get(this.partnerId) ?? null : null; }
  get tSec(): number { return this.clock.tSec; }
  /** The partner's def as the partner system holds it (bond and growth included), or null. */
  partnerDefNow(): PartnerDef | null { return this.partner ? this.partner.def() : this.partnerDef; }

  /** A plain body at a spawn (the spawner's fields; stats from the caller). */
  makeBody(id: ActorId, kind: ActorKind, team: number, s: Spawn, stats: AdventureActor['stats']): AdventureActor {
    return {
      id, kind, team, pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z }, vel: { x: 0, y: 0, z: 0 }, facingYaw: s.yaw,
      grounded: true, state: 'ground', stateSec: 0, radius: 0.4, height: 1.8, stats, lock: null, stunSec: 0,
      iframeSec: 0, impulse: null, rail: null, ridingId: null, wantsFlight: false, fusion: { ...NO_FUSION }, partnerId: null,
    };
  }

  addActor(a: AdventureActor): AdventureActor { return this.world.add(this.instrument(a)); }

  /** Spawn a monster from A2's def and give its brain's intent a seat in the inputs. `fly` spawns it on the wing. */
  spawnMonster(def: MonsterDef, id: ActorId, pos: Vec3, o: { fly?: boolean } = {}): AdventureActor {
    const body = createMonsterActor(def, id, pos);
    if (def.hoverM > 0 || o.fly) { body.canFly = true; body.wantsFlight = true; body.grounded = false; body.state = 'air'; }
    const a = this.addActor(body);
    this.combat.registerMonster(a, def);
    const ai = this.combat.aiInputs.get(id);
    if (ai) this.inputs.set(id, ai);
    return a;
  }

  spawnBoss(def: BossDef, id: ActorId, pos: Vec3): AdventureActor {
    const a = this.addActor(createMonsterActor(def, id, pos, { kind: 'boss' }));
    this.combat.registerBoss(a, def);
    const ai = this.combat.aiInputs.get(id);
    if (ai) this.inputs.set(id, ai);
    return a;
  }

  /** Take a body out of the world (a monster cleared away, a respawn). */
  despawn(id: ActorId): void {
    if (id === this.playerId || id === this.partnerId) return;
    this.combat.unregister(id);
    this.movement.reset(id);
    this.inputs.delete(id);
    this.world.remove(id);
  }

  /** Who fills `id`'s MoveInput at the input stage of each step (the player's mapper). The host owns that input. */
  setInputSource(id: ActorId, fill: ((out: MoveInput) => void) | null): void {
    if (fill) {
      this.sources.set(id, fill);
      if (!this.inputs.has(id)) this.inputs.set(id, neutralInput());
      this.ownedInputs.add(id);
    } else this.sources.delete(id);
  }

  /** Listen to the host's events stage (after every step's systems). Returns the unsubscribe. */
  onTick(fn: TickListener): () => void {
    this.listeners.push(fn);
    return () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); };
  }

  timeScaleOf(id: ActorId): number { return this.clock.scaleOf(id); }

  /** Freeze the sim for `sec` of real time (a heavy connect, a parry). */
  hitStop(sec: number): void { this.clock.hitStop(sec); }

  // ── stepping ──

  /** One rendered frame: run as many fixed steps as `realDt` seconds hold. Returns the steps run. */
  frame(realDt: number): number {
    if (this.disposed) return 0;
    const n = this.clock.stepsFor(realDt);
    for (let i = 0; i < n; i++) this.tick();
    return n;
  }

  /** One fixed step, in the plan's order. */
  tick(): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    ctx.tSec = this.clock.tSec;
    // input
    for (const [id, fill] of this.sources) { const inp = this.inputs.get(id); if (inp) fill(inp); }
    this.world.reindex();
    const dt = this.clock.stepSec;
    const sys = this.systems;
    for (let i = 0; i < sys.length; i++) {
      const s = sys[i];
      // the grid follows movement before the systems that ask near() about where bodies are now
      if (s === this.combat) this.world.reindex();
      s.step(ctx, dt);
    }
    // events: the camera's hint for the step, then the listeners
    this.camera.endStep(ctx.tSec);
    for (const fn of this.listeners) fn(this);
    // a press lands on exactly one step
    for (const id of this.ownedInputs) {
      const inp = this.inputs.get(id);
      if (!inp) continue;
      for (const e of EDGES) inp[e] = false;
      inp.magicSlot = null;
    }
    this.clock.advance();
  }

  /** The save with this session's progress folded in (A3's withProgress): the player's XP and training, the partner. */
  progressSave(): AdventureSave {
    return withProgress(this.save, { player: this.stats.progress(this.playerId), partner: this.partnerDefNow() });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.systems) s.dispose?.();
    this.listeners.length = 0;
    this.sources.clear();
  }
}
