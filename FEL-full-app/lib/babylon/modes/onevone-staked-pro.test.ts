// QA #259 (adversarial pass on 94dd6ef5): a staked or head-to-head 1v1 (?arena= / ?mp= / ?c=) played the picked tier —
// load and the new TAP-TO-START read used ONEVONE_TIER[readTier()] without tierForRun. Modelled on threevthreeRules.test.ts
// ("a staked or head-to-head run always plays PRO; a plain run plays the pick").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ONEVONE_TIER, HEAD_TO_HEAD_PARAMS, headToHeadRun } from './onevoneRules';
import { STAKED_RUN_PARAMS, tierForSearch } from '../core/Difficulty';
import { tierForRun } from './threevthreeRules';

const ONE = readFileSync(join(__dirname, 'OneVOneMode.ts'), 'utf8');
const SPLASH = readFileSync(join(__dirname, '../../../components/games/boot-splash.tsx'), 'utf8');

describe('1v1: a staked or head-to-head run always plays PRO; a plain run plays the pick', () => {
  it('the rule', () => {
    expect(tierForRun('', 'elite')).toBe('elite');
    expect(tierForRun('?tier=rookie', 'rookie')).toBe('rookie');
    for (const q of ['?arena=abc', '?mp=room1', '?c=xyz', '?arena=abc&tier=rookie']) {
      expect(tierForRun(q, 'rookie'), q).toBe('pro');
      expect(ONEVONE_TIER[tierForRun(q, 'rookie')], q).toBe(ONEVONE_TIER.pro);
      expect(headToHeadRun(q), q).toBe(true);
    }
    for (const q of ['', '?court=open', '?tier=elite', '?arena=']) expect(headToHeadRun(q), q).toBe(false);
  });

  it('both places 1v1 reads the tier (load, and TAP TO START) go through tierForRun; none reads the pick bare', () => {
    // QA #262 F2: through the shared runTier() (Difficulty.ts: tierForSearch on STAKED_RUN_PARAMS), as every other mode
    const through = /ONEVONE_TIER\[runTier\(\)\] \?\? ONEVONE_TIER\.pro/g;
    expect(ONE.match(through)).toHaveLength(2);
    expect(ONE).not.toMatch(/ONEVONE_TIER\[readTier\(\)\]/);
    expect(ONE).not.toMatch(/\breadTier\b/);                              // the bare pick is not even imported
    expect(ONE.match(/opponent \$\{runTier\(\)\}/g)).toHaveLength(2);   // both rules log lines name the tier actually played
    const rules = ONE.slice(ONE.indexOf('function readRules()'), ONE.indexOf('function readRules()') + 400);
    expect(rules).toMatch(through);
  });

  it('runTier: a staked / head-to-head 1v1 plays PRO, a plain one the pick (the same params as headToHeadRun)', () => {
    expect([...STAKED_RUN_PARAMS]).toEqual([...HEAD_TO_HEAD_PARAMS]);
    for (const q of ['?arena=abc', '?mp=room1', '?c=xyz', '?arena=abc&tier=rookie']) expect(tierForSearch(q, 'rookie'), q).toBe('pro');
    for (const q of ['', '?tier=elite', '?arena=']) expect(tierForSearch(q, 'elite'), q).toBe('elite');
  });

  it('the start screen offers no OPPONENT pick on a staked / head-to-head link', () => {
    expect(SPLASH).toMatch(/useEffect\(\(\) => \{ setHeadToHead\(headToHeadRun\(window\.location\.search\)\); \}, \[\]\);/);
    expect(SPLASH).toMatch(/const hasTiers = TIER_MODES\.has\(props\.modeId\) && !headToHead;/);
  });
});
