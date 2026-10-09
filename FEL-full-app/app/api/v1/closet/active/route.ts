export const dynamic = 'force-dynamic';

// POST /api/v1/closet/active — "Play as": make one saved character the one every mode spawns (IMPROVE (2026-10-06),
// CREATOR-PLAN phase 4a). Body: { slotId }.
//
// It only MOVES THE POINTER and re-materialises the face's top level from that slot (lib/creator/look/slots.switchActive):
// no look data is posted, so there is nothing new to sanitise and no numbers can arrive. The slot's worn items become the
// account's, filtered through the server's own inventory again (a slot saved last week cannot wear an item since lost).
// A player who is not a verified adult has no slots on the server (LOOK PRIVACY): the answer says `lookLocal` and the
// client switches the device copy instead. Nothing here touches a body, a frame or a hitbox; the next spawn reads it.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { defaultEquipped } from '@/lib/closet/wearable-catalog';
import { filterEquipped } from '@/lib/closet/ownership';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { switchActive } from '@/lib/creator/look/slots';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { slotId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const slotId = typeof body?.slotId === 'string' && /^[a-z0-9]{1,8}$/.test(body.slotId) ? body.slotId : null;
  if (!slotId) return NextResponse.json({ error: 'invalid_slot' }, { status: 400 });

  const adult = verifiedAdult(await readDobYear(prisma, userId, 'look_hold'));
  if (!adult) return NextResponse.json({ switched: false, lookLocal: true });

  const row = await prisma.avatarLook.findUnique({ where: { userId } });
  // the row holds numbers only if they were saved with the opt-in, so carrying the slot's sliders up adds none
  const next = row ? switchActive(row.face, slotId, true) : null;
  if (!row || !next) return NextResponse.json({ error: 'no_such_slot' }, { status: 404 });

  let equipped = row.equipped as Record<string, string | null> | null;
  if (next.equipped) {
    const owned = new Set((await prisma.ownedWearable.findMany({ where: { userId } })).map((o) => o.itemId));
    equipped = { ...defaultEquipped(), ...(equipped ?? {}), ...filterEquipped(next.equipped, owned) };
  }
  await prisma.avatarLook.update({ where: { userId }, data: { face: next.face as object, ...(equipped ? { equipped: equipped as object } : {}) } });
  return NextResponse.json({ switched: true, activeSlot: slotId, lookLocal: false });
}
