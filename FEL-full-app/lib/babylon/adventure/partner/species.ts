/**
 * The Adventure's creature species table (ADVENTURE PLAN A3, 2026-10-06): what the Adventure adds to each Evolution
 * Garden species (lib/babylon/core/EvolutionGarden.ts SPECIES): an element, the stage it can carry a rider from, and
 * the stage it can fly from.
 *
 * WHY A SEPARATE, IMPORT-FREE FILE. The save (save/) must check a stored creature against its species without pulling
 * EvolutionGarden in: that module imports Babylon for its FlightController, and the save is read in places a scene is
 * not (a server route later). partner/defs.ts joins this table with SPECIES, and its test fails if the two disagree
 * (an id missing on either side, or a stage count that differs).
 *
 * THE STAGES (assumption, from the plan's "later stages can be ridden, the last can fly"): every species carries a
 * rider from stage 1 and flies at its last stage (2). EvolutionGarden had Strideraptor mountable only at stage 2; the
 * Adventure lets every creature carry from stage 1, so a player's first partner is a ground mount before it is a flyer.
 * Names stay the Garden's placeholders; the owner names the species (plan, open decision 1).
 */
import type { Element } from '../contracts';

export interface AdventureSpeciesRow {
  /** The Garden species id. */
  id: string;
  element: Element;
  /** The number of evolution stages (the Garden's `stages.length`). */
  stages: number;
  rideableAtStage: number | null;
  flyableAtStage: number | null;
}

/** [TUNE] [PLACEHOLDER] elements and stages, per Garden species. */
export const ADVENTURE_SPECIES_TABLE: Readonly<Record<string, AdventureSpeciesRow>> = Object.freeze({
  cinderpup: { id: 'cinderpup', element: 'fire', stages: 3, rideableAtStage: 1, flyableAtStage: 2 },
  strideraptor: { id: 'strideraptor', element: 'wind', stages: 3, rideableAtStage: 1, flyableAtStage: 2 },
  gardenite: { id: 'gardenite', element: 'earth', stages: 3, rideableAtStage: 1, flyableAtStage: 2 },
});

export const ADVENTURE_SPECIES_IDS: readonly string[] = Object.keys(ADVENTURE_SPECIES_TABLE);
