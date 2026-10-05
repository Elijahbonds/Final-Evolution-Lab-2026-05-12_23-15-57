export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { decidePlayerAccept, isSelfRequest } from '@/lib/consent/guardianAccept';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/v1/camp/consent — request guardian consent for a minor mentee.
 *  { menteeId?, guardianName, guardianEmail, menteeBirthYear }. A facilitator
 *  may request for a mentee; a mentee may request for themselves. Returns the
 *  acceptance token — delivery is the caller's job (email), never this route's.
 *
 *  MIRROR-COACH P6 (2026-09-29): a request the mentee makes for THEMSELVES (menteeId omitted, or equal to the caller
 *  — the "Ask a parent or guardian" screen always omits it) is stored with selfRequested: true, decided here from the
 *  session and never read from the body, so the minor holding the link cannot mark their own request as a camp one.
 *  A facilitator's request for someone else writes exactly the row it always wrote (the key is left out, and the
 *  column's default is false), which tests/camp/consent-guardian-residual.test.ts pins. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: { menteeId?: string; guardianName?: string; guardianEmail?: string; menteeBirthYear?: number };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const menteeId = typeof body.menteeId === 'string' && body.menteeId ? body.menteeId : userId;
  const guardianName = String(body.guardianName ?? '').trim().slice(0, 80);
  const guardianEmail = String(body.guardianEmail ?? '').trim().toLowerCase();
  const menteeBirthYear = Number(body.menteeBirthYear);
  if (!guardianName || !EMAIL.test(guardianEmail)) return bad('guardian_required');
  if (!Number.isInteger(menteeBirthYear) || menteeBirthYear < 1900 || menteeBirthYear > new Date().getFullYear()) return bad('birth_year_invalid');
  if (menteeId !== userId) {
    const fac = await prisma.facilitatorProfile.findUnique({ where: { userId } });
    if (fac?.certificationStatus !== 'certified') return bad('facilitator_not_certified', 403);
  }
  const token = randomBytes(24).toString('base64url');
  const selfRequested = isSelfRequest(menteeId, userId);
  const consent = await prisma.guardianConsent.create({
    data: { menteeId, guardianName, guardianEmail, menteeBirthYear, token, ...(selfRequested ? { selfRequested: true } : {}) },
  });
  return NextResponse.json({ id: consent.id, token, requestedAt: consent.requestedAt });
}

