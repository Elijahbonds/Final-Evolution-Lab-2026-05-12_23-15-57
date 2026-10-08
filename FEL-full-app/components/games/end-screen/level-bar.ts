// THE PLAYER LEVEL BAR (IMPROVE 2026-10-06, owner decision: "The end screen fills the level bar and shows LEVEL UP when
// crossed (keep the season tier-up moment too)").
//
// The level is a reading of the account XP (lib/player-level.ts levelFor). The session answer carries the XP AFTER the
// run (`profileXp`) and what the run paid (`xp`), so the start is `profileXp − xp` and the bar plays one segment per
// level: from where the run started to the end of that level, LEVEL UP, then 0 → full for any whole level jumped, then
// 0 → where the run ended. Exact by construction: both ends are read off the same curve.

import { levelCost, levelFor } from '@/lib/player-level';

export interface LevelSegment {
  /** The level this segment fills (the bar reads LV{level} → LV{level+1}). */
  level: number;
  from: number;
  to: number;
  need: number;
  /** The segment ends in a LEVEL UP. */
  crossed: boolean;
}

export interface LevelFill {
  segments: LevelSegment[];
  levelBefore: number;
  levelAfter: number;
  levelUps: number;
}

/** More levels than this in one run play as the first crossings and the last level (the bar would only blur). */
export const MAX_LEVEL_SEGMENTS = 4;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** PURE: the fill for a run that paid `gained` XP and left the account at `xpAfter`; null without both numbers. */
export function levelFill(xpAfter: unknown, gained: unknown): LevelFill | null {
  if (!finite(xpAfter) || xpAfter < 0 || !finite(gained)) return null;
  const g = Math.max(0, Math.min(gained, xpAfter));
  const after = levelFor(xpAfter);
  const before = levelFor(xpAfter - g);
  const ups = after.level - before.level;
  const segments: LevelSegment[] = [];
  if (ups === 0) {
    segments.push({ level: after.level, from: before.into, to: after.into, need: after.need, crossed: false });
  } else {
    for (let l = before.level; l < after.level; l++) {
      const need = levelCost(l);
      segments.push({ level: l, from: l === before.level ? before.into : 0, to: need, need, crossed: true });
    }
    segments.push({ level: after.level, from: 0, to: after.into, need: after.need, crossed: false });
  }
  return { segments: compress(segments), levelBefore: before.level, levelAfter: after.level, levelUps: ups };
}

/** Keep the first crossings and the final level when a run jumped more levels than the bar can show. */
function compress(s: LevelSegment[]): LevelSegment[] {
  if (s.length <= MAX_LEVEL_SEGMENTS) return s;
  return [...s.slice(0, MAX_LEVEL_SEGMENTS - 1), s[s.length - 1]];
}
