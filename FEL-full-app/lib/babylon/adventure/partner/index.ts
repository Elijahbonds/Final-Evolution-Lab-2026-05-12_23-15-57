/**
 * The partner system (ADVENTURE PLAN A3, 2026-10-06): the second sim step of a tick (input → PARTNER BRAIN →
 * movement → combat and magic → stats). One player and their partner, a creature or a character.
 *
 * Each step, in order:
 *   1. the player's partner button cycles the command (follow → engage → guard me);
 *   2. the player's fuse button fuses (meter full, bond tier ≥ 1, the energy) or unfuses; a press it uses is CONSUMED
 *      (`fuse` cleared on the player's MoveInput) so A1 does not also read it as mount / dismount. A press it does not
 *      use (riding, a short meter, beside a rideable creature) is left for A1;
 *   3. the fusion clock: out of time, or the player knocked out, unfuses; while fused, the hidden partner travels
 *      inside the player (see "contract request" below);
 *   4. down and revive (OnslaughtCore.DownRevive): a downed player is revived by the partner standing in range for the
 *      channel; a downed partner by the player standing still beside it. The REVIVE itself (hp back) is A2's field, so
 *      it is handed out through `onRevive`; bleeding out through `onBleedOut`;
 *   5. the brain thinks (partner/brain.ts) and its MoveInput is written in place: `system.input`, and the host's map
 *      entry for the partner when it has one.
 * On the bus: damage the party lands together fills the fusion meter; enemies the party fells together grow the bond;
 * a creature trains from the party's play and evolves at the Garden's thresholds (partner/evolution.ts).
 *
 * FIELDS IT WRITES (A3's): `fusion` and `partnerId` on both actors, and (contracts v2) the partner's `pos`/`vel` while
 * its fusion is active and at the moment it unfuses (its body is inside the player, and reappears beside them) — A1's
 * fields otherwise; A1 skips a partner whose fusion is active. A revive goes out as the `revive` event (A2 applies it).
 * A player HOLDING interact (`MoveInput.interactHeld`, v2) beside a downed partner revives it while moving too.
 */
import { DownRevive, REVIVE_CHANNEL_SEC, REVIVE_RANGE } from '@/lib/babylon/core/OnslaughtCore';
import type { Companion } from '@/lib/babylon/core/EvolutionGarden';
import {
  partnerCanCarry, type ActorId, type AdventureActor, type AdventureBus, type AdventureEventName, type AdventureEvents,
  type AdventureStepContext, type AdventureSystem, type AdventureWorld, type MoveInput, type PartnerDef,
} from '../contracts';
import { PARTNER_COMMANDS, PartnerBrain, copyMoveInput, type BrainMode, type PartnerCommand } from './brain';
import { companionOf, trainCreature, trainingEventsFor } from './evolution';
import {
  BOND_MAX, BOND_PER_FUSION, BOND_PER_SHARED_KO, FUSION_TOGETHER_RADIUS_M, beginFusion, endFusion, fillFusionMeter,
  fuseRefusal, syncIdleTier, tickFusion, type FuseRefusal,
} from './fusion';
import { partnerGear } from './defs';

export * from './brain';
export * from './defs';
export * from './evolution';
export * from './fusion';
export * from './identity';

/** [TUNE] Where an unfused partner reappears: this far to the player's right. */
export const UNFUSE_SIDE_M = 1.2;
/** [TUNE] The player "stands still" to revive the partner below this stick magnitude. */
export const REVIVE_STILL_STICK = 0.2;

export interface ReviveRequest { actorId: ActorId; byId: ActorId; hpRatio: number }

