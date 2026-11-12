import { NextResponse } from 'next/server';
import { readWallet } from '@/lib/wallet/wallet-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { recordErasureEvent } from '@/lib/data-rights/rights';
import { erasePrqData, erasureReason, movementRowsErased } from '@/lib/prq-data-rights';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // REVIEW (2026-09-24, D5): the PRQ entries AND the movement history (every WorkoutScan row, whatever its kind), in
  // one transaction. A bought workout plan survives: WorkoutPlan.scanId is SetNull (lib/prq-data-rights.ts).
  const erased = await prisma.$transaction((tx) => erasePrqData(tx, userId));

  // DATA-RIGHTS-SWEEP: the movement count includes the readiness jump checks and filmed-set form reviews (pending tables)
  if (erased.prqEntries > 0 || movementRowsErased(erased) > 0) {
    // Ledger the deletion as an event (wallet untouched). DATA-RIGHTS-SWEEP: a CreditLedger event row, not postLc —
    // postLc's double-entry mirror refuses a zero posting, so this answered 500 after every real erase
    // (lib/data-rights/rights.ts recordErasureEvent has the measurement).
    const walletView = await readWallet(prisma, userId);   // pass 5 phase 1
    await recordErasureEvent(prisma, {
      userId,
      reason: erasureReason(erased),
      balanceAfter: walletView.lc,
      dedupeKey: `prq-erase:${userId}:${Date.now()}`,
    });
  }

  // `deleted` stays the PRQ entry count it always was; `history` is the movement-history rows
  return NextResponse.json({ ok: true, deleted: erased.prqEntries, history: movementRowsErased(erased) });
}
