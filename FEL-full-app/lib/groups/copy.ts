// TEAMS-SQUADS: the product lines the group screens show. Plain product copy, not policy text.
// OWNER-APPROVED (owner, in chat, 2026-10-27: "You do it. I approve." — Owner Inbox card C09, approved as written, the
// league points included).
// The guardian's wording for teens in squads (card C08, approved the same day) is lib/consent/guardianGate.ts
// squadsConsentWords: approved, not live until its go-live steps ship (docs/TEAMS-SQUADS.md §3).
import { LEAGUE_CAPS, LEAGUE_POINTS } from './activity';
import type { GroupKind } from './types';

export const SQUADS_PATH = '/squads';
export const COMING_SOON = 'Squads and teams are coming soon. Your drills, games and streak keep counting in the meantime.';
export const TEEN_SAFE_LINE = 'Reactions only. No messages, no comments, no DMs — for everyone.';
export const KIND_LABEL: Record<GroupKind, string> = { squad: 'Squad', team: 'Team' };

export const LEAGUE_RULE =
  `This week's league, Monday to Sunday: ${LEAGUE_POINTS.drillDay} for each daily drill, ${LEAGUE_POINTS.run} for each game you finish ` +
  `(up to ${LEAGUE_CAPS.runs}), ${LEAGUE_POINTS.win} for each win (up to ${LEAGUE_CAPS.wins}). The winner goes on the shelf.`;

export const BOARD_NOTES = {
  drill: 'Daily drills done this week.',
  reps: 'Squat and lunge reps the Mirror saved this week — adults who save their numbers and chose to share them here.',
  jump: 'Verified jumps only: timed fast enough, re-timed from the whole flight, a clean landing. Same sharing rule as reps.',
} as const;

export function hiddenLine(n: number): string | null {
  return n > 0 ? `${n} ${n === 1 ? 'member keeps' : 'members keep'} measured numbers private.` : null;
}

export function streakLine(days: number, todayAll: boolean, waiting: number): string {
  if (days === 0) return todayAll ? 'Everyone did today’s drill. That’s day one.' : 'No group streak yet. Everyone does the drill today and it starts.';
  const base = `${days}-day group streak`;
  return todayAll ? `${base} — everyone’s done today.` : `${base} — waiting on ${waiting} for today.`;
}

export const SHARE_LINE = 'Show my measured reps and verified jumps to this group';
export const ASSIGNED_DRILL_LINE = 'Your coach assigned the daily drill to the whole team.';
