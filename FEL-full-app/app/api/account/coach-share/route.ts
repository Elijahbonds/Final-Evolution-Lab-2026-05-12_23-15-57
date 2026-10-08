export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withdrawCoachShare } from '@/lib/privacy/coachShare';

async function signedInUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** POST { bookingId, withdraw: true } — stop sharing that booking. The opt-in does not have to be on. */
export async function POST(req: NextRequest) {
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const b = body as { bookingId?: unknown; withdraw?: unknown };
  if (b.withdraw !== true || typeof b.bookingId !== 'string') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const ok = await withdrawCoachShare(prisma, userId, b.bookingId);
  if (!ok) return NextResponse.json({ error: 'not_shared', withdrawn: false }, { status: 404 });
  return NextResponse.json({ withdrawn: true, bookingId: b.bookingId });
}
