export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readShare, revokeShare } from '@/lib/share/service';
import { shareUrl } from '@/lib/share/shareable';
import { toPlainText, toSummaryLine } from '@/lib/share/plaintext';

/**
 * GET /api/share/[token] — the public read. NO AUTH, by design.
 *
 * The owner's decision: anyone with the link sees the whole thing; signing in is only needed to track it.
 * That is what makes it textable to somebody who is not a user yet.
 *
 * A missing, revoked and expired link are all the same 404 — a capability URL that says "this used to be
 * something" tells a stranger to try again later and tells a scanner which tokens are real.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const share = await readShare(prisma, params.token);
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ share, summary: toSummaryLine(share) });
}

/** DELETE /api/share/[token] — revoke. Clears the content; the trainer keeps the receipt. */
export async function DELETE(_req: NextRequest, { params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ok = await revokeShare(prisma, session.user.id, params.token);
  // a link that is not yours is indistinguishable from one that does not exist
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ revoked: true });
}

/** POST /api/share/[token]/  — re-render the copy-for-text without re-creating the link. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const share = await readShare(prisma, params.token);
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
  return NextResponse.json({ text: toPlainText(share, shareUrl(origin, params.token)) });
}
