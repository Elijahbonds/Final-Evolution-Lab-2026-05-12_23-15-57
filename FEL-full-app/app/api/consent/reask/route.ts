export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { ageScreenOutcome } from '@/lib/privacy/ageScreen';
import { reaskState, stampWordingVersion, type ReaskScope } from '@/lib/consent/wording';
import type { RawDb } from '@/lib/coach/pendingSchema';

const SCOPES: readonly ReaskScope[] = ['coach_training', 'squads'];

/**
 * POST /api/consent/reask { scope } — SAFETY lane (SAF-02, 2026-10-25): a teen whose guardian said yes under OLDER words
 * asks the same guardian again, under the words that cover `scope` (coach training or squads).
 *
 * Owner decision 2026-10-23 ("ask guardians again"): a consent given under the camp-plan wording does not unlock a roster
 * or squads. This is the way to ask again. The new request copies the guardian name, email and birth year already on
 * file — the teen types nothing — and is a PLAYER request (selfRequested), so the accept rules of P6 apply unchanged: an
 * adult's own signed-in account confirms it (app/api/v1/camp/consent PATCH). FEL sends the link nowhere (owner decision
 * #21); the teen shares it, as with the first ask.
 *
 * Refusals: 401 signed out; 403 not_teen (adults need no guardian; under 13 never); 409 not_live (the scope's wording is
 * not live — COACH_TRAINING_CONSENT_SINCE / SQUADS_CONSENT_SINCE are null today, so this route answers 409 to everyone
 * until the owner sets them), covered, pending, no_guardian. Answers the new token only: never the guardian's details.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: { scope?: unknown };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const scope = SCOPES.find((s) => s === body?.scope);
  if (!scope) return bad('scope_invalid');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } });
  const year = user?.dobYear ?? null;
  if (year == null) return bad('age_required', 403);
  if (ageScreenOutcome(year) !== 'teen') return bad('not_teen', 403);

  const consents = await prisma.guardianConsent.findMany({
    where: { menteeId: userId },
    select: { id: true, requestedAt: true, acceptedAt: true, revokedAt: true, guardianName: true, guardianEmail: true, menteeBirthYear: true },
  });
  const s = reaskState(scope, consents);
  if (s.state !== 'reask') return bad(s.state, 409);
  const from = consents.find((c) => c.id === s.from.id)!;

  const token = randomBytes(24).toString('base64url');
  const created = await prisma.guardianConsent.create({
    data: { menteeId: userId, guardianName: from.guardianName, guardianEmail: from.guardianEmail, menteeBirthYear: from.menteeBirthYear, token, selfRequested: true },
  });
  await stampWordingVersion(prisma as unknown as RawDb, created.id);
  return NextResponse.json({ token, href: `/consent/guardian/${encodeURIComponent(token)}` });
}
