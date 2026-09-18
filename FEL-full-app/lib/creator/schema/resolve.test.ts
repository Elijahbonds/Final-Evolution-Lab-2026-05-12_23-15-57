// A CREATOR THAT REFUSES YOUR BUILD TAKES AWAY THE SCREEN WHERE YOU COULD FIX IT (2026-09-14).
//
// The resolver is a REPORT, never a gate. The spec asks for exactly that in §9 — "reports violations
// without refusing the load; flag the build as invalid, let the user fix it in the editor" — and these
// tests hold it: an illegal build still resolves, still returns budgets, and still tells you which ROW is
// wrong so the editor can render the complaint next to the control rather than in a wall of text.
//
// And the distinction the spec names: a tendency with no capability behind it is a WARNING, not a
// violation. Setting Three-Point Tendency to 90 on a 40 rating makes a player who shoots his team out of
// games — which is allowed, and which he should be told about.

import { describe, it, expect } from 'vitest';
import { resolve, ATTRIBUTE_POINT_CAP, TRAIT_POINT_CAP, ATTRIBUTE_BASE, TENDENCY_BACKED_BY } from './resolve';
import { TRAITS } from './traits';
import { ATTRIBUTES } from './attributes';

const base = () => ({ attributes: {} as Record<string, number>, traits: {} as Record<string, number> });

describe('resolve — it reports, it never refuses', () => {
  it('returns a resolution for a build that breaks everything at once', () => {
    const r = resolve({
      attributes: { speed: 99, threePoint: 99 },
      traits: { airspaceDenial: 2 },                   // needs block 75; not set at all
      prq: { speed: 10 },                              // a ceiling speed 99 cannot be under
    });
    expect(r.valid).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.budgets.attributePointsSpent).toBeGreaterThan(0);   // still computed
  });

  it('names the ROW for every issue, so the editor can put it beside the control', () => {
    const r = resolve({ attributes: { speed: 99 }, traits: { airspaceDenial: 0 }, prq: { speed: 10 } });
    for (const i of r.issues) { expect(i.rowId.length).toBeGreaterThan(0); expect(i.section.length).toBeGreaterThan(0); }
  });

  it('keeps unknown keys as warnings rather than dropping them — forward compatibility', () => {
    const r = resolve({ attributes: { someFutureAttribute: 70 }, traits: { someFutureTrait: 1 } });
    expect(r.valid).toBe(true);
    expect(r.issues.filter((i) => i.kind === 'warning').length).toBe(2);
  });
});

describe('resolve — PRQ ceilings', () => {
  it('flags an attribute past the ceiling and says how to raise it', () => {
    const r = resolve({ ...base(), attributes: { speed: 95 }, prq: { speed: 20 } });
    const v = r.issues.find((i) => i.rowId === 'speed');
    expect(v?.kind).toBe('violation');
    expect(v?.message).toContain('training speed');
  });

  it('lets a guest build anything — no profile is never a penalty', () => {
    const attributes: Record<string, number> = {};
    for (const a of ATTRIBUTES.rows) attributes[a.id] = 99;
    const r = resolve({ ...base(), attributes, prq: null });
    expect(r.issues.some((i) => i.kind === 'violation' && i.section === 'attributes' && i.rowId !== '__budget')).toBe(false);
  });

  it('never caps a skill attribute on a body measurement', () => {
    const r = resolve({ ...base(), attributes: { threePoint: 99 }, prq: { speed: 1, strength: 1, power: 1 } });
    expect(r.issues.some((i) => i.rowId === 'threePoint')).toBe(false);
  });
});

