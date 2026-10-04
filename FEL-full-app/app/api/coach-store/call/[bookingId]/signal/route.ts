export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { postSignal, readSignals } from '@/lib/coach-store/api';
import { assertCoachStoreOn } from '@/lib/coach-store/gate';

async function userId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: { bookingId: string } }) {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  const id = await userId();
  if (!id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const after = Number(req.nextUrl.searchParams.get('after') ?? '0');
  return readSignals(id, params.bookingId, Number.isFinite(after) ? after : 0);
}

export async function POST(req: NextRequest, { params }: { params: { bookingId: string } }) {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  const id = await userId();
  if (!id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  return postSignal(id, params.bookingId, body);
}
