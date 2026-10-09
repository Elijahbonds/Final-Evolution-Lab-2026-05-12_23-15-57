export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decideGrandfather, grandfatherSku, parseGrandfatherClaim } from '@/lib/babylon/music/kitGrandfather';
import { kitForSku } from '@/lib/babylon/music/purchases';
import type { KitId } from '@/lib/babylon/music/SynthKit';
import { grantGrandfatherKit, ownedMusicKits } from '@/lib/wallet/kit-grandfather';

/**
 * POST /api/music/grandfather — MUSIC-SUITE P6 (2026-09-25), owner decision #23: "Kits unlocked free before 2026-09-20
 * (bug): LET PLAYERS KEEP THEM — a one-time server grant with its own ledger reason".
 *
 * The Music Room sends what its device still holds of a kit it unlocked while kits were free (the old kit list, a song
 * published on the kit before the cutoff: lib/babylon/music/kitGrandfather.ts grandfatherClaim), just before it reads
 * the account's kits. The server decides by its own rules (decideGrandfather): the ACCOUNT predates the cutoff
 * (User.createdAt), the kit was NEON or DUST, a dated record is dated before the cutoff, and the account does not own
 * the kit already (ownedMusicKits, the read GET /api/music/unlock answers with). Each kit that passes is granted once
 * (lib/wallet/kit-grandfather.ts grantGrandfatherKit: a zero-delta KIT_GRANDFATHER_2026_09 row + the entitlement).
 *
 * Answers: 401 signed out; 400 no record list; 404 no account behind the session; 503 any database failure (nothing
 * written that did not commit whole — the room tries again next visit); 200 { eligible, granted, owned, refused }.
 * The device record is forgeable: see kitGrandfather.ts "FORGEABLE" for why the bound (pre-cutoff accounts, two kits,
 * once each) is the bug's own exposure and no wider.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { id?: string } | undefined)?.id;
  if (!playerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const records = parseGrandfatherClaim(body);
  if (!records) return NextResponse.json({ error: 'invalid_claim' }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { id: playerId }, select: { createdAt: true } });
    if (!user) return NextResponse.json({ error: 'no_account' }, { status: 404 });
    const { owned } = await ownedMusicKits(prisma, playerId);
    const ownedKits = owned.map(kitForSku).filter((k): k is KitId => k !== null);
    const decision = decideGrandfather(records, user.createdAt, ownedKits);
    const granted: string[] = [];
    const already = decision.owned.map(grandfatherSku);
    for (const g of decision.grant) {
      // false = a request racing this one granted it first: owned all the same, and still granted once
      if (await grantGrandfatherKit(prisma, playerId, g.kit, g.record)) granted.push(grandfatherSku(g.kit));
      else already.push(grandfatherSku(g.kit));
    }
    return NextResponse.json({ eligible: decision.eligible, granted, owned: already.sort(), refused: decision.refused });
  } catch (e) {
    console.error('[music/grandfather] claim failed', e);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
