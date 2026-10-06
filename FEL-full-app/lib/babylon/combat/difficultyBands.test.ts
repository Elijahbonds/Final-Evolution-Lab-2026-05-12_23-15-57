// COMBAT DIFFICULTY (2026-10-06): the owner's targets for a DECENT player — ROOKIE 85 % / PRO 55 % / ELITE 30 % of matches
// in the four duel modes — held as bands, on the trimmed harness (difficultySim: a pad bot against each mode's real brain,
// strike, defense, movement, arena and rival power). Deterministic: fixed seeds, Math.random seeded per match.
//
// What a red here means: a combat change moved how winnable a duel is. Re-measure with the full harness (the session
// scratchpad's combat-difficulty/) and re-tune RIVAL_POWER_BASE / RIVAL_TIER_POWER (FightCore) — do not widen a band to
// make it green.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCell, runMatch, type SimMode } from './difficultySim';
import { rivalPower, applyRivalPower, poweredAttack, RIVAL_POWER_BASE, RIVAL_TIER_POWER, FighterState, KARATE_ATTACKS, resolveStrike } from '../core/FightCore';
import { ComboBreaker, COMBO_BREAK } from '../core/ComboBreaker';

const MODES: SimMode[] = ['kvs', 'showdown', 'duel', 'mixed'];

// The harness MIRRORS the modes' wiring (a mode file mounts a scene, so it cannot be imported here). These pins keep the
// mirror honest: each mode puts its own power on the rival at a round start, and the three without the line grammar turn
// the brain's sidestep off.
const MODE_FILE: Record<SimMode, { file: string; power: string; stepping: boolean }> = {
  kvs: { file: 'KarateVSMode.ts', power: 'rivalPower(RIVAL_POWER_BASE.karateVs, readTier())', stepping: false },
  showdown: { file: 'ShowdownMode.ts', power: 'rivalPower(RIVAL_POWER_BASE.showdown, readTier())', stepping: false },
  duel: { file: 'DuelMode.ts', power: 'rivalPower(RIVAL_POWER_BASE.duel * DUEL.rivalPowerByWeapon[myWeapon], readTier())', stepping: false },
  mixed: { file: 'MixedCombatMode.ts', power: 'rivalPower(RIVAL_POWER_BASE.mixedcombat * RIVAL_POWER_BY_LOADOUT[myLoadout], readTier())', stepping: true },
};
const modeSrc = (f: string): string => readFileSync(join(__dirname, '..', 'modes', f), 'utf8');

describe('the rival\'s power reaches every duel mode (what the harness mirrors)', () => {
  for (const mode of MODES) {
    const { file, power, stepping } = MODE_FILE[mode];
    it(`${file}: ${power} on the rival, its blows powered${stepping ? '' : ', no sidestep'}`, () => {
      const s = modeSrc(file);
      expect(s).toContain(`foePower = ${power};`);
      expect(s).toContain('applyRivalPower(foeState, foePower);');
      expect(s.includes('poweredAttack(atk0, foePower)') || s.includes('(mine ? 1 : foePower.dmg)')).toBe(true);
      expect(s.includes('setStepping(false)')).toBe(!stepping);
    });
  }
  it('DuelMode: the rival reads what your weapon reaches, and your staff swings its authored chain', () => {
    const s = modeSrc('DuelMode.ts');
    expect(s).toContain('rivalBrain.setFoeReach(WEAPON_RANGE[myWeapon]);');
    // YOUR weapons' table (the rival's own RIVAL_MOVESET has the same staff line, so the pin reads this block only)
    const mine = s.slice(s.indexOf('const WEAPON_MOVESET'), s.indexOf('const RIVAL_MOVESET'));
    expect(mine).toContain('staff: () => staffMoveset(STAFF_ATTACKS),');
    expect(mine).not.toContain('stringRule(staffMoveset');
  });
  it('power means hp × p, damage × √p, guard taken × 1/p; PRO is the base, ROOKIE lighter, ELITE no lighter', () => {
    const pw = rivalPower(2.25, 'pro');
    expect(pw).toEqual({ p: 2.25, hp: 2.25, dmg: 1.5, guardTaken: 1 / 2.25 });
    expect(rivalPower(2, 'rookie').p).toBeCloseTo(2 * RIVAL_TIER_POWER.rookie, 9);
    expect(RIVAL_TIER_POWER.rookie).toBeLessThan(RIVAL_TIER_POWER.pro);
    expect(RIVAL_TIER_POWER.elite).toBeGreaterThanOrEqual(RIVAL_TIER_POWER.pro);
    expect(rivalPower(1, null)).toEqual({ p: 1, hp: 1, dmg: 1, guardTaken: 1 });
    const st = new FighterState(100);
    applyRivalPower(st, pw); st.resetRound();
    expect(st.maxHp).toBe(225); expect(st.hp).toBe(225);
    expect(poweredAttack(KARATE_ATTACKS.jab, pw).dmg).toBeCloseTo(KARATE_ATTACKS.jab.dmg * 1.5, 9);
    expect(KARATE_ATTACKS.jab.dmg).toBe(6);   // the shared table is never touched
    // a sturdier guard: the same heavy chips 1/p of what it chips a plain body (control: the plain body)
    const plain = new FighterState(100); plain.pressBlock(-1e9);
    st.pressBlock(-1e9);
    expect(resolveStrike(KARATE_ATTACKS.heavy, 1, plain, 10_000)).toBe('blocked');
    expect(resolveStrike(KARATE_ATTACKS.heavy, 1, st, 10_000)).toBe('blocked');
    expect(100 - st.guard).toBeCloseTo((100 - plain.guard) / 2.25, 6);
  });
});
const SEED = 1;
/** Matches per cell. PRO is the pinned band; ROOKIE / ELITE only need to order around it. */
const N_PRO = 100, N_TIER = 40;