describe('resolve — traits', () => {
  it('refuses a trait whose prerequisite is not met, and says what is missing', () => {
    const r = resolve({ ...base(), traits: { breakdownArtist: 0 }, attributes: { ballHandle: 40 } });
    const v = r.issues.find((i) => i.rowId === 'breakdownArtist');
    expect(v?.kind).toBe('violation');
    expect(v?.message).toContain('Ball Handle');
  });

  it('accepts one whose prerequisite is met', () => {
    const r = resolve({ ...base(), traits: { breakdownArtist: 0 }, attributes: { ballHandle: 80 } });
    expect(r.issues.some((i) => i.rowId === 'breakdownArtist')).toBe(false);
  });

  it('refuses a tier that does not exist', () => {
    const r = resolve({ ...base(), traits: { breakdownArtist: 9 }, attributes: { ballHandle: 90 } });
    expect(r.issues.find((i) => i.rowId === 'breakdownArtist')?.kind).toBe('violation');
  });

  it('charges the ladder, so gold costs more than bronze', () => {
    const attributes = { ballHandle: 90 };
    const lo = resolve({ ...base(), attributes, traits: { breakdownArtist: 0 } }).budgets.traitPointsSpent;
    const hi = resolve({ ...base(), attributes, traits: { breakdownArtist: 2 } }).budgets.traitPointsSpent;
    expect(hi).toBeGreaterThan(lo);
  });

  it('cannot equip every trait at gold inside the budget — the cap has to bite', () => {
    const attributes: Record<string, number> = {};
    for (const a of ATTRIBUTES.rows) attributes[a.id] = 99;
    const traits: Record<string, number> = {};
    for (const t of TRAITS.rows) traits[t.id] = 2;
    const r = resolve({ attributes, traits, prq: null });
    expect(r.budgets.traitPointsSpent).toBeGreaterThan(TRAIT_POINT_CAP);
    expect(r.valid).toBe(false);
  });
});

describe('resolve — budgets', () => {
  it('charges only the points above the base, so a floor build is not a free max build', () => {
    const r = resolve({ ...base(), attributes: { speed: ATTRIBUTE_BASE } });
    expect(r.budgets.attributePointsSpent).toBe(0);
  });

  it('flags going over the attribute cap', () => {
    const attributes: Record<string, number> = {};
    for (const a of ATTRIBUTES.rows) attributes[a.id] = 99;
    const r = resolve({ attributes, traits: {}, prq: null });
    expect(r.budgets.attributePointsSpent).toBeGreaterThan(ATTRIBUTE_POINT_CAP);
    expect(r.issues.some((i) => i.rowId === '__budget')).toBe(true);
  });
});

describe('resolve — the tendency warning the spec names', () => {
  it('warns when a tendency has no capability behind it, and does NOT invalidate the build', () => {
    const r = resolve({ ...base(), attributes: { threePoint: 35 }, tendencies: { spotUpThree: 90 } });
    const w = r.issues.find((i) => i.rowId === 'spotUpThree');
    expect(w?.kind).toBe('warning');
    expect(r.valid).toBe(true);
  });

  it('stays quiet when the capability is there', () => {
    const r = resolve({ ...base(), attributes: { threePoint: 85 }, tendencies: { spotUpThree: 90 } });
    expect(r.issues.some((i) => i.rowId === 'spotUpThree')).toBe(false);
  });

  it('backs every mapped tendency with an attribute that actually exists', () => {
    const ids = new Set(ATTRIBUTES.rows.map((a) => a.id));
    for (const [tendency, attr] of Object.entries(TENDENCY_BACKED_BY)) {
      expect(ids.has(attr), `${tendency} → ${attr}`).toBe(true);
    }
  });
});

describe('the trait table itself', () => {
  it('has unique ids', () => {
    const ids = TRAITS.rows.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every trait a hook, a ladder, costs that rise, and text per tier', () => {
    for (const t of TRAITS.rows) {
      expect(t.hook.length).toBeGreaterThan(2);
      expect(t.tiers.length).toBe(t.cost.length);
      expect(t.tiers.length).toBe(t.tierText.length);
      for (let i = 1; i < t.cost.length; i++) expect(t.cost[i]).toBeGreaterThan(t.cost[i - 1]);
    }
  });

  // A trait you can equip on a 40 is a trait everybody equips.
  it('gates every trait behind an attribute that exists, at a value worth building toward', () => {
    const ids = new Set(ATTRIBUTES.rows.map((a) => a.id));
    for (const t of TRAITS.rows) {
      expect(t.requires).not.toBeNull();
      expect(ids.has(t.requires!.attribute), `${t.id} → ${t.requires!.attribute}`).toBe(true);
      expect(t.requires!.min).toBeGreaterThanOrEqual(60);
    }
  });

  it('covers the six categories the spec names', () => {
    const tabs = new Set(TRAITS.rows.map((t) => t.tab));
    for (const c of ['Finishing', 'Shooting', 'Playmaking', 'Defense', 'Rebounding', 'Physicals']) expect(tabs.has(c)).toBe(true);
  });
});
