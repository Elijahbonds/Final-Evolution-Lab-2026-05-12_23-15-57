/**
 * The partner in the Battle Royale (ADVENTURE PLAN, "The Battle Royale": "Solos: each fighter's partner travels
 * bonded: it appears when summoned (one assist of about 8 s on a cooldown, at most 4 summoned in the match at once,
 * which is the body budget) and otherwise lives in your fusion and your element"). The BR's stand-in for A3's partner
 * system, which is built for one story party with a partner body always in the world; here twelve fighters each carry a
 * partner that is mostly NOT a body. It owns A3's fields for that role (`fusion`, `partnerId`, energy gain) and calls
 * A3's own pure fusion helpers (beginFusion / endFusion / tickFusion / syncIdleTier) so a BR fusion is the story's
 * fusion: the meter, the tier from the bond, the energy cost, `grantsFlight`.
 *
 *   THE BONDED PARTNER is a PHANTOM: an actor record that never enters the world, so the fusion helpers have the
 *   partner they expect and nothing can hit, lock or draw it.
 *   THE METER fills from damage the fighter (or its summon) deals: the partner is always "beside" you.
 *   THE SUMMON (the partner button): the partner's body appears beside you for SUMMON.sec, driven by A3's PartnerBrain
 *   on 'engage', then leaves; a cooldown follows. Refused while MAX_SUMMONED partners are out in the whole match.
 *   A creature at its riding stage can be MOUNTED while it is out (A1's riding, on the fuse button), and at its flying
 *   stage it flies with you on its back.
 *   SHARDS (loot) grow the creature a stage for the match: the ground mount becomes a flyer. A built character never
 *   carries; a shard deepens its bond instead (a fusion tier).
 *   THE DROP: every fighter drops in FUSED (the partner's wings carry the glide; the energy is topped up so the drop is
 *   free) and the drop fusion ends on landing.
 *
 * Pure: no Babylon, no clock, no global random.
 */

import {
  NO_FUSION, fusionTierFor, partnerCanCarry, type ActorId, type AdventureActor, type AdventureBus, type AdventureStepContext,
  type AdventureSystem, type MoveInput, type PartnerDef,
} from '../contracts';
import { FUSION_ENERGY_COST, beginFusion, endFusion, fuseRefusal, fusionDurationSec, syncIdleTier, tickFusion } from '../partner/fusion';
import { ABILITY, BR_FUSION_PER_DAMAGE, BR_MAX_SUMMONED, SUMMON } from './tuning';
import { hasAbility, type Kit } from './kit';
import type { DEFAULT_FLIGHT } from '../flight/params';

/** What the bond system needs of one fighter (the match's fighter record holds it). */
export interface BondFighter {
  id: ActorId;
  /** The match's copy of the partner (normalised bond and stage; never the save's object). */
  partner: PartnerDef;
  kit: Kit;
  /** Shards already turned into stages / bond. */
  shardsUsed: number;
  summonId: ActorId | null;
  summonLeftSec: number;
  summonCooldownSec: number;
  /** Fused for the drop (ends on landing, costs nothing). */
  dropFused: boolean;
  status: 'dropping' | 'alive' | 'downed' | 'out';
}

export interface BondHost {
  fighters(): readonly BondFighter[];
  /** Put the partner's body in the world beside its fighter (the match spawns it and registers its systems). */
  spawnSummon(f: BondFighter): AdventureActor | null;
  /** Take a summoned body out of the world. */
  despawnSummon(f: BondFighter): void;
  /** The movement system's view of a body (cruise or free flight). */
  flightModeOf(id: ActorId): 'free' | 'cruise' | null;
  flight: Pick<typeof DEFAULT_FLIGHT, 'drainPerSec'>;
}

export interface BondSystem extends AdventureSystem {
  /** The phantom partner of a fighter (never in the world). */
  phantomOf(id: ActorId): AdventureActor | null;
  /** May this mount fly with a rider? (A1's mountCanFly, per mount id.) */
  mountCanFly(mountId: ActorId): boolean;
  /** The partner def behind a summoned body, or null. */
  summonDefOf(mountId: ActorId): PartnerDef | null;
  /** Summoned partners in the world now (never more than BR_MAX_SUMMONED). */
  summoned(): number;
  /** Why the last summon press did nothing (null when it summoned). */
  lastSummonRefusal(id: ActorId): 'cooldown' | 'cap' | 'state' | null;
  /** Start every fighter's drop: fused, flying (a spawn's first value for the flight wish is the match's). */
  beginDrop(f: BondFighter, a: AdventureActor): void;
}

