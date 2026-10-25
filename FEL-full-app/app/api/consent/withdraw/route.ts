export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readWithdrawToken, withdrawConsent, type WithdrawDb } from '@/lib/consent/withdraw';

/**
 * POST /api/consent/withdraw { token } — SAFETY lane (SAF-01, 2026-10-25): a guardian withdraws their OK.
 *
 * The token is the credential (lib/consent/withdraw.ts: signed, names nobody, single use). No sign-in: a guardian may
 * have no FEL account, and a withdraw only ever closes things. A POST with a JSON body, never a GET, so a link preview
 * or a cross-site page cannot withdraw for someone (the accept route's P6 reasoning, the other way round).
 *
 * Answers: 200 { withdrawn: true } once, then 200 { withdrawn: true, already: true } for every later use (single use:
 * nothing written twice); 404 not_found for a token that is unsigned, edited, or names no consent — the same answer, so
 * the route says nothing about which consents exist. Never a name, an email or a date.
 */
export async function POST(req: Request) {
  let body: { token?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const consentId = readWithdrawToken(body?.token);
  if (!consentId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const out = await withdrawConsent(prisma as unknown as WithdrawDb, consentId);
  if (out.state === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(out.state === 'already' ? { withdrawn: true, already: true } : { withdrawn: true });
}
