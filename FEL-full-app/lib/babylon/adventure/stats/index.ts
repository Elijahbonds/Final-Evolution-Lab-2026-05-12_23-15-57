/**
 * The stats system (ADVENTURE PLAN A3, 2026-10-06): the last sim step of a tick (input → partner brain → movement →
 * combat and magic → STATS → events). It owns, on every actor it tracks:
 *
 *   - every pool's MAX, level, band, school, element and attrs (derived by stats/derive.ts, re-derived only when an
 *     input changes: a level-up, a fusion starting or ending, a training bonus crossing a point, a refresh);
 *   - energy REGEN (stats/regen.ts) and the SPECIAL meter (from damage dealt and taken, and from the Mirror);
 *   - Adventure XP, levels and training (stats/level.ts; the `xp` event is the one path in, so story and BR awards
 *     arrive the same way the system's own do), and the Mirror ledger (stats/mirror.ts).
 *
 * It never writes hp, stamina or poise `cur` (A2's), except to lower a cur that sits above a max it just lowered
 * (derive.applyDerived: the pool invariant).
 *
 * XP it awards itself [TUNE]: a monster KO by the party 12, a boss KO 150, a rail trick points / 10. A partner's XP is
 * the player's: a partner's level follows its player's (`levelFrom`).
 *
 * Pure (no Babylon). Steps on the host's fixed clock.
 */
import { PRQ_ATTRS, type PrqAttr } from '@/lib/prq';
import type { StyleBlend } from '@/lib/babylon/combat/schools';
import type {
  ActorId, AdventureActor, AdventureBus, AdventureEvents, AdventureStepContext, AdventureSystem, AdventureSave, Element,
  PrqBand, XpSource,
} from '../contracts';
import {
  TRAINING_POINTS_MAX, TRAINING_POINTS_PER_ATTR, applyDerived, deriveActorStats, sanitizeSchool, type DerivedStats,
  type GearBonus,
} from './derive';
import { addAdventureXp, adventureLevelFor, clampAdventureXp } from './level';
import { EnergyRegen, addSpecial, specialForDealer, specialForTarget } from './regen';
import { MirrorLedger } from './mirror';

export * from './derive';
export * from './level';
export * from './regen';
export * from './mirror';

// ── Tuning [TUNE] ────────────────────────────────────────────────────────────────────────────────────────────────

export const XP_MONSTER_KO = 12;
export const XP_BOSS_KO = 150;
/** Rail trick points per XP. */
export const XP_TRICK_DIV = 10;
/** Training points per XP from play, split over the source's attributes (the Mirror trains its own move's). */
export const TRAINING_PER_XP = 1;
export const XP_SOURCE_ATTRS: Readonly<Record<Exclude<XpSource, 'mirror'>, readonly PrqAttr[]>> = {
  combat: ['strength', 'power', 'agility'],
  boss: PRQ_ATTRS,
  trick: ['agility', 'flexibility', 'speed'],
  story: ['mental'],
  br: ['endurance', 'speed', 'agility'],
};

// ── Setup ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface StatsActorSetup {
  id: ActorId;
  /** The PRQ band; absent = a guest = READY. */
  band?: PrqBand | null;
  /** PRQ attributes (a player), or the partner's own (PartnerDef.attrs: the same object, so evolution shows through). */
  attrs?: Partial<Record<PrqAttr, number>> | null;
  school?: StyleBlend | null;
  gear?: GearBonus | null;
  element?: Element | null;
  /** XP, level and training (the save's `player`). Absent for an actor whose level follows another's. */
  progress?: { xp: number; training?: Partial<Record<PrqAttr, number>> } | null;
  /** A partner: its level is this actor's (and its XP goes to it). */
  levelFrom?: ActorId | null;
}

export interface StatsSystemOptions {
  actors?: StatsActorSetup[];
  /** The save's `settings.mirror`. Off by default: a `mirror:move` then does nothing. */
  mirror?: boolean;
}

export interface StatsProgress { level: number; xp: number; training: Partial<Record<PrqAttr, number>> }

export interface StatsSystem extends AdventureSystem {
  /** Track an actor (spawn). Its pools fill on the next step. */
  register(setup: StatsActorSetup): void;
  unregister(id: ActorId): void;
  /** Change an actor's inputs (new gear, evolved attrs, a new element) and re-derive on the next step. */
  refresh(id: ActorId, patch?: Partial<Omit<StatsActorSetup, 'id'>>): void;
  /** The last derivation, or null when untracked or not yet stepped. */
  derived(id: ActorId): DerivedStats | null;
  /** XP, level and training, for the save (a copy). */
  progress(id: ActorId): StatsProgress | null;
  setMirror(on: boolean): void;
  mirrorOn(): boolean;
  /** This session's Mirror books for an actor. */
  mirrorSession(id: ActorId): { special: number; xp: number; counted: number } | null;
}

