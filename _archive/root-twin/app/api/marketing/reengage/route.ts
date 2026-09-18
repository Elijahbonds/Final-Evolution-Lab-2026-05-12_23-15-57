import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendReengageEmail } from '@/lib/marketing/email';
import { recordServerEvent } from '@/lib/analytics-server';

export const dynamic = 'force-dynamic';

// Small teaser reward advertised in the come-back email. The actual grant
// happens when they return and play — this is a marketing nudge only.
const TEASER_COINS = 250; // TUNE(elijah)
const TEASER_SHARDS = 3;  // TUNE(elijah)
const DORMANT_AFTER_DAYS = 7; // TUNE(elijah)

/**
 * POST /api/marketing/reengage — admin-triggered re-engagement sweep. Finds
 * leads who signed up for updates but went quiet (not converted, not already
 * re-engaged, older than DORMANT_AFTER_DAYS) and sends a single come-back
 * email each, marking reengagedAt so nobody is emailed twice. Admin only.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const cutoff = new Date(Date.now() - DORMANT_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await prisma.marketingLead.findMany({
    where: {
      reengagedAt: null,
      stage: { in: ['lead', 'welcomed'] },
      createdAt: { lt: cutoff },
    },
    take: 200,
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true },
  });

  let sent = 0;
  for (const lead of candidates) {
    const ok = await sendReengageEmail(lead.email, lead.name, TEASER_COINS, TEASER_SHARDS);
    if (ok) {
      sent++;
      await prisma.marketingLead.update({
        where: { id: lead.id },
        data: { reengagedAt: new Date(), stage: 'dormant' },
      }).catch(() => {});
    }
  }
  await recordServerEvent({ name: 'reengage_sweep', props: { candidates: candidates.length, sent } });
  return NextResponse.json({ ok: true, candidates: candidates.length, sent });
}
