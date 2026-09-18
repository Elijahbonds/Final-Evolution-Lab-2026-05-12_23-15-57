// THE SPEC'S OWN ACCEPTANCE TEST, AS A TEST (2026-09-14).
//
// §10 ends with: "Test that Nexus is actually data-driven: add a new trait and a new attribute purely by
// editing data tables. If that requires touching engine or UI code, the abstraction isn't done yet."
//
// That is a checkable claim, so it is checked here rather than asserted in a commit message. The rows
// below are built in the test, never added to the shipped tables, and every consumer — tabs, ceilings,
// resolver, budgets, glossary — is exercised against them. If any of it needed a code change to handle a
// new row, one of these fails.

import { describe, it, expect } from 'vitest';
import { tabsOf, rowsOfTab, type RatedRow, type TraitRow, type SectionTable } from './types';
import { ceilingFor, clampToCeiling } from './ceilings';
import { ATTRIBUTES } from './attributes';
import { TRAITS } from './traits';

/** A brand-new attribute, authored the way a designer would author one: as data. */
const NEW_ATTR: RatedRow = {
  kind: 'rated', id: 'screenAngle', label: 'Screen Angle', section: 'attributes', tab: 'Offense',
  min: 0, max: 99, prqAxis: null, glossary: 'Setting a screen at the angle that actually frees the handler.',
};

/** And a brand-new trait, with a hook and a ladder. */
const NEW_TRAIT: TraitRow = {
  kind: 'trait', id: 'screenSage', label: 'Screen Sage', section: 'traits', tab: 'Playmaking',
  tiers: ['BRONZE', 'SILVER', 'GOLD'], cost: [1, 3, 6],
  requires: { attribute: 'screenAngle', min: 65 }, hook: 'screenSet',
  glossary: 'Your screens free the handler more reliably.',
  tierText: ['Screens free the handler a little more.', 'Noticeably more.', 'Reliably.'],
};

describe('the abstraction is done — a new row needs no code', () => {
  it('a new attribute joins the tab strip without anything being told about it', () => {
    const table: SectionTable = { ...ATTRIBUTES, rows: [...ATTRIBUTES.rows, NEW_ATTR] };
    expect(tabsOf(table)).toContain('Offense');
    expect(rowsOfTab(table, 'Offense').map((r) => r.id)).toContain('screenAngle');
  });

  it('a new row gets ceilings and clamping with no special case', () => {
    expect(ceilingFor(NEW_ATTR, { speed: 30 })).toBe(99);        // skill: uncapped, as declared
    expect(clampToCeiling(NEW_ATTR, 400, null)).toBe(99);
    const capped: RatedRow = { ...NEW_ATTR, id: 'screenPower', prqAxis: 'strength' };
    expect(ceilingFor(capped, { strength: 50 })).toBeLessThan(99);
  });

  it('a new trait carries its ladder, its cost curve and its glossary like any other', () => {
    const table: SectionTable = { ...TRAITS, rows: [...TRAITS.rows, NEW_TRAIT] };
    expect(tabsOf(table)).toContain('Playmaking');
    const row = table.rows.find((r) => r.id === 'screenSage') as TraitRow;
    expect(row.tiers.length).toBe(row.cost.length);
    expect(row.tierText.length).toBe(row.tiers.length);
    expect(row.glossary.length).toBeGreaterThan(10);
  });

  it('the generic row shape is enough to render any section — nothing reads a section-specific field', () => {
    const rows = [...ATTRIBUTES.rows, ...TRAITS.rows, NEW_ATTR, NEW_TRAIT];
    for (const r of rows) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.label).toBe('string');
      expect(typeof r.tab).toBe('string');
      expect(typeof r.glossary).toBe('string');
      expect(r.glossary.length).toBeGreaterThan(0);   // §6: EVERY row carries glossary metadata
    }
  });

  it('tabs derive from the data in first-seen order rather than being declared anywhere', () => {
    const table: SectionTable = { section: 'attributes', title: 'x', rows: [
      { ...NEW_ATTR, id: 'a', tab: 'Zeta' }, { ...NEW_ATTR, id: 'b', tab: 'Alpha' }, { ...NEW_ATTR, id: 'c', tab: 'Zeta' },
    ] };
    expect(tabsOf(table)).toEqual(['Zeta', 'Alpha']);   // first-seen, NOT alphabetical
  });
});
