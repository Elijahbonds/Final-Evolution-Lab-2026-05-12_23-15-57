export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PLATFORM_PROTOCOLS } from '@/lib/profile/protocol';
import { certificationStatusFor } from '@/lib/camp/certification';
import {
  shareProgram, shareDrill, shareRecommendation, shareSelection,
  shareUrl, type SharedBy,
} from '@/lib/share/shareable';
import { toPlainText } from '@/lib/share/plaintext';
import { createShare, listShares, ShareRefused } from '@/lib/share/service';
import { ShareLeak } from '@/lib/share/shareable';

/**
 * POST /api/share — a trainer sends programming to a client.
 *
 * Free, always: nothing here reads a plan or an entitlement. Selling to strangers is /api/stripe/checkout
 * with product COACH_PROGRAM; this is a trainer and their own client and it costs nothing.
 *
 * The response carries the copy-ready text as well as the URL, because the whole feature is "paste this into
 * iMessage" and making the client re-render it is how the two versions drift apart.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const { kind, forName, expiresAt } = body as { kind?: string; forName?: string; expiresAt?: string };

  // "Certified" on a shared link is a claim about a professional, so it comes from the same source as
  // everywhere else — passed credentials on the CURRENT curriculum, minus a revoke — never a looser proxy
  // like "has a coaching program" that would put the mark next to somebody who never sat the modules.
  const [user, creds, fac] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } }),
    prisma.credential.findMany({ where: { userId: session.user.id } }),
    prisma.facilitatorProfile.findUnique({ where: { userId: session.user.id }, select: { revokedAt: true } }),
  ]);

  const by: SharedBy = {
    coachId: session.user.id,
    displayName: (user?.name ?? 'Coach').slice(0, 60),
    // a boolean, never the credential list — see lib/share/shareable.ts
    credentialed: certificationStatusFor(creds, fac?.revokedAt ?? null).status === 'certified',
  };

  const built = build(kind, body, by, forName);
  if (!built) return NextResponse.json({ error: 'Unknown share kind' }, { status: 400 });
  if (built.share === null) {
    // 422: the request was well-formed, the CONTENT was refused. The flags carry the phrase to underline.
    return NextResponse.json({ error: 'Cannot be shared', problems: built.problems }, { status: 422 });
  }

  try {
    const created = await createShare(prisma, session.user.id, built.share, {
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
    const url = shareUrl(origin, created.token);
    return NextResponse.json({
      token: created.token,
      url,
      // what the trainer's "Copy for text" button puts on the clipboard
      text: toPlainText(built.share, url),
      kind: created.kind,
      createdAt: created.createdAt,
    });
  } catch (e) {
    if (e instanceof ShareRefused) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof ShareLeak) {
      // never surface the detail: it names the field that leaked
      console.error('share leak guard tripped', e.message);
      return NextResponse.json({ error: 'Cannot be shared' }, { status: 422 });
    }
    console.error('share create failed', e);
    return NextResponse.json({ error: 'Could not create the link' }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function build(kind: string | undefined, body: any, by: SharedBy, forName?: string) {
  switch (kind) {
    case 'program':
      return shareProgram(body.program, PLATFORM_PROTOCOLS, by, { forName });
    case 'drill':
      return shareDrill(body.protocolKey, PLATFORM_PROTOCOLS, by, {
        forName, note: body.note, prescription: body.prescription,
      });
    case 'recommendation':
      return shareRecommendation(body.body ?? '', by, { forName, title: body.title });
    case 'selection':
      return shareSelection(body.protocolKeys ?? [], PLATFORM_PROTOCOLS, by, {
        forName, title: body.title, note: body.note,
      });
    default:
      return null;
  }
}

/** GET /api/share — the trainer's own list of links. An index; it does not return content. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ shares: await listShares(prisma, session.user.id) });
}
