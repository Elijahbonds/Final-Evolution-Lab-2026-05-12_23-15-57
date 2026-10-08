/**
 * Creature evolution (ADVENTURE PLAN A3, 2026-10-06): Adventure events train the partner through the Evolution
 * Garden's own `trainFromEvent`, so the Garden's species biases and stage thresholds decide how it grows.
 *
 * THE MAPPING, Adventure event → the Garden's mode family (each species is biased to some families, so each grows
 * from different play):
 *   a hit the party lands        → combat      quality = damage / 30
 *   a rail trick                 → board       quality = points / 100
 *   a homing dash that connects  → court       0.6
 *   a spell the party casts      → precision   0.5
 *   a Mirror move                → rhythm      the move's quality
 *   a boss the party fells       → every family, quality 1
 *
 * THE SCALE. The Garden was tuned for one event per finished SESSION; the Adventure fires one per hit. Every quality is
 * multiplied by ADVENTURE_TRAINING_SCALE so a stage takes a chapter of play, not one fight: with the Garden's
 * thresholds (stage n at 25 × n training XP) a cinderpup reaches stage 1 after ~125 full-strength hits.
 *
 * The Companion is the Garden's class; this file keeps a PartnerDef (the save's shape) in step with it.
 */
import { Companion, trainFromEvent, type TrainingEvent } from '@/lib/babylon/core/EvolutionGarden';
import { PRQ_ATTRS } from '@/lib/prq';
import type { AdventureEvents, PartnerDef } from '../contracts';
import { speciesById } from './defs';

/** [TUNE] Per-hit events against the Garden's per-session tuning. */
export const ADVENTURE_TRAINING_SCALE = 0.1;
/** [TUNE] Damage that counts as a full-quality hit; trick points that count as a full trick. */
export const TRAIN_HIT_DAMAGE = 30;
export const TRAIN_TRICK_POINTS = 100;

export const GARDEN_FAMILIES: readonly TrainingEvent['modeFamily'][] = ['court', 'combat', 'board', 'precision', 'rhythm'];

type CreatureXp = NonNullable<PartnerDef['creature']> & { xp?: number };

/** The Garden companion a creature def is, or null for a character partner or an unknown species. */
export function companionOf(def: PartnerDef): Companion | null {
  if (def.kind !== 'creature' || !def.creature) return null;
  const sp = speciesById(def.creature.speciesId);
  if (!sp) return null;
  const c = new Companion(sp.garden);
  for (const k of PRQ_ATTRS) c.stats[k] = def.attrs[k];
  c.stage = Math.max(0, Math.min(sp.stages - 1, def.creature.stage));
  c.xp = (def.creature as CreatureXp).xp ?? 0;
  return c;
}

/** Copy a companion's growth back into its def (attrs, stage, training XP). */
export function syncDefFromCompanion(def: PartnerDef, c: Companion): void {
  if (!def.creature) return;
  for (const k of PRQ_ATTRS) def.attrs[k] = Math.round(c.stats[k] * 100) / 100;
  def.creature.stage = c.stage;
  (def.creature as CreatureXp).xp = Math.round(c.xp * 1000) / 1000;
}

export interface TrainResult { gained: number; evolved: boolean; stage: number }

/**
 * Train a creature with one Garden event (scaled) and keep its def in step. Evolution is the Garden's: one stage at a
 * time, at its thresholds.
 */
export function trainCreature(def: PartnerDef, c: Companion, ev: TrainingEvent): TrainResult {
  const before = c.stage;
  const q = Math.max(0, Math.min(1, ev.quality01)) * ADVENTURE_TRAINING_SCALE;
  const gained = q > 0 ? trainFromEvent(c, { modeFamily: ev.modeFamily, quality01: q }) : 0;
  syncDefFromCompanion(def, c);
  return { gained, evolved: c.stage > before, stage: c.stage };
}

/**
 * The Garden events one Adventure event is worth for the party (`isParty` says whether an actor is the player or the
 * partner). Empty when it trains nothing. Small arrays on events only, never per frame.
 */
export function trainingEventsFor<K extends keyof AdventureEvents>(
  name: K, payload: AdventureEvents[K], isParty: (id: string | null) => boolean, isBoss: (id: string) => boolean,
): TrainingEvent[] {
  switch (name) {
    case 'damage': {
      const e = payload as AdventureEvents['damage'];
      if (!isParty(e.sourceId) || isParty(e.targetId) || e.outcome !== 'hit' || !(e.amount > 0)) return [];
      return [{ modeFamily: 'combat', quality01: Math.min(1, e.amount / TRAIN_HIT_DAMAGE) }];
    }
    case 'rail:trick': {
      const e = payload as AdventureEvents['rail:trick'];
      return isParty(e.actorId) ? [{ modeFamily: 'board', quality01: Math.min(1, Math.max(0, e.points) / TRAIN_TRICK_POINTS) }] : [];
    }
    case 'homing': {
      const e = payload as AdventureEvents['homing'];
      return isParty(e.actorId) && e.hit ? [{ modeFamily: 'court', quality01: 0.6 }] : [];
    }
    case 'spell:cast': {
      const e = payload as AdventureEvents['spell:cast'];
      return isParty(e.actorId) ? [{ modeFamily: 'precision', quality01: 0.5 }] : [];
    }
    case 'mirror:move': {
      const e = payload as AdventureEvents['mirror:move'];
      return isParty(e.actorId) ? [{ modeFamily: 'rhythm', quality01: e.quality01 }] : [];
    }
    case 'ko': {
      const e = payload as AdventureEvents['ko'];
      return isParty(e.byId) && isBoss(e.actorId) ? GARDEN_FAMILIES.map((f) => ({ modeFamily: f, quality01: 1 })) : [];
    }
    default: return [];
  }
}
