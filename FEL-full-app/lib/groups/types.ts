// TEAMS-SQUADS (2026-10-25): the shared core's vocabulary. A TEAM is coach-led (a certified coach owns it); a SQUAD is
// friends (anyone the join gate lets in owns one; a coach is optional). Both are one TrainingGroup row with members and
// preset-only acts (prisma/pending/2026-10-25-teams-squads.sql).
//
// EVERY WORD A MEMBER CAN SEND IS ON A LIST HERE. There is no free-text path: a squad's name is two preset words, a
// reaction is a preset key, a nudge is a preset key. A team's name is the one typed field, and only a certified coach
// types it (owner call, flagged: the coach is an accountable adult; a squad's owner may be anyone).
//
// Pure and client-safe.

export type GroupKind = 'team' | 'squad';
export type GroupRole = 'owner' | 'coach' | 'member';
export const GROUP_KINDS: readonly GroupKind[] = ['team', 'squad'];
export const GROUP_ROLES: readonly GroupRole[] = ['owner', 'coach', 'member'];

/** (new) Members at most. A squad is a handful of friends; a team is a roster (the assign-to-many cap is 60). */
export const MAX_MEMBERS: Record<GroupKind, number> = { squad: 12, team: 60 };
/** (new) Groups one account may be in at once. */
export const MAX_GROUPS_PER_USER = 10;

/** The colours a group may wear: a key is stored, the hex is the app's. */
export const GROUP_COLORS = {
  cyan: '#00E5FF', mint: '#00FF9D', gold: '#FFD700', violet: '#A855F7',
  orange: '#FF7A2F', indigo: '#7B61FF', rose: '#FF4D8D', lime: '#B6FF3B',
} as const;
export type GroupColor = keyof typeof GROUP_COLORS;

/** A squad's name: one word from each list, picked, never typed. */
export const SQUAD_NAME_FIRST = [
  'Swift', 'Rising', 'Iron', 'Golden', 'Midnight', 'Electric', 'Coastal', 'Solar',
  'Thunder', 'Silent', 'Rapid', 'Lucky', 'Brave', 'Neon', 'Steady', 'Wild',
] as const;
export const SQUAD_NAME_SECOND = [
  'Falcons', 'Tigers', 'Comets', 'Wolves', 'Sharks', 'Rockets', 'Hawks', 'Panthers',
  'Foxes', 'Bolts', 'Waves', 'Owls', 'Lions', 'Jets', 'Dragons', 'Stars',
] as const;

/** (owner call) The reactions. Keys are stored; the glyph and label are shown. */
export const REACTIONS = {
  fire: { glyph: '🔥', label: 'Fire' },
  clap: { glyph: '👏', label: 'Clap' },
  strong: { glyph: '💪', label: 'Strong' },
  hundred: { glyph: '💯', label: 'Hundred' },
  goat: { glyph: '🐐', label: 'GOAT' },
} as const;
export type ReactionKey = keyof typeof REACTIONS;

/** (owner call) The nudges a training buddy can send, one tap each. Product lines, not policy text. */
export const NUDGES = {
  drill: { glyph: '💪', line: 'Today’s drill is waiting for you.' },
  streak: { glyph: '🔥', line: 'Keep our streak alive.' },
  game: { glyph: '🏀', line: 'Run a game with me?' },
} as const;
export type NudgeKey = keyof typeof NUDGES;

/** (new) A duo goal: both buddies do the daily drill on this many of the week's days. */
export const DUO_TARGETS = [3, 5, 7] as const;
export type DuoTarget = (typeof DUO_TARGETS)[number];

export type ActKind = 'reaction' | 'nudge' | 'duo' | 'challenge' | 'trophy';

/** A stored act, as read back. */
export interface GroupAct {
  id: string;
  kind: ActKind;
  dedupeKey: string;
  fromUserId: string | null;
  toUserId: string | null;
  ref: string | null;
  preset: string | null;
  points: number | null;
  createdAt: number;
}

export interface GroupRow {
  id: string;
  kind: GroupKind;
  ownerId: string;
  name: string;
  color: GroupColor;
  homeCourt: string | null;
  inviteToken: string;
  inviteOpen: boolean;
  dailyDrill: boolean;
  createdAt: number;
}

export interface MemberRow {
  groupId: string;
  userId: string;
  role: GroupRole;
  shareMeasured: boolean;
  joinedAt: number;
}

/** A member's age band, from User.dobYear (lib/privacy): 'unknown' is treated as a minor everywhere. */
export type AgeBand = 'adult' | 'teen' | 'unknown';

/** What the core knows about a member once their account rows are read. */
export interface MemberFacts extends MemberRow {
  /** First word of the display name, or 'Player'. Never an email. */
  name: string;
  band: AgeBand;
  /** Verified adult AND the live jump_numbers opt-in (lib/privacy/scanSaveGate). */
  canSaveScan: boolean;
  /** A team member: their CoachClient row with the team's coach is live. Always true in a squad. */
  onRoster: boolean;
}