export interface PartnerSystemOptions {
  playerId: ActorId;
  partnerId: ActorId;
  /** The partner (from the save). The system keeps and mutates THIS object (bond, a creature's growth); save it back. */
  def: PartnerDef;
  command?: PartnerCommand;
  /** The brain's seed (strike cadence jitter). */
  seed?: number;
  /** The stats system, so an evolved creature's maxes re-derive. */
  stats?: { refresh(id: ActorId, patch?: { attrs?: PartnerDef['attrs']; gear?: { hp?: number } }): void } | null;
  /**
   * A downed actor's revive completed. Contracts v2: the system also emits `revive` on the bus, which A2's combat
   * system applies (hp is A2's field) — so a host running combat needs no callback; this stays for a rig without A2.
   */
  onRevive?: (r: ReviveRequest) => void;
  /** A downed actor bled out (DownRevive.BLEED_OUT_SEC) without a revive. */
  onBleedOut?: (actorId: ActorId) => void;
  onEvolve?: (def: PartnerDef, stage: number) => void;
  /**
   * PHASE B (2026-10-07), the story's gates (story/flags.ts; owner: "flight first unlocks after Chapter 1's boss", the
   * first fusion is its finale). Read live each step. Absent = true: the test yard and the BR keep the whole toolkit.
   *   fusionUnlocked  false: the fuse button never fuses (refusal 'locked'); a press is left for A1's mount.
   *   flightUnlocked  false: a fusion does not grant flight, and a flying mount may not take off with a rider.
   */
  fusionUnlocked?: () => boolean;
  flightUnlocked?: () => boolean;
}

export interface PartnerRevive { playerDowned: boolean; partnerDowned: boolean; channel01: number }

export interface PartnerSystem extends AdventureSystem {
  /** The partner's MoveInput this tick (written in place each step). A4 puts this object in the host's input map. */
  readonly input: MoveInput;
  def(): PartnerDef;
  command(): PartnerCommand;
  setCommand(c: PartnerCommand): void;
  brainMode(): BrainMode;
  targetId(): ActorId | null;
  /** Why the last fuse press did nothing (null when it fused, or no press yet). */
  lastFuseRefusal(): FuseRefusal | null;
  revive(): PartnerRevive;
  /** A4 passes this to A1 (createMovementSystem's mountCanFly): may this mount fly with a rider? */
  mountCanFly(mountId: ActorId): boolean;
  /**
   * PHASE B: the story fuses the party (Chapter 1's finale, the first fusion; a flight-travel beat after a respawn). On
   * the next step, once both are standing and the player is not riding, the party fuses whatever the meter, the bond
   * tier or the energy say: the bond is raised to the first tier if it is below it, the meter and the energy are filled
   * (A3's fields), then beginFusion runs with the flight gate as it stands. Idempotent while pending or fused.
   */
  storyFuse(): void;
  /** True while a story fusion waits for its step. */
  storyFusePending(): boolean;
}

/** [TUNE] The bond a story fusion raises a partner to, at least: the first fusion tier (contracts fusionTierFor). */
export const STORY_FUSE_MIN_BOND = 10;

const isDown = (a: AdventureActor): boolean => a.state === 'ko' || a.stats.hp.cur <= 0;

