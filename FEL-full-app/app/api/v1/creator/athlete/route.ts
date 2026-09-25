export const dynamic = 'force-dynamic';

// SAVING AN ATHLETE (2026-09-14). Spec §10 step 7 — Finalize gates the save.
//
// THE ROUTE IS THIN BECAUSE THE DECISIONS ARE TESTABLE ELSEWHERE. Everything that can be wrong here — how
// a build splits across two rows, how it comes back, whether it is legal, which garments the account may
// wear — lives in `lib/creator/schema/saveBuild.ts` and `lib/closet/ownership.ts`, both pure and both
// covered. A route cannot be unit-tested without a database, so as little as possible happens in one.
//
// THREE THINGS THE SERVER DECIDES, AND THE CLIENT DOES NOT:
//
//   1. IS THE BUILD LEGAL. The editor resolves too, and that is not a duplicate — the client's copy is
//      what lets a player fix a problem in place; this one is what stops a hand-rolled POST writing a
//      99-everything athlete. It runs on the VALUES, not on a `valid: true` the client sent.
//   2. WHAT THE ACCOUNT MAY WEAR. `OwnedWearable` plus the free starters, exactly as the Closet decides
//      it, through the same module. An unowned item is dropped and NAMED in the response rather than
//      silently swapped — a save that quietly undresses you is worse than one that says no.
//   3. WHICH ROW EACH HALF GOES IN. The look goes to `AvatarLook`, which the Closet already owns and
//      every mode already spawns from; only what has no home lands in `AthleteBuild`.
//
// PRQ COMES FROM THE SERVER'S OWN COPY. Ceilings are resolved against the athlete's measured axes, and
// accepting those from the request body would make every ceiling advisory.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma } from '@/public/_prisma/client';
import { toLook, toBuild, fromStorage, validateForSave, type Values, type BuildPayload, type LookPayload } from '@/lib/creator/schema/saveBuild';
import { filterEquipped, refusedItems } from '@/lib/closet/ownership';
import { defaultFace, defaultEquipped, getWearable } from '@/lib/closet/wearable-catalog';
import { isMissingTable, isUnreachable } from '@/lib/db/errors';
// HOTFIX (2026-09-24): the page reads the same axes for the editor's ceilings, so the one function lives in lib (a
// route file may only export its handlers) — and it reads measured axes, not the dice-seeded profile row.
import { axesFor } from '@/lib/creator/athleteAxes-server';

/**
 * `AthleteBuild` is new and the migration is the owner's to run, so the one error a fresh checkout will
 * actually hit is answered with the command that fixes it — by CODE, never by scanning the message. See
 * lib/db/errors.ts: a message scan reported "run the migration" for a stale password, because Prisma
 * pastes the calling source into the message and the source contained the detector's own pattern.
 *
 * The --schema flag is not optional: package.json points the Prisma CLI at public/_prisma/schema.prisma,
 * which is the copy the BUILD writes. Pushing without it pushes a stale file.
 */
const NEEDS_PUSH = {
  error: 'schema_not_pushed',
  detail: 'The AthleteBuild table is not in the database yet. Run: npx prisma db push --schema=prisma/schema.prisma',
};
const NO_DATABASE = {
  error: 'database_unreachable',
  detail: 'The database refused the connection or the credentials. Nothing was saved.',
};

/** The two failures worth naming; anything else is a real bug and should surface as one. */
function dbFailure(e: unknown): NextResponse | null {
  if (isMissingTable(e)) return NextResponse.json(NEEDS_PUSH, { status: 503 });
  if (isUnreachable(e)) return NextResponse.json(NO_DATABASE, { status: 503 });
  return null;
}

/** GET /api/v1/creator/athlete — the saved build, merged with the look, in the editor's value shape. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const [row, look] = await Promise.all([
      prisma.athleteBuild.findUnique({ where: { userId } }),
      prisma.avatarLook.findUnique({ where: { userId } }),
    ]);
    // A player who has never opened the creator still has a look, and it is the one the Closet gave them.
    const lookPayload: Partial<LookPayload> = {
      // Json columns come back as JsonValue; these three were written by this route or by the Closet, and
      // `fromStorage` ignores anything it does not recognise, so a shape that has drifted loads as empty
      // rather than throwing a player's creator screen away.
      face: (look?.face as unknown as LookPayload['face']) ?? defaultFace(),
      equipped: (look?.equipped as unknown as LookPayload['equipped']) ?? defaultEquipped(),
      jersey: (look?.jersey as unknown as LookPayload['jersey']) ?? { number: 0, name: '' },
    };
    return NextResponse.json({
      values: fromStorage((row?.build as unknown as BuildPayload | null) ?? null, lookPayload),
      plate: lookPayload.jersey?.name ?? '',
      // HOTFIX (2026-09-24): the measured axes NOW, never the stored snapshot. Finalizes before this hotfix stored the
      // dice-seeded profile axes in AthleteBuild.prq, and `row.prq ?? axesFor` kept serving them as the athlete's PRQ.
      prq: await axesFor(userId),
      finalizedAt: row?.finalizedAt ?? null,
      owned: (await prisma.ownedWearable.findMany({ where: { userId } })).map((o) => o.itemId),
    });
  } catch (e) {
    const named = dbFailure(e);
    if (named) return named;
    throw e;
  }
}

/** POST /api/v1/creator/athlete — Finalize. Refuses an illegal build; drops unowned garments and says so. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { values?: Values; plate?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const values: Values = body?.values ?? {};
  const plate = typeof body?.plate === 'string' ? body.plate : '';

  const prq = await axesFor(userId);
  const verdict = validateForSave(values, prq);
  if (!verdict.ok) {
    // 422, not 400: the request was understood perfectly and the BUILD is what is wrong. The issues go
    // back row by row so the editor can put each one beside the control that caused it.
    return NextResponse.json({ error: 'invalid_build', issues: verdict.issues }, { status: 422 });
  }

  const look = toLook(values, plate);
  const owned = new Set((await prisma.ownedWearable.findMany({ where: { userId } })).map((o) => o.itemId));
  const refused = refusedItems(look.equipped, owned);
  const equipped = filterEquipped(look.equipped, owned);

  try {
    const [, row] = await prisma.$transaction([
      prisma.avatarLook.upsert({
        where: { userId },
        update: { face: look.face as object, equipped: equipped as object, jersey: look.jersey as object },
        create: { userId, face: look.face as object, equipped: equipped as object, jersey: look.jersey as object },
      }),
      prisma.athleteBuild.upsert({
        where: { userId },
        // HOTFIX (2026-09-24): no measurement CLEARS the column (Prisma.DbNull), where `undefined` left it alone — so a
        // dice-seeded snapshot an earlier Finalize stored is wiped on the next one instead of living on as "measured".
        update: { build: toBuild(values) as object, prq: prq ? (prq as object) : Prisma.DbNull, finalizedAt: new Date() },
        create: { userId, build: toBuild(values) as object, prq: prq ? (prq as object) : Prisma.DbNull, finalizedAt: new Date() },
      }),
    ]);
    return NextResponse.json({
      saved: true,
      finalizedAt: row.finalizedAt,
      // Named, not silent — see the header.
      refused: refused.map((id) => ({ itemId: id, name: getWearable(id)?.name ?? id })),
    });
  } catch (e) {
    const named = dbFailure(e);
    if (named) return named;
    throw e;
  }
}
