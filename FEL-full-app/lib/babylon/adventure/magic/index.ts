/**
 * The magic system (plan A2: `createMagicSystem({ spells })`). One `AdventureSystem`, stepped beside the combat system
 * (after it in the same slot), that reads each actor's input:
 *
 *   magicSlot   picks one of the four equipped slots.
 *   magic       casts the selected slot's spell: checks, then energy (all or nothing), then the cast time on the
 *               caster's own clock, then the shape lands and `spell:cast` is emitted, then the cooldown.
 *   magicHeld   holds a telekinesis grab; letting go throws.
 *   focusHeld   slow-time, if the caster knows it: energy per second while held; `time:scale` asks the host.
 *
 * It writes only A2's fields (energy SPEND; hp, poise, stunSec, impulse through combat/damage) and its own records.
 * Spell knowledge comes from `loadoutOf` (A4 answers from the save: known and equipped, learned through the story).
 */

import {
  spendPool, SPELL_SLOTS, type ActorId, type AdventureActor, type AdventureStepContext, type AdventureSystem,
  type Element, type MoveInput, type SpellDef,
} from '../contracts';
import { applyHit, makeHitSpec, resetHitSpec, type HitSpec } from '../combat/damage';
import { fightStateOf } from '../combat/fightState';
import { isHostile } from '../combat/lock';
import { ProjectilePool } from '../combat/projectiles';
import { CasterState, castBlocker, grabTarget, inArcXZ, spellAim, type Refusal, type SpellLoadout } from './cast';
import { SLOW_TIME, TELEKINESIS, drop, stepHold, stepThrown, throwHeld } from './mind';
import { partnerElementOf, partnerSpellMult } from './partner';
import { BARRIER_SEC, BOLT_RADIUS, BOLT_SPEED, CONE_HALF_DEG, FORESIGHT_SEC, IMPLEMENTED_SHAPES, STARTER_SPELLS } from './spells';

export interface MagicSystemOptions {
  /** The spell table. Default: the starter table. */
  spells?: readonly SpellDef[];
  /** Each caster's known and equipped spells (from the save). Null = casts nothing. */
  loadoutOf?: (actor: AdventureActor) => SpellLoadout | null;
  /** Bolt pool size (the budget). Default 32. */
  bolts?: number;
}

export interface MagicSystem extends AdventureSystem {
  readonly spells: ReadonlyMap<string, SpellDef>;
  readonly bolts: ProjectilePool;
  /** The spell being cast and how far through, for the HUD and the view. */
  castingOf(id: ActorId): { spell: SpellDef; t01: number } | null;
  selectedSlot(id: ActorId): number;
  cooldownOf(id: ActorId, spellId: string): number;
  /** Why the last cast was refused (null after a cast went through). */
  lastRefusal(id: ActorId): Refusal | null;
  /** The body this caster holds with telekinesis. */
  holdingOf(id: ActorId): ActorId | null;
  slowTimeActive(id: ActorId): boolean;
}

