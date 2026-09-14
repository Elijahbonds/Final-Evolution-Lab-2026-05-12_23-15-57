// THE SECTION THAT WAS GOING TO NEED A SPECIAL CASE (2026-09-14).
//
// Hot Zones is a court grid with a state ladder. It looks nothing like a 0–99 slider or a tiered trait,
// and it is the section where somebody adds `if (section === 'hotZones')` to the editor and quietly ends
// the abstraction §10 step 2 asked for. It did not need one — a zone cycling FRIGID→BURNING is
// structurally a SLOT — and these tests hold that, plus the cold-zones-refund economy that turns the
// section from a ceiling into a decision.

import { describe, it, expect } from 'vitest';
import { TENDENCIES } from './tendencies';
import {
  HOT_ZONES, ZONE_STATES, ZONE_COST, ZONE_POINT_CAP, ZONE_PLACEMENT, ZONE_DEFAULT,
  zoneMultiplier, zonePointsSpent,
} from './hotZones';
import { ATTRIBUTES } from './attributes';
import { TENDENCY_BACKED_BY, resolve } from './resolve';
import { tabsOf, rowsOfTab } from './types';
import { step, displayValue } from '../editor/rowState';

describe('tendencies', () => {
  it('has unique ids and full glossary coverage', () => {
    const ids = TENDENCIES.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of TENDENCIES.rows) expect(r.glossary.length).toBeGreaterThan(10);
  });

  // A tendency is a CHOICE, not a physical capacity.
  it('is never capped by a body measurement', () => {
    for (const r of TENDENCIES.rows) expect(r.prqAxis).toBeNull();
  });

  it('covers the six tabs the spec names', () => {
    const tabs = new Set(TENDENCIES.rows.map((r) => r.tab));
    for (const t of ['Shot Selection', 'Inside', 'Mid/Three', 'Post', 'Passing', 'Defense']) expect(tabs.has(t)).toBe(true);
  });

  it('backs its mapped rows with attributes that exist, and maps only rows that exist', () => {
    const attrIds = new Set(ATTRIBUTES.rows.map((a) => a.id));
    const tendIds = new Set(TENDENCIES.rows.map((t) => t.id));
    for (const [tendency, attr] of Object.entries(TENDENCY_BACKED_BY)) {
      expect(attrIds.has(attr), `${tendency} → ${attr}`).toBe(true);
      expect(tendIds.has(tendency), `mapped tendency ${tendency} exists`).toBe(true);
    }
  });
});

