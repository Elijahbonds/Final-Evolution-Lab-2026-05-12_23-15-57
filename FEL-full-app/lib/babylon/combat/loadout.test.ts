// THE PICKS REACH THE FIGHT (2026-09-13).
//
// A picker that stores a choice nothing reads is decoration. These check the other end: that a weapon and a
// style actually change the numbers a strike resolves against, that they compose in the right ORDER, and
// that no combination of the two can produce a move the game cannot run.

import { describe, it, expect } from 'vitest';
import { styleMoveset, styleAttacks, readLoadout } from './loadout';
import { ARSENAL, weaponById } from './arsenal';
import { SCHOOLS, blendTraits, schoolById, type StyleBlend } from './schools';
import { MIN_STARTUP_SEC, validateMoveset } from '../core/StrikeSystem';
import { KARATE_ATTACKS } from '../core/FightCore';

const pure = (id: string): StyleBlend => ({ primary: id, secondary: id, mix: 0 });

describe('A STYLE CHANGES THE NUMBERS', () => {
  it('a faster school really does strike sooner, and a heavier one really does hit harder', () => {
    const base = weaponById('fists').moveset();
    const sharp = styleMoveset(base, blendTraits(pure('sharp')), MIN_STARTUP_SEC);
    const crashing = styleMoveset(base, blendTraits(pure('crashing')), MIN_STARTUP_SEC);
    expect(sharp.jab.startupSec).toBeLessThan(base.jab.startupSec);
    expect(crashing.jab.startupSec).toBeGreaterThan(base.jab.startupSec);
    expect(crashing.heavy.atk.dmg).toBeGreaterThan(base.heavy.atk.dmg);
    expect(sharp.jab.atk.range).toBeLessThan(base.jab.atk.range);       // sharp trades reach for hands
  });

  it('and it never rewrites what the move IS', () => {
    for (const w of ARSENAL) {
      const base = w.moveset();
      const styled = styleMoveset(base, blendTraits(pure('flowing')), MIN_STARTUP_SEC);
      expect(Object.keys(styled)).toEqual(Object.keys(base));
      for (const id of Object.keys(base)) {
        expect(styled[id].atk.clip, `${w.id}/${id}`).toBe(base[id].atk.clip);
        expect(styled[id].atk.line, `${w.id}/${id}`).toBe(base[id].atk.line);
        expect(styled[id].cancelInto, `${w.id}/${id}`).toEqual(base[id].cancelInto);
        expect(styled[id].weight, `${w.id}/${id}`).toBe(base[id].weight);
      }
    }
  });

  it('the source moveset is never mutated — two fighters can share a weapon', () => {
    const base = weaponById('staff').moveset();
    const before = base.poke.startupSec;
    styleMoveset(base, blendTraits(pure('sharp')), MIN_STARTUP_SEC);
    expect(base.poke.startupSec).toBe(before);
  });

  it('THE READABILITY FLOOR HOLDS AGAINST THE FASTEST POSSIBLE BUILD', () => {
    // the whole space: every weapon, every pair of schools, every mix. Nothing may come out under the floor,
    // because a move nobody can react to is not a fast fighter, it is a broken one.
    for (const w of ARSENAL) for (const a of SCHOOLS) for (const b of SCHOOLS) for (let i = 0; i <= 10; i++) {
      const styled = styleMoveset(w.moveset(), blendTraits({ primary: a.id, secondary: b.id, mix: i / 10 }), MIN_STARTUP_SEC);
      const tag = `${w.id} ${a.id}/${b.id}@${i}`;
      expect(validateMoveset(styled), tag).toEqual([]);
      for (const m of Object.values(styled)) {
        expect(m.startupSec, tag).toBeGreaterThanOrEqual(MIN_STARTUP_SEC);
        expect(m.atk.startupMs, tag).toBeGreaterThanOrEqual(MIN_STARTUP_SEC * 1000);
        expect(m.atk.dmg, tag).toBeGreaterThan(0);
        expect(m.atk.range, tag).toBeGreaterThan(0.5);
      }
    }
  });
});