export function createMagicSystem(opts: MagicSystemOptions = {}): MagicSystem {
  const spells = new Map<string, SpellDef>((opts.spells ?? STARTER_SPELLS).map((s) => [s.id, s]));
  const loadoutOf = opts.loadoutOf ?? (() => null);
  const casters = new Map<ActorId, CasterState>();
  const bolts = new ProjectilePool(opts.bolts ?? 32);
  const spec: HitSpec = makeHitSpec();
  const slowTimeId = [...spells.values()].find((s) => s.mind === 'slowTime')?.id ?? null;

  const casterOf = (id: ActorId): CasterState => {
    let c = casters.get(id);
    if (!c) { c = new CasterState(); casters.set(id, c); }
    return c;
  };

  /** Power of a spell from this caster (before damage.ts's level, mental, element and caps). */
  function spellMult(caster: AdventureActor, spell: SpellDef): number {
    return spell.kind === 'partner' ? partnerSpellMult(caster.fusion) : 1;
  }

  function refuse(cs: CasterState, why: Refusal): void { cs.lastRefusal = why; }

  function tryCast(ctx: AdventureStepContext, a: AdventureActor, cs: CasterState): void {
    const lo = loadoutOf(a);
    const id = lo?.equipped[cs.slot] ?? null;
    if (!id) { refuse(cs, 'not-equipped'); return; }
    const spell = spells.get(id);
    if (!spell) { refuse(cs, 'unknown'); return; }
    if (spell.mind === 'slowTime') { refuse(cs, 'shape'); return; }   // slow-time is the focus trigger, not a slot cast
    const blocked = castBlocker(a, cs, spell, lo, IMPLEMENTED_SHAPES);
    if (blocked) { refuse(cs, blocked); return; }
    let target: AdventureActor | null = null;
    if (spell.shape === 'grab') {
      const g = grabTarget(a, ctx.world, spell.rangeM, (o) => fightStateOf(o).weight);
      if (!g.target) { refuse(cs, g.refusal ?? 'no-target'); return; }
      target = g.target;
    }
    if (spell.kind === 'partner' && !partnerElementOf(a, ctx.world)) { refuse(cs, 'no-element'); return; }
    if (!spendPool(a.stats.energy, spell.energyCost)) { refuse(cs, 'energy'); return; }
    cs.lastRefusal = null;
    cs.casting = spell;
    cs.castT = 0;
    cs.castTarget = target ? target.id : null;
  }

  function land(ctx: AdventureStepContext, a: AdventureActor, cs: CasterState, spell: SpellDef): void {
    cs.casting = null;
    cs.casts++;
    cs.cooldowns.set(spell.id, spell.cooldownSec);
    const element: Element | null = spell.kind === 'partner' ? partnerElementOf(a, ctx.world) : spell.element;
    const fs = fightStateOf(a);
    const aim = spellAim(a, ctx.world);
    resetHitSpec(spec);
    spec.base = spell.power; spec.source = 'spell'; spec.element = element; spec.via = spell.id;
    spec.mult = spellMult(a, spell); spec.parryable = false; spec.blockable = true;
    spec.staggerSec = 0.35; spec.knockbackM = 0.6; spec.fromX = a.pos.x; spec.fromZ = a.pos.z;
    switch (spell.shape) {
      case 'bolt': {
        const from = { x: a.pos.x + Math.sin(aim.yaw) * (a.radius + 0.3), y: a.pos.y + a.height * 0.6, z: a.pos.z + Math.cos(aim.yaw) * (a.radius + 0.3) };
        const t = aim.target;
        const flat = t ? Math.hypot(t.pos.x - from.x, t.pos.z - from.z) : 10;
        const dy = t ? (t.pos.y + t.height * 0.5 - from.y) / Math.max(1, flat) : 0;
        bolts.fire(a, from, { x: Math.sin(aim.yaw), y: dy, z: Math.cos(aim.yaw) }, BOLT_SPEED, spell.rangeM, BOLT_RADIUS, spec);
        break;
      }
      case 'cone':
      case 'nova': {
        const r = spell.shape === 'nova' ? spell.radiusM ?? 4 : spell.rangeM;
        for (const o of ctx.world.near(a.pos, r + 2)) {
          if (!isHostile(a, o)) continue;
          const inside = spell.shape === 'nova'
            ? Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) - o.radius <= r
            : inArcXZ(a.pos, aim.yaw, o.pos, r + o.radius, CONE_HALF_DEG * 2);
          if (inside) applyHit(ctx.bus, ctx.tSec, a, o, spec);
        }
        break;
      }
      case 'grab': {
        const t = cs.castTarget ? ctx.world.actors.get(cs.castTarget) : undefined;
        if (t && t.stats.hp.cur > 0 && !fightStateOf(t).heldBy) {
          cs.holding = t.id; cs.holdSpell = spell;
          fightStateOf(t).heldBy = a.id;
          fightStateOf(t).move = null;
        }
        break;
      }
      case 'self': {
        if (spell.mind === 'barrier') { fs.barrierHp = spell.power; fs.barrierSec = BARRIER_SEC; }
        if (spell.mind === 'foresight') fs.foresightSec = FORESIGHT_SEC;
        break;
      }
      default:
        break;
    }
    ctx.bus.emit('spell:cast', { actorId: a.id, spellId: spell.id, element });
  }

  function stopSlow(ctx: AdventureStepContext, a: AdventureActor, cs: CasterState): void {
    if (!cs.slowActive) return;
    cs.slowActive = false;
    ctx.bus.emit('time:scale', { byId: a.id, world: 1, self: 1, sec: 0 });
  }

  function stepCaster(ctx: AdventureStepContext, a: AdventureActor, input: MoveInput, dt: number): void {
    const cs = casterOf(a.id);
    const adt = dt * ctx.timeScaleOf(a.id);
    for (const [k, v] of cs.cooldowns) { const n = v - adt; if (n <= 0) cs.cooldowns.delete(k); else cs.cooldowns.set(k, n); }
    const alive = a.stats.hp.cur > 0;

    if (input.magicSlot !== null && input.magicSlot >= 0 && input.magicSlot < SPELL_SLOTS) cs.slot = input.magicSlot;

    // Slow-time: held focus, if known. Starts only with enough energy to hold it a beat; drains while held.
    const lo = loadoutOf(a);
    const knowsSlow = !!slowTimeId && !!lo?.known.includes(slowTimeId);
    if (input.focusHeld && knowsSlow && alive && a.stunSec <= 0) {
      const spell = spells.get(slowTimeId!)!;
      if (!cs.slowActive) {
        if ((cs.cooldowns.get(spell.id) ?? 0) <= 0 && spendPool(a.stats.energy, spell.energyCost)) {
          cs.slowActive = true;
          const perSec = spell.channelPerSec ?? 1;
          ctx.bus.emit('time:scale', { byId: a.id, world: SLOW_TIME.world, self: SLOW_TIME.self, sec: a.stats.energy.cur / Math.max(1e-6, perSec) });
          ctx.bus.emit('spell:cast', { actorId: a.id, spellId: spell.id, element: null });
        } else if (!(cs.cooldowns.get(spell.id) ?? 0)) refuse(cs, 'energy');
      } else {
        const need = (spell.channelPerSec ?? 0) * dt;   // the drain runs on real time: slow-time is not cheaper for being slow
        if (a.stats.energy.cur > need) a.stats.energy.cur -= need;
        else { a.stats.energy.cur = 0; stopSlow(ctx, a, cs); cs.cooldowns.set(spell.id, spell.cooldownSec); }
      }
    } else if (cs.slowActive) {
      stopSlow(ctx, a, cs);
      const spell = spells.get(slowTimeId!)!;
      cs.cooldowns.set(spell.id, spell.cooldownSec);
    }

    // Telekinesis: hold while the button is held, throw on release; drop when the energy runs dry.
    if (cs.holding) {
      const held = ctx.world.actors.get(cs.holding);
      const spell = cs.holdSpell!;
      const gone = !held || held.stats.hp.cur <= 0 || !alive || a.stunSec > 0;
      if (gone) { if (held) drop(held); cs.holding = null; }
      else if (!input.magicHeld) {
        throwHeld(a, held, spellAim(a, ctx.world).yaw, spell.power * spellMult(a, spell));
        cs.holding = null;
      } else {
        const need = (spell.channelPerSec ?? 0) * adt;
        if (a.stats.energy.cur >= need) { a.stats.energy.cur -= need; stepHold(a, held); }
        else { drop(held); cs.holding = null; }
      }
    }
    cs.magicHeldWas = input.magicHeld;

    // A cast in progress, on the caster's own clock. A stagger interrupts it (the energy is spent: souls rules).
    if (cs.casting) {
      if (!alive || a.stunSec > 0) { cs.casting = null; }
      else {
        cs.castT += adt;
        if (cs.castT >= cs.casting.castSec) land(ctx, a, cs, cs.casting);
      }
    }
    if (input.magic && !cs.casting && !cs.holding) {
      tryCast(ctx, a, cs);
      const started = cs.casting as SpellDef | null;   // (tryCast may have set it; TS narrowed it to null above)
      if (started && started.castSec <= 0) land(ctx, a, cs, started);
    }
  }

  return {
    id: 'adventure.magic',
    spells,
    bolts,

    castingOf(id) {
      const c = casters.get(id);
      return c?.casting ? { spell: c.casting, t01: c.casting.castSec > 0 ? Math.min(1, c.castT / c.casting.castSec) : 1 } : null;
    },
    selectedSlot(id) { return casters.get(id)?.slot ?? 0; },
    cooldownOf(id, spellId) { return casters.get(id)?.cooldowns.get(spellId) ?? 0; },
    lastRefusal(id) { return casters.get(id)?.lastRefusal ?? null; },
    holdingOf(id) { return casters.get(id)?.holding ?? null; },
    slowTimeActive(id) { return casters.get(id)?.slowActive ?? false; },

    step(ctx, dt) {
      // Timed effects on every body: barrier, foresight, and the flight of a thrown one.
      for (const a of ctx.world.actors.values()) {
        const fs = fightStateOf(a);
        const adt = dt * ctx.timeScaleOf(a.id);
        if (fs.barrierSec > 0) { fs.barrierSec = Math.max(0, fs.barrierSec - adt); if (fs.barrierSec === 0) fs.barrierHp = 0; }
        if (fs.foresightSec > 0) fs.foresightSec = Math.max(0, fs.foresightSec - adt);
        if (fs.thrownSec > 0) stepThrown(a, ctx.world, ctx.bus, ctx.tSec, adt);
      }
      for (const [id, input] of ctx.inputs) {
        const a = ctx.world.actors.get(id);
        if (a) stepCaster(ctx, a, input, dt);
      }
      bolts.step(ctx, dt);
    },

    dispose() { casters.clear(); bolts.clear(); },
  };
}

export { STARTER_SPELLS, TELEKINESIS, SLOW_TIME };
