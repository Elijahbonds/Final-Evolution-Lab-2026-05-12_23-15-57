// NO WEAPON WINS EVERY FIGHT (2026-09-13).
//
// Same rule as the racing garage, for the same reason: a picker whose four options include one that is simply
// better is a picker with one option. Here it matters more, because a fight is against another person and a
// dominant weapon does not just bore the player who found it — it ruins the match for the one who did not.
//
// And one thing the garage does not need: every moveset must pass validateMoveset, because an unreadable
// startup is not a balance problem, it is a move nobody can react to.

import { describe, it, expect } from 'vitest';
import { ARSENAL, readyWeapons, weaponById, WEAPON_GRIP, type ArsenalEntry } from './arsenal';
import { validateMoveset } from '../core/StrikeSystem';

/** The three numbers that decide a trade, per move: how far, how soon, how much it takes. */
function profile(w: ArsenalEntry) {
  const moves = Object.values(w.moveset());
  const light = moves.reduce((a, b) => (b.startupSec < a.startupSec ? b : a));
  const heavy = moves.reduce((a, b) => (b.atk.dmg > a.atk.dmg ? b : a));
  return {
    reach: Math.max(...moves.map((m) => m.atk.range)),
    jabReach: light.atk.range,
    fastest: light.startupSec,
    topDamage: heavy.atk.dmg,
    guardBreak: Math.max(...moves.map((m) => m.atk.guardDmg)),
  };
}

describe('THE ARSENAL HAS NO BEST WEAPON', () => {
  it('no weapon out-reaches, out-speeds AND out-hits another', () => {
    const bad: string[] = [];
    for (const a of ARSENAL) for (const b of ARSENAL) {
      if (a === b) continue;
      const pa = profile(a), pb = profile(b);
      const noWorse = pa.reach >= pb.reach && pa.fastest <= pb.fastest && pa.topDamage >= pb.topDamage;
      const better = pa.reach > pb.reach || pa.fastest < pb.fastest || pa.topDamage > pb.topDamage;
      if (noWorse && better) bad.push(`${a.id} dominates ${b.id}`);
    }
    expect(bad).toEqual([]);
  });

  it('each weapon is the BEST at exactly the thing its picker line claims', () => {
    const best = <K extends keyof ReturnType<typeof profile>>(k: K, low = false) =>
      ARSENAL.reduce((a, b) => {
        const va = profile(a)[k], vb = profile(b)[k];
        return (low ? vb < va : vb > va) ? b : a;
      }).id;
    expect(best('reach'), 'the longest weapon should be the staff').toBe('staff');
    expect(best('fastest', true), 'the fastest should be fists').toBe('fists');
    expect(best('guardBreak'), 'the guard breaker should be the gauntlet').toBe('gauntlet');
    // and the copy on the chips agrees with all three
    expect(weaponById('staff').sub.toLowerCase()).toContain('reach');
    expect(weaponById('fists').sub.toLowerCase()).toContain('fastest');
    expect(weaponById('gauntlet').sub.toLowerCase()).toContain('guard');
  });

  it('and the picker BARS agree with the movesets', () => {
    const top = (of: (w: ArsenalEntry) => number) => ARSENAL.reduce((a, b) => (of(b) > of(a) ? b : a)).id;
    expect(top((w) => w.bars.reach)).toBe(top((w) => profile(w).reach));
    // the two reaches must agree about who is longest, or the bar ranks one thing and the spacing another
    expect(top((w) => w.reach)).toBe(top((w) => w.jabReach));
    expect(top((w) => w.bars.speed)).toBe(ARSENAL.reduce((a, b) => (profile(b).fastest < profile(a).fastest ? b : a)).id);
    expect(top((w) => w.bars.power)).toBe(top((w) => profile(w).guardBreak));
  });
});

describe('every weapon is a working weapon', () => {
  it('every moveset is readable — validateMoveset finds nothing', () => {
    for (const w of ARSENAL) expect(validateMoveset(w.moveset()), w.id).toEqual([]);
  });

  it('a moveset is built FRESH each time, never shared between two fighters', () => {
    // a moveset carries no state today, but the StrikeController mutates what it is handed, and two fighters
    // holding the same object is the kind of bug that shows up as "the rival's combo cancelled mine"
    for (const w of ARSENAL) expect(w.moveset(), w.id).not.toBe(w.moveset());
  });

  it('every move has a real range, damage and startup', () => {
    for (const w of ARSENAL) for (const [id, m] of Object.entries(w.moveset())) {
      expect(m.atk.range, `${w.id}/${id} range`).toBeGreaterThan(0.5);
      expect(m.atk.dmg, `${w.id}/${id} dmg`).toBeGreaterThan(0);
      expect(m.startupSec, `${w.id}/${id} startup`).toBeGreaterThan(0);
      expect(m.atk.clip, `${w.id}/${id} clip`).toBeTruthy();
    }
  });

  it('THE DECLARED REACH IS THE FURTHEST MOVE, NOT THE JAB', () => {
    // Every declared reach in the codebase quoted the JAB's range — DuelMode's WEAPON_RANGE still has fists
    // at 1.6 while their kick reaches 1.9. The AI spaces off this number, so understating it puts the AI at a
    // distance it believes is safe and it eats a kick there, every round. Both numbers are now carried,
    // because both questions are real: how far can it hit me, and how far do we fence.
    for (const w of ARSENAL) {
      expect(w.reach, `${w.id} reach`).toBeCloseTo(profile(w).reach, 2);
      expect(w.jabReach, `${w.id} jabReach`).toBeCloseTo(profile(w).jabReach, 2);
      expect(w.reach, `${w.id}`).toBeGreaterThanOrEqual(w.jabReach);
    }
  });
});

describe('the arsenal as the picker sees it', () => {
  it('offers four, all ready, uniquely named, each naming its cost', () => {
    const list = readyWeapons();
    expect(list).toHaveLength(4);
    expect(new Set(list.map((w) => w.id)).size).toBe(4);
    expect(new Set(list.map((w) => w.name)).size).toBe(4);
    for (const w of list) expect(w.sub.length, w.id).toBeGreaterThan(20);
  });

  it('FISTS is first, and it is the one with no prop', () => {
    // so a player who never opens the picker fights exactly as the karate modes always have
    expect(ARSENAL[0].id).toBe('fists');
    expect(ARSENAL[0].buildProp).toBeNull();
    for (const w of ARSENAL.slice(1)) expect(w.buildProp, w.id).not.toBeNull();
  });

  it('every weapon has a grip offset, and only fists sit at the wrist origin', () => {
    // WeaponRig parents props at the origin of RightHand, which puts a 1.8 m staff's CENTRE at the wrist
    for (const w of ARSENAL) {
      const grip = WEAPON_GRIP[w.id];
      expect(grip, w.id).toBeTruthy();
      if (w.id !== 'fists') expect(grip.offset.length(), `${w.id} grip`).toBeGreaterThan(0);
    }
  });

  it('weaponById falls back to fists rather than throwing on an unknown id', () => {
    expect(weaponById('nonsense').id).toBe('fists');
  });
});
