// TODAY'S GOALS ON THE CARD (IMPROVE 2026-10-06, owner decision: "Show today's goals and progress on the end screen
// ('2 more wins to …')"). The goals and their progress are the server's (app/api/sessions `goals`, derived from the day's
// paid runs — lib/goals/daily-goals.ts); this only words them. A goal this run completed is the card's moment for it.

import { goalRemaining, readGoalStates } from '@/lib/goals/daily-goals';
import { QUEST_SEASON_XP } from '@/lib/season/season-pass-core';
import type { EndGoals } from './types';

export interface GoalLine {
  id: string;
  text: string;
  /** "2 more wins to go", "Done", or — the run that completed it — "GOAL COMPLETE · +100 season XP". */
  detail: string;
  done: boolean;
  /** This run completed it. */
  justDone: boolean;
  /** 0..100. */
  pct: number;
}

/** PURE: the day's goals as the card lists them (none when the server sent none). */
export function goalLines(g: EndGoals | null | undefined): GoalLine[] {
  if (!g) return [];
  const now = new Set(Array.isArray(g.completedNow) ? g.completedNow : []);
  return readGoalStates(g.items).map((s) => {
    const justDone = s.done && now.has(s.id);
    const left = goalRemaining(s);
    return {
      id: s.id,
      text: s.text,
      detail: justDone ? `GOAL COMPLETE · +${QUEST_SEASON_XP} season XP` : s.done ? 'Done' : `${left} to go`,
      done: s.done,
      justDone,
      pct: Math.round((s.progress / s.target) * 100),
    };
  });
}

/** The header's count, "1/3 done". */
export function goalsDoneCount(lines: readonly GoalLine[]): string {
  return `${lines.filter((l) => l.done).length}/${lines.length} done`;
}
