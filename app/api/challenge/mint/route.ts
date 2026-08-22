/**
 * app/api/challenge/mint/route.ts
 * ===============================
 * M13 Step 4 — mint a signed challenge link from a finished run. Works for
 * authed athletes and guests (owner is null for guests). The server stamps the
 * time + signature; the client only supplies mode/score/tag/keyMoments.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { mintChallenge } from '@/lib/social/challenge-service';

export const dynamic = 'force-dynamic';

const momentSchema = z.object({ t: z.number() }).passthrough();
const bodySchema = z.object({
  modeKey: z.string().min(1).max(40),
  score: z.number().finite(),
  display: z.string().max(120).optional(),
  athleteTag: z.string().max(16).optional(),
  keyMoments: z.array(momentSchema).max(40).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const session = await getServerSession(authOptions);
  const ownerUserId = (session?.user as any)?.id ?? null;

  const minted = await mintChallenge({
    ownerUserId,
    modeKey: parsed.data.modeKey,
    score: Math.round(parsed.data.score),
    display: parsed.data.display,
    athleteTag: parsed.data.athleteTag,
    keyMoments: (parsed.data.keyMoments ?? []) as any,
  });

  return NextResponse.json(minted);
}
