import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { accountForget, accountRead, accountSave } from '@/lib/program-ask/accountServer';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET / PUT / DELETE /api/program-ask/saved — PROGRAM-ASK-2 (2026-11-03): an adult's "Build my program" plan on the account
 * (the ask, the chips' edits, the sessions done, the checkpoint answers; never the program, which the ask rebuilds).
 * Under youth rules nothing is written (403 youth_device_only on PUT): the plan stays on the phone. Until
 * prisma/pending/2026-11-03-program-ask.sql is applied, GET answers keep 'device' and PUT / DELETE answer 503
 * program_ask_not_ready; the page keeps saving on the phone either way.
 */
async function who() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  return id ? { id, role: (session!.user as { role?: string }).role } : null;
}

export async function GET() {
  try {
    const user = await who();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await accountRead(user);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('program-ask saved GET error', e);
    return NextResponse.json({ keep: 'device', ready: false, error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await who();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!rateLimit(`program-ask-save:${user.id}`, 30, 60_000).ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    const r = await accountSave(user, body);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('program-ask saved PUT error', e);
    return NextResponse.json({ keep: 'device', ready: false, error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await who();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const r = await accountForget(user);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('program-ask saved DELETE error', e);
    return NextResponse.json({ keep: 'device', ready: false, error: 'Failed' }, { status: 500 });
  }
}