interface Tracked {
  setup: StatsActorSetup;
  progress: { level: number; xp: number; training: Partial<Record<PrqAttr, number>> } | null;
  regen: EnergyRegen;
  ledger: MirrorLedger;
  derived: DerivedStats | null;
  /** The inputs the last derivation saw (re-derive when any differs). */
  key: number;
  dirty: boolean;
  spawned: boolean;
  /** Integer training bonus sum, to notice a bonus point crossing. */
  trainingRev: number;
}

const finite = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);

function trainingRevOf(t: Partial<Record<PrqAttr, number>> | null | undefined): number {
  if (!t) return 0;
  let s = 0;
  for (const k of PRQ_ATTRS) s += Math.floor(finite(t[k], 0) / TRAINING_POINTS_PER_ATTR);
  return s;
}

function addTraining(t: Partial<Record<PrqAttr, number>>, attrs: readonly PrqAttr[], points: number): void {
  if (!(points > 0) || !attrs.length) return;
  const each = points / attrs.length;
  for (const k of attrs) t[k] = Math.min(TRAINING_POINTS_MAX, Math.round((finite(t[k], 0) + each) * 100) / 100);
}

/** The stats setups for the story party: the player (from the save and PRQ) and the partner (its def). */
export function statsSetupForParty(o: {
  save: AdventureSave;
  playerId: ActorId;
  partnerId?: ActorId | null;
  band?: PrqBand | null;
  prqAttrs?: Partial<Record<PrqAttr, number>> | null;
  gear?: GearBonus | null;
}): StatsActorSetup[] {
  const partner = o.save.partner;
  const out: StatsActorSetup[] = [{
    id: o.playerId, band: o.band ?? null, attrs: o.prqAttrs ?? null, school: o.save.player.school, gear: o.gear ?? null,
    element: partner?.element ?? null, progress: { xp: o.save.player.xp, training: { ...o.save.player.training } },
  }];
  if (partner && o.partnerId) {
    out.push({ id: o.partnerId, band: null, attrs: partner.attrs, school: null, element: partner.element, levelFrom: o.playerId });
  }
  return out;
}

