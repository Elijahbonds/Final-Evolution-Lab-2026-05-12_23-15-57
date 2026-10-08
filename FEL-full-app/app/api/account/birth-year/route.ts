import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AGE_BLOCK_COOKIE, AGE_INVALID, ageBlockCookieHeader, ageScreenOutcome } from '@/lib/privacy/ageScreen';
import { logU13Lock } from '@/lib/privacy/u13LockLog';

export const dynamic = 'force-dynamic';

function userIdOf(session: { user?: { id?: string } } | null): string | null {
  const id = session?.user?.id;
  return typeof id === 'string' && id ? id : null;
}

/** { needed, blocked }. needed = dobYear is null. blocked = the stored year is an under-13 lock. Never the year. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const id = userIdOf(session);
  if (!id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id }, select: { dobYear: true } });
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const blocked = user.dobYear != null && ageScreenOutcome(user.dobYear) === 'blocked';
  return NextResponse.json({ needed: user.dobYear == null, blocked });
}

/**
 * Write a blank dobYear once. A year already on file is 409 and is not updated. An under-13 answer is that same
 * conditional write and nothing else: one log line only when the write took, then 403 and the block cookie.
 * Nothing is deleted. assumption: (FE PM can reverse) a cookie-present retry logs nothing and writes nothing.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const id = userIdOf(session);
  if (!id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (cookies().get(AGE_BLOCK_COOKIE)) {
    return NextResponse.json({ error: 'age_screen_blocked' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const year = (body as { birthYear?: unknown })?.birthYear;

  const user = await prisma.user.findUnique({ where: { id }, select: { dobYear: true } });
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (user.dobYear != null) {
    return NextResponse.json({ error: 'birth_year_locked' }, { status: 409 });
  }

  const outcome = ageScreenOutcome(year);
  if (outcome === 'invalid') {
    return NextResponse.json({ error: AGE_INVALID }, { status: 400 });
  }

  const updated = await prisma.user.updateMany({
    where: { id, dobYear: null },
    data: { dobYear: year as number },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ error: 'birth_year_locked' }, { status: 409 });
  }

  if (outcome === 'blocked') {
    logU13Lock('/api/account/birth-year');
    return NextResponse.json(
      { error: 'age_screen_blocked' },
      { status: 403, headers: { 'Set-Cookie': ageBlockCookieHeader() } },
    );
  }

  return NextResponse.json({ ok: true });
}