describe('controls: the harness itself', () => {
  it('a match is deterministic for its seed', () => {
    for (const mode of MODES) {
      const a = runMatch({ mode, tier: 'pro', profile: 'decent', seed: 7 });
      const b = runMatch({ mode, tier: 'pro', profile: 'decent', seed: 7 });
      expect(b, mode).toEqual(a);
    }
  });
  it('a player who never presses anything loses every match (the rival must be able to win)', () => {
    for (const mode of MODES) expect(runCell({ mode, tier: 'rookie', profile: 'passive' }, 10, SEED).winRate, mode).toBe(0);
  });
  it('the rival\'s own brain, on the rival\'s own moves and body, comes out even (the engines favour nobody)', () => {
    for (const mode of ['kvs', 'showdown'] as SimMode[]) {
      const w = runCell({ mode, tier: 'pro', profile: 'mirror' }, 60, SEED).winRate;
      expect(w, mode).toBeGreaterThan(0.3);
      expect(w, mode).toBeLessThan(0.7);
    }
  });
});

describe('the decent player\'s bands (default arena, fists)', () => {
  const pro: Partial<Record<SimMode, number>> = {};
  for (const mode of MODES) {
    it(`${mode}: PRO is a coin-flip leaning to the player (45–65 % of matches)`, () => {
      const w = runCell({ mode, tier: 'pro', profile: 'decent' }, N_PRO, SEED).winRate;
      pro[mode] = w;
      expect(w).toBeGreaterThanOrEqual(0.45);
      expect(w).toBeLessThanOrEqual(0.65);
    });
    it(`${mode}: ROOKIE > PRO > ELITE`, () => {
      const p = pro[mode] ?? runCell({ mode, tier: 'pro', profile: 'decent' }, N_PRO, SEED).winRate;
      const r = runCell({ mode, tier: 'rookie', profile: 'decent' }, N_TIER, SEED).winRate;
      const e = runCell({ mode, tier: 'elite', profile: 'decent' }, N_TIER, SEED).winRate;
      expect(r).toBeGreaterThan(p);
      expect(e).toBeLessThan(p);
      expect(e).toBeLessThanOrEqual(0.45);   // ELITE stays a real fight (target 30 %)
    });
  }
});

describe('every pick is the same fight at PRO (decent player)', () => {
  for (const [mode, weapon] of [['duel', 'blade'], ['duel', 'staff'], ['mixed', 'staff']] as const) {
    it(`${mode} with the ${weapon}: 40–70 % of matches at PRO, ELITE harder`, () => {
      const p = runCell({ mode, weapon, tier: 'pro', profile: 'decent' }, 60, SEED).winRate;
      const e = runCell({ mode, weapon, tier: 'elite', profile: 'decent' }, 40, SEED).winRate;
      expect(p).toBeGreaterThanOrEqual(0.4);
      expect(p).toBeLessThanOrEqual(0.7);
      expect(e).toBeLessThan(p);
    });
  }
  it('a mashed staff no longer wins the Duel by itself (it won 100 % at every tier under the string rule)', () => {
    const d = runCell({ mode: 'duel', weapon: 'staff', tier: 'pro', profile: 'decent' }, 60, SEED).winRate;
    const m = runCell({ mode: 'duel', weapon: 'staff', tier: 'pro', profile: 'masher' }, 60, SEED).winRate;
    expect(m).toBeLessThan(d);
  });
});