export function createStatsSystem(opts: StatsSystemOptions = {}): StatsSystem {
  const tracked = new Map<ActorId, Tracked>();
  let mirror = opts.mirror === true;
  let bus: AdventureBus | null = null;
  let unsubs: (() => void)[] = [];
  let lastT = 0;
  let actors: ReadonlyMap<ActorId, AdventureActor> | null = null;

  function register(setup: StatsActorSetup): void {
    const p = setup.progress;
    const progress = p
      ? { level: adventureLevelFor(p.xp).level, xp: clampAdventureXp(p.xp), training: { ...(p.training ?? {}) } }
      : null;
    tracked.set(setup.id, {
      setup: { ...setup }, progress, regen: new EnergyRegen(), ledger: new MirrorLedger(), derived: null, key: -1,
      dirty: true, spawned: false, trainingRev: trainingRevOf(progress?.training),
    });
  }
  for (const s of opts.actors ?? []) register(s);

  /** The tracked actor whose progress an award to `id` lands on (a partner's goes to its player). */
  function progressOwner(id: ActorId): Tracked | null {
    const t = tracked.get(id);
    if (!t) return null;
    if (t.progress) return t;
    const up = t.setup.levelFrom ? tracked.get(t.setup.levelFrom) : null;
    return up?.progress ? up : null;
  }

  function levelOf(t: Tracked): number {
    if (t.progress) return t.progress.level;
    const up = t.setup.levelFrom ? tracked.get(t.setup.levelFrom) : null;
    return up?.progress?.level ?? 1;
  }

  function onXp(e: AdventureEvents['xp']): void {
    const owner = progressOwner(e.actorId);
    if (!owner?.progress || !(e.amount > 0)) return;
    const gained = addAdventureXp(owner.progress, e.amount);
    if (e.source !== 'mirror') {
      addTraining(owner.progress.training, XP_SOURCE_ATTRS[e.source] ?? [], e.amount * TRAINING_PER_XP);
    }
    const rev = trainingRevOf(owner.progress.training);
    if (rev !== owner.trainingRev) { owner.trainingRev = rev; owner.dirty = true; }
    if (gained > 0) {
      owner.dirty = true;
      for (const t of tracked.values()) if (t.setup.levelFrom === owner.setup.id) t.dirty = true;
      bus?.emit('level', { actorId: owner.setup.id, level: owner.progress.level });
    }
  }

  function onDamage(e: AdventureEvents['damage']): void {
    const dealer = e.sourceId ? tracked.get(e.sourceId) : undefined;
    if (dealer && e.sourceId !== e.targetId) {
      const a = actors?.get(dealer.setup.id);
      if (a) addSpecial(a.stats, specialForDealer(e) * (dealer.derived?.specialGainMult ?? 1));
    }
    const target = tracked.get(e.targetId);
    if (target) {
      const a = actors?.get(target.setup.id);
      if (a) addSpecial(a.stats, specialForTarget(e) * (target.derived?.specialGainMult ?? 1));
    }
  }

  function onKo(e: AdventureEvents['ko']): void {
    if (!e.byId || !actors) return;
    const victim = actors.get(e.actorId);
    if (!victim || (victim.kind !== 'monster' && victim.kind !== 'boss')) return;
    const owner = progressOwner(e.byId);
    if (!owner) return;
    bus?.emit('xp', { actorId: owner.setup.id, amount: victim.kind === 'boss' ? XP_BOSS_KO : XP_MONSTER_KO, source: victim.kind === 'boss' ? 'boss' : 'combat' });
  }

  function onTrick(e: AdventureEvents['rail:trick']): void {
    const owner = progressOwner(e.actorId);
    const amount = Math.floor(Math.max(0, e.points) / XP_TRICK_DIV);
    if (owner && amount > 0) bus?.emit('xp', { actorId: owner.setup.id, amount, source: 'trick' });
  }

  function onMirror(e: AdventureEvents['mirror:move']): void {
    if (!mirror) return;
    const t = tracked.get(e.actorId);
    if (!t?.progress) return;
    const credit = t.ledger.credit(e, lastT);
    if (!credit) return;
    const a = actors?.get(e.actorId);
    if (a) addSpecial(a.stats, credit.special);
    if (credit.xp > 0) {
      addTraining(t.progress.training, credit.attrs, credit.xp * TRAINING_PER_XP);
      bus?.emit('xp', { actorId: e.actorId, amount: credit.xp, source: 'mirror' });
    }
  }

  function subscribe(b: AdventureBus): void {
    for (const u of unsubs) u();
    bus = b;
    unsubs = [b.on('xp', onXp), b.on('damage', onDamage), b.on('ko', onKo), b.on('rail:trick', onTrick), b.on('mirror:move', onMirror)];
  }

  function deriveKey(t: Tracked, a: AdventureActor): number {
    const f = a.fusion;
    return levelOf(t) * 100 + (f.active ? 10 + f.tier : 0);
  }

  return {
    id: 'adventure.stats',

    step(ctx: AdventureStepContext, dt: number): void {
      if (bus !== ctx.bus) subscribe(ctx.bus);
      actors = ctx.world.actors;
      lastT = ctx.tSec;
      for (const t of tracked.values()) {
        const a = ctx.world.actors.get(t.setup.id);
        if (!a) continue;
        const key = deriveKey(t, a);
        if (t.dirty || key !== t.key || !t.derived) {
          const partner = a.fusion.active && a.fusion.partnerId ? ctx.world.actors.get(a.fusion.partnerId) : undefined;
          t.derived = deriveActorStats({
            level: levelOf(t), band: t.setup.band, attrs: t.setup.attrs, training: t.progress?.training,
            school: t.setup.school, gear: t.setup.gear, element: t.setup.element,
            fusion: a.fusion.active && partner
              ? { partnerAttrs: partner.stats.attrs ?? {}, tier: a.fusion.tier, element: a.fusion.element }
              : null,
          });
          applyDerived(a.stats, t.derived, !t.spawned);
          if (!t.spawned) t.regen.reset();
          t.spawned = true;
          t.key = key;
          t.dirty = false;
        }
        const blocked = a.state === 'flight' || a.state === 'ko' || a.stats.hp.cur <= 0;
        t.regen.step(a.stats.energy, t.derived.energyRegenPerSec, dt, blocked);
        if (!(a.stats.special >= 0)) a.stats.special = 0;
        else if (a.stats.special > 1) a.stats.special = 1;
      }
    },

    register,
    unregister(id) { tracked.delete(id); },
    refresh(id, patch) {
      const t = tracked.get(id);
      if (!t) return;
      if (patch) {
        t.setup = { ...t.setup, ...patch, id };
        if (patch.school !== undefined) t.setup.school = sanitizeSchool(patch.school);
      }
      t.dirty = true;
    },
    derived(id) { return tracked.get(id)?.derived ?? null; },
    progress(id) {
      const t = tracked.get(id);
      if (!t?.progress) return null;
      return { level: t.progress.level, xp: t.progress.xp, training: { ...t.progress.training } };
    },
    setMirror(on) { mirror = on === true; },
    mirrorOn() { return mirror; },
    mirrorSession(id) {
      const t = tracked.get(id);
      return t ? { special: t.ledger.specialGiven, xp: t.ledger.xpGiven, counted: t.ledger.counted } : null;
    },
    dispose() { for (const u of unsubs) u(); unsubs = []; bus = null; },
  };
}
