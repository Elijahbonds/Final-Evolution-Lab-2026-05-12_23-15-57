export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rosterIdsWhere } from '@/lib/coach/rosterLookup';
import { loadGuardianReport, reportConsent } from '@/lib/coach/guardianReportServer';
import { guardianReportEmail } from '@/lib/coach/guardianReport';
import { guardianReportPath, guardianReportToken } from '@/lib/coach/guardianLink';
import { mailLinkOrigin, mailReady, sendMail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';

/**
 * The guardian's progress report for a teen on my roster (coach-loop P1, 2026-10-20).
 *
 * GET  — which of my live-roster athletes a report can go to: a teen (13–17) whose current guardian consent is
 *        accepted (lib/coach/guardianReportServer.ts reportConsent). Ids only, and whether email is on.
 * POST — { clientId }: build the report from training rows only and email the guardian a signed link to it
 *        (lib/coach/guardianLink.ts; no account, dies with the consent). Behind EMAIL_ENABLED.
 *
 * NEVER IN AN ANSWER: the guardian's name or address, the link (it is the guardian's, not the coach's), a birth year.
 * An athlete off my roster, an adult, an under-13 and a teen without an accepted consent all answer the same
 * 'not_eligible' — the coach learns nothing about a consent they could not already see.
 */
export async function GET() {
  const coachId = await currentUserId();
  if (!coachId) return bad('unauthorized', 401);
  const roster = await prisma.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true } });
  const eligible: string[] = [];
  for (const r of roster) if (await reportConsent(prisma, r.clientId)) eligible.push(r.clientId);
  return NextResponse.json({ eligible, email: mailReady() && !!mailLinkOrigin() });
}

export async function POST(req: NextRequest) {
  const coachId = await currentUserId();
  if (!coachId) return bad('unauthorized', 401);
  let body: { clientId?: unknown };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid_json');
  const clientId = typeof body.clientId === 'string' ? body.clientId : '';
  if (!clientId) return bad('clientId_required');

  const onRoster = await prisma.coachClient.findFirst({ where: rosterIdsWhere(coachId, [clientId]), select: { clientId: true } });
  const consent = onRoster ? await reportConsent(prisma, clientId) : null;
  if (!consent) return NextResponse.json({ status: 'not_eligible' }, { status: 404 });

  const origin = mailLinkOrigin();
  const token = guardianReportToken(consent.consentId, Date.now());
  if (!mailReady() || !origin || !token) return NextResponse.json({ status: 'email_off' });
  if (!rateLimit(`guardian-report:${coachId}:${clientId}`, 2, 24 * 60 * 60 * 1000).ok) return NextResponse.json({ status: 'rate_limited' }, { status: 429 });

  const report = await loadGuardianReport(prisma, clientId);
  const r = await sendMail({ to: consent.guardianEmail, ...guardianReportEmail(report, `${origin}${guardianReportPath(token)}`) });
  return NextResponse.json({ status: r.status === 'sent' ? 'sent' : r.status === 'disabled' ? 'email_off' : 'failed' });
}
