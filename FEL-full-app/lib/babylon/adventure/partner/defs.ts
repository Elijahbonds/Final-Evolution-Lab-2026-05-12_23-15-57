/**
 * Partner definitions (ADVENTURE PLAN A3, pillar 5, 2026-10-06). The player's choice (owner): an evolving CREATURE
 * (an Evolution Garden species, extended with an element and its ride / fly stages) or a second built CHARACTER (one
 * of the player's own Creator slots). Either fights beside the player, fuses with them, and gives them its element.
 *
 *   createCreaturePartner   a stage-0 creature: the Garden's starting stats (Companion), its species' moves
 *                           (FusionColosseum.COMPANION_MOVES ids), the Adventure's element and stages
 *   createCharacterPartner  a slot id (the look resolves through the identity layer: partner/identity.ts), an element
 *                           the player picks, a baseline body
 *
 * Every name the player gives is sanitised with the jersey-name rule (sanitizeStampText). Species labels are the
 * Garden's `[TUNE]` placeholders until the owner names them.
 */
import { Companion, SPECIES, type SpeciesDef } from '@/lib/babylon/core/EvolutionGarden';
import { COMPANION_MOVES } from '@/lib/babylon/core/FusionColosseum';
import { sanitizeStampText } from '@/lib/creator/look/sanitize';
import { PRQ_ATTRS, type PrqAttr } from '@/lib/prq';
import type { Element, PartnerDef } from '../contracts';
import { ADVENTURE_SPECIES_TABLE, type AdventureSpeciesRow } from './species';
import type { GearBonus } from '../stats/derive';

export { ADVENTURE_SPECIES_TABLE, ADVENTURE_SPECIES_IDS } from './species';

/** A Garden species joined with the Adventure's row. */
export interface AdventureSpecies extends AdventureSpeciesRow {
  garden: SpeciesDef;
  /** The Garden's `[TUNE]` placeholder label. */
  label: string;
  stageLabels: readonly string[];
  moves: readonly string[];
}

export const ADVENTURE_SPECIES: readonly AdventureSpecies[] = SPECIES
  .filter((g) => ADVENTURE_SPECIES_TABLE[g.id])
  .map((g) => ({
    ...ADVENTURE_SPECIES_TABLE[g.id], garden: g, label: g.label, stageLabels: g.stages,
    moves: (COMPANION_MOVES[g.id] ?? []).map((m) => m.id),
  }));

export function speciesById(id: string): AdventureSpecies | null {
  return ADVENTURE_SPECIES.find((s) => s.id === id) ?? null;
}

/** [TUNE] Moves a character partner uses: the generic strike pair (A2's move table names them). */
export const CHARACTER_PARTNER_MOVES: readonly string[] = ['strike.light', 'strike.heavy'];
/** [TUNE] A character partner's starting body: the baseline scan, every attribute 50. */
export const CHARACTER_BASE_ATTR = 50;
/** [TUNE] A creature's HP per evolution stage (as gear, so it stays inside the derived bounds). */
export const STAGE_HP_BONUS = 20;
export const DEFAULT_PARTNER_NAME = 'PARTNER';

export function partnerName(raw: unknown): string {
  return sanitizeStampText(raw) || DEFAULT_PARTNER_NAME;
}

/** A stage-0 creature of `speciesId`, or null for a species the Adventure does not know. */
export function createCreaturePartner(o: { id: string; speciesId: string; name?: string }): PartnerDef | null {
  const sp = speciesById(o.speciesId);
  if (!sp) return null;
  const c = new Companion(sp.garden);
  const attrs = {} as Record<PrqAttr, number>;
  for (const k of PRQ_ATTRS) attrs[k] = c.stats[k];
  return {
    id: o.id, kind: 'creature', name: partnerName(o.name ?? sp.stageLabels[0]), element: sp.element,
    creature: { speciesId: sp.id, stage: 0, rideableAtStage: sp.rideableAtStage, flyableAtStage: sp.flyableAtStage },
    attrs, bond: 0, moves: [...sp.moves],
  };
}

/** A character partner: one of the player's Creator slots, by id. */
export function createCharacterPartner(o: { id: string; creatorSlotId: string; element: Element; name?: string }): PartnerDef {
  const attrs = {} as Record<PrqAttr, number>;
  for (const k of PRQ_ATTRS) attrs[k] = CHARACTER_BASE_ATTR;
  return {
    id: o.id, kind: 'character', name: partnerName(o.name), element: o.element,
    character: { creatorSlotId: o.creatorSlotId }, attrs, bond: 0, moves: [...CHARACTER_PARTNER_MOVES],
  };
}

/** The gear-like bonus a partner's form gives its derived stats (a creature's stage). */
export function partnerGear(def: PartnerDef): GearBonus {
  return def.kind === 'creature' && def.creature ? { hp: STAGE_HP_BONUS * def.creature.stage } : {};
}

/** The stage label a creature shows (the Garden's placeholder), or the character's name. */
export function partnerFormLabel(def: PartnerDef): string {
  if (def.kind !== 'creature' || !def.creature) return def.name;
  const sp = speciesById(def.creature.speciesId);
  return sp?.stageLabels[def.creature.stage] ?? sp?.stageLabels.at(-1) ?? def.name;
}
