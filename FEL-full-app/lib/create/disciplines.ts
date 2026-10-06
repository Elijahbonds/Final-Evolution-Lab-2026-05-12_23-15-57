// lib/create/disciplines.ts — CREATE HUB (owner, 2026-10-06: "make it easier for people to access and set up").
//
// What each Create tile promises: where the work shows up in the game. The owner reads these tiles, so they say only
// what is TRUE today (`live`) and mark what a routed lane still has to wire (`live: false`, shown as "soon"). When a
// consumer lands, flip its line here and the tile and the step-3 preview follow. Pure; one list every surface reads.

import { DISCIPLINES, DISCIPLINE_META, type Discipline } from '@/lib/creator/creative-card-types';

export interface Showcase {
  /** Where, in the player's words. */
  where: string;
  /** True when the game already reads the card there; false when it is routed to another lane and not wired yet. */
  live: boolean;
}

export interface DisciplineGuide {
  id: Discipline;
  label: string;
  blurb: string;
  /** DISCIPLINE_META's tailwind background, for the tile accent. */
  color: string;
  /** The step-1 heading: what you make or bring in. */
  make: string;
  /** Where the approved work appears, most visible first. */
  showsUp: Showcase[];
}

const GUIDE: Record<Discipline, Omit<DisciplineGuide, 'id' | 'label' | 'blurb' | 'color'>> = {
  music: {
    make: 'Pick a song from your Academy library, upload a file, or build a beat',
    showsUp: [
      // lane/soundtrack's player plays approved tracks in rotation; false until it merges (flip both at that merge).
      { where: 'The FEL soundtrack: menus and loading screens', live: false },
      { where: 'Under your games, the end screen and replays', live: false },
      { where: 'The Dance floor, with its chart', live: false },
    ],
  },
  art: {
    make: 'Paint a skin in the painter',
    showsUp: [
      // apply-art-card.ts maps 'board' to a mesh named board_deck; the deck is deck_slab (routed: lane/pipelines).
      { where: 'Board decks in board runs (Apply from My Creations)', live: false },
      { where: 'Courts and kits', live: false },
    ],
  },
  dance: {
    make: 'Choreograph a routine from the clip library',
    showsUp: [
      { where: 'The Dance floor routine pick', live: false },
      { where: 'Dunk celebrations', live: false },
    ],
  },
  scene: {
    make: 'Write a Spot the Scene pack about a FEL venue',
    showsUp: [{ where: 'A Spot the Scene pack you can share as a link', live: true }, { where: 'The pack picker in Spot the Scene, credited', live: false }],
  },
  acting: {
    make: 'Record a voice line for a game moment',
    showsUp: [{ where: 'MC callouts at the moment you picked', live: false }],
  },
  cooking: {
    make: 'Write a recipe: ingredients, steps, fuel tags',
    showsUp: [{ where: 'Community recipes on the Fuel floor', live: false }],
  },
  fashion: {
    make: 'Build a look from pieces you own',
    showsUp: [{ where: 'A look for your Closet slots', live: false }],
  },
  writing: {
    make: 'Write a story beat, a caption or a verse',
    showsUp: [{ where: 'Community reads on the Story page', live: true }, { where: 'The Knowledge Feed Community topic', live: false }],
  },
  sport: {
    make: 'Pick a run or a highlight you already played',
    showsUp: [{ where: 'Signature moves on your athlete card', live: true }],
  },
};

/** The nine tiles, in the hub's order: the 2K-Beats headline (music) first, then the rest in DISCIPLINES order. */
export const HUB_ORDER: readonly Discipline[] = ['music', ...DISCIPLINES.filter((d) => d !== 'music')];

export function guideFor(d: Discipline): DisciplineGuide {
  const meta = DISCIPLINE_META[d];
  return { id: d, label: meta.label, blurb: meta.blurb, color: meta.color, ...GUIDE[d] };
}

export const ALL_GUIDES: readonly DisciplineGuide[] = HUB_ORDER.map(guideFor);
