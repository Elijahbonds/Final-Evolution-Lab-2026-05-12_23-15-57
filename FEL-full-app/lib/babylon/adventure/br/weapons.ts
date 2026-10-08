/**
 * The arsenal's reach, for the BR (combat/arsenal.ts is the one source: fists, blade, staff, gauntlet). A bot's
 * spacing reads its weapon's reach (RivalCombatBrain's moves are built from it), so a staff bot fences from further
 * out than a fists bot, the way the Duel's rival does.
 */

import { ARSENAL, type WeaponId } from '@/lib/babylon/combat/arsenal';

export const ARSENAL_REACH: Readonly<Record<WeaponId, { reach: number; jab: number }>> = Object.freeze(
  Object.fromEntries(ARSENAL.map((w) => [w.id, { reach: w.reach, jab: w.jabReach }])) as Record<WeaponId, { reach: number; jab: number }>,
);
