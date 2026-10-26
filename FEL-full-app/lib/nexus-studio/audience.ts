// WHO THE STUDIO IS FOR (NEX-01; owner 2026-10-20: "the owner (admin) first, then an invited creator beta, then public").
//
// Today the audience is the owner: the roles that approve public content on the review board (lib/creator/creative-card-review.ts
// APPROVER_ROLES — `founder` and `admin`). Everyone else, signed in or not, gets the same 404 a disabled flag gives, so the
// Studio's existence is not confirmed to anyone outside the audience.
//
// The role is read from the DATABASE on every request (the page gate and every write route), never from the session token: a role
// taken away in the database closes the Studio on the next request, not when the token expires (the review board's pattern,
// app/api/v1/creative-card/[id]/review/route.ts). `NEXUS_STUDIO_ENABLED` still comes first: off, the Studio is a 404 for everyone.
//
// The beta (an invite list) and public are later phases (docs/NEXUS-ROADMAP.md §2.9): they widen `studioAudienceAllows` here, in
// one place, and every gate follows.

import { NextResponse } from 'next/server';
import { isNexusStudioEnabled } from '@/lib/flags';
import { APPROVER_ROLES, roleOf } from '@/lib/creator/creative-card-review';

/** The roles that may open /studio and call its write routes: the review board's approvers (founder, admin). */
export const STUDIO_AUDIENCE_ROLES: readonly string[] = APPROVER_ROLES;

/** Pure: is this role in the Studio's audience? An unknown or missing role is not. */
export function studioAudienceAllows(role: string | null | undefined): boolean {
  return typeof role === 'string' && STUDIO_AUDIENCE_ROLES.includes(role);
}

/** The user table as the gate reads it (prisma.user, or a test double). */
export type StudioAudienceDb = Parameters<typeof roleOf>[0];

/**
 * The whole gate for a signed-in account: the flag, then the account's role FROM THE DATABASE. A database error is a refusal
 * (fail closed). `userId` null (signed out) is a refusal too; the caller decides whether that is a login redirect or a 401.
 */
export async function studioAudienceOk(db: StudioAudienceDb, userId: string | null | undefined): Promise<boolean> {
  if (!isNexusStudioEnabled() || !userId) return false;
  try {
    return studioAudienceAllows(await roleOf(db, userId));
  } catch {
    return false;
  }
}

/** The answer a write route gives anyone outside the audience: the same 404 as a route that does not exist. */
export function studioNotFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
