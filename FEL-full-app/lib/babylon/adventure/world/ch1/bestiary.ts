/**
 * The story's bestiary (Phase B): A2's five archetypes as they ship, plus what Chapter 1 adds on top of them, built
 * from A2's defs (no new monster logic):
 *
 *   wisp       a homing anchor for the chain over the chasm: a hovering, harmless body that never notices anyone
 *              (aggro 0), with hp enough to take a whole chain of homing hits. It is the "target" the SA2-feel homing
 *              chain needs over a gap. [PLACEHOLDER]
 *   champion   Chapter 1's mid-boss: A2's brute, bigger and tougher. [PLACEHOLDER]
 *   ch1 boss   Chapter 1's boss: A2's placeholder boss (its three phases and two weak points) at a first chapter's
 *              hp. [PLACEHOLDER]
 * Generic names only (IP line). Every number [TUNE].
 */

import { MONSTERS, type MonsterDef } from '../../combat/monsters/defs';
import { PLACEHOLDER_BOSS, type BossDef } from '../../combat/bosses/defs';

export const WISP: MonsterDef = {
  ...MONSTERS.flyer,
  id: 'wisp', name: '[PLACEHOLDER] Wisp', hp: 600, poise: 999, element: 'light', radius: 0.5, height: 0.8, level: 1,
  aggroM: 0, keepAwayM: 0, retreatSec: 0, hoverM: 3,
};

export const CHAMPION: MonsterDef = {
  ...MONSTERS.brute,
  id: 'champion', name: '[PLACEHOLDER] Champion', hp: 300, poise: 110, radius: 1.1, height: 3.1, level: 4, aggroM: 18,
};

export const CH1_BOSS: BossDef = {
  ...PLACEHOLDER_BOSS,
  id: 'boss.ch1', name: '[PLACEHOLDER] Chapter 1 Warden', hp: 480, level: 4,
};

/** Every monster a story encounter may name, by key. */
export const STORY_BESTIARY: Readonly<Record<string, MonsterDef>> = {
  ...MONSTERS, wisp: WISP, champion: CHAMPION,
};

export const STORY_BOSSES: Readonly<Record<string, BossDef>> = { ch1: CH1_BOSS };