/** A creature's stage after `shards` shards (its riding stage to start; never past its flying stage). */
export function stageAfterShards(def: PartnerDef, baseStage: number, shards: number): number {
  const c = def.creature;
  if (def.kind !== 'creature' || !c) return 0;
  const top = c.flyableAtStage ?? c.rideableAtStage ?? baseStage;
  return Math.min(top, baseStage + shards);
}

/** [TUNE] A shard's bond for a built character partner (one fusion tier's worth). */
export const SHARD_BOND = 25;

export function createBondSystem(host: BondHost): BondSystem {
  const phantoms = new Map<ActorId, AdventureActor>();
  const summonOwner = new Map<ActorId, BondFighter>();
  const refusals = new Map<ActorId, 'cooldown' | 'cap' | 'state' | null>();
  let unsubs: (() => void)[] = [];
  let busRef: AdventureBus | null = null;
  let worldRef: AdventureStepContext['world'] | null = null;
  const fighterById = new Map<ActorId, BondFighter>();

  function phantom(f: BondFighter, a: AdventureActor): AdventureActor {
    let p = phantoms.get(f.id);
    if (!p) {
      p = {
        id: `${f.id}:bond`, kind: 'partner', team: a.team, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, facingYaw: 0,
        grounded: true, state: 'ground', stateSec: 0, radius: 0.5, height: 1.4,
        stats: { ...a.stats, hp: { cur: 1, max: 1 }, stamina: { cur: 1, max: 1 }, energy: { cur: 0, max: 0 }, poise: { cur: 0, max: 0 } },
        lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null, wantsFlight: false,
        fusion: { ...NO_FUSION }, partnerId: f.id,
      };
      phantoms.set(f.id, p);
    }
    return p;
  }

  const ownerOfDealer = (id: ActorId | null): BondFighter | undefined => {
    if (!id) return undefined;
    return fighterById.get(id) ?? summonOwner.get(id);
  };

  function subscribe(ctx: AdventureStepContext): void {
    for (const u of unsubs) u();
    busRef = ctx.bus;
    unsubs = [
      ctx.bus.on('damage', (e) => {
        if (e.outcome !== 'hit' || !(e.amount > 0) || e.source === 'zone') return;
        const f = ownerOfDealer(e.sourceId);
        if (!f || e.targetId === f.id || e.targetId === f.summonId) return;
        const a = worldRef?.actors.get(f.id);
        if (!a || a.fusion.active) return;
        const mult = hasAbility(f.kit, 'quickBond') ? ABILITY.quickFuseMult : 1;
        a.fusion.meter = Math.min(1, a.fusion.meter + e.amount * BR_FUSION_PER_DAMAGE * mult);
      }),
    ];
  }

  function unfuse(f: BondFighter, a: AdventureActor): void {
    endFusion(a, phantom(f, a));
    f.dropFused = false;
    busRef?.emit('fusion', { actorId: a.id, partnerId: `${f.id}:bond`, active: false, tier: a.fusion.tier });
  }

  function summon(ctx: AdventureStepContext, f: BondFighter, a: AdventureActor): void {
    if (f.summonId) { refusals.set(f.id, 'state'); return; }
    if (f.summonCooldownSec > 0) { refusals.set(f.id, 'cooldown'); return; }
    if (summonOwner.size >= BR_MAX_SUMMONED) { refusals.set(f.id, 'cap'); return; }
    if (a.fusion.active || a.ridingId || a.state === 'flight' || !(a.stats.hp.cur > 0)) { refusals.set(f.id, 'state'); return; }
    const body = host.spawnSummon(f);
    if (!body) { refusals.set(f.id, 'cap'); return; }
    f.summonId = body.id;
    f.summonLeftSec = hasAbility(f.kit, 'longSummon') ? SUMMON.longSec : SUMMON.sec;
    summonOwner.set(body.id, f);
    a.partnerId = body.id;
    refusals.set(f.id, null);
    void ctx;
  }

  function dismiss(f: BondFighter, a: AdventureActor | undefined): void {
    if (!f.summonId) return;
    summonOwner.delete(f.summonId);
    host.despawnSummon(f);
    f.summonId = null;
    f.summonLeftSec = 0;
    f.summonCooldownSec = SUMMON.cooldownSec * (hasAbility(f.kit, 'longSummon') ? SUMMON.cooldownMultAbility : 1);
    if (a && a.partnerId !== null) a.partnerId = null;
  }

  const system: BondSystem = {
    id: 'br.bond',

    phantomOf: (id) => phantoms.get(id) ?? null,

    mountCanFly(mountId) {
      const f = summonOwner.get(mountId);
      return !!f && partnerCanCarry(f.partner).fly;
    },

    summonDefOf: (mountId) => summonOwner.get(mountId)?.partner ?? null,
    summoned: () => summonOwner.size,
    lastSummonRefusal: (id) => refusals.get(id) ?? null,

    beginDrop(f, a) {
      const p = phantom(f, a);
      syncIdleTier(a, p, f.partner.bond, f.partner.element);
      a.fusion.active = true; a.fusion.grantsFlight = true; a.fusion.remainingSec = 999;
      a.fusion.partnerId = p.id; a.fusion.element = f.partner.element;
      p.fusion.active = true; p.fusion.partnerId = a.id;
      f.dropFused = true;
    },

    step(ctx: AdventureStepContext, dt: number): void {
      if (busRef !== ctx.bus) subscribe(ctx);
      worldRef = ctx.world;
      fighterById.clear();
      for (const f of host.fighters()) fighterById.set(f.id, f);
      for (const f of host.fighters()) {
        const a = ctx.world.actors.get(f.id);
        if (!a) { if (f.summonId) dismiss(f, undefined); continue; }
        const p = phantom(f, a);
        if (f.status === 'out' || f.status === 'downed' || !(a.stats.hp.cur > 0)) {
          if (a.fusion.active) unfuse(f, a);
          if (f.summonId) dismiss(f, a);
          continue;
        }
        // shards: the creature grows a stage (for the match), a character's bond deepens
        while (f.shardsUsed < f.kit.shards) {
          f.shardsUsed++;
          if (f.partner.kind === 'creature' && f.partner.creature) {
            f.partner.creature.stage = stageAfterShards(f.partner, f.partner.creature.stage, 1);
          } else f.partner.bond = Math.min(100, f.partner.bond + SHARD_BOND);
        }
        if (!a.fusion.active) syncIdleTier(a, p, f.partner.bond, f.partner.element);

        // the drop: fused and free until the feet touch the ground
        if (f.dropFused) {
          if (f.status === 'dropping') {
            const en = a.stats.energy;
            if (en.cur < en.max) en.cur = en.max;
            continue;
          }
          unfuse(f, a);   // landed (the match flips the status on touchdown): the drop's fusion ends
        }

        const inp: MoveInput | undefined = ctx.inputs.get(f.id);
        f.summonCooldownSec = Math.max(0, f.summonCooldownSec - dt);
        if (inp?.partner) summon(ctx, f, a);
        if (inp?.fuse) {
          if (a.fusion.active) { unfuse(f, a); inp.fuse = false; }
          else if (fuseRefusal(a, p, f.partner.bond) === null) {
            if (f.summonId) dismiss(f, a);   // the partner joins the fusion
            if (beginFusion(a, p, f.partner.bond, f.partner.element) !== null) {
              if (hasAbility(f.kit, 'longWings')) {
                a.fusion.remainingSec = fusionDurationSec(a.fusion.tier) * ABILITY.cruiseFusionMult;
                p.fusion.remainingSec = a.fusion.remainingSec;
              }
              inp.fuse = false;
              ctx.bus.emit('fusion', { actorId: a.id, partnerId: p.id, active: true, tier: a.fusion.tier });
            }
          }
        }
        if (a.fusion.active) {
          if (tickFusion(a, p, dt)) unfuse(f, a);
          else if (hasAbility(f.kit, 'longWings') && a.state === 'flight' && host.flightModeOf(a.id) === 'cruise') {
            const en = a.stats.energy;
            en.cur = Math.min(en.max, en.cur + host.flight.drainPerSec.cruise * ABILITY.cruiseRefund * dt);
          }
        }
        if (f.summonId) {
          const s = ctx.world.actors.get(f.summonId);
          f.summonLeftSec -= dt;
          if (!s || !(s.stats.hp.cur > 0) || f.summonLeftSec <= 0) dismiss(f, a);
        }
      }
    },

    dispose() { for (const u of unsubs) u(); unsubs = []; busRef = null; phantoms.clear(); summonOwner.clear(); },
  };
  return system;
}

/** The fuse button's cost and tier for the HUD. */
export const BOND_FUSE_COST = FUSION_ENERGY_COST;
export { fusionTierFor };
