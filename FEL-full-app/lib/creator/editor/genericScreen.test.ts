// THE SCREEN MUST NOT KNOW WHICH SECTION IT IS RENDERING (2026-09-14).
//
// The spec's §10 step 2 asks for ONE editor component that every section is a config of. That is easy to
// claim and easy to quietly break — the first time Hot Zones needs something special, somebody adds
// `if (section === 'hotZones')` and the abstraction is over without anyone noticing.
//
// So it is a source scan, the same technique the StandardMaterial ratchet uses. If this fails, the fix is
// to move the special case into the row data or into rowState, not to relax the test.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATTRIBUTES } from '../schema/attributes';
import { TRAITS } from '../schema/traits';
import { tabsOf, rowsOfTab } from '../schema/types';

const SRC = readFileSync(join(process.cwd(), 'components/creator/editor/creator-editor.tsx'), 'utf8');

describe('the generic editor screen', () => {
  it('branches on no section name anywhere', () => {
    const sections = ['attributes', 'tendencies', 'hotZones', 'mechanics', 'traits', 'vitals', 'appearance', 'body', 'ink', 'gear', 'accessories'];
    for (const s of sections) {
      // the section may be MENTIONED (a comment, a type import) but never compared against
      expect(SRC).not.toMatch(new RegExp(`===\\s*['"\`]${s}['"\`]`));
      expect(SRC).not.toMatch(new RegExp(`section\\s*==\\s*['"\`]${s}['"\`]`));
    }
  });

  it('branches on no specific row id either', () => {
    const ids = [...ATTRIBUTES.rows, ...TRAITS.rows].map((r) => r.id);
    for (const id of ids) expect(SRC).not.toMatch(new RegExp(`['"\`]${id}['"\`]`));
  });

  it('reads the row KIND rather than the section, which is the one distinction it is allowed', () => {
    expect(SRC).toContain("kind === 'trait'");
  });

  it('derives its tab strip instead of declaring one', () => {
    expect(SRC).toContain('tabsOf');
    expect(SRC).not.toMatch(/const TABS\s*=/);
  });

  it('renders every shipped section through the same two calls', () => {
    for (const table of [ATTRIBUTES, TRAITS]) {
      const tabs = tabsOf(table);
      expect(tabs.length).toBeGreaterThan(0);
      let seen = 0;
      for (const t of tabs) seen += rowsOfTab(table, t).length;
      expect(seen).toBe(table.rows.length);   // every row is reachable from some tab
    }
  });

  it('puts each validation issue on its row rather than in a list at the top', () => {
    expect(SRC).toContain('issueFor');
    expect(SRC).toContain('rowIssues');
  });
});

// The colour swatch is the one thing the screen infers from a value, and it has to stay that way: it keys
// off the value LOOKING like a hex, so it works for the kit colours, the hair colour and anything added
// later, and it still does not know Appearance or Gear exist.
describe('the one inference the screen is allowed', () => {
  it('draws a swatch off the shape of the value, not off a section or a row id', () => {
    expect(SRC).toMatch(/isHex/);
    expect(SRC).toMatch(/\^#\[0-9a-fA-F\]\{6\}\$/);
    expect(SRC).not.toMatch(/['"`](skinTone|hairColor|colorPrimary)['"`]/);
  });
});
