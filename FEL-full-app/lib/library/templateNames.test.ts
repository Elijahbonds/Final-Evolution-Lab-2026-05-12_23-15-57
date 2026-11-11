// DEMOS-FIX (2026-11-10): the template-name map names real entries that play a loop, only for template names the library
// does not already answer, and never a rejected entry.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from './files';
import { demoClipFor } from './demo';
import { matchLibraryByName } from './match';
import { TEMPLATE_LIBRARY_NAMES, templateLibraryEntry } from './templateNames';
import { CATALOGUE_DEMO_LOOPS } from './surfaceDemo';
import { TEMPLATE_EXERCISES } from '@/lib/coach/templateCatalogue';

const ALL = loadLibraryFiles();
const TEMPLATE_NAMES = new Set(TEMPLATE_EXERCISES.map((t) => t.catalogue.name));

describe('the template-name map', () => {
  it('maps only FEL template names the library does not answer by its own names, and no name is in two tables', () => {
    for (const name of Object.keys(TEMPLATE_LIBRARY_NAMES)) {
      expect(TEMPLATE_NAMES.has(name), name).toBe(true);
      expect(matchLibraryByName(ALL, [name]), name).toBeNull();
      expect(CATALOGUE_DEMO_LOOPS[name], name).toBeUndefined();
    }
  });
  it('every line names an entry that exists, is not rejected and plays a loop', () => {
    for (const [name, id] of Object.entries(TEMPLATE_LIBRARY_NAMES)) {
      const e = templateLibraryEntry(ALL, name);
      expect(e?.id, name).toBe(id);
      expect(e && demoClipFor(e), `${name} → ${id}`).toBeTruthy();
    }
  });
  it('the library\'s own name wins, and a name in neither table is no entry', () => {
    expect(templateLibraryEntry(ALL, 'Goblet Squat')?.id).toBe(matchLibraryByName(ALL, ['Goblet Squat'])?.id);
    expect(templateLibraryEntry(ALL, 'Hands-Elevated Pike Push-Up')).toBeNull();   // no honest match: the still
    expect(templateLibraryEntry(ALL, null)).toBeNull();
  });
  // DEMOS-FIX-2 (2026-11-11), test changed: this held the four rows with no honest match (the hands- and feet-elevated pike
  // push-ups, the double broad jump, the lateral step and stick) to the still. Each has its own loop now (exerciseFamilies12.ts),
  // so the list is empty, and the four are held to THEIR loops by name — stricter than the old list, which any still passed.
  it('every FEL template exercise plays a loop, by the library, the map or its catalogue row — the last four by their own loops', () => {
    const still = [...TEMPLATE_NAMES].filter((n) => { const e = templateLibraryEntry(ALL, n); return !(e ? demoClipFor(e) : CATALOGUE_DEMO_LOOPS[n]); }).sort();
    expect(still).toEqual([]);
    expect(CATALOGUE_DEMO_LOOPS['Hands-Elevated Pike Push-Up']).toBe('ex_pike_pushup_hands_up');
    expect(CATALOGUE_DEMO_LOOPS['Feet-Elevated Pike Push-Up']).toBe('ex_pike_pushup_feet_up');
    expect(CATALOGUE_DEMO_LOOPS['Double Broad Jump and Stick']).toBe('ex_broad_jump_double');
    expect(CATALOGUE_DEMO_LOOPS['Lateral Step and Stick']).toBe('ex_lateral_step_stick');
  });
});