/**
 * GET /api/v1/camp/consent?token=… — the guardian accepts.
 *
 * ── MIRROR-COACH P6 (2026-09-29): THE ACCEPTANCE PATHS, READ END TO END BEFORE CHANGING ANY ─────────────────────────
 *
 * Who holds a token: POST above hands it to whoever made the request — (a) the mentee themselves (the "Ask a parent or
 * guardian" screen, app/play/mirror/_components/guardian-consent-gate.tsx, shows it on the minor's own screen, and
 * GET /api/health/guardian hands that same pending token back whenever they reopen it — their OWN request's token
 * only, since the P6 review), or (b) a certified facilitator requesting for a mentee (menteeId set, certification
 * checked above; the facilitator's copy of the link, components/camp/camp-view.tsx). FEL sends it nowhere (owner decision #21).
 * app/consent/guardian/[token]/page.tsx only READS a row; this file is the only writer of acceptedAt in the repo
 * (grep for guardianConsent.update/create/upsert: these two call sites and nothing else), and nothing sets revokedAt.
 *
 * What this GET did with a pending, unrevoked token as of P5 (97ba6d9b), for EVERY row alike:
 *   1. signed out                                   → ACCEPTED ("the token is the credential")
 *   2. signed in as any account other than the mentee — including a second account the minor made, of any age or none
 *                                                   → ACCEPTED
 *   3. signed in as the mentee                      → 403 self_accept_blocked (P5's narrow fix)
 *   4. already accepted                             → 200 { already: true }, no write, any caller
 *   5. unknown or revoked token                     → 404 not_found
 * Paths 1 and 2 are the residual P5 reported: the minor with their own link signs out, or signs in elsewhere.
 *
 * WHAT CHANGES, and only for a PLAYER-REQUESTED row (selfRequested, set by POST above from the session). A pending
 * player row is accepted by PATCH only (the accept page's button); this GET answers it 409 use_accept_page and writes
 * nothing (P6 review: a GET that writes rides a cross-site link — see the fix in GET). Through PATCH:
 *   1. signed out                                   → 401 guardian_sign_in_required
 *   2. another account: its User.dobYear must read as an ADULT by lib/mirror/youth.ts isMinorForMirror (blank reads
 *      as a minor, owner decision #20) → otherwise 403 guardian_not_adult / guardian_birth_year_required. An account
 *      with no birth year on file declares one through PATCH below (written only when blank, only when adult).
 *      On a yes, the accepting account's id is recorded (acceptedById).
 *   3. the mentee                                   → 403 self_accept_blocked, unchanged
 *   4, 5                                            → unchanged
 * The rule itself is lib/consent/guardianAccept.ts decidePlayerAccept, one pure function the accept page asks too.
 *
 * COACH-MANAGED CAMP CONSENTS (selfRequested false — a facilitator asked, and every row older than the column) keep
 * paths 1-5 exactly as they were: same reads, same single-key write, same answers. The facilitator holds that link,
 * not the minor — and, since the P6 review, that is true in the app as well as in intent: GET /api/health/guardian used
 * to hand ANY pending row's token to the mentee's own Mirror gate, a camp row's included, and now hands back only the
 * athlete's own (selfRequested) link. tests/camp/consent-guardian-residual.test.ts proves the camp path unchanged and
 * the camp token kept off the mentee's screen; P5's tests/camp/consent-accept.test.ts still passes untouched.
 *
 * NOT A BILLING GATE. lib/pro-guard.ts NEVER_GATED lists this route: a consent control must work on every account,
 * paid or lapsed. Signing in is an identity requirement on the accepter, not a subscription check — a free account
 * with an adult birth year confirms exactly as a paid one does.
 *
 * WHAT THIS DOES NOT STOP, said plainly because the fix is easy to over-read: a minor who makes a second account and
 * declares an adult birth year on it can still accept their own request. Every age in FEL is self-declared, and no
 * link flow can close that without verified identity, which FEL does not have. Nor does it touch the facilitator path
 * (a minor would need a second account certified as a facilitator to request for themselves as "someone else"). This
 * raises the bar from "open the link signed out" to "make a second account and lie about your age on it" — a real
 * step, not a lock. The owner's options: ~/Claude/outbox/finish-release/painfree/p6/GUARDIAN-RESIDUAL.md.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return bad('token_required');
  const consent = await prisma.guardianConsent.findUnique({ where: { token } });
  if (!consent || consent.revokedAt) return bad('not_found', 404);
  if (consent.acceptedAt) return NextResponse.json({ accepted: true, acceptedAt: consent.acceptedAt, already: true });

  // MIRROR-COACH P6 FIX (2026-09-29, code review — "GET on a player-requested token writes consent"): a player
  // request is accepted ONLY by PATCH, from the accept page's button. This GET used to run the same accept, and the
  // NextAuth session cookie is sameSite 'lax' (lib/auth.ts), so it rides a top-level cross-site GET: a minor could send
  // any signed-in adult FEL user (an older sibling, their coach) a link or a redirect to this URL, and one click
  // recorded that adult as the confirming guardian without their ever seeing the "X wants your OK" page — the
  // deliberate yes accept-button.tsx exists for ("the write happens only if a human taps this button"). A cross-site
  // page cannot send the PATCH's JSON body without a CORS preflight, so the PATCH is the one door. No write, and no
  // read of who is asking, before this answer. The camp GET below is P5's, untouched.
  if (consent.selfRequested) return bad('use_accept_page', 409);

  const callerId = await currentUserId();
  // ── coach-managed camp consent: unchanged from P5 ──
  if (callerId && callerId === consent.menteeId) return bad('self_accept_blocked', 403);

  const updated = await prisma.guardianConsent.update({ where: { token }, data: { acceptedAt: new Date() } });
  return NextResponse.json({ accepted: true, acceptedAt: updated.acceptedAt });
}

/**
 * PATCH /api/v1/camp/consent { token, birthYear? } — MIRROR-COACH P6 (2026-09-29): THE accept for a PLAYER-REQUESTED
 * consent (GET refuses one), from app/consent/guardian/[token]/accept-button.tsx. The rule is decidePlayerAccept; the
 * only thing beyond it is the one-time birth-year declaration for a signed-in account that has none on file — a
 * guardian who just made a free
 * account to say yes has no birth year yet, and the Mirror's health intake is the only other place FEL asks for one,
 * which is not a form to send a parent through. A body, not a query string: a birth year does not belong in a URL.
 *
 * A camp (facilitator-requested) row is refused here (409 not_player_request) rather than accepted a second way: the
 * camp flow accepts by GET, exactly as before, and gets no new door.
 */
export async function PATCH(req: NextRequest) {
  let body: { token?: unknown; birthYear?: unknown };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token) return bad('token_required');
  const consent = await prisma.guardianConsent.findUnique({ where: { token } });
  if (!consent || consent.revokedAt) return bad('not_found', 404);
  if (!consent.selfRequested) return bad('not_player_request', 409);
  if (consent.acceptedAt) return NextResponse.json({ accepted: true, acceptedAt: consent.acceptedAt, already: true });

  const callerId = await currentUserId();
  return acceptPlayerRequested(consent, callerId, body.birthYear);
}

/** The player-requested accept (PATCH only since the P6 review; GET answers use_accept_page). */
async function acceptPlayerRequested(consent: { token: string; menteeId: string }, callerId: string | null, declaredBirthYear: unknown) {
  const caller = callerId ? await prisma.user.findUnique({ where: { id: callerId }, select: { dobYear: true } }) : null;
  const decision = decidePlayerAccept({
    menteeId: consent.menteeId,
    // a session whose user row is gone is treated as no session — nobody is left to record as the accepter
    callerId: caller ? callerId : null,
    callerDobYear: caller?.dobYear ?? null,
    declaredBirthYear,
  });
  if (!decision.ok) return bad(decision.error, decision.status);

  const acceptedAt = new Date();
  const accept = prisma.guardianConsent.update({ where: { token: consent.token }, data: { acceptedAt, acceptedById: decision.acceptedById } });
  if (decision.declareDobYear === null) {
    const updated = await accept;
    return NextResponse.json({ accepted: true, acceptedAt: updated.acceptedAt });
  }
  // Only-when-blank, lib/health/intake.ts's rule: the WHERE carries dobYear null, so a birth year that landed on this
  // account in the meantime is never overwritten. One transaction: the yes and the declaration it rests on land together.
  const [, updated] = await prisma.$transaction([
    prisma.user.updateMany({ where: { id: decision.acceptedById, dobYear: null }, data: { dobYear: decision.declareDobYear } }),
    accept,
  ]);
  return NextResponse.json({ accepted: true, acceptedAt: updated.acceptedAt });
}
