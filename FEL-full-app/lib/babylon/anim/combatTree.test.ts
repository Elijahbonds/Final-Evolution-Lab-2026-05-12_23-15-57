// BIOMECH-WAVE2 (2026-09-09): the combat tree's new loco. The rest of the tree is covered by
// scripts/combat-anim-tests.ts (ANIM-READABILITY); this file is the strafe / back-step half, in the suite.
import { describe, expect, it } from 'vitest';
import { chooseCombatClip, settleAfter, BACK_SPEED, type CombatAnimInput } from './combatTree';

const I = (o: Partial<CombatAnimInput> = {}): CombatAnimInput => ({
  speed01: 0, dashing: false, hasWeapon: false, striking: null, blocking: false, parryFlash: false,
  guardImpactFlash: false, hitBy: null, down: false, out: false, ulting: false, ...o,
});

describe('the lock-on loco (BIOMECH-WAVE2 G2)', () => {
  it('a fighter travelling sideways SHUFFLES — he does not play a forward walk', () => {
    expect(chooseCombatClip(I({ speed01: 0.8, strafe: 1 })).clip).toBe('karate_shuffle_right');
    expect(chooseCombatClip(I({ speed01: 0.8, strafe: -1 })).clip).toBe('karate_shuffle_left');
    expect(chooseCombatClip(I({ speed01: 0.8, strafe: 1 })).loop).toBe(true);
  });
  it('closing walks forward; giving ground runs the SAME cadence backwards', () => {
    const fwd = chooseCombatClip(I({ speed01: 0.8, strafe: 0 }));
    const back = chooseCombatClip(I({ speed01: 0.8, strafe: 0, backing: true }));
    expect(fwd.state).toBe('walk');
    expect(fwd.speedRatio).toBeUndefined();
    expect(back.state).toBe('walk_back');
    expect(back.clip).toBe(fwd.clip);
    expect(back.speedRatio).toBe(BACK_SPEED);
    expect(BACK_SPEED).toBeLessThan(0);
  });
  it('an omitted strafe is the old behaviour exactly (no caller has to change)', () => {
    expect(chooseCombatClip(I({ speed01: 0.8 })).state).toBe('walk');
    expect(chooseCombatClip(I({ speed01: 0 })).state).toBe('idle');
  });
  it('every combat verb still outranks the loco', () => {
    for (const o of [{ striking: 'light' as const }, { blocking: true }, { hitBy: 'medium' as const }, { down: true }, { out: true }, { dodging: true }, { dashing: true }]) {
      expect(chooseCombatClip(I({ speed01: 1, strafe: 1, ...o })).state).not.toMatch(/^strafe_/);
    }
  });
  it('a strike that runs out under a held sideways stick settles onto the SHUFFLE, not an idle flash', () => {
    const held = I({ speed01: 0.9, strafe: -1, striking: 'light' });
    expect(settleAfter('strike_light', held).state).toBe('strafe_left');
  });
});