describe('the reference players', () => {
  it('a NEW player (slow, few reads) still wins at ROOKIE', () => {
    for (const mode of MODES) expect(runCell({ mode, tier: 'rookie', profile: 'new' }, N_TIER, SEED).winRate, mode).toBeGreaterThan(0.5);
  });
  // COMBAT DIFFICULTY (2026-10-06, the combo breaker): Showdown and Duel are pinned too now — the rival breaks out of a
  // mashed string there (core/ComboBreaker). Their masher sits nearer the line, so they are measured on 200 matches.
  for (const [mode, n] of [['kvs', N_PRO], ['mixed', N_PRO], ['showdown', 200], ['duel', 200]] as const) {
    it(`${mode}: a masher does clearly worse than a decent player — 15+ points under at PRO, under at ELITE`, () => {
      const d = runCell({ mode, tier: 'pro', profile: 'decent' }, n, SEED).winRate;
      const m = runCell({ mode, tier: 'pro', profile: 'masher' }, n, SEED).winRate;
      expect(m).toBeLessThanOrEqual(d - 0.15);
      const de = runCell({ mode, tier: 'elite', profile: 'decent' }, 60, SEED).winRate;
      const me = runCell({ mode, tier: 'elite', profile: 'masher' }, 60, SEED).winRate;
      expect(me).toBeLessThan(de);
    });
  }
});

describe('the combo breaker (core/ComboBreaker)', () => {
  const string = (b: ComboBreaker, links: number, gapSec = 0.05): void => {
    for (let i = 0; i < links; i++) { const swing = { i }; b.track(gapSec, swing); b.track(0.1, swing); }   // one swing, two frames
  };
  it('counts the links of ONE unbroken string; an idle gap starts a new one', () => {
    const b = new ComboBreaker();
    string(b, 3);
    expect(b.string).toBe(3);
    b.track(COMBO_BREAK.idleGapSec + 0.01, null);   // he stopped pressing long enough
    string(b, 1);
    expect(b.string).toBe(1);
  });
  it('never breaks a book-length string (a decent player\'s), only one past minLinks', () => {
    const b = new ComboBreaker(), yes = () => 0;   // a roll that always succeeds
    string(b, COMBO_BREAK.minLinks - 1);
    expect(b.hit(10, 'elite', true, yes)).toBe(false);
    string(b, 1);
    expect(b.hit(10, 'elite', true, yes)).toBe(true);
  });
  it('needs the meter (affordable), then waits out its cooldown', () => {
    const b = new ComboBreaker(), yes = () => 0;
    string(b, COMBO_BREAK.minLinks);
    expect(b.hit(10, 'pro', false, yes)).toBe(false);   // no chi / nowhere to go
    expect(b.hit(10, 'pro', true, yes)).toBe(true);
    string(b, COMBO_BREAK.minLinks);
    expect(b.hit(10 + COMBO_BREAK.cooldownSec - 0.1, 'pro', true, yes)).toBe(false);
    expect(b.hit(10 + COMBO_BREAK.cooldownSec + 0.1, 'pro', true, yes)).toBe(true);
  });
  it('ROOKIE rarely breaks, ELITE reliably', () => {
    expect(COMBO_BREAK.chance.rookie).toBeLessThan(COMBO_BREAK.chance.pro);
    expect(COMBO_BREAK.chance.pro).toBeLessThan(COMBO_BREAK.chance.elite);
    const roll = (r: number, tier: 'rookie' | 'elite') => { const b = new ComboBreaker(); string(b, COMBO_BREAK.minLinks); return b.hit(10, tier, true, () => r); };
    expect(roll(0.5, 'rookie')).toBe(false);
    expect(roll(0.5, 'elite')).toBe(true);
  });
  for (const [file, tag] of [['ShowdownMode.ts', 'SD'], ['DuelMode.ts', 'DL']] as const) {
    it(`${file}: tracks my string, breaks on a landed blow, pays and plays it (BREAK!, the flash, the whiff beat, the counter)`, () => {
      const s = modeSrc(file);
      expect(s).toContain('breaker.track(dt, meStrike.current);');
      expect(s).toMatch(/breaker\.hit\(now\(\) \/ 1000, readTier\(\), /);
      expect(s).toContain("banner(ctx, 'BREAK! — THE RIVAL ESCAPED YOUR STRING', 900);");
      expect(s).toContain("ctx.juice.flash('#ff3344', 110);");
      expect(s).toContain('rivalBrain.openCounter(COMBO_BREAK.counterSec);');
      expect(s).toContain(`console.info('[${tag}-STORM] rival combo break');`);
      expect(s).toContain('breaker.reset();');
      expect(s).toMatch(/if \(outcome === 'hit'\) .*hitTaken/);   // a blow taken builds the meter that pays for it
    });
  }
  it('Karate VS and Mixed have no such chain (1–2 hit chains for every player measured) and do not use it', () => {
    for (const f of ['KarateVSMode.ts', 'MixedCombatMode.ts']) expect(modeSrc(f)).not.toContain('ComboBreaker');
  });
});
