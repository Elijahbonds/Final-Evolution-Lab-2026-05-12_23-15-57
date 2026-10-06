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
  it('a masher does clearly worse than a decent player at PRO in Karate VS and Mixed', () => {
    // (Showdown and Duel: the masher's stun-lock and Showdown's unconditional ultimate keep it level — reported to the
    // owner as a structural finding, not pinned here.)
    for (const mode of ['kvs', 'mixed'] as SimMode[]) {
      const d = runCell({ mode, tier: 'pro', profile: 'decent' }, N_PRO, SEED).winRate;
      const m = runCell({ mode, tier: 'pro', profile: 'masher' }, N_PRO, SEED).winRate;
      expect(m, mode).toBeLessThan(d - 0.15);
    }
  });
});
