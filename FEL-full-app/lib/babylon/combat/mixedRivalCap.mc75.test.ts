// MC75-1 (ALL-MODES-TO-75 §8; Gameplay TUNE sheet 2026-10-23; PM option (b)): Mixed Combat's ROOKIE rival is capped at
// its own tier value every round; PRO and ELITE are uncapped. A ROOKIE human-side bot wins ≥ 7 of 10 (seeded).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RIVAL_TIER_CAP, rivalTierCap } from '../modes/mixedRules';
import { RivalFightBrain, rivalDifficulty } from '../core/FightCore';
import { runCell } from './difficultySim';

describe('MC75-1: the Mixed Combat rival cap', () => {
  it('ROOKIE is capped at 0.46 (its own tier value); PRO and ELITE are not capped', () => {
    expect(RIVAL_TIER_CAP).toEqual({ rookie: 0.46 });
    expect(rivalTierCap('rookie')).toBe(0.46);
    expect(rivalTierCap('pro')).toBeNull();
    expect(rivalTierCap('elite')).toBeNull();
    expect(rivalDifficulty(0.68, 'rookie')).toBeCloseTo(0.46);
  });
  it('the round ramp can no longer lift a ROOKIE rival above its tier (round 3 would be 0.46 + 0.16)', () => {
    const b = new RivalFightBrain(0.68);
    b.setDifficulty(rivalDifficulty(0.68, 'rookie')); b.setRound(3);
    expect(b.effectiveSkill).toBeCloseTo(0.62);
    b.setSkillCap(rivalTierCap('rookie'));
    expect(b.effectiveSkill).toBeCloseTo(0.46);
  });
  it('no cap = the old line exactly (the dial plus the ramp, under 0.92)', () => {
    const b = new RivalFightBrain(0.68); b.setDifficulty(0.8); b.setRound(3); b.setSkillCap(null);
    expect(b.effectiveSkill).toBeCloseTo(0.92);
  });
  it('MixedCombatMode sets the cap every round, after the dial, and the harness mirrors it', () => {
    const mode = readFileSync('lib/babylon/modes/MixedCombatMode.ts', 'utf8');
    expect(mode).toMatch(/brain\.setDifficulty\(rivalDifficulty\(BASE_RIVAL_DIFFICULTY, runTier\(\)\)\);\s*\n\s*brain\.setSkillCap\(rivalTierCap\(runTier\(\)\)\);/);
    expect(readFileSync('lib/babylon/combat/difficultySim.ts', 'utf8')).toContain('b.setSkillCap(rivalTierCap(this.cfg.tier));');
  });
  it('ROOKIE: the decent human-side bot wins ≥ 7 of 10 matches (seeded, deterministic)', () => {
    const r = runCell({ mode: 'mixed', tier: 'rookie', profile: 'decent' }, 10, 1);
    console.info(`[MC75-1] ROOKIE decent bot ${Math.round(r.winRate * 10)}/10`);
    expect(r.winRate * 10).toBeGreaterThanOrEqual(7);
  });
});