describe('hot zones — no new row kind was needed', () => {
  it('is expressed entirely as slot rows', () => {
    for (const r of HOT_ZONES.rows) expect(r.kind).toBe('slot');
  });

  it('walks its ladder through the SAME stepper every other section uses', () => {
    const row = HOT_ZONES.rows[0];
    let v: string | null = 'FRIGID';
    const seen: (string | null)[] = [v];
    for (let i = 0; i < 6; i++) { v = step(row, v, 1, null) as string; seen.push(v); }
    expect(seen.slice(0, ZONE_STATES.length)).toEqual([...ZONE_STATES]);
  });

  // One press past BURNING must not drop you to FRIGID and tank a zone you had just maxed.
  it('holds at BURNING instead of wrapping to FRIGID', () => {
    const row = HOT_ZONES.rows[0];
    expect(step(row, 'BURNING', 1, null)).toBe('BURNING');
    expect(step(row, 'FRIGID', -1, null)).toBe('FRIGID');
  });

  it('never offers NONE — a zone always has a state', () => {
    for (const r of HOT_ZONES.rows) expect(r.allowNone).toBe(false);
    expect(displayValue(HOT_ZONES.rows[0], 'HOT')).toBe('HOT');
  });

  it('gives every zone a place on the diagram, inside the half court', () => {
    for (const r of HOT_ZONES.rows) {
      const p = ZONE_PLACEMENT[r.id];
      expect(p, r.id).toBeTruthy();
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('renders as one tab through the generic derivation', () => {
    expect(tabsOf(HOT_ZONES)).toEqual(['Court']);
    expect(rowsOfTab(HOT_ZONES, 'Court').length).toBe(HOT_ZONES.rows.length);
  });
});

describe('hot zones — the economy', () => {
  it('costs nothing to be neutral everywhere, and buys nothing', () => {
    expect(zonePointsSpent({})).toBe(0);
    expect(zoneMultiplier(ZONE_DEFAULT)).toBe(1);
  });

  it('refunds cold zones so a build can specialise', () => {
    expect(ZONE_COST.FRIGID).toBeLessThan(0);
    expect(ZONE_COST.COLD).toBeLessThan(0);
    expect(ZONE_COST.HOT).toBeGreaterThan(0);
    expect(ZONE_COST.BURNING).toBeGreaterThan(ZONE_COST.HOT);
  });

  it('cannot be hot everywhere — the cap has to bite', () => {
    const all: Record<string, string> = {};
    for (const r of HOT_ZONES.rows) all[r.id] = 'BURNING';
    expect(zonePointsSpent(all)).toBeGreaterThan(ZONE_POINT_CAP);
    expect(resolve({ attributes: {}, traits: {}, hotZones: all }).valid).toBe(false);
  });

  it('lets a specialist pay for a burning corner by going cold elsewhere', () => {
    const build: Record<string, string> = {
      cornerThreeR: 'BURNING', wingThreeR: 'HOT',
      midBaselineL: 'FRIGID', shortCornerL: 'FRIGID', paint: 'COLD',
    };
    expect(zonePointsSpent(build)).toBeLessThanOrEqual(ZONE_POINT_CAP);
    expect(resolve({ attributes: {}, traits: {}, hotZones: build }).valid).toBe(true);
  });

  it('shoots better from a hot zone and worse from a cold one', () => {
    expect(zoneMultiplier('BURNING')).toBeGreaterThan(zoneMultiplier('HOT'));
    expect(zoneMultiplier('HOT')).toBeGreaterThan(1);
    expect(zoneMultiplier('COLD')).toBeLessThan(1);
    expect(zoneMultiplier('FRIGID')).toBeLessThan(zoneMultiplier('COLD'));
  });

  it('treats an unrecognised state as neutral rather than throwing', () => {
    expect(zoneMultiplier('NONSENSE')).toBe(1);
    expect(zoneMultiplier(null)).toBe(1);
    expect(zoneMultiplier(undefined)).toBe(1);
  });

  it('flags a bad state without refusing the build', () => {
    const r = resolve({ attributes: {}, traits: {}, hotZones: { paint: 'MOLTEN' } });
    expect(r.issues.find((i) => i.rowId === 'paint')?.kind).toBe('violation');
    expect(r.budgets.hotZonePointsCap).toBe(ZONE_POINT_CAP);
  });
});

// ── MECHANICS ───────────────────────────────────────────────────────────────────────────────────────────
//
// The spec's requirement was "slots gated by attribute + body-measurement thresholds", and that gate
// already existed: HandleSystem.MOVE_HANDLE prices every dribble move by Ball Handle and the game checks
// it with hasMove(). The instruction was to EXTEND that, not build a parallel one — so the sharpest test
// here is that the creator's dribble thresholds ARE the game's, number for number. If they ever drift, the
// creator and the game are telling a player two different things about the same move.

import { MECHANICS, slotGate, BASES, RELEASES, DUNK_PACKAGES } from './mechanics';
import { MOVE_HANDLE } from '../../babylon/core/HandleSystem';

describe('mechanics slots', () => {
  it('reuses MOVE_HANDLE\'s own thresholds rather than inventing a parallel gate', () => {
    const gates = new Map(MECHANICS.rows
      .filter((r) => r.tab === 'Dribble')
      .map((r) => [r.label, slotGate(r)?.min ?? 0] as const));
    // every non-zero MOVE_HANDLE threshold appears as a dribble slot gate
    for (const [move, min] of Object.entries(MOVE_HANDLE)) {
      if (min === 0) continue;
      expect([...gates.values()], `${move} @ ${min}`).toContain(min);
    }
  });

  it('gates every dribble slot on Ball Handle, the attribute the game actually reads', () => {
    for (const r of MECHANICS.rows.filter((x) => x.tab === 'Dribble')) {
      const g = slotGate(r);
      if (g) expect(g.attribute).toBe('ballHandle');
    }
  });

  it('lets the optional dunk packages be empty and the required slots not', () => {
    const opt = MECHANICS.rows.filter((r) => /^finDunk[2-5]$/.test(r.id));
    expect(opt.length).toBe(4);
    for (const r of opt) expect(r.kind === 'slot' && r.allowNone).toBe(true);
    const base = MECHANICS.rows.find((r) => r.id === 'jsBase');
    expect(base && base.kind === 'slot' && base.allowNone).toBe(false);
  });

  it('asks for a harder attribute for each successive dunk package', () => {
    const mins = ['finDunk1', 'finDunk2', 'finDunk3', 'finDunk4', 'finDunk5']
      .map((id) => slotGate(MECHANICS.rows.find((r) => r.id === id)!)?.min ?? 0);
    for (let i = 1; i < mins.length; i++) expect(mins[i]).toBeGreaterThan(mins[i - 1]);
  });

  it('names only FEL motion sets — never a real athlete', () => {
    const all = [...BASES, ...RELEASES, ...DUNK_PACKAGES].join(' ');
    expect(all).not.toMatch(/[A-Z][a-z]+\s+[A-Z][a-z]+ic\b/);       // no "Somebody Jordanic" style tokens
    for (const s of BASES) expect(s).toMatch(/Hinge|Stack|Base|Coil|Load/);   // biomechanical, per the spec's axis
  });

  it('filled the spec\'s two blank tabs with sections that have substrate', () => {
    const tabs = new Set(MECHANICS.rows.map((r) => r.tab));
    expect(tabs.has('Dribble')).toBe(true);      // HandleSystem
    expect(tabs.has('Signature')).toBe(true);    // the Music Room walk-out DunkMode already plays
  });

  it('refuses a slot the player cannot perform, and says what is missing', () => {
    const r = resolve({ attributes: { ballHandle: 40 }, traits: {}, mechanics: { dribbleShamm: 'Standard' } });
    const v = r.issues.find((i) => i.rowId === 'dribbleShamm');
    expect(v?.kind).toBe('violation');
    expect(v?.message).toContain('Ball Handle');
  });

  it('accepts an EMPTY optional slot without complaint even when the gate is unmet', () => {
    const r = resolve({ attributes: { drivingDunk: 10 }, traits: {}, mechanics: { finDunk5: null } });
    expect(r.issues.some((i) => i.rowId === 'finDunk5')).toBe(false);
  });
});
