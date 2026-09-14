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

export interface SidebarEntry {
  key: CreatorSection | 'import' | 'export' | 'finalize';
  label: string;
  /** The table to render, or null for a section whose rows are not authored yet. */
  table: SectionTable | null;
}

export const SIDEBAR: SidebarEntry[] = [
  { key: 'vitals', label: 'Vitals', table: null },
  { key: 'appearance', label: 'Appearance', table: null },
  { key: 'body', label: 'Body', table: null },
  { key: 'ink', label: 'Ink', table: null },
  { key: 'gear', label: 'Footwear / Gear', table: null },
  { key: 'accessories', label: 'Accessories', table: null },
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
