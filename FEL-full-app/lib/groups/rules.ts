// TEAMS-SQUADS: who may do what in a group, and what a group's fields may hold. Pure.
//
// ROLES. owner (made it; one per group), coach (a certified coach the owner promoted; optional in a squad), member.
// The table below is the whole permission model: a route asks `can(role, action)` and nothing else.
//
// MINORS (owner, 2026-10-22: "no free text and no DMs for anyone in a group that includes a minor; teens friends-only").
// FEL has no free-text or DM path in a group at all (types.ts), so the "includes a minor" rule is about what is SHOWN:
// a minor's measured numbers and game scores never leave their own view (profile v2's rule: a teen's scores stay on
// the device), an unknown age is a minor, and no group has a public page (there is no route that serves one).

import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { ageScreenOutcome } from '@/lib/privacy/ageScreen';
import { VENUES } from '@/lib/game-data';
import {
  GROUP_COLORS, MAX_MEMBERS, SQUAD_NAME_FIRST, SQUAD_NAME_SECOND,
  type AgeBand, type GroupColor, type GroupKind, type GroupRole, type MemberFacts,
} from './types';
import { passesScreen } from '@/lib/safety/textScreen';

export type GroupAction =
  | 'view' | 'react' | 'nudge' | 'duo' | 'post_challenge' | 'leave' | 'share_measured'
  | 'see_invite' | 'remove_member' | 'assign' | 'see_rollup'
  | 'edit' | 'rotate_invite' | 'set_role' | 'delete';

const ALLOWED: Record<GroupRole, ReadonlySet<GroupAction>> = {
  member: new Set(['view', 'react', 'nudge', 'duo', 'post_challenge', 'leave', 'share_measured']),
  coach: new Set(['view', 'react', 'nudge', 'duo', 'post_challenge', 'leave', 'share_measured', 'see_invite', 'remove_member', 'assign', 'see_rollup']),
  // the owner cannot `leave` (a group is never left ownerless): they delete it instead
  owner: new Set(['view', 'react', 'nudge', 'duo', 'post_challenge', 'share_measured', 'see_invite', 'remove_member', 'assign', 'see_rollup', 'edit', 'rotate_invite', 'set_role', 'delete']),
};

export function can(role: GroupRole | null | undefined, action: GroupAction): boolean {
  return !!role && ALLOWED[role]?.has(action) === true;
}

/** May `actor` remove `target`? Never the owner; a coach removes members only; nobody removes themselves (that is leave). */
export function canRemove(actor: GroupRole, target: GroupRole, self: boolean): boolean {
  if (self || target === 'owner') return false;
  if (actor === 'owner') return true;
  return actor === 'coach' && target === 'member';
}

/** May the owner give `target` this role? Only member ↔ coach, and a coach must be a certified coach. */
export function canSetRole(target: GroupRole, next: GroupRole, targetIsCertifiedCoach: boolean): boolean {
  if (target === 'owner' || next === 'owner' || target === next) return false;
  return next === 'member' || targetIsCertifiedCoach;
}

// ── fields ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const isGroupKind = (v: unknown): v is GroupKind => v === 'team' || v === 'squad';
export const isGroupColor = (v: unknown): v is GroupColor => typeof v === 'string' && Object.prototype.hasOwnProperty.call(GROUP_COLORS, v);

/** Every squad name there is. */
export function squadNames(): string[] {
  return SQUAD_NAME_FIRST.flatMap((a) => SQUAD_NAME_SECOND.map((b) => `${a} ${b}`));
}

/** A few names to pick from, from caller-supplied random numbers in [0, 1). */
export function squadNameChoices(rand: () => number, n = 4): string[] {
  const all = squadNames();
  const out = new Set<string>();
  while (out.size < Math.min(n, all.length)) out.add(all[Math.floor(rand() * all.length) % all.length]);
  return [...out];
}

/** (new) A team name a coach types: 2–32 characters of letters, digits, spaces and . ' & -, no link, no handle. */
const TEAM_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'&-]{1,31}$/u;

export type NameCheck = { ok: true; name: string } | { ok: false; error: 'name_invalid' };

export function checkGroupName(kind: GroupKind, raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'name_invalid' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (kind === 'squad') return squadNames().includes(name) ? { ok: true, name } : { ok: false, error: 'name_invalid' };
  if (!TEAM_NAME_RE.test(name) || /(https?:|www\.|\.com\b|@)/i.test(name)) return { ok: false, error: 'name_invalid' };
  // SAFETY (SAF-06, 2026-10-25): a typed team name passes the shared text screen (slurs, profanity, contact details)
  if (!passesScreen(name)) return { ok: false, error: 'name_invalid' };
  return { ok: true, name };
}

/** A home court is a playable venue's key, stored as 'venue:<key>'. (Nexus Studio venues live on the device only:
 *  they have no server id to point at yet — docs/TEAMS-SQUADS.md, follow-ups.) */
export function homeCourtOptions(): { ref: string; name: string }[] {
  return VENUES.filter((v) => v.playable).map((v) => ({ ref: `venue:${v.key}`, name: v.name }));
}

export function checkHomeCourt(raw: unknown): { ok: true; ref: string | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, ref: null };
  return typeof raw === 'string' && homeCourtOptions().some((o) => o.ref === raw) ? { ok: true, ref: raw } : { ok: false };
}

export function homeCourtName(ref: string | null): string | null {
  return ref ? homeCourtOptions().find((o) => o.ref === ref)?.name ?? null : null;
}

// ── people ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function ageBand(dobYear: number | null | undefined, now: Date = new Date()): AgeBand {
  if (verifiedAdult(dobYear ?? null, now)) return 'adult';
  return ageScreenOutcome(dobYear, now) === 'teen' ? 'teen' : 'unknown';
}

export const isMinorBand = (b: AgeBand): boolean => b !== 'adult';

export function groupHasMinor(members: readonly Pick<MemberFacts, 'band'>[]): boolean {
  return members.some((m) => isMinorBand(m.band));
}

/** A member's measured numbers (Mirror reps, verified jumps) are shown to the group only on all three. */
export function sharesMeasured(m: Pick<MemberFacts, 'band' | 'canSaveScan' | 'shareMeasured'>): boolean {
  return m.band === 'adult' && m.canSaveScan && m.shareMeasured;
}

/** A member's game scores (a PR's number) are shown only for a verified adult (profile v2: teens keep scores on the device). */
export const showsScores = (m: Pick<MemberFacts, 'band'>): boolean => m.band === 'adult';

/** The first word of a display name: friends see a first name, never an email or a surname. */
export function firstName(name: string | null | undefined): string {
  const w = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return w && !w.includes('@') ? w.slice(0, 24) : 'Player';
}

export function roomFor(kind: GroupKind, memberCount: number): boolean {
  return memberCount < MAX_MEMBERS[kind];
}
