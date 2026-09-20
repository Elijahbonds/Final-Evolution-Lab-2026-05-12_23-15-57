// invite — how a client gets onto a coach's roster, which until now was: they did not.
//
// THE HOLE THE AUDIT PUT FIRST (docs/COACH-COMPETITIVE-AUDIT.md). There was no invite, no code, no email — nothing.
// `/api/coach/roster` derives the roster from existing PROGRAMS, so a client did not exist until the coach had
// already built them one, which is backwards: you write the program for somebody who is already there. Every product
// in the audit solves this in the first thirty seconds of onboarding, because a coach who cannot add a client never
// reaches the features worth having.
//
// THE SHAPE (owner's decision, 2026-09-19): ONE LINK, and a QR of the same link. The coach shows a phone in a gym,
// drops it in a DM, or prints it on a flyer. The client opens it, signs up if they need to, and lands connected.
//
// AN INVITE IS A CAPABILITY, AND CAPABILITIES GET FORWARDED — the same rule lib/share/shareable.ts is built on, and
// the reason this file exists rather than a `coachId` in a query string:
//
//   1. IT CARRIES NOTHING ABOUT ANYBODY. Not the coach's client list, not their email, not a name. A token, and on
//      the read, the coach's display name — which is what the person holding it needs in order to know whose gym
//      they are joining. A forwarded invite leaks the coach's name, which the coach chose to publish by inviting.
//   2. IT IS UNGUESSABLE AND REVOCABLE. 192 bits, the same as a share token, because the URL is the whole access
//      control. Revoking is real: the row stops resolving.
//   3. IT EXPIRES, AND IT CAN BE ONE-SHOT. A link on a flyer should stay open for a month; a link texted to one
//      athlete should die once they use it. Both, chosen by the coach, defaulting to the safer one.
//   4. USING IT TWICE IS NOT AN ERROR. A client who taps their own invite again is already on the roster — that is
//      a no-op and a friendly one, not a failure. Idempotent by the pair (coach, client), never by the token.
//
// Pure. The persistence and the token bytes live in the route; everything decided here is decided without a database.

export type InviteUse = 'once' | 'many';

export interface CoachInvite {
  token: string;
  coachId: string;
  /** What the client sees on the landing page: whose roster this is. */
  coachName: string;
  use: InviteUse;
  createdAtMs: number;
  expiresAtMs: number;
  /** Set when a one-shot invite has been spent, or the coach revoked it. */
  closedAtMs?: number;
  /** How many clients joined through it — a flyer's own analytics. */
  joined: number;
}

/** A link a coach hands to one athlete dies quickly; a link on a flyer lives a month. */
export const INVITE_TTL_MS: Record<InviteUse, number> = {
  once: 7 * 24 * 60 * 60 * 1000,
  many: 30 * 24 * 60 * 60 * 1000,
};

/** A bound on abuse, not on coaching: no coach legitimately holds this many open invites. */
export const MAX_LIVE_INVITES_PER_COACH = 50;

export type InviteState = 'open' | 'expired' | 'closed' | 'unknown';

/** What a token resolves to right now. `unknown` and the dead states are deliberately indistinguishable to a caller
 *  that only gets a 404 — see the route — but the server itself needs the difference for the coach's own history. */
export function inviteState(invite: CoachInvite | null, nowMs: number): InviteState {
  if (!invite) return 'unknown';
  if (invite.closedAtMs) return 'closed';
  if (nowMs >= invite.expiresAtMs) return 'expired';
  return 'open';
}

export function isOpen(invite: CoachInvite | null, nowMs: number): boolean {
  return inviteState(invite, nowMs) === 'open';
}

export interface JoinOutcome {
  ok: boolean;
  /** 'joined' — newly connected · 'already' — this pair existed · a reason when it failed. */
  result: 'joined' | 'already' | 'expired' | 'closed' | 'unknown' | 'self';
  /** True when the invite should now be spent (a one-shot that just did its job). */
  closeInvite: boolean;
  message: string;
}

/**
 * Decide what happens when someone opens an invite. Pure: the caller does the writing.
 *
 * `alreadyOnRoster` is the idempotency the coach never thinks about — a client who taps the link twice, or who was
 * added by hand last week, is not an error and does not consume a one-shot invite.
 */
export function joinWithInvite(
  invite: CoachInvite | null,
  clientId: string,
  nowMs: number,
  alreadyOnRoster: boolean,
): JoinOutcome {
  const state = inviteState(invite, nowMs);
  if (state !== 'open') {
    return {
      ok: false, result: state === 'unknown' ? 'unknown' : state, closeInvite: false,
      message: state === 'expired' ? 'That invite has expired — ask your coach for a new link.'
        : state === 'closed' ? 'That invite has already been used.'
        : 'That invite link is not valid.',
    };
  }
  const inv = invite!;
  if (inv.coachId === clientId) {
    return { ok: false, result: 'self', closeInvite: false, message: 'That is your own invite link.' };
  }
  if (alreadyOnRoster) {
    return { ok: true, result: 'already', closeInvite: false, message: `You are already working with ${inv.coachName}.` };
  }
  return {
    ok: true, result: 'joined', closeInvite: inv.use === 'once',
    message: `You are on ${inv.coachName}'s roster.`,
  };
}

/** The path an invite link points at. One place, so the QR, the copy button and the email cannot drift apart. */
export function invitePath(token: string): string {
  return `/coach/join/${encodeURIComponent(token)}`;
}

export function inviteUrl(origin: string, token: string): string {
  return `${String(origin ?? '').replace(/\/+$/, '')}${invitePath(token)}`;
}
