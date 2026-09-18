// A PLAYER WITHOUT A BODY SCAN MUST NOT GET A WORSE ATHLETE (2026-09-14).
//
// Tying attributes to PRQ is one step from making a fitness score into a paywall on the character creator:
// do the scan or play a capped build. The rule is the opposite — PRQ is UPSIDE for those who have it and
// never a tax on those who do not, and a missing profile opens the full range rather than closing it.
// These tests hold that, and hold the other half: skill is not measured and is therefore never capped.

import { describe, it, expect } from 'vitest';
import { ceilingFor, withinCeiling, clampToCeiling, ceilingNote, NO_PRQ_CAP, PRQ_HEADROOM, MIN_CEILING } from './ceilings';
import { ATTRIBUTES } from './attributes';
import type { RatedRow } from './types';

const row = (id: string) => ATTRIBUTES.rows.find((r) => r.id === id) as RatedRow;

describe('ceilings — no PRQ is never a penalty', () => {
  it('opens the full range when there is no profile at all', () => {
    for (const r of ATTRIBUTES.rows) {
      expect(ceilingFor(r, null)).toBeGreaterThanOrEqual(NO_PRQ_CAP);
      expect(ceilingFor(r, undefined)).toBeGreaterThanOrEqual(NO_PRQ_CAP);
      expect(ceilingFor(r, {})).toBeGreaterThanOrEqual(NO_PRQ_CAP);
    }
  });

  it('says nothing under the row when there is nothing to say', () => {
    expect(ceilingNote(row('speed'), null)).toBe('');
    expect(ceilingNote(row('threePoint'), { speed: 50 })).toBe('');   // skill is never capped
  });
});

describe('ceilings — skill is free, the body is measured', () => {
  it('never caps a skill attribute, however low the scan', () => {
    const skills = ['threePoint', 'postHook', 'courtVision', 'passAccuracy', 'ballHandle', 'freeThrow'];
    for (const id of skills) {
      expect(row(id).prqAxis).toBeNull();
      expect(ceilingFor(row(id), { speed: 1, strength: 1, power: 1, agility: 1, endurance: 1 })).toBe(99);
    }
  });

  it('caps every athleticism row, because every one of them is a body', () => {
    for (const r of ATTRIBUTES.rows.filter((x) => x.tab === 'Athleticism')) expect(r.prqAxis).not.toBeNull();
  });

  it('gives a measured athlete headroom above what they demonstrated', () => {
    expect(ceilingFor(row('speed'), { speed: 60 })).toBe(60 + PRQ_HEADROOM);
  });

  it('never drops a ceiling below playable, whatever the scan said', () => {
    for (const v of [0, 5, 20, 30]) expect(ceilingFor(row('speed'), { speed: v })).toBeGreaterThanOrEqual(MIN_CEILING);
  });

  it('never lets a ceiling exceed the row maximum', () => {
    expect(ceilingFor(row('speed'), { speed: 100 })).toBe(99);
    expect(ceilingFor(row('vertical'), { power: 999 })).toBe(99);
  });

  it('clamps garbage rather than propagating it', () => {
    expect(ceilingFor(row('speed'), { speed: NaN })).toBe(NO_PRQ_CAP);
    expect(clampToCeiling(row('speed'), NaN, { speed: 50 })).toBe(row('speed').min);
    expect(clampToCeiling(row('speed'), 999, { speed: 50 })).toBe(ceilingFor(row('speed'), { speed: 50 }));
  });
});

describe('ceilings — the stepper', () => {
  it('cannot be walked past the cap', () => {
    const axes = { speed: 40 };
    const cap = ceilingFor(row('speed'), axes);
    let v = 0;
    for (let i = 0; i < 200; i++) v = clampToCeiling(row('speed'), v + 1, axes);
    expect(v).toBe(cap);
  });

  it('agrees with withinCeiling at every step', () => {
    const axes = { power: 55 };
    for (let v = -5; v <= 120; v++) {
      const legal = withinCeiling(row('vertical'), v, axes);
      expect(legal).toBe(v >= 0 && v <= ceilingFor(row('vertical'), axes));
    }
  });

  it('tells the player how to raise it', () => {
    expect(ceilingNote(row('vertical'), { power: 50 })).toContain('power');
    expect(ceilingNote(row('vertical'), { power: 50 })).toContain('CEILING');
  });
});

describe('the attribute table itself', () => {
  it('has unique ids — a duplicate silently overwrites a build value', () => {
    const ids = ATTRIBUTES.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every row glossary text, which the spec requires of every row', () => {
    for (const r of ATTRIBUTES.rows) expect(r.glossary.length).toBeGreaterThan(10);
  });

  it('covers the six tabs the spec names', () => {
    const tabs = new Set(ATTRIBUTES.rows.map((r) => r.tab));
    for (const t of ['Misc', 'Offense', 'Defense', 'Athleticism', 'Durability', 'Mental']) expect(tabs.has(t)).toBe(true);
  });

  it('keeps durability bilateral — every left has a right', () => {
    const dur = ATTRIBUTES.rows.filter((r) => r.tab === 'Durability').map((r) => r.id);
    for (const id of dur.filter((d) => d.endsWith('L'))) expect(dur).toContain(`${id.slice(0, -1)}R`);
  });

  // The platform rule: performance and movement language, never diagnosis.
  it('never lets a durability glossary read as a medical claim', () => {
    const banned = /injur|pain|damage|risk|heal|diagnos|condition|weak|chronic|strain|tear/i;
    for (const r of ATTRIBUTES.rows.filter((x) => x.tab === 'Durability')) {
      expect(r.glossary).not.toMatch(banned);
    }
  });
});