export function createPartnerSystem(opts: PartnerSystemOptions): PartnerSystem {
  const { playerId, partnerId } = opts;
  const def = opts.def;
  const brain = new PartnerBrain(opts.seed ?? 1);
  const companion: Companion | null = companionOf(def);
  const playerDown = new DownRevive();
  const partnerDown = new DownRevive();
  let playerBledOut = false, partnerBledOut = false;
  let command: PartnerCommand = opts.command ?? 'follow';
  let refusal: FuseRefusal | null = null;
  let bus: AdventureBus | null = null;
  let unsubs: (() => void)[] = [];
  let world: AdventureWorld | null = null;
  let linked = false;
  let storyFuse = false;
  const fusionOpen = opts.fusionUnlocked ?? (() => true);
  const flightOpen = opts.flightUnlocked ?? (() => true);

  const isParty = (id: ActorId | null): boolean => id === playerId || id === partnerId;
  const isBoss = (id: ActorId): boolean => world?.actors.get(id)?.kind === 'boss';
  const actor = (id: ActorId): AdventureActor | undefined => world?.actors.get(id);

  function train<K extends AdventureEventName>(name: K, payload: AdventureEvents[K]): void {
    if (!companion) return;
    for (const ev of trainingEventsFor(name, payload, isParty, isBoss)) {
      const r = trainCreature(def, companion, ev);
      if (r.evolved) {
        opts.stats?.refresh(partnerId, { attrs: def.attrs, gear: partnerGear(def) });
        opts.onEvolve?.(def, r.stage);
      }
    }
  }

  function emitFusion(active: boolean): void {
    const p = actor(playerId);
    bus?.emit('fusion', { actorId: playerId, partnerId, active, tier: p?.fusion.tier ?? 0 });
  }

  function unfuse(player: AdventureActor, partner: AdventureActor | undefined): void {
    endFusion(player, partner ?? null);
    if (partner) {
      // reappear beside the player (right = (cos, −sin) of the yaw)
      partner.pos.x = player.pos.x + Math.cos(player.facingYaw) * UNFUSE_SIDE_M;
      partner.pos.y = player.pos.y;
      partner.pos.z = player.pos.z - Math.sin(player.facingYaw) * UNFUSE_SIDE_M;
      partner.vel.x = player.vel.x; partner.vel.y = player.vel.y; partner.vel.z = player.vel.z;
    }
    emitFusion(false);
  }

  function subscribe(b: AdventureBus): void {
    for (const u of unsubs) u();
    bus = b;
    unsubs = [
      b.on('damage', (e) => {
        if (isParty(e.sourceId) && !isParty(e.targetId) && e.outcome === 'hit') {
          const p = actor(playerId);
          if (p) fillFusionMeter(p, actor(partnerId) ?? null, e.amount);
        }
        train('damage', e);
      }),
      b.on('ko', (e) => {
        const victim = actor(e.actorId), p = actor(playerId), q = actor(partnerId);
        if (isParty(e.byId) && victim && !isParty(e.actorId) && victim.kind !== 'npc' && p && q && !isDown(p) && !isDown(q)) {
          const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z;
          if (p.fusion.active || dx * dx + dz * dz <= FUSION_TOGETHER_RADIUS_M * FUSION_TOGETHER_RADIUS_M) {
            def.bond = Math.min(BOND_MAX, def.bond + BOND_PER_SHARED_KO);
          }
        }
        train('ko', e);
      }),
      b.on('rail:trick', (e) => train('rail:trick', e)),
      b.on('homing', (e) => train('homing', e)),
      b.on('spell:cast', (e) => train('spell:cast', e)),
      b.on('mirror:move', (e) => train('mirror:move', e)),
    ];
  }

  function stepRevive(ctx: AdventureStepContext, dt: number, player: AdventureActor, partner: AdventureActor): void {
    const near = (): boolean => {
      const dx = partner.pos.x - player.pos.x, dz = partner.pos.z - player.pos.z;
      return dx * dx + dz * dz <= REVIVE_RANGE * REVIVE_RANGE;
    };
    // the player, revived by the partner
    if (isDown(player)) {
      if (!playerDown.downed) { playerDown.down(ctx.tSec); playerBledOut = false; }
      const reviver = !isDown(partner) && !partner.fusion.active && near();
      if (playerDown.channel(dt, reviver)) {
        const r = { actorId: playerId, byId: partnerId, hpRatio: playerDown.revive() };
        ctx.bus.emit('revive', r);   // contracts v2: A2 restores the hp on its next step
        opts.onRevive?.(r);
      } else if (!playerBledOut && playerDown.bledOut(ctx.tSec)) {
        playerBledOut = true;
        opts.onBleedOut?.(playerId);
      }
    } else if (playerDown.downed) playerDown.revive();   // back up some other way: clear the channel
    // the partner, revived by the player standing still beside it
    if (isDown(partner)) {
      if (!partnerDown.downed) { partnerDown.down(ctx.tSec); partnerBledOut = false; }
      const inp = ctx.inputs.get(playerId);
      const still = !inp || Math.hypot(inp.move.x, inp.move.y) < REVIVE_STILL_STICK;
      if (partnerDown.channel(dt, !isDown(player) && (still || !!inp?.interactHeld) && near())) {
        const r = { actorId: partnerId, byId: playerId, hpRatio: partnerDown.revive() };
        ctx.bus.emit('revive', r);
        opts.onRevive?.(r);
      } else if (!partnerBledOut && partnerDown.bledOut(ctx.tSec)) {
        partnerBledOut = true;
        opts.onBleedOut?.(partnerId);
      }
    } else if (partnerDown.downed) partnerDown.revive();
  }

  return {
    id: 'adventure.partner',
    input: brain.out,

    step(ctx: AdventureStepContext, dt: number): void {
      if (bus !== ctx.bus) subscribe(ctx.bus);
      world = ctx.world;
      const player = ctx.world.actors.get(playerId), partner = ctx.world.actors.get(partnerId);
      if (!player || !partner) return;
      if (!linked) { player.partnerId = partnerId; partner.partnerId = playerId; linked = true; }
      syncIdleTier(player, partner, def.bond, def.element);

      // 1–2. the player's partner and fuse buttons
      const inp = ctx.inputs.get(playerId);
      if (inp?.partner) command = PARTNER_COMMANDS[(PARTNER_COMMANDS.indexOf(command) + 1) % PARTNER_COMMANDS.length];
      if (inp?.fuse) {
        if (player.fusion.active) {
          unfuse(player, partner);
          inp.fuse = false;
          refusal = null;
        } else {
          refusal = fuseRefusal(player, partner, def.bond, fusionOpen());
          if (refusal === null && beginFusion(player, partner, def.bond, def.element, flightOpen()) !== null) {
            def.bond = Math.min(BOND_MAX, def.bond + BOND_PER_FUSION);
            inp.fuse = false;
            emitFusion(true);
          }
        }
      }

      // 2b. a story fusion (the first fusion is a scene, not a meter): A3's own fields, then the ordinary fuse
      if (storyFuse) {
        if (player.fusion.active) storyFuse = false;
        else if (isDown(player) || isDown(partner)) {
          // the scene stands a downed party member up first (hp is A2's: the revive event, applied on its next step)
          for (const [down, id, by] of [[isDown(player), playerId, partnerId], [isDown(partner), partnerId, playerId]] as const) {
            if (!down) continue;
            const r = { actorId: id, byId: by, hpRatio: 1 };
            ctx.bus.emit('revive', r);
            opts.onRevive?.(r);
          }
        } else if (!player.ridingId) {
          def.bond = Math.max(def.bond, STORY_FUSE_MIN_BOND);
          syncIdleTier(player, partner, def.bond, def.element);
          player.fusion.meter = 1; partner.fusion.meter = 1;
          if (player.stats.energy.cur < player.stats.energy.max) player.stats.energy.cur = player.stats.energy.max;
          if (beginFusion(player, partner, def.bond, def.element, flightOpen()) !== null) {
            def.bond = Math.min(BOND_MAX, def.bond + BOND_PER_FUSION);
            emitFusion(true);
            // the fusion spent its energy: the scene gives the flight home a full pool [TUNE]
            player.stats.energy.cur = player.stats.energy.max;
          }
          storyFuse = false;
        }
      }

      // 3. the fusion clock
      if (player.fusion.active) {
        if (isDown(player) || tickFusion(player, partner, dt)) unfuse(player, partner);
        else {
          partner.pos.x = player.pos.x; partner.pos.y = player.pos.y; partner.pos.z = player.pos.z;
          partner.vel.x = 0; partner.vel.y = 0; partner.vel.z = 0;
        }
      }

      // 4. down and revive
      stepRevive(ctx, dt, player, partner);

      // 5. the brain
      const out = brain.think({ self: partner, player, world: ctx.world, command, playerDowned: playerDown.downed }, dt);
      const slot = ctx.inputs.get(partnerId);
      if (slot) copyMoveInput(out, slot);
    },

    def: () => def,
    command: () => command,
    setCommand(c) { if ((PARTNER_COMMANDS as readonly string[]).includes(c)) command = c; },
    brainMode: () => brain.mode,
    targetId: () => brain.targetId,
    lastFuseRefusal: () => refusal,
    revive: () => ({
      playerDowned: playerDown.downed, partnerDowned: partnerDown.downed,
      channel01: Math.max(playerDown.channelSec, partnerDown.channelSec) / REVIVE_CHANNEL_SEC,
    }),
    mountCanFly: (mountId) => mountId === partnerId && partnerCanCarry(def).fly && flightOpen(),
    storyFuse() { storyFuse = true; },
    storyFusePending: () => storyFuse,
    dispose() { for (const u of unsubs) u(); unsubs = []; bus = null; },
  };
}
