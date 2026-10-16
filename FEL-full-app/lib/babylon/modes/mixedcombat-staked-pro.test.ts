// PM 2026-10-14 (after QA #259): every staked or head-to-head run (?arena= / ?mp= / ?c=) plays PRO, whatever the saved
// pick. Modelled on onevone-staked-pro.test.ts / threevthreeRules.test.ts:25.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProfile, runTier, profileFor, STAKED_RUN_PARAMS, TIER_KEY } from '../core/Difficulty';
import { HEAD_TO_HEAD_PARAMS } from './onevoneRules';

const W = globalThis as { window?: unknown };
function at(search: string, saved: string | null) {
  W.window = { location: { search }, localStorage: { getItem: (k: string) => (k === TIER_KEY ? saved : null), setItem() {} } };
}
afterEach(() => { delete W.window; });
const SRC = readFileSync(join(__dirname, 'MixedCombatMode.ts'), 'utf8');

describe('mixedcombat: a staked or head-to-head run always plays PRO; a plain run plays the pick', () => {
  it('the rule', () => {
    expect([...STAKED_RUN_PARAMS]).toEqual([...HEAD_TO_HEAD_PARAMS]);
    at('', 'rookie'); expect(runTier()).toBe('rookie');
    at('?tier=elite', 'rookie'); expect(runTier()).toBe('elite');
    for (const q of ['?arena=abc', '?mp=room1', '?c=xyz', '?arena=abc&tier=rookie']) {
      at(q, 'elite'); expect(runTier(), q).toBe('pro'); expect(readProfile(), q).toEqual(profileFor('pro'));
    }
    at('?arena=', 'rookie'); expect(runTier()).toBe('rookie');
  });
  it('MixedCombatMode reads the opponent through runTier(), never the pick bare', () => {
    expect(SRC).toMatch(/import \{ runTier \} from '\.\.\/core\/Difficulty'/);
    expect(SRC).not.toMatch(/\breadTier\b/);
    expect(SRC).toMatch(/rivalDifficulty\([^)]*, runTier\(\)\)/);
    expect(SRC).toMatch(/rivalPower\([^;]*runTier\(\)\)/);
  });
});
