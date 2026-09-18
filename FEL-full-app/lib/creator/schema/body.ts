// BODY — the two choices the rig actually swaps a mesh for (2026-09-14). Spec §1.
//
// `BodyArchetype` is `'lean' | 'athletic' | 'powerful'`, and the avatar types file explains why it is three
// separate skinned meshes rather than a slider: "Meshy doesn't generate morphs, garments would need
// matching morphs authored by hand or they tear, and morphs duplicate vertex data." That constraint is the
// reason this section is two option rows instead of six sliders — everything continuous about the body is
// in Vitals, where it maps onto the three scales the rig really applies.
//
// I NEARLY SHIPPED A WARNING WITH NO DATA UNDER IT. `SlotItem.archetypes` says which bodies a garment is
// cut for, so "changing your build can unfit an item" reads like an obvious thing for the resolver to
// flag — and then there is no avatar manifest on disk. `AvatarManifest` is a type `AvatarBuilder` takes as
// a constructor argument and nothing in the repo constructs. The garments that actually reach a hero come
// through `applyKit` off the closet catalog, which carries no per-body fit at all, so there is nothing to
// check and the warning is not written. It goes in when a manifest does.
//
// STANCE IS NOT A DUPLICATE OF ARCHETYPE. `AvatarSpec.stance` is derived from a movement scan when one
// exists (tall / compact / athletic, off jump height and build) and it is what the idle and locomotion
// layers read. Archetype is the mesh; stance is how that mesh stands. A player with no scan picks it here.

import type { SlotRow, SectionTable } from './types';
import { DEFAULT_AVATAR } from '../../babylon/types/avatar';
import { BODY_TYPES, DEFAULT_BODY_TYPE } from '../../babylon/core/heroBody';

/** The three shipped bodies. Raw values, because these strings ARE `BodyArchetype`. */
export const ARCHETYPES = ['lean', 'athletic', 'powerful'] as const;
/** The three shipped stances. Raw values, because these strings ARE `AvatarSpec['stance']`. */
export const STANCES = ['athletic', 'tall', 'compact'] as const;

const row = (id: string, label: string, options: readonly string[], defaultOption: string, glossary: string): SlotRow => ({
  kind: 'slot', id, label, section: 'body', tab: 'Frame',
  options, allowNone: false, defaultOption, requires: null, glossary,
});

export const BODY: SectionTable<SlotRow> = {
  section: 'body',
  title: 'Body',
  rows: [
    // EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): the base body every mode spawns for this player — the male or female
    // kit body (lib/babylon/core/heroBody.ts). It rides in AthleteBuild.build.frame like the rows below, so it needed
    // no schema change; /api/v1/hero-body reads it back at spawn.
    row('bodyType', 'Body Type', BODY_TYPES, DEFAULT_BODY_TYPE,
      'The base body you play in every mode. Height, build and reach in Vitals shape it from there, and your gear and hair are fitted to it.'),
    row('archetype', 'Build', ARCHETYPES, DEFAULT_AVATAR.archetype,
      'Which of the three shipped bodies you wear. They are separate meshes rather than a slider, so this is a real swap: lean carries less, powerful holds ground through contact.'),
    row('stance', 'Stance', STANCES, 'athletic',
      'How that body stands and carries itself: tall plays long and upright, compact sits lower and turns quicker, athletic is the middle. A body scan sets this for you if you have one.'),
  ],
};