describe('the karate modes get the same style, through their own table', () => {
  it('styleAttacks scales the same four numbers styleMoveset does', () => {
    const t = blendTraits(pure('crashing'));
    const styled = styleAttacks(KARATE_ATTACKS, t, MIN_STARTUP_SEC * 1000);
    expect(styled.heavy.dmg).toBeGreaterThan(KARATE_ATTACKS.heavy.dmg);
    expect(styled.jab.startupMs).toBeGreaterThan(KARATE_ATTACKS.jab.startupMs);
    expect(styled.kick.range).toBeCloseTo(KARATE_ATTACKS.kick.range * t.reach, 6);
    expect(styled.jab.chiGain).toBeCloseTo(KARATE_ATTACKS.jab.chiGain * t.chi, 6);
    // identity is untouched
    expect(styled.kick.clip).toBe(KARATE_ATTACKS.kick.clip);
    expect(styled.kick.line).toBe(KARATE_ATTACKS.kick.line);
  });

  it('and it never mutates the shared KARATE_ATTACKS constant', () => {
    const before = KARATE_ATTACKS.jab.dmg;
    styleAttacks(KARATE_ATTACKS, blendTraits(pure('crashing')), MIN_STARTUP_SEC * 1000);
    expect(KARATE_ATTACKS.jab.dmg).toBe(before);
  });

  it('the startup floor holds there too, across the whole blend space', () => {
    for (const a of SCHOOLS) for (const b of SCHOOLS) for (let i = 0; i <= 10; i++) {
      const styled = styleAttacks(KARATE_ATTACKS, blendTraits({ primary: a.id, secondary: b.id, mix: i / 10 }), MIN_STARTUP_SEC * 1000);
      for (const k of ['jab', 'kick', 'heavy'] as const) {
        expect(styled[k].startupMs, `${a.id}/${b.id}@${i}/${k}`).toBeGreaterThanOrEqual(MIN_STARTUP_SEC * 1000);
      }
    }
  });
});

describe('weapon first, style second', () => {
  it('a staff in a fast fighter’s hands is STILL the longest and slowest thing in the game', () => {
    // the order rule: if a school could reshape a weapon's identity, the weapon picker would mean nothing
    const traitsFast = blendTraits(pure('sharp'));
    const traitsSlow = blendTraits(pure('anchored'));
    const staffFast = styleMoveset(weaponById('staff').moveset(), traitsFast, MIN_STARTUP_SEC);
    const fistsSlow = styleMoveset(weaponById('fists').moveset(), traitsSlow, MIN_STARTUP_SEC);
    const reach = (ms: Record<string, { atk: { range: number } }>) => Math.max(...Object.values(ms).map((m) => m.atk.range));
    expect(reach(staffFast)).toBeGreaterThan(reach(fistsSlow));
    // and slower off the mark than fists are, even with the schools swapped to favour the staff
    const staffSlowest = Math.min(...Object.values(staffFast).map((m) => m.startupSec));
    const fistsSlowest = Math.min(...Object.values(fistsSlow).map((m) => m.startupSec));
    expect(staffSlowest).toBeGreaterThan(fistsSlowest);
  });

  it('the fastest build in the game is still slower than the floor allows nothing to be', () => {
    const fastest = styleMoveset(weaponById('fists').moveset(), blendTraits(pure('sharp')), MIN_STARTUP_SEC);
    expect(Math.min(...Object.values(fastest).map((m) => m.startupSec))).toBeGreaterThanOrEqual(MIN_STARTUP_SEC);
  });
});

describe('readLoadout', () => {
  it('with no picks stored, it is fists and the even hand — exactly how the modes always played', () => {
    const l = readLoadout(MIN_STARTUP_SEC);
    expect(l.weapon.id).toBe('fists');
    expect(l.blend.primary).toBe('straight');
    expect(l.label).toBe('FISTS · STRAIGHT');
  });

  it('an override wins, so a mode’s own in-round weapon phase still works', () => {
    // Duel's A/B/Y select is a real feature; the start-up screen sets what you START with, not what you are
    // stuck with for the rest of the session
    const l = readLoadout(MIN_STARTUP_SEC, { weaponId: 'staff' });
    expect(l.weapon.id).toBe('staff');
    expect(l.reach).toBeCloseTo(weaponById('staff').reach, 1);
  });

  it('reports a reach that matches the styled moveset, not the unstyled weapon', () => {
    const l = readLoadout(MIN_STARTUP_SEC, { weaponId: 'blade' });
    expect(l.reach).toBeCloseTo(Math.max(...Object.values(l.moveset).map((m) => m.atk.range)), 6);
  });

  it('and a guardTaken a mode can multiply straight into its guard maths', () => {
    const l = readLoadout(MIN_STARTUP_SEC);
    expect(l.guardTaken).toBeGreaterThan(0.4);
    expect(l.guardTaken).toBeLessThan(1.6);
    expect(schoolById(l.blend.primary).id).toBe('straight');
  });
});
