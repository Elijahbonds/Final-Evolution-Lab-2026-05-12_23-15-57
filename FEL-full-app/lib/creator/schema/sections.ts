// THE SIDEBAR (2026-09-14). Spec §1: fourteen sections, jump anywhere, Finalize gates the save.
//
// The shell reads THIS, not a hardcoded list in a component — same rule as everything else in the folder.
// Sections whose rows are not authored yet say so honestly rather than opening an empty screen: a creator
// that shows you a blank "Ink" page has told you it is broken, where one that says "not built yet" has
// told you the truth.

import type { CreatorSection, SectionTable } from './types';
import { ATTRIBUTES } from './attributes';
import { TRAITS } from './traits';
import { TENDENCIES } from './tendencies';
import { HOT_ZONES } from './hotZones';
import { MECHANICS } from './mechanics';
import { VITALS } from './vitals';
import { APPEARANCE } from './appearance';
import { BODY } from './body';
import { GEAR, ACCESSORIES } from './gear';

export interface SidebarEntry {
  key: CreatorSection | 'import' | 'export' | 'finalize';
  label: string;
  /** The table to render, or null for a section whose rows are not authored yet. */
  table: SectionTable | null;
  /**
   * Why an unbuilt section is unbuilt, printed on the screen itself.
   *
   * "Not built yet" is honest and useless. A player — or the next person in this file — deserves the
   * actual reason, and writing it down is what stops a section being skipped twice for a cause nobody
   * remembers.
   */
  reason?: string;
}

export const SIDEBAR: SidebarEntry[] = [
  { key: 'vitals', label: 'Vitals', table: VITALS as SectionTable },
  { key: 'appearance', label: 'Appearance', table: APPEARANCE },
  { key: 'body', label: 'Body', table: BODY as SectionTable },
  {
    key: 'ink', label: 'Ink', table: null,
    reason: 'The decal pipeline is real — AvatarBuilder parents up to three decals to a bone so they ride the skin — but FEL ships no ink artwork, and a list of designs whose textures do not exist would be a menu of broken slots. This opens when the art does.',
  },
  { key: 'gear', label: 'Footwear / Gear', table: GEAR as SectionTable },
  { key: 'accessories', label: 'Accessories', table: ACCESSORIES as SectionTable },
  { key: 'attributes', label: 'Attributes', table: ATTRIBUTES as SectionTable },
  { key: 'tendencies', label: 'Tendencies', table: TENDENCIES as SectionTable },
  { key: 'hotZones', label: 'Hot Zones', table: HOT_ZONES as SectionTable },
  { key: 'mechanics', label: 'Mechanics', table: MECHANICS },
  { key: 'traits', label: 'Traits', table: TRAITS as SectionTable },
  { key: 'import', label: 'Import Athlete Profile', table: null },
  { key: 'export', label: 'Export Athlete Profile', table: null },
  { key: 'finalize', label: 'Finalize', table: null },
];

/** Sections with rows today — what the shell can actually open. */
export function builtSections(): SidebarEntry[] {
  return SIDEBAR.filter((s) => s.table !== null);
}
